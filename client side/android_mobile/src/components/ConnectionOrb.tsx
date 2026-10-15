import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { colors } from '../theme/colors';

type ConnectionOrbProps = {
  connected: boolean;
  connecting: boolean;
  onPress: () => void;
};

export function ConnectionOrb({ connected, connecting, onPress }: ConnectionOrbProps) {
  const { width } = useWindowDimensions();
  const size = Math.min(width * 0.64, 252);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={connecting ? 'Connecting to VPN' : connected ? 'Disconnect VPN' : 'Connect to VPN'}
      disabled={connecting}
      onPress={onPress}
      style={({ pressed }) => [
        styles.outer,
        { width: size + 54, height: size + 54, borderRadius: (size + 54) / 2 },
        connected && styles.outerConnected,
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.middle,
          { width: size + 26, height: size + 26, borderRadius: (size + 26) / 2 },
          connected && styles.middleConnected,
        ]}
      >
        <View
          style={[
            styles.inner,
            { width: size, height: size, borderRadius: size / 2 },
            connected && styles.innerConnected,
          ]}
        >
          {connecting ? (
            <ActivityIndicator size="large" color={colors.accent} />
          ) : (
            <Feather
              name={connected ? 'shield' : 'power'}
              size={58}
              color={connected ? colors.black : colors.text}
            />
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: {
    borderWidth: 1,
    borderColor: '#17372F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerConnected: {
    borderColor: '#1B4035',
  },
  middle: {
    borderWidth: 1,
    borderColor: '#1D4337',
    alignItems: 'center',
    justifyContent: 'center',
  },
  middleConnected: {
    borderColor: '#225342',
  },
  inner: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerConnected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  pressed: {
    opacity: 0.86,
  },
});
