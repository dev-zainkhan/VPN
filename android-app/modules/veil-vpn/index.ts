import { requireNativeModule, type EventSubscription } from 'expo-modules-core';

export type TunnelConfig = {
  privateKey: string;
  address: string;
  dns: string[];
  mtu: number;
  peerPublicKey: string;
  endpoint: string;
  allowedIps: string[];
  persistentKeepalive: number;
  tcp: { host: string; port: number; certSha256: string } | null;
  localPort?: number;
};

export type TunnelEvent = { state: 'up' | 'down' | 'error'; message?: string };
export type TunnelStats = { latestHandshakeMs: number; rxBytes: number; txBytes: number };

type NativeVeilVpn = {
  generateKeyPair(): { publicKey: string; privateKey: string };
  publicKeyFor(privateKey: string): string;
  sha256Hex(text: string): string;
  prepare(): Promise<boolean>;
  connect(config: TunnelConfig): Promise<boolean>;
  disconnect(): Promise<boolean>;
  getState(): 'up' | 'down';
  getStats(): Promise<TunnelStats>;
  tcpPing(host: string, port: number): Promise<number>;
  addListener(event: 'onStateChange', listener: (e: TunnelEvent) => void): EventSubscription;
};

export const VeilVpn = requireNativeModule<NativeVeilVpn>('VeilVpn');
