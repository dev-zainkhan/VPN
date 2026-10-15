import type { Prisma, Settings } from '@prisma/client';
import { prisma } from '../../core/db';

type Db = Prisma.TransactionClient | typeof prisma;

// The single Settings row (id 1). Created with the schema defaults if the seed has not run.
export function getSettings(db: Db = prisma): Promise<Settings> {
  return db.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

// Today's UTC date as YYYY-MM-DD, the day key used for daily ad counts.
export function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export type SettingsInput = Omit<Settings, 'id' | 'updatedAt'>;

// 13.8: the row without its id.
export function settingsView(s: Settings) {
  const { id: _id, ...rest } = s;
  return { ...rest, updatedAt: s.updatedAt.toISOString() };
}

export async function saveSettings(input: SettingsInput) {
  return settingsView(
    await prisma.settings.upsert({ where: { id: 1 }, update: input, create: { id: 1, ...input } }),
  );
}
