import { CacheModule as NestCacheModule, Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as redisStore from 'cache-manager-redis-store';

import { AppConfig } from '../config/types';

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      useFactory: async (configService: ConfigService<AppConfig, true>) => ({
        isGlobal: true,
        extraProviders: [],
        store: redisStore,
        host: configService.get('REDIS_HOST'),
        port: configService.get('REDIS_PORT'),
        password: configService.get('REDIS_PASSWORD'),
      }),
      inject: [ConfigService],
    }),
  ],
  exports: [NestCacheModule],
})
export class CacheModule {}
