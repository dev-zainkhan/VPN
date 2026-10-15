import { Router } from 'express';
import { ah } from '../../core/http';
import { dashboard } from './dashboard.service';

export const dashboardRouter = Router();

dashboardRouter.get(
  '/dashboard',
  ah(async (_req, res) => {
    res.json(await dashboard());
  }),
);
