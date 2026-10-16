// Client for the Veil admin API (backend spec section 13). Same origin: in development
// Vite proxies /api to the backend; in production Caddy serves both.

export type ServerStatus = 'provisioning' | 'active' | 'draining' | 'failed' | 'terminating' | 'terminated';
export type AccountStatus = 'working' | 'keys_rejected' | 'disabled';
export type FreeTierPlan = 'legacy_12_month' | 'free_plan_credits' | 'paid';
export type DeviceStatus = 'connected' | 'offline' | 'blocked';

export type AdminMe = { id: string; email: string; totpEnabled: boolean; passwordChangedAt: string };

export type Usage = {
  month?: string;
  computeHours: number;
  computeLimitHours: number | null;
  dataOutGb: number;
  dataOutLimitGb: number | null;
};

export type Credits =
  | { ok: true; planType: string; planStatus: string; remaining: number | null; currency: string | null; expiresAt: string | null; checkedAt: string }
  | { ok: false; reason: 'missing_permission' | 'error'; message: string; checkedAt: string };

export type Account = {
  id: string;
  nickname: string;
  awsAccountNumber: string;
  accessKeyHint: string;
  status: AccountStatus;
  freeTierPlan: FreeTierPlan;
  lastCheckedAt: string | null;
  lastError: string | null;
  createdAt: string;
  serverCount: number;
  usage: Usage;
  credits: Credits;
};

export type KeyTest = { ok: true; awsAccountNumber: string; regions: string[]; freeTierTypes: string[] };

export type Server = {
  id: string;
  regionCode: string;
  regionName: string;
  accountId: string | null;
  accountNickname: string | null;
  // false = added by hand on any provider with an install command
  managed: boolean;
  providerName: string;
  instanceId: string | null;
  instanceType: string;
  publicIp: string | null;
  status: ServerStatus;
  failReason: string | null;
  failDetail: string | null;
  visible: boolean;
  sessionCount: number;
  cpuPct: number | null;
  memPct: number | null;
  lastReportAt: string | null;
  launchedAt: string;
  activeAt: string | null;
  uptimeSeconds: number | null;
  agentVersion: string | null;
};

export type ServerList = {
  items: Server[];
  nextCursor: string | null;
  total: number;
  counts: { all: number; provisioning: number; active: number; draining: number; failed: number };
};

export type Region = {
  code: string;
  displayName: string;
  countryCode: string;
  visible: boolean;
  sortOrder: number;
  activeServers: number;
  visibleToUsers: boolean;
};

export type DeviceItem = {
  id: string;
  status: DeviceStatus;
  balanceSeconds: number;
  adsToday: number;
  appVersion: string;
  firstSeenAt: string;
  lastSeenAt: string;
  session: { regionCode: string; protocol: 'udp' | 'tcp'; serverId: string; instanceId: string | null; startedAt: string } | null;
};
export type DeviceDetail = DeviceItem & { installCount: number; blockedReason: string | null; blockedAt: string | null };
export type DeviceList = {
  items: DeviceItem[];
  nextCursor: string | null;
  total: number;
  counts: { all: number; connected: number; offline: number; blocked: number };
};

export type RewardsSummary = {
  today: { adsCredited: number; minutesGranted: number; devicesWatched: number; rejected: number };
  daily: { day: string; credited: number }[];
  rejects: { duplicate: number; bad_signature: number; daily_limit: number; other: number };
  topDevices: { deviceId: string; adsToday: number; installCount: number }[];
};

export type Settings = {
  minutesPerAd: number;
  starterMinutes: number;
  maxAdsPerDay: number;
  lowMinutesWarning: number;
  defaultProtocol: 'auto' | 'udp' | 'tcp';
  supportEmail: string | null;
  updatedAt?: string;
};

export type Alert = {
  id: string;
  severity: 'error' | 'warning';
  title: string;
  text: string;
  targetType: 'server' | 'aws_account';
  targetId: string;
};

export type Dashboard = {
  alerts: Alert[];
  kpis: {
    activeServers: number;
    activeRegions: number;
    onlineNow: number;
    newDevicesToday: number;
    adsToday: number;
    minutesGrantedToday: number;
  };
  usage: (Usage & { accountId: string; nickname: string; credits: Credits })[];
  regions: { code: string; displayName: string; servers: number; online: number }[];
};

