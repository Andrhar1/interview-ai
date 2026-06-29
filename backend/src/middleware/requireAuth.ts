import type { NextFunction, Request, Response } from 'express';
import { AppError } from './errorHandler.js';
import { verifyAccessToken } from '../utils/jwt.js';

/** Verifies the Bearer access token and attaches req.user; 401 on failure. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AppError(401, 'Tidak terautentikasi.');
  }
  try {
    req.user = verifyAccessToken(header.slice(7));
    next();
  } catch {
    throw new AppError(401, 'Token tidak valid atau kedaluwarsa.');
  }
}
