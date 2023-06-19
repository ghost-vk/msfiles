import { BadRequestException } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsOptional, ValidateNested } from 'class-validator';

import { VideoExtensionEnum } from '../types';
import { VideoSizeDto } from './video-size.dto';

export class UploadVideoOptionsDto {
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  convert?: boolean;

  @IsIn(Object.values(VideoExtensionEnum))
  @IsOptional()
  ext?: VideoExtensionEnum;

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

      const errMsg = `Parameter [s] must be in format [<width1>x<height1>,<width2>x<height2>,etc.]. Example: [1280x720], [1280x720,680x360].`;

      if (!new RegExp(/\[|]/g, '').test(value)) {
        throw new BadRequestException([errMsg]);
      }

      const sizes = value.replace(/\[|]/g, '').split(',');

      if (!sizes.length) {
        throw new BadRequestException([errMsg]);
      }

      return sizes.map((s) => {
        const i = s.split('x');

        if (!i[0] || !i[1] || i.length !== 2) {
          throw new BadRequestException(errMsg);
        }

        return new VideoSizeDto(+i[0], +i[1]);
      });
    },
    { toClassOnly: true },
  )
  @ApiPropertyOptional({ type: String })
  s?: VideoSizeDto[];
}
