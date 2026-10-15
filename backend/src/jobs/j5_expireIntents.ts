import { prisma } from '../core/db';
import type { Job } from './scheduler';

// J5: an intent nobody completed within 30 minutes expires.
export const j5ExpireIntents: Job = {
  id: 'J5',
  everyMs: 5 * 60 * 1000,
  async run() {
    const { count: expired } = await prisma.rewardIntent.updateMany({
      where: { status: 'pending', expiresAt: { lt: new Date() } },
      data: { status: 'expired' },
    });
    return { expired };
  },
};
