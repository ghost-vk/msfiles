import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { extname } from 'path';

import { Size } from '../types';

@Injectable()
export class FFmpegService {
  private readonly logger = new Logger(FFmpegService.name);

  public async mp4(inputPath: string, outputPath: string, options: Partial<Size> = {}): Promise<void> {
    if (extname(outputPath) !== '.mp4') {
      this.logger.error(`Wrong file extension. Got [${extname(outputPath)}] instead [mp4].`);

      throw new Error(`Wrong file extension. Got [${extname(outputPath)}] instead [mp4].`);
    }

    let size: string[] = [];

    if (options && options.height && options.width) {
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

  public async m3u8(inputPath: string, outputPath: string, options: Partial<Size> = {}): Promise<void> {
    if (extname(outputPath) !== '.m3u8') {
      this.logger.error(`Wrong file extension. Got [${extname(outputPath)}] instead [m3u8].`);

      throw new Error(`Wrong file extension. Got [${extname(outputPath)}] instead [m3u8].`);
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

  public async webm(inputPath: string, outputPath: string, options: Partial<Size> = {}): Promise<void> {
    if (extname(outputPath) !== '.webm') {
      this.logger.error(`Wrong file extension. Got [${extname(outputPath)}] instead [webm].`);

      throw new Error(`Wrong file extension. Got [${extname(outputPath)}] instead [webm].`);
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
    await this.ffmpeg(['-y', '-i', inputPath, '-vf', `select=eq(n\\,1)`, '-vframes', String(frame), outputPath]);
  }

  private ffmpeg(args: Array<string>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.logger.log('Start ffmpeg process.');
      this.logger.debug(`ffmpeg debug string: "ffmpeg ${args.join(' ')}".`);

      const res = spawn('ffmpeg', args, { timeout: 600000 });

      const error: string[] = [];
      const result: string[] = [];

      res.stdout.on('data', (data) => {
        const progress = this.parseProgress(data);

        this.logger.log(`ffmpeg conversion progress: ${progress}%`);
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

  private parseProgress(output): string | null {
    const match = output.match(/time=(\d+:\d+:\d+\.\d+)/);

    if (match) {
      const time = match[1];
      const durationInSeconds = 3600;
      const currentTimeInSeconds = this.parseTimeToSeconds(time);
      const progress = (currentTimeInSeconds / durationInSeconds) * 100;

      return progress.toFixed(2);
    }

    return null;
  }

  private parseTimeToSeconds(time: string): number {
    const parts = time.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseFloat(parts[2]);

    return hours * 3600 + minutes * 60 + seconds;
  }
}
