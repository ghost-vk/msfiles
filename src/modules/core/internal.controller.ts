import {
  BadRequestException,
  Body,
  CACHE_MANAGER,
  Controller,
  Inject,
  Logger,
  Post,
  UseFilters,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { Task } from '@prisma/client';
import to from 'await-to-js';
import { Cache } from 'cache-manager';
import { nanoid } from 'nanoid';

import { PrismaService } from '../../services/prisma.service';
import { AppConfig } from '../config/types';
import { GetTasksDto } from './core.dto';
import { receivedMessages } from './messages';
import { MinioService } from './minio.service';
import { RpcValidationFilter } from './rpc-validation.filter';
import {
  CreateUploadUrlCacheData,
  CreateUploadUrlPayload,
  DeleteObjectsPayload,
  RemoveTemporaryTagPayload,
} from './types';

@Controller()
export class InternalController {
  private readonly logger = new Logger(InternalController.name);

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly minioService: MinioService,
    private readonly prisma: PrismaService,
  ) {}

  @UseFilters(new RpcValidationFilter())
  @MessagePattern(receivedMessages.createUploadUrl)
  @ApiExcludeEndpoint()
  async createUploadUrl(
    @Payload(new ValidationPipe({ transform: true })) payload: CreateUploadUrlPayload,
  ): Promise<{ url: string }> {
    try {
      this.logger.log(
        `Action: ${receivedMessages.createUploadUrl}. Payload: ${JSON.stringify(payload, null, 2)}`,
      );

      const data: CreateUploadUrlCacheData = {
        user_id: payload.user_id,
        action: payload.action,
      };

      if (payload.bucket) data.bucket = payload.bucket;

      const key = nanoid(10);

      this.cache.set(key, JSON.stringify(data), 30000);
      let route: string;

      switch (payload.action) {
        case 'upload_file': {
          route = 'files';
          break;
        }
        case 'upload_image': {
          route = 'image';
          break;
        }
        case 'upload_video': {
          route = 'video';
          break;
        }
      }

      const url = this.config.get('BASE_URL') + `/storage/${route}/${key}`;

      this.logger.log(`File upload URL generated [${url}].`);

      return { url };
    } catch (err) {
      this.logger.error('Create upload url error.', err);

      throw new RpcException('Create upload url error.');
    }
  }

  @UseFilters(new RpcValidationFilter())
  @MessagePattern(receivedMessages.deleteObjects)
  @ApiExcludeEndpoint()
  async deleteObjects(
    @Payload(new ValidationPipe({ transform: true })) payload: DeleteObjectsPayload,
  ): Promise<{ status: string }> {
    try {
      this.logger.log(
        `Action: ${receivedMessages.deleteObjects}. Payload: ${JSON.stringify(payload, null, 2)}`,
      );

      await this.minioService.deleteObjects(payload.objects);

      return { status: 'ok' };
    } catch (err) {
      this.logger.error(`Delete objects error [${payload.objects.join(', ')}].`, err);

      throw new RpcException('Delete objects error.');
    }
  }

  @UseFilters(new RpcValidationFilter())
  @MessagePattern(receivedMessages.removeTemproraryTag)
  @ApiExcludeEndpoint()
  async removeTemporaryTag(
    @Payload(new ValidationPipe({ transform: true })) payload: RemoveTemporaryTagPayload,
  ): Promise<{ status: string }> {
    const processedObjects: string[] = [];

    try {
      this.logger.log(
        `Action: ${receivedMessages.removeTemproraryTag}. Payload: ${JSON.stringify(
          payload,
          null,
          2,
        )}`,
      );

      for (const object of payload.objects) {
        const isRemoved = await this.minioService.removeTemporaryTag(object);

        if (!isRemoved) {
          throw new Error('Tag not removed.');
        }

        processedObjects.push(object);
      }

      return { status: 'ok' };
    } catch (err) {
      this.logger.error(
        `Remove temprorary tag for objects [${payload.objects.join(', ')}] error.`,
        err,
      );

      if (processedObjects.length) {
        const [err] = await to(
          Promise.all(processedObjects.map((o) => this.minioService.setTemporaryTag(o))),
        );

        if (err) {
          this.logger.error(
            `🔴 Error when restore temporary tag to objects: [${processedObjects.join(', ')}]`,
          );
        }

        this.logger.log('Processed objects successfully restored.');
      }

      throw new RpcException('Remove temporary tag error.');
    }
  }

  @Post('tasks')
  @ApiExcludeEndpoint()
  getTasks(@Body() args: GetTasksDto): Promise<Task[]> {
    try {
      return this.prisma.task.findMany({
        where: {
          action: { in: args.actions },
          actor: { in: args.actors?.map(a => String(a)) },
          originalname: { in: args.originalnames },
          status: { in: args.statuses },
          id: { in: args.ids },
        },
      });
    } catch (err) {
      this.logger.error(
        `Get task error: ${err.message}. Parameters: ${JSON.stringify(args, null, 2)}.`,
        err?.stack,
      );

      throw new BadRequestException('Check your input.');
    }
  }
}
