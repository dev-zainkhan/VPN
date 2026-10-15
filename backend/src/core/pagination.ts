import { z } from 'zod';
import { AppError } from './errors';

export const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

export type Cursor = { t: Date; id: string };

export function encodeCursor({ t, id }: Cursor): string {
  return Buffer.from(JSON.stringify({ t: t.toISOString(), id })).toString('base64url');
}

export function decodeCursor(cursor: string): Cursor {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const parsed = z.object({ t: z.string().datetime(), id: z.string().uuid() }).parse(value);
    return { t: new Date(parsed.t), id: parsed.id };
  } catch {
    throw new AppError('VALIDATION_FAILED', 'Invalid cursor');
  }
}

// rows = fetched with take: limit + 1, newest first. Returns the page and the next cursor.
export function pageOf<T extends { id: string }>(rows: T[], limit: number, timeOf: (row: T) => Date) {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  const nextCursor = rows.length > limit && last ? encodeCursor({ t: timeOf(last), id: last.id }) : null;
  return { items, nextCursor };
}
