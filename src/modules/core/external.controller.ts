import {
  BadRequestException,
  ClassSerializerInterceptor,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  InternalServerErrorException,
  Logger,
  Param,
  Post,
  Query,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiParam, ApiTags } from '@nestjs/swagger';
import to from 'await-to-js';
import { randomUUID } from 'crypto';
import { writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { PrismaService } from '../../services/prisma.service';
import { ActionKeyGuard } from '../auth/action-key.guard';
import { ConcurrencyUploadGuard } from '../auth/concurrency-upload.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequestedAction } from '../auth/requested-action.decorator';
import { UserAuthPayload } from '../auth/types';
import { actions, taskStatus } from '../config/actions';
import { MS_CLIENT } from '../config/constants';
import {
  FilesUploadBodyDto,
  FileUploadDto,
  GetMyTasksDto,
  UploadImageOptionsDto,
  UploadVideoOptionsDto,
} from './core.dto';
import { Task } from './core.entity';
import { FilesService } from './files.service';
import { sentMessages } from './messages';
import { MinioService } from './minio.service';
import { imageConversion$, videoConversion$ } from './observable';
import {
  CreateUploadUrlCacheData,
  MessageAsyncUploadError,
  MessageUploadPayload,
  PutObjectResult,
  TaskCompletedPayload,
} from './types';
import { UploadObjectDataPipe } from './upload-object.pipe';
import { getFileExtension } from './utils';

/**
 * This only uploads the file, but does not create any records in the database,
 * but instead notifies the service responsible for it. Therefore, it is impossible
 * to instantly get the identifier, object name, link and other information about
 * the file. In order to get information about the file, you need to set up a
 * connection between the client and the service responsible for managing
 * the data in the database.
 */
@Controller('storage')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
@ApiTags('storage')
export class ExternalController {
  private readonly logger = new Logger(ExternalController.name);

  constructor(
    private readonly minioService: MinioService,
    private readonly filesService: FilesService,
    private readonly prisma: PrismaService,
    @Inject(MS_CLIENT) private readonly queueClient: ClientProxy,
  ) {}

  @Get('mytasks')
  @UseInterceptors(ClassSerializerInterceptor)
  async getMyTasks(@CurrentUser() currentUser: UserAuthPayload, @Query() args: GetMyTasksDto): Promise<Task[]> {
    try {
      const tasks = await this.prisma.task.findMany({
        where: {
          actor: String(currentUser.user_id),
          status: args.status,
        },
        take: args.take,
        skip: args.skip,
        orderBy: { created_at: 'desc' },
      });

      return tasks.map((t) => new Task(t));
    } catch (err) {
      this.logger.error(`Get my task error: ${err.message}. Parameters: ${JSON.stringify(args, null, 2)}.`, err?.stack);

      throw new InternalServerErrorException('Get task error.');
    }
  }

  @Post('file/:key')
  @UseInterceptors(FileInterceptor('file'), ClassSerializerInterceptor)
  @UseGuards(ConcurrencyUploadGuard, ActionKeyGuard)
  @RequestedAction(actions.uploadFile)
  @ApiBody({ type: FileUploadDto })
  @ApiConsumes('multipart/form-data')
  @ApiParam({
    name: 'key',
    type: String,
    description: 'A unique key for uploading a file, created on the side of the main service.',
  })
  async uploadSingleFile(
    @UploadedFile() file?: Express.Multer.File,
    @CurrentUser() user?: UserAuthPayload,
    @Param('key', UploadObjectDataPipe) uploadConfig?: CreateUploadUrlCacheData,
  ): Promise<Task> {
    if (!user) throw new ForbiddenException();

    if (!file) {
      throw new BadRequestException('File required to upload.');
    }

    const uploadedObjects: PutObjectResult[] = [];

    const task = await this.prisma.task.create({
      data: {
        action: actions.uploadFile,
        actor: String(user.user_id),
        originalname: file.originalname,
        status: taskStatus.inProgress,
        bucket: uploadConfig?.bucket ?? this.minioService.bucket,
      },
    });

    try {
      const object = await this.minioService.saveFileToStorage(file.buffer, {
        originalname: file.originalname,
        actor: user.user_id,
        temporary: true,
        mimetype: file.mimetype,
        bucket: uploadConfig?.bucket,
      });

      uploadedObjects.push(object);
      await this.prisma.task.update({
        where: { id: task.id },
        data: { status: taskStatus.done, objectname: object.objectname },
      });

      this.queueClient.emit<unknown, MessageUploadPayload>(sentMessages.uploadedFile, {
        action: 'uploadFile',
        actor: user.user_id,
        objectname: object.objectname,
        originalname: file.originalname,
        size: object.size,
        type: 'mainFile',
        metadata: object.metadata,
        bucket: object.bucket,
        task_id: task.id,
        created_at: task.created_at,
      });

      this.queueClient.emit<unknown, TaskCompletedPayload>(sentMessages.taskCompleted, { task_id: task.id });

      this.logger.log(`Sent message to queue [${sentMessages.uploadedFile}].`);

      this.logger.log(`Successfully upload files: ${uploadedObjects.map((o) => o.objectname).join(', ')}.`);

      return new Task(task);
    } catch (e) {
      const objectnames = uploadedObjects.map((o) => o.objectname);

      this.logger.error(`An error occured when upload files [${JSON.stringify(objectnames.join(', '))}].`, e);
      const [err] = await to(this.minioService.deleteObjects(objectnames));

      if (err) {
        this.logger.warn(`🟡 Delete uploaded objects error for [${JSON.stringify(objectnames.join(', '))}].`, err);
      }
      await to(
        this.filesService.setErrorStatusToActiveTasks({
          user_id: user.user_id,
          action: 'uploadFile',
        }),
      );

      const msgPayload: MessageAsyncUploadError = {
        action: 'uploadFile',
        actor: user.user_id,
        task_id: task.id,
        created_at: task.created_at,
        message: err?.message ? err.message : undefined,
      };

      this.queueClient.emit<unknown, MessageAsyncUploadError>(sentMessages.uploadError, msgPayload);

      throw new InternalServerErrorException('An error occured when upload files.');
    }
  }

  /**
   * It uploads files of any type to storage.
   * It does not convert and compress image or video.
   */
  @Post('files/:key')
  @UseInterceptors(FilesInterceptor('files'), ClassSerializerInterceptor)
  @UseGuards(ConcurrencyUploadGuard, ActionKeyGuard)
  @RequestedAction(actions.uploadFile)
  @ApiBody({ type: FilesUploadBodyDto })
  @ApiConsumes('multipart/form-data')
  @ApiParam({
    name: 'key',
    type: String,
    description: 'A unique key for uploading a file, created on the side of the main service.',
  })
  async uploadFiles(
    @UploadedFiles() files?: Express.Multer.File[],
    @CurrentUser() user?: UserAuthPayload,
    @Param('key', UploadObjectDataPipe) uploadConfig?: CreateUploadUrlCacheData,
  ): Promise<Task[]> {
    if (!user) throw new ForbiddenException();

    if (!files) {
      throw new BadRequestException('Files required to upload.');
    }

    if (files.length > 10) {
      throw new ForbiddenException('Not more than 10 files allowed to upload simultaneously.');
    }

    const uploadedObjects: PutObjectResult[] = [];
    const tasks: Task[] = [];

    try {
      for (const f of files) {
        const task = await this.prisma.task.create({
          data: {
            action: actions.uploadFile,
            actor: String(user.user_id),
            originalname: f.originalname,
            status: taskStatus.inProgress,
            bucket: uploadConfig?.bucket ?? this.minioService.bucket,
          },
        });

        tasks.push(new Task(task));

        const object = await this.minioService.saveFileToStorage(f.buffer, {
          originalname: f.originalname,
          actor: user.user_id,
          temporary: true,
          mimetype: f.mimetype,
          bucket: uploadConfig?.bucket,
        });

        uploadedObjects.push(object);
        await this.prisma.task.update({
          where: { id: task.id },
          data: { status: taskStatus.done, objectname: object.objectname },
        });

        this.queueClient.emit<unknown, MessageUploadPayload>(sentMessages.uploadedFile, {
          action: 'uploadFile',
          actor: user.user_id,
          objectname: object.objectname,
          originalname: f.originalname,
          size: object.size,
          type: 'mainFile',
          metadata: object.metadata,
          bucket: object.bucket,
          task_id: task.id,
          created_at: task.created_at,
        });

        this.logger.log(`Sent message to queue [${sentMessages.uploadedFile}].`);
      }

      this.logger.log(`Successfully upload files: ${uploadedObjects.map((o) => o.objectname).join(', ')}.`);

      return tasks;
    } catch (e) {
      const objectnames = uploadedObjects.map((o) => o.objectname);

      this.logger.error(`An error occured when upload files [${JSON.stringify(objectnames.join(', '))}].`, e);

      await to(this.filesService.setErrorStatusToActiveTasks({ user_id: user.user_id }));

      const currentTask = tasks.slice(-1)[0];

      const msgPayload: MessageAsyncUploadError = {
        action: 'uploadFile',
        actor: user.user_id,
        task_id: currentTask.id,
        created_at: currentTask.created_at,
        message: e?.message ? e.message : undefined,
        metadata: {
          processed_files: tasks.length - 1,
          total_files: files.length,
        },
      };

      this.queueClient.emit<unknown, MessageAsyncUploadError>(sentMessages.uploadError, msgPayload);

      throw new InternalServerErrorException('An error occured when upload files.');
    }
  }

  @Post('image/:key')
  @UseInterceptors(FileInterceptor('file'), ClassSerializerInterceptor)
  @UseGuards(ConcurrencyUploadGuard, ActionKeyGuard)
  @RequestedAction(actions.uploadImage)
  @ApiBody({ type: FileUploadDto })
  @ApiConsumes('multipart/form-data')
  @ApiParam({
    name: 'key',
    type: String,
    description: 'A unique key for uploading a file, created on the side of the main service.',
  })
  async uploadImage(
    @UploadedFile() file?: Express.Multer.File,
    @CurrentUser() user?: UserAuthPayload,
    @Query() options: UploadImageOptionsDto = {},
    @Param('key', UploadObjectDataPipe) uploadConfig?: CreateUploadUrlCacheData,
  ): Promise<Task> {
    if (!user) throw new ForbiddenException();

    if (!file) {
      throw new BadRequestException('File required to upload');
    }

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('File should be image type');
    }

    this.logger.debug(
      `Got image upload request. User: ${JSON.stringify(user, null, 2)}. Options: ${JSON.stringify(
        options,
        null,
        2,
      )}. Config from cache: ${JSON.stringify(uploadConfig, null, 2)}.`,
    );

    const taskRecord = await this.prisma.task.create({
      data: {
        action: actions.uploadImage,
        actor: String(user.user_id),
        originalname: file.originalname,
        status: taskStatus.inProgress,
        parameters: JSON.stringify(options),
        bucket: uploadConfig?.bucket ?? this.minioService.bucket,
      },
    });

    try {
      const dir = tmpdir();
      const fileExt = getFileExtension(file.originalname) ?? '';
      const inputFileName = fileExt ? randomUUID() + `.${fileExt}` : randomUUID();

      await writeFile(join(dir, inputFileName), file.buffer);

      this.logger.log(`Successfully put file [${file.originalname}] to temporary directory for conversion.`);

      imageConversion$.next({
        ext: options.ext ?? 'webp',
        originalname: file.originalname,
        dir,
        filename: inputFileName,
        task_id: taskRecord.id,
        quality: options.q,
        width: options.w,
        height: options.h,
        actor: user.user_id,
        bucket: uploadConfig?.bucket,
      });

      return new Task(taskRecord);
    } catch (e) {
      await this.prisma.task.update({
        where: { id: taskRecord.id },
        data: { status: taskStatus.error },
      });

      throw new InternalServerErrorException('Image upload error');
    }
  }

  /**
   * Controller writes file to temprorary folder and call compressor
   * {@link FilesService} through rxjs subject without response waiting,
   * requester will be notified through queue.
   */
  @Post('video/:key')
  @UseInterceptors(FileInterceptor('file'), ClassSerializerInterceptor)
  @UseGuards(ConcurrencyUploadGuard, ActionKeyGuard)
  @RequestedAction(actions.uploadVideo)
  @ApiBody({ type: FileUploadDto })
  @ApiConsumes('multipart/form-data')
  @ApiParam({
    name: 'key',
    type: String,
    description: 'A unique key for uploading a file, created on the side of the main service.',
  })
  async uploadVideo(
    @UploadedFile() file?: Express.Multer.File,
    @CurrentUser() user?: UserAuthPayload,
    @Query() options: UploadVideoOptionsDto = {},
    @Param('key', UploadObjectDataPipe) uploadConfig?: CreateUploadUrlCacheData,
  ): Promise<Task> {
    if (!user) throw new ForbiddenException();

    if (!file || !file.mimetype.startsWith('video/')) {
      throw new BadRequestException('Required video file to upload.');
    }

    this.logger.debug(`Start upload video [${file.originalname}]. Options: ${JSON.stringify(options, null, 2)}.`);

    const taskRecord = await this.prisma.task.create({
      data: {
        action: actions.uploadVideo,
        actor: String(user.user_id),
        originalname: file.originalname,
        status: taskStatus.inProgress,
        parameters: JSON.stringify(options),
        bucket: uploadConfig?.bucket ?? this.minioService.bucket,
      },
    });

    try {
      const dir = tmpdir();
      const fileExt = getFileExtension(file.originalname) ?? '';
      const inputFileName = fileExt ? randomUUID() + `.${fileExt}` : randomUUID();

      await writeFile(join(dir, inputFileName), file.buffer);

      this.logger.log(`Successfully put file [${file.originalname}] to temporary directory for conversion.`);

      videoConversion$.next({
        ext: options.ext ?? 'mp4',
        originalname: file.originalname,
        dir: dir,
        filename: inputFileName,
        compress: options.compress,
        sizes: options.s ? options.s.map((s) => ({ width: s.w, height: s.h })) : [],
        task_id: taskRecord.id,
        actor: user.user_id,
        bucket: uploadConfig?.bucket,
      });

      return new Task(taskRecord);
    } catch (err) {
      await this.prisma.task.update({
        where: { id: taskRecord.id },
        data: { status: taskStatus.error },
      });

      throw new InternalServerErrorException('Video upload error.');
    }
  }
}
