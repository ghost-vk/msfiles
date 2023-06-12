import { Injectable, Logger } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { dirname } from 'path';
import sharp from 'sharp';

import { ImageExtensionEnum } from '../types';
import { getBuffer } from '../utils/get-buffer';
import { saveBufferToTmp } from '../utils/save-buffer-to-tmp';

export type ConvertImageFit = 'contain' | 'cover' | 'fill' | 'inside' | 'outside';

export function isAvailableImageFit(fit: string): fit is ConvertImageFit {
  if (['contain', 'cover', 'fill', 'inside', 'outside'].includes(fit)) {
    return true;
  }

  return false;
}

export type ConvertImageOptions = {
  ext: ImageExtensionEnum;
  quality?: number;
  width?: number;
  height?: number;
  fit?: ConvertImageFit;
  convert: boolean;
  resize: boolean;
};

@Injectable()
export class ImageConverterService {
  private readonly logger = new Logger(ImageConverterService.name);

  async convertImage(
    filepath: string,
    options: ConvertImageOptions = { ext: ImageExtensionEnum.Webp, convert: true, resize: true },
  ): Promise<string> {
    this.logger.log(`Start: convert image [${filepath}].`);
    this.logger.debug(`Convert image payload:\n${JSON.stringify(options, null, 2)}`);

    if (!options.resize && !options.convert) {
      return filepath;
    }

    const inputBuffer = await getBuffer(filepath);
    let s = sharp(inputBuffer);
    let dotExt = '.webp';

    if (options.convert) {
      switch (options.ext) {
        case ImageExtensionEnum.Jpeg: {
          this.logger.log(`Convert image to [jpeg].`);
          s = s.jpeg({ ...options });
          dotExt = '.jpeg';
          break;
        }
        case ImageExtensionEnum.Jpg: {
          this.logger.log(`Convert image to [jpeg].`);
          s = s.jpeg({ ...options });
          dotExt = '.jpeg';
          break;
        }
        case ImageExtensionEnum.Png: {
          this.logger.log(`Convert image to [png].`);
          s = s.png({ ...options });
          dotExt = '.png';
          break;
        }
        case ImageExtensionEnum.Webp: {
          this.logger.log(`Convert image to [webp].`);
          s = s.webp({ ...options });
          dotExt = '.webp';
          break;
        }
        default: {
          this.logger.log(`Convert image to [webp] as default.`);
          s = s.webp({ ...options });
          dotExt = '.webp';
        }
      }
    }

    if (options.resize && (options.width || options.height)) {
      s = s.resize({
        width: options.width,
        height: options.height,
        fit: options.fit,
      });
    }

    const resultBuffer = await s.toBuffer();
    const resultFilepath = await saveBufferToTmp(resultBuffer, {
      tmpDir: dirname(filepath),
      filename: nanoid(6) + dotExt,
    });

    this.logger.log(`Finish: convert image [${filepath}].`);

    return resultFilepath;
  }
}
