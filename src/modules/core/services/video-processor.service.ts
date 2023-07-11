import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import to from 'await-to-js';
import { readdir } from 'fs/promises';
import { isUndefined, sortBy } from 'lodash';
import { dirname, extname, join } from 'path';
import { Subject } from 'rxjs';

import { sleep } from '../../../utils/sleep';
import { FileActionsEnum, TaskStatusEnum } from '../../config/actions';
import { RMQ_CONSUMER_EXCHANGE } from '../../config/constants';
import { PrismaService } from '../../prisma/prisma.service';
import { VideoProcessorException } from '../exceptions/video-processor.exception';
import { VideoProcessorExceptionHandler } from '../exceptions/video-processor.exception-handler';
import { FileTypeEnum, ImageExtensionEnum, Size, VideoExtensionEnum } from '../types';
import { MsgFileUpload, MsgTaskCompleted } from '../types/queue-payloads';
import { FilenameService } from './filename.service';
import { ImageConverterService } from './image-converter.service';
import { ImageSaverService } from './image-saver.service';
import { MinioService } from './minio.service';
import { SizeDetectorService } from './size-detector.service';
import { TempFilesCollectorService } from './temp-files-collector.service';
import { TempTagRemoverService } from './temp-tag-remover.service';
import { ThumbnailMakerService } from './thumbnail-maker.service';
import { VideoConverterService } from './video-converter.service';

/**
 * @property ext - Will be ignored if convert=false
 * @property dir - Temporary folder
 */
export type VideoConversionPayload = {
  originalname: string;
  ext: VideoExtensionEnum;
  dir: string;
  filename: string;
  convert?: boolean;
  task_id: number;
  sizes?: Size[];
  bucket?: string;
  uid: string;
};

@Injectable()
export class VideoProcessorService implements OnModuleInit {
  public readonly videoConversion$ = new Subject<VideoConversionPayload>();
  private readonly logger = new Logger(VideoProcessorService.name);

  constructor(
    private readonly sizeDetector: SizeDetectorService,
    private readonly prisma: PrismaService,
    private readonly filenameService: FilenameService,
    private readonly minioService: MinioService,
    private readonly videoConverter: VideoConverterService,
    private readonly thumbnailMaker: ThumbnailMakerService,
    private readonly tempFilesCollector: TempFilesCollectorService,
    private readonly videoProcessorExceptionHandler: VideoProcessorExceptionHandler,
    private readonly tempTagRemover: TempTagRemoverService,
    private readonly imageConverter: ImageConverterService,
    private readonly imageSaver: ImageSaverService,
    private readonly amqpConnection: AmqpConnection,
  ) {}

  onModuleInit(): void {
    this.videoConversion$.subscribe(async (event: VideoConversionPayload) => {
      this.logger.debug(`Got video conversion event: ${JSON.stringify(event, null, 2)}`);

      const [err] = await to(this.process(event));

      if (err) {
        this.logger.error(`Error while upload video file [${event.originalname}].`);
      } else {
        this.logger.log(`Successfully upload video file [${event.originalname}].`);
      }
    });
  }

