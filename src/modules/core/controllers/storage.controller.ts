import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import {
  BadRequestException,
  ClassSerializerInterceptor,
  Controller,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiParam, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import { mkdtemp, writeFile } from 'fs/promises';
import { nanoid } from 'nanoid';
import { tmpdir } from 'os';
import { extname, join } from 'path';

import { ActionKeyGuard } from '../../auth/action-key.guard';
import { ConcurrencyUploadGuard } from '../../auth/concurrency-upload.guard';
import { RequestedAction } from '../../auth/requested-action.decorator';
import { FileActionsEnum, TaskStatusEnum } from '../../config/actions';
import { PrismaService } from '../../prisma/prisma.service';
import { FileUploadDto } from '../dtos/file-upload.dto';
import { UploadImageOptionsDto } from '../dtos/upload-image-options.dto';
import { UploadVideoOptionsDto } from '../dtos/upload-video-options.dto';
import { Task } from '../models/task.entity';
import { UploadObjectDataPipe } from '../pipes/upload-object.pipe';
import { FileProcessorService } from '../services/file-processor.service';
import { ImageProcessorService } from '../services/image-processor.service';
import { MinioService } from '../services/minio.service';
import { VideoProcessorService } from '../services/video-processor.service';
import { CreateUploadUrlCacheData, ImageExtensionEnum, VideoExtensionEnum } from '../types';
import { MsgTaskStart } from '../types/queue-payloads';

/**
 * This only uploads the file, but does not create any records in the database,
 * but instead notifies the service responsible for it. Therefore, it is impossible
 * to instantly get the identifier, object name, link and other information about
 * the file. In order to get information about the file, you need to set up a
 * connection between the client and the service responsible for managing
 * the data in the database.
 */
@Controller('storage')
@ApiBearerAuth()
@ApiTags('storage')
export class StorageController {
  private readonly logger = new Logger(StorageController.name);

  constructor(
    private readonly minioService: MinioService,
    private readonly prisma: PrismaService,
    private readonly imageProcessor: ImageProcessorService,
    private readonly videoProcessor: VideoProcessorService,
    private readonly fileProcessor: FileProcessorService,
    private readonly amqpConnection: AmqpConnection,
  ) {}

  @Post('uploadFile/:key')
  @UseInterceptors(FileInterceptor('file'), ClassSerializerInterceptor)
  @UseGuards(ConcurrencyUploadGuard, ActionKeyGuard)
  @RequestedAction(FileActionsEnum.UploadFile)
  @ApiBody({ type: FileUploadDto })
  @ApiConsumes('multipart/form-data')
  @ApiParam({
    name: 'key',
    type: String,
    description: 'A unique key for uploading a file, created on the side of the main service.',
  })
  async uploadFile(
    @UploadedFile() file?: Express.Multer.File,
    @Param('key', UploadObjectDataPipe) uploadConfig?: CreateUploadUrlCacheData,
  ): Promise<Task> {
    if (!uploadConfig) throw new ForbiddenException();

    if (!file) {
      throw new BadRequestException('File required to upload.');
    }

    this.logger.log(`Got file [${file.originalname}] upload request.`);
    this.logger.debug(`File [${file.originalname}] upload options:\n${JSON.stringify(uploadConfig, null, 2)}`);

    const task = await this.prisma.task.create({
      data: {
        action: FileActionsEnum.UploadFile,
        originalname: file.originalname,
        status: TaskStatusEnum.InProgress,
        bucket: uploadConfig?.bucket ?? this.minioService.bucket,
        uid: uploadConfig.uid,
      },
    });

    try {
      const dir = await mkdtemp(join(tmpdir(), nanoid(6)));
      const fileExt = extname(file.originalname);
      const inputFileName = fileExt ? randomUUID() + fileExt : randomUUID();

      await writeFile(join(dir, inputFileName), file.buffer);

      this.logger.log(`Successfully put file [${file.originalname}] to temporary directory for processing.`);

      await this.amqpConnection.publish<MsgTaskStart>('core', 'task_start', {
        task_id: task.id,
        uid: uploadConfig.uid,
        action: task.action as FileActionsEnum,
        status: task.status as TaskStatusEnum,
        created_at: task.created_at,
      });

      this.fileProcessor.fileProcessorSubj$.next({
        originalname: file.originalname,
        dir,
        filename: inputFileName,
        task_id: task.id,
        bucket: uploadConfig?.bucket,
        uid: uploadConfig.uid,
      });

      return new Task(task);
    } catch (e) {
      await this.prisma.task.update({
        where: { id: task.id },
        data: { status: TaskStatusEnum.Error },
      });

      throw new InternalServerErrorException('Image upload error');
    }
  }

  @Post('uploadImage/:key')
  @UseInterceptors(FileInterceptor('file'), ClassSerializerInterceptor)
  @UseGuards(ConcurrencyUploadGuard, ActionKeyGuard)
  @RequestedAction(FileActionsEnum.UploadImage)
  @ApiBody({ type: FileUploadDto })
  @ApiConsumes('multipart/form-data')
  @ApiParam({
    name: 'key',
    type: String,
    description: 'A unique key for uploading a file, created on the side of the main service.',
  })
  async uploadImage(
    @UploadedFile() file?: Express.Multer.File,
    @Query() options: UploadImageOptionsDto = {},
    @Param('key', UploadObjectDataPipe) uploadConfig?: CreateUploadUrlCacheData,
  ): Promise<Task> {
    if (!uploadConfig) throw new ForbiddenException();

    if (!file) {
      throw new BadRequestException('File required to upload');
    }

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('File should be image type');
    }

    this.logger.log(`Got image [${file.originalname}] upload request.`);
    this.logger.debug(
      `Image upload request options:\n${JSON.stringify(options, null, 2)}. Config from cache: ${JSON.stringify(
        uploadConfig,
        null,
        2,
      )}.`,
    );

    const taskRecord = await this.prisma.task.create({
      data: {
        action: FileActionsEnum.UploadImage,
        originalname: file.originalname,
        status: TaskStatusEnum.InProgress,
        parameters: JSON.stringify(options),
        bucket: uploadConfig?.bucket ?? this.minioService.bucket,
        uid: uploadConfig.uid,
      },
    });

    try {
      const dir = await mkdtemp(join(tmpdir(), nanoid(6)));
      const fileExt = extname(file.originalname);
      const inputFileName = fileExt ? randomUUID() + fileExt : randomUUID();

      await writeFile(join(dir, inputFileName), file.buffer);

      this.logger.log(`Successfully put file [${file.originalname}] to temporary directory for conversion.`);

      await this.amqpConnection.publish<MsgTaskStart>('core', 'task_start', {
        task_id: taskRecord.id,
        uid: uploadConfig.uid,
        action: FileActionsEnum.UploadImage,
        status: TaskStatusEnum.InProgress,
        created_at: taskRecord.created_at,
      });

      this.imageProcessor.imageConversion$.next({
        ext: options.ext ?? ImageExtensionEnum.Webp,
        originalname: file.originalname,
        dir,
        filename: inputFileName,
        task_id: taskRecord.id,
        quality: options.q,
        width: options.w,
        height: options.h,
        bucket: uploadConfig?.bucket,
        uid: uploadConfig.uid,
        convert: options.convert ?? true,
      });

      return new Task(taskRecord);
    } catch (e) {
      await this.prisma.task.update({
        where: { id: taskRecord.id },
        data: { status: TaskStatusEnum.Error },
      });

      throw new InternalServerErrorException('Image upload error');
    }
  }

  /**
   * Controller writes file to temprorary folder and call compressor
   * {@link FileProcessorService} through rxjs subject without response waiting,
   * requester will be notified through queue.
   */
  @Post('uploadVideo/:key')
  @UseInterceptors(FileInterceptor('file'), ClassSerializerInterceptor)
  @UseGuards(ConcurrencyUploadGuard, ActionKeyGuard)
  @RequestedAction(FileActionsEnum.UploadVideo)
  @ApiBody({ type: FileUploadDto })
  @ApiConsumes('multipart/form-data')
  @ApiParam({
    name: 'key',
    type: String,
    description: 'A unique key for uploading a file, created on the side of the main service.',
  })
  async uploadVideo(
    @UploadedFile() file?: Express.Multer.File,
    @Query() options: UploadVideoOptionsDto = {},
    @Param('key', UploadObjectDataPipe) uploadConfig?: CreateUploadUrlCacheData,
  ): Promise<Task> {
    if (!uploadConfig) throw new ForbiddenException();

    if (!file || !file.mimetype.startsWith('video/')) {
      throw new BadRequestException('Required video file to upload.');
    }

    this.logger.debug(`Start upload video [${file.originalname}]. Options: ${JSON.stringify(options, null, 2)}.`);

    const taskRecord = await this.prisma.task.create({
      data: {
        action: FileActionsEnum.UploadVideo,
        originalname: file.originalname,
        status: TaskStatusEnum.InProgress,
        parameters: JSON.stringify(options),
        bucket: uploadConfig?.bucket ?? this.minioService.bucket,
        uid: uploadConfig.uid,
      },
    });

    try {
      const dir = await mkdtemp(join(tmpdir(), nanoid(6)));
      const fileExt = extname(file.originalname);
      const inputFileName = fileExt ? randomUUID() + fileExt : randomUUID();

      await writeFile(join(dir, inputFileName), file.buffer);

      await this.amqpConnection.publish<MsgTaskStart>('core', 'task_start', {
        task_id: taskRecord.id,
        uid: uploadConfig.uid,
        action: taskRecord.action as FileActionsEnum,
        status: taskRecord.status as TaskStatusEnum,
        created_at: taskRecord.created_at,
      });

      this.logger.log(`Put file [${file.originalname}] to temporary directory for conversion.`);

      this.videoProcessor.videoConversion$.next({
        ext: options.ext ?? VideoExtensionEnum.Mp4,
        originalname: file.originalname,
        dir: dir,
        filename: inputFileName,
        convert: options.convert,
        sizes: options.s ? options.s.map((s) => ({ width: s.w, height: s.h })) : [],
        task_id: taskRecord.id,
        bucket: uploadConfig?.bucket,
        uid: uploadConfig.uid,
      });

      return new Task(taskRecord);
    } catch (err) {
      await this.prisma.task.update({
        where: { id: taskRecord.id },
        data: { status: TaskStatusEnum.Error },
      });

      throw new InternalServerErrorException('Video upload error.');
    }
  }
}
