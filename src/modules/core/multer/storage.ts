import { mkdtemp } from 'fs/promises';
import multer from 'multer';
import { nanoid } from 'nanoid';
import { tmpdir } from 'os';
import { join } from 'path';

import { generateFilename } from '../functions/generate-filename';

export const diskStorage = multer.diskStorage({
  destination: async function (req, file, cb) {
    const dir = await mkdtemp(join(tmpdir(), nanoid(6)));

    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, generateFilename(file.originalname));
  },
});
