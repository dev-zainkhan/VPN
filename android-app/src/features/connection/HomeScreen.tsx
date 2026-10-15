import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Brand } from '../../components/Brand';
import { ConnectionOrb } from '../../components/ConnectionOrb';
import { Screen } from '../../components/Screen';
import { colors } from '../../theme/colors';
import type { Location, Protocol } from '../../types';

type HomeScreenProps = {
  balance: number;
  connected: boolean;
  connecting: boolean;
  location: Location;
  protocol: Protocol;
  onToggleConnection: () => void;
  onOpenLocations: () => void;
  onOpenRewards: () => void;
  onOpenSettings: () => void;
  onOpenConnectionError: () => void;
};

function formatBalance(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours > 0 ? `${hours}h ${remainder}m` : `${remainder} min`;
}

export function HomeScreen({
  balance,
  connected,
  connecting,
  location,
  protocol,
  onToggleConnection,
  onOpenLocations,
  onOpenRewards,
  onOpenSettings,
  onOpenConnectionError,
}: HomeScreenProps) {
  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.header}>
        <Brand compact />
        <Pressable
          accessibilityLabel="Open settings"
          onPress={onOpenSettings}
          style={styles.settingsButton}
        >
          <Feather name="sliders" size={20} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.balanceCard}>
        <View>
          <Text style={styles.eyebrow}>TIME LEFT</Text>
          <Text style={styles.balance}>{formatBalance(balance)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onOpenRewards}
          style={styles.rewardButton}
        >
          <Feather name="plus" size={21} color={colors.accent} />
          <Text style={styles.rewardButtonText}>Get more time</Text>
        </Pressable>
      </View>

      <View style={styles.connection}>
        <ConnectionOrb
          connected={connected}
          connecting={connecting}
          onPress={onToggleConnection}
        />
        <Text style={[styles.connectionTitle, connected && styles.connectedTitle]}>
          {connecting ? 'Connecting…' : connected ? 'Protected' : 'Not protected'}
        </Text>
        <Text style={styles.connectionDetail}>
          {connecting
            ? 'Setting up a secure tunnel'
            : connected
              ? 'Traffic encrypted · 00:14:32'
              : 'Tap to connect · your IP is visible'}
        </Text>
      </View>

      <View style={styles.bottom}>
        <Pressable
          accessibilityRole="button"
          onPress={onOpenLocations}
          style={({ pressed }) => [styles.locationCard, pressed && styles.pressed]}
        >
          <View style={styles.countryCode}>
            <Text style={styles.codeText}>{location.code}</Text>
          </View>
          <View style={styles.locationCopy}>
            <Text style={styles.countryCity}>
              {location.code === 'FAST' ? 'Fastest location' : `${location.city}, ${location.country}`}
            </Text>
            <Text style={styles.locationDetail}>
              {location.code === 'FAST' ? 'Picks the best server for you' : `Fastest location · ${location.ping} ms`}
            </Text>
          </View>
          <Feather name="chevron-right" size={21} color={colors.secondary} />
        </Pressable>
        <View style={styles.protocolLine}>
          <Feather name="lock" size={15} color={colors.secondary} />
          <Text style={styles.protocolText}>
            {connected ? `WireGuard · ${protocol === 'Auto' ? 'UDP' : protocol}` : `Protocol: ${protocol}`}
          </Text>
        </View>
        <Pressable onPress={onOpenConnectionError} style={styles.helpLink}>
          <Text style={styles.helpText}>Having trouble connecting?</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 8,
  },
  header: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingsButton: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceCard: {
    minHeight: 88,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  eyebrow: {
    color: colors.secondary,
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  balance: {
    marginTop: 3,
    color: colors.text,
    fontSize: 27,
    fontWeight: '800',
  },
  rewardButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 15,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: 12,
  },
  rewardButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  connection: {
    alignItems: 'center',
    gap: 9,
  },
  connectionTitle: {
    color: colors.text,
    fontSize: 29,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  connectedTitle: {
    color: colors.accent,
  },
  connectionDetail: {
    color: colors.secondary,
    fontSize: 14,
    textAlign: 'center',
  },
  bottom: {
    gap: 8,
  },
  locationCard: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pressed: {
    opacity: 0.78,
  },
  countryCode: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  codeText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  locationCopy: {
    flex: 1,
    gap: 4,
  },
  countryCity: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  locationDetail: {
    color: colors.secondary,
    fontSize: 12,
  },
  protocolLine: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  protocolText: {
    color: colors.secondary,
    fontSize: 13,
  },
  helpLink: {
    alignSelf: 'center',
    paddingVertical: 4,
  },
  helpText: {
    color: colors.muted,
    fontSize: 12,
  },
});
