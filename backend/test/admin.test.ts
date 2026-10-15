import { describe, expect, it } from 'vitest';
import { auditDetail } from '../src/modules/admin/audit';
import { computeHours, utcMonth } from '../src/modules/aws/awsAccounts.service';
import { mapAwsError } from '../src/modules/aws/awsClient';

function awsErr(name: string, message = 'aws said no') {
  const e = new Error(message);
  e.name = name;
  return e;
}

describe('mapAwsError (12.8)', () => {
  it('maps rejected keys', () => {
    for (const n of ['InvalidClientTokenId', 'SignatureDoesNotMatch', 'AuthFailure']) {
      expect(mapAwsError(awsErr(n), 'x').code).toBe('AWS_KEYS_INVALID');
    }
  });
  it('puts the failed action in details for missing permissions', () => {
    const e = mapAwsError(awsErr('UnauthorizedOperation'), 'ec2:RunInstances');
    expect(e.code).toBe('AWS_PERMISSION_MISSING');
    expect(e.details).toEqual({ action: 'ec2:RunInstances' });
  });
  it('maps limits, capacity, opt-in and unsupported', () => {
    expect(mapAwsError(awsErr('VcpuLimitExceeded'), 'x').code).toBe('AWS_LIMIT_REACHED');
    expect(mapAwsError(awsErr('InsufficientInstanceCapacity'), 'x').code).toBe('AWS_NO_CAPACITY');
    expect(mapAwsError(awsErr('OptInRequired'), 'x').code).toBe('AWS_REGION_NOT_ENABLED');
    expect(mapAwsError(awsErr('Unsupported'), 'x').code).toBe('AWS_UNSUPPORTED');
  });
  it('keeps the AWS message for anything else', () => {
    const e = mapAwsError(awsErr('Throttling', 'Rate exceeded'), 'x');
    expect(e.code).toBe('AWS_ERROR');
    expect(e.message).toBe('Rate exceeded');
  });
});

describe('free-tier usage (13.10)', () => {
  const now = new Date('2026-10-15T12:00:00Z');
  it('counts only this month and stops at termination', () => {
    const hours = computeHours(
      [
        { launchedAt: new Date('2026-09-20T00:00:00Z'), terminatedAt: null }, // 14.5 days this month
        { launchedAt: new Date('2026-10-15T10:00:00Z'), terminatedAt: new Date('2026-10-15T11:30:00Z') },
        { launchedAt: new Date('2026-09-01T00:00:00Z'), terminatedAt: new Date('2026-09-30T00:00:00Z') },
      ],
      now,
    );
    expect(hours).toBe(348 + 1.5);
  });
  it('formats the month', () => {
    expect(utcMonth(now)).toBe('2026-10');
  });
});

describe('auditDetail (13.11)', () => {
  it('drops secrets and keeps the rest', () => {
    expect(
      auditDetail({ nickname: 'Main', accessKeyId: 'AKIA', secretAccessKey: 's', password: 'p', code: '123456' }),
    ).toEqual({ nickname: 'Main' });
  });
  it('stores nothing when only secrets were sent', () => {
    expect(auditDetail({ currentPassword: 'a', newPassword: 'b' })).toBeUndefined();
  });
});
