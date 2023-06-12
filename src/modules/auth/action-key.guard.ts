import {
  CACHE_MANAGER,
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Cache } from 'cache-manager';

import { CreateUploadUrlCacheData } from '../core/types';

/**
 * Guard function checks roles in user context.
 * Use it with {@link RequestedAction}.
 */
@Injectable()
export class ActionKeyGuard implements CanActivate {
  private readonly logger = new Logger(ActionKeyGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ctx = context.switchToHttp().getRequest();

    const key = ctx.params?.['key'];

    if (!key || typeof key !== 'string') return false;

    this.logger.log(`Try to use action key [${key}].`);

    const requestedAction = this.reflector.get('action', context.getHandler());

    const savedKeyData = await this.cache.get(key);

    if (typeof savedKeyData !== 'string') {
      this.logger.warn(`Create upload url cache data not found.`);

      return false;
    }

    const cacheData: CreateUploadUrlCacheData = JSON.parse(savedKeyData);

    if (!cacheData) {
      this.logger.error(`Wrong type of saved key in create upload url cache data [${cacheData}].`);

      return false;
    }

    if (cacheData.used) {
      this.logger.warn(`Cache key already used.`);

      return false;
    }

    if (cacheData.action !== requestedAction) {
      this.logger.warn(
        `Requested action not match saved: [${cacheData.action}], passed: [${requestedAction}].`,
      );

      return false;
    }

    const updatedCachedData: CreateUploadUrlCacheData = {
      ...cacheData,
      used: true,
    };

    await this.cache.set(key, JSON.stringify(updatedCachedData), 10000);

    return true;
  }
}
