import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { AppConfig } from './modules/config/types';
import { validationPipe } from './validation.pipe';

(async function (): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);

  app.useLogger(config.get('LOGGER_BOOL') ? config.get('LOGGER_LEVELS_ARRAY') : false);
  app.useGlobalPipes(validationPipe);

  if (config.get('CORS_ORIGINS_ARRAY')) {
    if (config.get('CORS_ORIGINS_ARRAY')[0] === '*') {
      app.enableCors();
    } else {
      app.enableCors({ origin: config.get('CORS_ORIGINS_ARRAY') });
    }
  }

  const port = config.get('APPLICATION_PORT');

  if (config.get('APPLICATION_PREFIX')) {
    app.setGlobalPrefix(config.get('APPLICATION_PREFIX'));
  }

  if (config.get('IS_SWAGGER_ENABLED_BOOL')) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('msfiles API')
      .setDescription('Сервис конвертации и загрузки файлов в Minio')

    if (config.get('APPLICATION_PREFIX')) {
      swaggerConfig.setBasePath(config.get('APPLICATION_PREFIX'));
    }

    const openAPIObject = swaggerConfig.build();

    const document = SwaggerModule.createDocument(app, openAPIObject);

    SwaggerModule.setup((config.get('APPLICATION_PREFIX') ?? '') + '/openapi', app, document);
  }

  await app.listen(port, () => console.log(`⚡️ Application started on port ${port}...`));
})();
