import { mkdtemp, writeFile } from 'fs/promises';
import { nanoid } from 'nanoid';
import { join } from 'path';

export type SaveBufferToTmpOptions = {
  filename?: string;
  tmpDir?: string;
};

export async function saveBufferToTmp(buffer: Buffer, options: SaveBufferToTmpOptions = {}): Promise<string> {
  const flname = options.filename ? options.filename : nanoid(12);
  const tmpDir = options.tmpDir ?? (await mkdtemp(join('/tmp/', '')));
  const filePath = join(tmpDir, flname);

  await writeFile(filePath, buffer);

  return filePath;
}
