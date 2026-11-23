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

## 2. Web Deployment Guide (Share with Reviewers)

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

Paste the complete ruleset below into **Firebase Console → Firestore Database → Rules** (on database `ai-studio-nourishloop-73bca805-3fbc-4853-bf13-b6677e5fc115`) and click **Publish**:

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // Global Safety Net — deny everything by default
    match /{document=**} {
      allow read, write: if false;
    }

    // --- Hardened Primitives ---
    function incoming() {
      return request.resource.data;
    }

    function existing() {
      return resource.data;
    }

    function isSignedIn() {
      return request.auth != null;
    }

    function isVerifiedUser() {
      return isSignedIn() && request.auth.token.email_verified == true;
    }

    function isValidId(id) {
      return id is string && id.size() > 0 && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$');
    }

    function isAdmin() {
      return isVerifiedUser()
        && request.auth.token.email != 'sheikhsahel513@gmail.com'
        && (
          request.auth.token.admin == true ||
          request.auth.token.email == 'jafor05101007@student.ndub.edu.bd' ||
          exists(/databases/$(database)/documents/admins/$(request.auth.uid))
        );
    }

    function isOwner(userId) {
      return isVerifiedUser() && request.auth.uid == userId;
    }

    function isBlockedBetween(uid1, uid2) {
      return exists(/databases/$(database)/documents/users/$(uid1)/blocked/$(uid2))
        || exists(/databases/$(database)/documents/users/$(uid2)/blocked/$(uid1));
    }

    function userDocVerifiedStatus(userId) {
      return exists(/databases/$(database)/documents/users/$(userId))
        && get(/databases/$(database)/documents/users/$(userId)).data.verified == true;
    }

    // --- Validation Blueprints ---
    function isValidRestaurantInfo(r) {
      return r is map
        && r.keys().hasAll([
          'restaurantName', 'ownerName', 'phone', 'address', 'area', 'city',
          'lat', 'lng', 'restaurantType', 'openingHours', 'acceptedSafetyTerms', 'verificationStatus'
        ])
        && r.keys().hasOnly([
          'restaurantName', 'ownerName', 'phone', 'email', 'address', 'area', 'city',
          'lat', 'lng', 'restaurantType', 'tradeLicenseNumber', 'restaurantPhotoUrl',
          'licensePhotoUrl', 'openingHours', 'approxDailySurplus', 'acceptedSafetyTerms',
          'verificationStatus', 'rejectionReason', 'submittedAt', 'reviewedAt', 'reviewedBy'
        ])
        && r.restaurantName is string && r.restaurantName.size() >= 2 && r.restaurantName.size() <= 120
        && r.ownerName is string && r.ownerName.size() >= 2 && r.ownerName.size() <= 100
        && r.phone is string && r.phone.size() >= 5 && r.phone.size() <= 32
        && (!('email' in r) || r.email == null || (r.email is string && r.email.size() <= 160))
        && r.address is string && r.address.size() >= 3 && r.address.size() <= 240
        && r.area is string && r.area.size() >= 1 && r.area.size() <= 80
        && r.city is string && r.city.size() >= 1 && r.city.size() <= 80
        && r.lat is number && r.lat >= -90 && r.lat <= 90
        && r.lng is number && r.lng >= -180 && r.lng <= 180
        && r.restaurantType in ['restaurant', 'bakery', 'sweet_shop', 'cafe', 'catering', 'hotel_kitchen', 'other']
        && (!('tradeLicenseNumber' in r) || r.tradeLicenseNumber == null || (r.tradeLicenseNumber is string && r.tradeLicenseNumber.size() <= 80))
        && (!('restaurantPhotoUrl' in r) || r.restaurantPhotoUrl == null || (r.restaurantPhotoUrl is string && r.restaurantPhotoUrl.size() <= 250000))
        && (!('licensePhotoUrl' in r) || r.licensePhotoUrl == null || (r.licensePhotoUrl is string && r.licensePhotoUrl.size() <= 250000))
        && r.openingHours is string && r.openingHours.size() >= 2 && r.openingHours.size() <= 80
        && (!('approxDailySurplus' in r) || r.approxDailySurplus == null || (r.approxDailySurplus is string && r.approxDailySurplus.size() <= 100))
        && r.acceptedSafetyTerms is bool && r.acceptedSafetyTerms == true
        && r.verificationStatus in ['pending', 'approved', 'rejected']
        && (!('rejectionReason' in r) || r.rejectionReason == null || (r.rejectionReason is string && r.rejectionReason.size() <= 500))
        && (!('submittedAt' in r) || r.submittedAt == null || (r.submittedAt is string && r.submittedAt.size() <= 64))
        && (!('reviewedAt' in r) || r.reviewedAt == null || (r.reviewedAt is string && r.reviewedAt.size() <= 64))
        && (!('reviewedBy' in r) || r.reviewedBy == null || (r.reviewedBy is string && r.reviewedBy.size() <= 128));
    }

    function isValidUserPublic(data) {
      return data.keys().hasAll([
          'uid', 'displayName', 'role', 'area', 'verified', 'language', 'savedRadiusKm', 'createdAt', 'updatedAt'
        ])
        && data.keys().hasOnly([
          'uid', 'name', 'displayName', 'handle', 'photoURL', 'email', 'role', 'area',
          'organizationName', 'businessName', 'hours', 'verified', 'discoverable',
          'starterSeeded', 'notificationsSeeded', 'language', 'savedRadiusKm', 'restaurant',
          'createdAt', 'updatedAt'
        ])
        && isValidId(data.uid)
        && (!('name' in data) || (data.name is string && data.name.size() >= 1 && data.name.size() <= 100))
        && data.displayName is string && data.displayName.size() >= 1 && data.displayName.size() <= 100
        && (!('handle' in data) || (data.handle is string && data.handle.size() >= 3 && data.handle.size() <= 40))
        && (!('photoURL' in data) || data.photoURL == null || (data.photoURL is string && data.photoURL.size() <= 250000))
        && (!('email' in data) || (data.email is string && data.email.size() <= 160))
        && data.role in ['user', 'restaurantOwner', 'recipient', 'donor']
        && data.area is string && data.area.size() >= 1 && data.area.size() <= 80
        && (!('organizationName' in data) || (data.organizationName is string && data.organizationName.size() <= 120))
        && (!('businessName' in data) || (data.businessName is string && data.businessName.size() <= 120))
        && (!('hours' in data) || (data.hours is string && data.hours.size() <= 80))
        && data.verified is bool
        && (!('discoverable' in data) || data.discoverable is bool)
        && (!('starterSeeded' in data) || data.starterSeeded is bool)
        && (!('notificationsSeeded' in data) || data.notificationsSeeded is bool)
        && data.language in ['en', 'bn']
        && data.savedRadiusKm is number && data.savedRadiusKm >= 1 && data.savedRadiusKm <= 50
        && (!('restaurant' in data) || isValidRestaurantInfo(data.restaurant))
        && data.createdAt is timestamp
        && data.updatedAt is timestamp;
    }

    function isValidUserDirectoryProfile(data) {
      return data.keys().hasAll([
          'uid', 'displayName', 'handle', 'role', 'area', 'verified', 'discoverable',
          'online', 'lastSeen', 'createdAt', 'updatedAt'
        ])
        && data.keys().hasOnly([
          'uid', 'displayName', 'handle', 'photoURL', 'role', 'restaurantName',
          'restaurantType', 'area', 'verified', 'discoverable', 'online',
          'lastSeen', 'createdAt', 'updatedAt'
        ])
        && isValidId(data.uid)
        && data.displayName is string && data.displayName.size() >= 1 && data.displayName.size() <= 100
        && data.handle is string && data.handle.size() >= 3 && data.handle.size() <= 40
        && (!('photoURL' in data) || data.photoURL == null || (data.photoURL is string && data.photoURL.size() <= 250000))
        && data.role in ['user', 'restaurantOwner', 'recipient', 'donor', 'admin']
        && (!('restaurantName' in data) || data.restaurantName == null || (data.restaurantName is string && data.restaurantName.size() <= 120))
        && (!('restaurantType' in data) || data.restaurantType == null || (data.restaurantType is string && data.restaurantType.size() <= 40))
        && data.area is string && data.area.size() >= 1 && data.area.size() <= 80
        && data.verified is bool
        && data.discoverable is bool
        && data.online is bool
        && data.lastSeen is timestamp
        && data.createdAt is timestamp
        && data.updatedAt is timestamp;
    }

    function isValidUserPrivate(data) {
      return data.keys().hasAll(['uid', 'email', 'updatedAt'])
        && data.keys().hasOnly(['uid', 'email', 'phone', 'address', 'updatedAt'])
        && isValidId(data.uid)
        && data.email is string && data.email.size() >= 3 && data.email.size() <= 160
        && (!('phone' in data) || (data.phone is string && data.phone.size() <= 32))
        && (!('address' in data) || (data.address is string && data.address.size() <= 240))
        && data.updatedAt is timestamp;
    }

    function isValidUserBlock(data) {
      return data.keys().hasAll(['blockerUid', 'blockedUid', 'blockedName', 'createdAt'])
        && data.keys().hasOnly(['blockerUid', 'blockedUid', 'blockedName', 'blockedHandle', 'createdAt'])
        && isValidId(data.blockerUid)
        && isValidId(data.blockedUid)
        && data.blockerUid != data.blockedUid
        && data.blockedName is string && data.blockedName.size() >= 1 && data.blockedName.size() <= 100
        && (!('blockedHandle' in data) || data.blockedHandle == null || (data.blockedHandle is string && data.blockedHandle.size() <= 40))
        && data.createdAt is timestamp;
    }

    function isValidUserNotification(data) {
      return data.keys().hasAll([
          'recipientUid', 'senderUid', 'type', 'title', 'body', 'read', 'createdAt', 'updatedAt'
        ])
        && data.keys().hasOnly([
          'recipientUid', 'senderUid', 'senderName', 'type', 'title', 'titleBn',
          'body', 'bodyBn', 'read', 'isStarter', 'conversationId', 'listingId',
          'claimId', 'linkTab', 'createdAt', 'updatedAt'
        ])
        && isValidId(data.recipientUid)
        && isValidId(data.senderUid)
        && (!('senderName' in data) || data.senderName == null || (data.senderName is string && data.senderName.size() <= 120))
        && data.type in [
          'welcome', 'complete_profile', 'flash_rescue', 'flash_near_you', 'events_upcoming', 'team_hello',
          'new_message', 'new_conversation', 'reply', 'claim_accepted', 'claim_request',
          'pickup_completed', 'restaurant_status', 'system'
        ]
        && data.title is string && data.title.size() >= 1 && data.title.size() <= 140
        && (!('titleBn' in data) || data.titleBn == null || (data.titleBn is string && data.titleBn.size() <= 180))
        && data.body is string && data.body.size() >= 1 && data.body.size() <= 500
        && (!('bodyBn' in data) || data.bodyBn == null || (data.bodyBn is string && data.bodyBn.size() <= 600))
        && data.read is bool
        && (!('isStarter' in data) || data.isStarter is bool)
        && (!('conversationId' in data) || data.conversationId == null || isValidId(data.conversationId))
        && (!('listingId' in data) || data.listingId == null || isValidId(data.listingId))
        && (!('claimId' in data) || data.claimId == null || isValidId(data.claimId))
        && (!('linkTab' in data) || data.linkTab == null || data.linkTab in ['discover', 'inbox', 'claims', 'events', 'donate', 'account', 'post', 'donor', 'admin'])
        && data.createdAt is timestamp
        && data.updatedAt is timestamp;
    }

    function isValidUserReport(data) {
      return data.keys().hasAll(['reporterId', 'targetUserId', 'targetName', 'reason', 'status', 'createdAt', 'updatedAt'])
        && data.keys().hasOnly(['reporterId', 'targetUserId', 'targetName', 'conversationId', 'reason', 'details', 'status', 'createdAt', 'updatedAt'])
        && isValidId(data.reporterId)
        && isValidId(data.targetUserId)
        && data.reporterId != data.targetUserId
        && data.targetName is string && data.targetName.size() >= 1 && data.targetName.size() <= 120
        && (!('conversationId' in data) || data.conversationId == null || isValidId(data.conversationId))
        && data.reason is string && data.reason.size() >= 2 && data.reason.size() <= 120
        && (!('details' in data) || data.details == null || (data.details is string && data.details.size() <= 1000))
        && data.status in ['open', 'reviewed', 'resolved']
        && data.createdAt is timestamp
        && data.updatedAt is timestamp;
    }

    function isValidFoodListing(data) {
      return data.keys().hasAll([
          'donorId', 'donorName', 'donorVerified', 'donorArea', 'title', 'category',
          'quantity', 'remainingQuantity', 'unit', 'pickupStart', 'pickupEnd',
          'pickupAddress', 'status', 'createdAt', 'updatedAt'
        ])
        && data.keys().hasOnly([
          'donorId', 'donorName', 'donorVerified', 'donorArea', 'title', 'description',
          'category', 'dietaryTags', 'quantity', 'remainingQuantity', 'unit',
          'pickupStart', 'pickupEnd', 'pickupAddress', 'safetyNote', 'preparedAt',
          'consumeWithinHours', 'storageMethod', 'isFlashRescue', 'isRamadanSpecial',
          'status', 'lat', 'lng', 'createdAt', 'updatedAt'
        ])
        && isValidId(data.donorId)
        && data.donorName is string && data.donorName.size() >= 1 && data.donorName.size() <= 120
        && data.donorVerified is bool
        && data.donorArea is string && data.donorArea.size() >= 1 && data.donorArea.size() <= 80
        && data.title is string && data.title.size() >= 2 && data.title.size() <= 140
        && (!('description' in data) || (data.description is string && data.description.size() <= 1000))
        && data.category in ['cooked', 'bakery', 'produce', 'packaged']
        && (!('dietaryTags' in data) || (
          data.dietaryTags is list
          && data.dietaryTags.size() <= 10
          && (data.dietaryTags.size() == 0 || (data.dietaryTags[0] is string && data.dietaryTags[0].size() <= 40))
        ))
        && data.quantity is number && data.quantity >= 1 && data.quantity <= 5000
        && data.remainingQuantity is number && data.remainingQuantity >= 0 && data.remainingQuantity <= data.quantity
        && data.unit is string && data.unit.size() >= 1 && data.unit.size() <= 32
        && data.pickupStart is string && data.pickupStart.size() >= 4 && data.pickupStart.size() <= 64
        && data.pickupEnd is string && data.pickupEnd.size() >= 4 && data.pickupEnd.size() <= 64
        && data.pickupAddress is string && data.pickupAddress.size() >= 2 && data.pickupAddress.size() <= 240
        && (!('safetyNote' in data) || (data.safetyNote is string && data.safetyNote.size() <= 400))
        && (!('preparedAt' in data) || (data.preparedAt is string && data.preparedAt.size() <= 64))
        && (!('consumeWithinHours' in data) || (data.consumeWithinHours is number && data.consumeWithinHours >= 1 && data.consumeWithinHours <= 72))
        && (!('storageMethod' in data) || data.storageMethod in ['covered_hot', 'covered_chilled', 'sealed_dry', 'room_temp'])
        && (!('isFlashRescue' in data) || data.isFlashRescue is bool)
        && (!('isRamadanSpecial' in data) || data.isRamadanSpecial is bool)
        && data.status in ['active', 'paused', 'claimed', 'expired']
        && (!('lat' in data) || (data.lat is number && data.lat >= -90 && data.lat <= 90))
        && (!('lng' in data) || (data.lng is number && data.lng >= -180 && data.lng <= 180))
        && data.createdAt is timestamp
        && data.updatedAt is timestamp;
    }

    function isValidFoodClaim(data) {
      return data.keys().hasAll([
          'listingId', 'donorId', 'recipientId', 'recipientName', 'donorBusinessName',
          'listingTitle', 'quantityClaimed', 'status', 'pickupCode', 'createdAt', 'updatedAt'
        ])
        && data.keys().hasOnly([
          'listingId', 'donorId', 'recipientId', 'recipientName', 'donorBusinessName',
          'listingTitle', 'quantityClaimed', 'status', 'pickupCode', 'handoverMethod',
          'notes', 'createdAt', 'updatedAt'
        ])
        && isValidId(data.listingId)
        && isValidId(data.donorId)
        && isValidId(data.recipientId)
        && data.recipientName is string && data.recipientName.size() >= 1 && data.recipientName.size() <= 100
        && data.donorBusinessName is string && data.donorBusinessName.size() >= 1 && data.donorBusinessName.size() <= 120
        && data.listingTitle is string && data.listingTitle.size() >= 1 && data.listingTitle.size() <= 140
        && data.quantityClaimed is number && data.quantityClaimed >= 1 && data.quantityClaimed <= 500
        && data.status in ['requested', 'accepted', 'picked_up', 'completed', 'cancelled', 'expired']
        && data.pickupCode is string && data.pickupCode.size() >= 6 && data.pickupCode.size() <= 12
        && (!('handoverMethod' in data) || data.handoverMethod in ['qr', 'manual'])
        && (!('notes' in data) || (data.notes is string && data.notes.size() <= 400))
        && data.createdAt is timestamp
        && data.updatedAt is timestamp;
    }

    function isValidDonorReview(data) {
      return data.keys().hasAll(['claimId', 'donorId', 'reviewerId', 'reviewerName', 'rating', 'hygieneOk', 'createdAt'])
        && data.keys().hasOnly(['claimId', 'donorId', 'reviewerId', 'reviewerName', 'rating', 'hygieneOk', 'comment', 'createdAt'])
        && isValidId(data.claimId)
        && isValidId(data.donorId)
        && isValidId(data.reviewerId)
        && data.reviewerName is string && data.reviewerName.size() >= 1 && data.reviewerName.size() <= 100
        && data.rating is number && data.rating >= 1 && data.rating <= 5
        && data.hygieneOk is bool
        && (!('comment' in data) || (data.comment is string && data.comment.size() <= 500))
        && data.createdAt is timestamp;
    }

    function isValidMonetaryDonation(data) {
      return data.keys().hasAll([
          'userId', 'donorDisplayName', 'amountBdt', 'frequency', 'cause',
          'paymentMethod', 'isAnonymous', 'receiptCode', 'createdAt'
        ])
        && data.keys().hasOnly([
          'userId', 'donorDisplayName', 'amountBdt', 'frequency', 'cause',
          'paymentMethod', 'isAnonymous', 'honorOf', 'receiptCode', 'createdAt'
        ])
        && isValidId(data.userId)
        && data.donorDisplayName is string && data.donorDisplayName.size() >= 1 && data.donorDisplayName.size() <= 120
        && data.amountBdt is number && data.amountBdt >= 20 && data.amountBdt <= 5000000
        && data.frequency in ['one_time', 'monthly']
        && data.cause in ['general', 'events', 'wedding_pickup', 'platform', 'iftar_packs', 'sadaqah', 'zakat']
        && data.paymentMethod in ['bkash', 'nagad', 'rocket', 'card_sandbox', 'bank_transfer']
        && data.isAnonymous is bool
        && (!('honorOf' in data) || (data.honorOf is string && data.honorOf.size() <= 140))
        && data.receiptCode is string && data.receiptCode.size() >= 4 && data.receiptCode.size() <= 40
        && data.createdAt is timestamp;
    }

    function isValidVolunteerShiftSignup(data) {
      return data.keys().hasAll(['userId', 'shiftId', 'userName', 'status', 'hoursLogged', 'createdAt', 'updatedAt'])
        && data.keys().hasOnly(['userId', 'shiftId', 'userName', 'status', 'hoursLogged', 'createdAt', 'updatedAt'])
        && isValidId(data.userId)
        && isValidId(data.shiftId)
        && data.userName is string && data.userName.size() >= 1 && data.userName.size() <= 100
        && data.status in ['signed_up', 'checked_in', 'completed', 'cancelled']
        && data.hoursLogged is number && data.hoursLogged >= 0 && data.hoursLogged <= 24
        && data.createdAt is timestamp
        && data.updatedAt is timestamp;
    }

    function isValidChatConversation(data) {
      return data.keys().hasAll([
          'participants', 'uidA', 'uidB', 'lastMessage', 'lastMessageType',
          'lastMessageAt', 'unreadCount', 'createdAt', 'updatedAt'
        ])
        && data.keys().hasOnly([
          'conversationKind', 'participants', 'uidA', 'uidB',
          'donorId', 'recipientId', 'listingId', 'donorName', 'recipientName', 'listingTitle',
          'participantProfiles', 'isDemo', 'demoShopKey', 'demoOwnerUid',
          'lastMessage', 'lastMessageType', 'lastMessageSenderId', 'lastMessageAt',
          'unreadCount', 'mutedBy', 'archivedBy', 'deletedFor', 'typingBy',
          'createdAt', 'updatedAt'
        ])
        && (!('conversationKind' in data) || data.conversationKind in ['direct', 'pickup', 'demo'])
        && data.participants is list
        && data.participants.size() >= 1 && data.participants.size() <= 2
        && data.participants[0] is string && isValidId(data.participants[0])
        && (data.participants.size() == 1 || (data.participants[1] is string && isValidId(data.participants[1])))
        && isValidId(data.uidA)
        && isValidId(data.uidB)
        && (!('donorId' in data) || data.donorId == null || isValidId(data.donorId))
        && (!('recipientId' in data) || data.recipientId == null || isValidId(data.recipientId))
        && (!('listingId' in data) || data.listingId == null || isValidId(data.listingId))
        && (!('donorName' in data) || data.donorName == null || (data.donorName is string && data.donorName.size() <= 120))
        && (!('recipientName' in data) || data.recipientName == null || (data.recipientName is string && data.recipientName.size() <= 120))
        && (!('listingTitle' in data) || data.listingTitle == null || (data.listingTitle is string && data.listingTitle.size() <= 140))
        && (!('participantProfiles' in data) || (data.participantProfiles is map && data.participantProfiles.size() <= 4))
        && (!('isDemo' in data) || data.isDemo is bool)
        && (!('demoShopKey' in data) || data.demoShopKey == null || data.demoShopKey in ['team', 'biryani', 'mishti', 'bakery'])
        && (!('demoOwnerUid' in data) || data.demoOwnerUid == null || isValidId(data.demoOwnerUid))
        && data.lastMessage is string && data.lastMessage.size() <= 500
        && data.lastMessageType in ['text', 'image', 'file', 'location', 'audio', 'call_log', 'system']
        && (!('lastMessageSenderId' in data) || data.lastMessageSenderId == null || isValidId(data.lastMessageSenderId))
        && data.lastMessageAt is timestamp
        && data.unreadCount is map && data.unreadCount.size() <= 4
        && (!('mutedBy' in data) || (data.mutedBy is map && data.mutedBy.size() <= 4))
        && (!('archivedBy' in data) || (data.archivedBy is map && data.archivedBy.size() <= 4))
        && (!('deletedFor' in data) || (data.deletedFor is map && data.deletedFor.size() <= 4))
        && (!('typingBy' in data) || (data.typingBy is map && data.typingBy.size() <= 4))
        && data.createdAt is timestamp
        && data.updatedAt is timestamp;
    }

    function isValidChatMessage(data) {
      return data.keys().hasAll(['conversationId', 'participants', 'senderId', 'text', 'messageType', 'createdAt'])
        && data.keys().hasOnly([
          'conversationId', 'participants', 'donorId', 'recipientId', 'senderId', 'senderName',
          'text', 'messageType', 'mediaUrl', 'fileName', 'fileSize', 'fileMime',
          'locationLat', 'locationLng', 'locationLabel', 'locationExpiresAt', 'durationSec',
          'replyToId', 'replyToText', 'forwardedFrom',
          'deliveredTo', 'readBy', 'deletedFor', 'reactions', 'status', 'readAt',
          'isDemoAutoReply', 'createdAt'
        ])
        && isValidId(data.conversationId)
        && data.participants is list
        && data.participants.size() >= 1 && data.participants.size() <= 2
        && data.participants[0] is string && isValidId(data.participants[0])
        && (data.participants.size() == 1 || (data.participants[1] is string && isValidId(data.participants[1])))
        && (!('donorId' in data) || data.donorId == null || isValidId(data.donorId))
        && (!('recipientId' in data) || data.recipientId == null || isValidId(data.recipientId))
        && isValidId(data.senderId)
        && (!('senderName' in data) || data.senderName == null || (data.senderName is string && data.senderName.size() <= 100))
        && data.text is string && data.text.size() <= 2000
        && data.messageType in ['text', 'image', 'file', 'location', 'audio', 'call_log', 'system']
        && (!('mediaUrl' in data) || data.mediaUrl == null || (data.mediaUrl is string && data.mediaUrl.size() <= 450000))
        && (!('fileName' in data) || data.fileName == null || (data.fileName is string && data.fileName.size() <= 160))
        && (!('fileSize' in data) || data.fileSize == null || (data.fileSize is number && data.fileSize >= 0 && data.fileSize <= 26214400))
        && (!('fileMime' in data) || data.fileMime == null || (data.fileMime is string && data.fileMime.size() <= 100))
        && (!('locationLat' in data) || data.locationLat == null || (data.locationLat is number && data.locationLat >= -90 && data.locationLat <= 90))
        && (!('locationLng' in data) || data.locationLng == null || (data.locationLng is number && data.locationLng >= -180 && data.locationLng <= 180))
        && (!('locationLabel' in data) || data.locationLabel == null || (data.locationLabel is string && data.locationLabel.size() <= 160))
        && (!('locationExpiresAt' in data) || data.locationExpiresAt == null || (data.locationExpiresAt is string && data.locationExpiresAt.size() <= 64))
        && (!('durationSec' in data) || data.durationSec == null || (data.durationSec is number && data.durationSec >= 0 && data.durationSec <= 600))
        && (!('replyToId' in data) || data.replyToId == null || isValidId(data.replyToId))
        && (!('replyToText' in data) || data.replyToText == null || (data.replyToText is string && data.replyToText.size() <= 200))
        && (!('forwardedFrom' in data) || data.forwardedFrom == null || (data.forwardedFrom is string && data.forwardedFrom.size() <= 120))
        && (!('deliveredTo' in data) || (
          data.deliveredTo is list && data.deliveredTo.size() <= 2 &&
          (data.deliveredTo.size() == 0 || data.deliveredTo[0] is string)
        ))
        && (!('readBy' in data) || (
          data.readBy is list && data.readBy.size() <= 2 &&
          (data.readBy.size() == 0 || data.readBy[0] is string)
        ))
        && (!('deletedFor' in data) || (
          data.deletedFor is list && data.deletedFor.size() <= 2 &&
          (data.deletedFor.size() == 0 || data.deletedFor[0] is string)
        ))
        && (!('reactions' in data) || (data.reactions is map && data.reactions.size() <= 8))
        && (!('status' in data) || data.status in ['sent', 'delivered', 'read'])
        && (!('readAt' in data) || data.readAt == null || data.readAt is timestamp)
        && (!('isDemoAutoReply' in data) || data.isDemoAutoReply is bool)
        && data.createdAt is timestamp;
    }

    function isConversationParticipant(conversationId) {
      return isVerifiedUser()
        && exists(/databases/$(database)/documents/conversations/$(conversationId))
        && (
          request.auth.uid in get(/databases/$(database)/documents/conversations/$(conversationId)).data.participants ||
          ('donorId' in get(/databases/$(database)/documents/conversations/$(conversationId)).data &&
            get(/databases/$(database)/documents/conversations/$(conversationId)).data.donorId == request.auth.uid) ||
          ('recipientId' in get(/databases/$(database)/documents/conversations/$(conversationId)).data &&
            get(/databases/$(database)/documents/conversations/$(conversationId)).data.recipientId == request.auth.uid)
        );
    }

    function isValidAdminNotification(data) {
      return data.keys().hasAll([
          'type', 'ownerUid', 'restaurantName', 'ownerName', 'read', 'createdAt', 'updatedAt'
        ])
        && data.keys().hasOnly([
          'type', 'ownerUid', 'restaurantName', 'ownerName', 'conversationId', 'messagePreview', 'read', 'createdAt', 'updatedAt'
        ])
        && data.type in ['newRestaurantOwner', 'resubmittedRestaurantOwner', 'newOwnerMessage']
        && isValidId(data.ownerUid)
        && data.restaurantName is string && data.restaurantName.size() >= 1 && data.restaurantName.size() <= 120
        && data.ownerName is string && data.ownerName.size() >= 1 && data.ownerName.size() <= 100
        && (!('conversationId' in data) || data.conversationId == null || isValidId(data.conversationId))
        && (!('messagePreview' in data) || data.messagePreview == null || (data.messagePreview is string && data.messagePreview.size() <= 240))
        && data.read is bool
        && data.createdAt is timestamp
        && data.updatedAt is timestamp;
    }

    function isValidAdminConversation(data) {
      return data.keys().hasAll([
          'ownerUid', 'ownerName', 'restaurantName', 'verificationStatus',
          'lastMessage', 'lastMessageType', 'lastSenderRole', 'lastMessageAt',
          'ownerUnreadCount', 'adminUnreadCount', 'createdAt', 'updatedAt'
        ])
        && data.keys().hasOnly([
          'ownerUid', 'ownerName', 'restaurantName', 'restaurantLogoUrl', 'verificationStatus',
          'lastMessage', 'lastMessageType', 'lastSenderRole', 'lastMessageAt',
          'ownerUnreadCount', 'adminUnreadCount', 'ownerTyping', 'adminTyping', 'createdAt', 'updatedAt'
        ])
        && isValidId(data.ownerUid)
        && data.ownerName is string && data.ownerName.size() >= 1 && data.ownerName.size() <= 100
        && data.restaurantName is string && data.restaurantName.size() >= 1 && data.restaurantName.size() <= 120
        && (!('restaurantLogoUrl' in data) || data.restaurantLogoUrl == null || (data.restaurantLogoUrl is string && data.restaurantLogoUrl.size() <= 250000))
        && data.verificationStatus in ['pending', 'approved', 'rejected']
        && data.lastMessage is string && data.lastMessage.size() <= 500
        && data.lastMessageType in ['text', 'image', 'file', 'system']
        && data.lastSenderRole in ['owner', 'admin', 'system']
        && data.lastMessageAt is timestamp
        && data.ownerUnreadCount is number && data.ownerUnreadCount >= 0 && data.ownerUnreadCount <= 10000
        && data.adminUnreadCount is number && data.adminUnreadCount >= 0 && data.adminUnreadCount <= 10000
        && (!('ownerTyping' in data) || data.ownerTyping is bool)
        && (!('adminTyping' in data) || data.adminTyping is bool)
        && data.createdAt is timestamp
        && data.updatedAt is timestamp;
    }

    function isValidAdminChatMessage(data) {
      return data.keys().hasAll([
          'conversationId', 'ownerUid', 'senderId', 'senderRole', 'senderName',
          'text', 'messageType', 'status', 'createdAt'
        ])
        && data.keys().hasOnly([
          'conversationId', 'ownerUid', 'senderId', 'senderRole', 'senderName',
          'text', 'messageType', 'mediaUrl', 'fileName', 'fileSize', 'fileMime',
          'status', 'readAt', 'createdAt'
        ])
        && isValidId(data.conversationId)
        && isValidId(data.ownerUid)
        && isValidId(data.senderId)
        && data.senderRole in ['owner', 'admin', 'system']
        && data.senderName is string && data.senderName.size() >= 1 && data.senderName.size() <= 100
        && data.text is string && data.text.size() <= 2000
        && data.messageType in ['text', 'image', 'file', 'system']
        && (!('mediaUrl' in data) || data.mediaUrl == null || (data.mediaUrl is string && data.mediaUrl.size() <= 450000))
        && (!('fileName' in data) || data.fileName == null || (data.fileName is string && data.fileName.size() <= 160))
        && (!('fileSize' in data) || data.fileSize == null || (data.fileSize is number && data.fileSize >= 0 && data.fileSize <= 500000))
        && (!('fileMime' in data) || data.fileMime == null || (data.fileMime is string && data.fileMime.size() <= 100))
        && data.status in ['sent', 'read']
        && (!('readAt' in data) || data.readAt == null || data.readAt is timestamp)
        && data.createdAt is timestamp;
    }

    function isAdminConvParticipant(conversationId) {
      return isVerifiedUser()
        && exists(/databases/$(database)/documents/adminConversations/$(conversationId))
        && (
          isAdmin() ||
          get(/databases/$(database)/documents/adminConversations/$(conversationId)).data.ownerUid == request.auth.uid
        );
    }

    // --- Connection Health Check Document ---
    match /test/connection {
      allow get: if true;
    }

    // --- Admin Registry (Editable strictly in Firebase Console) ---
    match /admins/{adminId} {
      allow get: if isOwner(adminId) || isAdmin();
      allow list, write: if false;
    }

    // --- Zero-PII Public User Directory (Find People & Online Presence) ---
    match /userDirectory/{userId} {
      allow get: if isValidId(userId) && isVerifiedUser() && (
        existing().discoverable == true || isOwner(userId) || isAdmin()
      );
      allow list: if isVerifiedUser() && (
        resource.data.discoverable == true ||
        resource.data.uid == request.auth.uid ||
        isAdmin()
      );
      allow create: if isOwner(userId)
        && isValidId(userId)
        && isValidUserDirectoryProfile(incoming())
        && incoming().uid == request.auth.uid
        && incoming().createdAt == request.time
        && incoming().updatedAt == request.time
        && incoming().lastSeen == request.time
        && (
          isAdmin() || (
            incoming().role != 'admin'
            && (incoming().verified == false || userDocVerifiedStatus(userId))
          )
        );
      allow update: if isValidId(userId)
        && isValidUserDirectoryProfile(incoming())
        && incoming().uid == existing().uid
        && incoming().createdAt == existing().createdAt
        && incoming().updatedAt == request.time
        && (
          isAdmin() || (
            isOwner(userId)
            && incoming().role == existing().role
            && (incoming().verified == existing().verified || incoming().verified == userDocVerifiedStatus(userId))
            && incoming().diff(existing()).affectedKeys().hasOnly([
              'displayName', 'handle', 'photoURL', 'restaurantName', 'restaurantType',
              'area', 'discoverable', 'online', 'lastSeen', 'updatedAt', 'verified'
            ])
          )
        );
      allow delete: if isValidId(userId) && isAdmin();
    }

    // --- User Profiles, Blocked List, Notifications & Restaurant Owner Applications ---
    match /users/{userId} {
      allow get: if isValidId(userId) && (isOwner(userId) || isAdmin());
      allow list: if isVerifiedUser() && (resource.data.uid == request.auth.uid || isAdmin());
      allow create: if isOwner(userId)
        && isValidId(userId)
        && isValidUserPublic(incoming())
        && incoming().uid == request.auth.uid
        && incoming().verified == false
        && incoming().createdAt == request.time
        && incoming().updatedAt == request.time
        && (
          incoming().role != 'restaurantOwner' || (
            'restaurant' in incoming()
            && incoming().restaurant.verificationStatus == 'pending'
            && (!('rejectionReason' in incoming().restaurant) || incoming().restaurant.rejectionReason == null || incoming().restaurant.rejectionReason == '')
            && (!('reviewedAt' in incoming().restaurant) || incoming().restaurant.reviewedAt == null)
            && (!('reviewedBy' in incoming().restaurant) || incoming().restaurant.reviewedBy == null)
          )
        );
      allow update: if isValidId(userId)
        && isValidUserPublic(incoming())
        && incoming().uid == existing().uid
        && incoming().createdAt == existing().createdAt
        && incoming().updatedAt == request.time
        && (
          isAdmin() || (
            isOwner(userId)
            && incoming().role == existing().role
            && incoming().verified == existing().verified
            && (
              incoming().diff(existing()).affectedKeys().hasOnly([
                'name', 'displayName', 'handle', 'photoURL', 'area', 'organizationName',
                'businessName', 'hours', 'language', 'savedRadiusKm', 'discoverable',
                'starterSeeded', 'notificationsSeeded', 'updatedAt'
              ]) || (
                existing().role == 'restaurantOwner'
                && 'restaurant' in existing()
                && 'restaurant' in incoming()
                && incoming().diff(existing()).affectedKeys().hasOnly([
                  'name', 'displayName', 'area', 'businessName', 'hours', 'restaurant', 'updatedAt'
                ])
                && (!('reviewedBy' in incoming().restaurant) || incoming().restaurant.reviewedBy == null || ('reviewedBy' in existing().restaurant && incoming().restaurant.reviewedBy == existing().restaurant.reviewedBy))
                && (!('reviewedAt' in incoming().restaurant) || incoming().restaurant.reviewedAt == null || ('reviewedAt' in existing().restaurant && incoming().restaurant.reviewedAt == existing().restaurant.reviewedAt))
                && (
                  (
                    existing().restaurant.verificationStatus == 'rejected'
                    && incoming().restaurant.verificationStatus == 'pending'
                    && (!('rejectionReason' in incoming().restaurant) || incoming().restaurant.rejectionReason == null || incoming().restaurant.rejectionReason == '')
                  ) || (
                    incoming().restaurant.verificationStatus == existing().restaurant.verificationStatus
                    && (!('rejectionReason' in incoming().restaurant) || incoming().restaurant.rejectionReason == null || ('rejectionReason' in existing().restaurant && incoming().restaurant.rejectionReason == existing().restaurant.rejectionReason))
                  )
                )
              )
            )
          )
        );
      allow delete: if isValidId(userId) && isAdmin();

      // Isolated PII Subcollection
      match /private/{docId} {
        allow get: if isValidId(docId) && (isOwner(userId) || isAdmin());
        allow list: if isOwner(userId) || isAdmin();
        allow create: if isValidId(docId)
          && (isOwner(userId) || isAdmin())
          && isValidUserPrivate(incoming())
          && incoming().uid == userId
          && incoming().updatedAt == request.time;
        allow update: if isValidId(docId)
          && (isOwner(userId) || isAdmin())
          && isValidUserPrivate(incoming())
          && incoming().uid == existing().uid
          && incoming().updatedAt == request.time
          && incoming().diff(existing()).affectedKeys().hasOnly(['email', 'phone', 'address', 'updatedAt']);
        allow delete: if isValidId(docId) && isAdmin();
      }

      // Per-user Block List
      match /blocked/{targetId} {
        allow get: if isValidId(targetId) && (isOwner(userId) || isAdmin());
        allow list: if isOwner(userId) || isAdmin();
        allow create: if isOwner(userId)
          && isValidId(targetId)
          && isValidUserBlock(incoming())
          && incoming().blockerUid == userId
          && incoming().blockedUid == targetId
          && incoming().createdAt == request.time;
        allow update: if false;
        allow delete: if isValidId(targetId) && (isOwner(userId) || isAdmin());
      }

      // Personal Notifications Center
      match /notifications/{notificationId} {
        allow get: if isValidId(notificationId) && (isOwner(userId) || isAdmin());
        allow list: if isOwner(userId) || isAdmin();
        allow create: if isVerifiedUser()
          && isValidId(notificationId)
          && isValidUserNotification(incoming())
          && incoming().recipientUid == userId
          && incoming().createdAt == request.time
          && incoming().updatedAt == request.time
          && (
            isAdmin() ||
            (
              isOwner(userId)
              && incoming().senderUid == request.auth.uid
              && incoming().type in ['welcome', 'complete_profile', 'flash_rescue', 'events_upcoming', 'team_hello']
            ) ||
            (
              incoming().senderUid == request.auth.uid
              && incoming().read == false
              && incoming().type in ['new_message', 'new_conversation', 'reply', 'claim_accepted', 'claim_request', 'pickup_completed']
              && (
                (
                  'conversationId' in incoming()
                  && incoming().conversationId != null
                  && exists(/databases/$(database)/documents/conversations/$(incoming().conversationId))
                  && request.auth.uid in get(/databases/$(database)/documents/conversations/$(incoming().conversationId)).data.participants
                  && userId in get(/databases/$(database)/documents/conversations/$(incoming().conversationId)).data.participants
                  && !isBlockedBetween(request.auth.uid, userId)
                ) ||
                (
                  'claimId' in incoming()
                  && incoming().claimId != null
                  && exists(/databases/$(database)/documents/claims/$(incoming().claimId))
                  && (
                    get(/databases/$(database)/documents/claims/$(incoming().claimId)).data.donorId == request.auth.uid ||
                    get(/databases/$(database)/documents/claims/$(incoming().claimId)).data.recipientId == request.auth.uid
                  )
                )
              )
            ) ||
            (
              incoming().senderUid == request.auth.uid
              && incoming().read == false
              && incoming().type == 'flash_near_you'
              && 'listingId' in incoming()
              && incoming().listingId != null
              && exists(/databases/$(database)/documents/listings/$(incoming().listingId))
              && get(/databases/$(database)/documents/listings/$(incoming().listingId)).data.donorId == request.auth.uid
              && get(/databases/$(database)/documents/listings/$(incoming().listingId)).data.isFlashRescue == true
            )
          );
        allow update: if isValidId(notificationId)
          && (isOwner(userId) || isAdmin())
          && isValidUserNotification(incoming())
          && incoming().recipientUid == existing().recipientUid
          && incoming().senderUid == existing().senderUid
          && incoming().createdAt == existing().createdAt
          && incoming().updatedAt == request.time
          && incoming().diff(existing()).affectedKeys().hasOnly(['read', 'updatedAt']);
        allow delete: if isValidId(notificationId) && (isOwner(userId) || isAdmin());
      }
    }

    // --- User & Abuse Reports ---
    match /reports/{reportId} {
      allow get: if isValidId(reportId) && (
        isAdmin() || (isVerifiedUser() && existing().reporterId == request.auth.uid)
      );
      allow list: if isAdmin() || (isVerifiedUser() && resource.data.reporterId == request.auth.uid);
      allow create: if isVerifiedUser()
        && isValidId(reportId)
        && isValidUserReport(incoming())
        && incoming().reporterId == request.auth.uid
        && incoming().status == 'open'
        && incoming().createdAt == request.time
        && incoming().updatedAt == request.time;
      allow update, delete: if isValidId(reportId) && isAdmin();
    }

    // --- Admin Notifications (New Restaurant Owners & New Owner Messages) ---
    match /adminNotifications/{notificationId} {
      allow get: if isValidId(notificationId) && isAdmin();
      allow list: if isAdmin();
      allow create: if isVerifiedUser()
        && isValidId(notificationId)
        && isValidAdminNotification(incoming())
        && incoming().ownerUid == request.auth.uid
        && incoming().read == false
        && incoming().createdAt == request.time
        && incoming().updatedAt == request.time
        && exists(/databases/$(database)/documents/users/$(request.auth.uid))
        && (
          incoming().type in ['newRestaurantOwner', 'resubmittedRestaurantOwner'] ||
          (
            incoming().type == 'newOwnerMessage'
            && 'conversationId' in incoming()
            && incoming().conversationId != null
            && exists(/databases/$(database)/documents/adminConversations/$(incoming().conversationId))
            && get(/databases/$(database)/documents/adminConversations/$(incoming().conversationId)).data.ownerUid == request.auth.uid
          )
        );
      allow update: if isValidId(notificationId)
        && isAdmin()
        && isValidAdminNotification(incoming())
        && incoming().ownerUid == existing().ownerUid
        && incoming().createdAt == existing().createdAt
        && incoming().updatedAt == request.time;
      allow delete: if isValidId(notificationId) && isAdmin();
    }

    // --- Real-Time Admin <-> Restaurant Owner Conversations ---
    match /adminConversations/{conversationId} {
      allow get: if isValidId(conversationId) && isVerifiedUser() && (
        conversationId == 'admin_' + request.auth.uid ||
        (resource != null && existing().ownerUid == request.auth.uid) ||
        isAdmin()
      );
      allow list: if isVerifiedUser() && (
        resource.data.ownerUid == request.auth.uid || isAdmin()
      );
      allow create: if isValidId(conversationId)
        && isVerifiedUser()
        && isValidAdminConversation(incoming())
        && incoming().createdAt == request.time
        && incoming().updatedAt == request.time
        && incoming().lastMessageAt == request.time
        && (
          isAdmin() || (
            incoming().ownerUid == request.auth.uid
            && incoming().verificationStatus == 'pending'
          )
        );
      allow update: if isValidId(conversationId)
        && isVerifiedUser()
        && isValidAdminConversation(incoming())
        && incoming().ownerUid == existing().ownerUid
        && incoming().createdAt == existing().createdAt
        && incoming().updatedAt == request.time
        && (
          isAdmin() || (
            existing().ownerUid == request.auth.uid
            && incoming().verificationStatus == existing().verificationStatus
            && incoming().diff(existing()).affectedKeys().hasOnly([
              'ownerName', 'restaurantName', 'restaurantLogoUrl',
              'lastMessage', 'lastMessageType', 'lastSenderRole', 'lastMessageAt',
              'ownerUnreadCount', 'adminUnreadCount', 'ownerTyping', 'updatedAt'
            ])
          )
        );
      allow delete: if isValidId(conversationId) && isAdmin();

      match /messages/{messageId} {
        allow get: if isValidId(conversationId) && isValidId(messageId) && (
          isAdminConvParticipant(conversationId) || isAdmin()
        );
        allow list: if isVerifiedUser() && (
          resource.data.ownerUid == request.auth.uid || isAdmin()
        );
        allow create: if isValidId(conversationId)
          && isValidId(messageId)
          && isAdminConvParticipant(conversationId)
          && isValidAdminChatMessage(incoming())
          && incoming().conversationId == conversationId
          && incoming().ownerUid == get(/databases/$(database)/documents/adminConversations/$(conversationId)).data.ownerUid
          && incoming().senderId == request.auth.uid
          && incoming().status == 'sent'
          && (!('readAt' in incoming()) || incoming().readAt == null)
          && incoming().createdAt == request.time
          && (isAdmin() || incoming().senderRole == 'owner');
        allow update: if isValidId(conversationId)
          && isValidId(messageId)
          && isAdminConvParticipant(conversationId)
          && isValidAdminChatMessage(incoming())
          && incoming().conversationId == existing().conversationId
          && incoming().ownerUid == existing().ownerUid
          && incoming().senderId == existing().senderId
          && incoming().senderRole == existing().senderRole
          && incoming().senderName == existing().senderName
          && incoming().text == existing().text
          && incoming().messageType == existing().messageType
          && incoming().createdAt == existing().createdAt
          && existing().senderId != request.auth.uid
          && existing().status == 'sent'
          && incoming().status == 'read'
          && incoming().readAt == request.time
          && incoming().diff(existing()).affectedKeys().hasOnly(['status', 'readAt']);
        allow delete: if false;
      }
    }

    // --- Surplus Food Listings ---
    match /listings/{listingId} {
      allow get: if isValidId(listingId) && (
        existing().status == 'active' ||
        (isVerifiedUser() && existing().donorId == request.auth.uid) ||
        isAdmin()
      );
      allow list: if resource.data.status == 'active' ||
        (isVerifiedUser() && resource.data.donorId == request.auth.uid) ||
        isAdmin();
      allow create: if isVerifiedUser()
        && isValidId(listingId)
        && isValidFoodListing(incoming())
        && incoming().donorId == request.auth.uid
        && incoming().createdAt == request.time
        && incoming().updatedAt == request.time
        && exists(/databases/$(database)/documents/users/$(request.auth.uid))
        && (
          isAdmin() || (
            get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role != 'restaurantOwner' &&
            incoming().donorVerified == false
          ) || (
            get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'restaurantOwner' &&
            get(/databases/$(database)/documents/users/$(request.auth.uid)).data.restaurant.verificationStatus == 'approved'
          )
        );
      allow update: if isVerifiedUser()
        && isValidId(listingId)
        && isValidFoodListing(incoming())
        && existing().status != 'expired'
        && incoming().donorId == existing().donorId
        && incoming().createdAt == existing().createdAt
        && incoming().updatedAt == request.time
        && (
          isAdmin() || (
            existing().donorId == request.auth.uid
            && incoming().donorVerified == existing().donorVerified
            && incoming().diff(existing()).affectedKeys().hasOnly([
              'title', 'description', 'remainingQuantity', 'status', 'safetyNote',
              'pickupEnd', 'storageMethod', 'isFlashRescue', 'isRamadanSpecial', 'updatedAt'
            ])
          )
        );
      allow delete: if isValidId(listingId) && (
        (isVerifiedUser() && existing().donorId == request.auth.uid) || isAdmin()
      );
    }

    // --- Food Rescue Claims ---
    match /claims/{claimId} {
      allow get: if isValidId(claimId) && isVerifiedUser() && (
        existing().recipientId == request.auth.uid ||
        existing().donorId == request.auth.uid ||
        isAdmin()
      );
      allow list: if isVerifiedUser() && (
        resource.data.recipientId == request.auth.uid ||
        resource.data.donorId == request.auth.uid ||
        isAdmin()
      );
      allow create: if isVerifiedUser()
        && isValidId(claimId)
        && isValidFoodClaim(incoming())
        && incoming().recipientId == request.auth.uid
        && incoming().status == 'requested'
        && incoming().createdAt == request.time
        && incoming().updatedAt == request.time
        && exists(/databases/$(database)/documents/listings/$(incoming().listingId))
        && get(/databases/$(database)/documents/listings/$(incoming().listingId)).data.status == 'active';
      allow update: if isVerifiedUser()
        && isValidId(claimId)
        && isValidFoodClaim(incoming())
        && existing().status != 'completed'
        && existing().status != 'cancelled'
        && existing().status != 'expired'
        && incoming().listingId == existing().listingId
        && incoming().donorId == existing().donorId
        && incoming().recipientId == existing().recipientId
        && incoming().pickupCode == existing().pickupCode
        && incoming().createdAt == existing().createdAt
        && incoming().updatedAt == request.time
        && (
          isAdmin() ||
          (
            existing().recipientId == request.auth.uid
            && existing().status in ['requested', 'accepted']
            && incoming().status == 'cancelled'
            && incoming().diff(existing()).affectedKeys().hasOnly(['status', 'updatedAt'])
          ) ||
          (
            existing().donorId == request.auth.uid
            && (
              (existing().status == 'requested' && incoming().status in ['accepted', 'cancelled']) ||
              (existing().status in ['accepted', 'picked_up'] && incoming().status == 'completed')
            )
            && incoming().diff(existing()).affectedKeys().hasOnly(['status', 'handoverMethod', 'updatedAt'])
          )
        );
      allow delete: if isValidId(claimId) && isAdmin();
    }

    // --- Verified Donor Reviews ---
    match /reviews/{reviewId} {
      allow get: if isValidId(reviewId) && existing().rating >= 1 && existing().rating <= 5;
      allow list: if resource.data.rating >= 1 && resource.data.rating <= 5;
      allow create: if isVerifiedUser()
        && isValidId(reviewId)
        && isValidDonorReview(incoming())
        && incoming().reviewerId == request.auth.uid
        && incoming().createdAt == request.time
        && exists(/databases/$(database)/documents/claims/$(incoming().claimId))
        && get(/databases/$(database)/documents/claims/$(incoming().claimId)).data.recipientId == request.auth.uid
        && get(/databases/$(database)/documents/claims/$(incoming().claimId)).data.donorId == incoming().donorId
        && get(/databases/$(database)/documents/claims/$(incoming().claimId)).data.status == 'completed';
      allow update, delete: if isValidId(reviewId) && isAdmin();
    }

    // --- Monetary Donations (General, Iftar Packs, Sadaqah, Zakat) ---
    match /donations/{donationId} {
      allow get: if isValidId(donationId) && isVerifiedUser() && (
        existing().userId == request.auth.uid || isAdmin()
      );
      allow list: if isVerifiedUser() && (
        resource.data.userId == request.auth.uid || isAdmin()
      );
      allow create: if isVerifiedUser()
        && isValidId(donationId)
        && isValidMonetaryDonation(incoming())
        && incoming().userId == request.auth.uid
        && incoming().createdAt == request.time;
      allow update, delete: if isValidId(donationId) && isAdmin();
    }

    // --- Volunteer Shift Signups ---
    match /shiftSignups/{signupId} {
      allow get: if isValidId(signupId) && isVerifiedUser() && (
        existing().userId == request.auth.uid || isAdmin()
      );
      allow list: if isVerifiedUser() && (
        resource.data.userId == request.auth.uid || isAdmin()
      );
      allow create: if isVerifiedUser()
        && isValidId(signupId)
        && isValidVolunteerShiftSignup(incoming())
        && incoming().userId == request.auth.uid
        && incoming().status == 'signed_up'
        && incoming().hoursLogged == 0
        && incoming().createdAt == request.time
        && incoming().updatedAt == request.time;
      allow update: if isVerifiedUser()
        && isValidId(signupId)
        && isValidVolunteerShiftSignup(incoming())
        && existing().status != 'completed'
        && existing().status != 'cancelled'
        && incoming().userId == existing().userId
        && incoming().shiftId == existing().shiftId
        && incoming().createdAt == existing().createdAt
        && incoming().updatedAt == request.time
        && (
          isAdmin() || (
            existing().userId == request.auth.uid
            && incoming().diff(existing()).affectedKeys().hasOnly(['status', 'hoursLogged', 'updatedAt'])
          )
        );
      allow delete: if isValidId(signupId) && isAdmin();
    }

    // --- Messenger 1-to-1, Pickup Coordination & Demo Conversations ---
    match /conversations/{conversationId} {
      allow get: if isValidId(conversationId) && isVerifiedUser() && (
        (resource == null && conversationId.split('_').hasAny([request.auth.uid])) ||
        (resource != null && (
          request.auth.uid in existing().participants ||
          ('donorId' in existing() && existing().donorId == request.auth.uid) ||
          ('recipientId' in existing() && existing().recipientId == request.auth.uid) ||
          isAdmin()
        ))
      );
      allow list: if isVerifiedUser() && (
        request.auth.uid in resource.data.participants ||
        ('donorId' in resource.data && resource.data.donorId == request.auth.uid) ||
        ('recipientId' in resource.data && resource.data.recipientId == request.auth.uid) ||
        isAdmin()
      );
      allow create: if isVerifiedUser()
        && isValidId(conversationId)
        && isValidChatConversation(incoming())
        && request.auth.uid in incoming().participants
        && incoming().createdAt == request.time
        && incoming().updatedAt == request.time
        && incoming().lastMessageAt == request.time
        && (
          (
            'isDemo' in incoming()
            && incoming().isDemo == true
            && 'demoOwnerUid' in incoming()
            && incoming().demoOwnerUid == request.auth.uid
            && incoming().uidA == request.auth.uid
            && incoming().participants.size() == 1
          ) || (
            (!('isDemo' in incoming()) || incoming().isDemo == false)
            && incoming().uidA in incoming().participants
            && incoming().uidB in incoming().participants
            && incoming().uidA != incoming().uidB
            && !isBlockedBetween(incoming().uidA, incoming().uidB)
          )
        );
      allow update: if isVerifiedUser()
        && isValidId(conversationId)
        && isValidChatConversation(incoming())
        && incoming().uidA == existing().uidA
        && incoming().uidB == existing().uidB
        && incoming().participants == existing().participants
        && incoming().createdAt == existing().createdAt
        && incoming().updatedAt == request.time
        && (request.auth.uid in existing().participants || isAdmin())
        && (
          incoming().diff(existing()).affectedKeys().hasOnly([
            'mutedBy', 'archivedBy', 'deletedFor', 'unreadCount', 'updatedAt'
          ]) || (
            incoming().diff(existing()).affectedKeys().hasOnly([
              'lastMessage', 'lastMessageType', 'lastMessageSenderId', 'lastMessageAt',
              'unreadCount', 'mutedBy', 'archivedBy', 'deletedFor', 'typingBy',
              'participantProfiles', 'updatedAt'
            ])
            && (('isDemo' in existing() && existing().isDemo == true) || !isBlockedBetween(existing().uidA, existing().uidB))
          )
        );
      allow delete: if isValidId(conversationId) && (
        isAdmin() || (
          isVerifiedUser()
          && 'isDemo' in existing()
          && existing().isDemo == true
          && 'demoOwnerUid' in existing()
          && existing().demoOwnerUid == request.auth.uid
        )
      );

      match /messages/{messageId} {
        allow get: if isValidId(conversationId) && isValidId(messageId) && (
          isConversationParticipant(conversationId) || isAdmin()
        );
        allow list: if isVerifiedUser() && (
          request.auth.uid in resource.data.participants ||
          ('donorId' in resource.data && resource.data.donorId == request.auth.uid) ||
          ('recipientId' in resource.data && resource.data.recipientId == request.auth.uid) ||
          isAdmin()
        );
        allow create: if isValidId(conversationId)
          && isValidId(messageId)
          && isConversationParticipant(conversationId)
          && isValidChatMessage(incoming())
          && incoming().conversationId == conversationId
          && incoming().participants == get(/databases/$(database)/documents/conversations/$(conversationId)).data.participants
          && incoming().createdAt == request.time
          && (
            (
              'isDemo' in get(/databases/$(database)/documents/conversations/$(conversationId)).data
              && get(/databases/$(database)/documents/conversations/$(conversationId)).data.isDemo == true
              && get(/databases/$(database)/documents/conversations/$(conversationId)).data.demoOwnerUid == request.auth.uid
              && (
                incoming().senderId == request.auth.uid ||
                (
                  'isDemoAutoReply' in incoming()
                  && incoming().isDemoAutoReply == true
                  && incoming().senderId == 'demo_' + get(/databases/$(database)/documents/conversations/$(conversationId)).data.demoShopKey
                )
              )
            ) || (
              (!('isDemo' in get(/databases/$(database)/documents/conversations/$(conversationId)).data) ||
                get(/databases/$(database)/documents/conversations/$(conversationId)).data.isDemo == false)
              && incoming().senderId == request.auth.uid
              && (!('isDemoAutoReply' in incoming()) || incoming().isDemoAutoReply == false)
              && !isBlockedBetween(
                get(/databases/$(database)/documents/conversations/$(conversationId)).data.uidA,
                get(/databases/$(database)/documents/conversations/$(conversationId)).data.uidB
              )
              && (
                !('lastMessageSenderId' in get(/databases/$(database)/documents/conversations/$(conversationId)).data) ||
                get(/databases/$(database)/documents/conversations/$(conversationId)).data.lastMessageSenderId != request.auth.uid ||
                request.time >= get(/databases/$(database)/documents/conversations/$(conversationId)).data.lastMessageAt + duration.value(350, 'ms')
              )
            )
          );
        allow update: if isValidId(conversationId)
          && isValidId(messageId)
          && isConversationParticipant(conversationId)
          && isValidChatMessage(incoming())
          && incoming().conversationId == existing().conversationId
          && incoming().participants == existing().participants
          && incoming().senderId == existing().senderId
          && incoming().text == existing().text
          && incoming().messageType == existing().messageType
          && incoming().createdAt == existing().createdAt
          && incoming().diff(existing()).affectedKeys().hasOnly([
            'deliveredTo', 'readBy', 'status', 'readAt', 'deletedFor', 'reactions'
          ]);
        allow delete: if isValidId(conversationId) && isValidId(messageId) && (
          isAdmin() || (
            isVerifiedUser()
            && 'isDemo' in get(/databases/$(database)/documents/conversations/$(conversationId)).data
            && get(/databases/$(database)/documents/conversations/$(conversationId)).data.isDemo == true
            && get(/databases/$(database)/documents/conversations/$(conversationId)).data.demoOwnerUid == request.auth.uid
          )
        );
      }
    }
  }
}
```

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

1. **Firestore Rules**: Open **Firebase Console → Firestore Database → Rules → Rules Playground**, choose **Get / Create / List** on paths like `/userDirectory/{uid}`, `/conversations/direct_{uidA}_{uidB}`, or `/users/{uid}/notifications/{id}`, toggle **Authenticated** with `email_verified: true`, and verify that unauthenticated reads, PII writes to `userDirectory`, or messages between blocked UIDs are denied.
2. **Realtime Database Rules**: Open **Realtime Database → Rules → Rules Playground**, simulate a verified user writing `{ "online": true, "lastSeen": 1700000000 }` to `/presence/{uid}` (allowed for matching `auth.uid`, denied for another UID or unverified email).