// "$117.82 left · free plan until 17 Feb 2027", or why it is unknown.
export function creditsText(c: Credits): { text: string; tone: 'ok' | 'warn' | 'muted' } {
  if (!c.ok) return { text: c.reason === 'missing_permission' ? 'Credits: needs a permission (see AWS accounts)' : 'Credits: AWS did not answer', tone: 'muted' };
  if (c.planType !== 'FREE') return { text: 'Paid plan', tone: 'muted' };
  const money = c.remaining === null ? 'unknown' : `${c.currency === 'USD' || !c.currency ? '$' : `${c.currency} `}${c.remaining.toFixed(2)}`;
  const until = c.expiresAt ? ` · until ${new Date(c.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : '';
  const days = c.expiresAt ? (new Date(c.expiresAt).getTime() - Date.now()) / 86400000 : Infinity;
  return { text: `${money} credits left${until}`, tone: (c.remaining ?? 0) < 20 || days < 30 ? 'warn' : 'ok' };
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

// Plain-language messages for the codes an admin can run into (spec 18.2).
const MESSAGES: Record<string, string> = {
  LOGIN_FAILED: 'Email or password is wrong.',
  TOTP_REQUIRED: 'Enter the 6-digit code from your authenticator app.',
  TOTP_INVALID: 'That authenticator code is wrong or expired.',
  TOTP_CODE_WRONG: 'That authenticator code is wrong or expired.',
  TOTP_ALREADY_ENABLED: 'Two-factor authentication is already on.',
  ACCOUNT_LOCKED: 'Too many failed attempts. Sign-in is locked for 15 minutes.',
  RATE_LIMITED: 'Too many requests. Wait a few minutes and try again.',
  AUTH_REQUIRED: 'Your session ended. Sign in again.',
  CSRF_FAILED: 'The request was refused. Reload the page and try again.',
  AWS_KEYS_INVALID: 'AWS rejected these keys. Check the access key ID and secret.',
  AWS_PERMISSION_MISSING: 'The IAM user is missing a permission. Attach the veil-orchestrator policy.',
  AWS_ROOT_KEYS: 'These are root account keys. Use the keys of an IAM user instead.',
  AWS_REGION_NOT_ENABLED: 'This region is not enabled in the AWS account.',
  AWS_ACCOUNT_EXISTS: 'This AWS account is already added.',
  AWS_ACCOUNT_MISMATCH: 'These keys belong to a different AWS account.',
  AWS_ACCOUNT_UNAVAILABLE: 'This AWS account is disabled or its keys were rejected.',
  ACCOUNT_HAS_SERVERS: 'Terminate this account’s servers before removing it.',
  NO_FREE_TIER_TYPE: 'No free-tier instance type is available in this region.',
  INSTANCE_TYPE_NOT_FREE: 'That instance type is not free-tier eligible here.',
  AWS_LIMIT_REACHED: 'AWS refused: the account’s instance limit is reached.',
  AWS_NO_CAPACITY: 'AWS has no capacity for this type right now. Try again later.',
  SERVER_STATE: 'That action is not possible in the server’s current state.',
  NOT_FOUND: 'Not found. It may have been removed.',
  INTERNAL: 'Something went wrong on the server.',
};

export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'VALIDATION_FAILED') return e.message === 'Validation failed' ? 'Some fields are not valid.' : e.message;
    if (e.code === 'AWS_ERROR') return `AWS error: ${e.message}`;
    return MESSAGES[e.code] ?? e.message;
  }
  return 'Cannot reach the server. Check that the API is running.';
}

let onSessionLost: () => void = () => {};
export function setSessionLostHandler(fn: () => void) {
  onSessionLost = fn;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      // Required by the API for every write (with the SameSite=Strict cookie this blocks CSRF).
      'X-Requested-With': 'veil-admin',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    const apiError = new ApiError(res.status, err?.code ?? 'INTERNAL', err?.message ?? res.statusText, err?.details);
    if (apiError.code === 'AUTH_REQUIRED' && path !== '/auth/me') onSessionLost();
    throw apiError;
  }
  return data as T;
}

const qs = (params: Record<string, string | number | undefined>) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '') as [string, string][];
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}` : '';
};

