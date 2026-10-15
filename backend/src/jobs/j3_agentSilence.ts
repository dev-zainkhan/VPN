import { prisma } from '../core/db';
import { endServerSessions } from '../modules/connections/connections.service';
import type { Job } from './scheduler';

const SILENT_MS = 5 * 60 * 1000;

// J3: an agent with no report for 5 minutes marks its server failed; a later report revives it (11.6).
export const j3AgentSilence: Job = {
  id: 'J3',
  everyMs: 60 * 1000,
  async run() {
    const quiet = await prisma.server.findMany({
      where: { status: { in: ['active', 'draining'] }, lastReportAt: { lt: new Date(Date.now() - SILENT_MS) } },
      select: { id: true },
    });
    for (const s of quiet) {
      await prisma.$transaction(async (tx) => {
        await endServerSessions(s.id, tx);
        await tx.server.update({
          where: { id: s.id },
          data: { status: 'failed', failReason: 'agent_silent', failDetail: 'No agent report for 5 minutes' },
        });
      });
    }
    return { silenced: quiet.length };
  },
};
