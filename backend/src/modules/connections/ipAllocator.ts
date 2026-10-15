import { randomInt } from 'node:crypto';

// 9.2: 10.66.0.2 to 10.66.255.254; 10.66.0.1 is the server. Uniqueness per server comes from the database.
export function randomTunnelIp(): string {
  const n = randomInt(2, 65535);
  return `10.66.${n >> 8}.${n & 255}`;
}
