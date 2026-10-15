import { describe, expect, it } from 'vitest';
import { randomTunnelIp } from '../src/modules/connections/ipAllocator';

describe('randomTunnelIp (9.2)', () => {
  it('stays inside 10.66.0.2 to 10.66.255.254', () => {
    for (let i = 0; i < 10000; i++) {
      const ip = randomTunnelIp();
      expect(ip.startsWith('10.66.')).toBe(true);
      expect(['10.66.0.0', '10.66.0.1', '10.66.255.255']).not.toContain(ip);
      const [, , c, d] = ip.split('.').map(Number);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(255);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(255);
    }
  });
});
