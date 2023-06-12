import { HttpServer, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { AppModule } from '../../src/app.module';
import { AppConfig } from '../../src/modules/config/types';
import { PrismaService } from '../../src/modules/prisma/prisma.service';
import { ConsoleLogger } from './logger';

/**
 * A cocktail of environment variables which should be sufficient for most tests. Do not modify - extend instead.
 */
export interface TestConfig {
  app: INestApplication;
  server: HttpServer;
  prisma: PrismaService;
  config: ConfigService<AppConfig, true>;
}

/**
 * Purpose : Setup testing environment and return context
 *
 * @returns { TestConfig }
 */
export async function setup(): Promise<TestConfig> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app: INestApplication = moduleFixture.createNestApplication();

  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);

  app.useLogger(new ConsoleLogger());

  await app.init();

  const prisma = app.get(PrismaService);

  await prisma.task.deleteMany();
  await prisma.s3Object.deleteMany();

  const server = app.getHttpServer();

  return {
    app,
    server,
    prisma,
    config,
  };
}
