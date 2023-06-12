import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import to from 'await-to-js';
import { join } from 'path';
import { Subject } from 'rxjs';

import { sleep } from '../../../utils/sleep';
import { FileActionsEnum, TaskStatusEnum } from '../../config/actions';
import { PrismaService } from '../../prisma/prisma.service';
import { ImageProcessorException } from '../exceptions/image-processor.exception';
import { ImageProcessorExceptionHandler } from '../exceptions/image-processor.exception-handler';
import { FileTypeEnum, ImageExtensionEnum, Size } from '../types';
import { MsgFileUpload, MsgTaskCompleted } from '../types/queue-payloads';
import { getSizeByProportion } from '../utils/get-size-by-proportion';
import { ImageConverterService } from './image-converter.service';
import { ImageSaverService } from './image-saver.service';
import { MinioService } from './minio.service';
import { SizeDetectorService } from './size-detector.service';
import { TempTagRemoverService } from './temp-tag-remover.service';
import { ThumbnailMakerService } from './thumbnail-maker.service';

export type ImageConversionPayload = {
  originalname: string;
  ext: ImageExtensionEnum;
  dir: string;
  filename: string;
  convert: boolean;
  task_id: number;
  quality?: number;
  bucket?: string;
  uid: string;
} & Partial<Size>;

@Injectable()
export class ImageProcessorService implements OnModuleInit {
  public readonly imageConversion$ = new Subject<ImageConversionPayload>();
  private readonly logger = new Logger(ImageProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sizeDetector: SizeDetectorService,
    private readonly imageConverter: ImageConverterService,
    private readonly minioService: MinioService,
    private readonly thumbnailMaker: ThumbnailMakerService,
    private readonly imageProcessorExceptionHandler: ImageProcessorExceptionHandler,
    private readonly tempTagRemover: TempTagRemoverService,
    private readonly imageSaver: ImageSaverService,
    private readonly amqpConnection: AmqpConnection,
  ) {}

  onModuleInit(): void {
    this.imageConversion$.subscribe(async (event: ImageConversionPayload) => {
      this.logger.log(`Got image conversion event.`);
      this.logger.debug(`Image conversion event:\n${JSON.stringify(event, null, 2)}.`);
      const [err] = await to(this.process(event));

      if (err) {
        this.logger.error(`Error upload image file [${event.originalname}].`);
      } else {
        this.logger.log(`Successfully upload image file [${event.originalname}].`);
      }
    });
  }

  async process(input: ImageConversionPayload): Promise<void> {
    try {
      this.logger.log(`Start process image [${input.originalname}].`);
      this.logger.debug(`Image processor payload:\n${JSON.stringify(input, null, 2)}`);

      let task = await this.prisma.task.findUniqueOrThrow({ where: { id: input.task_id } });

      const originalFileTmpPath = join(input.dir, input.filename);

      const originSize = await this.sizeDetector.getImageSize(originalFileTmpPath);
      const imageSize =
        input.width && input.height
          ? { width: input.width, height: input.height }
          : input.width || input.height
          ? getSizeByProportion({
              targetHeight: input.height,
              targetWidth: input.width,
              originWidth: originSize.width,
              originHeight: originSize.height,
            })
          : originSize;

      let mainFileTmpPath: string;

      if (input.convert === false) {
        mainFileTmpPath = originalFileTmpPath;
      } else {
        mainFileTmpPath = await this.imageConverter.convertImage(originalFileTmpPath, {
          ext: input.ext,
          quality: input.quality,
          convert: true,
          resize: true,
          ...imageSize,
        });
      }

      const mainImage = await this.imageSaver.save({
        bucket: input.bucket ?? this.minioService.bucket,
        filetype: FileTypeEnum.MainFile,
        originalname: input.originalname,
        size: imageSize,
        taskId: task.id,
        tempFilepath: mainFileTmpPath,
        main: true,
      });

      await this.amqpConnection.publish<MsgFileUpload>('core', 'uploaded_image', {
        action: task.action as FileActionsEnum,
        status: task.status as TaskStatusEnum,
        objectname: mainImage.s3obj.objectname,
        originalname: input.originalname,
        size: mainImage.s3obj.size,
        type: FileTypeEnum.MainFile,
        bucket: mainImage.s3obj.bucket,
        task_id: input.task_id,
        created_at: task.created_at,
        metadata: mainImage.s3obj.metadata,
        uid: input.uid,
        ...imageSize,
      });

      this.logger.log(`Send message [uploaded_image] to exchange [core].`);

      const thumbnails = await this.thumbnailMaker.makeThumbnails(originalFileTmpPath);

      for (const t of thumbnails) {
        const tSize = await this.sizeDetector.getImageSize(t.filepath);

        const tImage = await this.imageSaver.save({
          bucket: input.bucket ?? this.minioService.bucket,
          filetype: FileTypeEnum.Thumbnail,
          originalname: input.originalname,
          size: tSize,
          taskId: task.id,
          tempFilepath: t.filepath,
          main: false,
        });

        await this.amqpConnection.publish<MsgFileUpload>('core', 'uploaded_image', {
          action: task.action as FileActionsEnum,
          status: task.status as TaskStatusEnum,
          objectname: tImage.s3obj.objectname,
          originalname: input.originalname,
          size: tImage.s3obj.size,
          type: FileTypeEnum.Thumbnail,
          bucket: tImage.s3obj.bucket,
          task_id: input.task_id,
          created_at: task.created_at,
          metadata: tImage.s3obj.metadata,
          uid: input.uid,
          ...tSize,
        });

        this.logger.log(`Send message [uploaded_image] to exchange [core].`);
      }

      task = await this.prisma.task.update({
        where: { id: input.task_id },
        data: { status: TaskStatusEnum.Done },
      });

      await sleep(1000);

      await this.amqpConnection.publish<MsgTaskCompleted>('core', 'task_completed', {
        task_id: input.task_id,
        uid: input.uid,
        status: task.status as TaskStatusEnum,
        action: task.action as FileActionsEnum,
      });

      this.logger.log(`Send message [task_completed] to exchange [core].`);
    } catch (e) {
      this.logger.error(`Process image file error. ${e}.`);

      await this.imageProcessorExceptionHandler.handle(
        new ImageProcessorException('Process image file error.', {
          folderToDelete: input.dir,
          taskId: input.task_id,
        }),
      );
    }
  }
}
