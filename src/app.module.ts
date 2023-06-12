import { CacheModule, Module } from '@nestjs/common';

import { ConfigModule } from './modules/config/config.module';
import { CoreModule } from './modules/core/core.module';
import { LoggerModule } from './modules/logger/logger.module';
import { PrismaModule } from './modules/prisma/prisma.module';

@Module({
  imports: [ConfigModule, LoggerModule, PrismaModule, CoreModule, CacheModule.register({ ttl: 600, isGlobal: true })],
})
export class AppModule {}
