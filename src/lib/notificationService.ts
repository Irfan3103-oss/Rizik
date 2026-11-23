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
import { db, handleFirestoreError, OperationType } from '../firebase';
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

const inFlightNotifSeed = new Map<string, Promise<void>>();

export function seedStarterNotificationsOnce(
  fbUser: FirebaseUser,
  _appUser: User
): Promise<void> {
  const existing = inFlightNotifSeed.get(fbUser.uid);
  if (existing) return existing;

  const p = doSeedStarterNotificationsOnce(fbUser).finally(() => {
    inFlightNotifSeed.delete(fbUser.uid);
  });
  inFlightNotifSeed.set(fbUser.uid, p);
  return p;
}

async function doSeedStarterNotificationsOnce(fbUser: FirebaseUser): Promise<void> {
  const uid = fbUser.uid;
  const userRef = doc(db, 'users', uid);

  let userSnap;
  try {
    userSnap = await getDoc(userRef);
  } catch {
    return;
  }

  if (!userSnap.exists()) return;
  if (userSnap.data()?.notificationsSeeded === true) return;

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

  const batch = writeBatch(db);
  for (const item of starters) {
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
  }
  batch.update(userRef, {
    notificationsSeeded: true,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    console.warn('Starter notifications seed skipped:', err);
  }
}

export function subscribeUserNotifications(
  uid: string,
  onNotifications: (items: NotificationItem[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'users', uid, 'notifications'),
    orderBy('createdAt', 'desc'),
    limit(60)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: NotificationItem[] = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          userId: String(data.recipientUid ?? uid),
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
      });
      onNotifications(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${uid}/notifications`);
    }
  );
}

export async function markUserNotificationRead(
  uid: string,
  notificationId: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', uid, 'notifications', notificationId), {
      read: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `users/${uid}/notifications/${notificationId}`
    );
  }
}

export async function markAllUserNotificationsRead(uid: string): Promise<void> {
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'notifications'));
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
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}/notifications`);
  }
}

export async function deleteUserNotification(
  uid: string,
  notificationId: string
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'users', uid, 'notifications', notificationId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `users/${uid}/notifications/${notificationId}`
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

  const notifId = sanitizeId(
    `n_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  );
  try {
    await setDoc(doc(db, 'users', params.recipientUid, 'notifications', notifId), {
      recipientUid: sanitizeId(params.recipientUid),
      senderUid: sanitizeId(params.senderUid),
      senderName: clampStr(params.senderName, 120) || 'Rizik User',
      type: params.type,
      title: clampStr(params.title, 140),
      titleBn: params.titleBn ? clampStr(params.titleBn, 180) : null,
      body: clampStr(params.body, 500),
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
  } catch {
    // Non-fatal if recipient is a seeded non-Firestore user or blocked
  }
}
