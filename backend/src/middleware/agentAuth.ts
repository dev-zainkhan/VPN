import { hashToken } from '../core/crypto';
import { prisma } from '../core/db';
import { AppError } from '../core/errors';
import { ah } from '../core/http';
import { bearerToken } from './deviceAuth';

export const agentAuth = ah(async (req, _res, next) => {
  const token = bearerToken(req.headers.authorization);
  if (!token) throw new AppError('AUTH_REQUIRED');

  const server = await prisma.server.findUnique({ where: { agentTokenHash: hashToken(token) } });
  if (!server || server.status === 'terminating' || server.status === 'terminated') throw new AppError('AUTH_INVALID');

  req.server = server;
  next();
});
