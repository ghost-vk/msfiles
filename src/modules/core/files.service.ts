import { Injectable, InternalServerErrorException, Logger, OnModuleInit } from '@nestjs/common';
import to from 'await-to-js';

import { PrismaService } from '../../services/prisma.service';
import { actions, taskStatus } from '../config/actions';
import { ImageService } from './image.service';
import { imageConversion$, videoConversion$ } from './observable';
import { CompressImageBufferOptions } from './types';
import { VideoService } from './video.service';

@Injectable()
export class FilesService implements OnModuleInit {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly imageService: ImageService,
    private readonly videoService: VideoService,
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

      return this.imageService.processImageWithSharp(buffer, options.ext, {
        quality: options.quality ?? 80,
        height: options.height,
        width: options.width,
      });
    } catch (e) {
      this.logger.error('An error occured when compressed image.', e);

      throw new InternalServerErrorException('Compress image error.');
    }
  }

  private async listenVideoEvents(): Promise<void> {
    videoConversion$.subscribe(async (event) => {
      this.logger.debug(`Got video conversion event: ${JSON.stringify(event, null, 2)}`);
      const [err] = await to(this.videoService.handleTmpVideoFile(event));

      if (err) {
        this.logger.error(`Error while upload video file [${event.originalname}]`);
      } else {
        this.logger.log(`Successfully upload video file [${event.originalname}]`);
      }
    });
  }

  private listenImageEvents(): void {
    imageConversion$.subscribe(async (event) => {
      this.logger.debug(`Got image conversion event: ${JSON.stringify(event, null, 2)}.`);
      const [err] = await to(this.imageService.handleTmpImageFile(event));

      if (err) {
        this.logger.error(`Error while upload video file [${event.originalname}]`);
      } else {
        this.logger.log(`Successfully upload video file [${event.originalname}]`);
      }
    });
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
