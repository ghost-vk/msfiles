import { Transform } from 'class-transformer';
import { IsDivisibleBy, IsInt, IsPositive } from 'class-validator';

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
