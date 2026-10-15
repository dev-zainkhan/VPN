import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../core/errors';
import { ah, parse } from '../../core/http';
import { deviceLimiter, intentLimiter, ssvLimiter } from '../../core/rateLimits';
import { deviceAuth } from '../../middleware/deviceAuth';
import { countReject, createIntent, getIntent, handleSsv } from './rewards.service';
import { getKeys, keyIdOf, verifySsv } from './ssvVerifier';

export const rewardsRouter = Router();

rewardsRouter.post(
  '/rewards/intents',
  deviceAuth,
  deviceLimiter,
  intentLimiter,
  ah(async (req, res) => {
    res.status(201).json(await createIntent(req.device!, req.deviceBlocked === true));
  }),
);

rewardsRouter.get(
  '/rewards/intents/:intentId',
  deviceAuth,
  deviceLimiter,
  ah(async (req, res) => {
    const { intentId } = parse(z.object({ intentId: z.string().uuid() }), req.params);
    res.json(await getIntent(req.device!, intentId));
  }),
);

// 10.4: mounted before the JSON parser; reads the raw URL exactly as Google signed it.
export const ssvRouter = Router();

ssvRouter.get(
  '/ssv',
  ssvLimiter,
  ah(async (req, res) => {
    const url = req.originalUrl;
    const result = verifySsv(url, await getKeys(keyIdOf(url)));
    if (!result.valid || result.message === undefined) {
      await countReject('bad_signature');
      throw new AppError('SSV_BAD_SIGNATURE');
    }
    await handleSsv(result.message);
    res.type('text/plain').send('ok');
  }),
);
