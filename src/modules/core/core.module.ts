import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RMQ_MSFILES_EXCHANGE } from '../config/constants';
import { PrismaService } from '../prisma/prisma.service';
import { InternalRestController } from './controllers/internal-rest.controller';
import { StorageController } from './controllers/storage.controller';
import { FileProcessorExceptionHandler } from './exceptions/file-processor.exception-handler';
import { ImageProcessorExceptionHandler } from './exceptions/image-processor.exception-handler';
import { VideoProcessorExceptionHandler } from './exceptions/video-processor.exception-handler';
import { FFmpegService } from './services/ffmpeg.service';
import { FFprobeService } from './services/ffprobe.service';
import { FileProcessorService } from './services/file-processor.service';
import { FilenameService } from './services/filename.service';
import { ImageConverterService } from './services/image-converter.service';
import { ImageProcessorService } from './services/image-processor.service';
import { ImageSaverService } from './services/image-saver.service';
import { MinioService } from './services/minio.service';
import { RmqMsgHandlerService } from './services/rmq-msg-handler.service';
import { SizeDetectorService } from './services/size-detector.service';
import { TaskService } from './services/task.service';
import { TempFilesCollectorService } from './services/temp-files-collector.service';
import { TempTagRemoverService } from './services/temp-tag-remover.service';
import { ThumbnailMakerService } from './services/thumbnail-maker.service';
import { VideoConverterService } from './services/video-converter.service';
import { VideoProcessorService } from './services/video-processor.service';

@Module({
  imports: [
    RabbitMQModule.forRootAsync(RabbitMQModule, {
      useFactory: (config: ConfigService) => {
        const user = config.get('RABBITMQ_USER');
        const password = config.get('RABBITMQ_PASSWORD');
        const host = config.get('RABBITMQ_HOST');
        const port = config.get('RABBITMQ_PORT');

        return {
          exchanges: [
            {
              name: RMQ_MSFILES_EXCHANGE,
              type: 'topic',
              createExchangeIfNotExists: true,
              options: {
                autoDelete: false,
                durable: true,
              },
            },
          ],
          uri: `amqp://${user}:${password}@${host}:${port}`,
          connectionInitOptions: { wait: false },
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [
    MinioService,
    FFmpegService,
    PrismaService,
    FFprobeService,
    FileProcessorService,
    FilenameService,
    ImageConverterService,
    ImageProcessorService,
    ImageSaverService,
    SizeDetectorService,
    TaskService,
    TempFilesCollectorService,
    TempTagRemoverService,
    ThumbnailMakerService,
    VideoConverterService,
    VideoProcessorService,
    ImageProcessorExceptionHandler,
    VideoProcessorExceptionHandler,
    FileProcessorExceptionHandler,
    RmqMsgHandlerService,
  ],
  controllers: [StorageController, InternalRestController],
})
export class CoreModule {}
