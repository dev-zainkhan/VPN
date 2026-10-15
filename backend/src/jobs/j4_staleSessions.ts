import { prisma } from '../core/db';
import { endSession } from '../modules/connections/connections.service';
import type { Job } from './scheduler';

const STALE_MS = 10 * 60 * 1000;

// J4: a session with no handshake for 10 minutes belongs to a phone that left without disconnecting.
export const j4StaleSessions: Job = {
  id: 'J4',
  everyMs: 2 * 60 * 1000,
  async run() {
    const cutoff = new Date(Date.now() - STALE_MS);
    const stale = await prisma.session.findMany({
      where: {
        OR: [{ lastHandshakeAt: { lt: cutoff } }, { lastHandshakeAt: null, startedAt: { lt: cutoff } }],
      },
      select: { deviceId: true },
    });
    for (const s of stale) await endSession(s.deviceId, 'stale');
    return { ended: stale.length };
  },
};
