import { CacheModule, Module } from '@nestjs/common';

import { AuthModule } from './modules/auth/auth.module';
import { ConfigModule } from './modules/config/config.module';
import { CoreModule } from './modules/core/core.module';
import { QueueClientModule } from './modules/core/queue-client.module';
import { LoggerModule } from './modules/logger/logger.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    CoreModule,
    AuthModule,
    CacheModule.register({ ttl: 600, isGlobal: true }),
    QueueClientModule,
  ],
})
export class AppModule {}
