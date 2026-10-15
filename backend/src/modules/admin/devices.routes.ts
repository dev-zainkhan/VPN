import { Router } from 'express';
import { z } from 'zod';
import { ah, parse } from '../../core/http';
import { paginationQuery } from '../../core/pagination';
import { writeAudit } from './audit';
import * as devices from './devices.service';

const listQuery = paginationQuery.extend({
  status: z.enum(['all', 'connected', 'offline', 'blocked']).default('all'),
  // Only a full device ID is searchable; there is nothing else to search by (no-logs rule).
  q: z.string().trim().uuid('q must be a full device ID').or(z.literal('')).optional(),
});
const idParams = z.object({ id: z.string().uuid() });
const adjustBody = z.object({
  deltaMinutes: z.number().int().min(-100000).max(100000).refine((v) => v !== 0, 'must not be 0'),
});
const blockBody = z.object({
  reason: z.enum(['reward_farming', 'abuse_report', 'other']),
  note: z.string().trim().max(200).optional(),
});

export const devicesAdminRouter = Router();

devicesAdminRouter.get(
  '/devices',
  ah(async (req, res) => {
    const q = parse(listQuery, req.query);
    res.json(await devices.listDevices({ ...q, q: q.q || undefined }));
  }),
);

devicesAdminRouter.get(
  '/devices/:id',
  ah(async (req, res) => {
    res.json(await devices.getDevice(parse(idParams, req.params).id));
  }),
);

devicesAdminRouter.post(
  '/devices/:id/adjust',
  ah(async (req, res) => {
    const { id } = parse(idParams, req.params);
    const body = parse(adjustBody, req.body);
    const out = await devices.adjustBalance(id, req.admin!.id, body.deltaMinutes);
    await writeAudit(req.admin!.id, 'device.adjust', 'device', id, body);
    res.json(out);
  }),
);

devicesAdminRouter.post(
  '/devices/:id/disconnect',
  ah(async (req, res) => {
    const { id } = parse(idParams, req.params);
    const out = await devices.disconnectDevice(id);
    await writeAudit(req.admin!.id, 'device.disconnect', 'device', id);
    res.json(out);
  }),
);

devicesAdminRouter.post(
  '/devices/:id/block',
  ah(async (req, res) => {
    const { id } = parse(idParams, req.params);
    const body = parse(blockBody, req.body);
    const out = await devices.blockDevice(id, body.reason, body.note || undefined);
    await writeAudit(req.admin!.id, 'device.block', 'device', id, body);
    res.json(out);
  }),
);

devicesAdminRouter.post(
  '/devices/:id/unblock',
  ah(async (req, res) => {
    const { id } = parse(idParams, req.params);
    const out = await devices.unblockDevice(id);
    await writeAudit(req.admin!.id, 'device.unblock', 'device', id);
    res.json(out);
  }),
);
