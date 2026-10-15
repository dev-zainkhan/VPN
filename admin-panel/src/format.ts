export type Page = 'Dashboard' | 'AWS accounts' | 'Servers' | 'Regions' | 'Devices' | 'Rewards' | 'Settings';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const percent = (value: number, max: number | null) =>
  max ? Math.min(Math.round((value / max) * 100), 100) : 0;

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return '—';
  const ms = now - new Date(iso).getTime();
  if (ms < 2 * MINUTE) return 'Now';
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} min ago`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)} h ago`;
  if (ms < 2 * DAY) return 'Yesterday';
  return `${Math.floor(ms / DAY)} days ago`;
}

export function formatUptime(seconds: number | null): string {
  if (seconds === null) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatBalance(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes === 0) return seconds > 0 ? '<1 min' : '0 min';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${String(rest).padStart(2, '0')}m` : `${minutes} min`;
}

export const formatNumber = (n: number) => n.toLocaleString('en-US');

// "Mumbai, India" → "Mumbai"
export const cityOf = (displayName: string) => displayName.split(',')[0]!.trim();

// i-06d1b03106a2a786e → i-06d1…786e
export const shortId = (id: string | null) => (id ? (id.length > 14 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id) : '—');

export const shortDevice = (id: string) => `${id.slice(0, 4)}…${id.slice(-4)}`;

export function chartLabel(day: string, index: number, total: number): string {
  if (index === total - 1) return 'Today';
  const d = new Date(`${day}T00:00:00Z`);
  return d.getUTCDate() === 1 || index === 0
    ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    : String(d.getUTCDate());
}
