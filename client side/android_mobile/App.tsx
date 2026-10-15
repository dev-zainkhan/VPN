import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConnectionErrorScreen } from './src/features/connection-errors/ConnectionErrorScreen';
import { OutOfTimeScreen } from './src/features/connection-errors/OutOfTimeScreen';
import { HomeScreen } from './src/features/connection/HomeScreen';
import { LocationsScreen } from './src/features/locations/LocationsScreen';
import { WelcomeScreen } from './src/features/onboarding/WelcomeScreen';
import { RewardsScreen } from './src/features/rewards/RewardsScreen';
import { SettingsScreen } from './src/features/settings/SettingsScreen';
import { colors } from './src/theme/colors';
import type { Location, Protocol } from './src/types';
import { locations } from './src/types';

type Route = 'welcome' | 'home' | 'locations' | 'rewards' | 'settings' | 'outOfTime' | 'connectionError';
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

function VeilApp() {
  const [route, setRoute] = useState<Route>('welcome');
  const [connection, setConnection] = useState<ConnectionStatus>('disconnected');
  const [balance, setBalance] = useState(60);
  const [adsLeft, setAdsLeft] = useState(7);
  const [rewarded, setRewarded] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<Location>(locations[0]);
  const [protocol, setProtocol] = useState<Protocol>('Auto');
  const [killSwitch, setKillSwitch] = useState(false);

  useEffect(() => {
    if (connection !== 'connecting') return;
    const timeout = setTimeout(() => setConnection('connected'), 900);
    return () => clearTimeout(timeout);
  }, [connection]);

  useEffect(() => {
    if (connection !== 'connected') return;
    const interval = setInterval(() => {
      setBalance((current) => {
        if (current <= 1) {
          setConnection('disconnected');
          setRoute('outOfTime');
          return 0;
        }
        return current - 1;
      });
    }, 60_000);
    return () => clearInterval(interval);
  }, [connection]);

  const startConnection = () => {
    if (connection === 'connecting') return;
    if (connection === 'connected') {
      setConnection('disconnected');
      return;
    }
    if (balance <= 0) {
      setRoute('outOfTime');
      return;
    }
    setConnection('connecting');
  };

  const addReward = () => {
    if (adsLeft <= 0) return;
    setBalance((current) => current + 30);
    setAdsLeft((current) => current - 1);
    setRewarded(true);
    if (route === 'outOfTime') {
      setConnection('connecting');
      setRoute('home');
    }
  };

  const openRewards = () => {
    setRewarded(false);
    setRoute('rewards');
  };

  const backToHome = () => setRoute('home');
  const locationName = selectedLocation.code === 'FAST'
    ? 'Fastest location'
    : `${selectedLocation.city}, ${selectedLocation.country}`;

  let screen;
  switch (route) {
    case 'welcome':
      screen = <WelcomeScreen onContinue={backToHome} />;
      break;
    case 'home':
      screen = (
        <HomeScreen
          balance={balance}
          connected={connection === 'connected'}
          connecting={connection === 'connecting'}
          location={selectedLocation}
          protocol={protocol}
          onToggleConnection={startConnection}
          onOpenLocations={() => setRoute('locations')}
          onOpenRewards={openRewards}
          onOpenSettings={() => setRoute('settings')}
          onOpenConnectionError={() => setRoute('connectionError')}
        />
      );
      break;
    case 'locations':
      screen = (
        <LocationsScreen
          selected={selectedLocation}
          onBack={backToHome}
          onSelect={(location) => {
            setSelectedLocation(location);
            setRoute('home');
          }}
        />
      );
      break;
    case 'rewards':
      screen = (
        <RewardsScreen
          balance={balance}
          adsLeft={adsLeft}
          rewarded={rewarded}
          onBack={backToHome}
          onWatchAd={addReward}
        />
      );
      break;
    case 'settings':
      screen = (
        <SettingsScreen
          protocol={protocol}
          killSwitch={killSwitch}
          onProtocolChange={setProtocol}
          onKillSwitchChange={setKillSwitch}
          onBack={backToHome}
          onOpenConnectionError={() => setRoute('connectionError')}
        />
      );
      break;
    case 'outOfTime':
      screen = (
        <OutOfTimeScreen
          adsLeft={adsLeft}
          onWatchAd={addReward}
          onNotNow={backToHome}
        />
      );
      break;
    case 'connectionError':
      screen = (
        <ConnectionErrorScreen
          location={locationName}
          onBack={backToHome}
          onRetry={() => {
            setRoute('home');
            startConnection();
          }}
          onChooseLocation={() => setRoute('locations')}
          onOpenSettings={() => setRoute('settings')}
        />
      );
      break;
    default:
      return null;
  }

  return (
    <>
      <StatusBar style="light" backgroundColor={colors.background} />
      {screen}
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <VeilApp />
    </SafeAreaProvider>
  );
}
