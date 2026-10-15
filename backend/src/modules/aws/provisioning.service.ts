import {
  AuthorizeSecurityGroupIngressCommand,
  CreateDefaultVpcCommand,
  CreateSecurityGroupCommand,
  DescribeImagesCommand,
  DescribeSecurityGroupsCommand,
  DescribeVpcsCommand,
  RebootInstancesCommand,
  RunInstancesCommand,
  TerminateInstancesCommand,
  type EC2Client,
} from '@aws-sdk/client-ec2';
import type { AwsAccount, Prisma, Region, Server, ServerStatus } from '@prisma/client';
import { hashToken, randomToken } from '../../core/crypto';
import { prisma } from '../../core/db';
import { AppError } from '../../core/errors';
import { decodeCursor, pageOf } from '../../core/pagination';
import { endServerSessions } from '../connections/connections.service';
import { freeTierTypes } from './awsAccounts.service';
import { awsCall, ec2For, keysOf } from './awsClient';
import { renderUserData } from './bootstrap';

const CANONICAL_OWNER = '099720109477';
const UBUNTU_NAME = 'ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*';
const IMAGE_CACHE_MS = 24 * 60 * 60 * 1000;
const imageCache = new Map<string, { imageId: string; at: number }>();

const awsName = (e: unknown) => (e instanceof Error ? e.name : 'Unknown');
const awsMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

// 12.5: the account's default VPC and veil-edge security group in a region, created when missing.
export async function ensureRegionSetup(account: AwsAccount, regionCode: string) {
  const ec2 = ec2For(account, regionCode);
  const existing = await prisma.accountRegion.findUnique({
    where: { awsAccountId_regionCode: { awsAccountId: account.id, regionCode } },
  });
  if (existing) {
    try {
      await ec2.send(new DescribeSecurityGroupsCommand({ GroupIds: [existing.securityGroupId] }));
      return existing;
    } catch (e) {
      if (awsName(e) !== 'InvalidGroup.NotFound') {
        return awsCall(account, 'ec2:DescribeSecurityGroups', () => Promise.reject(e));
      }
      await prisma.accountRegion.delete({
        where: { awsAccountId_regionCode: { awsAccountId: account.id, regionCode } },
      });
    }
  }

  const vpcs = await awsCall(account, 'ec2:DescribeVpcs', () =>
    ec2.send(new DescribeVpcsCommand({ Filters: [{ Name: 'isDefault', Values: ['true'] }] })),
  );
  let vpcId = vpcs.Vpcs?.[0]?.VpcId;
  if (!vpcId) {
    const created = await awsCall(account, 'ec2:CreateDefaultVpc', () => ec2.send(new CreateDefaultVpcCommand({})));
    vpcId = created.Vpc?.VpcId;
    if (!vpcId) throw new AppError('AWS_ERROR', 'AWS did not return a default VPC');
  }

  const groups = await awsCall(account, 'ec2:DescribeSecurityGroups', () =>
    ec2.send(
      new DescribeSecurityGroupsCommand({
        Filters: [
          { Name: 'group-name', Values: ['veil-edge'] },
          { Name: 'vpc-id', Values: [vpcId] },
        ],
      }),
    ),
  );
  let securityGroupId = groups.SecurityGroups?.[0]?.GroupId;
  if (!securityGroupId) {
    const created = await awsCall(account, 'ec2:CreateSecurityGroup', () =>
      ec2.send(
        new CreateSecurityGroupCommand({
          GroupName: 'veil-edge',
          Description: 'Veil VPN edge server',
          VpcId: vpcId,
          TagSpecifications: [{ ResourceType: 'security-group', Tags: [{ Key: 'veil-managed', Value: 'true' }] }],
        }),
      ),
    );
    securityGroupId = created.GroupId;
    if (!securityGroupId) throw new AppError('AWS_ERROR', 'AWS did not return a security group');
    await openPorts(account, ec2, securityGroupId);
  }

  return prisma.accountRegion.upsert({
    where: { awsAccountId_regionCode: { awsAccountId: account.id, regionCode } },
    create: { awsAccountId: account.id, regionCode, vpcId, securityGroupId },
    update: { vpcId, securityGroupId },
  });
}

// UDP 51820 (WireGuard) and TCP 443 (TLS fallback) from anywhere. No SSH.
async function openPorts(account: AwsAccount, ec2: EC2Client, groupId: string) {
  try {
    await ec2.send(
      new AuthorizeSecurityGroupIngressCommand({
        GroupId: groupId,
        IpPermissions: [
          { IpProtocol: 'udp', FromPort: 51820, ToPort: 51820, IpRanges: [{ CidrIp: '0.0.0.0/0' }] },
          { IpProtocol: 'tcp', FromPort: 443, ToPort: 443, IpRanges: [{ CidrIp: '0.0.0.0/0' }] },
        ],
      }),
    );
  } catch (e) {
    if (awsName(e) !== 'InvalidPermission.Duplicate') {
      await awsCall(account, 'ec2:AuthorizeSecurityGroupIngress', () => Promise.reject(e));
    }
  }
}

