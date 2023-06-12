import { isUUID } from 'class-validator';
import { isUndefined } from 'lodash';

import { isInEnum } from '../../utils/is-in-enum';
import { FileActionsEnum, isFileAction } from '../config/actions';

export type BooleanString = 'y' | 'n';

export enum ImageExtensionEnum {
  Png = 'png',
  Jpeg = 'jpeg',
  Jpg = 'jpg',
  Webp = 'webp',
}

export const isImageExtension = isInEnum(ImageExtensionEnum);

export type CompressImageBufferOptions = {
  quality?: number;
  ext?: ImageExtensionEnum;
} & Partial<Size>;

export enum VideoExtensionEnum {
  Webm = 'webm',
  Mp4 = 'mp4',
  Hls = 'hls',
}

export const isVideoExtension = isInEnum(VideoExtensionEnum);

export type Size = {
  width: number;
  height: number;
};

export type CreateUploadUrlCacheData = {
  action: FileActionsEnum;
  bucket?: string;
  used?: boolean;
  uid: string;
};

export function isCreateUploadUrlCacheData(obj: unknown): obj is CreateUploadUrlCacheData {
  if (typeof obj !== 'object') return false;
  if (obj === null) return false;
  if (!isFileAction(obj['action'])) return false;
  if (!isUndefined(obj['bucket']) && typeof obj['bucket'] !== 'string') return false;
  if (!isUndefined(obj['used']) && typeof obj['used'] !== 'boolean') return false;
  if (!isUUID(obj['uid'])) return false;

  return true;
}

export type PutObjectResult = {
  objectname: string;
  size: number;
  metadata: Record<string, string>;
  bucket: string;
};

export enum FileTypeEnum {
  MainFile = 'MainFile',
  Thumbnail = 'Thumbnail',
  AltVideo = 'AltVideo',
  Preview = 'Preview',
  Part = 'Part',
}

export const isFileType = isInEnum(FileTypeEnum);
