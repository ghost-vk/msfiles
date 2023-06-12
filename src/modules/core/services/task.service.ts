import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { S3Object } from '@prisma/client';

import { FileActionsEnum, TaskStatusEnum } from '../../config/actions';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TaskService implements OnModuleInit {
  private readonly logger = new Logger(TaskService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.setErrorStatusToActiveTasks();
  }

  /**
   * Method set status error to active task,
   * if microservice is shut down, task will be interrupted,
   * so there is need to mark it as error.
   */
  async setErrorStatusToActiveTasks(options: { action?: FileActionsEnum } = {}): Promise<void> {
    try {
      const res = await this.prisma.task.updateMany({
        where: {
          status: TaskStatusEnum.InProgress,
          action: options.action ? options.action : undefined,
        },
        data: { status: TaskStatusEnum.Error, error_message: 'Task stopped on server restart.' },
      });

      this.logger.log(`${res.count} tasks mark failed.`);
    } catch (err) {
      this.logger.error(`Error occured when try to set failed task status.`);
    }
  }

  async getTaskObjects(taskId: number): Promise<S3Object[]> {
    await this.prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: { id: true } });

    return this.prisma.s3Object.findMany({ where: { task_id: taskId }, distinct: ['objectname'] });
  }
}
