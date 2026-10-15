import { getApiBase } from './config';

// Device API (backend spec section 8).

export type Me = {
  deviceId: string;
  balanceSeconds: number;
  blocked: boolean;
  adsToday: number;
  adsLimit: number;
  session: { sessionId: string; regionCode: string; protocol: 'udp' | 'tcp'; startedAt: string } | null;
};

export type AppConfig = {
  minutesPerAd: number;
  maxAdsPerDay: number;
  lowMinutesWarningSeconds: number;
  defaultProtocol: 'auto' | 'udp' | 'tcp';
  supportEmail: string | null;
  admobAdUnitId: string;
  tcpLocalPort: number;
};

export type RegionItem = { code: string; displayName: string; countryCode: string; pingHost: string; pingPort: number };

export type ConnectResponse = {
  sessionId: string;
  server: { id: string; regionCode: string; publicIp: string };
  wireguard: {
    address: string;
    dns: string[];
    mtu: number;
    peer: { publicKey: string; endpoint: string; allowedIps: string[]; persistentKeepalive: number };
  };
  tcp: { host: string; port: number; certSha256: string } | null;
  balanceSeconds: number;
};

export type Intent = { intentId: string; nonce: string; userId: string; customData: string; adUnitId: string };
export type IntentStatus = {
  status: 'pending' | 'credited' | 'rejected' | 'expired';
  secondsCredited: number;
  rejectReason: string | null;
  balanceSeconds: number;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let token: string | null = null;
export function setDeviceToken(value: string | null) {
  token = value;
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(`${getApiBase()}/api/v1${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the Veil server. Check your internet connection.');
  } finally {
    clearTimeout(timer);
  }
  const data = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? 'INTERNAL', data?.error?.message ?? 'Something went wrong');
  return data as T;
}

export const api = {
  register: (abuseKey: string, appVersion: string) =>
    request<{ deviceId: string; deviceToken: string; balanceSeconds: number; blocked: boolean }>('POST', '/devices/register', {
      abuseKey,
      platform: 'android',
      appVersion,
    }),
  me: () => request<Me>('GET', '/me'),
  config: () => request<AppConfig>('GET', '/config'),
  regions: () => request<{ items: RegionItem[] }>('GET', '/regions'),
  connect: (regionCode: string, protocol: 'udp' | 'tcp', publicKey: string) =>
    request<ConnectResponse>('POST', '/connect', { regionCode, protocol, publicKey }),
  disconnect: () => request<{ ok: true }>('POST', '/disconnect', {}),
  createIntent: () => request<Intent>('POST', '/rewards/intents', {}),
  intent: (id: string) => request<IntentStatus>('GET', `/rewards/intents/${id}`),
};
