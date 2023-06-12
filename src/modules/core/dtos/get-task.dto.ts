import { IsArray, IsIn, IsInt, IsOptional } from 'class-validator';

import { FileActionsEnum, TaskStatusEnum } from '../../config/actions';

/**
 * For internal usage
 */
export class GetTasksDto {
  @IsArray()
  @IsIn(Object.values(FileActionsEnum), { each: true })
  @IsOptional()
  actions?: FileActionsEnum[];

  @IsOptional()
  originalnames?: string[];

  @IsArray()
  @IsIn(Object.values(TaskStatusEnum), { each: true })
  @IsOptional()
  statuses?: TaskStatusEnum[];

  @IsInt()
  @IsOptional()
  ids?: number[];
}
