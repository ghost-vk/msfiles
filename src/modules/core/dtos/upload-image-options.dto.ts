import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsPositive, Max, Min } from 'class-validator';

import { ImageExtensionEnum } from '../types';

export class UploadImageOptionsDto {
  /**
   * Quality of target image in range [1, 100]. Default: 80.
   */
  @Transform(({ value }) => +value)
  @Min(0)
  @Max(100)
  @IsInt()
  @IsOptional()
  q?: number;

  @IsIn(Object.values(ImageExtensionEnum))
  @IsOptional()
  ext?: ImageExtensionEnum;

  /**
   * Target image width in pixels.
   */
  @Transform(({ value }) => +value)
  @IsInt()
  @IsPositive()
  @IsOptional()
  w?: number;

  /**
   * Target image height in pixels.
   */
  @Transform(({ value }) => +value)
  @IsInt()
  @IsOptional()
  @IsPositive()
  h?: number;

  /**
   * Should convert source file or raw upload. Even if you don't need to convert (convert=false),
   * thumbnails will be created _(only if env variable THUMBNAIL_SIZES are set)_.
   *
   * By default conversion is enabled.
   */
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  @IsOptional()
  convert?: boolean;

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
