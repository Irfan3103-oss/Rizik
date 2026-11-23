import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
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
import { db, handleFirestoreError, OperationType } from '../firebase';
import { createCrossUserNotification } from './notificationService';
import type {
  AdminChatMessage,
  AdminConversation,
  AdminNotificationItem,
  PlatformUserSummary,
  RestaurantInfo,
  RestaurantOwnerApplication,
  RestaurantType,
  RestaurantVerificationStatus,
} from '../types';

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

export function getAdminConvId(ownerUid: string): string {
  return sanitizeId(`admin_${ownerUid}`);
}

export function normalizeRestaurantInfo(raw: unknown): RestaurantInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const validTypes: RestaurantType[] = [
    'restaurant',
    'bakery',
    'sweet_shop',
    'cafe',
    'catering',
    'hotel_kitchen',
    'other',
  ];
  const validStatuses: RestaurantVerificationStatus[] = ['pending', 'approved', 'rejected'];
  const restaurantType = validTypes.includes(r.restaurantType as RestaurantType)
    ? (r.restaurantType as RestaurantType)
    : 'restaurant';
  const verificationStatus = validStatuses.includes(
    r.verificationStatus as RestaurantVerificationStatus
  )
    ? (r.verificationStatus as RestaurantVerificationStatus)
    : 'pending';

  return {
    restaurantName: String(r.restaurantName ?? ''),
    ownerName: String(r.ownerName ?? ''),
    phone: String(r.phone ?? ''),
    email: typeof r.email === 'string' ? r.email : null,
    address: String(r.address ?? ''),
    area: String(r.area ?? 'Dhanmondi'),
    city: String(r.city ?? 'Dhaka'),
    lat: typeof r.lat === 'number' ? r.lat : 23.7465,
    lng: typeof r.lng === 'number' ? r.lng : 90.376,
    restaurantType,
    tradeLicenseNumber: typeof r.tradeLicenseNumber === 'string' ? r.tradeLicenseNumber : null,
    restaurantPhotoUrl: typeof r.restaurantPhotoUrl === 'string' ? r.restaurantPhotoUrl : null,
    licensePhotoUrl: typeof r.licensePhotoUrl === 'string' ? r.licensePhotoUrl : null,
    openingHours: String(r.openingHours ?? ''),
    approxDailySurplus: typeof r.approxDailySurplus === 'string' ? r.approxDailySurplus : null,
    acceptedSafetyTerms: Boolean(r.acceptedSafetyTerms),
    verificationStatus,
    rejectionReason: typeof r.rejectionReason === 'string' ? r.rejectionReason : null,
    submittedAt: typeof r.submittedAt === 'string' ? r.submittedAt : undefined,
    reviewedAt: typeof r.reviewedAt === 'string' ? r.reviewedAt : null,
    reviewedBy: typeof r.reviewedBy === 'string' ? r.reviewedBy : null,
  };
}

