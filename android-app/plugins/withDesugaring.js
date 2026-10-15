// The WireGuard tunnel library needs Java library desugaring in the app module.
const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withDesugaring(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (!gradle.includes('coreLibraryDesugaringEnabled')) {
      gradle = gradle.replace(
        /\nandroid\s*\{/,
        '\nandroid {\n    compileOptions {\n        coreLibraryDesugaringEnabled true\n    }',
      );
      gradle = gradle.replace(
        /\ndependencies\s*\{/,
        "\ndependencies {\n    coreLibraryDesugaring 'com.android.tools:desugar_jdk_libs:2.1.5'",
      );
    }
    cfg.modResults.contents = gradle;
    return cfg;
  });
};
