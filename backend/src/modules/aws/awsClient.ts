import { EC2Client } from '@aws-sdk/client-ec2';
import { STSClient } from '@aws-sdk/client-sts';
import type { AwsAccount } from '@prisma/client';
import { decrypt } from '../../core/crypto';
import { prisma } from '../../core/db';
import { AppError, type ErrorCode } from '../../core/errors';

export interface AwsKeys {
  accessKeyId: string;
  secretAccessKey: string;
}

// 12.2: clients are made per operation; decrypted keys never leave the caller.
export function keysOf(account: AwsAccount): AwsKeys {
  return { accessKeyId: decrypt(account.accessKeyIdEnc), secretAccessKey: decrypt(account.secretAccessKeyEnc) };
}

export function ec2With(keys: AwsKeys, region: string): EC2Client {
  return new EC2Client({ region, credentials: keys, maxAttempts: 3 });
}

export function ec2For(account: AwsAccount, region: string): EC2Client {
  return ec2With(keysOf(account), region);
}

export function stsFor(keys: AwsKeys): STSClient {
  return new STSClient({ region: 'us-east-1', credentials: keys });
}

// 12.8
const MAP: Record<string, ErrorCode> = {
  InvalidClientTokenId: 'AWS_KEYS_INVALID',
  SignatureDoesNotMatch: 'AWS_KEYS_INVALID',
  AuthFailure: 'AWS_KEYS_INVALID',
  UnauthorizedOperation: 'AWS_PERMISSION_MISSING',
  AccessDenied: 'AWS_PERMISSION_MISSING',
  AccessDeniedException: 'AWS_PERMISSION_MISSING',
  InstanceLimitExceeded: 'AWS_LIMIT_REACHED',
  VcpuLimitExceeded: 'AWS_LIMIT_REACHED',
  InsufficientInstanceCapacity: 'AWS_NO_CAPACITY',
  OptInRequired: 'AWS_REGION_NOT_ENABLED',
  Unsupported: 'AWS_UNSUPPORTED',
};

export function mapAwsError(err: unknown, action: string): AppError {
  if (err instanceof AppError) return err;
  const name = err instanceof Error ? err.name : 'Unknown';
  const message = err instanceof Error ? err.message : String(err);
  const code = MAP[name] ?? 'AWS_ERROR';
  if (code === 'AWS_PERMISSION_MISSING') return new AppError(code, message, { action });
  if (code === 'AWS_ERROR') return new AppError(code, message);
  return new AppError(code);
}

// Runs one AWS call and converts its error (12.8). For a stored account, rejected keys
// also mark the account (12.4 key failures); pass null for keys that are not saved yet.
export async function awsCall<T>(account: AwsAccount | null, action: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const mapped = mapAwsError(err, action);
    if (account && mapped.code === 'AWS_KEYS_INVALID') {
      await prisma.awsAccount.update({
        where: { id: account.id },
        data: { status: 'keys_rejected', lastError: err instanceof Error ? err.name : 'Unknown' },
      });
    }
    throw mapped;
  }
}
