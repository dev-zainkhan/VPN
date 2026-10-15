import { Router } from 'express';
import { z } from 'zod';
import { ah, parse } from '../../core/http';
import { rewardsSummary } from '../rewards/rewards.service';

const summaryQuery = z.object({ days: z.coerce.number().int().min(1).max(35).default(14) });

export const rewardsAdminRouter = Router();

rewardsAdminRouter.get(
  '/rewards/summary',
  ah(async (req, res) => {
    res.json(await rewardsSummary(parse(summaryQuery, req.query).days));
  }),
);
