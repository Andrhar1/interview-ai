export interface JobField {
  id: string;
  slug: string;
  name: string;
  description: string;
}

export interface JobFieldsResponse {
  jobFields: JobField[];
}

export interface SessionSummary {
  id: string;
  status: 'in_progress' | 'completed';
  job_field_id: string;
  cv_id: string | null;
  job_title: string | null;
  company: string | null;
  job_description: string | null;
  duration_seconds: number | null;
  created_at: string;
  started_at: string;
  ended_at: string | null;
}

export interface CreateSessionResponse {
  session: SessionSummary;
}

export interface EvaluationMetric {
  key: string;
  label: string;
  score: number;
  note?: string;
}

export interface Evaluation {
  overall_score: number;
  feedback_text?: string | null;
  metrics: EvaluationMetric[];
  strengths: string[];
  improvements: string[];
  summary?: string | null;
}

export interface TranscriptExchange {
  role: 'ai' | 'user';
  text: string;
}

/** GET /sessions/:id response. */
export interface SessionDetailResponse {
  session: SessionSummary & {
    job_field_name: string;
    job_field_slug: string;
  };
  evaluation: Evaluation | null;
  transcript: { exchanges: unknown; summary: string | null } | null;
}

export interface AnalyzeResponse {
  evaluation: Evaluation;
}
