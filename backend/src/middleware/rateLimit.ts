import type { Request } from 'express';
import rateLimit from 'express-rate-limit';

/** Throttle auth endpoints to slow brute-force attempts (PRD §6). */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan. Coba lagi nanti.' },
});

/**
 * Throttle the two Gemini-backed endpoints (token mint + analyze), both of
 * which cost real money per call. Keyed per authenticated user (not IP) via
 * req.user.sub, set by requireAuth which runs before these routes. Budget:
 * token is minted on connect + up to ~3 reconnects/session, analyze runs
 * once per session end — 40 per 15 minutes comfortably covers legitimate
 * use (~a handful of interview sessions) while blocking abuse.
 */
export const geminiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 40, // per user per window
  keyGenerator: (req: Request) => req.user?.sub ?? req.ip ?? 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak permintaan. Coba lagi sebentar lagi.' },
});
