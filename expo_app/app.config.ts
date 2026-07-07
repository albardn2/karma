import { ExpoConfig, ConfigContext } from "expo/config";

// Extends app.json with values that must not live in the repo or that vary
// per environment.
// - GOOGLE_MAPS_API_KEY: .env locally (gitignored), EAS env var for builds.
// - API_BASE_URL: which backend the build talks to. eas.json sets it per
//   profile (dev/preview -> api-dev, production -> api-prod); .env overrides
//   for local `expo start`. Falls back to prod so a store build can never
//   silently point at the wrong backend.
export default ({ config }: ConfigContext): ExpoConfig =>
  ({
    ...config,
    extra: {
      ...config.extra,
      apiBaseUrl: process.env.API_BASE_URL ?? "https://api-prod.karma-grp.com",
    },
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
