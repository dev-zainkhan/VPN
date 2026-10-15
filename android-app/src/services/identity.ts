import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';
import { VeilVpn } from '../../modules/veil-vpn';
import { api, ApiError, setDeviceToken } from './api';

const TOKEN_KEY = 'veil.deviceToken';
const DEVICE_KEY = 'veil.deviceId';
const WG_KEY = 'veil.wgPrivateKey';

export type Identity = { deviceId: string; publicKey: string; privateKey: string };

// Spec 8.2: the abuse key ties starter minutes to the phone, not to one install.
function abuseKey(): string {
  const androidId = Application.getAndroidId() ?? 'unknown';
  return VeilVpn.sha256Hex(`${androidId}:veil-abuse-v1`);
}

// One WireGuard key pair per install; the private key stays in Android's encrypted storage.
async function wgKeys(): Promise<{ publicKey: string; privateKey: string }> {
  let privateKey = await SecureStore.getItemAsync(WG_KEY);
  if (!privateKey) {
    privateKey = VeilVpn.generateKeyPair().privateKey;
    await SecureStore.setItemAsync(WG_KEY, privateKey);
  }
  return { privateKey, publicKey: VeilVpn.publicKeyFor(privateKey) };
}

export async function hasIdentity(): Promise<boolean> {
  return (await SecureStore.getItemAsync(TOKEN_KEY)) !== null;
}

// Loads the saved device, or registers a new one on first start.
export async function ensureIdentity(): Promise<Identity> {
  const keys = await wgKeys();
  const savedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  const savedId = await SecureStore.getItemAsync(DEVICE_KEY);
  if (savedToken && savedId) {
    setDeviceToken(savedToken);
    return { deviceId: savedId, ...keys };
  }
  const reg = await api.register(abuseKey(), Application.nativeApplicationVersion ?? '1.0.0');
  await SecureStore.setItemAsync(TOKEN_KEY, reg.deviceToken);
  await SecureStore.setItemAsync(DEVICE_KEY, reg.deviceId);
  setDeviceToken(reg.deviceToken);
  return { deviceId: reg.deviceId, ...keys };
}

// When the server no longer knows this device (for example a fresh test database), start over.
export async function forgetIdentity(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(DEVICE_KEY);
  setDeviceToken(null);
}

export const isAuthError = (e: unknown) => e instanceof ApiError && (e.code === 'AUTH_INVALID' || e.code === 'AUTH_REQUIRED');
