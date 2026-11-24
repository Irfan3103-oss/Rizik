# Handoff: Rizik — get the APK working without a laptop (minimal plan)

You are picking up a project that was already reviewed in an earlier session. This file holds what
that session learned and the plan the user chose. Read it fully before touching code. The code was
written by someone else (largely generated in Google AI Studio), so do not assume it follows any
particular style, and do not refactor or "clean up" code outside the listed changes.

## The goal

Today the Android APK only works while the user's laptop runs the backend (`server.ts`). The goal is
an APK that works with the laptop off. The chosen plan is the **smallest change that achieves this**:
host the existing Express + SQLite server, unchanged in design, on a cloud host (Railway
recommended, Render as the free option), fix the bugs that block a working build, and point the APK
at the hosted URL.

**Not** in scope: rewriting the app, merging the two backends, or moving to Firestore/Vercel. Those
are listed at the end as optional future work only. Keep the diff small; that is the point of this
plan (time and tokens).

## Steps (in order)

0. **Safety net.** The folder isn't a git repo. Extend `.gitignore` (add `dist/`, `dev-dist/`,
   `*.db`, `*.db-wal`, `*.db-shm`, `uploads/`, `flutter_app/build/`, `flutter_app/.dart_tool/`;
   keep the existing entries), then `git init` and commit everything as-is. Commit after each step
   below. Don't push or create remotes unless the user asks; they will need a GitHub repo for the
   host to deploy from, so offer to help with that when you reach step 5.
1. Fix the Flutter build (section 3.1).
2. Fix the Android manifest (3.2) and ask the user for the Firebase Android registration (3.3).
3. Make the server deployable (section 4).
4. Close the OTP hole (3.4). Optional small fixes in 3.5 if the user agrees.
5. Write the README setup guide (section 6).
6. Walk the user through deploying (section 5). They create the host account and click deploy;
   don't do it for them.
7. Build the APK against the hosted URL and verify (section 7).

**Stop and ask** before anything that needs the user's accounts (GitHub, Railway/Render, Firebase
console), costs money, or deploys. Report honestly what you could and couldn't test (for example,
if Flutter or the Android SDK isn't installed on this machine).

---

## 1. What the project is (short version)

Rizik is a surplus-food rescue app for Dhaka, Bangladesh. Restaurants post leftover food, nearby
people claim it, and the handover is confirmed with a pickup code or QR scan. It also has 1:1 chat,
WebRTC calls, community rooms, events, volunteer shifts, wedding-leftover pickups, simulated
donations (no real payment gateway), reviews, an impact dashboard, a leaderboard and an admin panel.
Bilingual English/Bangla. It was renamed twice (NourishLoop → AharForAll → Rizik); legacy names in
storage keys and file names are intentional fallbacks, leave them.

| Path                                                      | What it is                                                                                                                                                                                                                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server.ts` (~4.5k lines)                                 | Express API + `/ws` WebSocket + map-tile proxy + Gemini translation. In dev it mounts Vite as middleware; with `NODE_ENV=production` it serves the built `dist/`. One process serves both the API and the website.                                             |
| `server/db.ts` (~3k lines)                                | SQLite via Node's built-in `node:sqlite` (needs **Node ≥ 22.5**). Schema, migrations, demo seed (runs when the DB is empty), `runAutoExpirySweep()`.                                                                                                           |
| `src/`                                                    | React 19 + Vite + Tailwind PWA (the website).                                                                                                                                                                                                                  |
| `flutter_app/`                                            | Android Flutter client. `lib/services/api_service.dart` talks to the Express server at `API_BASE_URL` (a `--dart-define`, default `http://localhost:3000`) and opens a WebSocket at `<API_BASE_URL with ws/wss>/ws`. Other services talk to Firebase directly. |
| `firestore.rules`, `storage.rules`, `database.rules.json` | Firebase rules (the README's pasted copy is stale).                                                                                                                                                                                                            |

### Two backends (important context, not something to fix now)

The app runs **Express + SQLite** and **Firebase** side by side; they don't share data.

- Demo accounts, phone/OTP accounts, and features like events, weddings, donations, shifts,
  leaderboard, impact and home stats → Express + SQLite.
- Google / real-email sign-ins → Firebase Auth, and their listings, claims, chat, rooms, admin
  review and notifications go straight to Firestore (Firebase is already hosted by Google, so that
  half already works without the laptop).
- Firebase users can still call Express with `Bearer fb:<idToken>`; the server verifies it.

Demo accounts (from the README): `demo.user@rizik.org` / `password123` and
`demo.restaurant@rizik.org` / `password123`. These are Express accounts, so they depend on the hosted
server, and they exercise the full food-rescue flow.

Known consequences of the split that this plan does **not** fix (mention them in the README's
"Known limitations"): a Google/email user can't claim the seeded food (those listings live in
SQLite; `createFirestoreClaimIfSupported` returns `null`); calls between two Google/email users
don't connect (the server only relays `call:signal` for SQLite conversations). Optional fix for the
first one is in 3.5.

