import { declareFeatureOptional, PORTRAIT_FEATURE } from '../withOptionalPortraitFeature';

const OTHER_FEATURE = 'android.hardware.camera';

type Feature = { $: Record<string, string> };
type Manifest = { manifest: { 'uses-feature'?: Feature[] } };

const portraitEntries = (manifest: Manifest) =>
  (manifest.manifest['uses-feature'] ?? []).filter((f) => f.$['android:name'] === PORTRAIT_FEATURE);

describe('declareFeatureOptional', () => {
  it.each<[string, Feature[] | undefined]>([
    ['no uses-feature entries', undefined],
    ['the feature declared as required', [{ $: { 'android:name': PORTRAIT_FEATURE, 'android:required': 'true' } }]],
    ['the feature declared without a required flag', [{ $: { 'android:name': PORTRAIT_FEATURE } }]],
  ])('leaves exactly one non-required portrait entry given %s', (_label, features) => {
    const manifest: Manifest = { manifest: features ? { 'uses-feature': features } : {} };

    const portrait = portraitEntries(declareFeatureOptional(manifest, PORTRAIT_FEATURE));

    expect(portrait).toEqual([{ $: { 'android:name': PORTRAIT_FEATURE, 'android:required': 'false' } }]);
  });

  it('keeps unrelated feature declarations untouched', () => {
    const other = { $: { 'android:name': OTHER_FEATURE, 'android:required': 'true' } };
    const manifest: Manifest = { manifest: { 'uses-feature': [other] } };

    const features = declareFeatureOptional(manifest, PORTRAIT_FEATURE).manifest['uses-feature'];

    expect(features).toContainEqual(other);
  });
});
