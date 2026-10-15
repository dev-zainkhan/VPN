import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, hashAbuseKey, hashToken, safeEqual } from '../src/core/crypto';

describe('crypto', () => {
  it('decrypt returns what encrypt was given', () => {
    const blob = encrypt('AKIAEXAMPLEKEY123456');
    expect(blob.startsWith('v1:')).toBe(true);
    expect(decrypt(blob)).toBe('AKIAEXAMPLEKEY123456');
  });

  it('a changed character makes decrypt throw', () => {
    const blob = encrypt('secret value');
    const last = blob.at(-2) === 'A' ? 'B' : 'A';
    const tampered = `${blob.slice(0, -2)}${last}${blob.slice(-1)}`;
    expect(() => decrypt(tampered)).toThrow();
  });

  it('rejects an unknown format', () => {
    expect(() => decrypt('v2:a:b:c')).toThrow();
  });

  it('hashToken is stable and differs per input', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
    expect(hashToken('abc')).not.toBe(hashAbuseKey('abc'));
  });

  it('safeEqual compares exactly', () => {
    expect(safeEqual('same', 'same')).toBe(true);
    expect(safeEqual('same', 'samf')).toBe(false);
    expect(safeEqual('short', 'longer')).toBe(false);
  });
});
