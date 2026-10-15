import { DescribeInstanceTypesCommand, DescribeRegionsCommand } from '@aws-sdk/client-ec2';
import { GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { Prisma, type AwsAccount, type FreeTierPlan } from '@prisma/client';
import { encrypt } from '../../core/crypto';
import { prisma } from '../../core/db';
import { AppError } from '../../core/errors';
import { awsCall, ec2With, keysOf, stsFor, type AwsKeys } from './awsClient';

const HOUR_MS = 60 * 60 * 1000;

// 12.3 step 2: region codes enabled for these keys that also exist in the Region table.
export async function enabledRegions(keys: AwsKeys, account: AwsAccount | null): Promise<string[]> {
  const out = await awsCall(account, 'ec2:DescribeRegions', () =>
    ec2With(keys, 'us-east-1').send(new DescribeRegionsCommand({ AllRegions: false })),
  );
  const enabled = new Set((out.Regions ?? []).map((r) => r.RegionName).filter((n): n is string => !!n));
  const known = await prisma.region.findMany({ orderBy: { sortOrder: 'asc' }, select: { code: true } });
  return known.map((r) => r.code).filter((code) => enabled.has(code));
}

// Free-tier x86_64 instance types in one region (12.3 step 3, 12.6 step 3).
export async function freeTierTypes(keys: AwsKeys, region: string, account: AwsAccount | null): Promise<string[]> {
  const ec2 = ec2With(keys, region);
  const names: string[] = [];
  let NextToken: string | undefined;
  do {
    const out = await awsCall(account, 'ec2:DescribeInstanceTypes', () =>
      ec2.send(
        new DescribeInstanceTypesCommand({
          Filters: [
            { Name: 'free-tier-eligible', Values: ['true'] },
            { Name: 'processor-info.supported-architecture', Values: ['x86_64'] },
          ],
          NextToken,
        }),
      ),
    );
    for (const t of out.InstanceTypes ?? []) if (t.InstanceType) names.push(t.InstanceType);
    NextToken = out.NextToken;
  } while (NextToken);
  return names.sort();
}

// 12.3
export async function testKeys(keys: AwsKeys, account: AwsAccount | null = null) {
  const id = await awsCall(account, 'sts:GetCallerIdentity', () => stsFor(keys).send(new GetCallerIdentityCommand({})));
  if (!id.Account) throw new AppError('AWS_ERROR', 'AWS did not return an account number');
  if (id.Arn?.endsWith(':root')) throw new AppError('AWS_ROOT_KEYS');
  const regions = await enabledRegions(keys, account);
  const types = await freeTierTypes(keys, 'us-east-1', account);
  return { ok: true as const, awsAccountNumber: id.Account, regions, freeTierTypes: types };
}

// 13.10
const LIMITS: Record<FreeTierPlan, { hours: number | null; gb: number | null }> = {
  legacy_12_month: { hours: 750, gb: 100 },
  free_plan_credits: { hours: null, gb: 100 },
  paid: { hours: null, gb: null },
};

export function utcMonth(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeHours(servers: { launchedAt: Date; terminatedAt: Date | null }[], now = new Date()): number {
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  let ms = 0;
  for (const s of servers) {
    const from = Math.max(s.launchedAt.getTime(), monthStart);
    const to = Math.min((s.terminatedAt ?? now).getTime(), now.getTime());
    if (to > from) ms += to - from;
  }
  return round1(ms / HOUR_MS);
}

export async function accountUsage(account: AwsAccount, now = new Date()) {
  const month = utcMonth(now);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [servers, usage] = await Promise.all([
    prisma.server.findMany({
      where: { awsAccountId: account.id, OR: [{ terminatedAt: null }, { terminatedAt: { gt: monthStart } }] },
      select: { launchedAt: true, terminatedAt: true },
    }),
    prisma.accountUsage.findUnique({ where: { awsAccountId_month: { awsAccountId: account.id, month } } }),
  ]);
  const limits = LIMITS[account.freeTierPlan];
  return {
    month,
    computeHours: computeHours(servers, now),
    computeLimitHours: limits.hours,
    dataOutGb: round1(Number(usage?.txBytes ?? 0n) / 1e9),
    dataOutLimitGb: limits.gb,
  };
}

// 13.3 Account object. Never the key ID or secret.
export async function toAccount(account: AwsAccount) {
  const [serverCount, usage] = await Promise.all([
    prisma.server.count({ where: { awsAccountId: account.id, status: { not: 'terminated' } } }),
    accountUsage(account),
  ]);
  return {
    id: account.id,
    nickname: account.nickname,
    awsAccountNumber: account.awsAccountNumber,
    accessKeyHint: `AKIA…${account.accessKeyLast4}`,
    status: account.status,
    freeTierPlan: account.freeTierPlan,
    lastCheckedAt: account.lastCheckedAt?.toISOString() ?? null,
    lastError: account.lastError,
    createdAt: account.createdAt.toISOString(),
    serverCount,
    usage,
  };
}

async function findAccount(id: string): Promise<AwsAccount> {
  const account = await prisma.awsAccount.findUnique({ where: { id } });
  if (!account) throw new AppError('NOT_FOUND');
  return account;
}

function keyColumns(keys: AwsKeys) {
  return {
    accessKeyIdEnc: encrypt(keys.accessKeyId),
    secretAccessKeyEnc: encrypt(keys.secretAccessKey),
    accessKeyLast4: keys.accessKeyId.slice(-4),
  };
}

// Unique nickname or account number taken by a concurrent or earlier write.
function uniqueError(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    const target = String(e.meta?.target ?? '');
    if (target.includes('nickname')) throw new AppError('VALIDATION_FAILED', 'Nickname already used', { field: 'nickname' });
    throw new AppError('AWS_ACCOUNT_EXISTS');
  }
  throw e;
}

export async function listAccounts() {
  const accounts = await prisma.awsAccount.findMany({ orderBy: { createdAt: 'asc' } });
  return { items: await Promise.all(accounts.map(toAccount)) };
}

// 12.4 Add
export async function createAccount(input: AwsKeys & { nickname: string; freeTierPlan?: FreeTierPlan }) {
  const keys = { accessKeyId: input.accessKeyId, secretAccessKey: input.secretAccessKey };
  const tested = await testKeys(keys);
  if (await prisma.awsAccount.findUnique({ where: { awsAccountNumber: tested.awsAccountNumber } })) {
    throw new AppError('AWS_ACCOUNT_EXISTS');
  }
  const account = await prisma.awsAccount
    .create({
      data: {
        nickname: input.nickname,
        awsAccountNumber: tested.awsAccountNumber,
        ...keyColumns(keys),
        status: 'working',
        freeTierPlan: input.freeTierPlan,
        lastCheckedAt: new Date(),
      },
    })
    .catch(uniqueError);
  return toAccount(account);
}

// 12.4 Update keys
export async function updateKeys(id: string, keys: AwsKeys) {
  const account = await findAccount(id);
  const tested = await testKeys(keys);
  if (tested.awsAccountNumber !== account.awsAccountNumber) throw new AppError('AWS_ACCOUNT_MISMATCH');
  const updated = await prisma.awsAccount.update({
    where: { id },
    data: { ...keyColumns(keys), status: 'working', lastError: null, lastCheckedAt: new Date() },
  });
  return toAccount(updated);
}

// POST :id/test
export async function testStoredKeys(id: string) {
  const account = await findAccount(id);
  const result = await testKeys(keysOf(account), account);
  await prisma.awsAccount.update({
    where: { id },
    data: {
      ...(account.status === 'disabled' ? {} : { status: 'working' as const }),
      lastError: null,
      lastCheckedAt: new Date(),
    },
  });
  return result;
}

export async function patchAccount(
  id: string,
  input: { nickname?: string; status?: 'working' | 'disabled'; freeTierPlan?: FreeTierPlan },
) {
  const account = await findAccount(id);
  if (input.status === 'working' && account.status === 'keys_rejected') {
    throw new AppError('AWS_KEYS_INVALID', 'AWS rejected the stored keys; update the keys instead');
  }
  const updated = await prisma.awsAccount
    .update({
      where: { id },
      data: {
        nickname: input.nickname,
        freeTierPlan: input.freeTierPlan,
        // Enabling a keys_rejected account is refused above, so this never hides rejected keys.
        status: input.status,
      },
    })
    .catch(uniqueError);
  return toAccount(updated);
}

// 12.4 Remove
export async function deleteAccount(id: string) {
  await prisma.$transaction(async (tx) => {
    const account = await tx.awsAccount.findUnique({ where: { id } });
    if (!account) throw new AppError('NOT_FOUND');
    const live = await tx.server.count({ where: { awsAccountId: id, status: { not: 'terminated' } } });
    if (live > 0) throw new AppError('ACCOUNT_HAS_SERVERS');
    await tx.server.deleteMany({ where: { awsAccountId: id, status: 'terminated' } });
    await tx.awsAccount.delete({ where: { id } });
  });
  return { ok: true };
}

export async function accountRegions(id: string) {
  const account = await findAccount(id);
  const codes = await enabledRegions(keysOf(account), account);
  const regions = await prisma.region.findMany({
    where: { code: { in: codes } },
    orderBy: { sortOrder: 'asc' },
    select: { code: true, displayName: true },
  });
  return { items: regions };
}

export async function accountInstanceTypes(id: string, regionCode: string) {
  const account = await findAccount(id);
  if (!(await prisma.region.findUnique({ where: { code: regionCode } }))) throw new AppError('NOT_FOUND');
  const keys = keysOf(account);
  // A call in a region the account has not opted into fails like bad keys, so check first.
  if (!(await enabledRegions(keys, account)).includes(regionCode)) throw new AppError('AWS_REGION_NOT_ENABLED');
  return { items: await freeTierTypes(keys, regionCode, account) };
}
