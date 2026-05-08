import multer from 'multer';

import { AppError } from '../lib/errors';

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const ALLOWED_EXT = new Set(['txt', 'md', 'markdown', 'pdf', 'docx']);
const ALLOWED_MIME = new Set([
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream',
]);

export const sourceUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter(_req, file, cb) {
    const ext = file.originalname.toLowerCase().split('.').pop();
    if ((ext && ALLOWED_EXT.has(ext)) || (file.mimetype && ALLOWED_MIME.has(file.mimetype))) {
      cb(null, true);
      return;
    }
    cb(new AppError(415, 'unsupported_media_type', `unsupported file type: ${file.mimetype}`));
  },
}).single('file');
