import type { User as FirebaseUser } from 'firebase/auth';
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import {
  db,
  type FirestoreListenerError,
  handleFirestoreError,
  OperationType,
  parseFirestoreListenerError,
  storage,
} from '../firebase';
import { FOOD_CATEGORY_IMAGES } from '../data/images';
import {
  ALL_DEMO_PERSONAS_MAP,
  generatePersonaAutoReply,
  RIZIK_TEAM_PERSONA,
} from '../data/demoPersonas';
import type {
  ChatMessage,
  Conversation,
  DemoPersonaSpec,
  DirectoryRole,
  Language,
  Listing,
  MessageReaction,
  MessageType,
  User,
  UserDirectoryEntry,
} from '../types';
import { createCrossUserNotification } from './notificationService';

function clampStr(val: string | undefined | null, maxLen: number): string {
  return (val ?? '').trim().slice(0, maxLen);
}

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned || `id_${Date.now()}`;
}

function timestampToIso(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string' && val.length > 0) {
    return val;
  }
  return new Date().toISOString();
}

export function generatePublicHandle(displayName: string, uid: string): string {
  const baseSlug = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 16);
  const cleanBase = baseSlug.length >= 2 ? baseSlug : 'member';
  const suffix = uid
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-4)
    .toLowerCase()
    .padEnd(4, '0');
  return `@${cleanBase}_${suffix}`.slice(0, 40);
}

export function getDirectConversationId(uid1: string, uid2: string): string {
  const sorted = [sanitizeId(uid1), sanitizeId(uid2)].sort();
  return sanitizeId(`direct_${sorted[0]}_${sorted[1]}`);
}

export function mapMessageTypeToFirestore(mt?: MessageType): string {
  if (mt === 'voice') return 'audio';
  if (mt === 'call') return 'call_log';
  if (mt === 'image' || mt === 'file' || mt === 'location') return mt;
  return 'text';
}

export function mapMessageTypeFromFirestore(raw: unknown): MessageType {
  if (raw === 'audio' || raw === 'voice') return 'voice';
  if (raw === 'call_log' || raw === 'call') return 'call';
  if (raw === 'image' || raw === 'file' || raw === 'location') return raw;
  return 'text';
}

// --- Zero-PII Public User Directory Sync ---

const inFlightDirSync = new Map<string, Promise<void>>();

export function syncUserDirectoryProfile(
  fbUser: FirebaseUser,
  appUser: User,
  online = true
): Promise<void> {
  const existing = inFlightDirSync.get(fbUser.uid);
  if (existing) return existing;

  const p = doSyncUserDirectoryProfile(fbUser, appUser, online).finally(() => {
    inFlightDirSync.delete(fbUser.uid);
  });
  inFlightDirSync.set(fbUser.uid, p);
  return p;
}

