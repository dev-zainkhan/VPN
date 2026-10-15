import { prisma } from '../core/db';
import { logger } from '../core/logger';
import { terminateServer } from '../modules/aws/provisioning.service';
import type { Job } from './scheduler';

const MINUTE = 60 * 1000;

// J1: a server that never registered is marked failed after 10 minutes and terminated after 60.
export const j1ProvisionTimeout: Job = {
  id: 'J1',
  everyMs: MINUTE,
  async run() {
    const now = Date.now();
    const { count: timedOut } = await prisma.server.updateMany({
      where: { status: 'provisioning', launchedAt: { lt: new Date(now - 10 * MINUTE) } },
      data: { status: 'failed', failReason: 'never_registered', failDetail: 'No registration within 10 minutes' },
    });
    const stale = await prisma.server.findMany({
      where: { status: 'failed', failReason: 'never_registered', launchedAt: { lt: new Date(now - 60 * MINUTE) } },
      select: { id: true },
    });
    let terminated = 0;
    for (const s of stale) {
      try {
        await terminateServer(s.id);
        terminated++;
      } catch (e) {
        logger.warn({ serverId: s.id, message: e instanceof Error ? e.message : String(e) }, 'J1 terminate failed');
      }
    }
    return { timedOut, terminated };
  },
};
