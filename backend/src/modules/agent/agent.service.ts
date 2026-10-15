import type { Server } from '@prisma/client';
import { hashToken, randomToken, safeEqual } from '../../core/crypto';
import { prisma } from '../../core/db';
import { AppError } from '../../core/errors';
import { utcMonth } from '../aws/awsAccounts.service';
import { applyReport } from '../metering/metering.service';

// 11.6: the agent sends the last version it applied as If-None-Match: "<n>".
export function peersResponse(peersVersion: number, ifNoneMatch: string | undefined): 'not-modified' | 'send' {
  if (ifNoneMatch === undefined) return 'send';
  const n = Number.parseInt(ifNoneMatch.replace(/^W\//, '').replace(/"/g, ''), 10);
  return n === peersVersion ? 'not-modified' : 'send';
}

export async function registerAgent(input: {
  serverId: string;
  bootstrapToken: string;
  instanceId: string;
  publicIp: string;
  wgPublicKey: string;
  tcpCertSha256: string;
  agentVersion: string;
}) {
  const server = await prisma.server.findUnique({ where: { id: input.serverId } });
  if (!server) throw new AppError('AUTH_INVALID');
  if (!server.bootstrapTokenHash || !safeEqual(server.bootstrapTokenHash, hashToken(input.bootstrapToken))) {
    throw new AppError('AUTH_INVALID');
  }
  // RunInstances has not returned yet; the agent retries.
  if (!server.instanceId) throw new AppError('SERVER_STATE');
  if (server.instanceId !== input.instanceId) throw new AppError('AUTH_INVALID');
  const registrable =
    server.status === 'provisioning' || (server.status === 'failed' && server.failReason === 'never_registered');
  if (!registrable) throw new AppError('SERVER_STATE');

  const agentToken = randomToken();
  const now = new Date();
  // The status condition makes two racing registrations produce one token.
  const { count } = await prisma.server.updateMany({
    where: { id: server.id, bootstrapTokenHash: server.bootstrapTokenHash },
    data: {
      agentTokenHash: hashToken(agentToken),
      bootstrapTokenHash: null,
      wgPublicKey: input.wgPublicKey,
      tcpCertSha256: input.tcpCertSha256,
      publicIp: input.publicIp,
      agentVersion: input.agentVersion,
      status: 'active',
      failReason: null,
      failDetail: null,
      activeAt: now,
      lastReportAt: now,
      peersVersion: { increment: 1 },
    },
  });
  if (count === 0) throw new AppError('AUTH_INVALID');
  return { agentToken, pollSeconds: 2, reportSeconds: 60 };
}

export async function peersOf(server: Server) {
  const sessions = await prisma.session.findMany({
    where: { serverId: server.id },
    select: { publicKey: true, tunnelIp: true },
  });
  return { version: server.peersVersion, peers: sessions };
}

export type AgentReport = {
  appliedVersion: number;
  peers: { publicKey: string; latestHandshake: number; rxBytes: number; txBytes: number }[];
  cpuPct: number;
  memPct: number;
  netTxBytes: number;
  uptimeSeconds: number;
};

// Data out since the last report; a smaller counter means the instance rebooted.
export function txDelta(netTxBytes: bigint, txCounter: bigint): bigint {
  const delta = netTxBytes - txCounter;
  return delta < 0n ? netTxBytes : delta;
}

export async function report(server: Server, body: AgentReport) {
  const now = new Date();
  const netTx = BigInt(body.netTxBytes);
  const delta = txDelta(netTx, server.txCounter);
  const month = utcMonth(now);

  return prisma.$transaction(
    async (tx) => {
      const revive = server.status === 'failed' && server.failReason === 'agent_silent';
      const updated = await tx.server.update({
        where: { id: server.id },
        data: {
          lastReportAt: now,
          cpuPct: body.cpuPct,
          memPct: body.memPct,
          appliedVersion: body.appliedVersion,
          txCounter: netTx,
          ...(revive ? { status: 'active' as const, failReason: null, failDetail: null } : {}),
        },
      });
      await tx.accountUsage.upsert({
        where: { awsAccountId_month: { awsAccountId: server.awsAccountId, month } },
        create: { awsAccountId: server.awsAccountId, month, txBytes: delta },
        update: { txBytes: { increment: delta } },
      });
      await applyReport(updated, body.peers, now, tx);
      const { peersVersion } = await tx.server.findUniqueOrThrow({
        where: { id: server.id },
        select: { peersVersion: true },
      });
      return { ok: true, version: peersVersion };
    },
    { timeout: 20000 },
  );
}