async function doSyncUserDirectoryProfile(
  fbUser: FirebaseUser,
  appUser: User,
  online: boolean
): Promise<void> {
  const uid = sanitizeId(fbUser.uid);
  const dirRef = doc(db, 'userDirectory', uid);
  const userRef = doc(db, 'users', uid);

  let dirSnap;
  try {
    dirSnap = await getDoc(dirRef);
  } catch {
    return;
  }

  let existingUserData: Record<string, unknown> | undefined;
  try {
    const userSnap = await getDoc(userRef);
    existingUserData = userSnap.data() as Record<string, unknown> | undefined;
  } catch {
    existingUserData = undefined;
  }

  const displayName = clampStr(appUser.name || fbUser.displayName, 100) || 'Community Member';
  const handle =
    clampStr(
      (existingUserData?.handle as string | undefined) ||
        (dirSnap.data()?.handle as string | undefined) ||
        appUser.handle,
      40
    ) || generatePublicHandle(displayName, uid);

  const dirRole: UserDirectoryEntry['role'] = appUser.isAdmin
    ? 'admin'
    : appUser.accountType === 'restaurantOwner'
      ? 'restaurantOwner'
      : appUser.role === 'donor'
        ? 'donor'
        : 'user';

  const photoCandidate =
    appUser.restaurant?.restaurantPhotoUrl || appUser.photoURL || fbUser.photoURL || null;
  const safePhoto =
    typeof photoCandidate === 'string' && photoCandidate.length <= 248000 ? photoCandidate : null;

  const restaurantName =
    appUser.accountType === 'restaurantOwner'
      ? clampStr(appUser.restaurant?.restaurantName || appUser.donorProfile?.businessName, 120) ||
        null
      : null;
  const restaurantType =
    appUser.accountType === 'restaurantOwner'
      ? clampStr(appUser.restaurant?.restaurantType, 40) || 'restaurant'
      : null;

  const discoverable =
    typeof existingUserData?.discoverable === 'boolean'
      ? Boolean(existingUserData.discoverable)
      : typeof appUser.discoverable === 'boolean'
        ? appUser.discoverable
        : true;

  const verified = Boolean(existingUserData?.verified) || Boolean(appUser.verified);

  const payload: Record<string, unknown> = {
    uid,
    displayName,
    handle,
    photoURL: safePhoto,
    role: dirRole,
    restaurantName,
    restaurantType,
    area: clampStr(appUser.area, 80) || 'Dhanmondi',
    verified,
    discoverable,
    online,
    lastSeen: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (!dirSnap.exists()) {
    payload.createdAt = serverTimestamp();
    try {
      await setDoc(dirRef, payload);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `userDirectory/${uid}`);
    }
  } else {
    // Keep existing role if non-admin update would conflict; admins can sync admin role cleanly
    if (!appUser.isAdmin && dirSnap.data()?.role) {
      payload.role = dirSnap.data()?.role;
    }
    try {
      await updateDoc(dirRef, payload);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `userDirectory/${uid}`);
    }
  }

  // Ensure handle and discoverable are persisted on /users/{uid} for both new & existing users
  if (
    existingUserData &&
    (!existingUserData.handle || typeof existingUserData.discoverable !== 'boolean')
  ) {
    try {
      await updateDoc(userRef, {
        handle,
        discoverable,
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Non-fatal
    }
  }
}

export async function updateMyDiscoverableSetting(
  uid: string,
  discoverable: boolean
): Promise<void> {
  const safeUid = sanitizeId(uid);
  try {
    await updateDoc(doc(db, 'users', safeUid), {
      discoverable,
      updatedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'userDirectory', safeUid), {
      discoverable,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `userDirectory/${safeUid}`);
  }
}

function parseDirectoryRole(raw: unknown): DirectoryRole {
  const s = String(raw ?? 'user');
  if (
    s === 'admin' ||
    s === 'restaurantOwner' ||
    s === 'donor' ||
    s === 'recipient' ||
    s === 'volunteer' ||
    s === 'ngo' ||
    s === 'organizer'
  ) {
    return s;
  }
  return 'user';
}

export function subscribeDiscoverableDirectory(
  myUid: string,
  pageLimit: number,
  onUsers: (entries: UserDirectoryEntry[], hasMore: boolean) => void,
  onError?: (err: FirestoreListenerError) => void
): Unsubscribe {
  const q = query(
    collection(db, 'userDirectory'),
    where('discoverable', '==', true),
    limit(Math.max(40, pageLimit))
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: UserDirectoryEntry[] = [];
      snap.docs.forEach((d) => {
        const data = d.data() as Record<string, unknown>;
        const uid = String(data.uid ?? d.id);
        if (uid === myUid) return;
        const role = parseDirectoryRole(data.role);
        const isDemo = Boolean(data.isDemo) || uid.startsWith('demo_');
        const personaFallback = isDemo ? ALL_DEMO_PERSONAS_MAP.get(uid) : undefined;
        const lastSeenIso = timestampToIso(data.lastSeen);
        const recentlyActive = Date.now() - new Date(lastSeenIso).getTime() < 120_000;
        list.push({
          uid,
          displayName: String(data.displayName ?? personaFallback?.displayName ?? 'Community Member'),
          handle: String(data.handle ?? personaFallback?.handle ?? generatePublicHandle('member', uid)),
          photoURL:
            typeof data.photoURL === 'string'
              ? data.photoURL
              : personaFallback?.avatar ?? null,
          role,
          restaurantName:
            typeof data.restaurantName === 'string'
              ? data.restaurantName
              : personaFallback?.restaurantName ?? null,
          restaurantType:
            typeof data.restaurantType === 'string'
              ? data.restaurantType
              : personaFallback?.restaurantType ? String(personaFallback.restaurantType) : null,
          area: String(data.area ?? personaFallback?.area ?? 'Dhaka'),
          verified: Boolean(data.verified),
          discoverable: Boolean(data.discoverable),
          online: isDemo ? Boolean(data.online) : Boolean(data.online) && recentlyActive,
          lastSeen: lastSeenIso,
          isDemo,
          bio: typeof data.bio === 'string' ? data.bio : personaFallback?.bio ?? null,
          bioBn: typeof data.bioBn === 'string' ? data.bioBn : personaFallback?.bioBn ?? null,
          openingHours:
            typeof data.openingHours === 'string'
              ? data.openingHours
              : personaFallback?.openingHours ?? null,
          rating:
            typeof data.rating === 'number'
              ? data.rating
              : typeof personaFallback?.rating === 'number'
                ? personaFallback.rating
                : null,
          reviewCount:
            typeof data.reviewCount === 'number'
              ? data.reviewCount
              : typeof personaFallback?.reviewCount === 'number'
                ? personaFallback.reviewCount
                : null,
        });
      });

      list.sort((a, b) => {
        if (Boolean(a.isDemo) !== Boolean(b.isDemo)) return a.isDemo ? 1 : -1;
        if (a.online !== b.online) return a.online ? -1 : 1;
        return b.lastSeen.localeCompare(a.lastSeen);
      });

      onUsers(list, snap.docs.length >= pageLimit);
    },
    (error) => {
      onError?.(parseFirestoreListenerError(error, OperationType.LIST, 'userDirectory'));
    }
  );
}

// --- Block & Report Users ---

export function subscribeMyBlockedUsers(
  myUid: string,
  onBlocks: (blockedUids: Set<string>, blockedList: { uid: string; name: string; handle?: string }[]) => void,
  onError?: (err: FirestoreListenerError) => void
): Unsubscribe {
  const safeUid = sanitizeId(myUid);
  const q = collection(db, 'users', safeUid, 'blocked');
  return onSnapshot(
    q,
    (snap) => {
      const set = new Set<string>();
      const items: { uid: string; name: string; handle?: string }[] = [];
      snap.docs.forEach((d) => {
        const data = d.data() as Record<string, unknown>;
        const targetUid = String(data.blockedUid ?? d.id);
        set.add(targetUid);
        items.push({
          uid: targetUid,
          name: String(data.blockedName ?? 'User'),
          handle: typeof data.blockedHandle === 'string' ? data.blockedHandle : undefined,
        });
      });
      onBlocks(set, items);
    },
    (error) => {
      onError?.(parseFirestoreListenerError(error, OperationType.LIST, `users/${safeUid}/blocked`));
    }
  );
}

export async function blockUserInFirestore(
  myUid: string,
  targetUid: string,
  targetName: string,
  targetHandle?: string | null
): Promise<void> {
  const safeMyUid = sanitizeId(myUid);
  const safeTargetUid = sanitizeId(targetUid);
  if (safeMyUid === safeTargetUid) return;
  try {
    await setDoc(doc(db, 'users', safeMyUid, 'blocked', safeTargetUid), {
      blockerUid: safeMyUid,
      blockedUid: safeTargetUid,
      blockedName: clampStr(targetName, 100) || 'Community Member',
      blockedHandle: targetHandle ? clampStr(targetHandle, 40) : null,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${safeMyUid}/blocked/${safeTargetUid}`);
  }
}

export async function unblockUserInFirestore(myUid: string, targetUid: string): Promise<void> {
  const safeMyUid = sanitizeId(myUid);
  const safeTargetUid = sanitizeId(targetUid);
  try {
    await deleteDoc(doc(db, 'users', safeMyUid, 'blocked', safeTargetUid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${safeMyUid}/blocked/${safeTargetUid}`);
  }
}

export async function reportUserInFirestore(params: {
  reporterId: string;
  targetUserId: string;
  targetName: string;
  reason: string;
  details?: string;
  conversationId?: string | null;
}): Promise<void> {
  const safeReporter = sanitizeId(params.reporterId);
  const safeTarget = sanitizeId(params.targetUserId);
  if (safeReporter === safeTarget) return;
  const reportId = sanitizeId(`rep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  try {
    await setDoc(doc(db, 'reports', reportId), {
      reporterId: safeReporter,
      targetUserId: safeTarget,
      targetName: clampStr(params.targetName, 120) || 'Community Member',
      conversationId: params.conversationId ? sanitizeId(params.conversationId) : null,
      reason: clampStr(params.reason, 120) || 'Inappropriate behavior',
      details: params.details ? clampStr(params.details, 1000) : null,
      status: 'open',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `reports/${reportId}`);
  }
}

// --- Isolated Client-Side Demo Persona Conversations (Strictly Under users/{uid}/demo*) ---

export interface StarterConvSeedResult {
  status: 'already_present' | 'created' | 'repaired' | 'error';
  error?: string;
}

const inFlightStarterSeed = new Map<string, Promise<StarterConvSeedResult>>();

export function seedStarterDemoConversationsOnce(
  fbUser: FirebaseUser,
  _appUser: User,
  forceCheck = false
): Promise<StarterConvSeedResult> {
  if (!forceCheck) {
    const existing = inFlightStarterSeed.get(fbUser.uid);
    if (existing) return existing;
  }

  const p = doSeedStarterDemoConversationsOnce(fbUser, forceCheck).finally(() => {
    inFlightStarterSeed.delete(fbUser.uid);
  });
  inFlightStarterSeed.set(fbUser.uid, p);
  return p;
}

async function doSeedStarterDemoConversationsOnce(
  fbUser: FirebaseUser,
  forceCheck = false
): Promise<StarterConvSeedResult> {
  const uid = sanitizeId(fbUser.uid);
  const localSeedFlag = `rizik_demo_team_v2_${uid}`;
  if (!forceCheck) {
    try {
      if (localStorage.getItem(localSeedFlag) === '1') {
        return { status: 'already_present' };
      }
    } catch {
      // Ignore storage issues
    }
  }

  const convId = RIZIK_TEAM_PERSONA.id;
  const teamConvRef = doc(db, 'users', uid, 'demoConversations', convId);

  let convExists = false;
  let existingMsgCount = 0;
  try {
    const [existingConv, existingMsgs] = await Promise.all([
      getDoc(teamConvRef),
      getDocs(query(collection(db, 'users', uid, 'demoMessages'), where('conversationId', '==', convId), limit(5))),
    ]);
    convExists = existingConv.exists();
    existingMsgCount = existingMsgs.size;
    if (convExists && existingMsgCount > 0) {
      try {
        localStorage.setItem(localSeedFlag, '1');
      } catch {
        // Ignore
      }
      return { status: 'already_present' };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[messengerService] Could not inspect starter demo_team thread:', err);
    return { status: 'error', error: msg };
  }

  const welcomeMsgs = [
    'Welcome to Rizik! Join Community Rooms above, tap "New chat" to message partner kitchens & neighbors, or message demo personas anytime.',
    'রিজিক-এ স্বাগতম! উপরে কমিউনিটি রুমে যোগ দিন, "নতুন চ্যাট" থেকে কাছের রেস্তোরাঁ বা প্রতিবেশীর সাথে চ্যাট করুন। এটি একটি ডেমো সহায়তা থ্রেড।',
  ];

  try {
    const batch = writeBatch(db);
    if (!convExists) {
      batch.set(teamConvRef, {
        personaId: RIZIK_TEAM_PERSONA.id,
        personaName: RIZIK_TEAM_PERSONA.displayName,
        personaHandle: RIZIK_TEAM_PERSONA.handle,
        personaRole: RIZIK_TEAM_PERSONA.role,
        personaArea: RIZIK_TEAM_PERSONA.area,
        personaAvatar: null,
        personaVerified: true,
        isOfficial: true,
        lastMessage: clampStr(welcomeMsgs[1], 500),
        lastMessageType: 'text',
        lastMessageSenderId: RIZIK_TEAM_PERSONA.id,
        lastMessageAt: serverTimestamp(),
        unreadCount: 1,
        isMuted: false,
        isArchived: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    if (existingMsgCount === 0) {
      welcomeMsgs.forEach((text, index) => {
        const msgId = sanitizeId(`demo_team_welcome_${index}`);
        batch.set(doc(db, 'users', uid, 'demoMessages', msgId), {
          conversationId: convId,
          personaId: RIZIK_TEAM_PERSONA.id,
          senderId: RIZIK_TEAM_PERSONA.id,
          senderName: RIZIK_TEAM_PERSONA.displayName,
          text: clampStr(text, 2000),
          messageType: 'text',
          reactions: {},
          isDemoAutoReply: true,
          createdAt: serverTimestamp(),
        });
      });
    }

    await batch.commit();

    try {
      await updateDoc(doc(db, 'users', uid), {
        starterSeeded: true,
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Non-fatal
    }
    try {
      localStorage.setItem(localSeedFlag, '1');
    } catch {
      // Ignore
    }
    return { status: convExists ? 'repaired' : 'created' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[messengerService] Starter demo_team seed skipped:', err);
    return { status: 'error', error: msg };
  }
}

function buildPersonaSpecFromEntry(entry: UserDirectoryEntry): DemoPersonaSpec {
  const known = ALL_DEMO_PERSONAS_MAP.get(entry.uid);
  if (known) return known;
  return {
    id: entry.uid,
    displayName: entry.restaurantName || entry.displayName,
    displayNameBn: entry.restaurantName || entry.displayName,
    handle: entry.handle,
    role: entry.role,
    avatar: entry.photoURL ?? null,
    restaurantName: entry.restaurantName ?? null,
    restaurantType: entry.restaurantType ?? null,
    area: entry.area || 'Dhaka',
    verified: Boolean(entry.verified),
    bio: entry.bio || `${entry.displayName} in ${entry.area}`,
    bioBn: entry.bioBn || entry.bio || `${entry.area} এলাকার ${entry.displayName}`,
    openingHours: entry.openingHours ?? null,
    rating: entry.rating ?? null,
    reviewCount: entry.reviewCount ?? null,
    online: entry.online,
    categoryKey: entry.role === 'volunteer' ? 'volunteer' : 'team',
  };
}

function buildPersonaSpecFromConversation(conv: Conversation): DemoPersonaSpec {
  const personaId = conv.demoPersonaId || conv.peerUid || conv.id;
  const known = ALL_DEMO_PERSONAS_MAP.get(personaId);
  if (known) return known;
  return {
    id: personaId,
    displayName: conv.donorName || 'Demo Partner',
    displayNameBn: conv.donorName || 'ডেমো পার্টনার',
    handle: conv.peerHandle || '@demo_partner',
    role: parseDirectoryRole(conv.peerRole),
    avatar: conv.donorLogoUrl ?? null,
    restaurantName: conv.peerRestaurantName ?? null,
    area: conv.peerArea || 'Dhaka',
    verified: Boolean(conv.peerVerified),
    bio: conv.peerBio || '',
    bioBn: conv.peerBioBn || '',
    openingHours: conv.donorHours ?? null,
    rating: conv.peerRating ?? null,
    reviewCount: conv.peerReviewCount ?? null,
    online: true,
    isOfficial: Boolean(conv.isOfficial),
    categoryKey: 'team',
  };
}

export async function getOrCreateDemoPersonaConversation(
  me: User,
  target: UserDirectoryEntry,
  lang: Language = 'en'
): Promise<string> {
  const myUid = sanitizeId(me.id);
  const spec = buildPersonaSpecFromEntry(target);
  const convId = sanitizeId(spec.id);
  const convRef = doc(db, 'users', myUid, 'demoConversations', convId);

  try {
    const existing = await getDoc(convRef);
    if (existing.exists()) {
      await updateDoc(convRef, {
        isArchived: false,
        updatedAt: serverTimestamp(),
      });
      return convId;
    }
  } catch {
    // Proceed to create
  }

  const greetingText =
    lang === 'bn'
      ? `${spec.displayNameBn || spec.displayName}-এ স্বাগতম! (${spec.area}) — ${spec.bioBn}`
      : `Hi! Welcome to ${spec.displayName} (${spec.area}). ${spec.bio}`;

  const batch = writeBatch(db);
  batch.set(convRef, {
    personaId: spec.id,
    personaName: clampStr(spec.displayName, 120),
    personaHandle: clampStr(spec.handle, 40),
    personaRole: spec.role,
    personaArea: clampStr(spec.area, 80) || 'Dhaka',
    personaAvatar:
      typeof spec.avatar === 'string' && spec.avatar.length <= 248000 ? spec.avatar : null,
    personaVerified: Boolean(spec.verified),
    isOfficial: Boolean(spec.isOfficial),
    lastMessage: clampStr(greetingText, 500),
    lastMessageType: 'text',
    lastMessageSenderId: spec.id,
    lastMessageAt: serverTimestamp(),
    unreadCount: 0,
    isMuted: false,
    isArchived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const greetMsgId = sanitizeId(`demo_greet_${convId}_${Date.now()}`);
  batch.set(doc(db, 'users', myUid, 'demoMessages', greetMsgId), {
    conversationId: convId,
    personaId: spec.id,
    senderId: spec.id,
    senderName: clampStr(spec.displayName, 120),
    text: clampStr(greetingText, 2000),
    messageType: 'text',
    reactions: {},
    isDemoAutoReply: true,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${myUid}/demoConversations/${convId}`);
  }
  return convId;
}

export function subscribeMyDemoConversations(
  myUid: string,
  onConversations: (conversations: Conversation[]) => void,
  onError?: (err: FirestoreListenerError) => void
): Unsubscribe {
  const safeUid = sanitizeId(myUid);
  const q = collection(db, 'users', safeUid, 'demoConversations');
  return onSnapshot(
    q,
    (snap) => {
      const list: Conversation[] = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        const personaId = String(data.personaId ?? d.id);
        const spec = ALL_DEMO_PERSONAS_MAP.get(personaId);
        const personaName = String(data.personaName ?? spec?.displayName ?? 'Demo Partner');
        const personaAvatar =
          (typeof data.personaAvatar === 'string' ? data.personaAvatar : null) ??
          spec?.avatar ??
          null;
        const personaRole = parseDirectoryRole(data.personaRole ?? spec?.role ?? 'restaurantOwner');
        const personaArea = String(data.personaArea ?? spec?.area ?? 'Dhaka');
        const personaHandle = String(data.personaHandle ?? spec?.handle ?? '@demo_rizik');
        const lastMsgAt = timestampToIso(data.lastMessageAt ?? data.updatedAt);

        return {
          id: d.id,
          listingId: '',
          claimId: '',
          donorId: personaId,
          recipientId: safeUid,
          uidA: safeUid,
          uidB: personaId,
          participants: [safeUid],
          conversationKind: 'demo',
          donorRole: personaRole,
          recipientRole: 'user',
          donorName: personaName,
          donorLogoUrl: personaAvatar,
          donorVerified: Boolean(data.personaVerified ?? spec?.verified),
          donorArea: personaArea,
          donorHours: spec?.openingHours ?? null,
          recipientName: 'You',
          recipientLogoUrl: null,
          recipientVerified: true,
          recipientArea: 'Dhaka',
          peerUid: personaId,
          peerHandle: personaHandle,
          peerRole: personaRole,
          peerVerified: Boolean(data.personaVerified ?? spec?.verified),
          peerArea: personaArea,
          peerRestaurantName: spec?.restaurantName ?? personaName,
          peerOnline: spec?.online ?? true,
          peerLastSeen: null,
          peerTyping: false,
          peerBio: spec?.bio ?? null,
          peerBioBn: spec?.bioBn ?? null,
          peerRating: spec?.rating ?? null,
          peerReviewCount: spec?.reviewCount ?? null,
          listingTitle: spec?.isOfficial
            ? 'Official Guide · Demo'
            : `${personaArea} · Demo Account`,
          listingPhoto: personaAvatar || FOOD_CATEGORY_IMAGES.cooked,
          pickupStart: lastMsgAt,
          pickupEnd: lastMsgAt,
          claimStatus: 'requested',
          isDirect: true,
          isStarter: true,
          isDemo: true,
          demoPersonaId: personaId,
          demoShopKey: spec?.categoryKey ?? null,
          isOfficial: Boolean(data.isOfficial ?? spec?.isOfficial),
          isMuted: Boolean(data.isMuted),
          isArchived: Boolean(data.isArchived),
          isFirestoreBacked: true,
          lastMessage: typeof data.lastMessage === 'string' ? data.lastMessage : '',
          lastMessageType: mapMessageTypeFromFirestore(data.lastMessageType),
          lastMessageSenderId:
            typeof data.lastMessageSenderId === 'string' ? data.lastMessageSenderId : null,
          lastMessageAt: lastMsgAt,
          unreadCount: Number(data.unreadCount ?? 0),
          isBlocked: false,
          blockedByMe: false,
          createdAt: timestampToIso(data.createdAt),
          updatedAt: timestampToIso(data.updatedAt),
        };
      });
      list.sort((a, b) =>
        (b.lastMessageAt || b.updatedAt).localeCompare(a.lastMessageAt || a.updatedAt)
      );
      onConversations(list);
    },
    (error) => {
      onError?.(
        parseFirestoreListenerError(
          error,
          OperationType.LIST,
          `users/${safeUid}/demoConversations`
        )
      );
    }
  );
}

