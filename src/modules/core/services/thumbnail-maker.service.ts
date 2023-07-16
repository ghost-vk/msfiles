import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ImageExtensionEnum } from '../types';
import { ConvertImageFit, ImageConverterService, isAvailableImageFit } from './image-converter.service';
import { SizeDetectorService } from './size-detector.service';

export type ThumbnailSetup = {
  width: number;
  height: number;
  fit: ConvertImageFit;
  alias: string;
};

export type MakeThumbnailsResult = Array<
  {
    filepath: string;
  } & ThumbnailSetup
>;

@Injectable()
export class ThumbnailMakerService implements OnModuleInit {
  private readonly thumbnailsSetup: ThumbnailSetup[] = [];
  private readonly logger = new Logger(ThumbnailMakerService.name);

  constructor(
    private readonly imageConverterService: ImageConverterService,
    private readonly config: ConfigService,
    private readonly sizeDetector: SizeDetectorService,
  ) {}

  onModuleInit(): void {
    this.config
      .get('THUMBNAIL_SIZES')
      .split(',')
      .forEach((config) => {
        const [size, fit, _alias] = config.split('::');

        if (!size) {
          throw new Error('Size not detected.');
        }

        if (!fit) {
          throw new Error('Size not detected.');
        }

        if (!isAvailableImageFit(fit)) {
          throw new Error(`Not available fit [${fit}]. Available values: [contain, cover, fill, inside, outside].`);
        }

        const [w, h] = size.split('x');

        if (isNaN(+w) || isNaN(+h)) {
          throw new Error(`Not available width [${w}] or height [${h}]. Widht and height should be integer type.`);
        }

        const alias = _alias ? String(_alias) : String(_alias);

        this.thumbnailsSetup.push({ width: +w, height: +h, fit, alias });
      });

    this.logger.log(`Setup thumbnails sizes:\n${JSON.stringify(this.thumbnailsSetup, null, 2)}`);
  }

  async makeThumbnails(filepath: string, ext: ImageExtensionEnum = ImageExtensionEnum.Webp): Promise<MakeThumbnailsResult> {
    this.logger.log(`Start: make [${this.thumbnailsSetup.length}] thumbnails for [${filepath}].`);

    const result: MakeThumbnailsResult = [];

    const originalImageSize = await this.sizeDetector.getImageSize(filepath);

    for (const config of this.thumbnailsSetup) {
      const orgnImgHasLowerResolutionThumbnail =
        config.width >= (originalImageSize.width ?? 999999) || config.height >= (originalImageSize.height ?? 999999);

      if (orgnImgHasLowerResolutionThumbnail) continue;

      const resultFilepath = await this.imageConverterService.convertImage(filepath, {
        ext,
        convert: true,
        resize: true,
        ...config,
      });

      result.push({ filepath: resultFilepath, ...config });
    }

    this.logger.log(`Finish: make [${this.thumbnailsSetup.length}] thumbnails for [${filepath}].`);

    return result;
  }

  get thumnailsCount(): number {
    return this.thumbnailsSetup.length;
  }
}
