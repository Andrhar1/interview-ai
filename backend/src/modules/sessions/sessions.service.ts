import { pool, query } from '../../config/db.js';
import { transcripts } from '../../config/mongo.js';
import { AppError } from '../../middleware/errorHandler.js';
import type { CreateSessionInput, EndSessionInput } from './sessions.schema.js';

export interface SessionRow {
  id: string;
  user_id: string;
  job_field_id: string;
  cv_id: string | null;
  job_title: string | null;
  company: string | null;
  job_description: string | null;
  status: 'in_progress' | 'completed';
  duration_seconds: number | null;
  created_at: string;
  started_at: string;
  ended_at: string | null;
}

export interface SessionListItem {
  id: string;
  status: 'in_progress' | 'completed';
  job_title: string | null;
  company: string | null;
  duration_seconds: number | null;
  created_at: string;
  ended_at: string | null;
  job_field_name: string;
  job_field_slug: string;
  overall_score: number | null;
}

export interface EvaluationRow {
  id: string;
  session_id: string;
  overall_score: number;
  feedback_text: string | null;
  metrics: unknown;
  strengths: unknown;
  improvements: unknown;
  summary: string | null;
  created_at: string;
}

export async function createSession(
  userId: string,
  input: CreateSessionInput,
): Promise<SessionRow> {
  const jobField = await query('SELECT 1 FROM job_fields WHERE id = $1', [input.job_field_id]);
  if (!jobField.rowCount) {
    throw new AppError(400, 'Bidang pekerjaan tidak valid.');
  }

  const { rows } = await query<SessionRow>(
    `INSERT INTO interview_sessions (user_id, job_field_id, cv_id, job_title, company, job_description)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, user_id, job_field_id, cv_id, job_title, company, job_description,
               status, duration_seconds, created_at, started_at, ended_at`,
    [
      userId,
      input.job_field_id,
      input.cv_id ?? null,
      input.job_title ?? null,
      input.company ?? null,
      input.job_description ?? null,
    ],
  );
  return rows[0];
}

export async function listSessions(userId: string): Promise<SessionListItem[]> {
  const { rows } = await query<SessionListItem>(
    `SELECT s.id, s.status, s.job_title, s.company, s.duration_seconds, s.created_at, s.ended_at,
            f.name AS job_field_name, f.slug AS job_field_slug, e.overall_score
     FROM interview_sessions s
     JOIN job_fields f ON f.id = s.job_field_id
     LEFT JOIN evaluations e ON e.session_id = s.id
     WHERE s.user_id = $1
     ORDER BY s.created_at DESC`,
    [userId],
  );
  return rows;
}

interface SessionDetailRow extends SessionListItem {
  job_field_id: string;
  cv_id: string | null;
  job_description: string | null;
  started_at: string;
  evaluation_id: string | null;
  feedback_text: string | null;
  metrics: unknown;
  strengths: unknown;
  improvements: unknown;
  evaluation_summary: string | null;
}

export interface SessionDetail {
  session: {
    id: string;
    status: 'in_progress' | 'completed';
    job_field_id: string;
    job_field_name: string;
    job_field_slug: string;
    cv_id: string | null;
    job_title: string | null;
    company: string | null;
    job_description: string | null;
    duration_seconds: number | null;
    created_at: string;
    started_at: string;
    ended_at: string | null;
  };
  evaluation: {
    overall_score: number;
    feedback_text: string | null;
    metrics: unknown;
    strengths: unknown;
    improvements: unknown;
    summary: string | null;
  } | null;
  transcript: {
    exchanges: unknown;
    summary: string | null;
  } | null;
}

