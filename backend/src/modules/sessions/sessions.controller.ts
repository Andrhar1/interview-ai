import type { Request, Response } from 'express';
import { createSessionSchema, endSessionSchema } from './sessions.schema.js';
import {
  createSession,
  deleteSession,
  endSession,
  getSession,
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
