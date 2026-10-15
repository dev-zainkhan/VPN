import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, StyleSheet, Text, View } from 'react-native';
import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { VeilVpn } from './modules/veil-vpn';
import { Button } from './src/components/Button';
import { ConnectionErrorScreen } from './src/features/connection-errors/ConnectionErrorScreen';
import { OutOfTimeScreen } from './src/features/connection-errors/OutOfTimeScreen';
import { HomeScreen } from './src/features/connection/HomeScreen';
import { LocationsScreen } from './src/features/locations/LocationsScreen';
import { WelcomeScreen } from './src/features/onboarding/WelcomeScreen';
import { RewardsScreen } from './src/features/rewards/RewardsScreen';
import { SettingsScreen } from './src/features/settings/SettingsScreen';
import { api, ApiError, type AppConfig, type Me, type RegionItem } from './src/services/api';
import { getApiBase, isTestBuild, loadApiBase, setApiBase } from './src/services/config';
import { ensureIdentity, forgetIdentity, hasIdentity, isAuthError, type Identity } from './src/services/identity';
import { tunnelConfig, waitForHandshake } from './src/services/tunnel';
import { colors } from './src/theme/colors';
import { FASTEST, type Location, type Protocol } from './src/types';

type Route = 'home' | 'locations' | 'rewards' | 'settings' | 'outOfTime' | 'connectionError';
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';
type Phase = { kind: 'loading' } | { kind: 'welcome' } | { kind: 'ready' } | { kind: 'offline'; message: string };

const PROTOCOL_KEY = 'veil.protocol';
const ME_POLL_MS = 60_000;
const appVersion = Application.nativeApplicationVersion ?? '1.0.0';

function toLocation(r: RegionItem, ping: number | null): Location {
  const [city, ...rest] = r.displayName.split(',');
  return { id: r.code, code: r.countryCode, city: city!.trim(), country: rest.join(',').trim() || r.countryCode, ping, pingHost: r.pingHost };
}

function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

function messageFor(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return e instanceof Error ? e.message : 'Something went wrong';
}

