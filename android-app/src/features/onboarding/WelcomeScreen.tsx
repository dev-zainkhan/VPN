import { Feather } from '@expo/vector-icons';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Brand } from '../../components/Brand';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { colors } from '../../theme/colors';

type WelcomeScreenProps = {
  onContinue: () => void;
};

const benefits = [
  { icon: 'user-x' as const, title: 'No sign-up', detail: "Open the app and connect. That's it." },
  { icon: 'eye-off' as const, title: 'No activity logs', detail: 'We never record the sites you visit.' },
  { icon: 'play-circle' as const, title: 'Watch ads, earn time', detail: 'Each short ad adds free VPN minutes.' },
];

export function WelcomeScreen({ onContinue }: WelcomeScreenProps) {
  return (
    <Screen scroll contentStyle={styles.content}>
      <Brand />
      <View style={styles.hero}>
        <View style={styles.heroOrb}>
          <Feather name="shield" size={46} color={colors.accent} />
        </View>
        <Text style={styles.headline}>Private internet,{'\n'}free with a few ads.</Text>
        <Text style={styles.subheadline}>
          Connect in one tap. Watch a short ad whenever you need more time.
        </Text>
      </View>

      <View style={styles.benefits}>
        {benefits.map((benefit) => (
          <View key={benefit.title} style={styles.benefit}>
            <View style={styles.benefitIcon}>
              <Feather name={benefit.icon} size={21} color={colors.accent} />
            </View>
            <View style={styles.benefitCopy}>
              <Text style={styles.benefitTitle}>{benefit.title}</Text>
              <Text style={styles.benefitDetail}>{benefit.detail}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.starter}>
        <Feather name="clock" size={19} color={colors.accent} />
        <Text style={styles.starterText}>You start with 60 free minutes</Text>
      </View>

      <View style={styles.footer}>
        <Button onPress={onContinue}>Get started</Button>
        <Text style={styles.legal}>
          On your first connection, Android will ask you to allow a VPN.
          {'\n'}By continuing you agree to the{' '}
          <Text
            accessibilityRole="link"
            onPress={() => Alert.alert('Terms of use', 'Terms will be available when the app is connected to its service.')}
            style={styles.link}
          >
            Terms
          </Text>{' '}
          and{' '}
          <Text
            accessibilityRole="link"
            onPress={() => Alert.alert('Privacy policy', 'Privacy details will be available when the app is connected to its service.')}
            style={styles.link}
          >
            Privacy Policy
          </Text>
          .
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 16,
    gap: 22,
  },
  hero: {
    paddingTop: 4,
  },
  heroOrb: {
    width: 96,
    height: 96,
    alignSelf: 'center',
    borderRadius: 48,
    backgroundColor: colors.accentDark,
    borderWidth: 1,
    borderColor: '#1D483A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  headline: {
    color: colors.text,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  subheadline: {
    marginTop: 14,
    color: colors.secondary,
    fontSize: 16,
    lineHeight: 24,
  },
  benefits: {
    gap: 16,
  },
  benefit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  benefitIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitCopy: {
    flex: 1,
    gap: 3,
  },
  benefitTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  benefitDetail: {
    color: colors.secondary,
    fontSize: 13,
    lineHeight: 19,
  },
  starter: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 16,
    backgroundColor: colors.accentDark,
    borderWidth: 1,
    borderColor: '#20523F',
    paddingHorizontal: 14,
  },
  starterText: {
    color: '#C6F6E2',
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    gap: 14,
  },
  legal: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 18,
    textAlign: 'center',
  },
  link: {
    color: colors.accent,
    textDecorationLine: 'underline',
  },
});
