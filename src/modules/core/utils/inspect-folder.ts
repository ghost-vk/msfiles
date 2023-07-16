import { Logger } from '@nestjs/common';
import { readdir, stat } from 'fs/promises';

const filePrefix = '| ';

export async function inspectFolder(folderPath, logger: Logger, level = 1): Promise<string[] | undefined> {
  try {
    const files = await readdir(folderPath);
    const lines: string[] = [];

    if (level === 1) {
      lines.push(folderPath + '/');
    }

    for (const file of files) {
      const filePath = `${folderPath}/${file}`;
      const stats = await stat(filePath);

      if (stats.isDirectory()) {
        lines.push(`${filePrefix.repeat(level)}${file}/`);
        const inner = await inspectFolder(filePath, logger, level + 1);

        if (inner) lines.push(...inner);
      } else if (stats.isFile()) {
        lines.push(`${filePrefix.repeat(level)}${file}`);
      }
    }

    if (level === 1) {
      logger.debug(`Inspect folder [${folderPath}]:\n${lines.join('\n')}`);
    }

    return lines;
  } catch (err) {
    logger.error('Inspect folder error:', err);
  }
}
