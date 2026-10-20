import { z } from 'zod';

export const registerBody = z.object({
  abuseKey: z.string().regex(/^[0-9a-f]{64}$/),
  platform: z.enum(['android', 'windows']),
  appVersion: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[0-9A-Za-z.\-]+$/),
});

export type RegisterBody = z.infer<typeof registerBody>;
