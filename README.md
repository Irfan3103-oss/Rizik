# Rizik — Community Surplus Food Rescue Platform

> **"রিজিক কখনো ভুল ঠিকানায় পৌঁছায় না, যার জন্য যতটুকু বরাদ্দ, সে ততটুকুই পায়।"**

A high-performance, mobile-first Progressive Web App (PWA) and full-stack web application for community food surplus rescue across Dhaka, Bangladesh. Features bilingual English & Bangla (`EN` / `বাংলা`) interface, real-time 1-to-1 Messenger, zero-PII user directory, Flash Rescue countdowns, QR code pickup handovers, volunteer hubs, charity donations, and verified impact ledgers.

---

## 1. Reviewer Preview & Ready Demo Accounts

For instant reviewer preview on the web version, a **"Try the demo"** 1-click option is available directly on the login screen. Alternatively, you can log in manually using the following test credentials:

| Account Type | Email / Username | Password | Profile Details & Access Scope |
|---|---|---|---|
| **Demo Normal User** | `demo.user@rizik.org` | `password123` | Nadia Rahman · Dhanmondi. Can claim surplus food, message partner restaurants, share wedding pickups, and log volunteer hours. |
| **Demo Restaurant Owner** | `demo.restaurant@rizik.org` | `password123` | Arif Chowdhury · Saffron Kitchen, Dhanmondi. Can post food batches, set Flash Rescue discounts, coordinate customer pickups, and chat with community members. |

> **Security & Privacy Guarantee**:
> - Neither demo account has admin privileges (`admin: false`).
> - Demo accounts can never access the `/admin` portal, review restaurant trade licenses, or access other users' private PII (such as phone numbers, emails, or personal addresses).
> - All sensitive Firestore documents are protected by server-side rules.

---

## Setup guide

This section is for someone who has never seen the project. It covers running locally, hosting the server so the Android app works without your laptop, and building the APK.

**How the pieces fit together.** `server.ts` is a single Node process that serves the website, the REST API (`/api/...`), and the WebSocket (`/ws`). It stores its data in a SQLite file. The Android app in `flutter_app/` talks to that server. Separately, Google and email sign-ins use Firebase directly (see *Known limitations*). If the server runs only on your laptop, the APK stops working when the laptop is off. Host the server (step 4) and build the APK against the hosted URL (step 5) to fix that.

### 1. Requirements

- **Node.js 22.5 or newer** (the server uses the built-in `node:sqlite`) and npm. `.node-version` pins 22.
- For the Android app: the **Flutter SDK** (stable) and the **Android SDK** (Android Studio installs it). Check with `flutter doctor`.

### 2. Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. One process serves the website, API, and WebSocket. On first run the SQLite database (`aharforall.db`) is created and seeded with demo data automatically, so the demo accounts above work right away. To start over, stop the server and delete `aharforall.db*`.

Production mode locally (same thing the host runs):

```bash
npm run build
npm start          # serves dist/ on PORT (default 3000)
```

### 3. Environment variables

Copy `.env.example` to `.env` for local use. On a host, set them in its dashboard. Everything is optional.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Port to listen on. Hosts set this automatically. |
| `DATA_DIR` | current directory | Folder for the SQLite DB (`aharforall.db`) and `uploads/`. Point it at a persistent disk when hosted. Created if missing. |
| `DEMO_MODE` | off | `true` re-activates the seeded demo food whenever no listing is active (checked every 30 s), so a long-running demo never runs out of food. |
| `EXPOSE_DEV_OTP` | off | `true` returns OTP / password-reset codes in the API response (shown in the UI as a "demo code"). **Only for demos:** anyone who knows an account's email/phone can then log in as it or reset its password. With it off, OTP login and "forgot password" can't be completed because there is no SMS/email sender. Email + password logins are not affected. |
| `GEMINI_API_KEY` | none | Enables Gemini message translation. Without it, translation is unavailable. |
| `VITE_FIREBASE_*` | `firebase-applet-config.json` | Firebase web config for the website. Read at **build time** (`npm run build`). If unset, the values in `firebase-applet-config.json` are used. |

