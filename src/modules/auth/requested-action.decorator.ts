import { CustomDecorator, SetMetadata } from '@nestjs/common';

import { actions } from '../config/actions';

/**
 * Function creates decorator which set request action metadata for check it in {@link ConcurrencyUploadGuard}.
 *
 * @example
 * @UseGuards(RoleGuard)
 * @RequestedAction(actions.uploadVideo)
 */
export const RequestedAction = (
  requestedAction: (typeof actions)[keyof typeof actions],
): CustomDecorator => SetMetadata('action', requestedAction);
