import { FileActionsEnum, TaskStatusEnum } from '../../config/actions';
import { FileTypeEnum } from '../types';

export type MsgFileUpload = {
  action: FileActionsEnum;
  status: TaskStatusEnum;
  objectname: string;
  originalname: string;
  size: string;
  type: FileTypeEnum;
  metadata?: Record<string, unknown>;
  height?: number;
  width?: number;
  bucket: string;
  task_id: number;
  uid: string;
  created_at: Date;
};

export type MsgTaskError = {
  task_id: number;
  action: FileActionsEnum;
  created_at: Date;
  message?: string;
  metadata?: Record<string, unknown>;
  uid: string;
  status: TaskStatusEnum;
};

export type MsgTaskCompleted = {
  task_id: number;
  uid: string;
  status: TaskStatusEnum;
  action: FileActionsEnum;
  total_size: string;
};

export type MsgTaskStart = {
  task_id: number;
  uid: string;
  status: TaskStatusEnum;
  action: FileActionsEnum;
  created_at: Date;
};
