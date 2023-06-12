import { Injectable, Logger } from '@nestjs/common';
import { mkdtemp } from 'fs/promises';
import { nanoid } from 'nanoid';
import { dirname, join } from 'path';

import { VideoExtensionEnum } from '../types';
import { FFmpegService } from './ffmpeg.service';

export type ConvertVideoOptions = {
  ext: VideoExtensionEnum;
  convert: boolean;
  width?: number;
  height?: number;
};

@Injectable()
export class VideoConverterService {
  private  readonly  logger = new Logger(VideoConverterService.name)
  constructor(private readonly ffmpeg: FFmpegService) {}

  public async convertVideo(
    filepath: string,
    options: ConvertVideoOptions = { ext: VideoExtensionEnum.Mp4, convert: true },
  ): Promise<string> {
    const outputDir = await mkdtemp(join(dirname(filepath), 'cv_' + nanoid(5)));
    const outputPath = outputDir + nanoid(21) + '.' + options.ext;

    switch (options.ext) {
      case VideoExtensionEnum.Mp4: {
        this.logger.log(`Convert video to [mp4].`);
        await this.ffmpeg.mp4(filepath, outputPath, { width: options.width, height: options.height });
        break;
      }
      case VideoExtensionEnum.Hls: {
        this.logger.log(`Convert video to [hls].`);
        await this.ffmpeg.m3u8(filepath, outputPath, { width: options.width, height: options.height });
        break;
      }
      case VideoExtensionEnum.Webm: {
        this.logger.log(`Convert video to [webm].`);
        await this.ffmpeg.webm(filepath, outputPath, { width: options.width, height: options.height });
        break;
      }
      default: {
        break;
      }
    }

    return outputPath;
  }

  public async getFrame(filepath: string, options: { frame: number } = { frame: 1 }): Promise<string> {
    const outputDir = await mkdtemp(join(dirname(filepath), 'cv_' + nanoid(5)));
    const outputFilepath = join(outputDir, nanoid(5) + '.jpeg');

    await this.ffmpeg.getFrame(filepath, outputFilepath, options.frame);

    return outputFilepath;
  }
}
