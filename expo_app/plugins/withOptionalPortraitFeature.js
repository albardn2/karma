const { withAndroidManifest } = require('@expo/config-plugins');

const PORTRAIT_FEATURE = 'android.hardware.screen.portrait';

/**
 * A portrait-locked activity makes the Android build tools imply a *required*
 * `android.hardware.screen.portrait` feature, which Google Play uses to hide
 * the app from tablets, desktops and XR devices. Declaring the feature
 * explicitly as not required overrides the implied one; the app still runs
 * portrait-locked wherever it is installed.
 */
function declareFeatureOptional(manifest, featureName) {
  const root = manifest.manifest;
  const features = root['uses-feature'] ?? [];
  const others = features.filter((feature) => feature.$['android:name'] !== featureName);
  root['uses-feature'] = [
    ...others,
    { $: { 'android:name': featureName, 'android:required': 'false' } },
  ];
  return manifest;
}

const withOptionalPortraitFeature = (config) =>
  withAndroidManifest(config, (modConfig) => {
    modConfig.modResults = declareFeatureOptional(modConfig.modResults, PORTRAIT_FEATURE);
    return modConfig;
  });

module.exports = withOptionalPortraitFeature;
module.exports.declareFeatureOptional = declareFeatureOptional;
module.exports.PORTRAIT_FEATURE = PORTRAIT_FEATURE;
