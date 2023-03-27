import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsDivisibleBy,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { actions, taskStatus } from '../config/actions';
import { ImageExtensions, VideoExtensions } from './types';

export class UploadImageOptionsDto {
  /**
   * Quality of target image in range [1, 100]. Default: 80.
   */
  @IsOptional()
  @Min(0)
  @Max(100)
  @IsInt()
  q?: number;

  @IsIn(['png', 'jpeg', 'webp'])
  @IsOptional()
  ext?: ImageExtensions;

  /**
   * Target image width in pixels.
   */
  @IsInt()
  @IsOptional()
  @IsPositive()
  @Transform(({ value }) => Number(value))
  w?: number;

  /**
   * Target image height in pixels.
   */
  @IsInt()
  @IsOptional()
  @IsPositive()
  @Transform(({ value }) => Number(value))
  h?: number;
}

export class VideoSizeDto {
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
  }

  @IsInt()
  @IsDivisibleBy(2)
  @IsPositive()
  @Transform(({ value }) => Number(value))
  w: number;

  @IsInt()
  @IsDivisibleBy(2)
  @IsPositive()
  @Transform(({ value }) => Number(value))
  h: number;
}

export class UploadVideoOptionsDto {
  @IsIn(['y', 'yes', 'n', 'no', 'not'])
  @IsOptional()
  compress?: string;

  @IsIn(['webm', 'mp4', 'm3u8'])
  @IsOptional()
  ext?: VideoExtensions;

  /**
   * Array of target video sizes to conversion separated by comma.
   * Height and width should be divisible by 2.
   * @example '[1280x720,680x360]'
   */
  @IsArray()
  @ValidateNested({ each: true })
  @IsOptional()
  @Transform(
    ({ value }: { value: string | undefined }): VideoSizeDto[] => {
      if (!value) return [];

      if (!new RegExp(/\[|\]/g, '').test(value)) {
        throw new BadRequestException('Wrong input');
      }

      const sizes = value.replace(/\[|\]/g, '').split(',');

      if (!sizes.length) {
        throw new BadRequestException('Wrong input');
      }

      return sizes.map((s) => {
        const i = s.split('x');

        if (!i[0] || !i[1] || i.length !== 2) {
          throw new BadRequestException('Wrong input');
        }

        return new VideoSizeDto(+i[0], +i[1]);
      });
    },
    { toClassOnly: true },
  )
  @ApiPropertyOptional({ type: String })
  s?: VideoSizeDto[];
}

export class FileUploadDto {
  @ApiProperty({ type: 'string', format: 'binary' })
  file: unknown;
}

export class FilesUploadBodyDto {
  @ApiProperty({ type: 'array', items: { type: 'string', format: 'binary' } })
  files: unknown;
}

/**
 * For internal usage
 */
export class GetTasksDto {
  @IsArray()
  @IsIn([actions.uploadFile, actions.uploadImage, actions.uploadVideo], { each: true })
  @IsOptional()
  actions?: Array<(typeof actions)[keyof typeof actions]>;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  actors?: Array<string | number>;

  @IsOptional()
  originalnames?: string[];

  @IsArray()
  @IsIn([taskStatus.done, taskStatus.error, taskStatus.inProgress], { each: true })
  @IsOptional()
  statuses?: Array<(typeof taskStatus)[keyof typeof taskStatus]>;

  @IsInt()
  @IsOptional()
  ids?: number[]
}

export class GetMyTasksDto {
  @IsString()
  @IsIn([taskStatus.done, taskStatus.error, taskStatus.inProgress])
  @IsOptional()
  status?: string;

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
