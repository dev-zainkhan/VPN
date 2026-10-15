import { describe, expect, it } from 'vitest';
import { computeDebit } from '../src/modules/metering/metering.service';

const report = new Date('2026-10-15T12:00:00Z');
const unix = report.getTime() / 1000;
const before = (s: number) => new Date(report.getTime() - s * 1000);

describe('computeDebit (9.5)', () => {
  it('handshake 0 is inactive', () => {
    expect(computeDebit(before(60), report, 0)).toEqual({ active: false, seconds: 0 });
  });
  it('handshake 100 s before the report is active', () => {
    expect(computeDebit(before(60), report, unix - 100).active).toBe(true);
  });
  it('handshake 200 s before the report is inactive', () => {
    expect(computeDebit(before(60), report, unix - 200).active).toBe(false);
  });
  it('caps a long gap at 120 s', () => {
    expect(computeDebit(before(300), report, unix - 10).seconds).toBe(120);
  });
  it('charges the real gap below the cap', () => {
    expect(computeDebit(before(45), report, unix - 10).seconds).toBe(45);
  });
  it('never charges a negative gap', () => {
    expect(computeDebit(new Date(report.getTime() + 5000), report, unix - 10).seconds).toBe(0);
  });
});
