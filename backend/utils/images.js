import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AppError from './AppError.js';

const UPLOAD_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads');
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Detects the real type from the file's first bytes. The client-supplied name/MIME type is never trusted. */
export function detectImageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg' };
  if (buf.subarray(0, 8).equals(PNG_SIG)) return { ext: 'png' };
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return { ext: 'webp' };
  return null;
}

/** Validates every file first, so nothing is written if any one is bad. Returns public URL paths. */
export async function saveImages(files, subdir) {
  const checked = files.map((f) => {
    const type = detectImageType(f.buffer);
    if (!type) throw new AppError(`"${f.originalname}" is not a valid JPEG, PNG or WebP image`, 400);
    return { file: f, type };
  });

  const dir = path.join(UPLOAD_ROOT, subdir);
  await fs.mkdir(dir, { recursive: true });

  const saved = [];
  try {
    for (const { file, type } of checked) {
      const name = `${crypto.randomUUID()}.${type.ext}`; // random name: the original filename is discarded
      await fs.writeFile(path.join(dir, name), file.buffer, { flag: 'wx' });
      saved.push(`/uploads/${subdir}/${name}`);
    }
  } catch (err) {
    await deleteImages(saved);
    throw err;
  }
  return saved;
}

export async function deleteImages(urls = []) {
  for (const url of urls) {
    const full = path.resolve(UPLOAD_ROOT, url.replace(/^\/uploads\//, ''));
    if (!full.startsWith(UPLOAD_ROOT + path.sep)) continue; // never delete outside the uploads folder
    await fs.unlink(full).catch(() => {});
  }
}

export { UPLOAD_ROOT };
