import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import to from 'await-to-js';
import { randomUUID } from 'crypto';
import { mkdir, readdir, readFile, rm } from 'fs/promises';
import imageSize from 'image-size';
import { isUndefined, sortBy } from 'lodash';
import { nanoid } from 'nanoid';
import { join } from 'path';
import sharp from 'sharp';

import { PrismaService } from '../../services/prisma.service';
import { actions, taskStatus } from '../config/actions';
import { MS_CLIENT } from '../config/constants';
import { FFmpegService } from './ffmpeg.service';
import { sentMessages } from './messages';
import { MinioService } from './minio.service';
import { imageConversion$, videoConversion$ } from './observable';
import {
  CompressImageBufferOptions,
  ImageConversionPayload,
  MessageAsyncUploadError,
  MessageUploadImagePayload,
  MessageUploadVideoPayload,
  PutObjectResult,
  VideoConversionPayload,
} from './types';
import { getFilenameWithoutExtension } from './utils';

@Injectable()
export class FilesService implements OnModuleInit {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly ffmpegService: FFmpegService,
    private readonly minioService: MinioService,
    private readonly prisma: PrismaService,
    @Inject(MS_CLIENT) private readonly queueClient: ClientProxy,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.setErrorStatusToActiveTasks();

    this.listenVideoEvents();
    this.listenImageEvents();
  }

  /**
   * Method compresses images.
   * Default ext is webp.
   *
   * @param buffer
   * @param options
   * @returns
   */
  async compressImage(buffer: Buffer, options: CompressImageBufferOptions = {}): Promise<Buffer> {
    try {
      this.logger.debug('Try to compress buffer of image file.');

      let s = sharp(buffer);

      if (options.width || options.height) {
        s = s.resize({
          width: options.width,
          height: options.height,
          fit: 'inside',
        });
      }

      switch (options.ext) {
        case 'jpeg': {
          s = s.jpeg({ quality: options.quality });
          break;
        }
        case 'png': {
          s = s.png({ quality: options.quality });
          break;
        }
        case 'webp': {
          s = s.webp({ quality: options.quality });
          break;
        }
        default: {
          s = s.webp({ quality: options.quality });
        }
      }

      const compressed = await s.toBuffer();

      this.logger.debug('The buffer was successfully compressed.');

      return compressed;
    } catch (e) {
      this.logger.error('An error occured when compressed image.', e);

      throw new InternalServerErrorException('Compress image error.');
    }
  }

  resizeImage(input: Buffer, boxSize: number): Promise<Buffer> {
    return sharp(input)
      .resize({
        width: boxSize,
        height: boxSize,
        fit: 'inside',
      })
      .webp()
      .toBuffer();
  }

  getImageSize(input: Buffer): { width?: number; height?: number } {
    const dimensions = imageSize(input);

    return {
      height: dimensions.height,
      width: dimensions.width,
    };
  }

  private async listenVideoEvents(): Promise<void> {
    videoConversion$.subscribe(async (event) => {
      this.logger.debug(`Got video conversion event: ${JSON.stringify(event, null, 2)}`);
      const [err] = await to(this.handleTmpVideoFile(event));

      if (err) {
        this.logger.error(`Error while upload video file [${event.originalname}]`);
      } else {
        this.logger.log(`Successfully upload video file [${event.originalname}]`);
      }
    });
  }

  private async handleTmpVideoFile(input: VideoConversionPayload): Promise<void> {
    const uploadedObjects: PutObjectResult[] = [];

    try {
      const originalnameWithoutExt = getFilenameWithoutExtension(input.originalname);
      const originalFileTempPath = join(input.dir, input.filename);

      let totalFileSize = 0;
      let sortedSizes = input.sizes ?? [{ width: 0, height: 0 }];

      if (sortedSizes.length) {
        sortedSizes = sortBy(input.sizes, 'width');
      }

      this.logger.debug(`Sorted sizes: ${JSON.stringify(sortedSizes, null, 2)}`);

      const highestQualityObjectIndex = sortedSizes.length - 1;
      const altResolutionObjects: MessageUploadVideoPayload['altResolutionObjects'] = [];

      const shouldOnlyUploadOriginalObject =
        ['n', 'no', 'not'].includes(input.compress ?? '') || isUndefined(input.compress);

      if (shouldOnlyUploadOriginalObject) {
        this.logger.log(`Upload video file ${input.originalname} without conversion.`);

        const originalObject = await this.minioService.putObject(originalFileTempPath, {
          originalname: originalnameWithoutExt + '.webm',
          mimetype: 'video/webm',
          temporary: true,
          height: input.sizes && input.sizes[0] ? input.sizes[0].height : undefined,
          width: input.sizes && input.sizes[0] ? input.sizes[0].width : undefined,
          actor: input.actor,
          bucket: input.bucket,
        });

        await this.prisma.task.update({
          where: { id: input.task_id },
          data: { objectname: originalObject.objectname },
        });

        totalFileSize += originalObject.size;

        uploadedObjects.push(originalObject);
      } else {
        for (const [i, size] of sortedSizes.entries()) {
          const width = size.width > 0 ? size.width : undefined;
          const height = size.height > 0 ? size.height : undefined;

          switch (input.ext) {
            case 'webm': {
              this.logger.log(`Compress video file [${input.originalname}] to webm.`);
              const webmFilePath = join(input.dir, randomUUID() + '.webm');

              await this.ffmpegService.webm(originalFileTempPath, webmFilePath, {
                width,
                height,
              });

              const webmObject = await this.minioService.putObject(webmFilePath, {
                originalname: originalnameWithoutExt + '.webm',
                mimetype: 'video/webm',
                temporary: true,
                height,
                width,
                actor: input.actor,
                bucket: input.bucket,
              });

              totalFileSize += webmObject.size;
              uploadedObjects.push(webmObject);

              if (i !== highestQualityObjectIndex && input.sizes && input.sizes.length > 1) {
                altResolutionObjects.push({ [`${width}x${height}`]: webmObject.objectname });
              } else {
                await this.prisma.task.update({
                  where: { id: input.task_id },
                  data: { objectname: webmObject.objectname },
                });
              }

              break;
            }
            case 'mp4': {
              this.logger.log(`Compress video file [${input.originalname}] to MP4.`);
              const mp4FilePath = join(input.dir, randomUUID() + '.mp4');

              await this.ffmpegService.mp4(originalFileTempPath, mp4FilePath, {
                height,
                width,
              });

              const mp4Object = await this.minioService.putObject(mp4FilePath, {
                originalname: originalnameWithoutExt + '.mp4',
                mimetype: 'video/mp4',
                temporary: true,
                height,
                width,
                actor: input.actor,
                bucket: input.bucket,
              });

              totalFileSize += mp4Object.size;
              uploadedObjects.push(mp4Object);

              if (i !== highestQualityObjectIndex && input.sizes && input.sizes.length > 1) {
                altResolutionObjects.push({ [`${width}x${height}`]: mp4Object.objectname });
              } else {
                await this.prisma.task.update({
                  where: { id: input.task_id },
                  data: { objectname: mp4Object.objectname },
                });
              }

              break;
            }
            case 'hls': {
              this.logger.log(`Compress video file [${input.originalname}] to HLS.`);
              const innerDir = join(input.dir, randomUUID());

              await mkdir(innerDir);
              let m3u8FileName = originalnameWithoutExt;

              m3u8FileName += `_${nanoid(6)}`;
              if (height && width) {
                m3u8FileName += `_${width}x${height}`;
              }
              m3u8FileName += '.m3u8';
              const m3u8FilePath = join(innerDir, m3u8FileName);

              await this.ffmpegService.m3u8(originalFileTempPath, m3u8FilePath, {
                height,
                width,
              });

              const filenames = await readdir(innerDir);

              if (!filenames.length) {
                const msg = `Inner directory for HLS video [${input.originalname}] is empty.`;

                this.logger.error(msg);

                throw new Error(msg);
              }

              for (const filename of filenames) {
                const hlsPartObject = await this.minioService.putObject(join(innerDir, filename), {
                  originalname: filename,
                  temporary: true,
                  height: height,
                  width: width,
                  preserveOriginalName: true,
                  actor: input.actor,
                  bucket: input.bucket,
                });

                totalFileSize += hlsPartObject.size;
                uploadedObjects.push(hlsPartObject);

                if (filename.endsWith('ts')) {
                  altResolutionObjects.push({ [`${width}x${height}`]: hlsPartObject.objectname });
                } else if (filename.endsWith('m3u8') && i === highestQualityObjectIndex) {
                  await this.prisma.task.update({
                    where: { id: input.task_id },
                    data: { objectname: hlsPartObject.objectname },
                  });
                }
              }

              break;
            }
          }
        }
      }

      const videoThumbnailOutputPath = join(input.dir, randomUUID() + '.jpg');

      await this.ffmpegService.getFrame(originalFileTempPath, videoThumbnailOutputPath);

      const videoThumbnailBuffer = await readFile(videoThumbnailOutputPath);

      const greatestWidhtItem = input.sizes ? sortedSizes[highestQualityObjectIndex] : undefined;

      const videoCompressedPreviewBuffer = await this.compressImage(videoThumbnailBuffer, {
        height: greatestWidhtItem?.height,
        width: greatestWidhtItem?.width,
      });

      const videoCompressedPreviewObject = await this.minioService.putObject(
        videoCompressedPreviewBuffer,
        {
          originalname: originalnameWithoutExt + '_video_preview.webp',
          mimetype: 'image/webp',
          temporary: true,
          checkImageSize: true,
          actor: input.actor,
          bucket: input.bucket,
        },
      );

      totalFileSize += videoCompressedPreviewObject.size;
      uploadedObjects.push(videoCompressedPreviewObject);

      const videoCompressedThumbnailBuffer = await this.compressImage(videoThumbnailBuffer, {
        height: 300,
        width: 300,
      });

      const videoCompressedThumbnailObject = await this.minioService.putObject(
        videoCompressedThumbnailBuffer,
        {
          originalname: originalnameWithoutExt + '_video_thumbnail.webp',
          mimetype: 'image/webp',
          temporary: true,
          checkImageSize: true,
          actor: input.actor,
          bucket: input.bucket,
        },
      );

      totalFileSize += videoCompressedThumbnailObject.size;
      uploadedObjects.push(videoCompressedThumbnailObject);

      await to(rm(input.dir, { recursive: true, force: true }));

      const updatedTask = await this.prisma.task.update({
        where: { id: input.task_id },
        data: {
          status: taskStatus.done,
          linked_objects: uploadedObjects.map((o) => o.objectname).join(','),
        },
      });

      const msgPayload: MessageUploadVideoPayload = {
        action: 'upload_video',
        objectname: uploadedObjects[highestQualityObjectIndex].objectname,
        size: totalFileSize,
        type: 'video',
        metadata: uploadedObjects[highestQualityObjectIndex].metadata,
        altResolutionObjects,
        previews: [videoCompressedPreviewObject.objectname],
        thumbnails: [{ '300': videoCompressedThumbnailObject.objectname }],
        linkedObjects: uploadedObjects.map((o) => o.objectname),
        bucket: uploadedObjects[highestQualityObjectIndex].bucket,
        task_id: input.task_id,
        created_at: updatedTask.created_at,
        actor: input.actor,
      };

      this.queueClient.emit<unknown, MessageUploadVideoPayload>(
        sentMessages.uploadedImage,
        msgPayload,
      );

      this.logger.debug(
        `Sent message to queue [${sentMessages.uploadedImage}]. Payload: ${JSON.stringify(
          msgPayload,
          null,
          2,
        )}.`,
      );
    } catch (error) {
      this.logger.error(
        `Handle temporary video file error. Message: ${error?.message}.`,
        error?.stack,
      );

      await to(rm(input.dir, { recursive: true, force: true }));

      if (uploadedObjects.length) {
        await to(
          this.minioService.deleteObjects(
            uploadedObjects.map((o) => o.objectname),
            { bucket: input.bucket },
          ),
        );
      }

      const task = await this.prisma.task.update({
        where: { id: input.task_id },
        data: {
          status: taskStatus.error,
          error_message: error?.message ? error.message : undefined,
        },
      });

      const msgPayload: MessageAsyncUploadError = {
        action: 'upload_video',
        actor: task.actor,
        task_id: input.task_id,
        created_at: task.created_at,
        message: task.error_message ? task.error_message : undefined,
      };

      this.queueClient.emit<unknown, MessageAsyncUploadError>(sentMessages.uploadError, msgPayload);

      throw new Error('Handle temporary video file error.');
    }
  }

  private listenImageEvents(): void {
    imageConversion$.subscribe(async (event) => {
      this.logger.debug(`Got image conversion event: ${JSON.stringify(event, null, 2)}.`);
      const [err] = await to(this.handleTmpImageFile(event));

      if (err) {
        this.logger.error(`Error while upload video file [${event.originalname}]`);
      } else {
        this.logger.log(`Successfully upload video file [${event.originalname}]`);
      }
    });
  }

  private async handleTmpImageFile(input: ImageConversionPayload): Promise<void> {
    const uploadedObjects: string[] = [];

    try {
      const originalFileTempPath = join(input.dir, input.filename);

      let originalFileBuffer = await readFile(originalFileTempPath);

      originalFileBuffer = await this.compressImage(originalFileBuffer, {
        quality: input.quality,
        ext: input.ext,
        width: input.width,
        height: input.height,
      });

      const filenameWithoutExt = getFilenameWithoutExtension(input.originalname);

      const object = await this.minioService.putObject(originalFileBuffer, {
        originalname: input.ext
          ? filenameWithoutExt + '.' + input.ext
          : filenameWithoutExt + '.webp',
        temporary: true,
        actor: input.actor,
        bucket: input.bucket,
      });

      await this.prisma.task.update({
        where: { id: input.task_id },
        data: { objectname: object.objectname },
      });

      uploadedObjects.push(object.objectname);

      const thumbnail300Buffer = await this.resizeImage(originalFileBuffer, 300);

      const thumbnail300Object = await this.minioService.putObject(thumbnail300Buffer, {
        originalname: input.originalname.endsWith('.webp')
          ? input.originalname
          : filenameWithoutExt + '.webp',
        mimetype: 'image/webp',
        temporary: true,
        actor: input.actor,
        bucket: input.bucket,
      });

      uploadedObjects.push(thumbnail300Object.objectname);

      const updatedTask = await this.prisma.task.update({
        where: { id: input.task_id },
        data: { status: taskStatus.done, linked_objects: thumbnail300Object.objectname },
      });

      const msgPayload: MessageUploadImagePayload = {
        action: 'upload_image',
        objectname: object.objectname,
        size: object.size,
        type: 'image',
        metadata: object.metadata,
        thumbnails: [{ '300': thumbnail300Object.objectname }],
        linkedObjects: [thumbnail300Object.objectname],
        bucket: object.bucket,
        task_id: input.task_id,
        created_at: updatedTask.created_at,
        actor: input.actor,
      };

      this.queueClient.emit<unknown, MessageUploadImagePayload>(
        sentMessages.uploadedImage,
        msgPayload,
      );

      this.logger.debug(
        `Sent message to queue [${sentMessages.uploadedImage}]. Payload: ${JSON.stringify(
          msgPayload,
          null,
          2,
        )}.`,
      );
    } catch (e) {
      this.logger.error('Handle temporary image file error.', e);

      await to(rm(input.dir, { recursive: true, force: true }));

      if (uploadedObjects.length) {
        await to(this.minioService.deleteObjects(uploadedObjects, { bucket: input.bucket }));
      }

      const task = await this.prisma.task.update({
        where: { id: input.task_id },
        data: { status: taskStatus.error, error_message: e?.message ? e.message : undefined },
      });

      const msgPayload: MessageAsyncUploadError = {
        action: 'upload_image',
        actor: task.actor,
        task_id: task.id,
        created_at: task.created_at,
        message: task.error_message ? task.error_message : undefined,
      };

      this.queueClient.emit<unknown, MessageAsyncUploadError>(sentMessages.uploadError, msgPayload);

      throw new Error('Handle temporary video file error.');
    }
  }

  /**
   * Method set status error to active task,
   * if microservice is shut down, task will be interrupted,
   * so there is need to mark it as error.
   */
  async setErrorStatusToActiveTasks(
    options: { user_id?: number; action?: (typeof actions)[keyof typeof actions] } = {},
  ): Promise<void> {
    try {
      const res = await this.prisma.task.updateMany({
        where: {
          status: taskStatus.inProgress,
          actor: options.user_id ? String(options.user_id) : undefined,
          action: options.action ? options.action : undefined,
        },
        data: { status: taskStatus.error },
      });

      this.logger.log(`${res.count} tasks mark failed.`);
    } catch (err) {
      this.logger.error(`Error occured when try to set failed task status.`);
    }
  }
}
