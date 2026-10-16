// Temporary: create a real edge server through the admin API and wait until it is active.
import { prisma } from './src/core/db';

let cookie = '';
async function admin(method: string, path: string, body?: unknown) {
  const res = await fetch(`http://localhost:3000/api/admin${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'veil-admin', Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0]!;
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

(async () => {
  await admin('POST', '/auth/login', { email: 'admin@example.com', password: process.env.ADMIN_INITIAL_PASSWORD });
  const account = await prisma.awsAccount.findFirstOrThrow({ where: { nickname: 'Main' } });
  const t0 = Date.now();
  const c = await admin('POST', '/servers', { awsAccountId: account.id, regionCode: 'ap-south-1' });
  console.log('create:', c.status, c.json.id ?? JSON.stringify(c.json), c.json.instanceId ?? '');
  if (c.status !== 201) process.exit(1);
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 15000));
    const s = (await admin('GET', `/servers?accountId=${account.id}`)).json.items.find((x: any) => x.id === c.json.id);
    console.log(`${Math.round((Date.now() - t0) / 1000)}s status=${s.status} ip=${s.publicIp ?? '-'}`);
    if (s.status === 'active' || s.status === 'failed') break;
  }
  await prisma.$disconnect();
})();
