-- Fase 2: evaluations table (PRD §5)

CREATE TABLE IF NOT EXISTS evaluations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL UNIQUE REFERENCES interview_sessions(id) ON DELETE CASCADE,
  overall_score   INT NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  feedback_text   TEXT,
  metrics         JSONB NOT NULL DEFAULT '[]',
  strengths       JSONB NOT NULL DEFAULT '[]',
  improvements    JSONB NOT NULL DEFAULT '[]',
  summary         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evaluations_session_id ON evaluations (session_id);
