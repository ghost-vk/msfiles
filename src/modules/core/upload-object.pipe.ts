import { CACHE_MANAGER, Inject, Logger, PipeTransform } from '@nestjs/common';
import { Cache } from 'cache-manager';

import { CreateUploadUrlCacheData } from './types';

export class UploadObjectDataPipe implements PipeTransform {
  private readonly logger = new Logger(UploadObjectDataPipe.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async transform(key: string): Promise<CreateUploadUrlCacheData> {
    const savedKeyData = await this.cache.get(key);

    if (!savedKeyData) {
      this.logger.error('Cache not found.');

      throw new Error('Cache not found.');
    }

    if (typeof savedKeyData !== 'string') {
      this.logger.error('Cache type is wrong.');

      throw new Error('Cache type is wrong.');
    }

    return JSON.parse(savedKeyData);
  }
}
