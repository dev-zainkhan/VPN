import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../components/Button';
import { Header } from '../../components/Header';
import { Screen } from '../../components/Screen';
import { legalSite } from '../../services/config';
import { colors } from '../../theme/colors';
import type { Protocol } from '../../types';

type SettingsScreenProps = {
  protocol: Protocol;
  onProtocolChange: (protocol: Protocol) => void;
  onBack: () => void;
  onOpenConnectionError: () => void;
  deviceId: string | null;
  appVersion: string;
  supportEmail: string | null;
  testBuild: boolean;
  apiBase: string;
  onSaveApiBase: (value: string) => Promise<void>;
};

// Android's own setting: Always-on VPN and "Block connections without VPN" is the real kill switch.
const openVpnSettings = () => {
  Linking.sendIntent('android.settings.VPN_SETTINGS').catch(() => Linking.openSettings());
};

const protocols: Protocol[] = ['Auto', 'UDP', 'TCP'];

export function SettingsScreen({
  protocol,
  onProtocolChange,
  onBack,
  onOpenConnectionError,
  deviceId,
  appVersion,
  supportEmail,
  testBuild,
  apiBase,
  onSaveApiBase,
}: SettingsScreenProps) {
  const [apiDraft, setApiDraft] = useState(apiBase);
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
          Blocks internet if the VPN drops, so nothing leaks unprotected. In Android's VPN settings,
          tap the gear next to Raaz VPN and turn on “Always-on VPN” and “Block connections without VPN”.
        </Text>
        <Button onPress={openVpnSettings} variant="secondary">
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
          onPress={() => { Linking.openURL(`${legalSite}/privacy.html`).catch(() => undefined); }}
        />
        <View style={styles.divider} />
        <LinkRow
          title="Terms of use"
          onPress={() => { Linking.openURL(`${legalSite}/terms.html`).catch(() => undefined); }}
        />
      </View>

      <View style={styles.card}>
        <SettingRow title="Device ID" description="Give this to support if you need help" value="" />
        <Text selectable style={styles.mono}>{deviceId ?? 'Not registered yet'}</Text>
        <View style={styles.divider} />
        <SettingRow title="App version" description={supportEmail ? `Support: ${supportEmail}` : 'Raaz VPN for Android'} value={appVersion} />
      </View>

      {testBuild && (
        <>
          <Text style={styles.sectionLabel}>TEST BUILD</Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Server address</Text>
            <Text style={styles.description}>Where this test app finds the Raaz API. Use your laptop's Wi-Fi address.</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              onChangeText={setApiDraft}
              placeholder="http://192.168.1.20:3000"
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={apiDraft}
            />
            <Button
              onPress={() => {
                onSaveApiBase(apiDraft).then(
                  () => Alert.alert('Saved', 'The app now uses this server.'),
                  (e: Error) => Alert.alert('Not saved', e.message),
                );
              }}
              variant="secondary"
            >
              Save address
            </Button>
          </View>
        </>
      )}

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
  mono: {
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 12,
    marginTop: 6,
  },
  input: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 14,
    marginVertical: 12,
  },
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
