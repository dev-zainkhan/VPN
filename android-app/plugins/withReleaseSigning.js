// Signs release builds with the Google Play upload key when CI provides it:
//   RAAZ_UPLOAD_STORE_FILE, RAAZ_UPLOAD_STORE_PASSWORD, RAAZ_UPLOAD_KEY_ALIAS, RAAZ_UPLOAD_KEY_PASSWORD
// Without them (test APKs) the release build keeps the standard debug key.
const { withAppBuildGradle } = require('expo/config-plugins');

const RELEASE_CONFIG = `
        release {
            if (System.getenv('RAAZ_UPLOAD_STORE_FILE')) {
                storeFile file(System.getenv('RAAZ_UPLOAD_STORE_FILE'))
                storePassword System.getenv('RAAZ_UPLOAD_STORE_PASSWORD')
                keyAlias System.getenv('RAAZ_UPLOAD_KEY_ALIAS')
                keyPassword System.getenv('RAAZ_UPLOAD_KEY_PASSWORD')
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (!gradle.includes("System.getenv('RAAZ_UPLOAD_STORE_FILE')")) {
      gradle = gradle.replace(/signingConfigs\s*\{/, (m) => m + RELEASE_CONFIG);
      // In buildTypes { release { ... signingConfig signingConfigs.debug ... } } use the upload key when present.
      const start = gradle.indexOf('buildTypes');
      const releaseAt = gradle.indexOf('release {', start);
      const debugSigning = 'signingConfig signingConfigs.debug';
      const at = gradle.indexOf(debugSigning, releaseAt);
      if (start === -1 || releaseAt === -1 || at === -1) throw new Error('withReleaseSigning: app/build.gradle layout not recognised');
      gradle =
        gradle.slice(0, at) +
        "signingConfig System.getenv('RAAZ_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug" +
        gradle.slice(at + debugSigning.length);
    }
    cfg.modResults.contents = gradle;
    return cfg;
  });
};