// 12.6 step 2: newest Canonical Ubuntu 24.04 image, cached per account and region for a day.
async function ubuntuImage(account: AwsAccount, regionCode: string): Promise<string> {
  const key = `${account.id}:${regionCode}`;
  const hit = imageCache.get(key);
  if (hit && Date.now() - hit.at < IMAGE_CACHE_MS) return hit.imageId;
  const out = await awsCall(account, 'ec2:DescribeImages', () =>
    ec2For(account, regionCode).send(
      new DescribeImagesCommand({
        Owners: [CANONICAL_OWNER],
        Filters: [
          { Name: 'name', Values: [UBUNTU_NAME] },
          { Name: 'state', Values: ['available'] },
          { Name: 'architecture', Values: ['x86_64'] },
        ],
      }),
    ),
  );
  const newest = (out.Images ?? [])
    .filter((i) => i.ImageId && i.CreationDate)
    .sort((a, b) => b.CreationDate!.localeCompare(a.CreationDate!))[0];
  if (!newest?.ImageId) throw new AppError('AWS_ERROR', 'No Ubuntu 24.04 image found');
  imageCache.set(key, { imageId: newest.ImageId, at: Date.now() });
  return newest.ImageId;
}

// 12.6 step 3
export function chooseInstanceType(available: string[], requested?: string): string {
  if (requested) {
    if (!available.includes(requested)) throw new AppError('INSTANCE_TYPE_NOT_FREE');
    return requested;
  }
  if (available.includes('t3.micro')) return 't3.micro';
  if (available.includes('t2.micro')) return 't2.micro';
  const first = available[0];
  if (!first) throw new AppError('NO_FREE_TIER_TYPE');
  return first;
}

// 12.6
export async function createServer(accountId: string, regionCode: string, instanceType?: string) {
  const account = await prisma.awsAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new AppError('NOT_FOUND');
  if (account.status !== 'working') throw new AppError('AWS_ACCOUNT_UNAVAILABLE');
  if (!(await prisma.region.findUnique({ where: { code: regionCode } }))) throw new AppError('NOT_FOUND');

  const imageId = await ubuntuImage(account, regionCode);
  const type = chooseInstanceType(await freeTierTypes(keysOf(account), regionCode, account), instanceType);
  const accountRegion = await ensureRegionSetup(account, regionCode);

  const bootstrapToken = randomToken();
  const server = await prisma.server.create({
    data: {
      awsAccountId: account.id,
      regionCode,
      instanceType: type,
      status: 'provisioning',
      bootstrapTokenHash: hashToken(bootstrapToken),
      launchedAt: new Date(),
    },
  });
  const tags = [
    { Key: 'Name', Value: `veil-${regionCode}-${server.id.slice(0, 8)}` },
    { Key: 'veil-managed', Value: 'true' },
    { Key: 'veil-server-id', Value: server.id },
  ];

  try {
    const out = await ec2For(account, regionCode).send(
      new RunInstancesCommand({
        ImageId: imageId,
        InstanceType: type as never,
        MinCount: 1,
        MaxCount: 1,
        SecurityGroupIds: [accountRegion.securityGroupId],
        UserData: renderUserData(server.id, bootstrapToken),
        MetadataOptions: { HttpTokens: 'required', HttpEndpoint: 'enabled', HttpPutResponseHopLimit: 1 },
        BlockDeviceMappings: [
          {
            DeviceName: '/dev/sda1',
            Ebs: { VolumeSize: 8, VolumeType: 'gp3', DeleteOnTermination: true, Encrypted: true },
          },
        ],
        InstanceInitiatedShutdownBehavior: 'terminate',
        ClientToken: server.id,
        TagSpecifications: [
          { ResourceType: 'instance', Tags: tags },
          { ResourceType: 'volume', Tags: tags },
        ],
      }),
    );
    const instanceId = out.Instances?.[0]?.InstanceId;
    if (!instanceId) throw Object.assign(new Error('AWS returned no instance'), { name: 'NoInstance' });
    return prisma.server.update({ where: { id: server.id }, data: { instanceId } });
  } catch (e) {
    await prisma.server.update({
      where: { id: server.id },
      data: {
        status: 'failed',
        failReason: 'launch_error',
        failDetail: `${awsName(e)}: ${awsMessage(e)}`.slice(0, 500),
        bootstrapTokenHash: null,
      },
    });
    return awsCall(account, 'ec2:RunInstances', () => Promise.reject(e));
  }
}

async function findServer(id: string) {
  const server = await prisma.server.findUnique({ where: { id }, include: { awsAccount: true } });
  if (!server) throw new AppError('NOT_FOUND');
  return server;
}

function requireStatus(server: Server, allowed: ServerStatus[]) {
  if (!allowed.includes(server.status)) throw new AppError('SERVER_STATE');
}

// 12.7
export async function drainServer(id: string) {
  const server = await findServer(id);
  requireStatus(server, ['active']);
  return prisma.server.update({ where: { id }, data: { status: 'draining' } });
}