---

## 3. Bug fixes

### 3.1 Flutter doesn't compile (16 errors; `flutter_app/build_log.txt` is UTF-16)

- 14× `onError?.(parsed);` is JavaScript syntax. Dart: `onError?.call(parsed);`
  - `flutter_app/lib/services/messenger_service.dart` lines 418, 447, 902, 1088, 1439, 1494, 1522
  - `flutter_app/lib/services/community_rooms_service.dart` lines 735, 760, 849, 884, 933
  - `flutter_app/lib/services/notification_service.dart` lines 327, 359
  - Find them with `grep -rn "?\.(" flutter_app/lib`.
- `flutter_app/lib/services/messenger_service.dart:1607`:
  `generatePersonaAutoReply(spec, userText, lang: lang)` → `generatePersonaAutoReply(spec, userText, lang)`
  (the function in `lib/data/demo_personas.dart:1088` takes the language as its third positional
  parameter).
- `flutter_app/lib/services/firestore_service.dart:1146`: the `DonationRecord(...)` constructor call
  is missing the required `status:` argument (see `lib/models/models.dart:1372`) → add
  `status: 'completed'`.
- The log only shows the first compile pass. If Flutter is installed, run `flutter pub get` and
  `flutter analyze` and fix remaining **errors** (not style warnings). If it isn't installed, say so
  and tell the user to run those commands.

### 3.2 Release APK has no internet permission

`flutter_app/android/app/src/main/AndroidManifest.xml` lacks
`<uses-permission android:name="android.permission.INTERNET"/>` (only the debug/profile manifests
have it). Add it above `<application>`. The hosted URL will be HTTPS, so no cleartext setting is
needed.

### 3.3 Firebase Android config (user action)

`flutter_app/lib/firebase_options.dart` `android` options reuse the **web** appId
(`1:318012951605:web:…`) and `flutter_app/android/app/google-services.json` is missing. Google and
email sign-in on Android need the Android app registered in the Firebase console (project
`ahar-for-all-58560`), which gives an `…:android:…` appId and `google-services.json`; Google
Sign-In also needs the app's SHA-1 fingerprint added. The Android package name is in
`flutter_app/android/app/build.gradle.kts` (`applicationId`, likely `com.example.rizik`).
Ask the user (or their friend who owns the Firebase project) to do this, or to run
`flutterfire configure`, then update `firebase_options.dart`. The demo accounts work without this
step because they go through the Express server.

### 3.4 OTP account takeover (do this: the server becomes public)

`POST /api/auth/forgot-password` (`server.ts` ~584) and `POST /api/auth/request-otp` (~644) return
the verification code in the response as `devOtpHint`. Anyone who knows an email/phone can then
reset that account's password or log in as it. Only include `devOtpHint` when
`process.env.EXPOSE_DEV_OTP === 'true'` (default off). There is no real SMS/email sender, so with the
flag off, OTP login and forgot-password can't be completed; check the web
(`src/components/OnboardingAuth.tsx`) and Flutter auth screens handle a missing hint gracefully
(just show "code sent"). Tell the user about this trade-off; for a pure demo they may choose to set
`EXPOSE_DEV_OTP=true` knowingly.

