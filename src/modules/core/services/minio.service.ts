import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import to from 'await-to-js';
import fs from 'fs/promises';
import { isUndefined, uniq } from 'lodash';
import { BucketItemStat, Client as MinioClient } from 'minio';
import { dirname } from 'path';

import { AppConfig } from '../../config/types';
import { PrismaService } from '../../prisma/prisma.service';
import { PutObjectResult } from '../types';
import { inspectFolder } from '../utils/inspect-folder';

export type DeleteObjectsParams = {
  objectnames?: string[];
  taskIds?: number[];
  taskUids?: string[];
  objectIds?: number[];
  bucket?: string;
};

@Injectable()
export class MinioService {
  private readonly logger = new Logger(MinioService.name);
  public readonly client: MinioClient;
  private readonly tempTag = { Temp: 'true' };

  constructor(private readonly config: ConfigService<AppConfig, true>, private readonly prisma: PrismaService) {
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

  async saveFile(
    filepath: string,
    options: {
      filename: string;
      temporary?: boolean;
      mimetype?: string;
      bucket?: string;
    },
  ): Promise<PutObjectResult> {
    const bucket = options.bucket ?? this.bucket;

    this.logger.log(`Start: upload file to minio.`);
    this.logger.debug(`Options:\n${JSON.stringify(options, null, 2)}`);

    const [, fileStatRes] = await to(this.client.statObject(bucket, options.filename));

    if (fileStatRes) {
      this.logger.error(`File [${options.filename}] already exist.`);

      throw new Error(`File [${options.filename}] already exist.`);
    }

    this.logger.debug(`Trying to put object [${options.filename}] to minio bucket [${bucket}] from [${filepath}].`);

    const [uploadError] = await to(this.client.fPutObject(bucket, options.filename, filepath));

    if (uploadError) {
      const stat = await fs.stat(filepath);

      this.logger.error(
        `Error occurred while upload error.\nError message: ${uploadError.message}\nFile stat: ${JSON.stringify(
          stat,
          null,
          2,
        )}`,
        uploadError,
      );

      await inspectFolder(dirname(filepath), this.logger);

      throw new Error('File upload error.');
    }

    if (isUndefined(options.temporary) || options.temporary) {
      const done = await this.setTemporaryTag(options.filename, { bucket });

      if (!done) {
        throw new Error('File upload error.');
      }
    }

    const stat = await this.getFileStat(options.filename, { bucket });

    this.logger.log(`Finish: upload file [${options.filename}] to minio.`);

    return {
      objectname: options.filename,
      size: BigInt(stat.size),
      metadata: stat.metaData,
      bucket,
    };
  }

  async getObjectUrl(objectName: string, options: { bucket?: string } = {}): Promise<string> {
    if (options.bucket === 'msfiles-public' && this.config.get('PUBLIC_BUCKET_EXTERNAL_URL')) {
      const [err] = await to(this.client.statObject(options.bucket, objectName));

      if (err) {
        throw new NotFoundException('File is not exist.');
      }

      return this.config.get('PUBLIC_BUCKET_EXTERNAL_URL') + `/${objectName}`;
    }

    return this.getPresignedDownloadUrl(objectName, options);
  }

  /**
   * Method creates a signed path where you can get the file from the Minio
   * URL expired in 1 hour
   *
   * @returns { Promise<string> } Download URL
   */
  async getPresignedDownloadUrl(objectName: string, options: { bucket?: string } = {}): Promise<string> {
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
   * Method deletes file from Minio.
   * If provide taskId, all related objects will be deleted.
   * If provide object ids or objectnames, first find objects in database then delete in s3.
   * If provide objectnames, will be delete directly.
   */
  async deleteObjects(params: DeleteObjectsParams): Promise<boolean> {
    const bucket = params.bucket ?? this.bucket;

    const tasksByUids = params.taskUids
      ? await this.prisma.task.findMany({
          where: { uid: { in: params.taskUids } },
          select: { id: true },
        })
      : [];

    const inputIds = params.taskIds ?? [];
    const taskIds: number[] = inputIds.concat(...tasksByUids.map((t) => t.id));

    const objs = await this.prisma.s3Object.findMany({
      where: { task_id: { in: taskIds } },
      select: { objectname: true, bucket: true },
      distinct: 'objectname',
    });

    const uniqBuckets = uniq(objs.map((o) => o.bucket));

    if (uniqBuckets.length > 1) {
      this.logger.error(`Error delete objects: [${objs.map((o) => o.objectname).join(', ')}].`);

      throw new Error(
        `Available delete batch of objects only for one bucket. Got buckets [${uniqBuckets.join(', ')}].`,
      );
    }

    if (uniqBuckets.length && bucket !== uniqBuckets[0]) {
      throw new Error(
        `Bucket for delete objects are not match. Provided bucket is [${bucket}], but objects placed at [${uniqBuckets[0]}].`,
      );
    }

    let objnames = objs.map((o) => o.objectname);

    objnames = params.objectnames ? uniq(objnames.concat(...params.objectnames)) : objnames;

    const [err] = await to(this.client.removeObjects(bucket, objnames));

    if (err) {
      this.logger.error(`🔴 Error occurred when delete objects: [${objnames.join(', ')}].`, err);
    }

    if (objnames.length) {
      this.logger.log(`Objects [${objnames.join(', ')}] successfully deleted from bucket [${bucket}].`);
    } else {
      this.logger.log(`Nothing to delete. Skip deletion.`);
    }

    return !err;
  }

  /**
   * @param {string} objectName Description
   * @param options
   */
  public async setTemporaryTag(objectName: string, options: { bucket?: string } = {}): Promise<boolean> {
    const bucket = options.bucket ?? this.bucket;

    const [error] = await to(this.client.setObjectTagging(bucket, objectName, this.tempTag));

    this.logger.log(`Set temporary tag to object [${objectName}].`);

    if (error) {
      this.logger.error(`Error occured while set temporary tag to object [${objectName}].`, error);

      return false;
    }

    return true;
  }

  public async removeTemporaryTag(objectname: string, options: { bucket?: string } = {}): Promise<boolean> {
    const bucket = options.bucket ?? this.bucket;

    const [error] = await to(this.client.removeObjectTagging(bucket, objectname));

    if (error) {
      this.logger.error(`Error occurred while remove object tags [${objectname}].`, error);

      return false;
    }

    return true;
  }

  /**
   * Method creates an URL where you can upload a file to the Minio
   * URL expired in 1 hour
   * Set policy max file size to upload 10MB and expires in 1 hour
   *
   * @returns { Promise<string> } Upload URL
   */
  public async getPresignedUploadUrl(objectName: string, options: { bucket?: string } = {}): Promise<string> {
    const bucket = options.bucket ?? this.bucket;

    const [createUploadUrlError, url] = await to(this.client.presignedPutObject(bucket, objectName, 3600));

    if (createUploadUrlError || typeof url !== 'string') {
      this.logger.error(`An error occurred during creation upload URL: ${createUploadUrlError}`);

      throw new InternalServerErrorException('An error occurred during creation upload URL');
    }

    return url;
  }

  /**
   * Method checks if file exists and returns file info if yes
   */
  async getFileStat(objectName: string, options: { bucket?: string } = {}): Promise<BucketItemStat> {
    const bucket = options.bucket ?? this.bucket;
    const [err, data] = await to(this.client.statObject(bucket, objectName));

    if (err) {
      throw new NotFoundException('File is not exist');
    }

    return data;
  }
}
