import { config } from './core/config';
import { prisma } from './core/db';
import { logger } from './core/logger';
import { createApp } from './app';
import { startScheduler, stopScheduler } from './jobs/scheduler';
import { loadEdgeFiles } from './modules/agent/edgeFiles';

loadEdgeFiles();
const app = createApp();
const server = app.listen(config.PORT, '0.0.0.0', () => {
  logger.info({ port: config.PORT }, 'api listening');
});

if (config.JOBS_ENABLED) startScheduler();

function shutdown() {
  setTimeout(() => process.exit(1), 10000).unref();
  stopScheduler();
  server.close(() => {
    prisma
      .$disconnect()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
