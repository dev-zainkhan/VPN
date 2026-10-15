import { Router, type CookieOptions } from 'express';
import { z } from 'zod';
import { config } from '../../core/config';
import { ah, parse } from '../../core/http';
import { adminLoginLimiter } from '../../core/rateLimits';
import { ADMIN_COOKIE, ADMIN_COOKIE_PATH } from '../../middleware/adminAuth';
import { writeAudit } from './audit';
import * as auth from './auth.service';

const loginBody = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
  totpCode: z.string().regex(/^\d{6}$/).optional(),
});
const codeBody = z.object({ code: z.string().regex(/^\d{6}$/) });
const disableBody = z.object({ password: z.string().min(1).max(200), code: z.string().regex(/^\d{6}$/) });
const passwordBody = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(12).max(200) });

const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: config.COOKIE_SECURE,
  sameSite: 'strict',
  path: ADMIN_COOKIE_PATH,
});

// Before adminAuth: the only admin route that works without a session.
export const adminLoginRouter = Router();

adminLoginRouter.post(
  '/auth/login',
  adminLoginLimiter,
  ah(async (req, res) => {
    const body = parse(loginBody, req.body);
    const { token, admin } = await auth.login(body.email, body.password, body.totpCode);
    res.cookie(ADMIN_COOKIE, token, { ...cookieOptions(), maxAge: auth.SESSION_MS });
    await writeAudit(admin.id, 'auth.login', 'admin', admin.id);
    res.json({ admin });
  }),
);

// After adminAuth.
export const adminAuthRouter = Router();

adminAuthRouter.post(
  '/auth/logout',
  ah(async (req, res) => {
    await auth.logout(req.adminSessionId!);
    res.clearCookie(ADMIN_COOKIE, cookieOptions());
    await writeAudit(req.admin!.id, 'auth.logout', 'admin', req.admin!.id);
    res.json({ ok: true });
  }),
);

adminAuthRouter.get('/auth/me', (req, res) => {
  res.json(auth.me(req.admin!));
});

adminAuthRouter.post(
  '/auth/totp/setup',
  ah(async (req, res) => {
    const out = await auth.totpSetup(req.admin!);
    await writeAudit(req.admin!.id, 'auth.totp_setup', 'admin', req.admin!.id);
    res.json(out);
  }),
);

adminAuthRouter.post(
  '/auth/totp/enable',
  ah(async (req, res) => {
    const body = parse(codeBody, req.body);
    const out = await auth.totpEnable(req.admin!, body.code);
    await writeAudit(req.admin!.id, 'auth.totp_enable', 'admin', req.admin!.id, body);
    res.json(out);
  }),
);

adminAuthRouter.post(
  '/auth/totp/disable',
  ah(async (req, res) => {
    const body = parse(disableBody, req.body);
    const out = await auth.totpDisable(req.admin!, body.password, body.code);
    await writeAudit(req.admin!.id, 'auth.totp_disable', 'admin', req.admin!.id, body);
    res.json(out);
  }),
);

adminAuthRouter.post(
  '/auth/password',
  ah(async (req, res) => {
    const body = parse(passwordBody, req.body);
    const out = await auth.changePassword(req.admin!, req.adminSessionId!, body.currentPassword, body.newPassword);
    await writeAudit(req.admin!.id, 'auth.password', 'admin', req.admin!.id, body);
    res.json(out);
  }),
);
