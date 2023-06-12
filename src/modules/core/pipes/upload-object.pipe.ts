import { CACHE_MANAGER, Inject, Logger, PipeTransform } from '@nestjs/common';
import { Cache } from 'cache-manager';

import { CreateUploadUrlCacheData, isCreateUploadUrlCacheData } from '../types';

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
      this.logger.error('Cache payload type is wrong.');

      throw new Error('Cache payload type is wrong.');
    }

    const payload = JSON.parse(savedKeyData);

    if (!isCreateUploadUrlCacheData(payload)) {
      this.logger.error(`Cache payload type is wrong. Cached payload: ${JSON.stringify(payload, null, 2)}.`);

      throw new Error(`Cache payload type is wrong.`);
    }

    return payload;
  }
}
