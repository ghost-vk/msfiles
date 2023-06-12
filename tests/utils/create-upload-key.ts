import { ConfigService } from '@nestjs/config';
import { Cache } from 'cache-manager';
import { nanoid } from 'nanoid';

import { FileActionsEnum } from '../../src/modules/config/actions';
import { AppConfig } from '../../src/modules/config/types';
import { CreateUploadUrlCacheData } from '../../src/modules/core/types';

export type CreateUploadKeyParams = {
  redis: Cache;
  config: ConfigService<AppConfig, true>;
  urlConfig: {
    uid: string;
    action: FileActionsEnum;
    bucket?: string;
  };
};
export const createUploadKey = async (params: CreateUploadKeyParams): Promise<{ url: string; key: string }> => {
  const data: CreateUploadUrlCacheData = {
    action: params.urlConfig.action,
    uid: params.urlConfig.uid,
  };

  if (params.urlConfig.bucket) data.bucket = params.urlConfig.bucket;

  const key = nanoid(10);

  await params.redis.set(key, JSON.stringify(data), 30000);
  let route: string;

  switch (params.urlConfig.action) {
    case FileActionsEnum.UploadFile: {
      route = 'uploadFile';
      break;
    }
    case FileActionsEnum.UploadImage: {
      route = 'uploadImage';
      break;
    }
    case FileActionsEnum.UploadVideo: {
      route = 'uploadVideo';
      break;
    }
  }

  const url = params.config.get('BASE_URL') + `/storage/${route}/${key}`;

  return { url, key };
};
