import { Injectable } from '@nestjs/common';
import { readFile } from 'fs/promises';
import sharp, { Sharp } from 'sharp';

import { Size } from '../types';
import { FFprobeService } from './ffprobe.service';

@Injectable()
export class SizeDetectorService {
  constructor(private readonly ffprobeService: FFprobeService) {}

  getVideoSize(videoPath: string): Promise<Size> {
    return this.ffprobeService.getVideoDimensions(videoPath);
  }

  async getImageSize(image: Sharp | Buffer | string): Promise<Partial<Size>> {
    const sharpObj =
      image instanceof Buffer ? sharp(image) : typeof image === 'string' ? sharp(await readFile(image)) : image;

    const { width, height } = await sharpObj.metadata();

    sharpObj.destroy();

    return { width, height };
  }
}
