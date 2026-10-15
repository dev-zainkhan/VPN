import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { adUnitMatches } from '../src/modules/rewards/rewards.service';
import { keyIdOf, verifySsv } from '../src/modules/rewards/ssvVerifier';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const keys = new Map([['1', publicKey.export({ type: 'spki', format: 'pem' }).toString()]]);

// AdMob's parameter order; signature and key_id last.
function signedUrl(customData = 'nonce123', keyId = '1') {
  const message =
    'ad_network=5450213213286189855&ad_unit=1234567890&custom_data=' +
    customData +
    '&reward_amount=30&reward_item=minutes&timestamp=1792000000000&transaction_id=abc123&user_id=00000000-0000-0000-0000-000000000001';
  const signature = sign('sha256', Buffer.from(message), { key: privateKey, dsaEncoding: 'der' }).toString('base64url');
  return { url: `/api/admob/ssv?${message}&signature=${signature}&key_id=${keyId}`, message };
}

describe('verifySsv (10.4)', () => {
  it('accepts a valid signature and returns the signed message', () => {
    const { url, message } = signedUrl();
    expect(verifySsv(url, keys)).toEqual({ valid: true, message });
  });
  it('rejects a changed reward_amount', () => {
    const { url } = signedUrl();
    expect(verifySsv(url.replace('reward_amount=30', 'reward_amount=99'), keys).valid).toBe(false);
  });
  it('rejects a URL without a signature', () => {
    const { url } = signedUrl();
    expect(verifySsv(url.slice(0, url.indexOf('&signature=')), keys).valid).toBe(false);
  });
  it('rejects an unknown key_id', () => {
    expect(verifySsv(signedUrl('nonce123', '2').url, keys).valid).toBe(false);
  });
  it('verifies the raw string when custom_data has %2B and %3D', () => {
    expect(verifySsv(signedUrl('ab%2Bcd%3D%3D').url, keys).valid).toBe(true);
  });
  it('rejects garbage', () => {
    expect(verifySsv('/api/admob/ssv', keys).valid).toBe(false);
    expect(verifySsv('/api/admob/ssv?a=1&signature=!!!&key_id=1', keys).valid).toBe(false);
  });
  it('reads key_id from the tail', () => {
    expect(keyIdOf(signedUrl('x', '7').url)).toBe('7');
    expect(keyIdOf('/api/admob/ssv?a=1')).toBeNull();
  });
});

describe('adUnitMatches (10.4 check 1)', () => {
  it('accepts the full id or the part after the slash', () => {
    expect(adUnitMatches('ca-app-pub-1/2345', 'ca-app-pub-1/2345')).toBe(true);
    expect(adUnitMatches('2345', 'ca-app-pub-1/2345')).toBe(true);
    expect(adUnitMatches('9999', 'ca-app-pub-1/2345')).toBe(false);
  });
});
