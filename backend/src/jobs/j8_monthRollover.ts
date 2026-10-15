import { prisma } from '../core/db';
import { utcMonth } from '../modules/aws/awsAccounts.service';
import type { Job } from './scheduler';

// Oldest month still kept: the current one and the three before it.
export function oldestKeptMonth(now = new Date()): string {
  return utcMonth(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1)));
}

// J8: usage older than 3 months, and servers terminated more than 60 days ago.
export const j8MonthRollover: Job = {
  id: 'J8',
  everyMs: 60 * 60 * 1000,
  async run() {
    const [usage, servers] = await prisma.$transaction([
      prisma.accountUsage.deleteMany({ where: { month: { lt: oldestKeptMonth() } } }),
      prisma.server.deleteMany({
        where: { status: 'terminated', terminatedAt: { lt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) } },
      }),
    ]);
    return { deleted: usage.count + servers.count };
  },
};
