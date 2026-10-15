import multer from 'multer';
import AppError from '../utils/AppError.js';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB per image

// Files are kept in memory, then verified by magic bytes in utils/images.js before anything touches the disk.
const make = (limits) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_BYTES, ...limits },
    fileFilter: (_req, file, cb) =>
      ALLOWED.includes(file.mimetype) ? cb(null, true) : cb(new AppError('Only JPEG, PNG or WebP images are allowed', 400)),
  });

export const uploadItemImages = make({ files: 5 }).array('images', 5);
export const uploadAvatar = make({ files: 1 }).single('avatar');
