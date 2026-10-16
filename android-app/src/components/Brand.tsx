import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.brand}>
      <Image source={require('../../assets/brand/icon.png')} style={compact ? styles.compactLogo : styles.logo} />
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
  logo: { width: 36, height: 36, borderRadius: 10 },
  compactLogo: { width: 30, height: 30, borderRadius: 8 },
});