export function subscribeDemoConversationMessages(
  myUid: string,
  convId: string,
  pageSize: number,
  onMessages: (messages: ChatMessage[], hasMore: boolean) => void,
  onError?: (err: FirestoreListenerError) => void
): Unsubscribe {
  const safeUid = sanitizeId(myUid);
  const safeConvId = sanitizeId(convId);
  const q = query(
    collection(db, 'users', safeUid, 'demoMessages'),
    where('conversationId', '==', safeConvId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const all: ChatMessage[] = [];
      snap.docs.forEach((d) => {
        const mapped = mapFirestoreChatMessage(d.id, d.data() as Record<string, unknown>, safeUid);
        if (mapped) {
          all.push({ ...mapped, status: 'read' });
        }
      });
      all.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
      const hasMore = all.length > pageSize;
      onMessages(all.slice(-pageSize), hasMore);
    },
    (error) => {
      onError?.(
        parseFirestoreListenerError(
          error,
          OperationType.LIST,
          `users/${safeUid}/demoMessages`
        )
      );
    }
  );
}

export async function sendDemoPersonaMessage(params: {
  myUid: string;
  myName: string;
  conversation: Conversation;
  text: string;
  messageType?: MessageType;
  mediaUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  fileMime?: string | null;
  durationSec?: number | null;
  locationLat?: number | null;
  locationLng?: number | null;
  locationLabel?: string | null;
  locationExpiresAt?: string | null;
  replyToId?: string | null;
  replyToText?: string | null;
  forwardedFrom?: string | null;
}): Promise<string> {
  const myUid = sanitizeId(params.myUid);
  const convId = sanitizeId(params.conversation.id);
  const personaId = sanitizeId(params.conversation.demoPersonaId || params.conversation.peerUid || convId);
  const fsType = mapMessageTypeToFirestore(params.messageType);

  const cleanText =
    clampStr(params.text, 2000) ||
    (fsType === 'image'
      ? 'Photo'
      : fsType === 'file'
        ? params.fileName || 'Attachment'
        : fsType === 'location'
          ? params.locationLabel || 'Shared location'
          : fsType === 'audio'
            ? 'Voice note'
            : 'Message');

  const safeMedia =
    typeof params.mediaUrl === 'string' && params.mediaUrl.length <= 445000
      ? params.mediaUrl
      : null;

  const msgId = sanitizeId(`dm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const previewText =
    fsType === 'image'
      ? '📷 Photo'
      : fsType === 'file'
        ? `📎 ${clampStr(params.fileName, 60) || 'File'}`
        : fsType === 'location'
          ? `📍 ${clampStr(params.locationLabel, 80) || 'Location'}`
          : fsType === 'audio'
            ? '🎤 Voice note'
            : cleanText;

  const batch = writeBatch(db);
  batch.set(doc(db, 'users', myUid, 'demoMessages', msgId), {
    conversationId: convId,
    personaId,
    senderId: myUid,
    senderName: clampStr(params.myName, 120) || 'Member',
    text: cleanText,
    messageType: fsType,
    mediaUrl: safeMedia,
    fileName: params.fileName ? clampStr(params.fileName, 160) : null,
    fileSize: typeof params.fileSize === 'number' ? Math.max(0, Math.round(params.fileSize)) : null,
    fileMime: params.fileMime ? clampStr(params.fileMime, 100) : null,
    locationLat: typeof params.locationLat === 'number' ? params.locationLat : null,
    locationLng: typeof params.locationLng === 'number' ? params.locationLng : null,
    locationLabel: params.locationLabel ? clampStr(params.locationLabel, 160) : null,
    locationExpiresAt: params.locationExpiresAt ? clampStr(params.locationExpiresAt, 64) : null,
    durationSec:
      typeof params.durationSec === 'number'
        ? Math.max(0, Math.min(600, Math.round(params.durationSec)))
        : null,
    replyToId: params.replyToId ? sanitizeId(params.replyToId) : null,
    replyToText: params.replyToText ? clampStr(params.replyToText, 200) : null,
    forwardedFrom: params.forwardedFrom ? clampStr(params.forwardedFrom, 120) : null,
    reactions: {},
    isDemoAutoReply: false,
    createdAt: serverTimestamp(),
  });

  batch.update(doc(db, 'users', myUid, 'demoConversations', convId), {
    lastMessage: clampStr(previewText, 500),
    lastMessageType: fsType,
    lastMessageSenderId: myUid,
    lastMessageAt: serverTimestamp(),
    unreadCount: 0,
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
  return cleanText;
}

export async function triggerDemoPersonaAutoReply(params: {
  myUid: string;
  conversation: Conversation;
  userText: string;
  lang: Language;
  markUnread?: boolean;
}): Promise<void> {
  const myUid = sanitizeId(params.myUid);
  const convId = sanitizeId(params.conversation.id);
  const spec = buildPersonaSpecFromConversation(params.conversation);
  const replyText = generatePersonaAutoReply(spec, params.userText, params.lang);

  const replyId = sanitizeId(`demo_ar_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', myUid, 'demoMessages', replyId), {
    conversationId: convId,
    personaId: spec.id,
    senderId: spec.id,
    senderName: clampStr(spec.displayName, 120),
    text: clampStr(replyText, 2000),
    messageType: 'text',
    reactions: {},
    isDemoAutoReply: true,
    createdAt: serverTimestamp(),
  });

  batch.update(doc(db, 'users', myUid, 'demoConversations', convId), {
    lastMessage: clampStr(replyText, 500),
    lastMessageType: 'text',
    lastMessageSenderId: spec.id,
    lastMessageAt: serverTimestamp(),
    unreadCount: params.markUnread ? increment(1) : 0,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch {
    // Ignore if conversation was deleted before auto-reply fired
  }
}

export async function markDemoConversationRead(myUid: string, convId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', sanitizeId(myUid), 'demoConversations', sanitizeId(convId)), {
      unreadCount: 0,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal
  }
}

