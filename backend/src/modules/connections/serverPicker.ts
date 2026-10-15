import { prisma } from '../../core/db';
import { eligibleServerWhere } from '../regions/regions.service';

export const MAX_SESSIONS_PER_SERVER = 200;

// 9.1: the eligible server in the region with the fewest sessions; ties go to the earliest activeAt.
export async function pickServer(regionCode: string) {
  const servers = await prisma.server.findMany({
    where: { ...eligibleServerWhere(), regionCode },
    include: { _count: { select: { sessions: true } } },
  });
  const open = servers.filter((s) => s._count.sessions < MAX_SESSIONS_PER_SERVER);
  open.sort(
    (a, b) => a._count.sessions - b._count.sessions || (a.activeAt?.getTime() ?? 0) - (b.activeAt?.getTime() ?? 0),
  );
  return open[0] ?? null;
}
