import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../config/db.js';

/**
 * Minimal forward-only migration runner. Applies every `.sql` file in
 * ./migrations (sorted by filename) that hasn't been recorded yet, each inside
 * its own transaction, and tracks applied files in `schema_migrations`.
 *
 * Run with: npm run migrate -w backend
 */
const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

async function run(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

  const { rows } = await pool.query<{ name: string }>('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name));

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`✓ applied ${file}`);
      count++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`✗ failed ${file}:`, err);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(count === 0 ? 'No new migrations.' : `Applied ${count} migration(s).`);
  await pool.end();
}

run().catch((err) => {
  console.error('Migration run failed:', err);
  process.exit(1);
});
