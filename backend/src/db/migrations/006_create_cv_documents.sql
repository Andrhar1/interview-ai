-- Fase 4: cv_documents table (PRD §5) + FK from interview_sessions.cv_id

CREATE TABLE IF NOT EXISTS cv_documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename         VARCHAR(255) NOT NULL,
  stored_filename  VARCHAR(255) NOT NULL,
  mime_type        VARCHAR(100) NOT NULL,
  size_bytes       INT NOT NULL,
  extracted_text   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cv_documents_user_id_created_at ON cv_documents (user_id, created_at DESC);

-- interview_sessions.cv_id existed since Fase 2 without a target table; wire it up now.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'interview_sessions_cv_id_fkey'
  ) THEN
    ALTER TABLE interview_sessions
      ADD CONSTRAINT interview_sessions_cv_id_fkey
      FOREIGN KEY (cv_id) REFERENCES cv_documents(id) ON DELETE SET NULL;
  END IF;
END $$;
