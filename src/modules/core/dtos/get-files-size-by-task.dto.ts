import { IsInt, IsOptional } from 'class-validator';

export class GetFilesSizeByTaskDto {
  @IsInt()
  @IsOptional()
  taskId: number;
}
