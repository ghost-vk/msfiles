import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import to from 'await-to-js';
import { Subject } from 'rxjs';

import { sleep } from '../../../utils/sleep';
import { PrismaService } from '../../prisma/prisma.service';
import { MinioService } from './minio.service';

export type TempTagRemovePayload = {
  objectnames: string[];
  bucket: string;
};

@Injectable()
export class TempTagRemoverService implements OnModuleInit {
  public readonly tempTagRemoverSubj$ = new Subject<TempTagRemovePayload>();
  private readonly logger = new Logger(TempTagRemoverService.name);

  constructor(private readonly minioService: MinioService, private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.tempTagRemoverSubj$.subscribe(async (event: TempTagRemovePayload) => {
      this.logger.log(`Got event: remove temporary tag. Payload: ${JSON.stringify(event, null, 2)}.`);
      await this.process(event);
    });
  }

  public async process(input: TempTagRemovePayload): Promise<void> {
    await Promise.all(
      input.objectnames.map(async (objname) => {
        let [err] = await to(this.minioService.removeTemporaryTag(objname, { bucket: input.bucket }));

        if (!err) {
          this.logger.log(`Removed temporary tag from [${objname}].`);

          return;
        }

        const sleepMs = 1000;

        this.logger.warn(`Error remove temporary tag of object [${objname}]. Retry after ${sleepMs}.`);
        await sleep(sleepMs);

        [err] = await to(this.minioService.removeTemporaryTag(objname, { bucket: input.bucket }));

        if (!err) {
          this.logger.log(`Removed temporary tag from [${objname}].`);

          return;
        }

        this.logger.error(`Error remove temporary tag of object [${objname}].`);

        // todo send email notification
      }),
    );
  }

  public async rmTempTagHandledTaskAsync(taskId: number, bucket: string): Promise<void> {
    const objs = await this.prisma.s3Object.findMany({
      where: { task_id: taskId },
      select: { objectname: true },
    });

    this.tempTagRemoverSubj$.next({
      bucket,
      objectnames: objs.map((o) => o.objectname),
    });
  }
}
