import type { AbuseKey, Admin, Device, Server } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      device?: Device & { abuseKey: AbuseKey };
      deviceBlocked?: boolean;
      admin?: Admin;
      adminSessionId?: string;
      server?: Server;
    }
  }
}

export {};
