import type { CookieOptions, Request, Response } from 'express';
import { isProd } from '../../config/env.js';
import { AppError } from '../../middleware/errorHandler.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../utils/jwt.js';
import { registerSchema, loginSchema } from './auth.schema.js';
import { authenticateUser, getUserById, registerUser, type PublicUser } from './auth.service.js';

const REFRESH_COOKIE = 'refresh_token';

// httpOnly, Secure (prod), SameSite=Strict — PRD §6.
const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'strict',
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

function issueTokens(res: Response, user: PublicUser) {
  const accessToken = signAccessToken({ sub: user.id, email: user.email, name: user.name });
  const refreshToken = signRefreshToken(user.id);
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions);
  return accessToken;
}

export async function register(req: Request, res: Response) {
  const input = registerSchema.parse(req.body);
  const user = await registerUser(input);
  const accessToken = issueTokens(res, user);
  res.status(201).json({ user, accessToken });
}

export async function login(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  const user = await authenticateUser(input);
  const accessToken = issueTokens(res, user);
  res.json({ user, accessToken });
}

export async function refresh(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw new AppError(401, 'Sesi tidak ditemukan.');

  let userId: string;
  try {
    userId = verifyRefreshToken(token).sub;
  } catch {
    throw new AppError(401, 'Sesi tidak valid atau kedaluwarsa.');
  }

  const user = await getUserById(userId);
  if (!user) throw new AppError(401, 'Pengguna tidak ditemukan.');

  const accessToken = issueTokens(res, user); // rotate refresh too
  res.json({ user, accessToken });
}

export async function logout(_req: Request, res: Response) {
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions, maxAge: undefined });
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  // requireAuth attaches req.user
  const user = await getUserById(req.user!.sub);
  if (!user) throw new AppError(404, 'Pengguna tidak ditemukan.');
  res.json({ user });
}
