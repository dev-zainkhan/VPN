import { describe, expect, it } from 'vitest';
import { peersResponse, txDelta } from '../src/modules/agent/agent.service';
import { chooseInstanceType } from '../src/modules/aws/provisioning.service';
import { isWgKey } from '../src/modules/connections/connections.service';

describe('peersResponse (11.6)', () => {
  it('same version is not modified', () => expect(peersResponse(7, '"7"')).toBe('not-modified'));
  it('older version is sent', () => expect(peersResponse(7, '"6"')).toBe('send'));
  it('missing header is sent', () => expect(peersResponse(7, undefined)).toBe('send'));
  it('garbage header is sent', () => expect(peersResponse(7, 'abc')).toBe('send'));
});

describe('txDelta (11.6 step 3)', () => {
  it('adds the growth', () => expect(txDelta(1500n, 1000n)).toBe(500n));
  it('a reset counter counts from zero', () => expect(txDelta(300n, 1000n)).toBe(300n));
});

describe('chooseInstanceType (12.6 step 3)', () => {
  const free = ['c7i-flex.large', 't3.micro', 't3.small'];
  it('prefers t3.micro', () => expect(chooseInstanceType(free)).toBe('t3.micro'));
  it('then t2.micro', () => expect(chooseInstanceType(['t2.micro', 't3.small'])).toBe('t2.micro'));
  it('then the first listed', () => expect(chooseInstanceType(['t3.small'])).toBe('t3.small'));
  it('accepts a requested free type', () => expect(chooseInstanceType(free, 't3.small')).toBe('t3.small'));
  it('refuses a type that is not free', () =>
    expect(() => chooseInstanceType(free, 'm5.large')).toThrowError('INSTANCE_TYPE_NOT_FREE'));
  it('refuses an empty list', () => expect(() => chooseInstanceType([])).toThrowError('NO_FREE_TIER_TYPE'));
});

describe('isWgKey (8.6)', () => {
  it('accepts a 32-byte base64 key', () => expect(isWgKey(Buffer.alloc(32, 9).toString('base64'))).toBe(true));
  it('refuses a short key', () => expect(isWgKey(Buffer.alloc(31, 9).toString('base64'))).toBe(false));
  it('refuses non-base64', () => expect(isWgKey('!'.repeat(43) + '=')).toBe(false));
});
