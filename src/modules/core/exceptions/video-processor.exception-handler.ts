import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';

import { FileActionsEnum, TaskStatusEnum } from '../../config/actions';
import { PrismaService } from '../../prisma/prisma.service';
import { TempFilesCollectorService } from '../services/temp-files-collector.service';
import { MsgTaskError } from '../types/queue-payloads';
import { VideoProcessorException } from './video-processor.exception';

@Injectable()
export class VideoProcessorExceptionHandler {
  private readonly logger = new Logger(VideoProcessorExceptionHandler.name);

  constructor(
    private readonly tempFilesCollector: TempFilesCollectorService,
    private readonly prisma: PrismaService,
    private readonly amqpConnection: AmqpConnection,
  ) {}

  async handle(error: Error): Promise<never> {
    if (!(error instanceof VideoProcessorException)) throw error;

    this.logger.warn('Catch video processor error.', error);

    const task = await this.prisma.task.update({
      where: { id: error.taskId },
      data: { status: TaskStatusEnum.Error, error_message: error.message },
    });

    await this.amqpConnection.publish<MsgTaskError>('core', 'task_error', {
      task_id: task.id,
      action: task.action as FileActionsEnum,
      status: task.status as TaskStatusEnum,
      created_at: task.created_at,
      message: task.error_message ?? undefined,
      uid: task.uid,
    });

    this.logger.log(`Send message [task_error] to exchange [core].`);

    this.tempFilesCollector.tmpFilesCollectorSubj$.next({ dir: error.folderToDelete });

    throw error;
  }
}
