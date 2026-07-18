import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { env } from '../../config/env.js';
import { query } from '../../config/db.js';
import { AppError } from '../../middleware/errorHandler.js';

export const PDF_MIME = 'application/pdf';
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Files live on the VPS filesystem, reachable only through this module (PRD §6). */
function storageDir(): string {
  return path.resolve(env.CV_STORAGE_PATH ?? 'uploads');
}

export interface CvRow {
  id: string;
  user_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  extracted_text: string | null;
  created_at: string;
}

async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === PDF_MIME) {
    const parser = new PDFParse({ data: buffer });
    try {
      // pageJoiner: '' drops the default "-- 1 of N --" page markers, which
      // would otherwise leak into the CV text injected into the AI prompt.
      const result = await parser.getText({ pageJoiner: '' });
      return result.text.trim();
    } finally {
      await parser.destroy();
    }
  }
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}

export async function createCv(
  userId: string,
  file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
): Promise<CvRow> {
  let text: string;
  try {
    text = await extractText(file.buffer, file.mimetype);
  } catch {
    throw new AppError(400, 'Gagal membaca isi CV. Pastikan berkas tidak rusak atau terkunci.');
  }
  if (!text) {
    throw new AppError(
      400,
      'Tidak ada teks yang bisa diekstrak dari CV. Gunakan berkas berbasis teks (bukan hasil scan).',
    );
  }

  const ext = file.mimetype === PDF_MIME ? '.pdf' : '.docx';
  const storedFilename = `${randomUUID()}${ext}`;
  const dir = storageDir();
  await mkdir(dir, { recursive: true });
  const storedPath = path.join(dir, storedFilename);
  await writeFile(storedPath, file.buffer);

  try {
    const { rows } = await query<CvRow>(
      `INSERT INTO cv_documents (user_id, filename, stored_filename, mime_type, size_bytes, extracted_text)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id, filename, mime_type, size_bytes, extracted_text, created_at`,
      [userId, file.originalname, storedFilename, file.mimetype, file.size, text],
    );
    return rows[0];
  } catch (err) {
    await unlink(storedPath).catch(() => {});
    throw err;
  }
}

export async function getCv(userId: string, cvId: string): Promise<CvRow> {
  const { rows } = await query<CvRow>(
    `SELECT id, user_id, filename, mime_type, size_bytes, extracted_text, created_at
     FROM cv_documents WHERE id = $1 AND user_id = $2`,
    [cvId, userId],
  );
  const row = rows[0];
  if (!row) throw new AppError(404, 'CV tidak ditemukan.');
  return row;
}
