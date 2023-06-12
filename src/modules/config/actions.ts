import { isInEnum } from '../../utils/is-in-enum';

export enum FileActionsEnum {
  UploadImage = 'UploadImage',
  UploadVideo = 'UploadVideo',
  UploadFile = 'UploadFile',
}

export const isFileAction = isInEnum(FileActionsEnum);

export enum TaskStatusEnum {
  Done = 'Done',
  InProgress = 'InProgress',
  Error = 'Error',
}

export const isTaskStatus = isInEnum(TaskStatusEnum);
