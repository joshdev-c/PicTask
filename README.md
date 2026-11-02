<<<<<<< HEAD
# PicTask

Private Android-first document-to-task app for Philippine bills and notices.

## Run locally

1. Copy `.env.example` to `.env` and add a Supabase project URL and anon key.
2. Run `npm start` for a UI preview. Native OCR, biometrics, and notifications require an Android development build rather than Expo Go.
3. Run the SQL in `supabase/migrations/001_initial.sql` in the Supabase SQL editor, then deploy `supabase/functions/delete-account` before testing real accounts.
4. Create an Android development build with the current Expo/EAS documentation. Do not commit `.env` or real document samples.

Without `.env`, the app exposes a clearly marked local preview only. Preview records stay on the device and are not an authentication substitute.

## Privacy checklist before a real-user pilot

- Replace the placeholder app/operator details in the privacy notice.
- Complete a Privacy Impact Assessment and obtain Philippine privacy/legal review.
- Test account deletion, storage deletion, row-level security, backup restoration, and lost-device procedures.
- Use only synthetic or fully redacted bills in development and automated tests.
=======
# PicTask
>>>>>>> b84cbea533a10b0cd0698b1006ae7fac0515363c
