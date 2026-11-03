# PicTask

PicTask is a mobile-first, Android-focused app for turning bills, notices, and manually entered tasks into ordered task plans. It is built with Expo and React Native and is designed around local-first storage, optional Supabase sync, and user-controlled document image retention.

## Features

- Scan a document with the camera or import an image. On-device text recognition suggests the provider, amount, due date, and category; review and edit the details before saving.
- Create plans manually, set task due dates, and reorder their task chains. Only the next incomplete task in a chain is available to complete.
- Track active plans and upcoming tasks on Home, or view tasks by date in Calendar.
- Schedule local reminders before task due dates. The notification badge and modal reflect reminders currently delivered to the device.
- Archive completed plans in Vault. Images are retained only when explicitly selected; retained cloud images are stored in a private Supabase Storage bucket.
- Use light or dark appearance, optional device authentication for Vault, local data export, and account controls from Profile.
- Continue using local records without signing in or syncing. Signed-in data is cached locally and can sync with Supabase when connectivity is available.

## Technology

- Expo SDK 58, React Native 0.88, and TypeScript
- Expo SQLite for local records and queued offline mutations
- Supabase Auth, Postgres with row-level security, private Storage, and an Edge Function for account deletion
- Expo Image Picker and on-device ML Kit text recognition
- Expo Notifications for local reminders

## Requirements

- Node.js and npm
- Android development tooling for native Android builds
- A Supabase project for accounts, cloud sync, and account deletion

Camera, on-device OCR, biometric authentication, and local notifications require a development/native build and are not fully available in Expo Go. OCR is currently supported through the Android development build.

## Local setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. To use Supabase, create a `.env` file in the project root with your project URL and public anon key:

   ```dotenv
   EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
   ```

   Do not put a service-role key in the app or commit `.env`. Without these variables, PicTask opens a local preview; preview data remains on the device.

3. Configure the Supabase backend by running the SQL migrations in order:

   - `supabase/migrations/001_initial.sql`
   - `supabase/migrations/002_owner_integrity.sql`

   Deploy the `supabase/functions/delete-account` Edge Function before testing account deletion. The function uses Supabase-provided environment variables and the service role only on the server.

4. Start the Expo development server:

   ```sh
   npm run start
   ```

   Build/run the native app with:

   ```sh
   npm run android
   ```

   `npm run ios` is also available on supported macOS development systems.

## Available commands

| Command | Description |
| --- | --- |
| `npm run start` | Start the Expo development server |
| `npm run android` | Build and run the Android app |
| `npm run ios` | Build and run the iOS app on macOS |
| `npm run web` | Start the Expo web target |
| `npm run lint` | Run Expo lint |
| `npx tsc --noEmit` | Type-check the TypeScript project |

An internal Android APK build profile is defined in `eas.json` as `preview`.

## Privacy and pilot readiness

Review [PRIVACY_NOTICE.md](./PRIVACY_NOTICE.md) before sharing the app with real users. It is a draft and still contains operator and hosting details that must be completed and reviewed. Use synthetic or fully redacted documents during development. Verify Supabase row-level security, private image access, account deletion, and data restoration procedures before a real-user pilot.
