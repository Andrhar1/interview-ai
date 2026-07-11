import type { Request, Response } from 'express';
import { listJobFields } from './jobFields.service.js';

export async function list(_req: Request, res: Response) {
  const jobFields = await listJobFields();
  res.json({ jobFields });
}
