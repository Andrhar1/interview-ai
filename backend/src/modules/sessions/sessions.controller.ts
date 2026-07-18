import type { Request, Response } from 'express';
import { buildSystemInstruction, createEphemeralToken } from '../gemini/gemini.service.js';
import { analyzeSchema, createSessionSchema, endSessionSchema } from './sessions.schema.js';
import {
  analyzeSession,
  createSession,
  deleteSession,
  endSession,
  getSession,
  getSessionForToken,
  listSessions,
} from './sessions.service.js';

export async function create(req: Request, res: Response) {
  const input = createSessionSchema.parse(req.body);
  const session = await createSession(req.user!.sub, input);
  res.status(201).json({ session });
}

export async function list(req: Request, res: Response) {
  const sessions = await listSessions(req.user!.sub);
  res.json({ sessions });
}

export async function getOne(req: Request, res: Response) {
  const detail = await getSession(req.user!.sub, req.params.id);
  res.json(detail);
}

export async function end(req: Request, res: Response) {
  const input = endSessionSchema.parse(req.body);
  const result = await endSession(req.user!.sub, req.params.id, input);
  res.json(result);
}

export async function remove(req: Request, res: Response) {
  await deleteSession(req.user!.sub, req.params.id);
  res.status(204).end();
}

export async function analyze(req: Request, res: Response) {
  const input = analyzeSchema.parse(req.body);
  const evaluation = await analyzeSession(req.user!.sub, req.params.id, input.exchanges);
  res.json({ evaluation });
}

export async function mintToken(req: Request, res: Response) {
  const s = await getSessionForToken(req.user!.sub, req.params.id);
  const systemInstruction = buildSystemInstruction({
    jobFieldName: s.job_field_name,
    jobTitle: s.job_title,
    company: s.company,
    jobDescription: s.job_description,
    cvContext: s.cv_text,
  });
  const { token, model } = await createEphemeralToken(systemInstruction);
  res.json({ token, model });
}
