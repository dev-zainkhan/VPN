import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { Header } from '../../components/Header';
import { Screen } from '../../components/Screen';
import { colors } from '../../theme/colors';

type ConnectionErrorScreenProps = {
  location: string;
  hint?: string | null;
  onBack: () => void;
  onRetry: () => void;
  onChooseLocation: () => void;
  onOpenSettings: () => void;
};

export function ConnectionErrorScreen({
  location,
  hint,
  onBack,
  onRetry,
  onChooseLocation,
  onOpenSettings,
}: ConnectionErrorScreenProps) {
  return (
    <Screen contentStyle={styles.content}>
      <Header title="Connection issue" onBack={onBack} />
      <View style={styles.main}>
        <View style={styles.errorOrb}>
          <Feather name="wifi-off" size={38} color={colors.secondary} />
        </View>
        <Text style={styles.title}>Can't reach this location</Text>
        <Text style={styles.description}>
          {hint ?? `${location} isn't responding right now. Try again, or pick another location.`}
        </Text>
        <Button onPress={onOpenSettings} variant="secondary">
          On mobile data or office Wi-Fi? Try TCP in Settings
        </Button>
      </View>
      <View style={styles.actions}>
        <Button onPress={onRetry}>Try again</Button>
        <Button onPress={onChooseLocation} variant="secondary">
          Choose another location
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  main: {
    alignItems: 'center',
    gap: 19,
  },
  errorOrb: {
    width: 136,
    height: 136,
    borderRadius: 68,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    marginBottom: 9,
  },
  title: {
    color: colors.text,
    textAlign: 'center',
    fontSize: 27,
    lineHeight: 34,
    fontWeight: '800',
  },
  description: {
    color: colors.secondary,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 8,
  },
  actions: {
    gap: 11,
  },
});
