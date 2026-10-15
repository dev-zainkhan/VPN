import { prisma } from '../core/db';
import { utcDay } from '../modules/settings/settings.service';
import type { Job } from './scheduler';

const DAY = 24 * 60 * 60 * 1000;

// J6: rewards history is kept 35 days, finished intents 2 days, wallet entries 90 days.
export const j6PruneRewards: Job = {
  id: 'J6',
  everyMs: 60 * 60 * 1000,
  async run() {
    const now = Date.now();
    const days = (n: number) => new Date(now - n * DAY);
    const results = await prisma.$transaction([
      prisma.adReward.deleteMany({ where: { createdAt: { lt: days(35) } } }),
      prisma.rejectCounter.deleteMany({ where: { day: { lt: utcDay(days(35)) } } }),
      prisma.rewardIntent.deleteMany({ where: { createdAt: { lt: days(2) }, status: { not: 'pending' } } }),
      prisma.walletEntry.deleteMany({ where: { createdAt: { lt: days(90) } } }),
    ]);
    return { deleted: results.reduce((sum, r) => sum + r.count, 0) };
  },
};
