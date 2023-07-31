import { nanoid } from 'nanoid';
import { extname } from 'path';
import { slugify } from 'transliteration';

import { FileTypeEnum } from '../types';

export type GenerateFilenameOptions = {
  width?: number;
  height?: number;
  ext?: string;
  type?: FileTypeEnum;
};

export function generateFilename(original: string, options: GenerateFilenameOptions = {}): string {
  const origin = slugify(original, { lowercase: true, separator: '_' });
  const outDotExt = options.ext ? (options.ext.startsWith('.') ? options.ext : `.${options.ext}`) : undefined;
  const originDotExt = extname(origin);
  const ext = outDotExt ? outDotExt : originDotExt ? originDotExt : '';
  const base = originDotExt ? origin.replace(originDotExt, '') : origin;
  let size = '';

  if (options.width && options.height) {
    size = `_${options.width}x${options.height}`;
  }
  let uid: string;

  switch (options.type) {
    case FileTypeEnum.AltVideo: {
      uid = `_av`;
      break;
    }
    case FileTypeEnum.MainFile: {
      uid = `_mf`;
      break;
    }
    case FileTypeEnum.Preview: {
      uid = `_pr`;
      break;
    }
    case FileTypeEnum.Thumbnail: {
      uid = `_th`;
      break;
    }
    case FileTypeEnum.Part: {
      uid = `_pt`;
      break;
    }
    default: {
      uid = `_df`;
    }
  }
  uid += nanoid(6);

  return base + size + uid + ext;
}
