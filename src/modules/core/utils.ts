import { nanoid } from 'nanoid';
import { slugify } from 'transliteration';

export function getFileExtension(filename: string): string | undefined {
  const lastDotIndex = filename.lastIndexOf('.');

  if (lastDotIndex === -1) {
    return undefined;
  }

  return filename.slice(lastDotIndex + 1);
}

export function getFilenameWithoutExtension(originalname: string): string {
  const ext = getFileExtension(originalname);

  if (!ext) return originalname;

  return originalname.split('.' + ext)[0];
}

export type NormalizeFilenameOptions = {
  width?: number;
  height?: number;
  unique?: boolean;
};

export function normalizeFilename(
  original: string,
  options: NormalizeFilenameOptions = { unique: true },
): string {
  let slug = slugify(original, { lowercase: true, separator: '_' });

  const fileExt = getFileExtension(slug);
  const fileDotExt = fileExt ? '.' + fileExt : null;

  if (options.width && options.height && fileDotExt) {
    const withoutExt = slug.replace(fileDotExt, '');

    slug = withoutExt + '_' + options.width + 'x' + options.height + fileDotExt;
  }

  if (options.unique) {
    const withoutExt = fileDotExt ? slug.replace(fileDotExt, '') : slug;

    slug = withoutExt + '_' + nanoid(6);
    slug += fileDotExt ? fileDotExt : '';
  }

  return slug;
}
