import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import to from 'await-to-js';
import { imageSize } from 'image-size';
import { isUndefined } from 'lodash';
import { BucketItemStat, Client as MinioClient } from 'minio';

import { AppConfig } from '../config/types';
import { ObjectMetadata, PutObjectResult } from './types';
import { getFileExtension, normalizeFilename, NormalizeFilenameOptions } from './utils';

@Injectable()
export class MinioService {
  private readonly logger = new Logger(MinioService.name);
  public readonly client: MinioClient;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    this.client = new MinioClient({
      endPoint: config.get('MINIO_HOST'),
      port: config.get('MINIO_PORT'),
      useSSL: config.get('MINIO_USE_SSL_BOOL'),
      accessKey: config.get('MINIO_ROOT_USER'),
      secretKey: config.get('MINIO_ROOT_PASSWORD'),
    });
  }

  get bucket(): string {
    return this.config.get('MINIO_BUCKET');
  }

  /**
   * Method creates a signed path where you can get the file from the Minio
   * URL expired in 1 hour
   *
   * @param { string } objectName
   * @returns { Promise<string> } Download URL
   */
  async getPresignedDownloadUrl(
    objectName: string,
    options: { bucket?: string } = {},
  ): Promise<string> {
    const bucket = options.bucket ?? this.bucket;

    if (this.config.get('NODE_ENV') === 'development') {
      const [err] = await to(this.client.statObject(bucket, objectName));

      if (err) {
        throw new NotFoundException('File is not exist.');
      }
    }

    return this.client.presignedGetObject(bucket, objectName, 3600);
  }

  /**
   * Method creates an URL where you can upload a file to the Minio
   * URL expired in 1 hour
   * Set policy max file size to upload 10MB and expires in 1 hour
   *
   * @param { string } objectName Filename with extension
   * @returns { Promise<CreateUploadUrlResult> } Upload URL & generated object name
   */
  async getPresignedUploadUrl(
    objectName: string,
    options: { bucket?: string } = {},
  ): Promise<string> {
    const bucket = options.bucket ?? this.bucket;

    const [createUploadUrlError, url] = await to(
      this.client.presignedPutObject(bucket, objectName, 3600),
    );

    if (createUploadUrlError || typeof url !== 'string') {
      this.logger.error(`An error occurred during creation upload URL: ${createUploadUrlError}`);

      throw new InternalServerErrorException('An error occurred during creation upload URL');
    }

    return url;
  }

  /**
   * Method checks if file exists and returns file info if yes
   *
   * @param objectName
   */
  async getFileStat(
    objectName: string,
    options: { bucket?: string } = {},
  ): Promise<BucketItemStat> {
    const bucket = options.bucket ?? this.bucket;
    const [err, data] = await to(this.client.statObject(bucket, objectName));

    if (err) {
      throw new NotFoundException('File is not exist');
    }

    return data;
  }

  /**
   * Method deletes file from Minio
   *
   * @param objectName
   */
  async deleteObject(objectName: string, options: { bucket?: string } = {}): Promise<boolean> {
    const bucket = options.bucket ?? this.bucket;
    const [err] = await to(this.client.removeObject(bucket, objectName));

    if (err) {
      this.logger.error(`Error occured when delele object: [${objectName}].`, err);
    }

    return !err;
  }

  /**
   * Method deletes files from Minio
   *
   * @param { Array<string> } objectNames
   */
  async deleteObjects(objectNames: string[], options: { bucket?: string } = {}): Promise<boolean> {
    const bucket = options.bucket ?? this.bucket;

    const [err] = await to(this.client.removeObjects(bucket, objectNames));

    if (err) {
      this.logger.error(`Error occured when delele objects: [${objectNames.join(', ')}]`, err);
    }

    this.logger.log(`Objects successfully deleted: [${objectNames.join(', ')}]`);

    return !err;
  }

  /**
   * Method put file to storage and set temporary tag
   */
  async putObject(
    bufferOrFilepath: Buffer | string,
    options: {
      originalname: string;
      temporary?: boolean;
      mimetype?: string;
      height?: number;
      width?: number;
      checkImageSize?: boolean;
      preserveOriginalName?: boolean;
      actor?: number | string;
      bucket?: string;
    },
  ): Promise<PutObjectResult> {
    const bucket = options.bucket ?? this.bucket;

    this.logger.debug(`Try to upload file. \nOptions: ${JSON.stringify(options, null, 2)}`);

    const filenameOptions: NormalizeFilenameOptions = { unique: !options.preserveOriginalName };

    const fileExt = getFileExtension(options.originalname) ?? '';

    filenameOptions.height = options.height;
    filenameOptions.width = options.width;

    const shouldDefineImageSize =
      options.checkImageSize ||
      options.mimetype?.startsWith('image/') ||
      (['webp', 'jpeg', 'jpg', 'png'].includes(fileExt) &&
        !filenameOptions.width &&
        !filenameOptions.height);

    if (shouldDefineImageSize) {
      const dimensionsDefined = !!(options.width && options.height);

      const dimensions = dimensionsDefined
        ? { width: options.width, height: options.height }
        : imageSize(bufferOrFilepath);

      filenameOptions.height = dimensions.height;
      filenameOptions.width = dimensions.width;

      if (!dimensionsDefined) {
        options.height = dimensions.height;
        options.width = dimensions.width;
      }
    }

    const metaData: ObjectMetadata = {};

    if (options.actor) metaData.actor = options.actor;
    if (options.height) metaData.height = options.height;
    if (options.width) metaData.width = options.width;

    const objectName = normalizeFilename(options.originalname, filenameOptions);

    const [, fileStatRes] = await to(this.client.statObject(bucket, objectName));

    if (fileStatRes) {
      this.logger.error(`File [${objectName}] already exist.`);

      throw new Error(`File [${objectName}] already exist.`);
    }

    let uploadError: null | Error = null;

    if (typeof bufferOrFilepath === 'string') {
      [uploadError] = await to(
        this.client.fPutObject(bucket, objectName, bufferOrFilepath, metaData),
      );
    } else {
      [uploadError] = await to(
        this.client.putObject(bucket, objectName, bufferOrFilepath, undefined, metaData),
      );
    }

    if (uploadError) {
      this.logger.error('Error occured while upload error.', uploadError);

      throw new InternalServerErrorException('File upload error.');
    }

    if (isUndefined(options.temporary) || options.temporary) {
      const done = await this.setTemporaryTag(objectName, { bucket });

      if (!done) {
        throw new InternalServerErrorException('File upload error.');
      }
    }

    this.logger.log(`File [${options.originalname} - ${objectName}] successfully uploaded.`);

    const stat = await this.getFileStat(objectName, { bucket });

    return {
      objectname: objectName,
      size: stat.size,
      metadata: stat.metaData,
      bucket,
    };
  }

  async setTemporaryTag(objectName: string, options: { bucket?: string } = {}): Promise<boolean> {
    const bucket = options.bucket ?? this.bucket;
    const [error] = await to(
      this.client.setObjectTagging(bucket, objectName, { temporary: 'true' }),
    );

    if (error) {
      this.logger.error(`Error occured while set temporary tag to object [${objectName}].`, error);

      return false;
    }

    return true;
  }

  async removeTemporaryTag(
    objectName: string,
    options: { bucket?: string } = {},
  ): Promise<boolean> {
    const bucket = options.bucket ?? this.bucket;

    const [error] = await to(this.client.removeObjectTagging(bucket, objectName));

    if (error) {
      this.logger.error(`Error occured while remove object tags [${objectName}].`, error);

      return false;
    }

    return true;
  }
}