export async function createNewRestaurantOwnerNotification(params: {
  ownerUid: string;
  restaurantName: string;
  ownerName: string;
}): Promise<void> {
  const notifId = sanitizeId(`new_owner_${params.ownerUid}`);
  const conversationId = getAdminConvId(params.ownerUid);
  try {
    await setDoc(doc(db, 'adminNotifications', notifId), {
      type: 'newRestaurantOwner',
      ownerUid: sanitizeId(params.ownerUid),
      restaurantName: clampStr(params.restaurantName, 120) || 'New Restaurant',
      ownerName: clampStr(params.ownerName, 100) || 'Owner',
      conversationId,
      messagePreview: clampStr(`New application from ${params.restaurantName}`, 240),
      read: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    // Non-fatal if doc already exists (cannot update non-admin notification)
    console.warn('Skipped duplicate owner notification:', err);
  }
}

export async function createResubmittedNotification(params: {
  ownerUid: string;
  restaurantName: string;
  ownerName: string;
}): Promise<void> {
  const notifId = sanitizeId(`resub_${params.ownerUid}_${Date.now()}`);
  const conversationId = getAdminConvId(params.ownerUid);
  try {
    await setDoc(doc(db, 'adminNotifications', notifId), {
      type: 'resubmittedRestaurantOwner',
      ownerUid: sanitizeId(params.ownerUid),
      restaurantName: clampStr(params.restaurantName, 120) || 'Restaurant',
      ownerName: clampStr(params.ownerName, 100) || 'Owner',
      conversationId,
      messagePreview: clampStr(`${params.restaurantName} updated & resubmitted application`, 240),
      read: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `adminNotifications/${notifId}`);
  }
}

export async function createNewOwnerMessageNotification(params: {
  ownerUid: string;
  restaurantName: string;
  ownerName: string;
  conversationId: string;
  messagePreview: string;
}): Promise<void> {
  const rand = Math.random().toString(36).slice(2, 6);
  const notifId = sanitizeId(`msg_${params.ownerUid}_${Date.now()}_${rand}`);
  try {
    await setDoc(doc(db, 'adminNotifications', notifId), {
      type: 'newOwnerMessage',
      ownerUid: sanitizeId(params.ownerUid),
      restaurantName: clampStr(params.restaurantName, 120) || 'Restaurant',
      ownerName: clampStr(params.ownerName, 100) || 'Owner',
      conversationId: sanitizeId(params.conversationId),
      messagePreview: clampStr(params.messagePreview, 240),
      read: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Could not write owner message notification:', err);
  }
}

function mapAdminConv(id: string, data: Record<string, unknown>): AdminConversation {
  const ver =
    data.verificationStatus === 'approved' || data.verificationStatus === 'rejected'
      ? data.verificationStatus
      : 'pending';
  const msgType =
    data.lastMessageType === 'image' ||
    data.lastMessageType === 'file' ||
    data.lastMessageType === 'system'
      ? data.lastMessageType
      : 'text';
  const senderRole =
    data.lastSenderRole === 'admin' || data.lastSenderRole === 'system'
      ? data.lastSenderRole
      : 'owner';
  return {
    id,
    ownerUid: String(data.ownerUid ?? ''),
    ownerName: String(data.ownerName ?? 'Owner'),
    restaurantName: String(data.restaurantName ?? 'Restaurant'),
    restaurantLogoUrl: typeof data.restaurantLogoUrl === 'string' ? data.restaurantLogoUrl : null,
    verificationStatus: ver,
    lastMessage: String(data.lastMessage ?? ''),
    lastMessageType: msgType,
    lastSenderRole: senderRole,
    lastMessageAt: timestampToIso(data.lastMessageAt),
    ownerUnreadCount: Number(data.ownerUnreadCount ?? 0),
    adminUnreadCount: Number(data.adminUnreadCount ?? 0),
    ownerTyping: Boolean(data.ownerTyping),
    adminTyping: Boolean(data.adminTyping),
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

export async function ensureAdminConversationForOwner(params: {
  ownerUid: string;
  ownerName: string;
  restaurantName: string;
  restaurantLogoUrl?: string | null;
  verificationStatus?: RestaurantVerificationStatus;
  welcomeMessage?: string;
}): Promise<AdminConversation> {
  const convId = getAdminConvId(params.ownerUid);
  const convRef = doc(db, 'adminConversations', convId);

  let snap;
  try {
    snap = await getDoc(convRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `adminConversations/${convId}`);
  }

  if (snap.exists()) {
    return mapAdminConv(snap.id, snap.data() as Record<string, unknown>);
  }

  const initialLastMsg = clampStr(
    params.welcomeMessage || 'Application submitted. Awaiting Rizik review.',
    500
  );
  const logo =
    typeof params.restaurantLogoUrl === 'string' && params.restaurantLogoUrl.length <= 245000
      ? params.restaurantLogoUrl
      : null;

  const docPayload: Record<string, unknown> = {
    ownerUid: sanitizeId(params.ownerUid),
    ownerName: clampStr(params.ownerName, 100) || 'Owner',
    restaurantName: clampStr(params.restaurantName, 120) || 'Restaurant',
    restaurantLogoUrl: logo,
    verificationStatus: params.verificationStatus ?? 'pending',
    lastMessage: initialLastMsg,
    lastMessageType: 'system',
    lastSenderRole: 'system',
    lastMessageAt: serverTimestamp(),
    ownerUnreadCount: 0,
    adminUnreadCount: 0,
    ownerTyping: false,
    adminTyping: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(convRef, docPayload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `adminConversations/${convId}`);
  }

  const fresh = await getDoc(convRef).catch((err) =>
    handleFirestoreError(err, OperationType.GET, `adminConversations/${convId}`)
  );
  return mapAdminConv(fresh.id, (fresh.data() ?? docPayload) as Record<string, unknown>);
}

export function subscribeAdminNotifications(
  onNotifications: (items: AdminNotificationItem[]) => void
): Unsubscribe {
  const q = query(collection(db, 'adminNotifications'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const items: AdminNotificationItem[] = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        const type =
          data.type === 'resubmittedRestaurantOwner' || data.type === 'newOwnerMessage'
            ? data.type
            : 'newRestaurantOwner';
        return {
          id: d.id,
          type,
          ownerUid: String(data.ownerUid ?? ''),
          restaurantName: String(data.restaurantName ?? ''),
          ownerName: String(data.ownerName ?? ''),
          conversationId: typeof data.conversationId === 'string' ? data.conversationId : null,
          messagePreview: typeof data.messagePreview === 'string' ? data.messagePreview : null,
          read: Boolean(data.read),
          createdAt: timestampToIso(data.createdAt),
        };
      });
      onNotifications(items);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'adminNotifications');
    }
  );
}

export async function markAdminNotificationRead(notificationId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'adminNotifications', notificationId), {
      read: true,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `adminNotifications/${notificationId}`);
  }
}

export async function markAllAdminNotificationsRead(
  items: AdminNotificationItem[]
): Promise<void> {
  const unread = items.filter((n) => !n.read);
  if (unread.length === 0) return;
  const batch = writeBatch(db);
  for (const item of unread.slice(0, 100)) {
    batch.update(doc(db, 'adminNotifications', item.id), {
      read: true,
      updatedAt: serverTimestamp(),
    });
  }
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, 'adminNotifications');
  }
}

