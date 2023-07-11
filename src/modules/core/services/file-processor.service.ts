import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import to from 'await-to-js';
import { extname, join } from 'path';
import { Subject } from 'rxjs';

import { sleep } from '../../../utils/sleep';
import { FileActionsEnum, TaskStatusEnum } from '../../config/actions';
import { RMQ_CONSUMER_EXCHANGE } from '../../config/constants';
import { PrismaService } from '../../prisma/prisma.service';
import { FileProcessorException } from '../exceptions/file-processor.exception';
import { FileProcessorExceptionHandler } from '../exceptions/file-processor.exception-handler';
import { FileTypeEnum, isImageExtension, isVideoExtension } from '../types';
import { MsgFileUpload, MsgTaskCompleted } from '../types/queue-payloads';
import { FilenameService } from './filename.service';
import { ImageProcessorService } from './image-processor.service';
import { MinioService } from './minio.service';
import { TempTagRemoverService } from './temp-tag-remover.service';
import { VideoProcessorService } from './video-processor.service';

export type FileProcessPayload = {
  originalname: string;
  dir: string;
  filename: string;
  task_id: number;
  bucket?: string;
  uid: string;
};

@Injectable()
export class FileProcessorService implements OnModuleInit {
  public readonly fileProcessorSubj$ = new Subject<FileProcessPayload>();
  private readonly logger = new Logger(FileProcessorService.name);

  constructor(
    private readonly imageProcessor: ImageProcessorService,
    private readonly videoProcessor: VideoProcessorService,
    private readonly filenameService: FilenameService,
    private readonly minioService: MinioService,
    private readonly prisma: PrismaService,
    private readonly tempTagRemover: TempTagRemoverService,
    private readonly amqpConnection: AmqpConnection,
    private readonly fileProcessorExceptionHandler: FileProcessorExceptionHandler,
  ) {}

  onModuleInit(): void {
    this.fileProcessorSubj$.subscribe(async (event: FileProcessPayload) => {
      this.logger.log(`Got file upload event: ${JSON.stringify(event, null, 2)}.`);
      const [err] = await to(this.process(event));

      if (err) {
        this.logger.error(`Error upload file [${event.originalname}].`);
      } else {
        this.logger.log(`Finish process file [${event.originalname}].`);
      }
    });
  }

  async process(input: FileProcessPayload): Promise<void> {
    try {
      const ext = extname(input.originalname);

      let task = await this.prisma.task.findUniqueOrThrow({ where: { id: input.task_id } });

      if (isImageExtension(ext)) {
        this.logger.log(`Detected image file, delegate to image processor.`);

        this.imageProcessor.imageConversion$.next({
          ...input,
          ext,
          convert: false,
        });

        return;
      }

      if (isVideoExtension(ext)) {
        this.logger.log(`Detected video file, delegate to video processor.`);

        this.videoProcessor.videoConversion$.next({
          ...input,
          ext,
          convert: false,
        });

        return;
      }

      const objname = this.filenameService.generateFilename(input.originalname, {
        ext,
        type: FileTypeEnum.MainFile,
      });

      const obj = await this.minioService.saveFile(join(input.dir, input.filename), {
        filename: objname,
        bucket: input.bucket,
        temporary: true,
      });

      await this.prisma.s3Object.create({
        data: {
          objectname: obj.objectname,
          size: String(obj.size),
          task_id: input.task_id,
          bucket: obj.bucket,
          main: true,
        },
      });

      await this.amqpConnection.publish<MsgFileUpload>(RMQ_CONSUMER_EXCHANGE, 'uploaded_file', {
        action: task.action as FileActionsEnum,
        status: task.status as TaskStatusEnum,
        objectname: obj.objectname,
        originalname: input.originalname,
        size: obj.size,
        type: FileTypeEnum.MainFile,
        bucket: obj.bucket,
        task_id: input.task_id,
        created_at: task.created_at,
        metadata: obj.metadata,
        uid: input.uid,
      });

      this.logger.log(`Send message [uploaded_file] to exchange [${RMQ_CONSUMER_EXCHANGE}].`);

      task = await this.prisma.task.update({
        where: { id: input.task_id },
        data: { status: TaskStatusEnum.Done },
      });

      await sleep(1000);

      await this.amqpConnection.publish<MsgTaskCompleted>(RMQ_CONSUMER_EXCHANGE, 'task_completed', {
        task_id: input.task_id,
        uid: input.uid,
        status: task.status as TaskStatusEnum,
        action: task.action as FileActionsEnum,
      });

      this.logger.log(`Send message [task_completed] to exchange [${RMQ_CONSUMER_EXCHANGE}].`);
    } catch (e) {
      this.logger.error(`Process file error. ${e}.`);

      await this.fileProcessorExceptionHandler.handle(
        new FileProcessorException('Process file error.', {
          folderToDelete: input.dir,
          taskId: input.task_id,
        }),
      );
    }
  }
}
