import { describe, expect, it } from 'vitest';
import { statusFor } from '../src/core/errors';

describe('statusFor', () => {
  it('returns the status from spec 18.2', () => {
    expect(statusFor('AUTH_REQUIRED')).toBe(401);
    expect(statusFor('BLOCKED')).toBe(403);
    expect(statusFor('BALANCE_EMPTY')).toBe(402);
    expect(statusFor('RATE_LIMITED')).toBe(429);
  });
});