export async function getSession(userId: string, sessionId: string): Promise<SessionDetail> {
  const { rows } = await query<SessionDetailRow>(
    `SELECT s.id, s.status, s.job_field_id, s.cv_id, s.job_title, s.company, s.job_description,
            s.duration_seconds, s.created_at, s.started_at, s.ended_at,
            f.name AS job_field_name, f.slug AS job_field_slug,
            e.id AS evaluation_id, e.overall_score, e.feedback_text, e.metrics, e.strengths,
            e.improvements, e.summary AS evaluation_summary
     FROM interview_sessions s
     JOIN job_fields f ON f.id = s.job_field_id
     LEFT JOIN evaluations e ON e.session_id = s.id
     WHERE s.id = $1 AND s.user_id = $2`,
    [sessionId, userId],
  );
  const row = rows[0];
  if (!row) throw new AppError(404, 'Sesi tidak ditemukan.');

  const transcriptDoc = await transcripts().findOne({ session_id: sessionId });

  return {
    session: {
      id: row.id,
      status: row.status,
      job_field_id: row.job_field_id,
      job_field_name: row.job_field_name,
      job_field_slug: row.job_field_slug,
      cv_id: row.cv_id,
      job_title: row.job_title,
      company: row.company,
      job_description: row.job_description,
      duration_seconds: row.duration_seconds,
      created_at: row.created_at,
      started_at: row.started_at,
      ended_at: row.ended_at,
    },
    evaluation: row.evaluation_id
      ? {
          overall_score: row.overall_score as number,
          feedback_text: row.feedback_text,
          metrics: row.metrics,
          strengths: row.strengths,
          improvements: row.improvements,
          summary: row.evaluation_summary,
        }
      : null,
    transcript: transcriptDoc
      ? { exchanges: transcriptDoc.exchanges, summary: transcriptDoc.summary ?? null }
      : null,
  };
}

export interface EndSessionResult {
  session: SessionRow;
  evaluation: EvaluationRow;
}

export async function endSession(
  userId: string,
  sessionId: string,
  input: EndSessionInput,
): Promise<EndSessionResult> {
  const { rows: existingRows } = await query<SessionRow>(
    'SELECT * FROM interview_sessions WHERE id = $1 AND user_id = $2',
    [sessionId, userId],
  );
  const existing = existingRows[0];
  if (!existing) throw new AppError(404, 'Sesi tidak ditemukan.');
  if (existing.status === 'completed') {
    throw new AppError(409, 'Sesi sudah selesai.');
  }

  // Write order (PRD §9): Mongo transcript FIRST, then Postgres transaction.
  await transcripts().updateOne(
    { session_id: sessionId },
    {
      $set: {
        session_id: sessionId,
        user_id: userId,
        exchanges: input.exchanges,
        summary: input.summary,
        created_at: new Date(),
      },
    },
    { upsert: true },
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: sessionRows } = await client.query<SessionRow>(
      `UPDATE interview_sessions
       SET status = 'completed', ended_at = now(), duration_seconds = $1
       WHERE id = $2 AND user_id = $3
       RETURNING id, user_id, job_field_id, cv_id, job_title, company, job_description,
                 status, duration_seconds, created_at, started_at, ended_at`,
      [input.duration_seconds ?? null, sessionId, userId],
    );

    const { rows: evaluationRows } = await client.query<EvaluationRow>(
      `INSERT INTO evaluations (session_id, overall_score, feedback_text, metrics, strengths, improvements, summary)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7)
       ON CONFLICT (session_id) DO UPDATE SET
         overall_score = EXCLUDED.overall_score,
         feedback_text = EXCLUDED.feedback_text,
         metrics = EXCLUDED.metrics,
         strengths = EXCLUDED.strengths,
         improvements = EXCLUDED.improvements,
         summary = EXCLUDED.summary
       RETURNING id, session_id, overall_score, feedback_text, metrics, strengths, improvements, summary, created_at`,
      [
        sessionId,
        input.evaluation.overall_score,
        input.evaluation.feedback_text ?? null,
        JSON.stringify(input.evaluation.metrics),
        JSON.stringify(input.evaluation.strengths),
        JSON.stringify(input.evaluation.improvements),
        input.evaluation.summary ?? null,
      ],
    );

    await client.query('COMMIT');

    return { session: sessionRows[0], evaluation: evaluationRows[0] };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteSession(userId: string, sessionId: string): Promise<void> {
  const result = await query('DELETE FROM interview_sessions WHERE id = $1 AND user_id = $2', [
    sessionId,
    userId,
  ]);
  if (result.rowCount === 0) {
    throw new AppError(404, 'Sesi tidak ditemukan.');
  }
  await transcripts().deleteOne({ session_id: sessionId });
}
