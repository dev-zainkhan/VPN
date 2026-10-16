import type { Prisma } from '@prisma/client';
import { prisma } from '../../core/db';
import { AppError } from '../../core/errors';

export const REPORT_FRESH_MS = 3 * 60 * 1000;

// A server can take new connections only when all of these hold (8.5, 9.1).
export function eligibleServerWhere(now = new Date()): Prisma.ServerWhereInput {
  return {
    status: 'active',
    visible: true,
    lastReportAt: { gte: new Date(now.getTime() - REPORT_FRESH_MS) },
    wgPublicKey: { not: null },
    publicIp: { not: null },
    // AWS servers need a working account; servers added by hand have none.
    OR: [{ managed: false }, { awsAccount: { status: 'working' } }],
  };
}

// 8.5: visible regions with at least one eligible server, in sortOrder.
// pingHost is the eligible server with the fewest sessions.
export async function listAvailableRegions() {
  const regions = await prisma.region.findMany({
    where: { visible: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      servers: {
        where: eligibleServerWhere(),
        select: { publicIp: true, activeAt: true, _count: { select: { sessions: true } } },
      },
    },
  });

  const items = regions.flatMap((region) => {
    const best = [...region.servers].sort(
      (a, b) =>
        a._count.sessions - b._count.sessions || (a.activeAt?.getTime() ?? 0) - (b.activeAt?.getTime() ?? 0),
    )[0];
    if (!best?.publicIp) return [];
    return [
      {
        code: region.code,
        displayName: region.displayName,
        countryCode: region.countryCode,
        pingHost: best.publicIp,
        pingPort: 443,
      },
    ];
  });
  return { items };
}

// 13.5: every region with its eligible server count, for the admin panel.
export async function adminRegions() {
  const regions = await prisma.region.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { servers: { where: eligibleServerWhere() } } } },
  });
  return {
    items: regions.map((r) => ({
      code: r.code,
      displayName: r.displayName,
      countryCode: r.countryCode,
      visible: r.visible,
      sortOrder: r.sortOrder,
      activeServers: r._count.servers,
      visibleToUsers: r.visible && r._count.servers > 0,
    })),
  };
}

export async function updateRegions(items: { code: string; displayName: string; visible: boolean }[]) {
  const codes = items.map((i) => i.code);
  const known = await prisma.region.count({ where: { code: { in: codes } } });
  if (known !== new Set(codes).size || codes.length !== new Set(codes).size) {
    throw new AppError('VALIDATION_FAILED', 'Unknown or repeated region code');
  }
  await prisma.$transaction(
    items.map((i) =>
      prisma.region.update({ where: { code: i.code }, data: { displayName: i.displayName, visible: i.visible } }),
    ),
  );
  return adminRegions();
}
