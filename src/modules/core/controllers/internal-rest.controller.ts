import { BadRequestException, Controller, Get, Logger, Query } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { Task } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { GetObjectUrlDto } from '../dtos/get-object-url.dto';
import { GetTasksDto } from '../dtos/get-task.dto';
import { MinioService } from '../services/minio.service';

@Controller()
export class InternalRestController {
  private readonly logger = new Logger(InternalRestController.name);

  constructor(private readonly minioService: MinioService, private readonly prisma: PrismaService) {}

  @Get('tasks')
  @ApiExcludeEndpoint()
  getTasks(@Query() args: GetTasksDto): Promise<Task[]> {
    try {
      return this.prisma.task.findMany({
        where: {
          action: { in: args.actions },
          originalname: { in: args.originalnames },
          status: { in: args.statuses },
          id: { in: args.ids },
        },
      });
    } catch (err) {
      this.logger.error(`Get task error: ${err.message}. Parameters: ${JSON.stringify(args, null, 2)}.`, err?.stack);

      throw new BadRequestException('Check your input.');
    }
  }

  @Get('object_url')
  @ApiExcludeEndpoint()
  async getObjectUrl(@Query() args: GetObjectUrlDto): Promise<{ url: string }> {
    this.logger.log(
      `Internal object URL request for [${args.objectname}]. Arguments: ${JSON.stringify(args, null, 2)}.`,
    );

    const url = await this.minioService.getObjectUrl(args.objectname, { bucket: args.bucket });

    return { url };
  }
}
