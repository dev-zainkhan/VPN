import { hashToken } from '../core/crypto';
import { prisma } from '../core/db';
import { AppError } from '../core/errors';
import { ah } from '../core/http';
import { logger } from '../core/logger';
import { applyDailyMinutes } from '../modules/devices/dailyMinutes';

const LAST_SEEN_EVERY_MS = 5 * 60 * 1000;

export function bearerToken(header: string | undefined): string | null {
  const match = /^Bearer (\S+)$/.exec(header ?? '');
  return match ? match[1] : null;
}

export const deviceAuth = ah(async (req, _res, next) => {
  const token = bearerToken(req.headers.authorization);
  if (!token) throw new AppError('AUTH_REQUIRED');

  const device = await prisma.device.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { abuseKey: true },
  });
  if (!device) throw new AppError('AUTH_INVALID');

  // The first request of the day fills up the daily free minutes.
  const daily = await applyDailyMinutes(device);
  if (daily) {
    device.balanceSeconds = daily.balanceSeconds;
    device.abuseKey.dailyTopUpDay = daily.day;
  }

  req.device = device;
  req.deviceBlocked = device.abuseKey.blocked;

  if (Date.now() - device.lastSeenAt.getTime() > LAST_SEEN_EVERY_MS) {
    prisma.device
      .update({ where: { id: device.id }, data: { lastSeenAt: new Date() } })
      .catch((e: unknown) => logger.error({ message: e instanceof Error ? e.message : String(e) }, 'lastSeenAt update failed'));
  }
  next();
});
