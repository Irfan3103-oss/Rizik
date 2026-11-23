# Security Specification — Rizik Firestore Rules

## 1. Data Invariants
1. **Identity Integrity:** Every created user profile, user directory entry, private PII document, block record, report, listing, claim, review, donation, shift signup, real 1-to-1 chat message, and real community room message must bind its owner/author ID (`uid`, `blockerUid`, `reporterId`, `donorId`, `recipientId`, `reviewerId`, `userId`, `senderId`) strictly to `request.auth.uid`.
2. **Email Verification Gate:** All authenticated reads of private data, directory entries, community rooms, chats, notifications, and all writes require `request.auth.token.email_verified == true`. Guests cannot read or write any chat, community room, notification, or user directory data.
3. **Zero Self-Assigned Privilege & Admin-Only Demo Seeding:**
   - Users can only register with `role` in `['user', 'restaurantOwner', 'recipient', 'donor']`, `verified == false`, and (for `restaurantOwner`) `restaurant.verificationStatus == 'pending'`.
   - Non-admin users cannot edit their `role`, `verified`, `isDemo`, or self-approve `verificationStatus`.
   - Only `isAdmin()` may create/update/delete `userDirectory` documents with `isDemo == true`, create/delete `/rooms/{roomId}`, or write seeded `isDemo == true` messages into `/rooms/{roomId}/messages`.
   - Admin role can only come from Firebase custom claim (`admin: true`), Console-only `/admins/{uid}`, or the designated bootstrap admin email (explicitly excluding `sheikhsahel513@gmail.com`).
4. **PII Isolation & Zero-PII Directory:**
   - `email`, `phone`, and `address` in `/users/{userId}/private/info` are readable/writable only by `userId == request.auth.uid` or a verified admin.
   - `/userDirectory/{userId}` strictly forbids PII fields (`email`, `phone`, `address`, license numbers) via `keys().hasOnly(...)` and exposes only public display/persona fields (`displayName`, `@handle`, `photoURL`, `role`, `restaurantName`, `area`, `verified`, `discoverable`, `online`, `isDemo`, `bio`, `bioBn`, `openingHours`, `rating`, `reviewCount`, `lastSeen`). Users who set `discoverable == false` cannot be read or listed by other users.
5. **Isolated Demo 1-to-1 Chats:**
   - 1-to-1 conversations and auto-replies with demo personas are stored strictly inside the signed-in user's own subtree (`/users/{userId}/demoConversations/{convId}` and `/users/{userId}/demoMessages/{msgId}`), readable and writable solely by `isOwner(userId)` — never touching top-level `/conversations` or impersonating another real user UID.
6. **Community Room Safety & Rate Limiting:**
   - `/rooms/{roomId}/messages/{messageId}` enforces `text.size() <= 2000`, `createdAt == request.time`, `!isMutedInRoom(roomId, request.auth.uid)`, and per-user rate limiting (>= 900ms between messages via `/rooms/{roomId}/members/{uid}.lastMessageAt`).
   - Non-admin users can only update `reactions` (when unmuted) or append reports to `reportedBy`; only admins can delete or moderate any room message or mute/unmute users.
7. **Relational, Master Gate & Bidirectional Block Integrity:**
   - Creating a `FoodClaim` requires an active parent `/listings/{listingId}` document verified via `exists()` and `get()`.
   - Pending or rejected `restaurantOwner` accounts are blocked from creating new `/listings/{listingId}` documents until `restaurant.verificationStatus == 'approved'`.
   - `/conversations/{conversationId}/messages/{messageId}` is strictly gated via `get()` on the parent `/conversations/{conversationId}` verifying participant membership AND `!isBlockedBetween(uidA, uidB)`.
8. **Payload & Path Bounds:** All document IDs match `^[a-zA-Z0-9_\-]+$` (`<= 128` chars), messages cap `text` at `2000` chars, arrays cap sizes, and strict `keys().hasAll(...) && keys().hasOnly(...)` / `affectedKeys().hasOnly(...)` block shadow fields.

## 2. Adversarial Payloads Covered
1. Identity spoofing on listing, conversation, or room message (`senderId != request.auth.uid`).
2. Self-assigned `verified: true`, `role: "admin"`, or `isDemo: true` by a non-admin user.
3. PII field injection (`email`, `phone`) on `/userDirectory` or `/rooms`.
4. Guest read/list on `/userDirectory`, `/rooms`, `/conversations`, or cross-user `/users/{uid}/demoConversations`.
5. Unverified email admin spoof attempt.
6. State shortcutting (pending restaurant creating listing; review on uncompleted claim).
7. Terminal state reopening on completed/cancelled claims or shift signups.
8. Array poisoning (>2 participants in 1-to-1 chat, >10 dietary tags).
9. Path / ID poisoning (`../bad$doc`).
10. Oversized message (`> 2000` chars), backdated `createdAt`, or muted user posting in community room.
11. Unsolicited cross-user notification spoofing or cross-user demo message injection.
12. Blocked peer sending a 1-to-1 message or editing existing message `text`.
