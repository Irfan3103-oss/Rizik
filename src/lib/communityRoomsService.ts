import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  db,
  type FirestoreListenerError,
  handleFirestoreError,
  OperationType,
  parseFirestoreListenerError,
} from '../firebase';
import {
  ALL_DEMO_PERSONAS_MAP,
  COMMUNITY_ROOM_SPECS,
  DEMO_PERSONAS,
  personaToDirectoryEntry,
} from '../data/demoPersonas';
import type {
  CommunityRoom,
  DirectoryRole,
  RoomMember,
  RoomMessage,
  User,
} from '../types';
import { generatePublicHandle, uploadChatMediaFile } from './messengerService';

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

function extractErrCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string') {
    return String((error as { code: string }).code);
  }
  const msg = error instanceof Error ? error.message : String(error ?? '');
  if (msg.includes('permission-denied')) return 'permission-denied';
  if (msg.includes('failed-precondition')) return 'failed-precondition';
  return 'unknown';
}

function mapDirectoryRole(user: User): DirectoryRole {
  if (user.isAdmin) return 'admin';
  if (user.accountType === 'restaurantOwner') return 'restaurantOwner';
  if (user.role === 'donor') return 'donor';
  return 'user';
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

export interface DemoSeedProgress {
  step: string;
  current: number;
  total: number;
}

export interface DemoSeedErrorItem {
  step: string;
  code: string;
  message: string;
}

export interface DemoSeedSummary {
  personasCreated: number;
  personasUpdated: number;
  personasTotal: number;
  roomsCreated: number;
  roomsUpdated: number;
  roomsTotal: number;
  messagesCreated: number;
  messagesAlreadyExisted: number;
  totalRoomMessages: number;
  verifiedPersonasCount: number;
  verifiedRoomsCount: number;
  verifiedMessagesCount: number;
  errors: DemoSeedErrorItem[];
  // Backwards-compatible aliases
  personasCount: number;
  roomsCount: number;
  messagesWritten: number;
}

/**
 * Admin-only idempotent demo seeding with step-by-step verification:
 * 1) 14 Bangladeshi demo personas in userDirectory/{personaId}
 * 2) 3 pinned Rizik Community rooms in rooms/{roomId} + room members
 * 3) 22-24 bilingual realistic messages per room with fixed deterministic IDs
 * 4) Post-seed verification reads confirming records exist in Firestore
 */
export async function seedAllDemoData(
  _adminUid: string,
  onProgress?: (p: DemoSeedProgress) => void
): Promise<DemoSeedSummary> {
  const totalSteps =
    DEMO_PERSONAS.length +
    COMMUNITY_ROOM_SPECS.length +
    COMMUNITY_ROOM_SPECS.reduce((sum, r) => sum + r.messages.length, 0) +
    1; // +1 for verification readback step
  let completed = 0;

  let personasCreated = 0;
  let personasUpdated = 0;
  let roomsCreated = 0;
  let roomsUpdated = 0;
  let messagesCreated = 0;
  let messagesAlreadyExisted = 0;
  let totalRoomMessages = 0;
  let verifiedPersonasCount = 0;
  let verifiedRoomsCount = 0;
  let verifiedMessagesCount = 0;
  const errors: DemoSeedErrorItem[] = [];

  const recordError = (step: string, err: unknown) => {
    const code = extractErrCode(err);
    const message = err instanceof Error ? err.message : String(err ?? 'Unknown error');
    console.error(`[seedAllDemoData] ${step} (${code}):`, err);
    errors.push({ step, code, message });
  };

  onProgress?.({
    step: 'Checking existing demo profiles in Find People directory...',
    current: 0,
    total: totalSteps,
  });

  // 1. Seed Demo Personas into userDirectory
  const existingDemoIds = new Set<string>();
  try {
    const existingDirSnap = await getDocs(
      query(collection(db, 'userDirectory'), where('isDemo', '==', true))
    );
    existingDirSnap.docs.forEach((d) => existingDemoIds.add(d.id));
  } catch (err) {
    recordError('Query existing demo personas', err);
    // Check individually by doc ID so we know create vs update cleanly
    for (const p of DEMO_PERSONAS) {
      try {
        const snap = await getDoc(doc(db, 'userDirectory', p.id));
        if (snap.exists()) existingDemoIds.add(p.id);
      } catch (innerErr) {
        recordError(`Inspect persona ${p.id}`, innerErr);
        break;
      }
    }
  }

  try {
    const dirBatch = writeBatch(db);
    for (const persona of DEMO_PERSONAS) {
      const entry = personaToDirectoryEntry(persona);
      const ref = doc(db, 'userDirectory', persona.id);
      const payload: Record<string, unknown> = {
        uid: persona.id,
        displayName: clampStr(entry.displayName, 100),
        handle: clampStr(entry.handle, 40),
        photoURL: entry.photoURL ?? null,
        role: entry.role,
        restaurantName: entry.restaurantName ? clampStr(entry.restaurantName, 120) : null,
        restaurantType: entry.restaurantType ? clampStr(entry.restaurantType, 40) : null,
        area: clampStr(entry.area, 80) || 'Dhaka',
        verified: Boolean(entry.verified),
        discoverable: true,
        online: Boolean(persona.online),
        isDemo: true,
        bio: clampStr(persona.bio, 260),
        bioBn: clampStr(persona.bioBn, 340),
        openingHours: persona.openingHours ? clampStr(persona.openingHours, 80) : null,
        rating: typeof persona.rating === 'number' ? persona.rating : null,
        reviewCount: typeof persona.reviewCount === 'number' ? persona.reviewCount : null,
        lastSeen: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (existingDemoIds.has(persona.id)) {
        dirBatch.update(ref, payload);
        personasUpdated += 1;
      } else {
        dirBatch.set(ref, {
          ...payload,
          createdAt: serverTimestamp(),
        });
        personasCreated += 1;
      }
      completed += 1;
    }
    await dirBatch.commit();
  } catch (err) {
    recordError('Write demo personas to userDirectory', err);
    completed += DEMO_PERSONAS.length - Math.min(completed, DEMO_PERSONAS.length);
  }

  onProgress?.({
    step: `Seeded ${personasCreated} new & updated ${personasUpdated} demo profiles`,
    current: completed,
    total: totalSteps,
  });

  // 2. Seed Rooms + Members + Messages
  for (const roomSpec of COMMUNITY_ROOM_SPECS) {
    const roomRef = doc(db, 'rooms', roomSpec.id);
    let roomExists = false;
    let existingMuted: unknown[] = [];

    try {
      const roomSnap = await getDoc(roomRef);
      roomExists = roomSnap.exists();
      if (roomExists && Array.isArray(roomSnap.data()?.mutedUids)) {
        existingMuted = roomSnap.data()?.mutedUids as unknown[];
      }
    } catch (err) {
      recordError(`Read room ${roomSpec.id}`, err);
    }

    const roomPersonas = DEMO_PERSONAS.filter((p) => {
      if (roomSpec.id === 'room_rizik_community') return true;
      if (roomSpec.id === 'room_restaurant_corner') {
        return (
          p.role === 'restaurantOwner' ||
          p.role === 'organizer' ||
          p.role === 'ngo' ||
          p.id === 'demo_persona_vol_tanvir'
        );
      }
      return (
        p.role === 'volunteer' ||
        p.role === 'organizer' ||
        p.role === 'ngo' ||
        p.id === 'demo_persona_hotel_gulshan' ||
        p.id === 'demo_persona_rec_farhana'
      );
    });

    const lastMsgSpec = roomSpec.messages[roomSpec.messages.length - 1];
    const lastSender = ALL_DEMO_PERSONAS_MAP.get(lastMsgSpec.personaId);
    const lastMsgTs = Timestamp.fromMillis(Date.now() - lastMsgSpec.offsetMinutesAgo * 60_000);

    let existingRealMembersCount = 0;
    let existingRealOnlineCount = 0;
    try {
      const existingRealMembersSnap = await getDocs(
        collection(db, 'rooms', roomSpec.id, 'members')
      );
      existingRealMembersSnap.docs.forEach((d) => {
        const m = d.data() as Record<string, unknown>;
        if (!m.isDemo) {
          existingRealMembersCount += 1;
          if (m.online) existingRealOnlineCount += 1;
        }
      });
    } catch (err) {
      recordError(`Read members for ${roomSpec.id}`, err);
    }

    const onlineDemoCount = roomPersonas.filter((p) => p.online).length;
    const roomPayload: Record<string, unknown> = {
      slug: roomSpec.slug,
      name: clampStr(roomSpec.name, 100),
      nameBn: clampStr(roomSpec.nameBn, 120),
      description: clampStr(roomSpec.description, 300),
      descriptionBn: clampStr(roomSpec.descriptionBn, 400),
      iconKey: roomSpec.iconKey,
      pinnedOrder: roomSpec.pinnedOrder,
      memberCount: roomPersonas.length + existingRealMembersCount,
      onlineCount: onlineDemoCount + existingRealOnlineCount,
      lastMessage: clampStr(lastMsgSpec.text, 500),
      lastMessageSenderName: clampStr(lastSender?.displayName || 'Rizik Member', 120),
      lastMessageAt: lastMsgTs,
      mutedUids: existingMuted,
      isDemoSeeded: true,
      updatedAt: serverTimestamp(),
    };

    try {
      if (roomExists) {
        await updateDoc(roomRef, roomPayload);
        roomsUpdated += 1;
      } else {
        await setDocCompatCreate(roomRef, {
          ...roomPayload,
          createdAt: serverTimestamp(),
        });
        roomsCreated += 1;
      }
    } catch (err) {
      recordError(`${roomExists ? 'Update' : 'Create'} room ${roomSpec.id}`, err);
    }

    // Seed demo members in room
    try {
      const memberBatch = writeBatch(db);
      for (const p of roomPersonas) {
        memberBatch.set(doc(db, 'rooms', roomSpec.id, 'members', p.id), {
          uid: p.id,
          displayName: clampStr(p.displayName, 100),
          handle: clampStr(p.handle, 40),
          photoURL: p.avatar ?? null,
          role: p.role,
          area: clampStr(p.area, 80),
          online: Boolean(p.online),
          isDemo: true,
          lastMessageAt: null,
          updatedAt: serverTimestamp(),
        });
      }
      await memberBatch.commit();
    } catch (err) {
      recordError(`Seed members for ${roomSpec.id}`, err);
    }
    completed += 1;

    // Fetch existing messages in room to make seeding idempotent & non-destructive
    const existingMsgIds = new Set<string>();
    try {
      const existingMsgsSnap = await getDocs(collection(db, 'rooms', roomSpec.id, 'messages'));
      existingMsgsSnap.docs.forEach((d) => existingMsgIds.add(d.id));
    } catch (err) {
      recordError(`Read existing messages for ${roomSpec.id}`, err);
    }

    // Chunked safe writes (max 150 per batch)
    const pendingMsgs: Array<{ id: string; data: Record<string, unknown> }> = [];
    for (const msgSpec of roomSpec.messages) {
      totalRoomMessages += 1;
      const msgId = sanitizeId(`seed_${roomSpec.id}_${msgSpec.idSuffix}`);
      if (existingMsgIds.has(msgId)) {
        messagesAlreadyExisted += 1;
        completed += 1;
        continue;
      }

      const sender = ALL_DEMO_PERSONAS_MAP.get(msgSpec.personaId);
      if (sender) {
        const replySpec = msgSpec.replyToSuffix
          ? roomSpec.messages.find((x) => x.idSuffix === msgSpec.replyToSuffix)
          : undefined;
        const replySender = replySpec
          ? ALL_DEMO_PERSONAS_MAP.get(replySpec.personaId)
          : undefined;

        pendingMsgs.push({
          id: msgId,
          data: {
            roomId: roomSpec.id,
            senderId: sender.id,
            senderName: clampStr(sender.displayName, 120),
            senderHandle: clampStr(sender.handle, 40),
            senderAvatar: sender.avatar ?? null,
            senderRole: sender.role,
            senderArea: clampStr(sender.area, 80),
            senderVerified: Boolean(sender.verified),
            senderIsDemo: true,
            text: clampStr(msgSpec.text, 2000),
            messageType: 'text',
            mediaUrl: null,
            replyToId: msgSpec.replyToSuffix
              ? sanitizeId(`seed_${roomSpec.id}_${msgSpec.replyToSuffix}`)
              : null,
            replyToText: replySpec ? clampStr(replySpec.text, 200) : null,
            replyToSenderName: replySender ? clampStr(replySender.displayName, 120) : null,
            reactions: msgSpec.reactions ?? {},
            reportedBy: [],
            deleted: false,
            isDemo: true,
            createdAt: Timestamp.fromMillis(Date.now() - msgSpec.offsetMinutesAgo * 60_000),
          },
        });
      }
      completed += 1;
    }

    for (let i = 0; i < pendingMsgs.length; i += 150) {
      const chunk = pendingMsgs.slice(i, i + 150);
      const batch = writeBatch(db);
      for (const item of chunk) {
        batch.set(doc(db, 'rooms', roomSpec.id, 'messages', item.id), item.data);
      }
      try {
        await batch.commit();
        messagesCreated += chunk.length;
      } catch (err) {
        recordError(`Write messages for ${roomSpec.id}`, err);
      }
    }

    onProgress?.({
      step: `Seeded ${roomSpec.name} (${roomSpec.messages.length} messages checked)`,
      current: completed,
      total: totalSteps,
    });
  }

  // 3. Post-seed Read-Back Verification
  onProgress?.({
    step: 'Verifying seeded personas, rooms, and messages in Firestore...',
    current: completed,
    total: totalSteps,
  });

  try {
    const verifyDirSnap = await getDocs(
      query(collection(db, 'userDirectory'), where('isDemo', '==', true))
    );
    verifiedPersonasCount = verifyDirSnap.size;
  } catch (err) {
    recordError('Verify seeded personas read-back', err);
  }

  try {
    const verifyRoomsSnap = await getDocs(collection(db, 'rooms'));
    verifiedRoomsCount = verifyRoomsSnap.size;
    for (const roomSpec of COMMUNITY_ROOM_SPECS) {
      const verifyMsgsSnap = await getDocs(
        collection(db, 'rooms', roomSpec.id, 'messages')
      );
      verifiedMessagesCount += verifyMsgsSnap.size;
    }
  } catch (err) {
    recordError('Verify seeded rooms & messages read-back', err);
  }

  completed += 1;
  onProgress?.({
    step: 'Verification complete',
    current: totalSteps,
    total: totalSteps,
  });

  return {
    personasCreated,
    personasUpdated,
    personasTotal: DEMO_PERSONAS.length,
    roomsCreated,
    roomsUpdated,
    roomsTotal: COMMUNITY_ROOM_SPECS.length,
    messagesCreated,
    messagesAlreadyExisted,
    totalRoomMessages,
    verifiedPersonasCount,
    verifiedRoomsCount,
    verifiedMessagesCount,
    errors,
    personasCount: verifiedPersonasCount || DEMO_PERSONAS.length,
    roomsCount: verifiedRoomsCount || COMMUNITY_ROOM_SPECS.length,
    messagesWritten: messagesCreated,
  };
}

async function setDocCompatCreate(
  ref: ReturnType<typeof doc>,
  data: Record<string, unknown>
): Promise<void> {
  const batch = writeBatch(db);
  batch.set(ref, data);
  await batch.commit();
}

export async function removeAllDemoData(
  onProgress?: (p: DemoSeedProgress) => void
): Promise<{ deletedPersonas: number; deletedMessages: number; deletedRooms: number }> {
  let deletedPersonas = 0;
  let deletedMessages = 0;
  let deletedRooms = 0;

  onProgress?.({ step: 'Removing demo profiles...', current: 1, total: 4 });

  // 1. Delete demo personas from userDirectory
  const demoDirSnap = await getDocs(
    query(collection(db, 'userDirectory'), where('isDemo', '==', true))
  ).catch(() => null);
  const idsToDelete = new Set<string>(DEMO_PERSONAS.map((p) => p.id));
  demoDirSnap?.docs.forEach((d) => idsToDelete.add(d.id));

  const dirChunk = Array.from(idsToDelete);
  for (let i = 0; i < dirChunk.length; i += 250) {
    const batch = writeBatch(db);
    for (const id of dirChunk.slice(i, i + 250)) {
      batch.delete(doc(db, 'userDirectory', id));
      deletedPersonas += 1;
    }
    await batch.commit().catch(() => {});
  }

  onProgress?.({ step: 'Cleaning community rooms...', current: 2, total: 4 });

  // 2. Clean seeded messages & demo members in rooms
  const roomsSnap = await getDocs(collection(db, 'rooms')).catch(() => null);
  const roomIds = new Set<string>(COMMUNITY_ROOM_SPECS.map((r) => r.id));
  roomsSnap?.docs.forEach((d) => {
    if (d.data()?.isDemoSeeded) roomIds.add(d.id);
  });

  for (const roomId of roomIds) {
    const msgsSnap = await getDocs(collection(db, 'rooms', roomId, 'messages')).catch(() => null);
    const demoMsgDocs = msgsSnap?.docs.filter((d) => Boolean(d.data()?.isDemo)) ?? [];
    const realMsgDocs = msgsSnap?.docs.filter((d) => !d.data()?.isDemo) ?? [];

    for (let i = 0; i < demoMsgDocs.length; i += 250) {
      const batch = writeBatch(db);
      for (const mDoc of demoMsgDocs.slice(i, i + 250)) {
        batch.delete(mDoc.ref);
        deletedMessages += 1;
      }
      await batch.commit();
    }

    const memSnap = await getDocs(collection(db, 'rooms', roomId, 'members')).catch(() => null);
    const demoMemDocs = memSnap?.docs.filter((d) => Boolean(d.data()?.isDemo)) ?? [];
    const realMemDocs = memSnap?.docs.filter((d) => !d.data()?.isDemo) ?? [];

    for (let i = 0; i < demoMemDocs.length; i += 250) {
      const batch = writeBatch(db);
      for (const mDoc of demoMemDocs.slice(i, i + 250)) {
        batch.delete(mDoc.ref);
      }
      await batch.commit();
    }

    if (realMsgDocs.length === 0) {
      try {
        await deleteDoc(doc(db, 'rooms', roomId));
        deletedRooms += 1;
      } catch {
        // Ignore if room didn't exist
      }
    } else {
      const sortedReal = [...realMsgDocs].sort((a, b) =>
        timestampToIso(b.data()?.createdAt).localeCompare(timestampToIso(a.data()?.createdAt))
      );
      const latest = sortedReal[0]?.data() as Record<string, unknown> | undefined;
      await updateDoc(doc(db, 'rooms', roomId), {
        isDemoSeeded: false,
        memberCount: realMemDocs.length,
        onlineCount: realMemDocs.filter((d) => Boolean(d.data()?.online)).length,
        lastMessage: latest ? clampStr(String(latest.text ?? ''), 500) : 'Community room',
        lastMessageSenderName: latest
          ? clampStr(String(latest.senderName ?? 'Member'), 120)
          : 'Rizik',
        lastMessageAt: latest?.createdAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
  }

  onProgress?.({ step: 'Demo cleanup complete', current: 4, total: 4 });
  return { deletedPersonas, deletedMessages, deletedRooms };
}

// --- Real-Time Subscriptions for Community Rooms ---

function mapCommunityRoomDoc(id: string, data: Record<string, unknown>): CommunityRoom {
  const iconRaw = String(data.iconKey ?? 'community');
  const iconKey: CommunityRoom['iconKey'] =
    iconRaw === 'restaurant' || iconRaw === 'volunteer' ? iconRaw : 'community';
  return {
    id,
    slug: String(data.slug ?? id),
    name: String(data.name ?? 'Rizik Community'),
    nameBn: String(data.nameBn ?? data.name ?? 'রিজিক কমিউনিটি'),
    description: String(data.description ?? ''),
    descriptionBn: String(data.descriptionBn ?? data.description ?? ''),
    iconKey,
    pinnedOrder: Number(data.pinnedOrder ?? 0),
    memberCount: Number(data.memberCount ?? 0),
    onlineCount: Number(data.onlineCount ?? 0),
    lastMessage: String(data.lastMessage ?? ''),
    lastMessageSenderName: String(data.lastMessageSenderName ?? ''),
    lastMessageAt: timestampToIso(data.lastMessageAt ?? data.updatedAt),
    mutedUids: Array.isArray(data.mutedUids) ? (data.mutedUids as string[]) : [],
    isDemoSeeded: Boolean(data.isDemoSeeded),
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

export function subscribeCommunityRooms(
  onRooms: (rooms: CommunityRoom[]) => void,
  onError?: (err: FirestoreListenerError) => void
): Unsubscribe {
  let activeUnsub: Unsubscribe = () => {};
  let disposed = false;

  const attachFallback = () => {
    if (disposed) return;
    activeUnsub = onSnapshot(
      collection(db, 'rooms'),
      (snap) => {
        const rooms = snap.docs
          .map((d) => mapCommunityRoomDoc(d.id, d.data() as Record<string, unknown>))
          .sort((a, b) => a.pinnedOrder - b.pinnedOrder);
        onRooms(rooms);
      },
      (err) => {
        onError?.(parseFirestoreListenerError(err, OperationType.LIST, 'rooms'));
      }
    );
  };

  const q = query(collection(db, 'rooms'), orderBy('pinnedOrder', 'asc'));
  activeUnsub = onSnapshot(
    q,
    (snap) => {
      const rooms = snap.docs.map((d) =>
        mapCommunityRoomDoc(d.id, d.data() as Record<string, unknown>)
      );
      onRooms(rooms);
    },
    (error) => {
      const parsed = parseFirestoreListenerError(error, OperationType.LIST, 'rooms');
      if (parsed.isIndexError) {
        activeUnsub();
        attachFallback();
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

function mapRoomMessageDoc(
  id: string,
  data: Record<string, unknown>,
  safeRoomId: string
): RoomMessage {
  return {
    id,
    roomId: String(data.roomId ?? safeRoomId),
    senderId: String(data.senderId ?? ''),
    senderName: String(data.senderName ?? 'Member'),
    senderHandle: typeof data.senderHandle === 'string' ? data.senderHandle : null,
    senderAvatar: typeof data.senderAvatar === 'string' ? data.senderAvatar : null,
    senderRole: parseDirectoryRole(data.senderRole),
    senderArea: typeof data.senderArea === 'string' ? data.senderArea : null,
    senderVerified: Boolean(data.senderVerified),
    senderIsDemo: Boolean(data.senderIsDemo),
    text: String(data.text ?? ''),
    messageType: data.messageType === 'image' ? 'image' : 'text',
    mediaUrl: typeof data.mediaUrl === 'string' ? data.mediaUrl : null,
    replyToId: typeof data.replyToId === 'string' ? data.replyToId : null,
    replyToText: typeof data.replyToText === 'string' ? data.replyToText : null,
    replyToSenderName:
      typeof data.replyToSenderName === 'string' ? data.replyToSenderName : null,
    reactions: (data.reactions as Record<string, string[]> | undefined) || {},
    reportedBy: Array.isArray(data.reportedBy) ? (data.reportedBy as string[]) : [],
    deleted: Boolean(data.deleted),
    isDemo: Boolean(data.isDemo),
    createdAt: timestampToIso(data.createdAt),
  };
}

export function subscribeRoomMessages(
  roomId: string,
  pageSize: number,
  onMessages: (messages: RoomMessage[], hasMore: boolean) => void,
  onError?: (err: FirestoreListenerError) => void
): Unsubscribe {
  const safeRoomId = sanitizeId(roomId);
  const safeLimit = Math.max(20, pageSize);
  let activeUnsub: Unsubscribe = () => {};
  let disposed = false;

  const attachFallback = () => {
    if (disposed) return;
    activeUnsub = onSnapshot(
      collection(db, 'rooms', safeRoomId, 'messages'),
      (snap) => {
        const list = snap.docs
          .map((d) => mapRoomMessageDoc(d.id, d.data() as Record<string, unknown>, safeRoomId))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const hasMore = list.length > safeLimit;
        onMessages(list.slice(-safeLimit), hasMore);
      },
      (err) => {
        onError?.(
          parseFirestoreListenerError(err, OperationType.LIST, `rooms/${safeRoomId}/messages`)
        );
      }
    );
  };

  const q = query(
    collection(db, 'rooms', safeRoomId, 'messages'),
    orderBy('createdAt', 'desc'),
    limit(safeLimit)
  );

  activeUnsub = onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => mapRoomMessageDoc(d.id, d.data() as Record<string, unknown>, safeRoomId))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      onMessages(list, snap.docs.length >= safeLimit);
    },
    (error) => {
      const parsed = parseFirestoreListenerError(
        error,
        OperationType.LIST,
        `rooms/${safeRoomId}/messages`
      );
      if (parsed.isIndexError) {
        activeUnsub();
        attachFallback();
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

export function subscribeRoomMembers(
  roomId: string,
  onMembers: (members: RoomMember[]) => void,
  onError?: (err: FirestoreListenerError) => void
): Unsubscribe {
  const safeRoomId = sanitizeId(roomId);
  const q = query(collection(db, 'rooms', safeRoomId, 'members'), limit(120));
  return onSnapshot(
    q,
    (snap) => {
      const members: RoomMember[] = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          uid: String(data.uid ?? d.id),
          displayName: String(data.displayName ?? 'Member'),
          handle: typeof data.handle === 'string' ? data.handle : null,
          photoURL: typeof data.photoURL === 'string' ? data.photoURL : null,
          role: parseDirectoryRole(data.role),
          area: typeof data.area === 'string' ? data.area : null,
          online: Boolean(data.online),
          isDemo: Boolean(data.isDemo),
          lastMessageAt: data.lastMessageAt ? timestampToIso(data.lastMessageAt) : null,
          updatedAt: timestampToIso(data.updatedAt),
        };
      });
      members.sort((a, b) => {
        if (a.online !== b.online) return a.online ? -1 : 1;
        return a.displayName.localeCompare(b.displayName);
      });
      onMembers(members);
    },
    (error) => {
      const parsed = parseFirestoreListenerError(
        error,
        OperationType.LIST,
        `rooms/${safeRoomId}/members`
      );
      onError?.(parsed);
    }
  );
}

export async function ensureRoomMemberPresence(
  roomId: string,
  user: User,
  online = true
): Promise<{ ok: boolean; action: 'created' | 'updated' | 'error'; error?: string }> {
  const safeRoomId = sanitizeId(roomId);
  const uid = sanitizeId(user.id);
  const memberRef = doc(db, 'rooms', safeRoomId, 'members', uid);
  const displayName =
    user.accountType === 'restaurantOwner'
      ? clampStr(user.restaurant?.restaurantName || user.donorProfile?.businessName || user.name, 100)
      : clampStr(user.name, 100);
  const handle = clampStr(user.handle || generatePublicHandle(displayName, uid), 40);
  const avatar = user.restaurant?.restaurantPhotoUrl || user.donorProfile?.logoUrl || user.photoURL || null;

  try {
    const snap = await getDoc(memberRef);
    const payload: Record<string, unknown> = {
      uid,
      displayName: displayName || 'Community Member',
      handle,
      photoURL: typeof avatar === 'string' && avatar.length <= 248000 ? avatar : null,
      role: mapDirectoryRole(user),
      area: clampStr(user.area, 80) || 'Dhaka',
      online,
      isDemo: false,
      updatedAt: serverTimestamp(),
    };
    if (snap.exists()) {
      await updateDoc(memberRef, payload);
      return { ok: true, action: 'updated' };
    } else {
      const batch = writeBatch(db);
      batch.set(memberRef, { ...payload, lastMessageAt: null });
      await batch.commit();
      return { ok: true, action: 'created' };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[communityRoomsService] Failed to sync member presence in ${safeRoomId}:`, err);
    return { ok: false, action: 'error', error: msg };
  }
}

export async function sendRoomMessage(params: {
  room: CommunityRoom;
  user: User;
  text: string;
  file?: Blob | null;
  mediaUrlFallback?: string | null;
  replyTo?: RoomMessage | null;
}): Promise<void> {
  const roomId = sanitizeId(params.room.id);
  const myUid = sanitizeId(params.user.id);
  const trimmed = clampStr(params.text, 2000);
  if (!trimmed && !params.file && !params.mediaUrlFallback) return;

  if (params.room.mutedUids.includes(myUid)) {
    throw new Error('You are currently muted in this room by a moderator.');
  }

  let mediaUrl: string | null = params.mediaUrlFallback ?? null;
  if (params.file) {
    const uploaded = await uploadChatMediaFile(
      roomId,
      myUid,
      params.file,
      `room_img_${Date.now()}.jpg`
    );
    if (uploaded) {
      mediaUrl = uploaded;
    }
  }
  if (mediaUrl && mediaUrl.length > 445000) {
    mediaUrl = null;
  }

  const messageType: 'text' | 'image' = mediaUrl ? 'image' : 'text';
  const cleanText = trimmed || (messageType === 'image' ? '📷 Shared a photo' : 'Message');

  const senderName =
    params.user.accountType === 'restaurantOwner'
      ? clampStr(
          params.user.restaurant?.restaurantName ||
            params.user.donorProfile?.businessName ||
            params.user.name,
          120
        )
      : clampStr(params.user.name, 120) || 'Community Member';
  const senderHandle = clampStr(
    params.user.handle || generatePublicHandle(senderName, myUid),
    40
  );
  const rawAvatar =
    params.user.restaurant?.restaurantPhotoUrl ||
    params.user.donorProfile?.logoUrl ||
    params.user.photoURL ||
    null;
  const senderAvatar =
    typeof rawAvatar === 'string' && rawAvatar.length <= 248000 ? rawAvatar : null;

  const msgId = sanitizeId(`rm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const batch = writeBatch(db);

  batch.set(doc(db, 'rooms', roomId, 'messages', msgId), {
    roomId,
    senderId: myUid,
    senderName,
    senderHandle,
    senderAvatar,
    senderRole: mapDirectoryRole(params.user),
    senderArea: clampStr(params.user.area, 80) || 'Dhaka',
    senderVerified: Boolean(params.user.verified),
    senderIsDemo: false,
    text: cleanText,
    messageType,
    mediaUrl,
    replyToId: params.replyTo ? sanitizeId(params.replyTo.id) : null,
    replyToText: params.replyTo ? clampStr(params.replyTo.text, 200) : null,
    replyToSenderName: params.replyTo ? clampStr(params.replyTo.senderName, 120) : null,
    reactions: {},
    reportedBy: [],
    deleted: false,
    isDemo: false,
    createdAt: serverTimestamp(),
  });

  batch.set(doc(db, 'rooms', roomId, 'members', myUid), {
    uid: myUid,
    displayName: clampStr(senderName, 100),
    handle: senderHandle,
    photoURL: senderAvatar,
    role: mapDirectoryRole(params.user),
    area: clampStr(params.user.area, 80) || 'Dhaka',
    online: true,
    isDemo: false,
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'rooms', roomId), {
    lastMessage: clampStr(messageType === 'image' && !trimmed ? '📷 Photo' : cleanText, 500),
    lastMessageSenderName: senderName,
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `rooms/${roomId}/messages/${msgId}`);
    throw error;
  }
}

export async function toggleRoomMessageReaction(
  roomId: string,
  message: RoomMessage,
  myUid: string,
  emoji: string
): Promise<void> {
  const safeRoom = sanitizeId(roomId);
  const safeUid = sanitizeId(myUid);
  const current = message.reactions?.[emoji] ?? [];
  const next = current.includes(safeUid)
    ? current.filter((u) => u !== safeUid)
    : [...current, safeUid];

  try {
    await updateDoc(doc(db, 'rooms', safeRoom, 'messages', message.id), {
      [`reactions.${emoji}`]: next,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${safeRoom}/messages/${message.id}`);
  }
}

export async function reportRoomMessage(params: {
  roomId: string;
  message: RoomMessage;
  reporterUid: string;
  reason: string;
  details?: string;
}): Promise<void> {
  const safeRoom = sanitizeId(params.roomId);
  const safeReporter = sanitizeId(params.reporterUid);
  const reportId = sanitizeId(`rrep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'rooms', safeRoom, 'messages', params.message.id), {
      reportedBy: arrayUnion(safeReporter),
    });
    batch.set(doc(db, 'reports', reportId), {
      reporterId: safeReporter,
      targetUserId: sanitizeId(params.message.senderId),
      targetName: clampStr(params.message.senderName, 120),
      roomId: safeRoom,
      messageId: sanitizeId(params.message.id),
      reason: clampStr(params.reason, 120) || 'Inappropriate room message',
      details: params.details
        ? clampStr(params.details, 1000)
        : clampStr(params.message.text, 400),
      status: 'open',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `reports/${reportId}`);
  }
}

export async function adminSetRoomMessageDeleted(
  roomId: string,
  messageId: string,
  deleted: boolean
): Promise<void> {
  const safeRoom = sanitizeId(roomId);
  const safeMsg = sanitizeId(messageId);
  try {
    await updateDoc(doc(db, 'rooms', safeRoom, 'messages', safeMsg), {
      deleted,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${safeRoom}/messages/${safeMsg}`);
  }
}

export async function adminToggleMuteUserInRoom(
  roomId: string,
  targetUid: string,
  mute: boolean
): Promise<void> {
  const safeRoom = sanitizeId(roomId);
  const safeTarget = sanitizeId(targetUid);
  try {
    await updateDoc(doc(db, 'rooms', safeRoom), {
      mutedUids: mute ? arrayUnion(safeTarget) : arrayRemove(safeTarget),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${safeRoom}`);
  }
}
