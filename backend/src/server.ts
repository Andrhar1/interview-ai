import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import { env } from './config/env.js';
import { closeMongo, connectMongo, pingMongo } from './config/mongo.js';
import { pool } from './config/db.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { jobFieldsRouter } from './modules/jobFields/jobFields.routes.js';
import { sessionsRouter } from './modules/sessions/sessions.routes.js';
import { cvRouter } from './modules/cv/cv.routes.js';

const app = express();

app.set('trust proxy', 1); // behind nginx in production (rate-limit + secure cookies)
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', async (_req, res) => {
  try {
    await Promise.all([pool.query('SELECT 1'), pingMongo()]);
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'unavailable' });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/job-fields', jobFieldsRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/cv', cvRouter);

app.use(errorHandler);

let server: Server | undefined;
let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down gracefully`);

  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();

  if (server) {
    await new Promise<void>((resolve, reject) => {
      server!.close((err) => (err ? reject(err) : resolve()));
    });
  }
  await Promise.allSettled([closeMongo(), pool.end()]);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

connectMongo()
  .then(() => {
    server = app.listen(env.PORT, () => {
      console.log(`🚀 Backend listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
    });
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ Gagal terhubung ke MongoDB: ${message}`);

    const name = err instanceof Error ? err.name : '';
    const looksUnreachable =
      name === 'MongoServerSelectionError' || /ECONNREFUSED|Server selection timed out/i.test(message);
    if (looksUnreachable) {
      console.error('   Pastikan MongoDB jalan: docker start interviewai-mongo (atau lihat README).');
    }
    process.exit(1);
  });
