import { verify } from 'node:crypto';
import { z } from 'zod';
import { config } from '../../core/config';
import { logger } from '../../core/logger';

const KEYS_TTL_MS = 60 * 60 * 1000;
const MISS_REFETCH_MS = 60 * 1000;

let cache: { keys: Map<string, string>; at: number } | null = null;
let lastFetchAt = 0;
let testKeys: Map<string, string> | null = null;

export function setKeysForTest(map: Map<string, string> | null): void {
  testKeys = map;
}

const keysJson = z.object({ keys: z.array(z.object({ keyId: z.union([z.number(), z.string()]), pem: z.string() })) });

async function fetchKeys(): Promise<void> {
  lastFetchAt = Date.now();
  try {
    const res = await fetch(config.ADMOB_KEYS_URL, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = keysJson.parse(await res.json());
    cache = { keys: new Map(body.keys.map((k) => [String(k.keyId), k.pem])), at: Date.now() };
  } catch (e) {
    // Keep the older map if there is one (10.5).
    logger.warn({ message: e instanceof Error ? e.message : String(e) }, 'AdMob key fetch failed');
  }
}

// 10.5: one-hour cache; an unknown key_id refetches at most once a minute.
export async function getKeys(keyId: string | null): Promise<Map<string, string>> {
  if (testKeys) return testKeys;
  if (!cache || Date.now() - cache.at > KEYS_TTL_MS) await fetchKeys();
  else if (keyId && !cache.keys.has(keyId) && Date.now() - lastFetchAt > MISS_REFETCH_MS) await fetchKeys();
  return cache?.keys ?? new Map();
}

// key_id from the raw URL, so the caller can pick the key set before verifying.
export function keyIdOf(originalUrl: string): string | null {
  const q = originalUrl.indexOf('?');
  const i = q === -1 ? -1 : originalUrl.indexOf('&signature=', q);
  return i === -1 ? null : new URLSearchParams(originalUrl.slice(i + 1)).get('key_id');
}

// 10.4 steps 1 to 6. The signed bytes are the raw query before "&signature=", never re-encoded.
export function verifySsv(originalUrl: string, keys: Map<string, string>): { valid: boolean; message?: string } {
  const q = originalUrl.indexOf('?');
  if (q === -1) return { valid: false };
  const query = originalUrl.slice(q + 1);
  const i = query.indexOf('&signature=');
  if (i === -1) return { valid: false };
  const message = query.slice(0, i);
  const tail = new URLSearchParams(query.slice(i + 1));
  const signature = tail.get('signature');
  const pem = keys.get(tail.get('key_id') ?? '');
  if (!signature || !pem) return { valid: false };
  try {
    const valid = verify(
      'sha256',
      Buffer.from(message, 'utf8'),
      { key: pem, dsaEncoding: 'der' },
      Buffer.from(signature, 'base64url'),
    );
    return valid ? { valid, message } : { valid: false };
  } catch {
    return { valid: false };
  }
}
