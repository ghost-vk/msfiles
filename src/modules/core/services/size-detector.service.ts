import { CACHE_MANAGER, Inject, Injectable } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { readFile } from 'fs/promises';
import sharp, { Sharp } from 'sharp';

import { Size } from '../types';
import { FFprobeService } from './ffprobe.service';

@Injectable()
export class SizeDetectorService {
  private readonly cacheKey = 'size_detector::';

  constructor(private readonly ffprobeService: FFprobeService, @Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async getVideoSize(videoPath: string): Promise<Size> {
    const sizeRaw = await this.cache.get(this.cacheKey + videoPath);

    if (sizeRaw && typeof sizeRaw === 'string') {
      return JSON.parse(sizeRaw) as Size;
    }

    const videoSize = await this.ffprobeService.getVideoDimensions(videoPath);

    await this.cache.set(this.cacheKey + videoPath, JSON.stringify(videoSize), 30000);

    return videoSize;
  }

  async getImageSize(image: Sharp | Buffer | string): Promise<Partial<Size>> {
    if (typeof image === 'string') {
      const sizeRaw = await this.cache.get(this.cacheKey + image);

      if (sizeRaw && typeof sizeRaw === 'string') {
        return JSON.parse(sizeRaw) as Partial<Size>;
      }
    }

    const sharpObj =
      image instanceof Buffer ? sharp(image) : typeof image === 'string' ? sharp(await readFile(image)) : image;

    const { width, height } = await sharpObj.metadata();

    sharpObj.destroy();

    if (typeof image === 'string') {
      await this.cache.set(this.cacheKey + image, JSON.stringify({ width, height }), 30000);
    }

    return { width, height };
  }
}
