// Typed wrappers around the Go methods (Wails generates the bindings in ../wailsjs at build time).
import * as Go from '../wailsjs/go/main/App';

export type Session = { sessionId: string; regionCode: string; protocol: 'udp' | 'tcp'; startedAt: string };
export type Me = { deviceId: string; balanceSeconds: number; blocked: boolean; session: Session | null };
export type AppConfig = {
  dailyFreeMinutes: number;
  nextDailyRefillAt: string;
  lowMinutesWarningSeconds: number;
  defaultProtocol: string;
  supportEmail: string;
  tcpLocalPort: number;
};
export type Region = { code: string; displayName: string; countryCode: string; pingHost: string; pingPort: number };
export type Protocol = 'auto' | 'udp' | 'tcp';
export type Settings = { protocol: Protocol; killSwitch: boolean; region: string };
export type InitResult = {
  deviceId: string;
  version: string;
  apiBase: string;
  me: Me;
  config: AppConfig;
  regions: Region[];
  settings: Settings;
  legalSite: string;
};
export type Status = {
  state: 'disconnected' | 'connecting' | 'connected' | 'disconnecting';
  detail: string;
  region: string;
  protocol: string;
  connectedSecs: number;
  rxBytes: number;
  txBytes: number;
  balanceSeconds: number;
  error: string;
};

const cast = <T,>(p: Promise<unknown>) => p as Promise<T>;

export const backend = {
  init: () => cast<InitResult>(Go.Init()),
  me: () => cast<Me>(Go.Me()),
  config: () => cast<AppConfig>(Go.Config()),
  ping: (regions: Region[]) => cast<{ code: string; ms: number }[]>(Go.Ping(regions as never)),
  saveSettings: (s: Settings) => cast<void>(Go.SaveSettings(s as never)),
  status: () => cast<Status>(Go.Status()),
  connect: (region: string) => cast<void>(Go.Connect(region)),
  disconnect: () => cast<void>(Go.Disconnect()),
  openURL: (url: string) => cast<void>(Go.OpenURL(url)),
};

export const errorText = (e: unknown) => (typeof e === 'string' ? e : e instanceof Error ? e.message : 'Something went wrong');
