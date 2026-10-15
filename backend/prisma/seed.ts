import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Safe to run many times: creates what is missing and never overwrites (spec 6.4).
const prisma = new PrismaClient();

const REGIONS: [number, string, string, string][] = [
  [1, 'us-east-1', 'Virginia, United States', 'US'],
  [2, 'us-east-2', 'Ohio, United States', 'US'],
  [3, 'us-west-1', 'California, United States', 'US'],
  [4, 'us-west-2', 'Oregon, United States', 'US'],
  [5, 'ca-central-1', 'Montreal, Canada', 'CA'],
  [6, 'sa-east-1', 'São Paulo, Brazil', 'BR'],
  [7, 'eu-west-1', 'Dublin, Ireland', 'IE'],
  [8, 'eu-west-2', 'London, United Kingdom', 'GB'],
  [9, 'eu-west-3', 'Paris, France', 'FR'],
  [10, 'eu-central-1', 'Frankfurt, Germany', 'DE'],
  [11, 'eu-north-1', 'Stockholm, Sweden', 'SE'],
  [12, 'ap-south-1', 'Mumbai, India', 'IN'],
  [13, 'ap-southeast-1', 'Singapore', 'SG'],
  [14, 'ap-southeast-2', 'Sydney, Australia', 'AU'],
  [15, 'ap-northeast-1', 'Tokyo, Japan', 'JP'],
  [16, 'ap-northeast-2', 'Seoul, South Korea', 'KR'],
  [17, 'ap-northeast-3', 'Osaka, Japan', 'JP'],
];

async function main() {
  await prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  for (const [sortOrder, code, displayName, countryCode] of REGIONS) {
    await prisma.region.upsert({ where: { code }, update: {}, create: { code, displayName, countryCode, sortOrder } });
  }

  if ((await prisma.admin.count()) === 0) {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_INITIAL_PASSWORD;
    if (!email || !password) {
      console.log('skipping admin seed');
    } else {
      await prisma.admin.create({ data: { email, passwordHash: await bcrypt.hash(password, 12) } });
      console.log('admin created');
    }
  }
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
