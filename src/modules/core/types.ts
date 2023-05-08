import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

import { actions } from '../config/actions';
import { splitByComma } from '../config/utils';

export type ImageExtensions = 'png' | 'jpeg' | 'webp';

export type ImageSize = {
  width: number;
  height: number;
};

export type CompressImageBufferOptions = {
  quality?: number;
  ext?: ImageExtensions;
} & Partial<ImageSize>;

export type VideoExtensions = 'webm' | 'mp4' | 'hls';

export type VideoSize = {
  width: number;
  height: number;
};

export type VideoConversionPayload = {
  originalname: string;
  ext: VideoExtensions;
  dir: string;
  filename: string;
  compress?: string;
  task_id: number;
  sizes?: VideoSize[];
  actor: number | string;
  bucket?: string;
};

export type ImageConversionPayload = {
  originalname: string;
  ext: ImageExtensions;
  dir: string;
  filename: string;
  task_id: number;
  quality?: number;
  actor: number | string;
  bucket?: string;
} & Partial<ImageSize>;

export class CreateUploadUrlPayload {
  @IsNotEmpty()
  @IsString()
  @IsIn(Object.values(actions))
  action: (typeof actions)[keyof typeof actions];

  @IsInt()
  @Transform(({ value }) => Number(value))
  user_id: number;

  @IsIn(
    process.env.MINIO_ADDITIONAL_BUCKETS ? splitByComma(process.env.MINIO_ADDITIONAL_BUCKETS) : [],
  )
  @IsOptional()
  bucket?: string;
}

export type CreateUploadUrlCacheData = {
  action: typeof actions[keyof typeof actions];
  user_id: string | number;
  bucket?: string;
  used?: boolean;
};

export class DeleteObjectsPayload {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @ArrayMinSize(1)
  objects: string[];
}

export class RemoveTemporaryTagPayload {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @ArrayMinSize(1)
  objects: string[];
}

export type PutObjectResult = {
  objectname: string;
  size: number;
  metadata: Record<string, string>;
  bucket: string;
};

export type FileType = 'mainFile' | 'thumbnail' | 'altVideo' | 'preview';

export type MessageUploadPayload = {
  action: typeof actions[keyof typeof actions];
  objectname: string;
  originalname: string;
  size: number;
  type: FileType;
  metadata?: Record<string, unknown>;
  height?: number;
  width?: number;
  bucket: string;
  task_id: number;
  created_at: Date;
  actor: string | number;
};

export type MessageAsyncUploadError = {
  task_id: number;
  action: typeof actions[keyof typeof actions];
  created_at: Date;
  actor: string | number;
  message?: string;
  metadata?: Record<string, unknown>;
}

export type ObjectMetadata = {
  actor?: number | string;
  height?: number;
  width?: number;
};

export type TaskCompletedPayload = {
  task_id: number;
}

export type ProcessImageOptions = {
  quality?: number;
  width?: number;
  height?: number;
  fit?: 'contain' | 'cover' | 'fill' | 'inside' | 'outside';
};

