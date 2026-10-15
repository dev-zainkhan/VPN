import type { AbuseKey, Device } from '@prisma/client';
import { config } from '../../core/config';
import { hashAbuseKey, hashToken, randomToken } from '../../core/crypto';
import { prisma } from '../../core/db';
import { getSettings, utcDay } from '../settings/settings.service';
import type { RegisterBody } from './devices.schemas';

// 8.2: starter minutes are given once per phone (per abuse key), never per install.
export async function registerDevice(input: RegisterBody) {
  const keyHash = hashAbuseKey(input.abuseKey);
  const deviceToken = randomToken();

  const device = await prisma.$transaction(async (tx) => {
    const abuseKey = await tx.abuseKey.upsert({
      where: { keyHash },
      create: { keyHash, installCount: 1 },
      update: { installCount: { increment: 1 } },
    });
    const settings = await getSettings(tx);

    let balanceSeconds = 0;
    const grantStarter = !abuseKey.blocked && !abuseKey.starterGranted;
    if (grantStarter) {
      balanceSeconds = settings.starterMinutes * 60;
      await tx.abuseKey.update({ where: { keyHash }, data: { starterGranted: true } });
    }

    const created = await tx.device.create({
      data: {
        tokenHash: hashToken(deviceToken),
        abuseKeyHash: keyHash,
        platform: input.platform,
        appVersion: input.appVersion,
        balanceSeconds,
      },
    });
    if (grantStarter) {
      await tx.walletEntry.create({ data: { deviceId: created.id, seconds: balanceSeconds, reason: 'starter' } });
    }
    return { created, blocked: abuseKey.blocked };
  });

  return {
    deviceId: device.created.id,
    deviceToken,
    balanceSeconds: device.created.balanceSeconds,
    blocked: device.blocked,
  };
}

// 8.3
export async function getMe(device: Device & { abuseKey: AbuseKey }) {
  const [settings, session] = await Promise.all([
    getSettings(),
    prisma.session.findUnique({ where: { deviceId: device.id }, include: { server: { select: { regionCode: true } } } }),
  ]);
  return {
    deviceId: device.id,
    balanceSeconds: device.balanceSeconds,
    blocked: device.abuseKey.blocked,
    adsToday: device.adsDay === utcDay() ? device.adsToday : 0,
    adsLimit: settings.maxAdsPerDay,
    session: session
      ? {
          sessionId: session.id,
          regionCode: session.server.regionCode,
          protocol: session.protocol,
          startedAt: session.startedAt.toISOString(),
        }
      : null,
  };
}

// 8.4
export async function getAppConfig() {
  const settings = await getSettings();
  return {
    minutesPerAd: settings.minutesPerAd,
    maxAdsPerDay: settings.maxAdsPerDay,
    lowMinutesWarningSeconds: settings.lowMinutesWarning * 60,
    defaultProtocol: settings.defaultProtocol,
    supportEmail: settings.supportEmail,
    admobAdUnitId: config.ADMOB_AD_UNIT_ID,
    tcpLocalPort: 51821,
    serverTime: new Date().toISOString(),
  };
}
