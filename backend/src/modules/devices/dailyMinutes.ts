import type { AbuseKey, Device } from '@prisma/client';
import { prisma } from '../../core/db';
import { getSettings, utcDay } from '../settings/settings.service';

// Daily free minutes: once per UTC day per phone (abuse key, so reinstalling does not give
// them twice), the balance is filled up to Settings.dailyFreeMinutes. A larger balance is kept.
export async function applyDailyMinutes(device: Device & { abuseKey: AbuseKey }, today = utcDay()) {
  if (device.abuseKey.blocked || device.abuseKey.dailyTopUpDay === today) return null;
  const { dailyFreeMinutes } = await getSettings();
  const target = dailyFreeMinutes * 60;
  return prisma.$transaction(async (tx) => {
    // Claim today's top-up for this phone; a request running at the same time gets count 0.
    const { count } = await tx.abuseKey.updateMany({
      where: { keyHash: device.abuseKeyHash, blocked: false, OR: [{ dailyTopUpDay: null }, { dailyTopUpDay: { not: today } }] },
      data: { dailyTopUpDay: today },
    });
    if (count === 0) return null;
    const [row] = await tx.$queryRaw<{ balance_seconds: number }[]>`
      SELECT balance_seconds FROM devices WHERE id = ${device.id}::uuid FOR UPDATE`;
    const before = row?.balance_seconds ?? 0;
    const added = target > before ? target - before : 0;
    if (added > 0) {
      await tx.device.update({ where: { id: device.id }, data: { balanceSeconds: target } });
      await tx.walletEntry.create({ data: { deviceId: device.id, seconds: added, reason: 'daily' } });
    }
    return { added, balanceSeconds: before + added, day: today };
  });
}

// The next refill: midnight UTC.
export function nextDailyRefill(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}