export async function toggleDemoConversationMute(
  myUid: string,
  convId: string,
  muted: boolean
): Promise<void> {
  await updateDoc(doc(db, 'users', sanitizeId(myUid), 'demoConversations', sanitizeId(convId)), {
    isMuted: muted,
    updatedAt: serverTimestamp(),
  });
}

export async function toggleDemoConversationArchive(
  myUid: string,
  convId: string,
  archived: boolean
): Promise<void> {
  await updateDoc(doc(db, 'users', sanitizeId(myUid), 'demoConversations', sanitizeId(convId)), {
    isArchived: archived,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteDemoConversation(myUid: string, convId: string): Promise<void> {
  const safeUid = sanitizeId(myUid);
  const safeConv = sanitizeId(convId);
  try {
    const msgsSnap = await getDocs(
      query(collection(db, 'users', safeUid, 'demoMessages'), where('conversationId', '==', safeConv))
    );
    const batch = writeBatch(db);
    msgsSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'users', safeUid, 'demoConversations', safeConv));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${safeUid}/demoConversations/${safeConv}`);
  }
}

export async function toggleDemoMessageReaction(
  myUid: string,
  message: ChatMessage,
  emoji: string
): Promise<void> {
  const safeUid = sanitizeId(myUid);
  const currentForEmoji = (message.reactions || [])
    .filter((r) => r.emoji === emoji)
    .map((r) => r.userId);
  const hasReacted = currentForEmoji.includes(safeUid);
  const nextForEmoji = hasReacted
    ? currentForEmoji.filter((u) => u !== safeUid)
    : [...currentForEmoji, safeUid];

  await updateDoc(doc(db, 'users', safeUid, 'demoMessages', message.id), {
    [`reactions.${emoji}`]: nextForEmoji,
  });
}

export async function deleteDemoMessage(myUid: string, messageId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', sanitizeId(myUid), 'demoMessages', sanitizeId(messageId)));
}

// --- Real-Time 1-to-1 Messenger Conversations ---

function mapFirestoreConversation(
  id: string,
  data: Record<string, unknown>,
  myUid: string,
  blockedSet: Set<string>,
  directoryMap: Map<string, UserDirectoryEntry>
): Conversation | null {
  if (Boolean(data.isDemo)) {
    // Legacy shared demo threads from pre-isolation builds are superseded by users/{uid}/demoConversations
    return null;
  }
  const deletedForMap = (data.deletedFor as Record<string, boolean> | undefined) || {};
  if (deletedForMap[myUid] === true) {
    return null;
  }

  const uidA = String(data.uidA ?? data.donorId ?? myUid);
  const uidB = String(data.uidB ?? data.recipientId ?? myUid);
  const peerUid = uidA === myUid ? uidB : uidA;

  const profiles =
    (data.participantProfiles as Record<string, Record<string, unknown>> | undefined) || {};
  const peerMeta = profiles[peerUid] || {};
  const liveDir = directoryMap.get(peerUid);

  const peerName =
    liveDir?.restaurantName ||
    liveDir?.displayName ||
    (typeof peerMeta.restaurantName === 'string' && peerMeta.restaurantName) ||
    (typeof peerMeta.displayName === 'string' && peerMeta.displayName) ||
    (String(data.donorId ?? '') === peerUid
      ? String(data.donorName ?? 'Community Member')
      : String(data.recipientName ?? 'Community Member'));

  const peerAvatar =
    liveDir?.photoURL || (typeof peerMeta.photoURL === 'string' ? peerMeta.photoURL : null);

  const peerRole = liveDir?.role || (typeof peerMeta.role === 'string' ? peerMeta.role : 'user');
  const peerVerified = liveDir?.verified ?? Boolean(peerMeta.verified);
  const peerArea = liveDir?.area || (typeof peerMeta.area === 'string' ? peerMeta.area : 'Dhaka');
  const peerHandle =
    liveDir?.handle ||
    (typeof peerMeta.handle === 'string'
      ? peerMeta.handle
      : generatePublicHandle(peerName, peerUid));

  const unreadMap = (data.unreadCount as Record<string, number> | undefined) || {};
  const mutedMap = (data.mutedBy as Record<string, boolean> | undefined) || {};
  const archivedMap = (data.archivedBy as Record<string, boolean> | undefined) || {};
  const typingMap = (data.typingBy as Record<string, boolean> | undefined) || {};

  const blockedByMe = blockedSet.has(peerUid);
  const lastMsgAt = timestampToIso(data.lastMessageAt ?? data.updatedAt);

  return {
    id,
    listingId: String(data.listingId ?? ''),
    claimId: '',
    donorId: String(data.donorId ?? (peerRole === 'restaurantOwner' || peerRole === 'donor' ? peerUid : uidA)),
    recipientId: String(data.recipientId ?? (peerRole === 'restaurantOwner' || peerRole === 'donor' ? myUid : uidB)),
    uidA,
    uidB,
    participants: Array.isArray(data.participants) ? (data.participants as string[]) : [uidA, uidB],
    conversationKind: data.conversationKind === 'pickup' ? 'pickup' : 'direct',
    donorRole: String(data.donorId ?? '') === peerUid ? peerRole : 'user',
    recipientRole: String(data.recipientId ?? '') === peerUid ? peerRole : 'user',
    donorName: String(data.donorId ?? '') === peerUid ? peerName : String(data.donorName ?? peerName),
    donorLogoUrl: peerAvatar,
    donorVerified: peerVerified,
    donorArea: peerArea,
    donorHours: liveDir?.openingHours ?? null,
    recipientName:
      String(data.recipientId ?? '') === peerUid
        ? peerName
        : String(data.recipientName ?? 'Neighbor'),
    recipientLogoUrl: peerAvatar,
    recipientVerified: peerVerified,
    recipientArea: peerArea,
    peerUid,
    peerHandle,
    peerRole,
    peerVerified,
    peerArea,
    peerRestaurantName: liveDir?.restaurantName ?? null,
    peerOnline: Boolean(liveDir?.online),
    peerLastSeen: liveDir?.lastSeen ?? null,
    peerTyping: Boolean(typingMap[peerUid]),
    peerBio: liveDir?.bio ?? null,
    peerBioBn: liveDir?.bioBn ?? null,
    peerRating: liveDir?.rating ?? null,
    peerReviewCount: liveDir?.reviewCount ?? null,
    listingTitle: String(data.listingTitle ?? '') || peerHandle,
    listingPhoto: peerAvatar || FOOD_CATEGORY_IMAGES.cooked,
    pickupStart: lastMsgAt,
    pickupEnd: lastMsgAt,
    claimStatus: 'requested',
    isDirect: !data.listingId || String(data.listingId).startsWith('direct_'),
    isStarter: false,
    isDemo: false,
    demoShopKey: null,
    isOfficial: Boolean(peerMeta.isOfficial),
    isMuted: Boolean(mutedMap[myUid]),
    isArchived: Boolean(archivedMap[myUid]),
    isFirestoreBacked: true,
    lastMessage: typeof data.lastMessage === 'string' ? data.lastMessage : '',
    lastMessageType: mapMessageTypeFromFirestore(data.lastMessageType),
    lastMessageSenderId:
      typeof data.lastMessageSenderId === 'string' ? data.lastMessageSenderId : null,
    lastMessageAt: lastMsgAt,
    unreadCount: Number(unreadMap[myUid] ?? 0),
    isBlocked: blockedByMe,
    blockedByMe,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

export function subscribeMyFirestoreConversations(
  myUid: string,
  getBlockedSet: () => Set<string>,
  getDirectoryMap: () => Map<string, UserDirectoryEntry>,
  onConversations: (conversations: Conversation[]) => void,
  onError?: (err: FirestoreListenerError) => void
): Unsubscribe {
  const safeUid = sanitizeId(myUid);
  const q = query(collection(db, 'conversations'), where('participants', 'array-contains', safeUid));

  return onSnapshot(
    q,
    (snap) => {
      const blockedSet = getBlockedSet();
      const directoryMap = getDirectoryMap();
      const mapped: Conversation[] = [];
      snap.docs.forEach((d) => {
        const conv = mapFirestoreConversation(
          d.id,
          d.data() as Record<string, unknown>,
          safeUid,
          blockedSet,
          directoryMap
        );
        if (conv) mapped.push(conv);
      });
      mapped.sort((a, b) =>
        (b.lastMessageAt || b.updatedAt).localeCompare(a.lastMessageAt || a.updatedAt)
      );
      onConversations(mapped);
    },
    (error) => {
      onError?.(parseFirestoreListenerError(error, OperationType.LIST, 'conversations'));
    }
  );
}

export async function getOrCreateDirectConversation(
  me: User,
  target: UserDirectoryEntry,
  initialListing?: Listing | null
): Promise<string> {
  const myUid = sanitizeId(me.id);
  const targetUid = sanitizeId(target.uid);
  if (myUid === targetUid) {
    throw new Error('Cannot start a chat with yourself');
  }

  // Proactive block check on caller's block list
  try {
    const myBlockSnap = await getDoc(doc(db, 'users', myUid, 'blocked', targetUid));
    if (myBlockSnap.exists()) {
      throw new Error('You blocked this user. Unblock them in Account Settings to send messages.');
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('You blocked this user')) {
      throw err;
    }
  }

  // Deterministic sorted ID -> guarantees exactly one 1-to-1 conversation between two people
  const convId = getDirectConversationId(myUid, targetUid);
  const [uidA, uidB] = [myUid, targetUid].sort();
  const convRef = doc(db, 'conversations', convId);

  let existingSnap;
  try {
    existingSnap = await getDoc(convRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `conversations/${convId}`);
  }

  const myDisplayName =
    me.accountType === 'restaurantOwner'
      ? me.restaurant?.restaurantName || me.donorProfile?.businessName || me.name
      : me.name;
  const myHandle = me.handle || generatePublicHandle(me.name, myUid);
  const targetName = target.restaurantName || target.displayName;

  const isTargetDonor =
    target.role === 'restaurantOwner' || target.role === 'donor' || Boolean(initialListing);

  if (existingSnap.exists()) {
    // Restore from deletedFor / archivedBy if user reopens chat
    const existingData = existingSnap.data() as Record<string, unknown>;
    const updates: Record<string, unknown> = {
      [`deletedFor.${myUid}`]: false,
      [`archivedBy.${myUid}`]: false,
      updatedAt: serverTimestamp(),
    };
    if (initialListing) {
      updates.listingId = sanitizeId(initialListing.id);
      updates.listingTitle = clampStr(initialListing.title, 140);
    }
    if (!existingData.participantProfiles) {
      updates.participantProfiles = {
        [myUid]: {
          displayName: clampStr(myDisplayName, 100),
          handle: myHandle,
          photoURL: me.donorProfile?.logoUrl || me.photoURL || null,
          role: me.isAdmin ? 'admin' : me.accountType || me.role,
          restaurantName: me.restaurant?.restaurantName || null,
          area: me.area || 'Dhaka',
          verified: Boolean(me.verified),
        },
        [targetUid]: {
          displayName: clampStr(target.displayName, 100),
          handle: target.handle,
          photoURL: target.photoURL || null,
          role: target.role,
          restaurantName: target.restaurantName || null,
          area: target.area || 'Dhaka',
          verified: Boolean(target.verified),
        },
      };
    }
    try {
      await updateDoc(convRef, updates);
    } catch {
      // Non-fatal if blocked prevents update; UI still opens the thread cleanly
    }
    return convId;
  }

  const initialPreview = initialListing
    ? `About: ${clampStr(initialListing.title, 80)}`
    : 'Started a conversation';

  try {
    await setDoc(convRef, {
      conversationKind: initialListing ? 'pickup' : 'direct',
      participants: [uidA, uidB],
      uidA,
      uidB,
      donorId: isTargetDonor ? targetUid : myUid,
      recipientId: isTargetDonor ? myUid : targetUid,
      listingId: initialListing ? sanitizeId(initialListing.id) : null,
      donorName: clampStr(isTargetDonor ? targetName : myDisplayName, 120),
      recipientName: clampStr(isTargetDonor ? myDisplayName : targetName, 120),
      listingTitle: initialListing ? clampStr(initialListing.title, 140) : null,
      participantProfiles: {
        [myUid]: {
          displayName: clampStr(myDisplayName, 100),
          handle: myHandle,
          photoURL: me.donorProfile?.logoUrl || me.photoURL || null,
          role: me.isAdmin ? 'admin' : me.accountType || me.role,
          restaurantName: me.restaurant?.restaurantName || null,
          area: me.area || 'Dhaka',
          verified: Boolean(me.verified),
        },
        [targetUid]: {
          displayName: clampStr(target.displayName, 100),
          handle: target.handle,
          photoURL: target.photoURL || null,
          role: target.role,
          restaurantName: target.restaurantName || null,
          area: target.area || 'Dhaka',
          verified: Boolean(target.verified),
        },
      },
      isDemo: false,
      lastMessage: clampStr(initialPreview, 500),
      lastMessageType: 'text',
      lastMessageSenderId: myUid,
      lastMessageAt: serverTimestamp(),
      unreadCount: { [uidA]: 0, [uidB]: 0 },
      mutedBy: {},
      archivedBy: {},
      deletedFor: {},
      typingBy: {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `conversations/${convId}`);
  }

  // Notify peer of new conversation
  void createCrossUserNotification({
    recipientUid: targetUid,
    senderUid: myUid,
    senderName: myDisplayName,
    type: 'new_conversation',
    title: `New chat from ${myDisplayName}`,
    titleBn: `${myDisplayName} নতুন চ্যাট শুরু করেছেন`,
    body: initialListing
      ? `Asked about "${initialListing.title}"`
      : 'Started a new direct conversation with you.',
    bodyBn: initialListing
      ? `"${initialListing.title}" সম্পর্কে বার্তা পাঠিয়েছেন`
      : 'আপনার সাথে সরাসরি কথোপকথন শুরু করেছেন।',
    conversationId: convId,
    listingId: initialListing?.id ?? null,
    linkTab: 'inbox',
  });

  return convId;
}

export async function openDirectChatForListingOrShop(
  me: User,
  donorId: string,
  donorName: string,
  donorArea = 'Dhaka',
  donorLogoUrl?: string | null,
  donorVerified = false,
  listing?: Listing | null
): Promise<string> {
  const safeDonorId = sanitizeId(donorId);
  if (safeDonorId.startsWith('demo_') || ALL_DEMO_PERSONAS_MAP.has(safeDonorId)) {
    const known = ALL_DEMO_PERSONAS_MAP.get(safeDonorId);
    const demoTarget: UserDirectoryEntry = {
      uid: safeDonorId,
      displayName: known?.displayName ?? donorName,
      handle: known?.handle ?? generatePublicHandle(donorName, safeDonorId),
      photoURL: known?.avatar ?? donorLogoUrl ?? null,
      role: known?.role ?? 'restaurantOwner',
      restaurantName: known?.restaurantName ?? donorName,
      area: known?.area ?? donorArea,
      verified: known?.verified ?? donorVerified,
      discoverable: true,
      online: known?.online ?? true,
      lastSeen: new Date().toISOString(),
      isDemo: true,
      bio: known?.bio ?? null,
      bioBn: known?.bioBn ?? null,
      openingHours: known?.openingHours ?? null,
      rating: known?.rating ?? null,
      reviewCount: known?.reviewCount ?? null,
    };
    return getOrCreateDemoPersonaConversation(me, demoTarget);
  }

  let target: UserDirectoryEntry | null = null;
  try {
    const snap = await getDoc(doc(db, 'userDirectory', safeDonorId));
    if (snap.exists()) {
      const d = snap.data() as Record<string, unknown>;
      target = {
        uid: String(d.uid ?? safeDonorId),
        displayName: String(d.displayName ?? donorName),
        handle: String(d.handle ?? generatePublicHandle(donorName, safeDonorId)),
        photoURL: typeof d.photoURL === 'string' ? d.photoURL : donorLogoUrl || null,
        role: parseDirectoryRole(d.role || 'restaurantOwner'),
        restaurantName: typeof d.restaurantName === 'string' ? d.restaurantName : donorName,
        area: String(d.area ?? donorArea),
        verified: Boolean(d.verified),
        discoverable: Boolean(d.discoverable ?? true),
        online: Boolean(d.online),
        lastSeen: timestampToIso(d.lastSeen),
        isDemo: Boolean(d.isDemo),
      };
      if (target.isDemo) {
        return getOrCreateDemoPersonaConversation(me, target);
      }
    }
  } catch {
    // Fallback below if donor is a catalog shop not yet in userDirectory
  }

  if (!target) {
    target = {
      uid: safeDonorId,
      displayName: donorName,
      handle: generatePublicHandle(donorName, safeDonorId),
      photoURL: donorLogoUrl || null,
      role: 'restaurantOwner',
      restaurantName: donorName,
      area: donorArea,
      verified: donorVerified,
      discoverable: true,
      online: false,
      lastSeen: new Date().toISOString(),
    };
  }

  return getOrCreateDirectConversation(me, target, listing);
}

// --- Real-Time Messages (Paginated + Delivery/Read Status) ---

function mapFirestoreChatMessage(
  id: string,
  data: Record<string, unknown>,
  myUid: string,
  peerUid?: string
): ChatMessage | null {
  const deletedFor = Array.isArray(data.deletedFor) ? (data.deletedFor as string[]) : [];
  if (deletedFor.includes(myUid)) {
    return null;
  }

  const deliveredTo = Array.isArray(data.deliveredTo) ? (data.deliveredTo as string[]) : [];
  const readBy = Array.isArray(data.readBy) ? (data.readBy as string[]) : [];
  const senderId = String(data.senderId ?? '');
  const messageType = mapMessageTypeFromFirestore(data.messageType);
  const mediaUrl = typeof data.mediaUrl === 'string' ? data.mediaUrl : null;

  const reactionsObj = (data.reactions as Record<string, string[]> | undefined) || {};
  const reactions: MessageReaction[] = [];
  Object.entries(reactionsObj).forEach(([emoji, userIds]) => {
    if (Array.isArray(userIds)) {
      userIds.forEach((uid) => reactions.push({ emoji, userId: uid }));
    }
  });

  let status: ChatMessage['status'] = 'sent';
  if (
    data.status === 'read' ||
    (peerUid && !peerUid.startsWith('demo_') && readBy.includes(peerUid)) ||
    (senderId === myUid && readBy.some((u) => u !== myUid))
  ) {
    status = 'read';
  } else if (
    data.status === 'delivered' ||
    (peerUid && deliveredTo.includes(peerUid)) ||
    deliveredTo.some((u) => u !== senderId)
  ) {
    status = 'delivered';
  }

  return {
    id,
    conversationId: String(data.conversationId ?? ''),
    senderId,
    senderName: typeof data.senderName === 'string' ? data.senderName : null,
    text: String(data.text ?? ''),
    messageType,
    imageUrl: messageType === 'image' ? mediaUrl : null,
    audioUrl: messageType === 'voice' ? mediaUrl : null,
    fileUrl: messageType === 'file' ? mediaUrl : null,
    fileName: typeof data.fileName === 'string' ? data.fileName : null,
    fileSize: typeof data.fileSize === 'number' ? data.fileSize : null,
    fileMime: typeof data.fileMime === 'string' ? data.fileMime : null,
    durationSec: typeof data.durationSec === 'number' ? data.durationSec : null,
    locationLat: typeof data.locationLat === 'number' ? data.locationLat : null,
    locationLng: typeof data.locationLng === 'number' ? data.locationLng : null,
    locationLabel: typeof data.locationLabel === 'string' ? data.locationLabel : null,
    locationExpiresAt:
      typeof data.locationExpiresAt === 'string' ? data.locationExpiresAt : null,
    forwardedFrom: typeof data.forwardedFrom === 'string' ? data.forwardedFrom : null,
    isForwarded: Boolean(data.forwardedFrom),
    replyToId: typeof data.replyToId === 'string' ? data.replyToId : null,
    replyToText: typeof data.replyToText === 'string' ? data.replyToText : null,
    sentAt: timestampToIso(data.createdAt),
    readAt: data.readAt ? timestampToIso(data.readAt) : status === 'read' ? timestampToIso(data.createdAt) : null,
    deliveredTo,
    readBy,
    deletedFor,
    reactions,
    status,
    isDemoAutoReply: Boolean(data.isDemoAutoReply),
  };
}

export function subscribeConversationMessages(
  conversationId: string,
  myUid: string,
  peerUid: string | undefined,
  pageSize: number,
  onMessages: (messages: ChatMessage[], hasMore: boolean) => void,
  onError?: (err: FirestoreListenerError) => void
): Unsubscribe {
  const safeConvId = sanitizeId(conversationId);
  const safeMyUid = sanitizeId(myUid);

  let activeUnsub: Unsubscribe = () => {};
  let disposed = false;

  const emitFromDocs = (
    docs: { id: string; data: () => Record<string, unknown> }[],
    usedSliceFallback: boolean
  ) => {
    const all: ChatMessage[] = [];
    docs.forEach((d) => {
      const m = mapFirestoreChatMessage(d.id, d.data(), safeMyUid, peerUid);
      if (m) all.push(m);
    });
    all.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    if (usedSliceFallback) {
      const hasMore = all.length > pageSize;
      onMessages(all.slice(-pageSize), hasMore);
    } else {
      onMessages(all, docs.length >= pageSize);
    }
  };

  const attachFallbackListener = () => {
    if (disposed) return;
    const fallbackQ = query(
      collection(db, 'conversations', safeConvId, 'messages'),
      where('participants', 'array-contains', safeMyUid)
    );
    activeUnsub = onSnapshot(
      fallbackQ,
      (snap) => {
        emitFromDocs(snap.docs as { id: string; data: () => Record<string, unknown> }[], true);
      },
      (err) => {
        onError?.(
          parseFirestoreListenerError(
            err,
            OperationType.LIST,
            `conversations/${safeConvId}/messages`
          )
        );
      }
    );
  };

  const primaryQ = query(
    collection(db, 'conversations', safeConvId, 'messages'),
    where('participants', 'array-contains', safeMyUid),
    orderBy('createdAt', 'desc'),
    limit(pageSize)
  );

  activeUnsub = onSnapshot(
    primaryQ,
    (snap) => {
      emitFromDocs(snap.docs as { id: string; data: () => Record<string, unknown> }[], false);
    },
    (error) => {
      const parsed = parseFirestoreListenerError(
        error,
        OperationType.LIST,
        `conversations/${safeConvId}/messages`
      );
      if (parsed.isIndexError) {
        activeUnsub();
        attachFallbackListener();
        return;
      }
      onError?.(parsed);
    }
  );

  return () => {
    disposed = true;
    activeUnsub();
  };
}

// --- Optional Storage Upload + Offline Queue & Retry ---

export async function uploadChatMediaFile(
  conversationId: string,
  senderId: string,
  file: Blob,
  fileName: string
): Promise<string | null> {
  if (!storage) return null;
  try {
    const cleanName = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)}`;
    const ref = storageRef(storage, `chatMedia/${sanitizeId(conversationId)}/${sanitizeId(senderId)}/${cleanName}`);
    await uploadBytes(ref, file);
    return await getDownloadURL(ref);
  } catch {
    return null;
  }
}

export interface QueuedMessengerMessage {
  tempId: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  text: string;
  messageType: MessageType;
  mediaUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  fileMime?: string | null;
  durationSec?: number | null;
  locationLat?: number | null;
  locationLng?: number | null;
  locationLabel?: string | null;
  locationExpiresAt?: string | null;
  replyToId?: string | null;
  replyToText?: string | null;
  forwardedFrom?: string | null;
}

const OFFLINE_QUEUE_KEY = 'rizik_fb_chat_offline_queue_v1';
const LEGACY_OFFLINE_QUEUE_KEY = 'ahar_fb_chat_offline_queue_v1';

export function readOfflineMessageQueue(uid: string): QueuedMessengerMessage[] {
  try {
    const raw =
      localStorage.getItem(`${OFFLINE_QUEUE_KEY}_${uid}`) ||
      localStorage.getItem(`${LEGACY_OFFLINE_QUEUE_KEY}_${uid}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeOfflineMessageQueue(uid: string, items: QueuedMessengerMessage[]): void {
  try {
    if (items.length === 0) {
      localStorage.removeItem(`${OFFLINE_QUEUE_KEY}_${uid}`);
    } else {
      localStorage.setItem(`${OFFLINE_QUEUE_KEY}_${uid}`, JSON.stringify(items.slice(-25)));
    }
  } catch {
    // Ignore storage quota errors
  }
}

export async function sendMessengerMessage(params: {
  conversation: Conversation;
  senderId: string;
  senderName: string;
  text: string;
  messageType?: MessageType;
  mediaUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  fileMime?: string | null;
  durationSec?: number | null;
  locationLat?: number | null;
  locationLng?: number | null;
  locationLabel?: string | null;
  locationExpiresAt?: string | null;
  replyToId?: string | null;
  replyToText?: string | null;
  forwardedFrom?: string | null;
}): Promise<void> {
  const convId = sanitizeId(params.conversation.id);
  const myUid = sanitizeId(params.senderId);
  const participants =
    params.conversation.participants && params.conversation.participants.length > 0
      ? params.conversation.participants.map(sanitizeId)
      : params.conversation.isDemo
        ? [myUid]
        : [myUid, sanitizeId(params.conversation.peerUid || params.conversation.donorId)].sort();

  const fsType = mapMessageTypeToFirestore(params.messageType);
  const cleanText =
    clampStr(params.text, 2000) ||
    (fsType === 'image'
      ? 'Photo'
      : fsType === 'file'
        ? params.fileName || 'Attachment'
        : fsType === 'location'
          ? params.locationLabel || 'Shared location'
          : fsType === 'audio'
            ? 'Voice note'
            : 'Message');

  const safeMedia =
    typeof params.mediaUrl === 'string' && params.mediaUrl.length <= 445000
      ? params.mediaUrl
      : null;

  const msgId = sanitizeId(`m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);

  const msgPayload: Record<string, unknown> = {
    conversationId: convId,
    participants,
    senderId: myUid,
    senderName: clampStr(params.senderName, 100) || 'Member',
    text: cleanText,
    messageType: fsType,
    mediaUrl: safeMedia,
    fileName: params.fileName ? clampStr(params.fileName, 160) : null,
    fileSize: typeof params.fileSize === 'number' ? Math.max(0, Math.round(params.fileSize)) : null,
    fileMime: params.fileMime ? clampStr(params.fileMime, 100) : null,
    locationLat: typeof params.locationLat === 'number' ? params.locationLat : null,
    locationLng: typeof params.locationLng === 'number' ? params.locationLng : null,
    locationLabel: params.locationLabel ? clampStr(params.locationLabel, 160) : null,
    locationExpiresAt: params.locationExpiresAt ? clampStr(params.locationExpiresAt, 64) : null,
    durationSec:
      typeof params.durationSec === 'number'
        ? Math.max(0, Math.min(600, Math.round(params.durationSec)))
        : null,
    replyToId: params.replyToId ? sanitizeId(params.replyToId) : null,
    replyToText: params.replyToText ? clampStr(params.replyToText, 200) : null,
    forwardedFrom: params.forwardedFrom ? clampStr(params.forwardedFrom, 120) : null,
    deliveredTo: [myUid],
    readBy: [myUid],
    deletedFor: [],
    reactions: {},
    status: 'sent',
    isDemoAutoReply: false,
    createdAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'conversations', convId, 'messages', msgId), msgPayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `conversations/${convId}/messages/${msgId}`);
  }

  const peerUid = params.conversation.isDemo
    ? null
    : participants.find((p) => p !== myUid) || params.conversation.peerUid || null;

  const previewText =
    fsType === 'image'
      ? '📷 Photo'
      : fsType === 'file'
        ? `📎 ${clampStr(params.fileName, 60) || 'File'}`
        : fsType === 'location'
          ? `📍 ${clampStr(params.locationLabel, 80) || 'Location'}`
          : fsType === 'audio'
            ? '🎤 Voice note'
            : cleanText;

  const convUpdates: Record<string, unknown> = {
    lastMessage: clampStr(previewText, 500),
    lastMessageType: fsType,
    lastMessageSenderId: myUid,
    lastMessageAt: serverTimestamp(),
    [`unreadCount.${myUid}`]: 0,
    [`deletedFor.${myUid}`]: false,
    [`typingBy.${myUid}`]: false,
    updatedAt: serverTimestamp(),
  };

  if (peerUid) {
    convUpdates[`unreadCount.${sanitizeId(peerUid)}`] = increment(1);
    convUpdates[`deletedFor.${sanitizeId(peerUid)}`] = false;
  }

  try {
    await updateDoc(doc(db, 'conversations', convId), convUpdates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `conversations/${convId}`);
  }

  // Notify real peer about new message / reply
  if (peerUid && peerUid !== myUid) {
    void createCrossUserNotification({
      recipientUid: peerUid,
      senderUid: myUid,
      senderName: params.senderName,
      type: params.replyToId ? 'reply' : 'new_message',
      title: `New message from ${params.senderName}`,
      titleBn: `${params.senderName} নতুন বার্তা পাঠিয়েছেন`,
      body: clampStr(previewText, 240),
      bodyBn: clampStr(previewText, 240),
      conversationId: convId,
      linkTab: 'inbox',
    });
  }
}

