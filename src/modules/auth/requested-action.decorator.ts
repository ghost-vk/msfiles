import { CustomDecorator, SetMetadata } from '@nestjs/common';

import { FileActionsEnum } from '../config/actions';

/**
 * Function creates decorator which set request action metadata for check it in {@link ConcurrencyUploadGuard}.
 *
 * @example
 * @UseGuards(RoleGuard)
 * @RequestedAction(actions.uploadVideo)
 */
export const RequestedAction = (requestedAction: FileActionsEnum): CustomDecorator =>
  SetMetadata('action', requestedAction);
