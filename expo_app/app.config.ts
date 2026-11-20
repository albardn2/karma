import { ExpoConfig, ConfigContext } from "expo/config";

// Extends app.json with values that must not live in the repo or that vary
// per environment.
// - GOOGLE_MAPS_API_KEY: .env locally (gitignored), EAS env var for builds.
// - API_BASE_URL: which backend the build talks to. eas.json sets it per
//   profile (dev/preview -> api-dev, production -> api-prod); .env overrides
//   for local `expo start`. Falls back to prod so a store build can never
//   silently point at the wrong backend.
// - ASSISTANT_URL: the Karma Assistant service. Unset = the assistant is not
//   shown at all (the floating button and its screen are hidden), so builds that
//   don't set it are unchanged.
export default ({ config }: ConfigContext): ExpoConfig =>
  ({
    ...config,
    extra: {
      ...config.extra,
      apiBaseUrl: process.env.API_BASE_URL ?? "https://api-prod.karma-grp.com",
      assistantUrl: process.env.ASSISTANT_URL ?? "",
    },
    plugins: [
      ...(config.plugins ?? []),
      // voice for the assistant: microphone + on-device / OS speech recognition
      [
        "expo-speech-recognition",
        {
          microphonePermission:
            "Karma uses the microphone when you talk to the Karma Assistant.",
          speechRecognitionPermission:
            "Karma turns what you say to the Karma Assistant into text.",
        },
      ],
    ],
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
