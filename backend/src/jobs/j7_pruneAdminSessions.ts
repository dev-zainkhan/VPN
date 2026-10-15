import { prisma } from '../core/db';
import type { Job } from './scheduler';

// J7: expired admin sessions, and audit rows older than 180 days.
export const j7PruneAdminSessions: Job = {
  id: 'J7',
  everyMs: 60 * 60 * 1000,
  async run() {
    const [sessions, audits] = await prisma.$transaction([
      prisma.adminSession.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
      prisma.adminAudit.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) } } }),
    ]);
    return { deleted: sessions.count + audits.count };
  },
};