export function subscribeAllFirebaseUsers(
  onUsers: (users: PlatformUserSummary[]) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'users'),
    (snap) => {
      const list: PlatformUserSummary[] = [];
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        const uid = String(data.uid ?? d.id);
        if (data.role === 'admin') continue;
        const restaurant = normalizeRestaurantInfo(data.restaurant);
        const isRest = data.role === 'restaurantOwner' && Boolean(restaurant);
        list.push({
          id: uid,
          name: String(
            data.name ?? data.displayName ?? restaurant?.ownerName ?? 'Community Member'
          ),
          handle: typeof data.handle === 'string' ? data.handle : undefined,
          role: isRest ? 'donor' : 'recipient',
          accountType: isRest ? 'restaurantOwner' : 'user',
          area: String(data.area ?? restaurant?.area ?? 'Dhaka'),
          organizationName:
            typeof data.organizationName === 'string' ? data.organizationName : null,
          businessName: restaurant?.restaurantName ?? null,
          logoUrl: restaurant?.restaurantPhotoUrl ?? null,
          source: 'firebase',
          verified: Boolean(data.verified),
          discoverable: typeof data.discoverable === 'boolean' ? data.discoverable : true,
        });
      }
      list.sort((a, b) => a.name.localeCompare(b.name));
      onUsers(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'users');
    }
  );
}

