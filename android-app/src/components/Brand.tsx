import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.brand}>
      <Feather name="shield" size={compact ? 26 : 30} color={colors.accent} />
      <Text style={[styles.name, compact && styles.compactName]}>Raaz</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  name: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  compactName: {
    fontSize: 22,
  },
});
