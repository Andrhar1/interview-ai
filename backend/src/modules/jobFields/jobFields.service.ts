import { query } from '../../config/db.js';

export interface JobField {
  id: string;
  slug: string;
  name: string;
  description: string;
}

export async function listJobFields(): Promise<JobField[]> {
  const { rows } = await query<JobField>(
    'SELECT id, slug, name, description FROM job_fields ORDER BY sort_order ASC',
  );
  return rows;
}
