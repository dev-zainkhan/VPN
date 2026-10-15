import type { Prisma, Server } from '@prisma/client';
import { endSession } from '../connections/connections.service';

export const ACTIVE_HANDSHAKE_S = 180;
export const MAX_DEBIT_S = 120;

// 9.5 rules 2 and 3.1. latestHandshake is Unix seconds; 0 means never.
export function computeDebit(lastDebitAt: Date, reportTime: Date, latestHandshake: number) {
  const active = latestHandshake > 0 && reportTime.getTime() / 1000 - latestHandshake <= ACTIVE_HANDSHAKE_S;
  if (!active) return { active, seconds: 0 };
  const elapsed = Math.floor((reportTime.getTime() - lastDebitAt.getTime()) / 1000);
  return { active, seconds: Math.min(Math.max(elapsed, 0), MAX_DEBIT_S) };
}

// 9.5: runs inside the report transaction (11.6).
export async function applyReport(
  server: Server,
  peers: { publicKey: string; latestHandshake: number }[],
  reportTime: Date,
  tx: Prisma.TransactionClient,
) {
  const handshakes = new Map(peers.map((p) => [p.publicKey, p.latestHandshake]));
  const sessions = await tx.session.findMany({ where: { serverId: server.id } });
  const idle: string[] = [];
  let ended = 0;

  for (const s of sessions) {
    const latest = handshakes.get(s.publicKey) ?? 0;
    const { active, seconds } = computeDebit(s.lastDebitAt, reportTime, latest);
    if (!active) {
      idle.push(s.id);
      continue;
    }
    const rows = await tx.$queryRaw<{ balance_seconds: number }[]>`
      UPDATE devices SET balance_seconds = GREATEST(balance_seconds - ${seconds}, 0)
      WHERE id = ${s.deviceId}::uuid RETURNING balance_seconds`;
    await tx.session.update({
      where: { id: s.id },
      data: { lastDebitAt: reportTime, lastHandshakeAt: new Date(latest * 1000) },
    });
    if (rows[0]?.balance_seconds === 0) {
      await endSession(s.deviceId, 'balance_empty', tx);
      ended++;
    }
  }
  // Idle time is never charged later.
  if (idle.length) await tx.session.updateMany({ where: { id: { in: idle } }, data: { lastDebitAt: reportTime } });
  return { sessions: sessions.length, ended };
}