export async function markConversationDeliveredAndRead(
  conversation: Conversation,
  myUid: string,
  messages: ChatMessage[],
  markRead: boolean
): Promise<void> {
  const safeConvId = sanitizeId(conversation.id);
  const safeMyUid = sanitizeId(myUid);

  if (markRead && conversation.unreadCount > 0) {
    try {
      await updateDoc(doc(db, 'conversations', safeConvId), {
        [`unreadCount.${safeMyUid}`]: 0,
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Non-fatal
    }
  }

  const pendingReceipts = messages.filter((m) => {
    if (m.senderId === safeMyUid || m.pending) return false;
    const alreadyDelivered = m.deliveredTo?.includes(safeMyUid);
    const alreadyRead = m.readBy?.includes(safeMyUid);
    if (markRead) return !alreadyRead || !alreadyDelivered;
    return !alreadyDelivered;
  });

  if (pendingReceipts.length === 0) return;

  const batch = writeBatch(db);
  let writes = 0;
  for (const m of pendingReceipts.slice(-20)) {
    const msgRef = doc(db, 'conversations', safeConvId, 'messages', m.id);
    const updateData: Record<string, unknown> = {
      deliveredTo: arrayUnion(safeMyUid),
      status: markRead ? 'read' : m.status === 'read' ? 'read' : 'delivered',
    };
    if (markRead) {
      updateData.readBy = arrayUnion(safeMyUid);
      updateData.readAt = serverTimestamp();
    }
    batch.update(msgRef, updateData);
    writes += 1;
  }
  if (writes > 0) {
    try {
      await batch.commit();
    } catch {
      // Non-fatal
    }
  }
}

export async function markConversationUnreadAsDelivered(
  conversationId: string,
  myUid: string
): Promise<void> {
  const safeConvId = sanitizeId(conversationId);
  const safeMyUid = sanitizeId(myUid);
  let snap;
  try {
    const q = query(
      collection(db, 'conversations', safeConvId, 'messages'),
      where('participants', 'array-contains', safeMyUid),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    snap = await getDocs(q);
  } catch (err) {
    const parsed = parseFirestoreListenerError(
      err,
      OperationType.LIST,
      `conversations/${safeConvId}/messages`
    );
    if (!parsed.isIndexError) return;
    try {
      const fallbackQ = query(
        collection(db, 'conversations', safeConvId, 'messages'),
        where('participants', 'array-contains', safeMyUid),
        limit(15)
      );
      snap = await getDocs(fallbackQ);
    } catch {
      return;
    }
  }

  try {
    if (!snap || snap.empty) return;
    const batch = writeBatch(db);
    let writes = 0;
    snap.docs.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      const senderId = String(data.senderId ?? '');
      if (senderId === safeMyUid) return;
      const deliveredTo = Array.isArray(data.deliveredTo) ? (data.deliveredTo as string[]) : [];
      if (deliveredTo.includes(safeMyUid)) return;
      batch.update(d.ref, {
        deliveredTo: arrayUnion(safeMyUid),
        status: data.status === 'read' ? 'read' : 'delivered',
      });
      writes += 1;
    });
    if (writes > 0) {
      await batch.commit();
    }
  } catch (err) {
    console.warn('[messengerService] Failed to mark unread messages as delivered:', err);
  }
}

export async function setMessengerTyping(
  conversationId: string,
  myUid: string,
  isTyping: boolean
): Promise<void> {
  try {
    await updateDoc(doc(db, 'conversations', sanitizeId(conversationId)), {
      [`typingBy.${sanitizeId(myUid)}`]: isTyping,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Ignore typing errors on blocked/deleted threads
  }
}

export async function toggleConversationMute(
  conversationId: string,
  myUid: string,
  muted: boolean
): Promise<void> {
  const safeId = sanitizeId(conversationId);
  try {
    await updateDoc(doc(db, 'conversations', safeId), {
      [`mutedBy.${sanitizeId(myUid)}`]: muted,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `conversations/${safeId}`);
  }
}

export async function toggleConversationArchive(
  conversationId: string,
  myUid: string,
  archived: boolean
): Promise<void> {
  const safeId = sanitizeId(conversationId);
  try {
    await updateDoc(doc(db, 'conversations', safeId), {
      [`archivedBy.${sanitizeId(myUid)}`]: archived,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `conversations/${safeId}`);
  }
}

export async function deleteConversationForMe(
  conversation: Conversation,
  myUid: string
): Promise<void> {
  const safeId = sanitizeId(conversation.id);
  const safeMyUid = sanitizeId(myUid);
  try {
    await updateDoc(doc(db, 'conversations', safeId), {
      [`deletedFor.${safeMyUid}`]: true,
      [`unreadCount.${safeMyUid}`]: 0,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `conversations/${safeId}`);
  }
}

export async function deleteMessageForMe(
  conversationId: string,
  messageId: string,
  myUid: string
): Promise<void> {
  const safeConv = sanitizeId(conversationId);
  const safeMsg = sanitizeId(messageId);
  try {
    await updateDoc(doc(db, 'conversations', safeConv, 'messages', safeMsg), {
      deletedFor: arrayUnion(sanitizeId(myUid)),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `conversations/${safeConv}/messages/${safeMsg}`
    );
  }
}

export async function toggleMessengerReaction(
  conversationId: string,
  message: ChatMessage,
  myUid: string,
  emoji: string
): Promise<void> {
  const safeConv = sanitizeId(conversationId);
  const safeMyUid = sanitizeId(myUid);
  const currentForEmoji = (message.reactions || [])
    .filter((r) => r.emoji === emoji)
    .map((r) => r.userId);
  const hasReacted = currentForEmoji.includes(safeMyUid);
  const nextForEmoji = hasReacted
    ? currentForEmoji.filter((u) => u !== safeMyUid)
    : [...currentForEmoji, safeMyUid];

  try {
    await updateDoc(doc(db, 'conversations', safeConv, 'messages', message.id), {
      [`reactions.${emoji}`]: nextForEmoji,
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `conversations/${safeConv}/messages/${message.id}`
    );
  }
}

export async function forwardMessengerMessage(params: {
  targets: Conversation[];
  sourceMessage: ChatMessage;
  senderId: string;
  senderName: string;
  forwardedFromLabel: string;
}): Promise<void> {
  const mediaUrl =
    params.sourceMessage.imageUrl ||
    params.sourceMessage.fileUrl ||
    params.sourceMessage.audioUrl ||
    null;

  for (const target of params.targets) {
    await sendMessengerMessage({
      conversation: target,
      senderId: params.senderId,
      senderName: params.senderName,
      text: params.sourceMessage.text,
      messageType: params.sourceMessage.messageType || 'text',
      mediaUrl,
      fileName: params.sourceMessage.fileName,
      fileSize: params.sourceMessage.fileSize,
      fileMime: params.sourceMessage.fileMime,
      durationSec: params.sourceMessage.durationSec,
      locationLat: params.sourceMessage.locationLat,
      locationLng: params.sourceMessage.locationLng,
      locationLabel: params.sourceMessage.locationLabel,
      forwardedFrom: params.forwardedFromLabel,
    });
  }
}

export { getDocs };
