import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { flatten } from 'lodash';

/**
 * For internal usage
 */
export class GetObjectUrlDto {
  @IsString()
  @IsNotEmpty()
  objectname: string;

  @IsOptional()
  @IsIn(
    flatten([
      process.env.MINIO_BUCKET,
      process.env.MINIO_ADDITIONAL_BUCKETS ? process.env.MINIO_ADDITIONAL_BUCKETS.split(',') : [],
    ]),
  )
  bucket?: string;
}