export const api = {
  login: (email: string, password: string, totpCode?: string) =>
    request<{ admin: { id: string; email: string; totpEnabled: boolean } }>('POST', '/auth/login', {
      email,
      password,
      ...(totpCode ? { totpCode } : {}),
    }),
  logout: () => request<{ ok: true }>('POST', '/auth/logout', {}),
  me: () => request<AdminMe>('GET', '/auth/me'),
  totpSetup: () => request<{ otpauthUrl: string; secret: string }>('POST', '/auth/totp/setup', {}),
  totpEnable: (code: string) => request<{ ok: true }>('POST', '/auth/totp/enable', { code }),
  totpDisable: (password: string, code: string) => request<{ ok: true }>('POST', '/auth/totp/disable', { password, code }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>('POST', '/auth/password', { currentPassword, newPassword }),

  dashboard: () => request<Dashboard>('GET', '/dashboard'),

  accounts: () => request<{ items: Account[] }>('GET', '/aws-accounts'),
  testKeys: (accessKeyId: string, secretAccessKey: string) =>
    request<KeyTest>('POST', '/aws-accounts/test', { accessKeyId, secretAccessKey }),
  addAccount: (body: { nickname: string; accessKeyId: string; secretAccessKey: string; freeTierPlan: FreeTierPlan }) =>
    request<Account>('POST', '/aws-accounts', body),
  updateKeys: (id: string, accessKeyId: string, secretAccessKey: string) =>
    request<Account>('PUT', `/aws-accounts/${id}/keys`, { accessKeyId, secretAccessKey }),
  testAccount: (id: string) => request<KeyTest>('POST', `/aws-accounts/${id}/test`, {}),
  patchAccount: (id: string, body: { nickname?: string; status?: 'working' | 'disabled'; freeTierPlan?: FreeTierPlan }) =>
    request<Account>('PATCH', `/aws-accounts/${id}`, body),
  deleteAccount: (id: string) => request<{ ok: true }>('DELETE', `/aws-accounts/${id}`),
  accountRegions: (id: string) => request<{ items: { code: string; displayName: string }[] }>('GET', `/aws-accounts/${id}/regions`),
  instanceTypes: (id: string, region: string) =>
    request<{ items: string[] }>('GET', `/aws-accounts/${id}/regions/${region}/instance-types`),

  servers: (q: { status?: ServerStatus; accountId?: string; regionCode?: string; cursor?: string; limit?: number }) =>
    request<ServerList>('GET', `/servers${qs(q)}`),
  createServer: (awsAccountId: string, regionCode: string, instanceType?: string) =>
    request<Server>('POST', '/servers', { awsAccountId, regionCode, ...(instanceType ? { instanceType } : {}) }),
  createManualServer: (regionCode: string, providerName: string) =>
    request<{ server: Server; installCommand: string }>('POST', '/servers/manual', { regionCode, providerName }),
  newInstallCommand: (id: string) => request<{ installCommand: string }>('POST', `/servers/${id}/install-command`, {}),
  serverAction: (id: string, action: 'drain' | 'undrain' | 'reboot' | 'terminate') =>
    request<Server>('POST', `/servers/${id}/${action}`, {}),
  setServerVisible: (id: string, visible: boolean) => request<Server>('PATCH', `/servers/${id}`, { visible }),

  regions: () => request<{ items: Region[] }>('GET', '/regions'),
  saveRegions: (items: { code: string; displayName: string; visible: boolean }[]) =>
    request<{ items: Region[] }>('PUT', '/regions', { items }),

  devices: (q: { status?: string; q?: string; cursor?: string; limit?: number }) => request<DeviceList>('GET', `/devices${qs(q)}`),
  device: (id: string) => request<DeviceDetail>('GET', `/devices/${id}`),
  adjust: (id: string, deltaMinutes: number) => request<DeviceDetail>('POST', `/devices/${id}/adjust`, { deltaMinutes }),
  disconnect: (id: string) => request<DeviceDetail>('POST', `/devices/${id}/disconnect`, {}),
  block: (id: string, reason: 'reward_farming' | 'abuse_report' | 'other', note?: string) =>
    request<DeviceDetail>('POST', `/devices/${id}/block`, { reason, ...(note ? { note } : {}) }),
  unblock: (id: string) => request<DeviceDetail>('POST', `/devices/${id}/unblock`, {}),

  rewards: (days: number) => request<RewardsSummary>('GET', `/rewards/summary?days=${days}`),
  settings: () => request<Settings>('GET', '/settings'),
  saveSettings: (s: Settings) => {
    const { updatedAt: _ignored, ...body } = s;
    return request<Settings>('PUT', '/settings', body);
  },
};

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