  async process(input: VideoConversionPayload): Promise<void> {
    this.logger.log(`Start process video [${input.originalname}].`);
    this.logger.debug(`Process video parameters:\n${JSON.stringify(input, null, 2)}.`);

    const orgnFileTmpPath = join(input.dir, input.filename);

    try {
      const orgnVideoSize = await this.sizeDetector.getVideoSize(orgnFileTmpPath);

      const sortedSizes = input.sizes && input.sizes.length ? sortBy(input.sizes, ['width']) : [orgnVideoSize];

      this.logger.debug(`Try convert [${input.originalname}] to sizes: ${JSON.stringify(sortedSizes, null, 2)}.`);

      const biggestSizeIdx = sortedSizes.length - 1;

      let task = await this.prisma.task.findUniqueOrThrow({ where: { id: input.task_id } });

      if (input.convert === false) {
        this.logger.log(`Upload video file [${input.originalname}] without conversion.`);
        const orgnExt = extname(input.originalname).replace('.', '');
        const orgnVideoSize = await this.sizeDetector.getVideoSize(orgnFileTmpPath);
        const mainFileName = this.filenameService.generateFilename(input.originalname, {
          ext: orgnExt,
          type: FileTypeEnum.MainFile,
          ...orgnVideoSize,
        });
        const mainFileObj = await this.minioService.saveFile(orgnFileTmpPath, {
          filename: mainFileName,
          temporary: true,
          bucket: input.bucket,
        });

        await this.prisma.s3Object.create({
          data: {
            objectname: mainFileObj.objectname,
            main: true,
            bucket: mainFileObj.bucket,
            task_id: input.task_id,
            size: String(mainFileObj.size),
          },
        });

        await this.amqpConnection.publish<MsgFileUpload>(RMQ_CONSUMER_EXCHANGE, 'uploaded_video', {
          action: task.action as FileActionsEnum,
          status: task.status as TaskStatusEnum,
          bucket: mainFileObj.bucket,
          objectname: mainFileObj.objectname,
          size: mainFileObj.size,
          created_at: task.created_at,
          originalname: input.originalname,
          task_id: task.id,
          type: FileTypeEnum.MainFile,
          uid: input.uid,
          ...orgnVideoSize,
        });

        this.logger.log(`Send message [uploaded_video] to exchange [${RMQ_CONSUMER_EXCHANGE}].`);
      } else if (input.convert === true || isUndefined(input.convert)) {
        for (const [i, videoSize] of sortedSizes.entries()) {
          const videoFilePath = await this.videoConverter.convertVideo(orgnFileTmpPath, {
            ext: input.ext,
            convert: true,
            ...videoSize,
          });

          if (input.ext === VideoExtensionEnum.Hls) {
            const videoDir = dirname(videoFilePath);
            const parts = await readdir(videoDir);

            for (const p of parts) {
              const ext = extname(p);

              if (ext === 'm3u8') continue;
              const pName = this.filenameService.generateFilename(input.originalname, {
                ext,
                type: FileTypeEnum.Part,
                ...videoSize,
              });
              const partObj = await this.minioService.saveFile(join(videoDir, p), {
                filename: pName,
                bucket: input.bucket,
                temporary: true,
              });

              await this.prisma.s3Object.create({
                data: {
                  objectname: partObj.objectname,
                  bucket: partObj.bucket,
                  task_id: input.task_id,
                  size: String(partObj.size),
                },
              });
            }
          }

          const videoFileName = this.filenameService.generateFilename(input.originalname, {
            ext: input.ext,
            type: i === biggestSizeIdx ? FileTypeEnum.MainFile : FileTypeEnum.AltVideo,
            ...videoSize,
          });

          const videoObj = await this.minioService.saveFile(videoFilePath, {
            filename: videoFileName,
            bucket: input.bucket,
            temporary: true,
          });

          await this.prisma.s3Object.create({
            data: {
              objectname: videoObj.objectname,
              bucket: videoObj.bucket,
              main: i === biggestSizeIdx,
              task_id: input.task_id,
              size: String(videoObj.size),
            },
          });

          await this.amqpConnection.publish<MsgFileUpload>(RMQ_CONSUMER_EXCHANGE, 'uploaded_video', {
            action: task.action as FileActionsEnum,
            status: task.status as TaskStatusEnum,
            bucket: videoObj.bucket,
            objectname: videoObj.objectname,
            size: videoObj.size,
            created_at: task.created_at,
            originalname: input.originalname,
            task_id: task.id,
            type: i === biggestSizeIdx ? FileTypeEnum.MainFile : FileTypeEnum.AltVideo,
            uid: input.uid,
            ...videoSize,
          });

          this.logger.log(`Send message [uploaded_video] to exchange [${RMQ_CONSUMER_EXCHANGE}].`);
        }
      }

      const thumbnailRawJpgFile = await this.videoConverter.getFrame(orgnFileTmpPath);

      const previewTempFilepath = await this.imageConverter.convertImage(thumbnailRawJpgFile, {
        ext: ImageExtensionEnum.Webp,
        convert: true,
        resize: false,
      });

      const pImageSize = await this.sizeDetector.getImageSize(previewTempFilepath);

      const pImage = await this.imageSaver.save({
        bucket: input.bucket ?? this.minioService.bucket,
        filetype: FileTypeEnum.Preview,
        originalname: input.originalname,
        size: pImageSize,
        taskId: task.id,
        tempFilepath: previewTempFilepath,
        main: false,
      });

      await this.amqpConnection.publish<MsgFileUpload>(RMQ_CONSUMER_EXCHANGE, 'uploaded_image', {
        action: task.action as FileActionsEnum,
        status: task.status as TaskStatusEnum,
        objectname: pImage.s3obj.objectname,
        originalname: input.originalname,
        size: pImage.s3obj.size,
        type: FileTypeEnum.Preview,
        bucket: pImage.s3obj.bucket,
        task_id: input.task_id,
        created_at: task.created_at,
        metadata: pImage.s3obj.metadata,
        uid: input.uid,
        ...pImageSize,
      });

      this.logger.log(`Send message [uploaded_image] to exchange [${RMQ_CONSUMER_EXCHANGE}].`);

      const thumbnails = await this.thumbnailMaker.makeThumbnails(thumbnailRawJpgFile);

      for (const t of thumbnails) {
        const tImageSize = await this.sizeDetector.getImageSize(t.filepath);

        const pImage = await this.imageSaver.save({
          bucket: input.bucket ?? this.minioService.bucket,
          filetype: FileTypeEnum.Thumbnail,
          originalname: input.originalname,
          size: tImageSize,
          taskId: task.id,
          tempFilepath: t.filepath,
          main: false,
        });

        await this.amqpConnection.publish<MsgFileUpload>(RMQ_CONSUMER_EXCHANGE, 'uploaded_image', {
          action: task.action as FileActionsEnum,
          status: task.status as TaskStatusEnum,
          objectname: pImage.s3obj.objectname,
          originalname: input.originalname,
          size: pImage.s3obj.size,
          type: FileTypeEnum.Thumbnail,
          bucket: pImage.s3obj.bucket,
          task_id: input.task_id,
          created_at: task.created_at,
          metadata: pImage.s3obj.metadata,
          uid: input.uid,
          ...tImageSize,
        });

        this.logger.log(`Send message [uploaded_image] to exchange [${RMQ_CONSUMER_EXCHANGE}].`);
      }

      task = await this.prisma.task.update({
        where: { id: input.task_id },
        data: { status: TaskStatusEnum.Done },
      });

      await sleep(1000);

      await this.amqpConnection.publish<MsgTaskCompleted>(RMQ_CONSUMER_EXCHANGE, 'task_completed', {
        task_id: input.task_id,
        uid: input.uid,
        action: task.action as FileActionsEnum,
        status: task.status as TaskStatusEnum,
      });

      this.logger.log(`Send message [task_completed] to exchange [${RMQ_CONSUMER_EXCHANGE}].`);

      this.tempFilesCollector.tmpFilesCollectorSubj$.next({ dir: input.dir });
    } catch (err) {
      this.logger.error('Video process error.', err);

      await this.videoProcessorExceptionHandler.handle(
        new VideoProcessorException(err.message ?? 'Video process error.', {
          folderToDelete: input.dir,
          taskId: input.task_id,
        }),
      );
    }
  }
}
