import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { Header } from '../../components/Header';
import { Screen } from '../../components/Screen';
import { colors } from '../../theme/colors';

type OutOfTimeScreenProps = {
  dailyMinutes: number;
  refillIn: string;
  onNotNow: () => void;
};

export function OutOfTimeScreen({ dailyMinutes, refillIn, onNotNow }: OutOfTimeScreenProps) {
  return (
    <Screen contentStyle={styles.content}>
      <Header title="Time is up" onBack={onNotNow} />
      <View style={styles.main}>
        <View style={styles.clockOrb}>
          <Feather name="clock" size={40} color={colors.warning} />
        </View>
        <Text style={styles.title}>Today's free time is used up</Text>
        <Text style={styles.description}>
          Your VPN connection has ended. You get {dailyMinutes} free minutes again in {refillIn}.
        </Text>
        <View style={styles.balancePill}>
          <Text style={styles.balanceText}>Balance 0 min · refills in {refillIn}</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Button onPress={onNotNow}>OK</Button>
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
    gap: 17,
    paddingHorizontal: 7,
  },
  clockOrb: {
    width: 142,
    height: 142,
    borderRadius: 71,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.warning,
    backgroundColor: '#211C11',
    marginBottom: 12,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    textAlign: 'center',
    fontWeight: '800',
  },
  description: {
    color: colors.secondary,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
  },
  balancePill: {
    marginTop: 7,
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  balanceText: {
    color: colors.secondary,
    fontSize: 13,
    fontWeight: '600',
  },
  actions: {
    gap: 10,
  },
  demoNote: {
    color: colors.muted,
    textAlign: 'center',
    fontSize: 11,
  },
});
