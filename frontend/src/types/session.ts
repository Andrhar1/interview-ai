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
