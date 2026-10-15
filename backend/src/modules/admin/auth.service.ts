import type { Admin } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { decrypt, encrypt, hashToken, randomToken } from '../../core/crypto';
import { prisma } from '../../core/db';
import { AppError } from '../../core/errors';

authenticator.options = { window: 1 };

export const SESSION_MS = 12 * 60 * 60 * 1000;
const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60 * 1000;
// Compared against when the email is unknown, so an unknown email takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('veil-dummy-password', 12);

async function countFailure(admin: Admin): Promise<void> {
  const failed = admin.failedLogins + 1;
  await prisma.admin.update({
    where: { id: admin.id },
    data:
      failed >= LOCK_AFTER
        ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MS) }
        : { failedLogins: failed },
  });
}

function totpMatches(admin: Admin, code: string): boolean {
  if (!admin.totpSecretEnc) return false;
  return authenticator.check(code, decrypt(admin.totpSecretEnc));
}

// 13.1
export async function login(email: string, password: string, totpCode?: string) {
  const admin = await prisma.admin.findUnique({ where: { email: email.toLowerCase() } });
  if (!admin) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw new AppError('LOGIN_FAILED');
  }
  if (admin.lockedUntil && admin.lockedUntil > new Date()) {
    throw new AppError('ACCOUNT_LOCKED', undefined, { lockedUntil: admin.lockedUntil.toISOString() });
  }
  if (!(await bcrypt.compare(password, admin.passwordHash))) {
    await countFailure(admin);
    throw new AppError('LOGIN_FAILED');
  }
  if (admin.totpEnabled) {
    if (!totpCode) throw new AppError('TOTP_REQUIRED');
    if (!totpMatches(admin, totpCode)) {
      await countFailure(admin);
      throw new AppError('TOTP_INVALID');
    }
  }

  const token = randomToken();
  await prisma.$transaction([
    prisma.admin.update({ where: { id: admin.id }, data: { failedLogins: 0 } }),
    prisma.adminSession.create({
      data: { adminId: admin.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + SESSION_MS) },
    }),
  ]);
  return { token, admin: { id: admin.id, email: admin.email, totpEnabled: admin.totpEnabled } };
}

export async function logout(sessionId: string): Promise<void> {
  await prisma.adminSession.deleteMany({ where: { id: sessionId } });
}

export function me(admin: Admin) {
  return {
    id: admin.id,
    email: admin.email,
    totpEnabled: admin.totpEnabled,
    passwordChangedAt: admin.passwordChangedAt.toISOString(),
  };
}

// 13.2
export async function totpSetup(admin: Admin) {
  if (admin.totpEnabled) throw new AppError('TOTP_ALREADY_ENABLED');
  const secret = authenticator.generateSecret();
  await prisma.admin.update({ where: { id: admin.id }, data: { totpSecretEnc: encrypt(secret) } });
  return { otpauthUrl: authenticator.keyuri(admin.email, 'Veil Admin', secret), secret };
}

export async function totpEnable(admin: Admin, code: string) {
  if (admin.totpEnabled) throw new AppError('TOTP_ALREADY_ENABLED');
  if (!totpMatches(admin, code)) throw new AppError('TOTP_CODE_WRONG');
  await prisma.admin.update({ where: { id: admin.id }, data: { totpEnabled: true } });
  return { ok: true };
}

export async function totpDisable(admin: Admin, password: string, code: string) {
  if (!(await bcrypt.compare(password, admin.passwordHash))) throw new AppError('LOGIN_FAILED');
  if (!totpMatches(admin, code)) throw new AppError('TOTP_CODE_WRONG');
  await prisma.admin.update({ where: { id: admin.id }, data: { totpEnabled: false, totpSecretEnc: null } });
  return { ok: true };
}

export async function changePassword(admin: Admin, sessionId: string, currentPassword: string, newPassword: string) {
  if (!(await bcrypt.compare(currentPassword, admin.passwordHash))) throw new AppError('LOGIN_FAILED');
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.$transaction([
    prisma.admin.update({ where: { id: admin.id }, data: { passwordHash, passwordChangedAt: new Date() } }),
    prisma.adminSession.deleteMany({ where: { adminId: admin.id, id: { not: sessionId } } }),
  ]);
  return { ok: true };
}