export async function undrainServer(id: string) {
  const server = await findServer(id);
  requireStatus(server, ['draining']);
  return prisma.server.update({ where: { id }, data: { status: 'active' } });
}

export async function setServerVisible(id: string, visible: boolean) {
  await findServer(id);
  return prisma.server.update({ where: { id }, data: { visible } });
}

export async function rebootServer(id: string) {
  const server = await findServer(id);
  requireStatus(server, ['active', 'draining', 'failed']);
  const instanceId = server.instanceId;
  if (!instanceId) throw new AppError('SERVER_STATE');
  await awsCall(server.awsAccount, 'ec2:RebootInstances', () =>
    ec2For(server.awsAccount, server.regionCode).send(new RebootInstancesCommand({ InstanceIds: [instanceId] })),
  );
  return server;
}

// Sends TerminateInstances; an instance that is already gone counts as success.
export async function sendTerminate(account: AwsAccount, regionCode: string, instanceId: string) {
  try {
    await ec2For(account, regionCode).send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));
  } catch (e) {
    if (awsName(e) === 'InvalidInstanceID.NotFound') return;
    await awsCall(account, 'ec2:TerminateInstances', () => Promise.reject(e));
  }
}

export async function terminateServer(id: string) {
  const server = await findServer(id);
  if (server.status === 'terminating' || server.status === 'terminated') throw new AppError('SERVER_STATE');
  const updated = await prisma.$transaction(async (tx) => {
    await endServerSessions(id, tx);
    return tx.server.update({
      where: { id },
      data: server.instanceId
        ? { status: 'terminating', bootstrapTokenHash: null }
        : { status: 'terminated', terminatedAt: new Date(), bootstrapTokenHash: null },
    });
  });
  // If this call fails, job J2 sends it again for servers left in terminating.
  if (server.instanceId) await sendTerminate(server.awsAccount, server.regionCode, server.instanceId);
  return updated;
}

// 13.4 server item
type ServerRow = Server & {
  region: Region;
  awsAccount: AwsAccount;
  _count: { sessions: number };
};
export const serverInclude = {
  region: true,
  awsAccount: true,
  _count: { select: { sessions: true } },
} satisfies Prisma.ServerInclude;

export function serverItem(s: ServerRow, now = new Date()) {
  const up = (s.status === 'active' || s.status === 'draining') && s.activeAt;
  return {
    id: s.id,
    regionCode: s.regionCode,
    regionName: s.region.displayName,
    accountId: s.awsAccountId,
    accountNickname: s.awsAccount.nickname,
    instanceId: s.instanceId,
    instanceType: s.instanceType,
    publicIp: s.publicIp,
    status: s.status,
    failReason: s.failReason,
    failDetail: s.failDetail,
    visible: s.visible,
    sessionCount: s._count.sessions,
    cpuPct: s.cpuPct,
    memPct: s.memPct,
    lastReportAt: s.lastReportAt?.toISOString() ?? null,
    launchedAt: s.launchedAt.toISOString(),
    activeAt: s.activeAt?.toISOString() ?? null,
    uptimeSeconds: up ? Math.floor((now.getTime() - s.activeAt!.getTime()) / 1000) : null,
    agentVersion: s.agentVersion,
  };
}

export async function getServerItem(id: string) {
  const s = await prisma.server.findUnique({ where: { id }, include: serverInclude });
  if (!s) throw new AppError('NOT_FOUND');
  return serverItem(s);
}

export async function listServers(q: {
  status?: ServerStatus;
  accountId?: string;
  regionCode?: string;
  limit: number;
  cursor?: string;
}) {
  const scope: Prisma.ServerWhereInput = {
    ...(q.accountId ? { awsAccountId: q.accountId } : {}),
    ...(q.regionCode ? { regionCode: q.regionCode } : {}),
  };
  const where: Prisma.ServerWhereInput = {
    ...scope,
    status: q.status ?? { not: 'terminated' },
  };
  const total = prisma.server.count({ where: { ...where } });
  if (q.cursor) {
    const c = decodeCursor(q.cursor);
    where.OR = [{ launchedAt: { lt: c.t } }, { launchedAt: c.t, id: { lt: c.id } }];
  }
  const [rows, grouped, totalCount] = await Promise.all([
    prisma.server.findMany({
      where,
      include: serverInclude,
      orderBy: [{ launchedAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
    }),
    prisma.server.groupBy({ by: ['status'], where: scope, _count: { _all: true } }),
    total,
  ]);
  const n = (st: ServerStatus) => grouped.find((g) => g.status === st)?._count._all ?? 0;
  const counts = {
    all: grouped.filter((g) => g.status !== 'terminated').reduce((sum, g) => sum + g._count._all, 0),
    provisioning: n('provisioning'),
    active: n('active'),
    draining: n('draining'),
    failed: n('failed'),
  };
  const page = pageOf(rows, q.limit, (r) => r.launchedAt);
  const now = new Date();
  return { items: page.items.map((r) => serverItem(r, now)), nextCursor: page.nextCursor, total: totalCount, counts };
}