function VeilApp() {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [route, setRoute] = useState<Route>('home');
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [meAt, setMeAt] = useState(Date.now());
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [selected, setSelected] = useState<Location>(FASTEST);
  const [protocol, setProtocol] = useState<Protocol>('Auto');
  const [connection, setConnection] = useState<ConnectionStatus>('disconnected');
  const [activeProtocol, setActiveProtocol] = useState<'UDP' | 'TCP' | null>(null);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState<string | null>(null);
  const [lastLocationName, setLastLocationName] = useState('This location');
  const connectingRef = useRef(false);
  const connectionRef = useRef<ConnectionStatus>('disconnected');
  connectionRef.current = connection;

  const refreshMe = useCallback(async () => {
    try {
      const next = await api.me();
      setMe(next);
      setMeAt(Date.now());
      return next;
    } catch (e) {
      if (isAuthError(e)) {
        // The server forgot this device (for example a reset test database): register again.
        await forgetIdentity();
        setIdentity(await ensureIdentity());
        return null;
      }
      throw e;
    }
  }, []);

  const loadRegions = useCallback(async () => {
    setLocationsLoading(true);
    try {
      const { items } = await api.regions();
      setLocations(items.map((r) => toLocation(r, null)));
      const pings = await Promise.all(items.map((r) => VeilVpn.tcpPing(r.pingHost, r.pingPort).catch(() => -1)));
      setLocations(items.map((r, i) => toLocation(r, pings[i]! >= 0 ? pings[i]! : null)));
    } finally {
      setLocationsLoading(false);
    }
  }, []);

  // Start-up: registered phones go straight to Home; new ones see Welcome first.
  const start = useCallback(async () => {
    setPhase({ kind: 'loading' });
    await loadApiBase();
    const saved = (await SecureStore.getItemAsync(PROTOCOL_KEY)) as Protocol | null;
    if (saved) setProtocol(saved);
    if (!(await hasIdentity())) {
      setPhase({ kind: 'welcome' });
      return;
    }
    try {
      setIdentity(await ensureIdentity());
      const [, cfg] = await Promise.all([refreshMe(), api.config()]);
      setAppConfig(cfg);
      if (!saved) setProtocol(cfg.defaultProtocol === 'udp' ? 'UDP' : cfg.defaultProtocol === 'tcp' ? 'TCP' : 'Auto');
      if (VeilVpn.getState() === 'up') {
        setConnection('connected');
        setConnectedAt(Date.now());
      }
      setPhase({ kind: 'ready' });
      void loadRegions().catch(() => undefined);
    } catch (e) {
      setPhase({ kind: 'offline', message: messageFor(e) });
    }
  }, [loadRegions, refreshMe]);

  useEffect(() => {
    void start();
  }, [start]);

  const finishWelcome = async () => {
    setPhase({ kind: 'loading' });
    try {
      setIdentity(await ensureIdentity());
      await start();
    } catch (e) {
      setPhase({ kind: 'offline', message: messageFor(e) });
    }
  };

  // The tunnel can stop on its own (Android revoked it, another VPN started).
  useEffect(() => {
    const sub = VeilVpn.addListener('onStateChange', (e) => {
      if (e.state === 'error') setNotice(e.message ?? 'The connection failed');
      if (e.state === 'down' && connectionRef.current === 'connected' && !connectingRef.current) {
        setConnection('disconnected');
        setActiveProtocol(null);
        setConnectedAt(null);
      }
    });
    return () => sub.remove();
  }, []);

  const stopTunnel = useCallback(async (tellServer: boolean) => {
    await VeilVpn.disconnect().catch(() => undefined);
    if (tellServer) await api.disconnect().catch(() => undefined);
    setConnection('disconnected');
    setActiveProtocol(null);
    setConnectedAt(null);
  }, []);

  // While connected: tick the clock, and ask the server for the balance every minute (spec 9.6).
  useEffect(() => {
    if (connection !== 'connected') return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => {
      refreshMe()
        .then(async (next) => {
          if (!next) return;
          if (next.balanceSeconds <= 0) {
            await stopTunnel(false);
            setRoute('outOfTime');
          } else if (!next.session) {
            await stopTunnel(false);
            setNotice('The connection was ended by the server. Tap to reconnect.');
          }
        })
        .catch(() => undefined);
    }, ME_POLL_MS);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [connection, refreshMe, stopTunnel]);

  // Coming back to the app: refresh the balance and the real tunnel state.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || phase.kind !== 'ready') return;
      void refreshMe().catch(() => undefined);
      if (VeilVpn.getState() === 'down' && connectionRef.current === 'connected') {
        setConnection('disconnected');
        setActiveProtocol(null);
        setConnectedAt(null);
      }
    });
    return () => sub.remove();
  }, [phase.kind, refreshMe]);

  const pickRegion = (): Location | null => {
    if (selected.id !== 'FAST') return selected;
    const withPing = locations.filter((l) => l.ping !== null).sort((a, b) => a.ping! - b.ping!);
    return withPing[0] ?? locations[0] ?? null;
  };

  const connect = async () => {
    if (!identity || connectingRef.current) return;
    setNotice(null);
    if ((me?.balanceSeconds ?? 0) <= 0) {
      setRoute('outOfTime');
      return;
    }
    const region = pickRegion();
    if (!region) {
      setNotice('No location is online right now. Try again in a few minutes.');
      void loadRegions().catch(() => undefined);
      return;
    }
    setLastLocationName(`${region.city}, ${region.country}`);
    connectingRef.current = true;
    setConnection('connecting');
    try {
      if (!(await VeilVpn.prepare())) {
        setNotice('Veil needs permission to set up a VPN. Tap connect and choose OK.');
        setConnection('disconnected');
        return;
      }
      // Auto: UDP first; if no handshake within 8 seconds, TCP on port 443 (spec 8.6).
      const order: ('udp' | 'tcp')[] = protocol === 'UDP' ? ['udp'] : protocol === 'TCP' ? ['tcp'] : ['udp', 'tcp'];
      for (let i = 0; i < order.length; i++) {
        const p = order[i]!;
        const last = i === order.length - 1;
        const res = await api.connect(region.id, p, identity.publicKey);
        await VeilVpn.connect(tunnelConfig(res, identity.privateKey, appConfig?.tcpLocalPort ?? 51821));
        if (await waitForHandshake(last ? 15000 : 8000)) {
          setMe((m) => (m ? { ...m, balanceSeconds: res.balanceSeconds } : m));
          setMeAt(Date.now());
          setActiveProtocol(p === 'udp' ? 'UDP' : 'TCP');
          setConnectedAt(Date.now());
          setConnection('connected');
          return;
        }
        await VeilVpn.disconnect().catch(() => undefined);
      }
      await api.disconnect().catch(() => undefined);
      setConnection('disconnected');
      setRoute('connectionError');
    } catch (e) {
      await VeilVpn.disconnect().catch(() => undefined);
      setConnection('disconnected');
      const code = e instanceof ApiError ? e.code : '';
      if (code === 'BALANCE_EMPTY') setRoute('outOfTime');
      else if (code === 'BLOCKED') {
        Alert.alert('Device blocked', `This device can no longer connect.${appConfig?.supportEmail ? ` Contact ${appConfig.supportEmail} if you think this is a mistake.` : ''}`);
      } else if (code === 'NO_SERVER_AVAILABLE' || code === 'REGION_UNAVAILABLE') {
        setRoute('connectionError');
        void loadRegions().catch(() => undefined);
      } else setNotice(messageFor(e));
    } finally {
      connectingRef.current = false;
    }
  };

  const toggleConnection = () => {
    if (connection === 'connecting') return;
    if (connection === 'connected') void stopTunnel(true).then(() => refreshMe().catch(() => undefined));
    else void connect();
  };

  const changeProtocol = (p: Protocol) => {
    setProtocol(p);
    void SecureStore.setItemAsync(PROTOCOL_KEY, p);
  };

  // Ads are added in the next build (AdMob); the screen already shows the real limits.
  const [rewardMessage, setRewardMessage] = useState<{ tone: 'success' | 'info' | 'error'; text: string } | null>(null);
  const watchAd = () => setRewardMessage({ tone: 'info', text: 'Ads arrive in the next test build. Ask the admin for minutes meanwhile.' });

  // Balance counts down locally between server checks while connected.
  const balanceSeconds = useMemo(() => {
    const base = me?.balanceSeconds ?? 0;
    return connection === 'connected' ? Math.max(0, base - Math.floor((now - meAt) / 1000)) : base;
  }, [me, connection, now, meAt]);
  const balanceMinutes = Math.floor(balanceSeconds / 60);
  const adsLimit = me?.adsLimit ?? appConfig?.maxAdsPerDay ?? 10;
  const adsLeft = Math.max(0, adsLimit - (me?.adsToday ?? 0));
  const minutesPerAd = appConfig?.minutesPerAd ?? 30;

  if (phase.kind === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }
  if (phase.kind === 'welcome') return <WelcomeScreen onContinue={() => void finishWelcome()} />;
  if (phase.kind === 'offline') {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Can't reach Veil</Text>
        <Text style={styles.body}>{phase.message}</Text>
        {isTestBuild && <Text style={styles.small}>Server: {getApiBase()}</Text>}
        <View style={styles.actions}>
          <Button onPress={() => void start()}>Try again</Button>
        </View>
      </View>
    );
  }

  const backToHome = () => setRoute('home');
  switch (route) {
    case 'locations':
      return (
        <LocationsScreen
          locations={locations}
          loading={locationsLoading}
          selected={selected}
          onBack={backToHome}
          onSelect={(location) => {
            setSelected(location);
            setRoute('home');
          }}
        />
      );
    case 'rewards':
      return (
        <RewardsScreen
          balance={balanceMinutes}
          adsLeft={adsLeft}
          adsLimit={adsLimit}
          minutesPerAd={minutesPerAd}
          busy={false}
          message={rewardMessage}
          onBack={backToHome}
          onWatchAd={watchAd}
        />
      );
    case 'settings':
      return (
        <SettingsScreen
          protocol={protocol}
          onProtocolChange={changeProtocol}
          onBack={backToHome}
          onOpenConnectionError={() => setRoute('connectionError')}
          deviceId={identity?.deviceId ?? null}
          appVersion={appVersion}
          supportEmail={appConfig?.supportEmail ?? null}
          testBuild={isTestBuild}
          apiBase={getApiBase()}
          onSaveApiBase={async (value) => {
            await setApiBase(value);
            await start();
          }}
        />
      );
    case 'outOfTime':
      return <OutOfTimeScreen adsLeft={adsLeft} minutesPerAd={minutesPerAd} onWatchAd={() => { setRoute('rewards'); watchAd(); }} onNotNow={backToHome} />;
    case 'connectionError':
      return (
        <ConnectionErrorScreen
          location={lastLocationName}
          onBack={backToHome}
          onRetry={() => {
            setRoute('home');
            void connect();
          }}
          onChooseLocation={() => setRoute('locations')}
          onOpenSettings={() => setRoute('settings')}
        />
      );
    default:
      return (
        <HomeScreen
          balance={balanceMinutes}
          elapsed={connectedAt ? formatElapsed(now - connectedAt) : '00:00:00'}
          activeProtocol={activeProtocol}
          notice={notice}
          connected={connection === 'connected'}
          connecting={connection === 'connecting'}
          location={selected}
          protocol={protocol}
          onToggleConnection={toggleConnection}
          onOpenLocations={() => {
            setRoute('locations');
            void loadRegions().catch(() => undefined);
          }}
          onOpenRewards={() => {
            setRewardMessage(null);
            setRoute('rewards');
          }}
          onOpenSettings={() => setRoute('settings')}
          onOpenConnectionError={() => setRoute('connectionError')}
        />
      );
  }
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor={colors.background} />
      <VeilApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 28 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700', marginBottom: 10, textAlign: 'center' },
  body: { color: colors.secondary, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  small: { color: colors.muted, fontSize: 12, marginTop: 12, textAlign: 'center' },
  actions: { alignSelf: 'stretch', marginTop: 24 },
});
