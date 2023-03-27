import { Module } from '@nestjs/common';

import { PrismaService } from '../../services/prisma.service';
import { ExternalController } from './external.controller';
import { FFmpegService } from './ffmpeg.service';
import { FilesService } from './files.service';
import { InternalController } from './internal.controller';
import { MinioService } from './minio.service';

@Module({
  providers: [MinioService, FilesService, FFmpegService, PrismaService],
  controllers: [ExternalController, InternalController],
})
export class CoreModule {}
