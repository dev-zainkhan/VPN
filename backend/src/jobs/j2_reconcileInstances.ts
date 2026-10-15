import { DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import type { AwsAccount, Server } from '@prisma/client';
import { prisma } from '../core/db';
import { logger } from '../core/logger';
import { awsCall, ec2For } from '../modules/aws/awsClient';
import { sendTerminate } from '../modules/aws/provisioning.service';
import { endServerSessions } from '../modules/connections/connections.service';
import type { Job } from './scheduler';

const BATCH = 200;

async function instanceStates(account: AwsAccount, regionCode: string, ids: string[]) {
  const found = new Map<string, { state: string; publicIp?: string }>();
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    let NextToken: string | undefined;
    do {
      const out = await awsCall(account, 'ec2:DescribeInstances', () =>
        ec2For(account, regionCode).send(
          new DescribeInstancesCommand({ Filters: [{ Name: 'instance-id', Values: chunk }], NextToken }),
        ),
      );
      for (const r of out.Reservations ?? []) {
        for (const inst of r.Instances ?? []) {
          if (inst.InstanceId) {
            found.set(inst.InstanceId, { state: inst.State?.Name ?? 'unknown', publicIp: inst.PublicIpAddress });
          }
        }
      }
      NextToken = out.NextToken;
    } while (NextToken);
  }
  return found;
}

// Returns true when the server row changed.
async function reconcile(account: AwsAccount, server: Server, inst: { state: string; publicIp?: string } | undefined) {
  const gone = !inst || inst.state === 'terminated' || inst.state === 'shutting-down';
  if (server.status === 'terminating') {
    if (gone) {
      await prisma.server.update({ where: { id: server.id }, data: { status: 'terminated', terminatedAt: new Date() } });
      return true;
    }
    // The terminate call from the admin action failed or was lost: send it again.
    await sendTerminate(account, server.regionCode, server.instanceId!);
    return false;
  }
  const stopped = inst?.state === 'stopped' || inst?.state === 'stopping';
  if (gone || stopped) {
    await prisma.$transaction(async (tx) => {
      await endServerSessions(server.id, tx);
      await tx.server.update({
        where: { id: server.id },
        data: {
          status: 'failed',
          failReason: 'instance_lost',
          failDetail: stopped ? 'Instance is stopped' : 'Instance no longer exists',
        },
      });
    });
    return true;
  }
  if (inst.state === 'running' && inst.publicIp && inst.publicIp !== server.publicIp) {
    await prisma.server.update({ where: { id: server.id }, data: { publicIp: inst.publicIp } });
    return true;
  }
  return false;
}

// J2: keep server rows in step with what AWS reports.
export const j2ReconcileInstances: Job = {
  id: 'J2',
  everyMs: 5 * 60 * 1000,
  async run() {
    let checked = 0;
    let changed = 0;
    const accounts = await prisma.awsAccount.findMany({ where: { status: { in: ['working', 'disabled'] } } });
    for (const account of accounts) {
      const servers = await prisma.server.findMany({
        where: { awsAccountId: account.id, status: { not: 'terminated' }, instanceId: { not: null } },
      });
      const byRegion = new Map<string, Server[]>();
      for (const s of servers) byRegion.set(s.regionCode, [...(byRegion.get(s.regionCode) ?? []), s]);
      for (const [regionCode, list] of byRegion) {
        try {
          const states = await instanceStates(account, regionCode, list.map((s) => s.instanceId!));
          for (const server of list) {
            checked++;
            if (await reconcile(account, server, states.get(server.instanceId!))) changed++;
          }
        } catch (e) {
          // Rejected keys were already recorded on the account by awsCall; other regions still run.
          logger.warn({ accountId: account.id, regionCode, message: e instanceof Error ? e.message : String(e) }, 'J2 region failed');
        }
      }
    }
    return { checked, changed };
  },
};
