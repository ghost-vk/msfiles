import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

import { AppConfig } from '../config/types';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor(config: ConfigService<AppConfig, true>) {
    super({
      datasources: { db: { url: config.get('DATABASE_URL') } },
      log: config.get('LOGGER_BOOL') ? config.get('PRISMA_LOGGER_LEVELS_ARRAY') : [],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async enableShutdownHooks(app: INestApplication): Promise<void> {
    this.$on('beforeExit', async () => {
      await app.close();
    });
  }
}
