import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PrismaService } from '../../services/prisma.service';
import { taskStatus } from '../config/actions';
import { AuthContext } from './types';

/**
 * Guard function checks roles in user context.
 * Use it with {@link RequiredRoles}.
 */
@Injectable()
export class ConcurrencyUploadGuard implements CanActivate {
  private readonly logger = new Logger(ConcurrencyUploadGuard.name);

  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ctx: AuthContext = context.switchToHttp().getRequest();

    if (!ctx.user || !ctx.user.user_id) {
      throw new UnauthorizedException('Authentication required');
    }

    const requestedAction = this.reflector.get('action', context.getHandler());

    if (!requestedAction) {
      this.logger.warn(
        'Decorator @ConcurrencyUploadGuard is used but requested action not found. Pass it with decorator @RequestedAction.',
      );

      return true;
    }

    const userActiveTaskCount = await this.prisma.task.count({
      where: {
        actor: String(ctx.user.user_id),
        action: requestedAction,
        status: taskStatus.inProgress,
      },
    });

    if (userActiveTaskCount > 0) {
      this.logger.warn(`User [${ctx.user.user_id}] try to act [${requestedAction}] concurrently.`);

      throw new ForbiddenException(
        `Only 1 simultaneously action [${requestedAction}] is available.`,
      );
    }

    return true;
  }
}