### 4. Deploy the server

Push the repo to GitHub first (a private repo is fine). Hosts deploy from there.

**Render (free tier):**

1. <https://render.com> → **New** → **Web Service** → connect your GitHub repo.
2. Runtime **Node**. Build command: `npm install && npm run build`. Start command: `npm start`.
3. Instance type **Free**. Environment variables: `DEMO_MODE=true`, and optionally `EXPOSE_DEV_OTP=true` (read the warning above) and `GEMINI_API_KEY`. Don't set `NODE_ENV` yourself: `npm start` sets it, and setting it during the build would skip the build tools.
4. Deploy. Your URL is `https://<service-name>.onrender.com`. Opening it should show the website, and the demo accounts should log in.

Free-tier caveats:
- The service **sleeps after about 15 minutes idle**. The next request wakes it, which can take up to a minute. Open the URL in a browser before a demo.
- There's **no persistent disk**, so the SQLite DB and uploads are wiped on every restart and deploy. The server re-seeds the demo data on startup, so demos keep working, but real sign-ups, claims, and chats made on the Express side are lost. A paid instance with a persistent disk fixes both: attach a disk (e.g. at `/var/data`) and set `DATA_DIR=/var/data`.

**Railway (about $5/month in usage credit; persistent and always on):**

1. <https://railway.app> → **New Project** → **Deploy from GitHub repo**. If `package.json` isn't at the repo root, set the service's **Root Directory**.
2. Settings: Build command `npm install && npm run build`, Start command `npm start`.
3. Add a **Volume** mounted at `/data`, and set `DATA_DIR=/data` (plus `DEMO_MODE`, `EXPOSE_DEV_OTP`, `GEMINI_API_KEY` as above).
4. **Networking → Generate Domain**. That `https://….up.railway.app` URL is your server URL.

**Not Vercel/Netlify/Firebase Hosting:** they host static files or serverless functions, which can't hold the WebSocket or keep the SQLite file. They can serve the website, but the API and demo accounts won't work there.

**Firebase:** add the hosted domain (e.g. `your-app.onrender.com`) under Firebase Console → Authentication → Settings → **Authorized domains**, or Google sign-in fails on the website.

### 5. Build the Android APK

```bash
cd flutter_app
flutter pub get
flutter build apk --release --dart-define=API_BASE_URL=https://<your-host-domain>
```

The APK is written to `flutter_app/build/app/outputs/flutter-apk/app-release.apk`. Copy it to a phone and install it (allow "install unknown apps").

