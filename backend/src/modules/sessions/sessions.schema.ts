import { z } from 'zod';

/** Treats empty/blank strings as undefined, so optional fields stay optional. */
function emptyToUndefined(val: unknown) {
  if (typeof val === 'string' && val.trim() === '') return undefined;
  return val;
}

export const createSessionSchema = z.object({
  job_field_id: z.string().uuid('job_field_id tidak valid.'),
  cv_id: z.preprocess(emptyToUndefined, z.string().uuid().nullable().optional()),
  job_title: z.preprocess(emptyToUndefined, z.string().trim().max(150).optional()),
  company: z.preprocess(emptyToUndefined, z.string().trim().max(150).optional()),
  job_description: z.preprocess(emptyToUndefined, z.string().trim().optional()),
});

const exchangeSchema = z.object({
  role: z.enum(['ai', 'user']),
  text: z.string(),
  timestamp: z.string().optional(),
});

const metricSchema = z.object({
  key: z.string(),
  label: z.string(),
  score: z.number().int().min(0).max(100),
  note: z.string().optional(),
});

const evaluationSchema = z.object({
  overall_score: z.number().int().min(0).max(100),
  feedback_text: z.string().optional(),
  metrics: z.array(metricSchema),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  summary: z.string().optional(),
});

export const endSessionSchema = z.object({
  exchanges: z.array(exchangeSchema),
  summary: z.string().optional(),
  duration_seconds: z.number().int().min(0).optional(),
  evaluation: evaluationSchema,
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type EndSessionInput = z.infer<typeof endSessionSchema>;
