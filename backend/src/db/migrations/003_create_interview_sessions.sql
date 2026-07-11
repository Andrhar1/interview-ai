-- Fase 2: interview_sessions table (PRD §5)

CREATE TABLE IF NOT EXISTS interview_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_field_id      UUID NOT NULL REFERENCES job_fields(id),
  cv_id             UUID,
  job_title         VARCHAR(150),
  company           VARCHAR(150),
  job_description   TEXT,
  status            VARCHAR(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  duration_seconds  INT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_interview_sessions_user_id_created_at ON interview_sessions (user_id, created_at DESC);
