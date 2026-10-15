import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().startsWith('postgresql://'),
  PUBLIC_BASE_URL: z
    .string()
    .url()
    .refine((v) => !v.endsWith('/'), 'must not end with a slash'),
  MASTER_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'must be base64 of exactly 32 bytes'),
  TOKEN_PEPPER: z.string().min(32),
  ABUSE_PEPPER: z.string().min(32),
  ADMOB_AD_UNIT_ID: z.string().regex(/^ca-app-pub-\d+\/\d+$/),
  ADMOB_KEYS_URL: z.string().url().default('https://www.gstatic.com/admob/reward/verifier-keys.json'),
  EDGE_FILES_DIR: z.string().default('../edge'),
  COOKIE_SECURE: bool.default('true'),
  JOBS_ENABLED: bool.default('true'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug']).default('info'),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_INITIAL_PASSWORD: z.string().min(12).optional(),
});

export type Config = z.infer<typeof schema>;

function load(): Config {
  // Blank values in .env count as unset, so the optional ones can stay empty.
  const env = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ''));
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    // Names only, never values: several of these are secrets.
    const names = [...new Set(parsed.error.issues.map((i) => i.path.join('.')))];
    for (const name of names) console.error(`invalid or missing environment variable: ${name}`);
    process.exit(1);
  }
  return parsed.data;
}

export const config = load();
