# Rizik — Flutter / Dart Project (`flutter_app`)

> **"রিজিক কখনো ভুল ঠিকানায় পৌঁছায় না, যার জন্য যতটুকু বরাদ্দ, সে ততটুকুই পায়।"**

This directory contains the complete `.dart` Flutter implementation of **Rizik** mirroring the web application's features, models, themes, bilingual EN/BN localization, Express API + WebSocket integration, and Firebase Auth + Firestore (`ai-studio-nourishloop-73bca805-3fbc-4853-bf13-b6677e5fc115`) integration.

## Included Feature Modules

- **1-to-1 Real-Time Messenger (`lib/services/messenger_service.dart`, `lib/screens/chat_screen.dart`)**:
  - Deterministic `direct_<uidA>_<uidB>` conversation IDs via Firestore `onSnapshot` streams.
  - Paginated message loading, Sent/Delivered/Read receipts, typing indicators, 60s presence heartbeat (`userDirectory`), date separators, optimistic sending + `SharedPreferences` offline queue/retry, emoji reactions, replies, forwarding, EN/BN message translation, image/camera/location/note attachments, Mute/Archive/Delete-for-me, and first-login Starter/Demo conversations (`Rizik Team` Official + sample partner kitchens with `Auto-reply (demo)`).
- **Zero-PII People Directory (`lib/widgets/find_people_sheet.dart`)**:
  - Reads `userDirectory` (`All`, `Restaurants`, `People`, `Online now`), shows `@handle` without exposing emails/phones/raw UIDs, and integrates Block & Report controls (`ProfileSettingsScreen` + Chat menu).
- **Notification Center (`lib/services/notification_service.dart`, `lib/screens/app_shell.dart`)**:
  - Bell unread counter, live in-app toast alerts, first-login starter notifications, and real cross-user alerts for messages, claims, flash rescues, and restaurant approvals.
- **Admin <-> Restaurant Owner Verification & Support Chat (`lib/services/admin_chat_service.dart`, `lib/widgets/admin_chat_sheet.dart`)**:
  - Real-time support threads, approval/rejection workflows with custom reasons, and owner resubmission.

## Running Locally with Flutter SDK

1. Ensure Flutter (`>= 3.24` / Dart `>= 3.4`) is installed locally.
2. From this directory (`flutter_app/`):
   ```bash
   flutter pub get
   ```
3. Configure the backend API base URL if connecting to your hosted or local Node.js server (`server.ts` on port `3000`):
   ```bash
   flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
   ```
   *(Use `http://localhost:3000` on Web/macOS/Linux, `http://10.0.2.2:3000` on Android emulator, or your deployed `https://...` URL on physical devices.)*

4. For mobile Google Sign-In / Firebase setup, add `google-services.json` (`android/app/`) and `GoogleService-Info.plist` (`ios/Runner/`) from the Firebase Console project if running outside web.
