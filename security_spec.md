# Security Specification — Ahar For All Firestore Rules

## 1. Data Invariants
1. **Identity Integrity:** Every created user profile, user directory entry, private PII document, block record, report, listing, claim, review, donation, shift signup, and chat message must bind its owner/author ID (`uid`, `blockerUid`, `reporterId`, `donorId`, `recipientId`, `reviewerId`, `userId`, `senderId`) strictly to `request.auth.uid` (except explicit `isDemoAutoReply` messages strictly inside a user's own `isDemo == true` conversation).
2. **Email Verification Gate:** All standard authenticated reads of private data, directory entries, chats, notifications, and all writes require `request.auth.token.email_verified == true`. Guests cannot read any chat, notification, or user directory data.
3. **Zero Self-Assigned Privilege:** Users can only register with `role` in `['user', 'restaurantOwner', 'recipient', 'donor']`, `verified == false`, and (for `restaurantOwner`) `restaurant.verificationStatus == 'pending'`. Users cannot edit their own `role`, `verified`, or self-approve `verificationStatus`. Admin role can only come from Firebase custom claim (`admin: true`), Console-only `/admins/{uid}`, or the designated bootstrap admin email (explicitly excluding `sheikhsahel513@gmail.com`).
4. **PII Isolation & Zero-PII Directory:**
   - `email`, `phone`, and `address` in `/users/{userId}/private/info` are readable/writable only by `userId == request.auth.uid` or a verified admin.
   - `/userDirectory/{userId}` strictly forbids PII fields (`email`, `phone`, `address`, license numbers) via `keys().hasOnly(...)` and exposes only public display fields (`displayName`, `@handle`, `photoURL`, `role`, `restaurantName`, `area`, `verified`, `discoverable`, `online`, `lastSeen`). Users who set `discoverable == false` cannot be read or listed by other users.
5. **Relational, Master Gate & Bidirectional Block Integrity:**
   - Creating a `FoodClaim` requires an active parent `/listings/{listingId}` document verified via `exists()` and `get()`.
   - Pending or rejected `restaurantOwner` accounts are blocked from creating new `/listings/{listingId}` documents until `restaurant.verificationStatus == 'approved'`.
   - Creating a `DonorReview` requires a `completed` `/claims/{claimId}` belonging to `request.auth.uid`.
   - `/conversations/{conversationId}/messages/{messageId}` is strictly gated via `get()` on the parent `/conversations/{conversationId}` verifying participant membership AND verifying `!isBlockedBetween(uidA, uidB)`. Message body (`text`, `messageType`, `senderId`, `createdAt`) cannot be edited after creation; only `deliveredTo`, `readBy`, `status`, `readAt`, `deletedFor`, and `reactions` may be updated by participants.
6. **Temporal Integrity & Immutability:** `createdAt` and `updatedAt` must equal `request.time`; `createdAt`, `uid`, `donorId`, `recipientId`, `listingId`, `ownerUid`, and `pickupCode` cannot be altered on update. Real non-demo message creation enforces a rapid-burst rate limit check against `lastMessageAt`.
7. **Terminal State Locking:** Completed, cancelled, or expired claims (`FoodClaim`) and completed or cancelled shift signups (`VolunteerShiftSignup`) cannot transition after reaching terminal status (except by verified admin override).
8. **Payload & Path Bounds:** All document IDs match `^[a-zA-Z0-9_\-]+$` (`<= 128` chars), messages cap `text` at `2000` chars, arrays cap sizes (`participants <= 2`, `dietaryTags <= 10`, `readBy <= 2`, `deliveredTo <= 2`, `deletedFor <= 2`), and strict `keys().hasAll(...) && keys().hasOnly(...)` / `affectedKeys().hasOnly(...)` block shadow fields.

## 2. The "Dirty Dozen" (+ Messenger Security) Adversarial Payloads
1. **Identity Spoofing (Listing):** Authenticated user `recip_A` submits `/listings/list_1` with `donorId: "donor_B"`. Expected: `PERMISSION_DENIED`.
2. **Self-Assigned Verified Flag / Admin Role (User Create & Directory):** New user submits `/users/uid_A` with `verified: true` or `/userDirectory/uid_A` with `role: "admin"`, or self-writes `/admins/uid_A`. Expected: `PERMISSION_DENIED`.
3. **Ghost / Shadow Field Injection (Update & PII Leakage):** User writes `email` into `/userDirectory/uid_A` or donor updates `/listings/list_1` adding `donorVerified: true`. Expected: `PERMISSION_DENIED`.
4. **PII & Private Data Blanket Read (Guest & Cross-User):** Guest reads `/userDirectory` or signed-in non-admin user `uid_B` reads `/users/uid_A/private/info` or `/users/uid_A/notifications`. Expected: `PERMISSION_DENIED`.
5. **Email Spoofing (Unverified Admin):** Attacker connects with admin email and `email_verified: false`. Expected: `PERMISSION_DENIED`.
6. **State Shortcutting (Review Before Completion / Pending Listing Post):** Pending restaurant owner creates `/listings/list_1`, or recipient submits `/reviews/rev_1` referencing a `requested` claim. Expected: `PERMISSION_DENIED`.
7. **Terminal State Reopening:** Recipient updates a `completed` claim back to `requested`. Expected: `PERMISSION_DENIED`.
8. **Array Poisoning:** Donor creates a listing with `dietaryTags: [12345]` or >10 tags, or creates a conversation with >2 `participants`. Expected: `PERMISSION_DENIED`.
9. **ID Poisoning:** Client writes `/listings/bad$doc..injection` or 500-char ID. Expected: `PERMISSION_DENIED`.
10. **Timestamp Forgery & Oversized Message:** User submits `/conversations/c1/messages/m1` with `text` > 2000 chars or a backdated `createdAt`. Expected: `PERMISSION_DENIED`.
11. **Unauthorized List Scraping & Unsolicited Notification Spam:** Non-participant lists `/conversations` or injects fake `welcome`/`system` notifications into `/users/uid_B/notifications`. Expected: `PERMISSION_DENIED`.
12. **Blocked User / Non-Participant / Message Text Edit:** Blocked user or outsider sends a message in `/conversations/direct_A_B/messages`, or participant edits `text` on an existing message. Expected: `PERMISSION_DENIED`.
