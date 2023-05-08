import { Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import to from 'await-to-js';
import { readFile, rm } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';

import { PrismaService } from '../../services/prisma.service';
import { actions, taskStatus } from '../config/actions';
import { MS_CLIENT } from '../config/constants';
import { sentMessages } from './messages';
import { MinioService } from './minio.service';
import {
  ImageConversionPayload,
  ImageExtensions,
  MessageAsyncUploadError,
  MessageUploadPayload,
  ProcessImageOptions,
  TaskCompletedPayload,
} from './types';
import { getFilenameWithoutExtension } from './utils';

export class ImageService {
  private readonly logger = new Logger(ImageService.name);

  constructor(
    private readonly minioService: MinioService,
    private readonly prisma: PrismaService,
    @Inject(MS_CLIENT) private readonly queueClient: ClientProxy,
  ) {}

  processImageWithSharp(
    inputBuffer: Buffer,
    extension: ImageExtensions = 'webp',
    options: ProcessImageOptions = {},
  ): Promise<Buffer> {
    let s = sharp(inputBuffer);

    switch (extension) {
      case 'jpeg': {
        s = s.jpeg({ ...options });
        break;
      }
      case 'png': {
        s = s.png({ ...options });
        break;
      }
      case 'webp': {
        s = s.webp({ ...options });
        break;
      }
      default: {
        s = s.webp({ ...options });
      }
    }

    if (options.width || options.height) {
      s = s.resize({
        width: options.width,
        height: options.height,
        fit: options.fit,
      });
    }

    return s.toBuffer();
  }

  async handleTmpImageFile(input: ImageConversionPayload): Promise<void> {
    const uploadedObjects: string[] = [];

    try {
      const originalFileTempPath = join(input.dir, input.filename);

      let originalFileBuffer = await readFile(originalFileTempPath);

      originalFileBuffer = await this.processImageWithSharp(originalFileBuffer, 'webp', {
        quality: input.quality,
        width: input.width,
        height: input.height,
      });

      const filenameWithoutExt = getFilenameWithoutExtension(input.originalname);

      const object = await this.minioService.saveFileToStorage(originalFileBuffer, {
        originalname: input.ext,
        temporary: true,
        actor: input.actor,
        bucket: input.bucket,
      });

      let task = await this.prisma.task.update({
        where: { id: input.task_id },
        data: { objectname: object.objectname },
      });

      this.queueClient.emit<unknown, MessageUploadPayload>(sentMessages.uploadedImage, {
        action: actions.uploadImage,
        objectname: object.objectname,
        originalname: input.originalname,
        size: object.size,
        type: 'mainFile',
        bucket: object.bucket,
        task_id: input.task_id,
        created_at: task.created_at,
        actor: input.actor,
        metadata: object.metadata,
      });

      uploadedObjects.push(object.objectname);

      const thumbnail300Buffer = await this.processImageWithSharp(originalFileBuffer, 'webp', {
        height: 300,
        width: 300,
        fit: 'inside',
      });

      const thumbnail300Object = await this.minioService.saveFileToStorage(thumbnail300Buffer, {
        originalname: input.originalname.endsWith('.webp') ? input.originalname : filenameWithoutExt + '.webp',
        mimetype: 'image/webp',
        temporary: true,
        actor: input.actor,
        bucket: input.bucket,
      });

      uploadedObjects.push(thumbnail300Object.objectname);

      task = await this.prisma.task.update({
        where: { id: input.task_id },
        data: { status: taskStatus.done, linked_objects: thumbnail300Object.objectname },
      });

      this.queueClient.emit<unknown, MessageUploadPayload>(sentMessages.uploadedImage, {
        action: actions.uploadImage,
        objectname: thumbnail300Object.objectname,
        originalname: input.originalname,
        size: object.size,
        type: 'thumbnail',
        bucket: object.bucket,
        task_id: input.task_id,
        created_at: task.created_at,
        actor: input.actor,
        metadata: object.metadata,
      });

      this.queueClient.emit<unknown, TaskCompletedPayload>(sentMessages.taskCompleted, { task_id: input.task_id });
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
        action: actions.uploadImage,
        actor: task.actor,
        task_id: task.id,
        created_at: task.created_at,
        message: task.error_message ? task.error_message : undefined,
      };

      this.queueClient.emit<unknown, MessageAsyncUploadError>(sentMessages.uploadError, msgPayload);

      throw new Error('Handle temporary video file error.');
    }
  }
}
