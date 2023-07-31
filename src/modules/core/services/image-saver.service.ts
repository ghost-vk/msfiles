import { Injectable, Logger } from '@nestjs/common';
import { S3Object } from '@prisma/client';
import { extname } from 'path';

import { PrismaService } from '../../prisma/prisma.service';
import { generateFilename } from '../functions/generate-filename';
import { FileTypeEnum, ImageExtensionEnum, isImageExtension, PutObjectResult, Size } from '../types';
import { MinioService } from './minio.service';

export type ImageSaveParams = {
  originalname: string;
  tempFilepath: string;
  filetype: FileTypeEnum;
  size: Partial<Size>;
  bucket: string;
  taskId: number;
  main: boolean;
};

export type ImageSaveResult = {
  rec: S3Object;
  s3obj: PutObjectResult;
};

@Injectable()
export class ImageSaverService {
  private readonly logger = new Logger(ImageSaverService.name);

  constructor(private readonly prisma: PrismaService, private readonly minioService: MinioService) {}

  async save(params: ImageSaveParams): Promise<ImageSaveResult> {
    this.logger.log(`Start save image [${params.originalname}].`);
    this.logger.debug(`Save image params:\n${JSON.stringify(params, null, 2)}.`);

    let ext = extname(params.tempFilepath);

    if (ext.startsWith('.')) ext = ext.replace('.', '');

    if (!isImageExtension(ext)) {
      throw Error(
        `Unavailable image extension [${ext}]. Available extensions: [${Object.values(ImageExtensionEnum).join(
          ', ',
        )}].`,
      );
    }

    const objName = generateFilename(params.originalname, {
      ext,
      type: params.filetype,
      ...params.size,
    });

    const s3obj = await this.minioService.saveFile(params.tempFilepath, {
      filename: objName,
      mimetype: 'image/' + ext,
      temporary: true,
      bucket: params.bucket,
    });

    const rec = await this.prisma.s3Object.create({
      data: {
        objectname: s3obj.objectname,
        size: s3obj.size,
        task_id: params.taskId,
        bucket: s3obj.bucket,
        main: params.main,
      },
    });

    this.logger.log(`Saved image [${params.originalname}].`);

    return { rec, s3obj };
  }
}
