// Build-time settings. CI sets these; local defaults make a test build.
//   VEIL_API_BASE     API address the app talks to (test builds: the dev laptop on the same Wi-Fi)
//   VEIL_TEST_BUILD   "false" for a store build: no plain-http traffic, no API address field
//   VEIL_BUILD_NUMBER Android versionCode, so a newer APK installs over an older one
const testBuild = process.env.VEIL_TEST_BUILD !== 'false';

module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    versionCode: Number(process.env.VEIL_BUILD_NUMBER ?? 1),
  },
  extra: {
    apiBase: process.env.VEIL_API_BASE ?? 'https://13-126-168-194.sslip.io',
    testBuild,
  },
  plugins: [
    'expo-secure-store',
    // A test build talks to the laptop over plain http; a store build only uses https.
    ['expo-build-properties', { android: { usesCleartextTraffic: testBuild } }],
    './plugins/withDesugaring',
    './plugins/withReleaseSigning',
  ],
});