### 3.5 Optional small fixes (ask the user first)

- **Google/email users can't claim seeded food.** In `src/components/ListingDetailModal.tsx`
  `handleClaim`, when `createFirestoreClaimIfSupported` returns `null`, fall back to
  `api.createClaim(...)` (the server accepts Firebase tokens). Do the same in the Flutter claim
  flow. Small and contained.
- **Flutter WebSocket never reconnects.** `ApiService.connectWebSocket` (`api_service.dart` ~102)
  has empty `onError`/`onDone`. Hosted servers and mobile networks drop idle sockets, after which
  the app stops getting live updates. Add a reconnect with backoff (1s, 2s, 4s… max 30s) while a
  user is signed in, and a periodic ping (the server answers `{"event":"ping"}` with `pong`; the web
  client pings every 25 s).
- **Demo food runs out on a long-running host.** Seeded listings are re-activated only at startup
  (`initDatabase()` in `server/db.ts`, the block after "Keep seeded demo listings fresh"). A hosted
  server that runs for days ends up with no active food. Extract that block into an exported
  `refreshDemoListingsIfEmpty()` and call it from the 30-second sweep interval in `server.ts`,
  guarded by an env flag `DEMO_MODE=true`.

---

## 4. Make the server deployable

Keep changes minimal.

1. **Port:** `server.ts` has `const PORT = 3000;` → `const PORT = Number(process.env.PORT) || 3000;`
   (hosts assign the port).
2. **Persistent data paths:** `server/db.ts` builds `DB_PATH` (and `LEGACY_DB_PATH`) from
   `process.cwd()`; `server.ts` builds `UPLOADS_DIR` from `process.cwd()`. Make both configurable:
   `DATA_DIR` env var (default `process.cwd()`), with the DB at `${DATA_DIR}/aharforall.db` and
   uploads at `${DATA_DIR}/uploads` (create the directory if missing). Keep the legacy-rename logic
   working for local dev. On Railway the volume gets mounted at e.g. `/data` and `DATA_DIR=/data`.
3. **Node version:** add `"engines": { "node": ">=22.5" }` to `package.json` (needed for
   `node:sqlite`). Optionally add a `.nvmrc` / `.node-version` with `22`.
4. **Start script:** `"start": "NODE_ENV=production tsx server.ts"` uses POSIX env syntax (fails on
   Windows) and `tsx` is a devDependency, which some hosts skip in production installs. Move `tsx` to
   `dependencies`, add `cross-env` to `dependencies`, and use
   `"start": "cross-env NODE_ENV=production tsx server.ts"`. Don't set `NODE_ENV=production` as a
   host-level env var during the build, or devDependencies like `vite-plugin-pwa` and the Tailwind
   plugin won't be installed for `npm run build` (if a host forces it, move those build deps to
   `dependencies` too, and note that in the README).
5. **Build check:** run `npm install`, `npm run lint`, `npm run build`, then
   `npm start` locally with `PORT=4000 DATA_DIR=./tmp-data` (in PowerShell set env vars with
   `$env:PORT='4000'` etc.), open `http://localhost:4000`, log in with the demo account, and stop it.
   Delete `./tmp-data` afterwards. This proves the production path works before deploying.
6. Don't change anything else in the server.

---

## 5. Deployment (guide the user; they own the accounts)

**Railway (recommended; ~$5/month usage credit, persistent volume):**

1. Push the repo to GitHub (private is fine).
2. Railway → New Project → Deploy from GitHub repo → select it. If the repo root isn't the folder
   containing `package.json`, set the service's Root Directory.
3. Settings: Build command `npm install && npm run build`; Start command `npm start`.
4. Add a Volume mounted at `/data`. Variables: `DATA_DIR=/data`, optional `GEMINI_API_KEY`,
   optional `DEMO_MODE=true`, optional `EXPOSE_DEV_OTP` (see 3.4).
