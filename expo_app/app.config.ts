import { ExpoConfig, ConfigContext } from "expo/config";

// Extends app.json with values that must not live in the repo.
// GOOGLE_MAPS_API_KEY comes from .env locally (gitignored) and from an
// EAS environment variable / secret for cloud builds.
export default ({ config }: ConfigContext): ExpoConfig =>
  ({
    ...config,
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY ?? "",
        },
      },
    },
  }) as ExpoConfig;
