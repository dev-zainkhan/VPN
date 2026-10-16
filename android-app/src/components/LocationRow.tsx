import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import type { Location } from '../types';

type LocationRowProps = {
  location: Location;
  selected: boolean;
  onPress: () => void;
};

export function LocationRow({ location, selected, onPress }: LocationRowProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, selected && styles.selectedRow, pressed && styles.pressed]}
    >
      <View style={styles.countryCode}>
        <Text style={styles.codeText}>{location.code}</Text>
      </View>
      <View style={styles.locationText}>
        <Text style={styles.country}>{location.country}</Text>
        {location.city !== location.country && <Text style={styles.city}>{location.city}</Text>}
      </View>
      <Text style={[styles.latency, location.ping !== null && location.ping >= 90 && styles.slowerLatency]}>
        {location.ping === null ? '— ms' : `${location.ping} ms`}
      </Text>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected && <View style={styles.radioDot} />}
      </View>
      <Feather name="chevron-right" size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectedRow: {
    borderColor: colors.accent,
  },
  pressed: {
    opacity: 0.75,
  },
  countryCode: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  locationText: {
    flex: 1,
    gap: 4,
  },
  country: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  city: {
    color: colors.secondary,
    fontSize: 13,
  },
  latency: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  slowerLatency: {
    color: colors.warning,
  },
  radio: {
    width: 19,
    height: 19,
    borderWidth: 1.5,
    borderColor: colors.muted,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.accent,
  },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
});
