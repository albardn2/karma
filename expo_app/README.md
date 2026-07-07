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
