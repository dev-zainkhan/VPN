import type { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { AppError } from './errors';

// In-memory stores are correct only while exactly one API process runs.
function limiter(limit: number, windowMs: number, key: (req: Request) => string) {
  return rateLimit({
    limit,
    windowMs,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: key,
    handler: (_req, _res, next) => next(new AppError('RATE_LIMITED')),
  });
}

const MINUTE = 60 * 1000;
const byIp = (req: Request) => req.ip ?? 'unknown';

export const registerLimiter = limiter(10, 60 * MINUTE, byIp);
export const deviceLimiter = limiter(120, MINUTE, (req) => req.device!.id);
export const connectLimiter = limiter(20, 10 * MINUTE, (req) => req.device!.id);
export const intentLimiter = limiter(30, 60 * MINUTE, (req) => req.device!.id);
export const ssvLimiter = limiter(300, MINUTE, byIp);
export const adminLoginLimiter = limiter(10, 15 * MINUTE, byIp);
export const adminLimiter = limiter(300, MINUTE, (req) => req.adminSessionId!);
export const agentLimiter = limiter(120, MINUTE, (req) => req.server?.id ?? byIp(req));
