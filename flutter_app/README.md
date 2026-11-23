# Rizik — Flutter / Dart Project (`flutter_app`)

> **"রিজিক কখনো ভুল ঠিকানায় পৌঁছায় না, যার জন্য যতটুকু বরাদ্দ, সে ততটুকুই পায়।"**

This directory contains the complete `.dart` Flutter implementation of **Rizik** mirroring the web application's features, models, themes, bilingual EN/BN localization, Express API + WebSocket integration, and Firebase Auth + Firestore (`ai-studio-nourishloop-73bca805-3fbc-4853-bf13-b6677e5fc115`) integration.

## Included Feature Modules

- **1-to-1 Real-Time Messenger (`lib/services/messenger_service.dart`, `lib/screens/chat_screen.dart`)**:
  - Deterministic `direct_<uidA>_<uidB>` conversation IDs via Firestore `onSnapshot` streams, plus private per-user demo conversations (`users/{uid}/demoConversations` + `users/{uid}/demoMessages`) with realistic `Auto-reply (demo)` responses.
  - Paginated message loading, Sent/Delivered/Read receipts, typing indicators, 60s presence heartbeat (`userDirectory`), date separators, optimistic sending + `SharedPreferences` offline queue/retry, emoji reactions, replies, forwarding, EN/BN message translation, image/camera/location/note attachments, Mute/Archive/Delete-for-me, and Suggested Chats.
- **Public Community Rooms (`lib/services/community_rooms_service.dart`, `lib/screens/community_room_screen.dart`)**:
  - Real-time neighborhood rooms (`room_rizik_community`, `room_restaurant_corner`, `room_volunteers`) pinned in Inbox, live member directory (tap any member to start a direct chat), emoji reactions, replies, reporting, and admin moderation.
- **Zero-PII People Directory (`lib/widgets/find_people_sheet.dart`)**:
  - Reads `userDirectory` (`All`, `Restaurants`, `Volunteers & NGOs`, `People`, `Online now`), shows `@handle` without exposing emails/phones/raw UIDs, includes a default-ON **"Include demo accounts"** toggle + top **Demo Accounts** section, and integrates Block & Report controls.
- **Account Self-Repair & Health Diagnostics (`lib/services/ensure_account_service.dart`, `lib/services/health_check_service.dart`, `lib/widgets/health_check_sheet.dart`)**:
  - Automatically backfills legacy profiles, `userDirectory`, starter welcome notifications, Rizik Team welcome chat, and community room membership on every login, with a manual **"Repair my account"** button in Settings and interactive **Chat & Data Health Check** for both users and admins.
- **Notification Center (`lib/services/notification_service.dart`, `lib/screens/app_shell.dart`)**:
  - Bell unread counter, live in-app toast alerts, first-login starter notifications, visible error banners on Firestore failures, and real cross-user alerts for messages, claims, flash rescues, and restaurant approvals.
- **Admin Tools & Verification Queue (`lib/screens/auth_and_settings_screens.dart`)**:
  - One-click **Seed / Repair Demo Data** (14 demo personas, 3 community rooms, 23 seeded messages with read-back verification) & **Clean Demo Data**, Admin **Chat & Data Health Check** (including composite index probe + write/read-back/delete test), and restaurant owner verification queue.

## Running in Flutter Android Studio

1. Ensure Flutter (`>= 3.24` / Dart `>= 3.4`) and Android Studio (with Android SDK & Emulator) are installed.
2. Open the `/flutter_app` folder in Android Studio. If Android platform scaffolding isn't generated yet in your clone, generate it in `flutter_app/`:
   ```bash
   flutter create . --platforms=android
   ```
3. In `android/app/build.gradle` (or `build.gradle.kts`), ensure `minSdk` is at least `23` (required by `firebase_auth` & `mobile_scanner`).
4. Download `google-services.json` from Firebase Console project `ahar-for-all-58560` and place it in `android/app/google-services.json`. (`lib/firebase_options.dart` already includes `databaseURL` and `firestoreDatabaseId`.)
5. Install Dart dependencies and verify static analysis:
   ```bash
   flutter pub get
   flutter analyze
   ```
6. Run on an Android Emulator from Android Studio (or CLI) pointing to your Express backend (`server.ts` on port `3000`):
   ```bash
   flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
   ```
   *(Use `http://localhost:3000` on Web/macOS/Linux, `http://10.0.2.2:3000` on Android emulator, or your deployed `https://...` URL on physical devices.)*

