import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireUuidParam } from './sessions.middleware.js';
import { create, end, getOne, list, remove } from './sessions.controller.js';

export const sessionsRouter = Router();

sessionsRouter.use(requireAuth);

sessionsRouter.post('/', asyncHandler(create));
sessionsRouter.get('/', asyncHandler(list));
sessionsRouter.get('/:id', requireUuidParam('id'), asyncHandler(getOne));
sessionsRouter.post('/:id/end', requireUuidParam('id'), asyncHandler(end));
sessionsRouter.delete('/:id', requireUuidParam('id'), asyncHandler(remove));
