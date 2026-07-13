# Karma Mobile (Expo)

Mobile-first React Native app built with Expo for the Karma ERP: customers,
customer orders, financial accounts, and users. Runs on iOS, Android, and web
with file-based routing via Expo Router, talking to the Flask backend API for
authentication and data.

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

## Project layout

- `app/` — screens (Expo Router file-based routing; `(tabs)/` is the tab navigator)
- `components/` — shared UI components
- `contexts/` — React contexts (auth, etc.)
- `constants/`, `hooks/`, `utils/` — supporting code
- `eas.json` — EAS build profiles

## Maps

- iOS uses Apple Maps (no key needed)
- Android uses Google Maps and needs a Maps API key at build time

## Releases (CI/CD)

Builds run on [EAS](https://expo.dev/eas); two GitHub workflows drive them:

- **`CI – Build Mobile Apps`** (`.github/workflows/build-apps.yml`) — push a
  commit whose message starts with `[build_apps]` (any branch), or run it
  manually from the Actions tab. Builds an iOS store build → TestFlight, an
  Android store build → Play **internal** track (draft), plus directly
  installable ad-hoc iOS / APK Android binaries.
- **`CD – Publish Mobile Apps to Stores`**
  (`.github/workflows/publish-apps.yml`) — manual only. Pick patch/minor/major:
  it bumps `expo.version` in `app.json`, commits the bump, builds both
  platforms, submits to the App Store + Play **production** track, and tags
  the repo `app-v<version>`.

Native build numbers (iOS `buildNumber` / Android `versionCode`) are managed
remotely by EAS (`appVersionSource: remote` + `autoIncrement`) — never edit
them by hand; only `expo.version` in `app.json` matters, and the publish
workflow bumps it for you.

### One-time setup (before the first CI build)

The workflows need the EAS project, store apps, and credentials to exist.
All of this mirrors the shinkleesh repo, so most values can be copied from
its GitHub secrets / Expo account. From `expo_app/`:

1. **Link the EAS project**: `npx eas init` (logged in as the `albardn2`
   Expo account) — writes `extra.eas.projectId` into `app.json`; commit it.
2. **Seed remote versions** so Play/App Store numbering continues from the
   existing installs: `npx eas build:version:set` per platform (Android
   versionCode ≥ 3, since app.json was at 2).
3. **Seed build credentials** by running the first store builds locally and
   interactively (lets EAS generate/manage the iOS distribution cert +
   provisioning profile and the Android keystore):
   `npx eas build --platform ios --profile production` and the same for
   Android. Subsequent CI builds are non-interactive and just reuse these.
4. **Store apps**: register `com.karmagrp.business` in App Store Connect and
   create the app (note its numeric Apple ID → `ASC_APP_ID` secret). Create
   the Play Console app and upload the *first* AAB manually (Play requires
   it); grant the shinkleesh service account access to the app.
5. **EAS env var for Android Maps**: the Google Maps key is read at build
   time by `app.config.ts` — create it on EAS so build workers see it:
   `npx eas env:create --name GOOGLE_MAPS_API_KEY --visibility secret`
   (all environments).
6. **GitHub secrets** on this repo (values identical to shinkleesh's, except
   `ASC_APP_ID` which is karma's own): `EXPO_TOKEN`, `APPLE_API_KEY_ID`,
   `APPLE_API_ISSUER_ID`, `APPLE_API_KEY_P8_BASE64`,
   `GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_BASE64`, `ASC_APP_ID`.
   (`CR_PAT` already exists.)
