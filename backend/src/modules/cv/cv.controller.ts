import type { Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../middleware/errorHandler.js';
import { createCv, getCv } from './cv.service.js';

export async function upload(req: Request, res: Response) {
  if (!req.file) {
    throw new AppError(400, 'Berkas CV wajib diunggah (field "file").');
  }
  const cv = await createCv(req.user!.sub, req.file);
  res.status(201).json({
    cv_id: cv.id,
    filename: cv.filename,
    size_bytes: cv.size_bytes,
    extracted_text: cv.extracted_text,
  });
}

export async function getOne(req: Request, res: Response) {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) throw new AppError(404, 'CV tidak ditemukan.');
  const cv = await getCv(req.user!.sub, id.data);
  res.json({
    cv_id: cv.id,
    filename: cv.filename,
    mime_type: cv.mime_type,
    size_bytes: cv.size_bytes,
    extracted_text: cv.extracted_text,
    created_at: cv.created_at,
  });
}
