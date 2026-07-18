import { Router, type RequestHandler } from 'express';
import multer, { MulterError } from 'multer';
import path from 'node:path';
import { env } from '../../config/env.js';
import { AppError } from '../../middleware/errorHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getOne, upload } from './cv.controller.js';
import { DOCX_MIME, PDF_MIME } from './cv.service.js';

/**
 * Memory storage: the buffer is needed anyway for text extraction, and the
 * ≤5MB limit (enforced by multer below) keeps memory use bounded. The file
 * only touches disk after validation + extraction succeed (cv.service).
 */
const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.CV_MAX_SIZE_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const okPdf = file.mimetype === PDF_MIME && ext === '.pdf';
    const okDocx = file.mimetype === DOCX_MIME && ext === '.docx';
    if (okPdf || okDocx) cb(null, true);
    else cb(new AppError(400, 'Format CV harus PDF atau DOCX.'));
  },
});

/** Translates multer's size-limit error into the app's 400 shape. */
const acceptCvFile: RequestHandler = (req, res, next) => {
  multerUpload.single('file')(req, res, (err: unknown) => {
    if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
      next(new AppError(400, `Ukuran CV maksimal ${env.CV_MAX_SIZE_MB}MB.`));
    } else {
      next(err);
    }
  });
};

export const cvRouter = Router();

cvRouter.use(requireAuth);

cvRouter.post('/', acceptCvFile, asyncHandler(upload));
cvRouter.get('/:id', asyncHandler(getOne));