export function subscribeRestaurantApplications(
  onApps: (apps: RestaurantOwnerApplication[]) => void
): Unsubscribe {
  const q = query(collection(db, 'users'), where('role', '==', 'restaurantOwner'));
  return onSnapshot(
    q,
    (snap) => {
      const list: RestaurantOwnerApplication[] = [];
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        const restaurant = normalizeRestaurantInfo(data.restaurant);
        if (!restaurant) continue;
        list.push({
          uid: String(data.uid ?? d.id),
          name: String(data.name ?? data.displayName ?? restaurant.ownerName),
          email: String(data.email ?? restaurant.email ?? ''),
          area: String(data.area ?? restaurant.area ?? 'Dhanmondi'),
          verified: Boolean(data.verified),
          createdAt: timestampToIso(data.createdAt),
          updatedAt: timestampToIso(data.updatedAt),
          restaurant,
        });
      }
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onApps(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'users');
    }
  );
}

export async function reviewRestaurantApplication(params: {
  ownerUid: string;
  adminUid: string;
  decision: 'approved' | 'rejected';
  rejectionReason?: string;
  restaurantName: string;
  ownerName: string;
  restaurantLogoUrl?: string | null;
  systemMessageText: string;
}): Promise<void> {
  const uid = sanitizeId(params.ownerUid);
  const nowIso = new Date().toISOString().slice(0, 64);
  const cleanReason =
    params.decision === 'rejected' ? clampStr(params.rejectionReason, 500) || null : null;

  const userRef = doc(db, 'users', uid);
  try {
    await updateDoc(userRef, {
      verified: params.decision === 'approved',
      'restaurant.verificationStatus': params.decision,
      'restaurant.rejectionReason': cleanReason,
      'restaurant.reviewedAt': nowIso,
      'restaurant.reviewedBy': sanitizeId(params.adminUid),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }

  try {
    await updateDoc(doc(db, 'userDirectory', uid), {
      verified: params.decision === 'approved',
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal if userDirectory entry does not exist yet
  }

  const conv = await ensureAdminConversationForOwner({
    ownerUid: uid,
    ownerName: params.ownerName,
    restaurantName: params.restaurantName,
    restaurantLogoUrl: params.restaurantLogoUrl,
    verificationStatus: params.decision,
  });

  const msgId = sanitizeId(`sys_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  const cleanMsg = clampStr(params.systemMessageText, 2000);

  try {
    await setDoc(doc(db, 'adminConversations', conv.id, 'messages', msgId), {
      conversationId: conv.id,
      ownerUid: uid,
      senderId: sanitizeId(params.adminUid),
      senderRole: 'system',
      senderName: 'Rizik Team',
      text: cleanMsg,
      messageType: 'system',
      status: 'sent',
      readAt: null,
      createdAt: serverTimestamp(),
    });

    await updateDoc(doc(db, 'adminConversations', conv.id), {
      verificationStatus: params.decision,
      lastMessage: clampStr(cleanMsg, 500),
      lastMessageType: 'system',
      lastSenderRole: 'system',
      lastMessageAt: serverTimestamp(),
      ownerUnreadCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `adminConversations/${conv.id}`);
  }

  // Mark pending owner notifications for this restaurant as read
  try {
    const q = query(collection(db, 'adminNotifications'), where('ownerUid', '==', uid));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    let hasUpdates = false;
    snap.docs.forEach((d) => {
      const data = d.data();
      if (
        !data.read &&
        (data.type === 'newRestaurantOwner' || data.type === 'resubmittedRestaurantOwner')
      ) {
        batch.update(d.ref, { read: true, updatedAt: serverTimestamp() });
        hasUpdates = true;
      }
    });
    if (hasUpdates) {
      await batch.commit();
    }
  } catch {
    // Non-fatal cleanup
  }

  // Also push real-time notification to the restaurant owner's Notification Center
  void createCrossUserNotification({
    recipientUid: uid,
    senderUid: sanitizeId(params.adminUid),
    senderName: 'Rizik Team',
    type: 'restaurant_status',
    title:
      params.decision === 'approved'
        ? `${params.restaurantName} is approved!`
        : `Update on ${params.restaurantName}`,
    titleBn:
      params.decision === 'approved'
        ? `${params.restaurantName} অনুমোদিত হয়েছে!`
        : `${params.restaurantName} আবেদনের আপডেট`,
    body: clampStr(params.systemMessageText, 300),
    bodyBn: clampStr(params.systemMessageText, 300),
    conversationId: conv.id,
    linkTab: params.decision === 'approved' ? 'donor' : 'account',
  });
}

export function subscribeAllAdminConversations(
  onConversations: (items: AdminConversation[]) => void
): Unsubscribe {
  const q = query(collection(db, 'adminConversations'), orderBy('lastMessageAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      onConversations(
        snap.docs.map((d) => mapAdminConv(d.id, d.data() as Record<string, unknown>))
      );
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'adminConversations');
    }
  );
}

export function subscribeMyAdminConversation(
  ownerUid: string,
  onConversation: (conv: AdminConversation | null) => void
): Unsubscribe {
  const convId = getAdminConvId(ownerUid);
  return onSnapshot(
    doc(db, 'adminConversations', convId),
    (snap) => {
      if (snap.exists()) {
        onConversation(mapAdminConv(snap.id, snap.data() as Record<string, unknown>));
      } else {
        onConversation(null);
      }
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, `adminConversations/${convId}`);
    }
  );
}

export function subscribeAdminChatMessages(
  conversationId: string,
  ownerUid: string,
  onMessages: (msgs: AdminChatMessage[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'adminConversations', conversationId, 'messages'),
    where('ownerUid', '==', sanitizeId(ownerUid))
  );
  return onSnapshot(
    q,
    (snap) => {
      const msgs: AdminChatMessage[] = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        const senderRole =
          data.senderRole === 'admin' || data.senderRole === 'system'
            ? data.senderRole
            : 'owner';
        const messageType =
          data.messageType === 'image' ||
          data.messageType === 'file' ||
          data.messageType === 'system'
            ? data.messageType
            : 'text';
        const status = data.status === 'read' ? 'read' : 'sent';
        return {
          id: d.id,
          conversationId: String(data.conversationId ?? conversationId),
          ownerUid: String(data.ownerUid ?? ownerUid),
          senderId: String(data.senderId ?? ''),
          senderRole,
          senderName: String(data.senderName ?? ''),
          text: String(data.text ?? ''),
          messageType,
          mediaUrl: typeof data.mediaUrl === 'string' ? data.mediaUrl : null,
          fileName: typeof data.fileName === 'string' ? data.fileName : null,
          fileSize: typeof data.fileSize === 'number' ? data.fileSize : null,
          fileMime: typeof data.fileMime === 'string' ? data.fileMime : null,
          status,
          readAt: data.readAt ? timestampToIso(data.readAt) : null,
          createdAt: timestampToIso(data.createdAt),
        };
      });
      msgs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      onMessages(msgs);
    },
    (err) => {
      handleFirestoreError(
        err,
        OperationType.LIST,
        `adminConversations/${conversationId}/messages`
      );
    }
  );
}

export async function sendAdminChatMessage(params: {
  conversationId: string;
  ownerUid: string;
  senderId: string;
  senderRole: 'owner' | 'admin';
  senderName: string;
  restaurantName: string;
  ownerName: string;
  restaurantLogoUrl?: string | null;
  verificationStatus?: RestaurantVerificationStatus;
  text: string;
  messageType: 'text' | 'image' | 'file';
  mediaUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  fileMime?: string | null;
}): Promise<string> {
  const convId = sanitizeId(params.conversationId);
  const ownerUid = sanitizeId(params.ownerUid);

  await ensureAdminConversationForOwner({
    ownerUid,
    ownerName: params.ownerName,
    restaurantName: params.restaurantName,
    restaurantLogoUrl: params.restaurantLogoUrl,
    verificationStatus: params.verificationStatus,
  });

  const msgId = sanitizeId(`m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const cleanText = clampStr(params.text, 2000);
  const preview =
    cleanText ||
    (params.messageType === 'image'
      ? 'Photo attachment'
      : params.fileName
        ? `File: ${params.fileName}`
        : 'New message');

  const msgPayload: Record<string, unknown> = {
    conversationId: convId,
    ownerUid,
    senderId: sanitizeId(params.senderId),
    senderRole: params.senderRole,
    senderName: clampStr(params.senderName, 100) || (params.senderRole === 'admin' ? 'Rizik Team' : 'Owner'),
    text: cleanText || preview,
    messageType: params.messageType,
    status: 'sent',
    readAt: null,
    createdAt: serverTimestamp(),
  };

  if (params.mediaUrl) {
    msgPayload.mediaUrl = params.mediaUrl.slice(0, 449000);
  }
  if (params.fileName) {
    msgPayload.fileName = clampStr(params.fileName, 160);
  }
  if (typeof params.fileSize === 'number') {
    msgPayload.fileSize = Math.max(0, Math.min(500000, Math.round(params.fileSize)));
  }
  if (params.fileMime) {
    msgPayload.fileMime = clampStr(params.fileMime, 100);
  }

  try {
    await setDoc(doc(db, 'adminConversations', convId, 'messages', msgId), msgPayload);

    const convUpdates: Record<string, unknown> = {
      lastMessage: clampStr(preview, 500),
      lastMessageType: params.messageType,
      lastSenderRole: params.senderRole,
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (params.senderRole === 'owner') {
      convUpdates.adminUnreadCount = increment(1);
      convUpdates.ownerTyping = false;
    } else {
      convUpdates.ownerUnreadCount = increment(1);
      convUpdates.adminTyping = false;
    }

    await updateDoc(doc(db, 'adminConversations', convId), convUpdates);
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.CREATE,
      `adminConversations/${convId}/messages/${msgId}`
    );
  }

  if (params.senderRole === 'owner') {
    await createNewOwnerMessageNotification({
      ownerUid,
      restaurantName: params.restaurantName,
      ownerName: params.ownerName,
      conversationId: convId,
      messagePreview: preview,
    });
  }

  return msgId;
}

export async function markAdminConversationRead(params: {
  conversationId: string;
  viewerUid: string;
  viewerRole: 'owner' | 'admin';
  messages: AdminChatMessage[];
  unreadCount: number;
}): Promise<void> {
  const convId = sanitizeId(params.conversationId);
  if (params.unreadCount > 0) {
    try {
      await updateDoc(doc(db, 'adminConversations', convId), {
        ...(params.viewerRole === 'admin'
          ? { adminUnreadCount: 0 }
          : { ownerUnreadCount: 0 }),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Ignore if offline or concurrently updated
    }
  }

  const peerSent = params.messages.filter(
    (m) => m.status === 'sent' && m.senderId !== params.viewerUid
  );
  if (peerSent.length === 0) return;

  try {
    const batch = writeBatch(db);
    for (const m of peerSent.slice(-50)) {
      batch.update(doc(db, 'adminConversations', convId, 'messages', m.id), {
        status: 'read',
        readAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch {
    // Non-fatal
  }
}

export async function setAdminChatTyping(params: {
  conversationId: string;
  viewerRole: 'owner' | 'admin';
  isTyping: boolean;
}): Promise<void> {
  const convId = sanitizeId(params.conversationId);
  try {
    await updateDoc(doc(db, 'adminConversations', convId), {
      ...(params.viewerRole === 'admin'
        ? { adminTyping: params.isTyping }
        : { ownerTyping: params.isTyping }),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal typing indicator
  }
}
