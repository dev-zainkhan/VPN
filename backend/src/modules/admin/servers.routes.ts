import { Router } from 'express';
import { z } from 'zod';
import { ah, parse } from '../../core/http';
import { paginationQuery } from '../../core/pagination';
import * as servers from '../aws/provisioning.service';
import { writeAudit } from './audit';

const statuses = z.enum(['provisioning', 'active', 'draining', 'failed', 'terminating', 'terminated']);
const listQuery = paginationQuery.extend({
  status: statuses.optional(),
  accountId: z.string().uuid().optional(),
  regionCode: z.string().max(32).optional(),
});
const createBody = z.object({
  awsAccountId: z.string().uuid(),
  regionCode: z.string().min(1).max(32),
  instanceType: z.string().regex(/^[a-z0-9-]+\.[a-z0-9]+$/).optional(),
});
const idParams = z.object({ id: z.string().uuid() });
const patchBody = z.object({ visible: z.boolean() });

export const serversRouter = Router();

serversRouter.get(
  '/servers',
  ah(async (req, res) => {
    res.json(await servers.listServers(parse(listQuery, req.query)));
  }),
);

serversRouter.post(
  '/servers',
  ah(async (req, res) => {
    const body = parse(createBody, req.body);
    const server = await servers.createServer(body.awsAccountId, body.regionCode, body.instanceType);
    await writeAudit(req.admin!.id, 'server.create', 'server', server.id, body);
    res.status(201).json(await servers.getServerItem(server.id));
  }),
);

const actions = {
  drain: servers.drainServer,
  undrain: servers.undrainServer,
  reboot: servers.rebootServer,
  terminate: servers.terminateServer,
} as const;

for (const [name, action] of Object.entries(actions)) {
  serversRouter.post(
    `/servers/:id/${name}`,
    ah(async (req, res) => {
      const { id } = parse(idParams, req.params);
      await action(id);
      await writeAudit(req.admin!.id, `server.${name}`, 'server', id);
      res.json(await servers.getServerItem(id));
    }),
  );
}

serversRouter.patch(
  '/servers/:id',
  ah(async (req, res) => {
    const { id } = parse(idParams, req.params);
    const body = parse(patchBody, req.body);
    await servers.setServerVisible(id, body.visible);
    await writeAudit(req.admin!.id, body.visible ? 'server.show' : 'server.hide', 'server', id, body);
    res.json(await servers.getServerItem(id));
  }),
);
