import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { geminiLimiter } from '../../middleware/rateLimit.js';
import { requireUuidParam } from './sessions.middleware.js';
import { analyze, create, end, getOne, list, mintToken, remove } from './sessions.controller.js';

export const sessionsRouter = Router();

sessionsRouter.use(requireAuth);

sessionsRouter.post('/', asyncHandler(create));
sessionsRouter.get('/', asyncHandler(list));
sessionsRouter.get('/:id', requireUuidParam('id'), asyncHandler(getOne));
sessionsRouter.post('/:id/token', requireUuidParam('id'), geminiLimiter, asyncHandler(mintToken));
sessionsRouter.post('/:id/analyze', requireUuidParam('id'), geminiLimiter, asyncHandler(analyze));
sessionsRouter.post('/:id/end', requireUuidParam('id'), asyncHandler(end));
sessionsRouter.delete('/:id', requireUuidParam('id'), asyncHandler(remove));
