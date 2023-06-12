import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { TaskStatusEnum } from '../config/actions';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Guard class checks number of concurrently active tasks.
 */
@Injectable()
export class ConcurrencyUploadGuard implements CanActivate {
  private readonly logger = new Logger(ConcurrencyUploadGuard.name);
  private readonly maxConcurrentTask = 5;

  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requestedAction = this.reflector.get('action', context.getHandler());

    if (!requestedAction) {
      this.logger.warn(
        'Decorator @ConcurrencyUploadGuard is used but requested action not found. Pass it with decorator @RequestedAction.',
      );

      return true;
    }

    const userActiveTaskCount = await this.prisma.task.count({
      where: {
        action: requestedAction,
        status: TaskStatusEnum.InProgress,
      },
    });

    if (userActiveTaskCount > this.maxConcurrentTask) {
      this.logger.warn(`Request to make more than max concurrently tasks [${this.maxConcurrentTask}].`);

      throw new ForbiddenException(`Service is overloaded.`);
    }

    return true;
  }
}
