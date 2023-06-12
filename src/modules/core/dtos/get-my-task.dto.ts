import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

import { TaskStatusEnum } from '../../config/actions';

export class GetMyTasksDto {
  @IsString()
  @IsIn(Object.values(TaskStatusEnum))
  @IsOptional()
  status?: TaskStatusEnum;

  @IsInt()
  @IsPositive()
  @IsOptional()
  @Transform(({ value }) => Number(value))
  take?: number;

  @IsInt()
  @IsPositive()
  @IsOptional()
  @Transform(({ value }) => Number(value))
  skip?: number;
}
