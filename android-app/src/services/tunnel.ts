import { VeilVpn, type TunnelConfig } from '../../modules/veil-vpn';
import type { ConnectResponse } from './api';

// Local networks stay outside the tunnel, so the phone can still reach its router and,
// in test builds, the laptop running the API.
const LOCAL_RANGES = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16', '127.0.0.0/8'];

const ipToNumber = (ip: string) => ip.split('.').reduce((n, part) => n * 256 + Number(part), 0);
const numberToIp = (n: number) => [24, 16, 8, 0].map((s) => Math.floor(n / 2 ** s) % 256).join('.');

// 0.0.0.0/0 minus the given ranges, as CIDR blocks.
export function ipv4Except(excluded: string[]): string[] {
  const ranges = excluded.map((cidr) => {
    const [ip, bits = '32'] = cidr.split('/');
    const size = 2 ** (32 - Number(bits));
    const start = Math.floor(ipToNumber(ip!) / size) * size;
    return [start, start + size - 1] as const;
  });
  const out: string[] = [];
  const walk = (start: number, bits: number) => {
    const end = start + 2 ** (32 - bits) - 1;
    if (ranges.some(([a, b]) => a <= start && end <= b)) return;
    if (!ranges.some(([a, b]) => a <= end && start <= b)) {
      out.push(`${numberToIp(start)}/${bits}`);
      return;
    }
    walk(start, bits + 1);
    walk(start + 2 ** (32 - bits - 1), bits + 1);
  };
  walk(0, 0);
  return out;
}

const ALLOWED_V4 = ipv4Except(LOCAL_RANGES);

export function tunnelConfig(c: ConnectResponse, privateKey: string, localPort: number): TunnelConfig {
  const everything = c.wireguard.peer.allowedIps.includes('0.0.0.0/0');
  return {
    privateKey,
    address: c.wireguard.address,
    dns: c.wireguard.dns,
    mtu: c.wireguard.mtu,
    peerPublicKey: c.wireguard.peer.publicKey,
    endpoint: c.wireguard.peer.endpoint,
    // IPv6 goes into the tunnel too (and is dropped there), so it cannot leak around the VPN.
    allowedIps: everything ? [...ALLOWED_V4, '::/0'] : c.wireguard.peer.allowedIps,
    persistentKeepalive: c.wireguard.peer.persistentKeepalive,
    tcp: c.tcp,
    localPort,
  };
}

// Waits for the first WireGuard handshake; false after the timeout (spec 8.6: Auto mode waits 8 s).
export async function waitForHandshake(timeoutMs: number): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const stats = await VeilVpn.getStats();
    if (stats.latestHandshakeMs > 0) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
