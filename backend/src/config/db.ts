import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

/** Shared PostgreSQL connection pool. Sized small for the 2 GB VPS target. */
export const pool = new Pool({
  host: env.PG_HOST,
  port: env.PG_PORT,
  database: env.PG_DATABASE,
  user: env.PG_USER,
  password: env.PG_PASSWORD,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

/** Parameterized query helper (never concatenate SQL — PRD NFR §10). */
export function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  return pool.query<T>(text, params);
}
