import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class UploadFileOptionsDto {
  /**
   * Upload file synchronously or asynchronously.
   * If asynchronously will place file at temp folder and return 201.
   * After that, processor will start converting and uploading the file to the S3 Minio.
   *
   * @default(false)
   */
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  @IsOptional()
  synchronously?: boolean;
}
