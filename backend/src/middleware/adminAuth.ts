import { hashToken } from '../core/crypto';
import { prisma } from '../core/db';
import { AppError } from '../core/errors';
import { ah } from '../core/http';

export const ADMIN_COOKIE = 'veil_admin';
export const ADMIN_COOKIE_PATH = '/api/admin';

export const adminAuth = ah(async (req, res, next) => {
  const cookie: unknown = req.cookies?.[ADMIN_COOKIE];
  if (typeof cookie !== 'string' || cookie === '') throw new AppError('AUTH_REQUIRED');

  const session = await prisma.adminSession.findFirst({
    where: { tokenHash: hashToken(cookie), expiresAt: { gt: new Date() } },
    include: { admin: true },
  });
  if (!session) {
    res.clearCookie(ADMIN_COOKIE, { path: ADMIN_COOKIE_PATH });
    throw new AppError('AUTH_REQUIRED');
  }

  // With the SameSite=Strict cookie, this header blocks cross-site writes.
  if (req.method !== 'GET' && req.get('X-Requested-With') !== 'veil-admin') throw new AppError('CSRF_FAILED');

  req.admin = session.admin;
  req.adminSessionId = session.id;
  next();
});
