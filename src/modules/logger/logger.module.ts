import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { stdTimeFunctions } from 'pino';

import { AppConfig } from '../config/types';
import { preparePinoMultistream } from './functions';

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      useFactory: async (configService: ConfigService<AppConfig, true>) => ({
        pinoHttp: [
          {
            level: configService.get('LOGGER_BOOL')
              ? configService.get('PINO_LOGGER_LEVEL')
              : 'silent',
            redact: ['req.headers.cookie', 'req.headers.authorization'],
            timestamp: stdTimeFunctions.isoTime,
          },
          preparePinoMultistream(configService.get('LOGGER_BOOL')),
        ],
      }),
      inject: [ConfigService],
    }),
  ],
})
export class LoggerModule {}
