import { Prisma, type Device, type RejectReason } from '@prisma/client';
import { config } from '../../core/config';
import { randomToken } from '../../core/crypto';
import { prisma } from '../../core/db';
import { AppError } from '../../core/errors';
import { logger } from '../../core/logger';
import { getSettings, utcDay } from '../settings/settings.service';

const INTENT_MS = 30 * 60 * 1000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_FUTURE_MS = 5 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const adsTodayOf = (d: Pick<Device, 'adsDay' | 'adsToday'>, today = utcDay()) => (d.adsDay === today ? d.adsToday : 0);

// 10.2
export async function createIntent(device: Device, blocked: boolean) {
  if (blocked) throw new AppError('BLOCKED');
  const settings = await getSettings();
  if (adsTodayOf(device) >= settings.maxAdsPerDay) throw new AppError('DAILY_LIMIT_REACHED');
  const nonce = randomToken(16);
  const intent = await prisma.rewardIntent.create({
    data: { deviceId: device.id, nonce, status: 'pending', expiresAt: new Date(Date.now() + INTENT_MS) },
  });
  return { intentId: intent.id, nonce, userId: device.id, customData: nonce, adUnitId: config.ADMOB_AD_UNIT_ID };
}

// 10.3
export async function getIntent(device: Device, intentId: string) {
  const intent = await prisma.rewardIntent.findFirst({ where: { id: intentId, deviceId: device.id } });
  if (!intent) throw new AppError('NOT_FOUND');
  const [reward, fresh] = await Promise.all([
    intent.status === 'credited'
      ? prisma.adReward.findFirst({ where: { intentId: intent.id, outcome: 'credited' } })
      : null,
    prisma.device.findUniqueOrThrow({ where: { id: device.id }, select: { balanceSeconds: true } }),
  ]);
  return {
    status: intent.status,
    secondsCredited: reward?.secondsCredited ?? 0,
    rejectReason: intent.rejectReason,
    balanceSeconds: fresh.balanceSeconds,
  };
}

export async function countReject(reason: RejectReason): Promise<void> {
  const day = utcDay();
  await prisma.rejectCounter.upsert({
    where: { day_reason: { day, reason } },
    create: { day, reason, count: 1 },
    update: { count: { increment: 1 } },
  });
}

export function adUnitMatches(adUnit: string, configured = config.ADMOB_AD_UNIT_ID): boolean {
  return adUnit === configured || adUnit === configured.slice(configured.indexOf('/') + 1);
}

// Thrown inside the transaction when the intent was used by a parallel callback; rolls back the credit.
class IntentTaken extends Error {}

// 10.4 business checks, after a valid signature. `message` is the signed query string.
export async function handleSsv(message: string, now = new Date()): Promise<'credited' | RejectReason | 'ignored'> {
  const p = new URLSearchParams(message);
  const transactionId = p.get('transaction_id') ?? '';
  if (!transactionId) {
    logger.warn('AdMob callback without transaction_id ignored');
    return 'ignored';
  }
  const adUnit = p.get('ad_unit') ?? '';
  const rewardAmount = Number.parseInt(p.get('reward_amount') ?? '0', 10) || 0;
  const rewardItem = p.get('reward_item') ?? '';
  const timestamp = Number(p.get('timestamp'));
  const userId = p.get('user_id') ?? '';
  const nonce = p.get('custom_data') ?? '';
  const today = utcDay(now);

  const run = (attempt: 'normal' | 'intent-taken') =>
    prisma.$transaction(async (tx) => {
      const settings = await getSettings(tx);
      const device = UUID_RE.test(userId)
        ? await tx.device.findUnique({ where: { id: userId }, include: { abuseKey: true } })
        : null;
      const intent =
        device && nonce ? await tx.rewardIntent.findFirst({ where: { nonce, deviceId: device.id } }) : null;
      const intentUsable = attempt === 'normal' && intent?.status === 'pending' && intent.expiresAt > now;

      let reason: RejectReason | null = null;
      if (!adUnitMatches(adUnit)) reason = 'wrong_ad_unit';
      else if (!Number.isFinite(timestamp) || now.getTime() - timestamp > MAX_AGE_MS || timestamp - now.getTime() > MAX_FUTURE_MS)
        reason = 'stale';
      else if (!device) reason = 'unknown_device';
      else if (device.abuseKey.blocked) reason = 'blocked';
      else if (!intent || !intentUsable) reason = 'bad_intent';
      else if (adsTodayOf(device, today) >= settings.maxAdsPerDay) reason = 'daily_limit';

      const base = { transactionId, adUnit, rewardAmount, rewardItem, deviceId: device?.id ?? null, intentId: intent?.id ?? null };
      if (reason) {
        await tx.adReward.create({ data: { ...base, outcome: 'rejected', rejectReason: reason, secondsCredited: 0 } });
        // Only a pending intent changes; a credited one is never turned into rejected.
        if (intent?.status === 'pending') {
          await tx.rewardIntent.updateMany({ where: { id: intent.id, status: 'pending' }, data: { status: 'rejected', rejectReason: reason } });
        }
        return reason;
      }

      // Claim the intent first so two callbacks for one intent cannot both credit.
      const claimed = await tx.rewardIntent.updateMany({ where: { id: intent!.id, status: 'pending' }, data: { status: 'credited' } });
      if (claimed.count !== 1) throw new IntentTaken();
      const seconds = settings.minutesPerAd * 60;
      const reward = await tx.adReward.create({ data: { ...base, outcome: 'credited', secondsCredited: seconds } });
      await tx.device.update({
        where: { id: device!.id },
        data:
          device!.adsDay === today
            ? { balanceSeconds: { increment: seconds }, adsToday: { increment: 1 } }
            : { balanceSeconds: { increment: seconds }, adsDay: today, adsToday: 1 },
      });
      await tx.walletEntry.create({ data: { deviceId: device!.id, seconds, reason: 'ad_reward', refId: reward.id } });
      return 'credited' as const;
    });

  try {
    try {
      return await run('normal');
    } catch (e) {
      if (e instanceof IntentTaken) return await run('intent-taken');
      throw e;
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      await countReject('duplicate');
      return 'duplicate';
    }
    throw e;
  }
}

