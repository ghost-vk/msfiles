import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import to from 'await-to-js';
import { randomUUID } from 'crypto';
import { mkdir, readdir, readFile, rm } from 'fs/promises';
import { isUndefined, sortBy } from 'lodash';
import { nanoid } from 'nanoid';
import { join } from 'path';

import { PrismaService } from '../../services/prisma.service';
import { actions, taskStatus } from '../config/actions';
import { FILES_DELIMETER, MS_CLIENT } from '../config/constants';
import { FFmpegService } from './ffmpeg.service';
import { FFprobeService } from './ffprobe.service';
import { ImageService } from './image.service';
import { sentMessages } from './messages';
import { MinioService } from './minio.service';
import {
  MessageAsyncUploadError,
  MessageUploadPayload,
  PutObjectResult,
  TaskCompletedPayload,
  VideoConversionPayload,
} from './types';
import { getFilenameWithoutExtension } from './utils';

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);

  constructor(
    private readonly ffprobeService: FFprobeService,
    private readonly ffmpegService: FFmpegService,
    private readonly prisma: PrismaService,
    private readonly minioService: MinioService,
    @Inject(MS_CLIENT) private readonly queueClient: ClientProxy,
    private readonly imageService: ImageService,
  ) {}

  async handleTmpVideoFile(input: VideoConversionPayload): Promise<void> {
    const uploadedObjects: PutObjectResult[] = [];

    try {
      const originalnameWithoutExt = getFilenameWithoutExtension(input.originalname);
      const originalFileTempPath = join(input.dir, input.filename);
      const originalVideoDimensions = await this.ffprobeService.getVideoDimensions(originalFileTempPath);

      let sortedSizes = input.sizes;

      if (!sortedSizes) {
        sortedSizes = [{ ...originalVideoDimensions }];
      }

      if (sortedSizes.length && sortedSizes.length > 1) {
        sortedSizes = sortBy(input.sizes, 'width');
      }

      this.logger.debug(`Sorted sizes: ${JSON.stringify(sortedSizes, null, 2)}.`);

      const highestQualityObjectIndex = sortedSizes.length - 1;

      const shouldOnlyUploadOriginalObject =
        ['n', 'no', 'not'].includes(input.compress ?? '') || isUndefined(input.compress);

      let task = await this.prisma.task.findUniqueOrThrow({
        where: { id: input.task_id },
        select: { id: true, created_at: true },
      });

      if (shouldOnlyUploadOriginalObject) {
        this.logger.log(`Upload video file ${input.originalname} without conversion.`);

        const originalObject = await this.minioService.saveFileToStorage(originalFileTempPath, {
          originalname: input.originalname,
          temporary: true,
          actor: input.actor,
          bucket: input.bucket,
          ...originalVideoDimensions,
        });

        task = await this.prisma.task.update({
          where: { id: input.task_id },
          data: { objectname: originalObject.objectname },
        });

        this.queueClient.emit<unknown, MessageUploadPayload>(sentMessages.uploadedVideo, {
          action: actions.uploadVideo,
          actor: input.actor,
          bucket: originalObject.bucket,
          objectname: originalObject.objectname,
          size: originalObject.size,
          created_at: task.created_at,
          originalname: input.originalname,
          task_id: task.id,
          type: 'mainFile',
          ...originalVideoDimensions,
        });

        uploadedObjects.push(originalObject);
      } else {
        for (const [i, videoDimension] of sortedSizes.entries()) {
          switch (input.ext) {
            case 'webm': {
              this.logger.log(`Compress video file [${input.originalname}] to webm.`);
              const webmFileDestinationPath = join(input.dir, randomUUID() + '.webm');

              await this.ffmpegService.webm(originalFileTempPath, webmFileDestinationPath, {
                ...videoDimension,
              });

              const webmObject = await this.minioService.saveFileToStorage(webmFileDestinationPath, {
                originalname: originalnameWithoutExt + '.webm',
                mimetype: 'video/webm',
                temporary: true,
                actor: input.actor,
                bucket: input.bucket,
                ...videoDimension,
              });

              uploadedObjects.push(webmObject);

              if (i !== highestQualityObjectIndex && input.sizes && input.sizes.length > 1) {
                this.queueClient.emit<unknown, MessageUploadPayload>(sentMessages.uploadedVideo, {
                  action: actions.uploadVideo,
                  actor: input.actor,
                  bucket: webmObject.bucket,
                  objectname: webmObject.objectname,
                  size: webmObject.size,
                  created_at: task.created_at,
                  originalname: input.originalname,
                  task_id: task.id,
                  type: 'altVideo',
                  ...videoDimension,
                });
              } else {
                await this.prisma.task.update({
                  where: { id: input.task_id },
                  data: { objectname: webmObject.objectname },
                });

                this.queueClient.emit<unknown, MessageUploadPayload>(sentMessages.uploadedVideo, {
                  action: actions.uploadVideo,
                  actor: input.actor,
                  bucket: webmObject.bucket,
                  objectname: webmObject.objectname,
                  size: webmObject.size,
                  created_at: task.created_at,
                  originalname: input.originalname,
                  task_id: task.id,
                  type: 'mainFile',
                  ...videoDimension,
                });
              }

              break;
            }
            case 'mp4': {
              this.logger.log(`Compress video file [${input.originalname}] to MP4.`);
              const mp4FilePath = join(input.dir, randomUUID() + '.mp4');

              await this.ffmpegService.mp4(originalFileTempPath, mp4FilePath, {
                ...videoDimension,
              });

              const mp4Object = await this.minioService.saveFileToStorage(mp4FilePath, {
                originalname: originalnameWithoutExt + '.mp4',
                mimetype: 'video/mp4',
                temporary: true,
                actor: input.actor,
                bucket: input.bucket,
                ...videoDimension,
              });

              uploadedObjects.push(mp4Object);

              if (i !== highestQualityObjectIndex && input.sizes && input.sizes.length > 1) {
                this.queueClient.emit<unknown, MessageUploadPayload>(sentMessages.uploadedVideo, {
                  action: actions.uploadVideo,
                  actor: input.actor,
                  bucket: mp4Object.bucket,
                  objectname: mp4Object.objectname,
                  size: mp4Object.size,
                  created_at: task.created_at,
                  originalname: input.originalname,
                  task_id: task.id,
                  type: 'altVideo',
                  ...videoDimension,
                });
              } else {
                await this.prisma.task.update({
                  where: { id: input.task_id },
                  data: { objectname: mp4Object.objectname },
                });

                this.queueClient.emit<unknown, MessageUploadPayload>(sentMessages.uploadedVideo, {
                  action: actions.uploadVideo,
                  actor: input.actor,
                  bucket: mp4Object.bucket,
                  objectname: mp4Object.objectname,
                  size: mp4Object.size,
                  created_at: task.created_at,
                  originalname: input.originalname,
                  task_id: task.id,
                  type: 'mainFile',
                  ...videoDimension,
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
              m3u8FileName += `_${videoDimension.width}x${videoDimension.height}`;
              m3u8FileName += '.m3u8';
              const m3u8FilePath = join(innerDir, m3u8FileName);

              await this.ffmpegService.m3u8(originalFileTempPath, m3u8FilePath, {
                ...videoDimension,
              });

              const filenames = await readdir(innerDir);

              if (!filenames.length) {
                const msg = `Inner directory for HLS video [${input.originalname}] is empty.`;

                this.logger.error(msg);

                throw new Error(msg);
              }

              for (const filename of filenames) {
                const hlsPartObject = await this.minioService.saveFileToStorage(join(innerDir, filename), {
                  originalname: filename,
                  temporary: true,
                  preserveOriginalName: true,
                  actor: input.actor,
                  bucket: input.bucket,
                  ...videoDimension,
                });

                uploadedObjects.push(hlsPartObject);
                const mainFile = i === highestQualityObjectIndex;

                if (filename.endsWith('m3u8') && !mainFile) {
                  this.queueClient.emit<unknown, MessageUploadPayload>(sentMessages.uploadedVideo, {
                    action: actions.uploadVideo,
                    actor: input.actor,
                    bucket: hlsPartObject.bucket,
                    objectname: hlsPartObject.objectname,
                    size: hlsPartObject.size,
                    created_at: task.created_at,
                    originalname: input.originalname,
                    task_id: task.id,
                    type: 'altVideo',
                    ...videoDimension,
                  });
                } else if (filename.endsWith('m3u8') && mainFile) {
                  await this.prisma.task.update({
                    where: { id: input.task_id },
                    data: { objectname: hlsPartObject.objectname },
                  });

                  this.queueClient.emit<unknown, MessageUploadPayload>(sentMessages.uploadedVideo, {
                    action: actions.uploadVideo,
                    actor: input.actor,
                    bucket: hlsPartObject.bucket,
                    objectname: hlsPartObject.objectname,
                    size: hlsPartObject.size,
                    created_at: task.created_at,
                    originalname: input.originalname,
                    task_id: task.id,
                    type: 'mainFile',
                    ...videoDimension,
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

      const videoCompressedPreviewBuffer = await this.imageService.processImageWithSharp(videoThumbnailBuffer, 'webp', {
        ...sortedSizes[highestQualityObjectIndex],
      });

      const videoCompressedPreviewObject = await this.minioService.saveFileToStorage(videoCompressedPreviewBuffer, {
        originalname: originalnameWithoutExt + '_video_preview.webp',
        mimetype: 'image/webp',
        temporary: true,
        checkImageSize: true,
        actor: input.actor,
        bucket: input.bucket,
      });

      uploadedObjects.push(videoCompressedPreviewObject);

      this.queueClient.emit<unknown, MessageUploadPayload>(sentMessages.uploadedVideo, {
        action: actions.uploadVideo,
        actor: input.actor,
        originalname: input.originalname,
        bucket: videoCompressedPreviewObject.bucket,
        objectname: videoCompressedPreviewObject.objectname,
        size: videoCompressedPreviewObject.size,
        created_at: task.created_at,
        task_id: task.id,
        type: 'preview',
        ...sortedSizes[highestQualityObjectIndex],
      });

      const videoCompressedThumbnailBuffer = await this.imageService.processImageWithSharp(
        videoThumbnailBuffer,
        'webp',
        {
          height: 300,
          width: 300,
        },
      );

      const videoCompressedThumbnailObject = await this.minioService.saveFileToStorage(videoCompressedThumbnailBuffer, {
        originalname: originalnameWithoutExt + '_video_thumbnail.webp',
        mimetype: 'image/webp',
        temporary: true,
        checkImageSize: true,
        actor: input.actor,
        bucket: input.bucket,
      });

      uploadedObjects.push(videoCompressedThumbnailObject);

      this.queueClient.emit<unknown, MessageUploadPayload>(sentMessages.uploadedVideo, {
        action: actions.uploadVideo,
        actor: input.actor,
        originalname: input.originalname,
        bucket: videoCompressedThumbnailObject.bucket,
        objectname: videoCompressedThumbnailObject.objectname,
        size: videoCompressedThumbnailObject.size,
        created_at: task.created_at,
        task_id: task.id,
        type: 'thumbnail',
        ...sortedSizes[highestQualityObjectIndex],
      });

      await to(rm(input.dir, { recursive: true, force: true }));

      task = await this.prisma.task.update({
        where: { id: input.task_id },
        data: {
          status: taskStatus.done,
          linked_objects: uploadedObjects.map((o) => o.objectname).join(FILES_DELIMETER),
        },
      });

      this.queueClient.emit<unknown, TaskCompletedPayload>(sentMessages.taskCompleted, { task_id: task.id });

      this.logger.debug(`Sent message to queue [${sentMessages.taskCompleted}].`);
    } catch (error) {
      this.logger.error(`Handle temporary video file error. Message: ${error?.message}.`, error?.stack);

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
        action: 'uploadVideo',
        actor: task.actor,
        task_id: input.task_id,
        created_at: task.created_at,
        message: task.error_message ? task.error_message : undefined,
      };

      this.queueClient.emit<unknown, MessageAsyncUploadError>(sentMessages.uploadError, msgPayload);

      throw new Error('Handle temporary video file error.');
    }
  }
}
