import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { AppError } from './core/errors';
import { logger } from './core/logger';
import { adminLimiter } from './core/rateLimits';
import { adminAuth } from './middleware/adminAuth';
import { errorHandler } from './middleware/errorHandler';
import { accountsRouter } from './modules/admin/accounts.routes';
import { dashboardRouter } from './modules/admin/dashboard.routes';
import { devicesAdminRouter } from './modules/admin/devices.routes';
import { regionsAdminRouter } from './modules/admin/regions.routes';
import { rewardsAdminRouter } from './modules/admin/rewards.routes';
import { serversRouter } from './modules/admin/servers.routes';
import { settingsAdminRouter } from './modules/admin/settings.routes';
import { agentRouter } from './modules/agent/agent.routes';
import { connectionsRouter } from './modules/connections/connections.routes';
import { rewardsRouter, ssvRouter } from './modules/rewards/rewards.routes';
import { adminAuthRouter, adminLoginRouter } from './modules/admin/auth.routes';
import { devicesRouter } from './modules/devices/devices.routes';
import { regionsRouter } from './modules/regions/regions.routes';

function mountedAt(base: string): express.RequestHandler {
  return (_req, res, next) => {
    res.locals.routeBase = base;
    next();
  };
}

export function createApp() {
  const app = express();
  // Caddy is the one proxy in front; this makes req.ip the real client IP for rate limits.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());

  // One line per request: method, route pattern, status, time. Never the URL,
  // query string, body or client IP (spec 7.9).
  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      // req.baseUrl is reset when an error leaves a router, so the mount path is kept in res.locals.
      const base = typeof res.locals.routeBase === 'string' ? res.locals.routeBase : req.baseUrl;
      const route = req.route ? `${base}${String(req.route.path)}` : 'unmatched';
      const ms = Number((process.hrtime.bigint() - start) / 1000000n);
      logger.info({ method: req.method, route, status: res.statusCode, ms }, 'request');
    });
    next();
  });

  // The AdMob callback reads the raw URL, so it mounts before the JSON parser (10.4).
  app.use('/api/admob', mountedAt('/api/admob'), ssvRouter);

  app.use(express.json({ limit: '64kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/v1', mountedAt('/api/v1'), devicesRouter, regionsRouter, connectionsRouter, rewardsRouter);
  app.use('/api/agent/v1', mountedAt('/api/agent/v1'), agentRouter);

  // Admin: login is the only route without a session; everything after adminAuth needs one.
  app.use('/api/admin', mountedAt('/api/admin'), adminLoginRouter);
  app.use(
    '/api/admin',
    mountedAt('/api/admin'),
    adminAuth,
    adminLimiter,
    adminAuthRouter,
    accountsRouter,
    serversRouter,
    regionsAdminRouter,
    devicesAdminRouter,
    rewardsAdminRouter,
    settingsAdminRouter,
    dashboardRouter,
  );

  app.use((_req, _res, next) => next(new AppError('NOT_FOUND')));
  app.use(errorHandler);
  return app;
}
