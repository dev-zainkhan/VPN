import { Feather } from '@expo/vector-icons';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { Header } from '../../components/Header';
import { Screen } from '../../components/Screen';
import { colors } from '../../theme/colors';
import type { Protocol } from '../../types';

type SettingsScreenProps = {
  protocol: Protocol;
  killSwitch: boolean;
  onProtocolChange: (protocol: Protocol) => void;
  onKillSwitchChange: (enabled: boolean) => void;
  onBack: () => void;
  onOpenConnectionError: () => void;
};

const protocols: Protocol[] = ['Auto', 'UDP', 'TCP'];

export function SettingsScreen({
  protocol,
  killSwitch,
  onProtocolChange,
  onKillSwitchChange,
  onBack,
  onOpenConnectionError,
}: SettingsScreenProps) {
  return (
    <Screen scroll contentStyle={styles.content}>
      <Header title="Settings" onBack={onBack} />
      <Text style={styles.sectionLabel}>CONNECTION</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Protocol</Text>
        <View style={styles.segmented}>
          {protocols.map((option) => (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ selected: protocol === option }}
              onPress={() => onProtocolChange(option)}
              style={[styles.segment, protocol === option && styles.activeSegment]}
            >
              <Text style={[styles.segmentText, protocol === option && styles.activeSegmentText]}>
                {option}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.description}>
          {protocol === 'Auto'
            ? 'Recommended. Uses UDP for speed and switches to TCP automatically if your network blocks it.'
            : protocol === 'UDP'
              ? 'Best speed for most networks. Switch to TCP if your network blocks VPN traffic.'
              : 'More reliable on restricted Wi-Fi networks, with a small speed trade-off.'}
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.settingHeading}>
          <Feather name="shield" size={21} color={colors.accent} />
          <Text style={styles.cardTitle}>Kill switch</Text>
        </View>
        <Text style={styles.description}>
          Blocks internet if the VPN drops, so nothing leaks unprotected. Android's Always-on VPN
          and “Block connections without VPN” provide system-level protection.
        </Text>
        <View style={styles.settingRow}>
          <View style={styles.settingCopy}>
            <Text style={styles.rowTitle}>Enable kill switch</Text>
            <Text style={styles.rowDescription}>Demo preference only; Android VPN is not connected.</Text>
          </View>
          <Switch
            accessibilityLabel="Enable kill switch"
            onValueChange={onKillSwitchChange}
            thumbColor={colors.text}
            trackColor={{ false: colors.border, true: '#237C5B' }}
            value={killSwitch}
          />
        </View>
        <Button
          onPress={() => Alert.alert(
            'Android VPN settings',
            'System VPN settings will be available after native VPN integration.',
          )}
          variant="secondary"
        >
          Open Android VPN settings
        </Button>
      </View>

      <View style={styles.card}>
        <SettingRow
          title="DNS leak protection"
          description="Your lookups stay inside the tunnel"
          value="Always on"
        />
        <View style={styles.divider} />
        <SettingRow
          title="Auto-reconnect"
          description="Reconnects if your network changes"
          value="Always on"
        />
      </View>

      <Text style={styles.sectionLabel}>ABOUT</Text>
      <View style={styles.card}>
        <LinkRow
          title="Privacy policy"
          onPress={() => Alert.alert('Privacy policy', 'The privacy policy will be available in the full release.')}
        />
        <View style={styles.divider} />
        <LinkRow
          title="Terms of use"
          onPress={() => Alert.alert('Terms of use', 'The terms of use will be available in the full release.')}
        />
      </View>

      <Pressable onPress={onOpenConnectionError} style={styles.helpCard}>
        <Feather name="help-circle" size={20} color={colors.accent} />
        <View style={styles.helpCopy}>
          <Text style={styles.rowTitle}>Connection help</Text>
          <Text style={styles.rowDescription}>Troubleshoot a location that isn't responding.</Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.secondary} />
      </Pressable>
    </Screen>
  );
}

function SettingRow({
  title,
  description,
  value,
}: {
  title: string;
  description: string;
  value: string;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
      <Text style={styles.alwaysOn}>{value}</Text>
    </View>
  );
}

function LinkRow({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.linkRow}>
      <Text style={styles.rowTitle}>{title}</Text>
      <Feather name="chevron-right" size={19} color={colors.secondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
    paddingTop: 8,
  },
  sectionLabel: {
    color: colors.secondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginTop: 3,
  },
  card: {
    gap: 15,
    padding: 17,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  segmented: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 16,
    backgroundColor: colors.background,
  },
  segment: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeSegment: {
    backgroundColor: colors.accent,
  },
  segmentText: {
    color: colors.secondary,
    fontSize: 14,
    fontWeight: '700',
  },
  activeSegmentText: {
    color: colors.black,
  },
  description: {
    color: colors.secondary,
    fontSize: 13,
    lineHeight: 20,
  },
  settingHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 54,
  },
  settingCopy: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  rowDescription: {
    color: colors.secondary,
    fontSize: 12,
    lineHeight: 17,
  },
  alwaysOn: {
    color: colors.accent,
    backgroundColor: colors.accentDark,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 15,
    overflow: 'hidden',
    fontSize: 12,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  linkRow: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  helpCard: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 16,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  helpCopy: {
    flex: 1,
    gap: 4,
  },
});
