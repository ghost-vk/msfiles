import { ApiHideProperty } from '@nestjs/swagger';
import { Task as PrismaTask } from '@prisma/client';
import { Exclude } from 'class-transformer';

import { FileActionsEnum, isFileAction, isTaskStatus, TaskStatusEnum } from '../../config/actions';

export class Task {
  id: number;
  status: TaskStatusEnum;
  action: FileActionsEnum;
  originalname: string;
  objectname?: string | null;
  bucket: string;
  parameters: string | null;
  @Exclude()
  @ApiHideProperty()
  error_message: string | null;
  created_at: Date;
  updated_at: Date;

  constructor(partial: Partial<PrismaTask>) {
    if (partial.action && !isFileAction(partial.action)) {
      throw Error(
        `Unavailable action [${partial.action}] for Task model. Available action values: [${Object.values(
          FileActionsEnum,
        ).join(', ')}].`,
      );
    }

    if (partial.status && !isTaskStatus(partial.status)) {
      throw Error(
        `Unavailable status [${partial.status}] for Task model. Available status values: [${Object.values(
          TaskStatusEnum,
        ).join(', ')}].`,
      );
    }

    Object.assign(this, partial);
  }
}
