import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { UserAuthPayload } from './types';

export const CurrentUser = createParamDecorator(
  (_data, context: ExecutionContext): UserAuthPayload => {
    const ctx = context.switchToHttp().getRequest();

    return ctx.user;
  },
);
