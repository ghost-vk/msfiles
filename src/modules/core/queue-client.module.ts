import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy, ClientProxyFactory, Transport } from '@nestjs/microservices';

import { MS_CORE_CLIENT } from '../config/constants';
import { AppConfig } from '../config/types';

@Global()
@Module({
  providers: [
    {
      provide: MS_CORE_CLIENT,
      useFactory: (config: ConfigService<AppConfig, true>): ClientProxy => {
        const user = config.get('RABBITMQ_USER');
        const password = config.get('RABBITMQ_PASSWORD');
        const host = config.get('RABBITMQ_HOST');
        const port = config.get('RABBITMQ_PORT');
        const queueName = config.get('RABBITMQ_QUEUE_CORE');

        return ClientProxyFactory.create({
          transport: Transport.RMQ,
          options: {
            urls: [`amqp://${user}:${password}@${host}:${port}`],
            queue: queueName,
            queueOptions: {
              durable: true,
            },
          },
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [MS_CORE_CLIENT],
})
export class QueueClientModule {}
