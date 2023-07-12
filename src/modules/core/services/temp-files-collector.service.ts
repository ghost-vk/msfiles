import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import to from 'await-to-js';
import { rm } from 'fs/promises';
import { Subject } from 'rxjs';

export type TmpFilesCollectorSubjPayload = {
  dir: string;
};

@Injectable()
export class TempFilesCollectorService implements OnModuleInit {
  public readonly tmpFilesCollectorSubj$ = new Subject<TmpFilesCollectorSubjPayload>();
  private readonly logger = new Logger(TempFilesCollectorService.name);

  onModuleInit(): void {
    this.tmpFilesCollectorSubj$.subscribe((event: TmpFilesCollectorSubjPayload) => this.process(event));
    this.logger.log('Subscribe for delete temp files...');
  }

  private async process(input: TmpFilesCollectorSubjPayload): Promise<void> {
    this.logger.log(`Start delete temp folder [${input.dir}].`);

    const [err] = await to(rm(input.dir, { recursive: true, force: true }));

    if (err) {
      this.logger.error(`Delete temp folder [${input.dir}] error.`, err);
    } else {
      this.logger.log(`Finish delete temp folder [${input.dir}].`);
    }
  }
}
