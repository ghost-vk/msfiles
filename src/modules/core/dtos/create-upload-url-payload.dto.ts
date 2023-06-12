import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

import { FileActionsEnum } from '../../config/actions';
import { splitByComma } from '../../config/utils';

export class CreateUploadUrlPayload {
  @IsNotEmpty()
  @IsString()
  @IsIn(Object.values(FileActionsEnum))
  action: FileActionsEnum;

  @IsIn(
    (process.env.MINIO_ADDITIONAL_BUCKETS ? splitByComma(process.env.MINIO_ADDITIONAL_BUCKETS) : []).concat(
      process.env.MINIO_BUCKET as string,
    ),
  )
  @IsOptional()
  bucket?: string;

  @IsUUID()
  uid: string;
}
