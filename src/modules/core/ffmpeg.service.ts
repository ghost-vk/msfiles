import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';

import { VideoSize } from './types';
import { getFileExtension } from './utils';

@Injectable()
export class FFmpegService {
  private readonly logger = new Logger(FFmpegService.name);

  public async mp4(
    inputPath: string,
    outputPath: string,
    options: Partial<VideoSize> = {},
  ): Promise<void> {
    if (getFileExtension(outputPath) !== 'mp4') {
      throw new Error('Wrong file extension');
    }

    let size: string[] = [];

    if (options.height && options.width) {
      size = ['-s', `${options.width}x${options.height}`];
    }

    await this.ffmpeg([
      '-i',
      inputPath,
      ...size,
      '-vcodec',
      'h264',
      '-preset',
      'medium',
      '-crf',
      '23',
      '-b:a',
      '128k',
      '-ac',
      '2',
      outputPath,
    ]);
  }

  public async m3u8(
    inputPath: string,
    outputPath: string,
    options: Partial<VideoSize> = {},
  ): Promise<void> {
    if (getFileExtension(outputPath) !== 'm3u8') {
      throw new Error('Wrong file extension');
    }

    let size: string[] = [];

    if (options.height && options.width) {
      size = ['-s', `${options.width}x${options.height}`];
    }

    await this.ffmpeg([
      '-i',
      inputPath,
      ...size,
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-ac',
      '2',
      '-hls_time',
      '10',
      '-hls_list_size',
      '0',
      outputPath,
    ]);
  }

  public async webm(
    inputPath: string,
    outputPath: string,
    options: Partial<VideoSize> = {},
  ): Promise<void> {
    if (getFileExtension(outputPath) !== 'webm') {
      throw new Error('Wrong file extension');
    }

    let size: string[] = [];

    if (options.height && options.width) {
      size = ['-s', `${options.width}x${options.height}`];
    }

    await this.ffmpeg([
      '-y',
      '-i',
      inputPath,
      '-b:a',
      '128k',
      '-preset',
      'medium',
      '-crf',
      '23',
      ...size,
      '-vcodec',
      'libvpx',
      '-acodec',
      'libvorbis',
      outputPath,
    ]);
  }

  public async getFrame(inputPath: string, outputPath: string, frame = 1): Promise<void> {
    await this.ffmpeg([
      '-y',
      '-i',
      inputPath,
      '-vf',
      `select=eq(n\\,1)`,
      '-vframes',
      String(frame),
      outputPath,
    ]);
  }

  private ffmpeg(args: Array<string>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.logger.debug(
        `Start ffmpeg process with parameters: ${JSON.stringify(
          args,
          null,
          2,
        )}.\nDebug string: "ffmpeg ${args.join(' ')}"`,
      );

      const res = spawn('ffmpeg', args, { timeout: 600000 });

      const error: string[] = [];
      const result: string[] = [];

      res.stdout.on('data', (data) => {
        result.push(data);
      });

      res.stderr.on('data', (data) => {
        error.push(data);
      });

      res.on('close', (code) => {
        if (code !== 0) {
          console.log(`reject code ${code}`);
          reject(error);
        } else {
          resolve(result);
        }
      });
    });
  }
}
