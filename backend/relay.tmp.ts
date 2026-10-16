// Temporary: a throwaway SSH relay on EC2 so a real edge server can reach the API on this laptop.
// Usage: tsx relay.tmp.ts up <pubkey-file> <home-ip>  |  tsx relay.tmp.ts down <instance-id>
import { readFileSync } from 'node:fs';
import {
  AuthorizeSecurityGroupIngressCommand,
  CreateSecurityGroupCommand,
  DescribeImagesCommand,
  DescribeInstancesCommand,
  DescribeSecurityGroupsCommand,
  DescribeVpcsCommand,
  RunInstancesCommand,
  TerminateInstancesCommand,
} from '@aws-sdk/client-ec2';
import { prisma } from './src/core/db';
import { ec2For } from './src/modules/aws/awsClient';

const REGION = 'ap-south-1';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function up(pubKeyFile: string, homeIp: string) {
  const account = await prisma.awsAccount.findFirstOrThrow({ where: { nickname: 'Main' } });
  const ec2 = ec2For(account, REGION);
  const vpc = (await ec2.send(new DescribeVpcsCommand({ Filters: [{ Name: 'isDefault', Values: ['true'] }] }))).Vpcs![0]!;
  const found = await ec2.send(new DescribeSecurityGroupsCommand({ Filters: [{ Name: 'group-name', Values: ['veil-test-relay'] }, { Name: 'vpc-id', Values: [vpc.VpcId!] }] }));
  let groupId = found.SecurityGroups?.[0]?.GroupId;
  if (!groupId) {
    groupId = (await ec2.send(new CreateSecurityGroupCommand({
      GroupName: 'veil-test-relay', Description: 'Veil temporary test relay', VpcId: vpc.VpcId,
      TagSpecifications: [{ ResourceType: 'security-group', Tags: [{ Key: 'veil-managed', Value: 'true' }] }],
    }))).GroupId!;
  }
  // SSH only from the home IP; the API port only from inside the VPC (the edge server).
  for (const perm of [
    { IpProtocol: 'tcp', FromPort: 22, ToPort: 22, IpRanges: [{ CidrIp: `${homeIp}/32` }] },
    { IpProtocol: 'tcp', FromPort: 8080, ToPort: 8080, IpRanges: [{ CidrIp: vpc.CidrBlock! }] },
  ]) {
    try { await ec2.send(new AuthorizeSecurityGroupIngressCommand({ GroupId: groupId, IpPermissions: [perm] })); }
    catch (e) { if ((e as Error).name !== 'InvalidPermission.Duplicate') throw e; }
  }
  const images = await ec2.send(new DescribeImagesCommand({ Owners: ['099720109477'], Filters: [
    { Name: 'name', Values: ['ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*'] }, { Name: 'state', Values: ['available'] }] }));
  const image = images.Images!.sort((a, b) => b.CreationDate!.localeCompare(a.CreationDate!))[0]!;
  const pub = readFileSync(pubKeyFile, 'utf8').trim();
  const userData = `#!/bin/bash
mkdir -p /home/ubuntu/.ssh
echo '${pub}' >> /home/ubuntu/.ssh/authorized_keys
chown -R ubuntu:ubuntu /home/ubuntu/.ssh && chmod 700 /home/ubuntu/.ssh && chmod 600 /home/ubuntu/.ssh/authorized_keys
echo 'GatewayPorts clientspecified' > /etc/ssh/sshd_config.d/90-veil-relay.conf
echo 'ClientAliveInterval 30' >> /etc/ssh/sshd_config.d/90-veil-relay.conf
systemctl restart ssh
shutdown -h +180
`;
  const run = await ec2.send(new RunInstancesCommand({
    ImageId: image.ImageId, InstanceType: 't3.micro', MinCount: 1, MaxCount: 1, SecurityGroupIds: [groupId],
    UserData: Buffer.from(userData).toString('base64'),
    MetadataOptions: { HttpTokens: 'required', HttpEndpoint: 'enabled' },
    InstanceInitiatedShutdownBehavior: 'terminate',
    TagSpecifications: [{ ResourceType: 'instance', Tags: [{ Key: 'Name', Value: 'veil-test-relay' }, { Key: 'veil-managed', Value: 'true' }] }],
  }));
  const id = run.Instances![0]!.InstanceId!;
  for (let i = 0; i < 30; i++) {
    await sleep(5000);
    const inst = (await ec2.send(new DescribeInstancesCommand({ InstanceIds: [id] }))).Reservations?.[0]?.Instances?.[0];
    if (inst?.State?.Name === 'running' && inst.PublicIpAddress) {
      console.log(JSON.stringify({ instanceId: id, publicIp: inst.PublicIpAddress, privateIp: inst.PrivateIpAddress, vpcCidr: vpc.CidrBlock }));
      return;
    }
  }
  throw new Error(`relay ${id} did not start`);
}

async function down(instanceId: string) {
  const account = await prisma.awsAccount.findFirstOrThrow({ where: { nickname: 'Main' } });
  await ec2For(account, REGION).send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));
  console.log(`terminating ${instanceId}`);
}

const [cmd, a, b] = process.argv.slice(2);
(cmd === 'up' ? up(a!, b!) : down(a!))
  .catch((e) => { console.error(e.name, e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
