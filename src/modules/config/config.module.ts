import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

import { loadConfig, validationEnvSchema } from './functions';

@Module({
  imports: [
    NestConfigModule.forRoot({
      load: [loadConfig],
      isGlobal: true,
      cache: true,
      validationSchema: validationEnvSchema,
    }),
  ],
})
export class ConfigModule {}
