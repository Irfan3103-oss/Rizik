import type { User as FirebaseUser } from 'firebase/auth';
import {
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
  setDoc,
  Timestamp,
  updateDoc,
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
import type { NotificationItem, User } from '../types';

function clampStr(val: string | undefined | null, maxLen: number): string {
  return (val ?? '').trim().slice(0, maxLen);
}

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned || `notif_${Date.now()}`;
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

export interface NotificationSeedResult {
  createdCount: number;
  alreadyHadCount: number;
  markedFlag: boolean;
  error?: string;
}

const inFlightNotifSeed = new Map<string, Promise<NotificationSeedResult>>();

export function seedStarterNotificationsOnce(
  fbUser: FirebaseUser,
  _appUser: User,
  options?: { forceCheck?: boolean }
): Promise<NotificationSeedResult> {
  const forceCheck = Boolean(options?.forceCheck);
  if (!forceCheck) {
    const existing = inFlightNotifSeed.get(fbUser.uid);
    if (existing) return existing;
  }

  const p = doSeedStarterNotificationsOnce(fbUser, forceCheck).finally(() => {
    inFlightNotifSeed.delete(fbUser.uid);
  });
  inFlightNotifSeed.set(fbUser.uid, p);
  return p;
}

async function doSeedStarterNotificationsOnce(
  fbUser: FirebaseUser,
  forceCheck = false
): Promise<NotificationSeedResult> {
  const uid = sanitizeId(fbUser.uid);
  const userRef = doc(db, 'users', uid);
  const notifCol = collection(db, 'users', uid, 'notifications');

  let userData: Record<string, unknown> | undefined;
  try {
    const userSnap = await getDoc(userRef);
    userData = userSnap.exists() ? (userSnap.data() as Record<string, unknown>) : undefined;
  } catch (err) {
    console.warn('[notificationService] Could not read user doc before seeding notifications:', err);
  }

  let existingIds = new Set<string>();
  let totalExisting = 0;
  try {
    const existingSnap = await getDocs(query(notifCol, limit(40)));
    totalExisting = existingSnap.size;
    existingIds = new Set(existingSnap.docs.map((d) => d.id));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[notificationService] Failed reading notifications subcollection:', err);
    return { createdCount: 0, alreadyHadCount: 0, markedFlag: false, error: msg };
  }

  // If the user already marked notificationsSeeded AND actually has notifications in Firestore, skip unless forceCheck
  if (!forceCheck && userData?.notificationsSeeded === true && totalExisting > 0) {
    return {
      createdCount: 0,
      alreadyHadCount: totalExisting,
      markedFlag: true,
    };
  }

  const demoTeamConvId = 'demo_team';
  const starters = [
    {
      id: sanitizeId(`starter_welcome_${uid}`),
      type: 'welcome',
      title: 'Welcome to Rizik!',
      titleBn: 'Rizik-এ স্বাগতম!',
      body: 'Rescue surplus food nearby, connect directly with partner kitchens, and help reduce waste in Dhaka.',
      bodyBn: 'কাছের অতিরিক্ত খাবার উদ্ধার করুন, অংশীদার রান্নাঘরের সাথে সরাসরি যোগাযোগ করুন এবং ঢাকায় অপচয় কমাতে সহায়তা করুন।',
      linkTab: 'discover',
      conversationId: null,
    },
    {
      id: sanitizeId(`starter_profile_${uid}`),
      type: 'complete_profile',
      title: 'Complete your profile',
      titleBn: 'আপনার প্রোফাইল সম্পূর্ণ করুন',
      body: 'Set your neighborhood area, pickup radius, and Find People discoverability in Account settings.',
      bodyBn: 'অ্যাকাউন্ট সেটিংসে আপনার এলাকা, পিকআপ দূরত্ব এবং "মানুষ খুঁজুন" দৃশ্যমানতা ঠিক করুন।',
      linkTab: 'account',
      conversationId: null,
    },
    {
      id: sanitizeId(`starter_flash_${uid}`),
      type: 'flash_rescue',
      title: 'Try Flash Rescue',
      titleBn: 'ফ্ল্যাশ রেসকিউ চেষ্টা করুন',
      body: 'Urgent surplus food batches expiring soon appear at the top with live countdown timers.',
      bodyBn: 'জরুরি অতিরিক্ত খাবারের ব্যাচগুলো লাইভ কাউন্টডাউনসহ তালিকার শীর্ষে দেখানো হয়।',
      linkTab: 'discover',
      conversationId: null,
    },
    {
      id: sanitizeId(`starter_events_${uid}`),
      type: 'events_upcoming',
      title: 'Check upcoming events',
      titleBn: 'আসন্ন কমিউনিটি ইভেন্ট দেখুন',
      body: 'Join neighborhood food distribution drives and volunteer shifts happening across Dhaka this week.',
      bodyBn: 'এই সপ্তাহে ঢাকা জুড়ে আসন্ন খাবার বিতরণ ও স্বেচ্ছাসেবক শিফটে যোগ দিন।',
      linkTab: 'events',
      conversationId: null,
    },
    {
      id: sanitizeId(`starter_team_${uid}`),
      type: 'team_hello',
      title: 'Say hello to the Rizik Team',
      titleBn: 'Rizik টিমকে হ্যালো বলুন',
      body: 'Open your Messenger Inbox to chat with Rizik Team or explore sample partner shops.',
      bodyBn: 'Rizik টিমের সাথে চ্যাট করতে বা নমুনা অংশীদার দোকান দেখতে আপনার ইনবক্স খুলুন।',
      linkTab: 'inbox',
      conversationId: demoTeamConvId,
    },
  ];

  // If user already has starter notifications, don't duplicate them
  const missingStarters = starters.filter((s) => !existingIds.has(s.id));
  let createdCount = 0;

  // Commit notifications in their own batch (never tie notification creation to a userRef schema update!)
  if (missingStarters.length > 0 && (totalExisting === 0 || userData?.notificationsSeeded !== true || forceCheck)) {
    const batch = writeBatch(db);
    for (const item of missingStarters) {
      batch.set(doc(db, 'users', uid, 'notifications', item.id), {
        recipientUid: uid,
        senderUid: uid,
        senderName: 'Rizik Team',
        type: item.type,
        title: clampStr(item.title, 140),
        titleBn: clampStr(item.titleBn, 180),
        body: clampStr(item.body, 500),
        bodyBn: clampStr(item.bodyBn, 600),
        read: false,
        isStarter: true,
        conversationId: item.conversationId,
        listingId: null,
        claimId: null,
        linkTab: item.linkTab,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      createdCount += 1;
    }

    try {
      await batch.commit();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[notificationService] Failed committing starter notifications:', err);
      return {
        createdCount: 0,
        alreadyHadCount: totalExisting,
        markedFlag: false,
        error: msg,
      };
    }
  }

  let markedFlag = userData?.notificationsSeeded === true;
  if (!markedFlag && userData) {
    try {
      await updateDoc(userRef, {
        notificationsSeeded: true,
        updatedAt: serverTimestamp(),
      });
      markedFlag = true;
    } catch (err) {
      console.warn('[notificationService] Notifications seeded, but could not mark notificationsSeeded flag on user doc:', err);
    }
  }

  return {
    createdCount,
    alreadyHadCount: totalExisting,
    markedFlag,
  };
}

function mapNotificationDoc(
  id: string,
  data: Record<string, unknown>,
  fallbackUid: string
): NotificationItem {
  return {
    id,
    userId: String(data.recipientUid ?? fallbackUid),
    type: String(data.type ?? 'system'),
    title: String(data.title ?? ''),
    titleBn: typeof data.titleBn === 'string' ? data.titleBn : null,
    body: String(data.body ?? ''),
    bodyBn: typeof data.bodyBn === 'string' ? data.bodyBn : null,
    payload: {
      conversationId: data.conversationId ?? null,
      listingId: data.listingId ?? null,
      claimId: data.claimId ?? null,
      linkTab: data.linkTab ?? null,
    },
    read: Boolean(data.read),
    isStarter: Boolean(data.isStarter),
    conversationId: typeof data.conversationId === 'string' ? data.conversationId : null,
    listingId: typeof data.listingId === 'string' ? data.listingId : null,
    claimId: typeof data.claimId === 'string' ? data.claimId : null,
    linkTab: typeof data.linkTab === 'string' ? data.linkTab : null,
    senderUid: typeof data.senderUid === 'string' ? data.senderUid : null,
    senderName: typeof data.senderName === 'string' ? data.senderName : null,
    createdAt: timestampToIso(data.createdAt),
  };
}

export function subscribeUserNotifications(
  uid: string,
  onNotifications: (items: NotificationItem[]) => void,
  onError?: (err: FirestoreListenerError) => void
): Unsubscribe {
  const safeUid = sanitizeId(uid);
  let activeUnsub: Unsubscribe = () => {};
  let disposed = false;

  const attachFallback = () => {
    if (disposed) return;
    const fallbackQ = query(collection(db, 'users', safeUid, 'notifications'), limit(60));
    activeUnsub = onSnapshot(
      fallbackQ,
      (snap) => {
        const items = snap.docs
          .map((d) => mapNotificationDoc(d.id, d.data() as Record<string, unknown>, safeUid))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        onNotifications(items);
      },
      (err) => {
        const parsed = parseFirestoreListenerError(
          err,
          OperationType.LIST,
          `users/${safeUid}/notifications`
        );
        onError?.(parsed);
      }
    );
  };

  const primaryQ = query(
    collection(db, 'users', safeUid, 'notifications'),
    orderBy('createdAt', 'desc'),
    limit(60)
  );

  activeUnsub = onSnapshot(
    primaryQ,
    (snap) => {
      const items = snap.docs.map((d) =>
        mapNotificationDoc(d.id, d.data() as Record<string, unknown>, safeUid)
      );
      onNotifications(items);
    },
    (error) => {
      const parsed = parseFirestoreListenerError(
        error,
        OperationType.LIST,
        `users/${safeUid}/notifications`
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

export async function markUserNotificationRead(
  uid: string,
  notificationId: string
): Promise<void> {
  const safeUid = sanitizeId(uid);
  try {
    await updateDoc(doc(db, 'users', safeUid, 'notifications', notificationId), {
      read: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `users/${safeUid}/notifications/${notificationId}`
    );
  }
}

export async function markAllUserNotificationsRead(uid: string): Promise<void> {
  const safeUid = sanitizeId(uid);
  try {
    const snap = await getDocs(collection(db, 'users', safeUid, 'notifications'));
    const batch = writeBatch(db);
    let count = 0;
    snap.docs.forEach((d) => {
      if (d.data()?.read === false) {
        batch.update(d.ref, { read: true, updatedAt: serverTimestamp() });
        count += 1;
      }
    });
    if (count > 0) {
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${safeUid}/notifications`);
  }
}

export async function deleteUserNotification(
  uid: string,
  notificationId: string
): Promise<void> {
  const safeUid = sanitizeId(uid);
  try {
    await deleteDoc(doc(db, 'users', safeUid, 'notifications', notificationId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `users/${safeUid}/notifications/${notificationId}`
    );
  }
}

export async function createCrossUserNotification(params: {
  recipientUid: string;
  senderUid: string;
  senderName: string;
  type:
    | 'new_message'
    | 'new_conversation'
    | 'reply'
    | 'claim_accepted'
    | 'claim_request'
    | 'pickup_completed'
    | 'flash_near_you'
    | 'restaurant_status';
  title: string;
  titleBn?: string;
  body: string;
  bodyBn?: string;
  conversationId?: string | null;
  listingId?: string | null;
  claimId?: string | null;
  linkTab?: 'discover' | 'inbox' | 'claims' | 'events' | 'donate' | 'account' | 'post' | 'donor' | 'admin';
}): Promise<void> {
  if (!params.recipientUid || params.recipientUid === params.senderUid) return;
  if (params.recipientUid.startsWith('demo_')) return;

  const recipientUid = sanitizeId(params.recipientUid);
  const notifId = sanitizeId(
    `n_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  );
  try {
    await setDoc(doc(db, 'users', recipientUid, 'notifications', notifId), {
      recipientUid,
      senderUid: sanitizeId(params.senderUid),
      senderName: clampStr(params.senderName, 120) || 'Rizik User',
      type: params.type,
      title: clampStr(params.title, 140) || 'Rizik',
      titleBn: params.titleBn ? clampStr(params.titleBn, 180) : null,
      body: clampStr(params.body, 500) || 'New update',
      bodyBn: params.bodyBn ? clampStr(params.bodyBn, 600) : null,
      read: false,
      isStarter: false,
      conversationId: params.conversationId ? sanitizeId(params.conversationId) : null,
      listingId: params.listingId ? sanitizeId(params.listingId) : null,
      claimId: params.claimId ? sanitizeId(params.claimId) : null,
      linkTab: params.linkTab ?? 'inbox',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn(
      `[notificationService] Could not deliver notification (${params.type}) to ${recipientUid}:`,
      err
    );
  }
}
