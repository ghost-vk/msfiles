import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { AppConfig } from './modules/config/types';
import { validationPipe } from './validation.pipe';

(async function (): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);

  app.useLogger(config.get('LOGGER_BOOL') ? config.get('LOGGER_LEVELS_ARRAY') : false);
  app.useGlobalPipes(validationPipe);

  const logger = app.get<Logger>(Logger);
  const port = config.get('APPLICATION_PORT');

  if (config.get('IS_SWAGGER_ENABLED_BOOL')) {
    const swaggerConfig = new DocumentBuilder().setTitle('msfiles').build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);

    SwaggerModule.setup('openapi', app, document);
  }

  await app.listen(port);
  logger.log(`⚡️ Application started on port ${port}...`);
})();
