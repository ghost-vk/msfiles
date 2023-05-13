import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { RmqOptions, Transport } from '@nestjs/microservices';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { AppConfig } from './modules/config/types';

(async function (): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);

  const rmq = {
    user: config.get('RABBITMQ_USER'),
    password: config.get('RABBITMQ_PASSWORD'),
    host: config.get('RABBITMQ_HOST'),
    port: config.get('RABBITMQ_PORT'),
    queue: config.get('RABBITMQ_QUEUE_MSFILES'),
  };

  const ms = app.connectMicroservice<RmqOptions>({
    transport: Transport.RMQ,
    options: {
      urls: ['amqp://' + rmq.user + ':' + rmq.password + '@' + rmq.host + ':' + rmq.port],
      queue: rmq.queue,
      queueOptions: {
        durable: true,
      },
    },
  });

  app.useLogger(config.get('LOGGER_BOOL') ? config.get('LOGGER_LEVELS_ARRAY') : false);
  app.useGlobalPipes(new ValidationPipe({ transform: true }));

  ms.useLogger(config.get('LOGGER_BOOL') ? config.get('LOGGER_LEVELS_ARRAY') : false);

  const logger = app.get<Logger>(Logger);
  const port = config.get('APPLICATION_PORT');

  if (config.get('IS_SWAGGER_ENABLED_BOOL')) {
    const swaggerConfig = new DocumentBuilder().setTitle('msfiles').addBearerAuth().build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);

    SwaggerModule.setup('openapi', app, document);
  }

  await app.startAllMicroservices();

  await app.listen(port);
  logger.log(`⚡️ Application started successfully on port ${port}`);
})();
