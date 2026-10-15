import { Router } from 'express';
import { ah } from '../../core/http';
import { deviceLimiter } from '../../core/rateLimits';
import { deviceAuth } from '../../middleware/deviceAuth';
import { listAvailableRegions } from './regions.service';

export const regionsRouter = Router();

regionsRouter.get(
  '/regions',
  deviceAuth,
  deviceLimiter,
  ah(async (_req, res) => {
    res.json(await listAvailableRegions());
  }),
);
