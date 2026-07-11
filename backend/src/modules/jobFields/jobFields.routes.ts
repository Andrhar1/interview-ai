import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { list } from './jobFields.controller.js';

export const jobFieldsRouter = Router();

jobFieldsRouter.get('/', asyncHandler(list));
