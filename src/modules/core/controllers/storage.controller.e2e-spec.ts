import { CACHE_MANAGER, HttpServer, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Channel, connect, Connection } from 'amqplib';
import { Cache } from 'cache-manager';
import { randomUUID } from 'crypto';
import path from 'path';
import { createClient, RedisClientType } from 'redis';
import request from 'supertest';

import { consumeMessagesFromExchange } from '../../../../tests/utils/consume-messages-from-exchange';
import { createUploadKey } from '../../../../tests/utils/create-upload-key';
import { setup, TestConfig } from '../../../../tests/utils/setup-app';
import { sleep } from '../../../utils/sleep';
import { FileActionsEnum, TaskStatusEnum } from '../../config/actions';
import { AppConfig } from '../../config/types';
import { PrismaService } from '../../prisma/prisma.service';
import { MinioService } from '../services/minio.service';
import { ThumbnailMakerService } from '../services/thumbnail-maker.service';
import { FileTypeEnum } from '../types';

describe('Storage controller (external endpoint)', () => {
  let app: INestApplication;
  let server: HttpServer;
  let prisma: PrismaService;
  let config: ConfigService<AppConfig, true>;
  let redis: Cache;
  let redisClient: RedisClientType;
  let minio: MinioService;
  let connection: Connection;
  let channel: Channel;

  const taskStartMessages: string[] = [];
  const uploadedFilesMessages: string[] = [];
  const taskCompletedMessages: string[] = [];
  const uploadedImageMessages: string[] = [];

  beforeAll(async () => {
    const testConfig: TestConfig = await setup();

    app = testConfig.app;
    server = testConfig.server;
    prisma = testConfig.prisma;
    config = testConfig.config;
    redis = testConfig.app.get<Cache>(CACHE_MANAGER);
    redisClient = createClient({
      url: `redis://:${config.get('REDIS_PASSWORD')}@${config.get('REDIS_HOST')}:${config.get('REDIS_PORT')}`,
    });
    await redisClient.connect();
    minio = testConfig.app.get<MinioService>(MinioService);

    const user = config.get('RABBITMQ_USER');
    const password = config.get('RABBITMQ_PASSWORD');
    const host = config.get('RABBITMQ_HOST');
    const port = config.get('RABBITMQ_PORT');

    connection = await connect(`amqp://${user}:${password}@${host}:${port}`);
    channel = await connection.createChannel();

    // Будет ругаться если некуда отправлять сообщения
    await channel.assertExchange('core', 'topic', { durable: false });
    // Готовим очереди для имитации потребителя
    await channel.assertQueue('task_start_queue');
    await channel.bindQueue('task_start_queue', 'core', 'task_start');
    await channel.assertQueue('uploaded_file_queue');
    await channel.bindQueue('uploaded_file_queue', 'core', 'uploaded_file');
    await channel.assertQueue('task_completed_queue');
    await channel.bindQueue('task_completed_queue', 'core', 'task_completed');
    await channel.assertQueue('uploaded_image_queue');
    await channel.bindQueue('uploaded_image_queue', 'core', 'uploaded_image');
    await consumeMessagesFromExchange(channel, {
      exchange: 'core',
      queue: 'task_start_queue',
      messages: taskStartMessages,
    });

    await consumeMessagesFromExchange(channel, {
      exchange: 'core',
      queue: 'uploaded_file_queue',
      messages: uploadedFilesMessages,
    });

    await consumeMessagesFromExchange(channel, {
      exchange: 'core',
      queue: 'task_completed_queue',
      messages: taskCompletedMessages,
    });

    await consumeMessagesFromExchange(channel, {
      exchange: 'core',
      queue: 'uploaded_image_queue',
      messages: uploadedImageMessages,
    });
  });

  afterEach(async () => {
    await redisClient.flushAll();
  });

  afterAll(async () => {
    await redisClient.disconnect();
    await channel.close();
    await connection.close();
  });

  describe('POST: /storage/uploadFile/:key', () => {
    afterEach(() => {
      while (taskStartMessages.length) {
        taskStartMessages.pop();
      }
      while (uploadedFilesMessages.length) {
        uploadedFilesMessages.pop();
      }
      while (taskCompletedMessages.length) {
        taskCompletedMessages.pop();
      }
    });

    it('should fail request with wrong file key', async () => {
      const wrongKey = 'qwerty123';
      const { body } = await request(server).post(`/storage/uploadFile/${wrongKey}`).send().expect(403);

      expect(body).toEqual(
        expect.objectContaining({ statusCode: 403, message: 'Forbidden resource', error: 'Forbidden' }),
      );
    });

    it('should fail without passed object', async () => {
      const { key } = await createUploadKey({
        config,
        redis,
        urlConfig: { action: FileActionsEnum.UploadFile, uid: randomUUID() },
      });

      const { body } = await request(server).post(`/storage/uploadFile/${key}`).send().expect(400);

      expect(body).toEqual(
        expect.objectContaining({
          statusCode: 400,
          message: 'File required to upload.',
          error: 'Bad Request',
        }),
      );
    });

    it('should successfully upload pdf file', async () => {
      const uid = randomUUID();
      const { key } = await createUploadKey({
        config,
        redis,
        urlConfig: { action: FileActionsEnum.UploadFile, uid, bucket: config.get('MINIO_BUCKET') },
      });

      const redisRecJson = await redis.get<string>(key);

      if (!redisRecJson) throw new Error('Expect record saved in redis.');
      expect(typeof redisRecJson === 'string').toBe(true);

      const redisRec = JSON.parse(redisRecJson);

      expect(redisRec).toEqual(
        expect.objectContaining({
          action: FileActionsEnum.UploadFile,
          uid,
          bucket: config.get('MINIO_BUCKET'),
        }),
      );

      expect(redisRec.used).toBeFalsy();

      const { body } = await request(server)
        .post(`/storage/uploadFile/${key}`)
        .attach('file', path.resolve(__dirname, '..', '..', '..', '..', 'tests', 'files', 'test.pdf'))
        .expect(201);

      // После выполнения запроса ключ на загрузку должен быть удален или отмечен использованным
      const redisRecAfterRequestJson = await redis.get<string>(key);

      if (redisRecAfterRequestJson) {
        expect(JSON.parse(redisRecAfterRequestJson).used).toBe(true);
      }

      expect(body).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          uid: uid,
          status: TaskStatusEnum.InProgress,
          action: FileActionsEnum.UploadFile,
          originalname: 'test.pdf',
          bucket: config.get('MINIO_BUCKET'),
          parameters: null,
          created_at: expect.any(String),
          updated_at: expect.any(String),
        }),
      );

      let task = await prisma.task.findUniqueOrThrow({ where: { id: body.id } });

      expect(task).toEqual(
        expect.objectContaining({
          id: body.id,
          uid: uid,
          status: TaskStatusEnum.InProgress,
          action: FileActionsEnum.UploadFile,
          originalname: 'test.pdf',
          bucket: config.get('MINIO_BUCKET'),
          parameters: null,
          created_at: expect.any(Date),
          updated_at: expect.any(Date),
        }),
      );

      // Подождем пока загрузится файл
      const deadline = new Date();

      deadline.setSeconds(deadline.getSeconds() + 10);

      while (task.status !== TaskStatusEnum.Done) {
        await sleep(500);
        task = await prisma.task.findUniqueOrThrow({ where: { id: body.id } });
        if (new Date() > deadline) {
          throw new Error('Time is up.');
        }
      }

      const files = await prisma.s3Object.findMany({ where: { task_id: body.id } });

      expect(files.length).toBe(1);

      expect(files[0]).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          task_id: body.id,
          main: true,
          objectname: expect.stringMatching(/^test_mf.{6}\.pdf$/),
          bucket: config.get('MINIO_BUCKET'),
          size: expect.any(String),
          created_at: expect.any(Date),
          updated_at: expect.any(Date),
        }),
      );

      const completedTask = await prisma.task.findUniqueOrThrow({ where: { id: body.id } });

      expect(completedTask).toEqual(expect.objectContaining({ status: TaskStatusEnum.Done }));

      // Проверим что файл загружен в minio
      const obj = await minio.getFileStat(files[0].objectname, { bucket: config.get('MINIO_BUCKET') });

      expect(obj).toBeTruthy();

      expect(taskStartMessages.length).toBe(1);

      expect(taskStartMessages[0]).toEqual(
        expect.objectContaining({
          task_id: completedTask.id,
          uid: uid,
          action: FileActionsEnum.UploadFile,
          status: TaskStatusEnum.InProgress,
          created_at: expect.any(String),
        }),
      );

      expect(uploadedFilesMessages.length).toBe(1);

      expect(uploadedFilesMessages[0]).toEqual(
        expect.objectContaining({
          action: FileActionsEnum.UploadFile,
          status: TaskStatusEnum.InProgress,
          objectname: files[0].objectname,
          originalname: 'test.pdf',
          size: obj.size,
          type: FileTypeEnum.MainFile,
          bucket: config.get('MINIO_BUCKET'),
          task_id: completedTask.id,
          created_at: expect.any(String),
          uid: uid,
        }),
      );

      await sleep(1000);
      expect(taskCompletedMessages.length).toBe(1);

      expect(taskCompletedMessages[0]).toEqual(
        expect.objectContaining({
          action: FileActionsEnum.UploadFile,
          status: TaskStatusEnum.Done,
          task_id: completedTask.id,
          uid: uid,
        }),
      );
    });
  });

  describe('POST: /storage/uploadImage/:key', () => {
    afterEach(() => {
      while (taskStartMessages.length) {
        taskStartMessages.pop();
      }
      while (uploadedFilesMessages.length) {
        uploadedFilesMessages.pop();
      }
      while (taskCompletedMessages.length) {
        taskCompletedMessages.pop();
      }
    });

    it('should fail request with wrong file key', async () => {
      const wrongKey = 'qwerty123';
      const { body } = await request(server).post(`/storage/uploadImage/${wrongKey}`).send().expect(403);

      expect(body).toEqual(
        expect.objectContaining({ statusCode: 403, message: 'Forbidden resource', error: 'Forbidden' }),
      );
    });

    it('should fail without passed object', async () => {
      const { key } = await createUploadKey({
        config,
        redis,
        urlConfig: { action: FileActionsEnum.UploadImage, uid: randomUUID() },
      });

      const { body } = await request(server).post(`/storage/uploadImage/${key}`).send().expect(400);

      expect(body).toEqual(
        expect.objectContaining({
          statusCode: 400,
          message: 'File required to upload',
          error: 'Bad Request',
        }),
      );
    });

    it('should successfully upload jpg file with default params', async () => {
      const uid = randomUUID();
      const { key } = await createUploadKey({
        config,
        redis,
        urlConfig: { action: FileActionsEnum.UploadImage, uid, bucket: config.get('MINIO_BUCKET') },
      });

      const redisRecJson = await redis.get<string>(key);

      if (!redisRecJson) throw new Error('Expect record saved in redis.');
      expect(typeof redisRecJson === 'string').toBe(true);

      const redisRec = JSON.parse(redisRecJson);

      expect(redisRec).toEqual(
        expect.objectContaining({
          action: FileActionsEnum.UploadImage,
          uid,
          bucket: config.get('MINIO_BUCKET'),
        }),
      );

      expect(redisRec.used).toBeFalsy();

      const { body } = await request(server)
        .post(`/storage/uploadImage/${key}`)
        .attach('file', path.resolve(__dirname, '..', '..', '..', '..', 'tests', 'files', 'test.jpg'))
        .expect(201);

      // После выполнения запроса ключ на загрузку должен быть удален или отмечен использованным
      const redisRecAfterRequestJson = await redis.get<string>(key);

      if (redisRecAfterRequestJson) {
        expect(JSON.parse(redisRecAfterRequestJson).used).toBe(true);
      }

      expect(body).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          uid: uid,
          status: TaskStatusEnum.InProgress,
          action: FileActionsEnum.UploadImage,
          originalname: 'test.jpg',
          bucket: config.get('MINIO_BUCKET'),
          parameters: '{}',
          created_at: expect.any(String),
          updated_at: expect.any(String),
        }),
      );

      let task = await prisma.task.findUniqueOrThrow({ where: { id: body.id } });

      expect(task).toEqual(
        expect.objectContaining({
          id: body.id,
          uid: uid,
          status: TaskStatusEnum.InProgress,
          action: FileActionsEnum.UploadImage,
          originalname: 'test.jpg',
          bucket: config.get('MINIO_BUCKET'),
          parameters: '{}',
          created_at: expect.any(Date),
          updated_at: expect.any(Date),
        }),
      );

      const deadline = new Date();

      deadline.setSeconds(deadline.getSeconds() + 10);

      while (task.status !== TaskStatusEnum.Done) {
        await sleep(500);
        task = await prisma.task.findUniqueOrThrow({ where: { id: body.id } });
        if (new Date() > deadline) {
          throw new Error('Time is up.');
        }
      }

      const files = await prisma.s3Object.findMany({ where: { task_id: body.id }, orderBy: { created_at: 'desc' } });

      const thumbnailMaker = app.get(ThumbnailMakerService);

      expect(files.length).toBe(thumbnailMaker.thumnailsCount + 1);

      expect(files).toEqual(
        expect.arrayContaining([
          // {"bucket": "msfiles", "created_at": 2023-06-12T16:22:01.287Z, "id": 31, "main": false, "objectname": "test_300x300_thAiK9P0.webp", "size": "14176", "task_id": 37, "updated_at": 2023-06-12T16:22:01.287Z}
          // {"bucket": "msfiles", "created_at": 2023-06-12T16:22:01.202Z, "id": 30, "main": true, "objectname": "test_1200x1200_mfL2ymql.webp", "size": "197816", "task_id": 37, "updated_at": 2023-06-12T16:22:01.202Z}
          expect.objectContaining({
            id: expect.any(Number),
            task_id: body.id,
            main: true,
            objectname: expect.stringMatching(/^test_(\d{2,4}x\d{2,4})_mf.{6}\.webp$/),
            bucket: config.get('MINIO_BUCKET'),
            size: expect.any(String),
            created_at: expect.any(Date),
            updated_at: expect.any(Date),
          }),
          expect.objectContaining({
            id: expect.any(Number),
            task_id: body.id,
            main: false,
            objectname: expect.stringMatching(/^test_(\d{2,4}x\d{2,4})_th.{6}\.webp$/),
            bucket: config.get('MINIO_BUCKET'),
            size: expect.any(String),
            created_at: expect.any(Date),
            updated_at: expect.any(Date),
          }),
        ]),
      );

      expect(task).toEqual(expect.objectContaining({ status: TaskStatusEnum.Done }));

      // Проверим что файлы загружены в minio
      const obj1 = await minio.getFileStat(files[0].objectname, { bucket: config.get('MINIO_BUCKET') });
      const obj2 = await minio.getFileStat(files[1].objectname, { bucket: config.get('MINIO_BUCKET') });

      expect(obj1).toBeTruthy();
      expect(obj2).toBeTruthy();

      expect(taskStartMessages.length).toBe(1);

      expect(taskStartMessages[0]).toEqual(
        expect.objectContaining({
          task_id: task.id,
          uid: uid,
          action: FileActionsEnum.UploadImage,
          status: TaskStatusEnum.InProgress,
          created_at: expect.any(String),
        }),
      );

      expect(uploadedImageMessages.length).toBe(2);

      const mainFile = files.find((f) => f.main === true);

      if (!mainFile) throw Error('Main file not set.');

      expect(uploadedImageMessages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: FileActionsEnum.UploadImage,
            status: TaskStatusEnum.InProgress,
            objectname: mainFile.objectname,
            originalname: 'test.jpg',
            size: Number(mainFile.size),
            type: FileTypeEnum.MainFile,
            bucket: config.get('MINIO_BUCKET'),
            task_id: task.id,
            created_at: expect.any(String),
            uid: uid,
          }),
        ]),
      );

      if (thumbnailMaker.thumnailsCount > 0) {
        const thumbnailObjs = await prisma.s3Object.findMany({
          where: { task_id: task.id, main: false },
        });

        expect(thumbnailObjs.length).toBe(thumbnailMaker.thumnailsCount);
        let i = 0;

        while (i < thumbnailMaker.thumnailsCount) {
          const obj = thumbnailObjs[i];

          expect(uploadedImageMessages).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                action: FileActionsEnum.UploadImage,
                status: TaskStatusEnum.InProgress,
                objectname: obj.objectname,
                originalname: 'test.jpg',
                size: Number(obj.size),
                type: FileTypeEnum.Thumbnail,
                bucket: config.get('MINIO_BUCKET'),
                task_id: task.id,
                created_at: expect.any(String),
                uid: uid,
              }),
            ]),
          );
          i += 1;
        }
      }

      await sleep(1000);

      expect(taskCompletedMessages.length).toBe(1);

      expect(taskCompletedMessages[0]).toEqual(
        expect.objectContaining({
          action: FileActionsEnum.UploadImage,
          status: TaskStatusEnum.Done,
          task_id: task.id,
          uid: uid,
        }),
      );
    });
  });
});
