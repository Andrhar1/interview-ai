import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { connectMongo } from './config/mongo.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { jobFieldsRouter } from './modules/jobFields/jobFields.routes.js';
import { sessionsRouter } from './modules/sessions/sessions.routes.js';

const app = express();

app.set('trust proxy', 1); // behind nginx in production (rate-limit + secure cookies)
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/job-fields', jobFieldsRouter);
app.use('/api/sessions', sessionsRouter);
// Further module routes (cv, ...) mounted in later phases.

app.use(errorHandler);

connectMongo()
  .then(() => {
    app.listen(env.PORT, () => {
      console.log(`🚀 Backend listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
    });
  })
  .catch((err) => {
    console.error('❌ Failed to connect to MongoDB:', err);
    process.exit(1);
  });
