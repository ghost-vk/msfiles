import { readFile } from 'fs/promises';

export async function getBuffer(filePathOrBuffer: string | Buffer): Promise<Buffer> {
  if (typeof filePathOrBuffer === 'string') {
    return readFile(filePathOrBuffer);
  }

  return filePathOrBuffer;
}
