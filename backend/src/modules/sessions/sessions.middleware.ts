import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../middleware/errorHandler.js';

/**
 * Validates that req.params[paramName] is a UUID before it reaches Postgres.
 * A malformed id would otherwise trigger Postgres error 22P02 (invalid input
 * syntax for type uuid), surfacing as a 500. Since we never want to leak
 * whether an id is malformed vs. simply non-existent/non-owned, this throws
 * the same 404 used elsewhere in the sessions module.
 */
export function requireUuidParam(paramName: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = z.string().uuid().safeParse(req.params[paramName]);
    if (!result.success) {
      throw new AppError(404, 'Sesi tidak ditemukan.');
    }
    next();
  };
}
