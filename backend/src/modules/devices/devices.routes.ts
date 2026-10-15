import { Router } from 'express';
import { ah, parse } from '../../core/http';
import { deviceLimiter, registerLimiter } from '../../core/rateLimits';
import { deviceAuth } from '../../middleware/deviceAuth';
import { registerBody } from './devices.schemas';
import { getAppConfig, getMe, registerDevice } from './devices.service';

export const devicesRouter = Router();

devicesRouter.post(
  '/devices/register',
  registerLimiter,
  ah(async (req, res) => {
    const body = parse(registerBody, req.body);
    res.status(201).json(await registerDevice(body));
  }),
);

devicesRouter.get(
  '/me',
  deviceAuth,
  deviceLimiter,
  ah(async (req, res) => {
    res.json(await getMe(req.device!));
  }),
);

devicesRouter.get(
  '/config',
  deviceAuth,
  deviceLimiter,
  ah(async (_req, res) => {
    res.json(await getAppConfig());
  }),
);
