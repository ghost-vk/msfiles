import { Module } from '@nestjs/common';

import { PrismaService } from '../../services/prisma.service';
import { ExternalController } from './external.controller';
import { FFmpegService } from './ffmpeg.service';
import { FFprobeService } from './ffprobe.service';
import { FilesService } from './files.service';
import { ImageService } from './image.service';
import { InternalController } from './internal.controller';
import { MinioService } from './minio.service';
import { VideoService } from './video.service';

@Module({
  providers: [MinioService, FilesService, FFmpegService, PrismaService, VideoService, ImageService, FFprobeService],
  controllers: [ExternalController, InternalController],
})
export class CoreModule {}