5. Networking → Generate Domain. That `https://….up.railway.app` URL is the `API_BASE_URL`.

**Render (free alternative):** New Web Service from the GitHub repo, same build/start commands,
Node 22+. Caveats to tell the user: the free instance sleeps after ~15 min idle (first request then
takes up to about a minute) and has no persistent disk, so the SQLite DB and uploads reset on every
restart/deploy (the server re-seeds demo data automatically, so demos still work; real signups are
lost). A paid instance with a persistent disk fixes both (`DATA_DIR` = the disk's mount path).

**Not Vercel:** serverless can't hold the WebSocket or keep the SQLite file. Don't attempt it.

**Firebase:** add the hosted domain to Firebase Console → Authentication → Settings → Authorized
domains, otherwise Google sign-in fails on the website.

---

## 6. README: add a "Setup guide" section

Add a clear **Setup guide** section near the top of `README.md` (after the intro and demo-accounts
table). Keep the rest of the README, but replace the long pasted Firestore rules with one line
pointing at `firestore.rules` (the pasted copy is stale and misleading). The setup guide covers:

1. **Requirements:** Node ≥ 22.5, npm; Flutter SDK + Android SDK for the APK.
2. **Run locally:** `npm install`, `npm run dev`, open `http://localhost:3000`. Explain that one
   process serves the website, API and WebSocket, and that the SQLite DB is created and seeded
   automatically on first run.
3. **Environment variables:** table of `PORT`, `DATA_DIR`, `GEMINI_API_KEY`, `DEMO_MODE`,
   `EXPOSE_DEV_OTP`, and the optional `VITE_FIREBASE_*` (with `firebase-applet-config.json` as the
   fallback). Point at `.env.example` and update it to match.
4. **Deploy the server:** Railway steps (and the Render alternative with its caveats) from
   section 5.
5. **Build the Android APK:**
   `cd flutter_app`, `flutter pub get`,
   `flutter build apk --release --dart-define=API_BASE_URL=https://<your-host-domain>`;
   output at `flutter_app/build/app/outputs/flutter-apk/app-release.apk`. For an emulator against a
   local server: `--dart-define=API_BASE_URL=http://10.0.2.2:3000` (debug build). Note that
   `API_BASE_URL` is baked in at build time, so rebuild the APK if the domain changes.
6. **Firebase setup:** registering the Android app (`google-services.json`, `firebase_options.dart`,
   SHA-1 for Google Sign-In), adding authorized domains, publishing `firestore.rules`,
   `storage.rules`, `database.rules.json`, `firestore.indexes.json`, and making an admin (the
   existing README "Setting your own account as admin" section; keep it).
7. **Known limitations:** two backends (what works for demo/Express accounts vs Google/email
   accounts), donations are simulated, OTP has no real SMS/email sender, Render free-tier resets.

Write it for someone who has never seen the project. Use the actual commands, verified where you
could run them; mark anything you couldn't verify.

---

## 7. Verify

- `npm run lint` and `npm run build` pass; the local production run in 4.5 works.
- Flutter: `flutter analyze` has no errors and `flutter build apk --release
--dart-define=API_BASE_URL=<url>` succeeds (or report that the toolchain isn't available here).
- After the user deploys: open the hosted URL in a browser, log in with both demo accounts in two
  browsers, run claim → accept → complete with the pickup code, send a chat message. Then install the
  APK on a phone with the laptop **off** and repeat the demo login + feed + claim.

---

## 8. Optional future work (do not start unless the user asks)

The real long-term fix is a single backend. The earlier session's recommendation, if the project
continues: move everything to Firebase (Auth, Firestore, Storage, RTDB), keep a few trusted
operations (claim accept/complete with the pickup code, notification fan-out, stats, expiry sweep,
translation) as Cloud Functions (needs the Blaze plan) or small serverless functions, delete
Express + SQLite, and port both the React app and the Flutter app off `ApiService`. That removes
the "can't claim seeded food" and "calls don't connect" problems and the need for any always-on
server. It's a large job; treat it as a separate project.
