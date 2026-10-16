import { FreeTierClient, GetAccountPlanStateCommand } from '@aws-sdk/client-freetier';
import type { AwsAccount } from '@prisma/client';
import { logger } from '../../core/logger';
import { keysOf } from './awsClient';

// What AWS reports about an account's plan: the Free plan's remaining credits and end date.
export type AccountCredits =
  | {
      ok: true;
      planType: string;
      planStatus: string;
      remaining: number | null;
      currency: string | null;
      expiresAt: string | null;
      checkedAt: string;
    }
  | { ok: false; reason: 'missing_permission' | 'error'; message: string; checkedAt: string };

const OK_TTL_MS = 60 * 60 * 1000;
const ERROR_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: AccountCredits }>();

// Cached for an hour (the number changes slowly; AWS updates it about once a day).
export async function accountCredits(account: AwsAccount, now = Date.now()): Promise<AccountCredits> {
  const hit = cache.get(account.id);
  if (hit && now - hit.at < (hit.value.ok ? OK_TTL_MS : ERROR_TTL_MS)) return hit.value;
  let value: AccountCredits;
  try {
    const out = await new FreeTierClient({ region: 'us-east-1', credentials: keysOf(account), maxAttempts: 2 }).send(
      new GetAccountPlanStateCommand({}),
    );
    value = {
      ok: true,
      planType: out.accountPlanType ?? 'UNKNOWN',
      planStatus: out.accountPlanStatus ?? 'UNKNOWN',
      remaining: out.accountPlanRemainingCredits?.amount ?? null,
      currency: out.accountPlanRemainingCredits?.unit ?? null,
      expiresAt: out.accountPlanExpirationDate?.toISOString() ?? null,
      checkedAt: new Date(now).toISOString(),
    };
  } catch (e) {
    const name = e instanceof Error ? e.name : 'Unknown';
    const missing = name === 'AccessDeniedException' || name === 'AccessDenied' || name === 'UnauthorizedOperation';
    if (!missing) logger.warn({ name }, 'free plan credits check failed');
    value = {
      ok: false,
      reason: missing ? 'missing_permission' : 'error',
      message: missing ? 'The IAM user needs the freetier:GetAccountPlanState permission' : `AWS: ${name}`,
      checkedAt: new Date(now).toISOString(),
    };
  }
  cache.set(account.id, { at: now, value });
  return value;
}

// After keys change, ask AWS again instead of showing an old answer.
export function forgetCredits(accountId: string): void {
  cache.delete(accountId);
}
