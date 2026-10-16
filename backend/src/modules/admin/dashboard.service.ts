import { prisma } from '../../core/db';
import { accountUsage } from '../aws/awsAccounts.service';
import { accountCredits } from '../aws/credits';
import { REPORT_FRESH_MS } from '../regions/regions.service';
import { creditedSince, utcDayStart } from '../rewards/rewards.service';

const FAIL_TITLES = {
  launch_error: 'Server launch failed',
  never_registered: 'Server never registered',
  agent_silent: 'Server stopped reporting',
  instance_lost: 'Server instance is gone',
} as const;

type Alert = {
  id: string;
  severity: 'error' | 'warning';
  title: string;
  text: string;
  targetType: 'server' | 'aws_account';
  targetId: string;
};

const CREDITS_WARN = 20;
const PLAN_END_WARN_DAYS = 30;

const pct = (used: number, limit: number | null) => (limit ? Math.floor((used / limit) * 100) : 0);

// 13.9: computed on every request, nothing stored.
export async function dashboard(now = new Date()) {
  const onlineSince = new Date(now.getTime() - REPORT_FRESH_MS);
  const todayStart = utcDayStart(now);
  const [failed, accounts, active, onlineNow, newDevicesToday, credited, liveServers, onlineByServer] =
    await Promise.all([
      prisma.server.findMany({ where: { status: 'failed' }, include: { region: true } }),
      prisma.awsAccount.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.server.findMany({ where: { status: 'active' }, select: { regionCode: true } }),
      prisma.session.count({ where: { lastHandshakeAt: { gte: onlineSince } } }),
      prisma.device.count({ where: { firstSeenAt: { gte: todayStart } } }),
      creditedSince(todayStart),
      prisma.server.findMany({
        where: { status: { not: 'terminated' } },
        select: { id: true, regionCode: true, region: { select: { displayName: true, sortOrder: true } } },
      }),
      prisma.session.groupBy({
        by: ['serverId'],
        where: { lastHandshakeAt: { gte: onlineSince } },
        _count: { _all: true },
      }),
    ]);

  const alerts: Alert[] = failed.map((s) => ({
    id: `server:${s.id}`,
    severity: 'error',
    title: s.failReason ? FAIL_TITLES[s.failReason] : 'Server failed',
    text: `${s.region.displayName}${s.instanceId ? ` (${s.instanceId})` : ''}: ${s.failDetail ?? 'no detail'}`,
    targetType: 'server',
    targetId: s.id,
  }));

  const usage = [];
  for (const a of accounts) {
    const u = await accountUsage(a, now);
    const credits = await accountCredits(a, now.getTime());
    usage.push({ accountId: a.id, nickname: a.nickname, ...u, credits });
    // Free plan running out: few credits left, or the plan ends soon (AWS then closes the account
    // unless it is upgraded, and every server in it stops).
    if (credits.ok && credits.planType === 'FREE') {
      const daysLeft = credits.expiresAt ? (new Date(credits.expiresAt).getTime() - now.getTime()) / 86400000 : null;
      if (credits.remaining !== null && credits.remaining < CREDITS_WARN) {
        alerts.push({ id: `account-credits:${a.id}`, severity: 'warning', title: `Free credits low: ${credits.remaining.toFixed(2)} ${credits.currency ?? ''}`.trim(), text: `${a.nickname}: when the credits run out AWS stops the free plan. Upgrade the account in AWS Billing to keep servers running.`, targetType: 'aws_account', targetId: a.id });
      } else if (daysLeft !== null && daysLeft < PLAN_END_WARN_DAYS) {
        alerts.push({ id: `account-plan-end:${a.id}`, severity: 'warning', title: `Free plan ends in ${Math.max(0, Math.ceil(daysLeft))} days`, text: `${a.nickname}: upgrade the account in AWS Billing before ${credits.expiresAt!.slice(0, 10)} or its servers stop.`, targetType: 'aws_account', targetId: a.id });
      }
    }
    if (a.status === 'keys_rejected') {
      alerts.push({
        id: `account-keys:${a.id}`,
        severity: 'error',
        title: 'AWS keys rejected',
        text: `${a.nickname}: ${a.lastError ?? 'AWS refused the keys'}. Update the keys.`,
        targetType: 'aws_account',
        targetId: a.id,
      });
    }
    const compute = pct(u.computeHours, u.computeLimitHours);
    const data = pct(u.dataOutGb, u.dataOutLimitGb);
    if (compute >= 80 || data >= 80) {
      const [title, text] =
        compute >= data
          ? [`Free compute limit at ${compute}%`, `${a.nickname}: ${u.computeHours} of ${u.computeLimitHours} hours this month`]
          : [`Free data limit at ${data}%`, `${a.nickname}: ${u.dataOutGb} of ${u.dataOutLimitGb} GB this month`];
      alerts.push({ id: `account-usage:${a.id}`, severity: 'warning', title, text, targetType: 'aws_account', targetId: a.id });
    }
  }

  const online = new Map(onlineByServer.map((g) => [g.serverId, g._count._all]));
  const regionMap = new Map<string, { code: string; displayName: string; sortOrder: number; servers: number; online: number }>();
  for (const s of liveServers) {
    const r = regionMap.get(s.regionCode) ?? {
      code: s.regionCode,
      displayName: s.region.displayName,
      sortOrder: s.region.sortOrder,
      servers: 0,
      online: 0,
    };
    r.servers++;
    r.online += online.get(s.id) ?? 0;
    regionMap.set(s.regionCode, r);
  }

  return {
    alerts,
    kpis: {
      activeServers: active.length,
      activeRegions: new Set(active.map((s) => s.regionCode)).size,
      onlineNow,
      newDevicesToday,
      adsToday: credited.ads,
      minutesGrantedToday: credited.minutes,
    },
    usage: usage.map(({ month: _month, ...u }) => u),
    regions: [...regionMap.values()]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(({ sortOrder: _s, ...r }) => r),
  };
}
