import { BadRequestException, Body, CACHE_MANAGER, Controller, Get, Inject, Logger, Post, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { Task } from '@prisma/client';
import { Cache } from 'cache-manager';
import { nanoid } from 'nanoid';

import { FileActionsEnum } from '../../config/actions';
import { AppConfig } from '../../config/types';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUploadUrlPayload } from '../dtos/create-upload-url-payload.dto';
import { GetObjectUrlDto } from '../dtos/get-object-url.dto';
import { GetTasksDto } from '../dtos/get-task.dto';
import { MinioService } from '../services/minio.service';
import { CreateUploadUrlCacheData } from '../types';

@Controller()
export class InternalRestController {
  private readonly logger = new Logger(InternalRestController.name);

  constructor(
    private readonly minioService: MinioService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  @Get('tasks')
  @ApiExcludeEndpoint()
  getTasks(@Query() args: GetTasksDto): Promise<Task[]> {
    try {
      return this.prisma.task.findMany({
        where: {
          action: { in: args.actions },
          originalname: { in: args.originalnames },
          status: { in: args.statuses },
          id: { in: args.ids },
        },
      });
    } catch (err) {
      this.logger.error(`Get task error: ${err.message}. Parameters: ${JSON.stringify(args, null, 2)}.`, err?.stack);

      throw new BadRequestException('Check your input.');
    }
  }

  @Get('object_url')
  @ApiExcludeEndpoint()
  async getObjectUrl(@Query() args: GetObjectUrlDto): Promise<{ url: string }> {
    this.logger.log(
      `Internal object URL request for [${args.objectname}]. Arguments: ${JSON.stringify(args, null, 2)}.`,
    );

    const url = await this.minioService.getObjectUrl(args.objectname, { bucket: args.bucket });

    return { url };
  }

  @Post('create_upload_url')
  @ApiExcludeEndpoint()
  async createUploadUrl(@Body() payload: CreateUploadUrlPayload): Promise<{ url: string }> {
    try {
      const data: CreateUploadUrlCacheData = {
        action: payload.action,
        uid: payload.uid,
      };

      if (payload.bucket) data.bucket = payload.bucket;

      const key = nanoid(10);

      await this.cache.set(key, JSON.stringify(data), 30000);
      let route: string;

      switch (payload.action) {
        case FileActionsEnum.UploadFile: {
          route = 'uploadFile';
          break;
        }
        case FileActionsEnum.UploadImage: {
          route = 'uploadImage';
          break;
        }
        case FileActionsEnum.UploadVideo: {
          route = 'uploadVideo';
          break;
        }
      }

      const url = this.config.get('BASE_URL') + `/${route}/${key}`;

      this.logger.log(`File upload URL generated [${url}], key=[${key}].`);

      return { url };
    } catch (err) {
      this.logger.error('Create upload url error.', err);

      throw new Error('Create upload url error.');
    }
  }
}
