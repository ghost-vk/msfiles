import { RabbitPayload, RabbitRPC, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { CACHE_MANAGER, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cache } from 'cache-manager';
import { nanoid } from 'nanoid';

import { validationPipe } from '../../../validation.pipe';
import { FileActionsEnum } from '../../config/actions';
import { AppConfig } from '../../config/types';
import { CreateUploadUrlPayload } from '../dtos/create-upload-url-payload.dto';
import { DeleteObjectsPayload } from '../dtos/delete-objects-payload.dto';
import { GetFilesSizeByTaskDto } from '../dtos/get-files-size-by-task.dto';
import { RemoveTemporaryTagPayload } from '../dtos/remove-temporary-tag-payload.dto';
import { CreateUploadUrlCacheData } from '../types';
import { MinioService } from './minio.service';
import { TaskService } from './task.service';
import { TempTagRemoverService } from './temp-tag-remover.service';

export type GetFilesSizeByTaskResult = {
  total: string;
};

@Injectable()
export class RmqMsgHandlerService {
  private readonly logger = new Logger(RmqMsgHandlerService.name);

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly minioService: MinioService,
    private readonly taskService: TaskService,
    private readonly tempTagRemover: TempTagRemoverService,
  ) {}

  @RabbitRPC({
    exchange: 'file_conversions',
    queue: 'create_upload_url_queue',
    routingKey: 'create_upload_url',
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

      const url = this.config.get('BASE_URL') + `/storage/${route}/${key}`;

      this.logger.log(`File upload URL generated [${url}].`);

      return { url };
    } catch (err) {
      this.logger.error('Create upload url error.', err);

      throw new Error('Create upload url error.');
    }
  }

  @RabbitSubscribe({
    exchange: 'file_conversions',
    queue: 'delete_objects_queue',
    routingKey: 'delete_objects',
  })
  async deleteObjects(@RabbitPayload(validationPipe) payload: DeleteObjectsPayload): Promise<void> {
    try {
      this.logger.log(`Action: [delete_objects]. Payload: ${JSON.stringify(payload, null, 2)}.`);

      await this.minioService.deleteObjects({
        bucket: payload.bucket,
        objectnames: payload.objects,
        taskIds: payload.taskIds,
      });
    } catch (err) {
      throw new Error('Delete objects error.');
    }
  }

  @RabbitRPC({
    exchange: 'file_conversions',
    queue: 'remove_temporary_tag_queue',
    routingKey: 'remove_temporary_tag',
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
    exchange: 'file_conversions',
    queue: 'get_files_size_queue',
    routingKey: 'get_file_size',
  })
  async getFilesSizeByTask(@RabbitPayload() payload: GetFilesSizeByTaskDto): Promise<GetFilesSizeByTaskResult> {
    this.logger.log(`Action: [get_file_size].`);
    this.logger.debug(`${JSON.stringify(payload, null, 2)}`);
    const objs = await this.taskService.getTaskObjects(payload.taskId);
    const total = objs.reduce((acc, obj) => acc + (obj.size ? BigInt(obj.size) : BigInt(0)), BigInt(0));

    return { total: total.toString() };
  }
}
