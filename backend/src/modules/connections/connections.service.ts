import { Prisma, type Device, type Protocol, type Server } from '@prisma/client';
import { prisma } from '../../core/db';
import { AppError } from '../../core/errors';
import { logger } from '../../core/logger';
import { randomTunnelIp } from './ipAllocator';
import { pickServer } from './serverPicker';

const MAX_IP_ATTEMPTS = 10;
export const TCP_LOCAL_PORT = 51821;
const KEY_RE = /^[A-Za-z0-9+/]{43}=$/;

// A WireGuard public key: 44 base64 characters that decode to 32 bytes.
export function isWgKey(value: unknown): value is string {
  return typeof value === 'string' && KEY_RE.test(value) && Buffer.from(value, 'base64').length === 32;
}

export type EndReason = 'user' | 'balance_empty' | 'admin' | 'blocked' | 'stale' | 'server_gone';

// 9.4: the one way a single connection ends.
export async function endSession(deviceId: string, reason: EndReason, db: Prisma.TransactionClient = prisma) {
  const run = async (tx: Prisma.TransactionClient) => {
    const session = await tx.session.findUnique({ where: { deviceId } });
    if (!session) return null;
    const { count } = await tx.session.deleteMany({ where: { id: session.id } });
    if (count === 0) return null;
    await tx.server.update({ where: { id: session.serverId }, data: { peersVersion: { increment: 1 } } });
    return session.serverId;
  };
  const serverId = db === prisma ? await prisma.$transaction(run) : await run(db);
  // Never the device ID (no-logs rule).
  if (serverId) logger.debug({ reason, serverId }, 'session ended');
}

// For a server that is gone or failed: no version bump, nobody is listening.
export async function endServerSessions(serverId: string, db: Prisma.TransactionClient = prisma) {
  const { count } = await db.session.deleteMany({ where: { serverId } });
  return count;
}

function uniqueTarget(e: unknown): string | null {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    return String(e.meta?.target ?? '');
  }
  return null;
}

// 9.3
export async function connect(
  device: Device,
  blocked: boolean,
  input: { regionCode: string; protocol: Protocol; publicKey: string },
) {
  if (blocked) throw new AppError('BLOCKED');
  if (device.balanceSeconds <= 0) throw new AppError('BALANCE_EMPTY');
  const region = await prisma.region.findUnique({ where: { code: input.regionCode } });
  if (!region || !region.visible) throw new AppError('REGION_UNAVAILABLE');
  const server = await pickServer(input.regionCode);
  if (!server) throw new AppError('NO_SERVER_AVAILABLE');

  let session = null;
  for (let attempt = 0; attempt < MAX_IP_ATTEMPTS && !session; attempt++) {
    try {
      session = await prisma.$transaction(async (tx) => {
        await endSession(device.id, 'user', tx);
        const created = await tx.session.create({
          data: {
            deviceId: device.id,
            serverId: server.id,
            protocol: input.protocol,
            publicKey: input.publicKey,
            tunnelIp: randomTunnelIp(),
            lastDebitAt: new Date(),
            lastHandshakeAt: null,
          },
        });
        await tx.server.update({ where: { id: server.id }, data: { peersVersion: { increment: 1 } } });
        return created;
      });
    } catch (e) {
      const target = uniqueTarget(e);
      if (target === null) throw e;
      if (target.includes('public_key')) throw new AppError('PUBLIC_KEY_IN_USE');
      // tunnel_ip taken, or a second connect from the same device raced this one: try again.
    }
  }
  if (!session) throw new AppError('NO_SERVER_AVAILABLE');
  return connectResponse(session, server, input.protocol, device.balanceSeconds);
}

function connectResponse(
  session: { id: string; tunnelIp: string },
  server: Server,
  protocol: Protocol,
  balanceSeconds: number,
) {
  const tcp = protocol === 'tcp';
  return {
    sessionId: session.id,
    server: { id: server.id, regionCode: server.regionCode, publicIp: server.publicIp },
    wireguard: {
      address: `${session.tunnelIp}/32`,
      dns: ['1.1.1.1', '1.0.0.1'],
      mtu: tcp ? 1280 : 1420,
      peer: {
        publicKey: server.wgPublicKey,
        endpoint: tcp ? `127.0.0.1:${TCP_LOCAL_PORT}` : `${server.publicIp}:51820`,
        allowedIps: ['0.0.0.0/0', '::/0'],
        persistentKeepalive: 25,
      },
    },
    tcp: tcp ? { host: server.publicIp, port: 443, certSha256: server.tcpCertSha256 } : null,
    balanceSeconds,
  };
}