export function utcDayStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Credited ads and minutes since a moment (shared with the dashboard).
export async function creditedSince(since: Date) {
  const agg = await prisma.adReward.aggregate({
    where: { outcome: 'credited', createdAt: { gte: since } },
    _count: { _all: true },
    _sum: { secondsCredited: true },
  });
  return { ads: agg._count._all, minutes: Math.floor((agg._sum.secondsCredited ?? 0) / 60) };
}

// 13.7
export async function rewardsSummary(days: number, now = new Date()) {
  const todayStart = utcDayStart(now);
  const today = utcDay(now);
  const since = new Date(todayStart.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

  const [credited, watchers, rejectedRows, counters, perDay, topDevices] = await Promise.all([
    creditedSince(todayStart),
    prisma.adReward.findMany({
      where: { outcome: 'credited', createdAt: { gte: todayStart } },
      distinct: ['deviceId'],
      select: { deviceId: true },
    }),
    prisma.adReward.groupBy({
      by: ['rejectReason'],
      where: { outcome: 'rejected', createdAt: { gte: todayStart } },
      _count: { _all: true },
    }),
    prisma.rejectCounter.findMany({ where: { day: today } }),
    prisma.$queryRaw<{ day: string; n: number }[]>`
      SELECT to_char(created_at, 'YYYY-MM-DD') AS day, count(*)::int AS n
      FROM ad_rewards
      WHERE outcome = 'credited' AND created_at >= ${since.toISOString()}::timestamp
      GROUP BY 1`,
    prisma.device.findMany({
      where: { adsDay: today },
      orderBy: { adsToday: 'desc' },
      take: 10,
      select: { id: true, adsToday: true, abuseKey: { select: { installCount: true } } },
    }),
  ]);

  const counter = (reason: RejectReason) => counters.find((c) => c.reason === reason)?.count ?? 0;
  const rowsOf = (reason: RejectReason) => rejectedRows.find((r) => r.rejectReason === reason)?._count._all ?? 0;
  const rejectedRowTotal = rejectedRows.reduce((sum, r) => sum + r._count._all, 0);
  const byDay = new Map(perDay.map((d) => [d.day, d.n]));
  const daily = Array.from({ length: days }, (_, i) => {
    const day = utcDay(new Date(since.getTime() + i * 24 * 60 * 60 * 1000));
    return { day, credited: byDay.get(day) ?? 0 };
  });

  return {
    today: {
      adsCredited: credited.ads,
      minutesGranted: credited.minutes,
      devicesWatched: watchers.length,
      rejected: rejectedRowTotal + counters.reduce((sum, c) => sum + c.count, 0),
    },
    daily,
    rejects: {
      duplicate: counter('duplicate'),
      bad_signature: counter('bad_signature'),
      daily_limit: rowsOf('daily_limit'),
      other: rejectedRowTotal - rowsOf('daily_limit'),
    },
    topDevices: topDevices.map((d) => ({ deviceId: d.id, adsToday: d.adsToday, installCount: d.abuseKey.installCount })),
  };
}
