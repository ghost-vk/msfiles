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

  public async getTaskFilesTotalSize(taskId: string | number): Promise<bigint> {
    const uid = typeof taskId === 'string' ? taskId : undefined;
    const id = typeof taskId === 'number' ? taskId : undefined;

    const task = await this.prisma.task.findFirstOrThrow({ where: { uid, id }, select: { id: true } });
    const objs = await this.prisma.s3Object.findMany({
      where: { task_id: task.id },
      distinct: ['objectname'],
      select: { id: true },
    });

    if (!objs.length) return BigInt(0);

    const res = await this.prisma.s3Object.aggregate({
      _sum: { size: true },
      where: { task_id: task.id },
    });

    this.logger.debug(`Calculate total size of task [${task.id}] files. Result: [${res._sum.size}].`);

    return res._sum.size ?? BigInt(0);
  }
}
