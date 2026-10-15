import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { Brand } from './Brand';

type HeaderProps = {
  title?: string;
  onBack?: () => void;
  onSettings?: () => void;
};

export function Header({ title, onBack, onSettings }: HeaderProps) {
  if (onBack) {
    return (
      <View style={styles.header}>
        <Pressable accessibilityLabel="Go back" onPress={onBack} style={styles.iconButton}>
          <Feather name="arrow-left" size={21} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.trailingSpace} />
      </View>
    );
  }

  return (
    <View style={styles.header}>
      <Brand compact />
      <Pressable
        accessibilityLabel="Open settings"
        onPress={onSettings}
        style={styles.iconButton}
      >
        <Feather name="sliders" size={20} color={colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  iconButton: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  trailingSpace: {
    width: 46,
  },
});
