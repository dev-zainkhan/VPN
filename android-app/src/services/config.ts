import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

type Extra = { apiBase?: string; testBuild?: boolean };
const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

// Test builds can point the app at another API (for example the laptop's new Wi-Fi address).
export const isTestBuild = extra.testBuild !== false;
export const defaultApiBase = extra.apiBase ?? 'https://13-126-168-194.sslip.io';
const API_KEY = 'veil.apiBase';

let apiBase = defaultApiBase;

export async function loadApiBase(): Promise<string> {
  if (isTestBuild) apiBase = (await SecureStore.getItemAsync(API_KEY)) ?? defaultApiBase;
  return apiBase;
}

export function getApiBase(): string {
  return apiBase;
}

export async function setApiBase(value: string): Promise<void> {
  const clean = value.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+$/.test(clean)) throw new Error('Use a full address like http://192.168.1.20:3000');
  apiBase = clean;
  await SecureStore.setItemAsync(API_KEY, clean);
}
