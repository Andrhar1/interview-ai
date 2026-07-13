import 'dotenv/config';
import { z } from 'zod';

/**
 * Environment validation. Vars required up to the current phase are mandatory;
 * later-phase vars (Gemini, CV) stay optional until those phases wire them up.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().url().default('http://localhost:5180'),

  // Auth (Fase 1)
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be set (>=16 chars)'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be set (>=16 chars)'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),

  // PostgreSQL (Fase 1)
  PG_HOST: z.string().default('localhost'),
  PG_PORT: z.coerce.number().int().positive().default(5432),
  PG_DATABASE: z.string().min(1),
  PG_USER: z.string().min(1),
  PG_PASSWORD: z.string().default(''),

  // MongoDB (Fase 2+, required)
  MONGODB_URI: z.string().min(1, 'MONGODB_URI must be set (Fase 2+)'),

  // Gemini (Fase 3+, required)
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY must be set (Fase 3+)'),
  // Live (audio) model. Measured time-to-first-audio after a user turn:
  // gemini-3.1-flash-live-preview ~1.5s vs gemini-2.5-flash-native-audio-latest ~5.0s.
  // Preview model — if Google retires it, fall back to the 2.5 native-audio model
  // (proven to open with our token config; costs ~3.5s of extra latency).
  GEMINI_MODEL: z.string().default('gemini-3.1-flash-live-preview'),
  // Text model for structured-output evaluation generation (Task 4). Must NOT
  // be the live-audio model above.
  GEMINI_ANALYSIS_MODEL: z.string().default('gemini-2.5-flash'),

  // Later phases (optional for now)
  CV_MAX_SIZE_MB: z.coerce.number().default(5),
  CV_STORAGE_PATH: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
