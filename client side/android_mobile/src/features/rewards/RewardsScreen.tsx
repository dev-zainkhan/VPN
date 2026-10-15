import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { Header } from '../../components/Header';
import { Screen } from '../../components/Screen';
import { colors } from '../../theme/colors';

type RewardsScreenProps = {
  balance: number;
  adsLeft: number;
  rewarded: boolean;
  onBack: () => void;
  onWatchAd: () => void;
};

export function RewardsScreen({
  balance,
  adsLeft,
  rewarded,
  onBack,
  onWatchAd,
}: RewardsScreenProps) {
  return (
    <Screen contentStyle={styles.content}>
      <Header title="Get more time" onBack={onBack} />
      <View style={styles.main}>
        <View style={styles.clockBadge}>
          <Feather name="clock" size={25} color={colors.accent} />
        </View>
        <Text style={styles.balanceLabel}>YOUR BALANCE</Text>
        <Text style={styles.balance}>{balance} min</Text>
        <View style={styles.rewardCard}>
          <View style={styles.rewardAmount}>
            <Feather name="plus" size={29} color={colors.accent} />
            <Text style={styles.amount}>30 min</Text>
          </View>
          <Text style={styles.rewardDescription}>for watching one short ad</Text>
        </View>
        <View style={styles.limitPill}>
          <Feather name="gift" size={16} color={colors.secondary} />
          <Text style={styles.limitText}>{adsLeft} of 10 ads left today</Text>
        </View>
        {rewarded && (
          <View accessibilityLiveRegion="polite" style={styles.success}>
            <Feather name="check-circle" size={18} color={colors.accent} />
            <Text style={styles.successText}>30 minutes added to your balance.</Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Button disabled={adsLeft === 0} onPress={onWatchAd}>
          {adsLeft === 0 ? 'Daily limit reached' : 'Watch ad'}
        </Button>
        <Text style={styles.disclaimer}>
          Minutes are added after our server confirms the ad. This usually takes a few seconds.
        </Text>
        <Text style={styles.demoNote}>Ad rewards are simulated in this UI preview.</Text>
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
    paddingHorizontal: 8,
  },
  clockBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: '#21513F',
    backgroundColor: colors.accentDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  balanceLabel: {
    color: colors.secondary,
    fontSize: 12,
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  balance: {
    color: colors.text,
    fontSize: 40,
    fontWeight: '800',
    marginTop: 5,
  },
  rewardCard: {
    width: '100%',
    alignItems: 'center',
    marginTop: 28,
    paddingVertical: 23,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rewardAmount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  amount: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
  },
  rewardDescription: {
    color: colors.secondary,
    fontSize: 14,
    marginTop: 5,
  },
  limitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 22,
    backgroundColor: colors.surface,
  },
  limitText: {
    color: colors.secondary,
    fontSize: 13,
    fontWeight: '600',
  },
  success: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
  },
  successText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    gap: 13,
  },
  disclaimer: {
    color: colors.secondary,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
  },
  demoNote: {
    color: colors.muted,
    textAlign: 'center',
    fontSize: 11,
  },
});
