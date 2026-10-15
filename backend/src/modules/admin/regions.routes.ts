import { Router } from 'express';
import { z } from 'zod';
import { ah, parse } from '../../core/http';
import { adminRegions, updateRegions } from '../regions/regions.service';
import { writeAudit } from './audit';

const putBody = z.object({
  items: z
    .array(z.object({ code: z.string().min(1).max(32), displayName: z.string().trim().min(1).max(60), visible: z.boolean() }))
    .min(1)
    .max(100),
});

export const regionsAdminRouter = Router();

regionsAdminRouter.get(
  '/regions',
  ah(async (_req, res) => {
    res.json(await adminRegions());
  }),
);

regionsAdminRouter.put(
  '/regions',
  ah(async (req, res) => {
    const body = parse(putBody, req.body);
    const out = await updateRegions(body.items);
    await writeAudit(req.admin!.id, 'regions.update', 'region', null, body);
    res.json(out);
  }),
);
