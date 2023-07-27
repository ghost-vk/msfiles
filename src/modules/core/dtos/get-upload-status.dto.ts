import { IsInt, IsUUID, ValidateIf } from 'class-validator';

export class GetUploadStatusDto {
  @ValidateIf((o: GetUploadStatusDto) => !o.taskId)
  @IsUUID()
  taskUid?: string;

  @ValidateIf((o: GetUploadStatusDto) => !o.taskUid)
  @IsInt()
  taskId?: number;
}
