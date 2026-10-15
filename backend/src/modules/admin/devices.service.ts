import type { AbuseKey, Device, Prisma, Server, Session } from '@prisma/client';
import { prisma } from '../../core/db';
import { AppError } from '../../core/errors';
import { decodeCursor, pageOf } from '../../core/pagination';
import { endSession } from '../connections/connections.service';
import { utcDay } from '../settings/settings.service';

export type DeviceStatusFilter = 'all' | 'connected' | 'offline' | 'blocked';

type DeviceRow = Device & { abuseKey: AbuseKey; session: (Session & { server: Server }) | null };
const deviceInclude = { abuseKey: true, session: { include: { server: true } } } satisfies Prisma.DeviceInclude;

function statusOf(d: DeviceRow): 'connected' | 'offline' | 'blocked' {
  if (d.abuseKey.blocked) return 'blocked';
  return d.session ? 'connected' : 'offline';
}

// 13.6 item
function deviceItem(d: DeviceRow, today = utcDay()) {
  return {
    id: d.id,
    status: statusOf(d),
    balanceSeconds: d.balanceSeconds,
    adsToday: d.adsDay === today ? d.adsToday : 0,
    appVersion: d.appVersion,
    firstSeenAt: d.firstSeenAt.toISOString(),
    lastSeenAt: d.lastSeenAt.toISOString(),
    session: d.session
      ? {
          regionCode: d.session.server.regionCode,
          protocol: d.session.protocol,
          serverId: d.session.serverId,
          instanceId: d.session.server.instanceId,
          startedAt: d.session.startedAt.toISOString(),
        }
      : null,
  };
}

function deviceDetail(d: DeviceRow) {
  return {
    ...deviceItem(d),
    installCount: d.abuseKey.installCount,
    blockedReason: d.abuseKey.blockedReason,
    blockedAt: d.abuseKey.blockedAt?.toISOString() ?? null,
  };
}

const STATUS_WHERE: Record<DeviceStatusFilter, Prisma.DeviceWhereInput> = {
  all: {},
  blocked: { abuseKey: { blocked: true } },
  // A blocked device with a session still counts as blocked, so the tabs do not overlap.
  connected: { session: { isNot: null }, abuseKey: { blocked: false } },
  offline: { session: { is: null }, abuseKey: { blocked: false } },
};

export async function listDevices(q: { status: DeviceStatusFilter; q?: string; limit: number; cursor?: string }) {
  const idFilter: Prisma.DeviceWhereInput = q.q ? { id: q.q } : {};
  const where: Prisma.DeviceWhereInput = { ...idFilter, ...STATUS_WHERE[q.status] };
  const paged: Prisma.DeviceWhereInput = { ...where };
  if (q.cursor) {
    const c = decodeCursor(q.cursor);
    paged.OR = [{ firstSeenAt: { lt: c.t } }, { firstSeenAt: c.t, id: { lt: c.id } }];
  }
  const count = (s: DeviceStatusFilter) => prisma.device.count({ where: { ...idFilter, ...STATUS_WHERE[s] } });
  const [rows, total, all, connected, offline, blocked] = await Promise.all([
    prisma.device.findMany({
      where: paged,
      include: deviceInclude,
      orderBy: [{ firstSeenAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
    }),
    prisma.device.count({ where }),
    count('all'),
    count('connected'),
    count('offline'),
    count('blocked'),
  ]);
  const page = pageOf(rows, q.limit, (r) => r.firstSeenAt);
  const today = utcDay();
  return {
    items: page.items.map((d) => deviceItem(d, today)),
    nextCursor: page.nextCursor,
    total,
    counts: { all, connected, offline, blocked },
  };
}

async function findDevice(id: string): Promise<DeviceRow> {
  const d = await prisma.device.findUnique({ where: { id }, include: deviceInclude });
  if (!d) throw new AppError('NOT_FOUND');
  return d;
}

export async function getDevice(id: string) {
  return deviceDetail(await findDevice(id));
}

export async function adjustBalance(id: string, adminId: string, deltaMinutes: number) {
  await prisma.$transaction(async (tx) => {
    // Row lock: a metering debit in between cannot be lost.
    const [row] = await tx.$queryRaw<{ balance_seconds: number }[]>`
      SELECT balance_seconds FROM devices WHERE id = ${id}::uuid FOR UPDATE`;
    if (!row) throw new AppError('NOT_FOUND');
    const after = Math.max(0, row.balance_seconds + deltaMinutes * 60);
    await tx.device.update({ where: { id }, data: { balanceSeconds: after } });
    // The wallet records what was really applied (the balance never goes below 0).
    const applied = after - row.balance_seconds;
    if (applied !== 0) {
      await tx.walletEntry.create({ data: { deviceId: id, seconds: applied, reason: 'admin_adjust', refId: adminId } });
    }
  });
  return getDevice(id);
}

export async function disconnectDevice(id: string) {
  await findDevice(id);
  await endSession(id, 'admin');
  return getDevice(id);
}

export async function blockDevice(id: string, reason: string, note?: string) {
  const d = await findDevice(id);
  await prisma.abuseKey.update({
    where: { keyHash: d.abuseKeyHash },
    data: { blocked: true, blockedReason: note ? `${reason}: ${note}` : reason, blockedAt: new Date() },
  });
  // Every install of the same phone shares the abuse key.
  const siblings = await prisma.device.findMany({ where: { abuseKeyHash: d.abuseKeyHash }, select: { id: true } });
  for (const s of siblings) await endSession(s.id, 'blocked');
  await prisma.rewardIntent.updateMany({
    where: { deviceId: { in: siblings.map((s) => s.id) }, status: 'pending' },
    data: { status: 'rejected', rejectReason: 'blocked' },
  });
  return getDevice(id);
}

export async function unblockDevice(id: string) {
  const d = await findDevice(id);
  await prisma.abuseKey.update({
    where: { keyHash: d.abuseKeyHash },
    data: { blocked: false, blockedReason: null, blockedAt: null },
  });
  return getDevice(id);
}
