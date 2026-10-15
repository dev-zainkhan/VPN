import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../core/errors';
import { ah, parse } from '../../core/http';
import { connectLimiter, deviceLimiter } from '../../core/rateLimits';
import { deviceAuth } from '../../middleware/deviceAuth';
import { connect, endSession, isWgKey } from './connections.service';

const connectBody = z.object({
  regionCode: z.string().min(1).max(32),
  protocol: z.enum(['udp', 'tcp']),
  publicKey: z.string().max(100),
});

export const connectionsRouter = Router();

connectionsRouter.post(
  '/connect',
  deviceAuth,
  deviceLimiter,
  connectLimiter,
  ah(async (req, res) => {
    const body = parse(connectBody, req.body);
    if (!isWgKey(body.publicKey)) throw new AppError('INVALID_PUBLIC_KEY');
    res.json(await connect(req.device!, req.deviceBlocked === true, body));
  }),
);

connectionsRouter.post(
  '/disconnect',
  deviceAuth,
  deviceLimiter,
  ah(async (req, res) => {
    await endSession(req.device!.id, 'user');
    res.json({ ok: true });
  }),
);
