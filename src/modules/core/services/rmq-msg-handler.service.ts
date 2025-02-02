import { defaultNackErrorHandler, RabbitPayload, RabbitRPC, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { CACHE_MANAGER, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cache } from 'cache-manager';
import { nanoid } from 'nanoid';
import { Subject } from 'rxjs';

import { validationPipe } from '../../../validation.pipe';
import { FileActionsEnum } from '../../config/actions';
import { RMQ_MSFILES_EXCHANGE } from '../../config/constants';
import { AppConfig } from '../../config/types';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUploadUrlPayload } from '../dtos/create-upload-url-payload.dto';
import { DeleteObjectsPayload } from '../dtos/delete-objects-payload.dto';
import { GetFilesSizeByTaskDto } from '../dtos/get-files-size-by-task.dto';
import { RemoveTemporaryTagPayload } from '../dtos/remove-temporary-tag-payload.dto';
import { UploadResPayload } from '../dtos/upload-res.dto';
import { CreateUploadUrlCacheData } from '../types';
import { MinioService } from './minio.service';
import { TaskService } from './task.service';
import { TempTagRemoverService } from './temp-tag-remover.service';

export type GetFilesSizeByTaskResult = {
  total: string;
};

export type UploadResSubjPayload = UploadResPayload & { taskId: number };

@Injectable()
export class RmqMsgHandlerService {
  private readonly logger = new Logger(RmqMsgHandlerService.name);
  public readonly uploadResSubj$ = new Subject<UploadResSubjPayload>();

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly minioService: MinioService,
    private readonly taskService: TaskService,
    private readonly tempTagRemover: TempTagRemoverService,
    private readonly prisma: PrismaService,
  ) {}

  @RabbitRPC({
    exchange: RMQ_MSFILES_EXCHANGE,
    queue: 'create_upload_url_queue',
    routingKey: 'create_upload_url',
    errorHandler: defaultNackErrorHandler,
  })
  async createUploadUrl(@RabbitPayload(validationPipe) payload: CreateUploadUrlPayload): Promise<{ url: string }> {
    try {
      this.logger.log(`Action: [create_upload_url]. Payload: ${JSON.stringify(payload, null, 2)}.`);

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

      this.logger.log(`File upload URL generated [${url}].`);

      return { url };
    } catch (err) {
      this.logger.error('Create upload url error.', err);

      throw new Error('Create upload url error.');
    }
  }

  @RabbitSubscribe({
    exchange: RMQ_MSFILES_EXCHANGE,
    queue: 'delete_objects_queue',
    routingKey: 'delete_objects',
    errorHandler: defaultNackErrorHandler,
  })
  async deleteObjects(@RabbitPayload(validationPipe) payload: DeleteObjectsPayload): Promise<void> {
    try {
      this.logger.log(`Action: [delete_objects]. Payload: ${JSON.stringify(payload, null, 2)}.`);

      await this.minioService.deleteObjects({
        bucket: payload.bucket,
        objectnames: payload.objects,
        taskUids: payload.taskUids,
      });
    } catch (err) {
      this.logger.error('Delete objects error.', err);

      throw new Error('Delete objects error.');
    }
  }

  @RabbitRPC({
    exchange: RMQ_MSFILES_EXCHANGE,
    queue: 'remove_temporary_tag_queue',
    routingKey: 'remove_temporary_tag',
    errorHandler: defaultNackErrorHandler,
  })
  async removeTemporaryTag(@RabbitPayload(validationPipe) payload: RemoveTemporaryTagPayload): Promise<void> {
    let objs: string[] = [];

    try {
      this.logger.log(`Action: [remove_temporary_tag]. Payload: ${JSON.stringify(payload, null, 2)}`);

      const taskObjs = payload.taskId
        ? (await this.taskService.getTaskObjects(payload.taskId)).map((obj) => obj.objectname)
        : [];

      this.logger.debug(`Get objects by task ID: [${taskObjs.join(', ')}].`);

      const payloadObjs = payload.objects ?? [];

      objs = taskObjs.concat(...payloadObjs);

      this.tempTagRemover.tempTagRemoverSubj$.next({
        bucket: payload.bucket ?? this.minioService.bucket,
        objectnames: objs,
      });
    } catch (err) {
      this.logger.error(`🔴 Remove temporary tag for objects [${objs.join(', ')}] error.`, err);

      throw new Error('Remove temporary tag error.');
    }
  }

  @RabbitRPC({
    exchange: RMQ_MSFILES_EXCHANGE,
    queue: 'get_files_size_queue',
    routingKey: 'get_file_size',
    errorHandler: defaultNackErrorHandler,
  })
  async getFilesSizeByTask(@RabbitPayload() payload: GetFilesSizeByTaskDto): Promise<GetFilesSizeByTaskResult> {
    this.logger.log(`Action: [get_file_size].`);
    this.logger.debug(`${JSON.stringify(payload, null, 2)}`);
    const objs = await this.taskService.getTaskObjects(payload.taskId);
    const total = objs.reduce((acc, obj) => acc + (obj.size ? BigInt(obj.size) : BigInt(0)), BigInt(0));

    return { total: total.toString() };
  }

  @RabbitRPC({
    exchange: RMQ_MSFILES_EXCHANGE,
    queue: 'upload_res_queue',
    routingKey: 'consumer_saved_result',
    errorHandler: defaultNackErrorHandler,
  })
  async handleUploadResponse(@RabbitPayload() payload: UploadResPayload): Promise<void> {
    this.logger.log(`Action: [consumer_saved_result].`);
    this.logger.debug(`${JSON.stringify(payload, null, 2)}`);

    const task = await this.prisma.task.findFirst({ where: { uid: payload.uid }, select: { id: true } });

    if (!task) {
      this.logger.warn('Got message [consumer_saved_result] but msfiles task not found.');

      return;
    }

    this.logger.log(`Consumer has confirmed the saving of the file of task [${task.id}].`);

    this.uploadResSubj$.next({ ...payload, taskId: task.id });
  }
}
