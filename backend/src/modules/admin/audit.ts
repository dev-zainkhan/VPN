import type { Prisma } from '@prisma/client';
import { prisma } from '../../core/db';
import { logger } from '../../core/logger';

// Fields never written to the audit log (spec 13.11).
const HIDDEN = new Set(['password', 'currentPassword', 'newPassword', 'code', 'totpCode', 'accessKeyId', 'secretAccessKey']);

export function auditDetail(body: unknown): Prisma.InputJsonValue | undefined {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined;
  const kept = Object.fromEntries(Object.entries(body).filter(([k]) => !HIDDEN.has(k)));
  return Object.keys(kept).length ? (kept as Prisma.InputJsonValue) : undefined;
}

export async function writeAudit(
  adminId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  body?: unknown,
): Promise<void> {
  try {
    await prisma.adminAudit.create({ data: { adminId, action, targetType, targetId, detail: auditDetail(body) } });
  } catch (e) {
    // An audit failure must not undo the change that already happened.
    logger.error({ message: e instanceof Error ? e.message : String(e), action }, 'audit write failed');
  }
}
