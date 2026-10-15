import { isIPv4 } from 'node:net';
import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../core/errors';
import { ah, parse } from '../../core/http';
import { agentLimiter } from '../../core/rateLimits';
import { agentAuth } from '../../middleware/agentAuth';
import { isWgKey } from '../connections/connections.service';
import { peersOf, peersResponse, registerAgent, report } from './agent.service';
import { getEdgeFile, isEdgeFileName } from './edgeFiles';

const registerBody = z.object({
  serverId: z.string().uuid(),
  bootstrapToken: z.string().min(1).max(200),
  instanceId: z.string().regex(/^i-[0-9a-f]{8,17}$/),
  publicIp: z.string().refine(isIPv4, 'must be an IPv4 address'),
  wgPublicKey: z.string().refine(isWgKey, 'must be a WireGuard public key'),
  tcpCertSha256: z.string().regex(/^[0-9a-f]{64}$/),
  agentVersion: z.string().min(1).max(20),
});

const count = z.number().int().nonnegative();
const reportBody = z.object({
  appliedVersion: count,
  peers: z
    .array(z.object({ publicKey: z.string().max(100), latestHandshake: count, rxBytes: count, txBytes: count }))
    .max(1000),
  cpuPct: z.number().min(0).max(100),
  memPct: z.number().min(0).max(100),
  netTxBytes: count,
  uptimeSeconds: count,
});

export const agentRouter = Router();

agentRouter.get('/files/:name', agentLimiter, (req, res, next) => {
  const name = req.params.name ?? '';
  if (!isEdgeFileName(name)) return next(new AppError('NOT_FOUND'));
  res.type('text/plain; charset=utf-8').send(getEdgeFile(name));
});

agentRouter.post(
  '/register',
  agentLimiter,
  ah(async (req, res) => {
    const body = parse(registerBody, req.body);
    res.json(await registerAgent(body));
  }),
);

agentRouter.get(
  '/peers',
  agentAuth,
  agentLimiter,
  ah(async (req, res) => {
    const server = req.server!;
    if (peersResponse(server.peersVersion, req.get('If-None-Match')) === 'not-modified') {
      res.status(304).end();
      return;
    }
    res.set('ETag', `"${server.peersVersion}"`).json(await peersOf(server));
  }),
);

agentRouter.post(
  '/report',
  agentAuth,
  agentLimiter,
  ah(async (req, res) => {
    const body = parse(reportBody, req.body);
    res.json(await report(req.server!, body));
  }),
);