- `API_BASE_URL` is **baked in at build time**. Rebuild the APK if your server URL changes. Use the plain origin, with no trailing slash and no `/api`.
- Emulator against a local server: `flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000` (debug build; `10.0.2.2` is the emulator's alias for your computer).
- The APK reconnects its live-update socket automatically after drops, for example while a Render free instance wakes up.

### 6. Firebase setup (only needed for Google / email sign-in)

The demo accounts and phone/OTP accounts go through the server and don't need any of this.

1. **Register the Android app** in Firebase Console (project `ahar-for-all-58560`) → Project settings → *Add app* → Android, package name `com.example.rizik`. Download `google-services.json` into `flutter_app/android/app/`. Then update the `android` entry in `flutter_app/lib/firebase_options.dart` with the new `…:android:…` appId. Running `flutterfire configure` inside `flutter_app/` does both steps. Right now the Android entry reuses the **web** appId, so Google/email sign-in won't work in the APK until this is done.
2. **Google Sign-In on Android** also needs the signing key's SHA-1. Get it with `cd flutter_app/android && ./gradlew signingReport` and add it under the Android app in Project settings.
3. **Authorized domains:** add your hosted domain (see step 4).
4. **Publish rules and indexes:** `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `database.rules.json`. See *Publishing Security Rules & Composite Indexes* below.
5. **Make an admin:** see *Setting Your Own Account as Admin* below.

### 7. Known limitations

- **Two backends.** Demo, phone/OTP, and server email+password accounts live in the server's SQLite DB. Google and Firebase email sign-ins live in Firebase. They don't share data. In practice:
  - Seeded demo food is in SQLite. Google/email users can claim it (the app falls back to the server), but their own listings, chats, rooms, and notifications live in Firestore and aren't visible to demo accounts, and vice versa.
  - **Voice/video calls between two Google/email users don't connect.** The server only relays call signals for SQLite conversations.
- **Donations are simulated.** There's no real payment gateway.
- **There's no real SMS/email sender for OTP.** See `EXPOSE_DEV_OTP` above.
- **On the Render free tier,** the server sleeps and resets its data (see step 4).

---

## 2. Web Deployment Guide (Share with Reviewers)

> **Note:** the options below host only the **website**. The API, WebSocket, and demo accounts need the Node server running somewhere. See *Setup guide → Deploy the server*.

### Option A: Firebase Hosting (Recommended)

1. **Install Firebase CLI** (if not already installed):
   ```bash
   npm install -g firebase-tools
   ```
2. **Log in to Firebase**:
   ```bash
   firebase login
   ```
3. **Initialize Hosting** (if deploying from scratch):
   ```bash
   firebase init hosting
   ```
   - Select your existing Firebase project (`ahar-for-all-58560` or your own project ID).
   - What do you want to use as your public directory? Enter `dist`.
   - Configure as a single-page app (rewrite all urls to /index.html)? Enter `Yes`.
   - Set up automatic builds and deploys with GitHub? Enter `No` (or as preferred).
4. **Build the Production Bundle**:
   ```bash
   npm run build
   ```
5. **Deploy to Firebase Hosting**:
   ```bash
   firebase deploy --only hosting
   ```
   *(Or deploy rules and hosting together: `firebase deploy`)*

---

### Option B: Alternative Hosting (Vercel or Netlify)

- **Vercel**:
  1. Install Vercel CLI: `npm install -g vercel`
  2. Run `vercel` in the project root.
  3. Settings:
     - Framework Preset: `Vite`
     - Build Command: `npm run build`
     - Output Directory: `dist`
  4. Set environment variables in Vercel project settings: copy all `VITE_FIREBASE_*` values from `.env.example`.

- **Netlify**:
  1. Install Netlify CLI: `npm install -g netlify-cli`
  2. Build: `npm run build`
  3. Deploy: `netlify deploy --prod --dir=dist`
  4. Ensure a `dist/_redirects` file with `/*  /index.html  200` is present for SPA routing.

---

### 3. Critical Pre-Sharing Checklist (Security & Domain Authorization)

Before sharing your deployed link with public reviewers:

1. **Add your new domain to Firebase Authentication Authorized Domains**:
   - Open [Firebase Console](https://console.firebase.google.com/) → Select your project.
   - Navigate to **Authentication** → **Settings** tab → **Authorized domains**.
   - Click **Add domain** and enter your production URL (e.g. `your-app.web.app`, `your-app.firebaseapp.com`, `your-app.vercel.app`).
   - *Without this step, Google Sign-In and email auth will be rejected on the new domain.*

2. **Restrict API Keys by HTTP Referrer in Google Cloud Console**:
   - Open [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials).
   - Select your Firebase Web API Key.
   - Under **Set application restrictions**, choose **Websites (HTTP referrers)**.
   - Add your authorized referrers:
     - `https://your-app.web.app/*`
     - `https://your-app.firebaseapp.com/*`
     - `https://ais-*.run.app/*` (AI Studio preview environment)
     - `http://localhost:*/*` (local development)
   - Click **Save**.

3. **Check Firestore and Storage Security Rules**:
   - Confirm that the hardened rules in `firestore.rules` and `storage.rules` are active in your Firebase project.
   - Never use `allow read, write: if true;` in production.

---

## 4. Setting Your Own Account as Admin in the Firebase Console

Admin privileges are **never** stored, selectable, or decided in client signup forms or client code. Access to `/admin`, restaurant approval/rejection, all restaurant owner applications, and admin notifications is gated exclusively by **Firebase Custom Claims (`admin: true`)** or the server-locked **`/admins/{uid}` Firestore collection** (`allow write: if false;`).

### Recommended: One-Time Manual Setup in Firebase Console (`/admins` collection)

1. Sign up and log in once in **Rizik** using the account you want to make admin, and make sure your email address is verified.
2. Open the [Firebase Console](https://console.firebase.google.com/) and select project **`ahar-for-all-58560`**.
3. Go to **Authentication → Users**, locate your email address, and copy your **User UID**.
4. Go to **Firestore Database** and open the database configured for this app (`ai-studio-nourishloop-73bca805-3fbc-4853-bf13-b6677e5fc115`).
5. Click **Start collection** (or open existing **`admins`** collection):
   - **Collection ID**: `admins`
   - **Document ID**: paste your exact **User UID**
   - Add fields:
     - `role` (`string`): `"admin"`
     - `enabled` (`boolean`): `true`
6. Click **Save** and reload the app. The **Admin** tab, real-time notifications, Restaurant Applications review dashboard, and owner inbox conversations will unlock immediately for your account only.

### Alternative: Setting the `admin: true` Custom Claim via Firebase Admin SDK

If you prefer Firebase Auth Custom Claims using Node.js with a service account:

```js
import admin from 'firebase-admin';

admin.initializeApp();
await admin.auth().setCustomUserClaims('YOUR_USER_UID', { admin: true });
```

After running this script, sign out and sign back in inside the app so your Firebase ID token refreshes with `{ admin: true }`.

---

## 2. Firestore Security Rules (`firestore.rules`)

The source of truth is [`firestore.rules`](firestore.rules) in this repo. Publish it as described in *Publishing Security Rules & Composite Indexes* below, on database `ai-studio-nourishloop-73bca805-3fbc-4853-bf13-b6677e5fc115`. (An older copy used to be pasted here; it was out of date.)

---

## 2B. Realtime Database Presence Rules (`database.rules.json`)

Paste the JSON ruleset below into **Firebase Console → Realtime Database → Rules** and click **Publish**:

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "presence": {
      ".read": "auth != null && auth.token.email_verified == true",
      "$uid": {
        ".write": "auth != null && auth.token.email_verified == true && auth.uid == $uid",
        ".validate": "newData.hasChildren(['online', 'lastSeen']) && newData.child('online').isBoolean() && newData.child('lastSeen').isNumber()"
      }
    },
    "typing": {
      "$conversationId": {
        "$uid": {
          ".read": "auth != null && auth.token.email_verified == true",
          ".write": "auth != null && auth.token.email_verified == true && auth.uid == $uid",
          ".validate": "newData.isBoolean()"
        }
      }
    }
  }
}
```

---

## 2C. Cloud Storage Rules (`storage.rules`)

Paste into **Firebase Console → Storage → Rules** if storing chat media uploads in Firebase Storage:

```javascript
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    // Deny everything by default
    match /{allPaths=**} {
      allow read, write: if false;
    }

    function isSignedInVerified() {
      return request.auth != null && request.auth.token.email_verified == true;
    }

    function isAllowedChatMediaType() {
      return request.resource.contentType.matches('image/(jpeg|png|webp|gif)')
        || request.resource.contentType.matches('audio/(webm|ogg|mp4|mpeg)')
        || request.resource.contentType in [
          'application/pdf',
          'text/plain',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];
    }

    // Profile & Restaurant photos (max 5 MB, images only)
    match /users/{userId}/profile/{fileName} {
      allow read: if isSignedInVerified();
      allow write: if isSignedInVerified()
        && request.auth.uid == userId
        && request.resource != null
        && request.resource.size <= 5 * 1024 * 1024
        && request.resource.contentType.matches('image/(jpeg|png|webp)');
      allow delete: if isSignedInVerified() && request.auth.uid == userId;
    }

    // Chat media attachments (max 15 MB, restricted MIME types, sender-owned upload path)
    match /chatMedia/{conversationId}/{senderId}/{fileName} {
      allow read: if isSignedInVerified();
      allow write: if isSignedInVerified()
        && request.auth.uid == senderId
        && request.resource != null
        && request.resource.size > 0
        && request.resource.size <= 15 * 1024 * 1024
        && isAllowedChatMediaType();
      allow delete: if isSignedInVerified() && request.auth.uid == senderId;
    }
  }
}
```

---

## 3. Required Firestore Composite Indexes

Defined in `firestore.indexes.json`. Create these in **Firebase Console → Firestore Database → Indexes** (or deploy via `firebase deploy --only firestore:indexes`):

| Collection | Fields Indexed | Query Scope |
|---|---|---|
| `users` | `role` (Ascending), `createdAt` (Descending) | Collection |
| `users` | `role` (Ascending), `restaurant.verificationStatus` (Ascending), `createdAt` (Descending) | Collection |
| `userDirectory` | `discoverable` (Ascending), `lastSeen` (Descending) | Collection |
| `userDirectory` | `discoverable` (Ascending), `role` (Ascending), `lastSeen` (Descending) | Collection |
| `userDirectory` | `discoverable` (Ascending), `online` (Ascending), `lastSeen` (Descending) | Collection |
| `conversations` | `participants` (Arrays / Contains), `lastMessageAt` (Descending) | Collection |
| `messages` | `participants` (Arrays / Contains), `createdAt` (Descending) | Collection |
| `notifications` | `recipientUid` (Ascending), `createdAt` (Descending) | Collection |
| `notifications` | `recipientUid` (Ascending), `read` (Ascending), `createdAt` (Descending) | Collection |
| `adminNotifications` | `read` (Ascending), `createdAt` (Descending) | Collection |
| `adminConversations` | `verificationStatus` (Ascending), `lastMessageAt` (Descending) | Collection |
| `listings` | `status` (Ascending), `createdAt` (Descending) | Collection |
| `listings` | `donorId` (Ascending), `createdAt` (Descending) | Collection |

---

## 4. Testing Rules in Firebase Console Rules Playground

1. **Firestore Rules**: Open **Firebase Console → Firestore Database → Rules → Rules Playground**, choose **Get / Create / List** on paths like `/userDirectory/{uid}`, `/conversations/direct_{uidA}_{uidB}`, `/rooms/{roomId}/messages/{messageId}`, or `/users/{uid}/notifications/{id}`, toggle **Authenticated** with `email_verified: true`, and verify that unauthenticated reads, PII writes to `userDirectory`, or messages between blocked UIDs are denied.
2. **Realtime Database Rules**: Open **Realtime Database → Rules → Rules Playground**, simulate a verified user writing `{ "online": true, "lastSeen": 1700000000 }` to `/presence/{uid}` (allowed for matching `auth.uid`, denied for another UID or unverified email).

---

## 5. Demo Personas, Rizik Community Rooms & Multi-User Chat Testing

### 5A. Admin-Only Demo Data Seeding (`Seed demo data` / `Remove all demo data`)

1. Sign in as an Admin account (see Section 4) and open the **Admin** tab (`/admin`).
2. In the **Demo Accounts & Rizik Community Rooms** card:
   - Click **Seed demo data** once to idempotently populate:
     - **14 Bangladeshi sample personas** (`isDemo: true`) in `userDirectory/{personaId}` (7 partner kitchens/bakeries/sweet shops/tea stalls/caterers, 3 volunteers, 2 community recipients, 1 NGO children's shelter, and 1 community organizer).
     - **3 pinned Community Rooms** (`room_rizik_community`, `room_restaurant_corner`, `room_volunteers`) with realistic bilingual-context starter discussions.
   - Click **Remove all demo data** → **Confirm remove** at any time to remove all `isDemo: true` profiles and seeded room messages while preserving real user room messages.
3. **Isolated Client-Side Demo Auto-Replies**:
   - Every 1-to-1 chat with a demo persona (or starter **Rizik Team** thread) is stored strictly inside the signed-in user's private subcollections (`users/{uid}/demoConversations` and `users/{uid}/demoMessages`).
   - Replies are generated client-side after a 1–3 second simulated typing indicator and marked **"Auto-reply (demo)"**. Demo messages never alter real user metrics, food rescue stats, donor ratings, or real user notifications. *(If desired later, a Firebase Cloud Function `onDocumentCreated` trigger on `users/{uid}/demoMessages` can replace or extend the client-side auto-responder without schema changes.)*

### 5B. Testing Real-Time Multi-User Chat Across Two Browsers

1. Create **3 test accounts** in **Firebase Console → Authentication → Users → Add user** (ensure their emails are verified, or use real/secondary test inboxes with verification links):
   - **Normal User**: `test.neighbor@example.com` (role: `user` on signup)
   - **Restaurant Owner**: `test.kitchen@example.com` (sign up via **Restaurant Owner** and approve in `/admin`)
   - **Volunteer**: `test.volunteer@example.com` (role: `user` on signup)
2. Open **two browser sessions** side by side (e.g., Chrome standard window + Chrome Incognito window).
3. Sign in with Account A in Window 1 and Account B in Window 2.
4. Click **Inbox** → **New chat / Find people** (or tap any member inside **Rizik Community**), select the other account, and send text, photos, locations, voice notes, or reactions:
   - Messages, online/last-seen presence, typing indicators, and delivered/read receipts sync in real time over Firestore (`conversations/direct_{sortedUidA}_{sortedUidB}`) and Community Rooms (`rooms/{roomId}/messages`).
5. **Before Public Launch**: Delete any temporary test users created for QA in **Firebase Console → Authentication → Users** (along with their test `users/{uid}` and `userDirectory/{uid}` documents) so only real accounts and intentionally seeded demo personas remain.

---

## 6. Publishing Security Rules & Composite Indexes (`firestore.rules`, `firestore.indexes.json`, `storage.rules`, `database.rules.json`)

### Option A: Publish via Firebase CLI (Recommended)

```bash
# Deploy Firestore rules & composite indexes together
firebase deploy --only firestore:rules,firestore:indexes --project ahar-for-all-58560

# Deploy Cloud Storage and Realtime Database presence rules
firebase deploy --only storage,database --project ahar-for-all-58560
```

*(Note: If you use a named Firestore database (`ai-studio-nourishloop-73bca805-3fbc-4853-bf13-b6677e5fc115`), configure it in `firebase.json` under `"firestore": { "database": "ai-studio-nourishloop-73bca805-3fbc-4853-bf13-b6677e5fc115", "rules": "firestore.rules", "indexes": "firestore.indexes.json" }` before running `firebase deploy`.)*

### Option B: Paste Directly in Firebase Console

1. **Firestore Rules**: Open **Firebase Console → Firestore Database → Rules**, select your database (`ai-studio-nourishloop-73bca805-3fbc-4853-bf13-b6677e5fc115`), paste the full contents of `firestore.rules`, and click **Publish**.
2. **Firestore Indexes**: Open **Firebase Console → Firestore Database → Indexes → Composite**, create the indexes defined in `firestore.indexes.json` (or click the direct index creation link surfaced inside **Admin → Chat & Data Health Check**).
3. **Storage Rules**: Open **Firebase Console → Storage → Rules**, paste `storage.rules`, and click **Publish**.
4. **Realtime Database Rules**: Open **Firebase Console → Realtime Database → Rules**, paste `database.rules.json`, and click **Publish**.
