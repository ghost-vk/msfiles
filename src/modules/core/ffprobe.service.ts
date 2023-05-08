import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';

import { VideoSize } from './types';

@Injectable()
export class FFprobeService {
  private readonly logger = new Logger(FFprobeService.name);

  public async getVideoDimensions(videoPath: string): Promise<VideoSize> {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height',
        '-of',
        'csv=s=x:p=0',
        videoPath,
      ]);

      let videoDimensions: VideoSize | null = null;

      ffprobe.stdout.on('data', (data) => {
        const [videoWidth, videoHeight] = data.toString().trim().split('x');

        videoDimensions = { width: +videoWidth, height: +videoHeight };

        this.logger.log(
          `Detected video dimensions for file [${videoPath}]: ${JSON.stringify(videoDimensions, null, 2)}.`,
        );
      });

      ffprobe.stderr.on('data', (data) => {
        this.logger.error(`ffprobe error: ${data}`);
        reject(new Error(`Failed to get video dimensions.`));
      });

      ffprobe.on('close', (code) => {
        if (code !== 0) {
          this.logger.error(`ffprobe exited with code ${code}`);
          reject(new Error(`Failed to get video dimensions.`));
        } else if (videoDimensions !== null) {
          resolve(videoDimensions);
        } else {
          reject(new Error('Failed to get video dimensions.'));
        }
      });
    });
  }
}
