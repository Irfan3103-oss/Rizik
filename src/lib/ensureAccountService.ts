import type { User as FirebaseUser } from 'firebase/auth';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import type { User } from '../types';
import { ensureRoomMemberPresence } from './communityRoomsService';
import { syncFirebaseUserProfile } from './firestoreService';
import {
  seedStarterDemoConversationsOnce,
  syncUserDirectoryProfile,
} from './messengerService';
import { seedStarterNotificationsOnce } from './notificationService';

export interface EnsureAccountStep {
  id: 'profile' | 'directory' | 'notifications' | 'welcome_chat' | 'rooms';
  label: string;
  labelBn: string;
  status: 'ok' | 'fixed' | 'error';
  detail: string;
  detailBn: string;
}

export interface EnsureAccountReport {
  ranAt: string;
  overallOk: boolean;
  fixedCount: number;
  errorCount: number;
  steps: EnsureAccountStep[];
  refreshedUser?: User;
}

const inFlightEnsure = new Map<string, Promise<EnsureAccountReport>>();

export function ensureAccount(
  fbUser: FirebaseUser,
  appUser: User,
  options?: { force?: boolean }
): Promise<EnsureAccountReport> {
  const force = Boolean(options?.force);
  if (!force) {
    const existing = inFlightEnsure.get(fbUser.uid);
    if (existing) return existing;
  }

  const p = doEnsureAccount(fbUser, appUser, force).finally(() => {
    inFlightEnsure.delete(fbUser.uid);
  });
  if (!force) {
    inFlightEnsure.set(fbUser.uid, p);
  }
  return p;
}

async function doEnsureAccount(
  fbUser: FirebaseUser,
  appUser: User,
  force: boolean
): Promise<EnsureAccountReport> {
  const uid = fbUser.uid;
  const steps: EnsureAccountStep[] = [];
  let refreshedUser: User = appUser;

  // 1. Ensure /users/{uid} and /users/{uid}/private/info exist & have required public fields
  try {
    const existingPubSnap = await getDoc(doc(db, 'users', uid));
    const existedBefore = existingPubSnap.exists();
    const hadHandleAndDiscoverable =
      existedBefore &&
      Boolean(existingPubSnap.data()?.handle) &&
      typeof existingPubSnap.data()?.discoverable === 'boolean' &&
      Boolean(existingPubSnap.data()?.area);

    refreshedUser = await syncFirebaseUserProfile(
      fbUser,
      appUser.language === 'bn' ? 'bn' : 'en',
      undefined,
      appUser.isAdmin
    );

    steps.push({
      id: 'profile',
      label: 'Account profile document',
      labelBn: 'অ্যাকাউন্ট প্রোফাইল ডকুমেন্ট',
      status: hadHandleAndDiscoverable ? 'ok' : 'fixed',
      detail: hadHandleAndDiscoverable
        ? `Profile verified (${refreshedUser.handle || uid})`
        : existedBefore
          ? `Repaired missing profile fields (${refreshedUser.handle || 'handle added'})`
          : `Created missing profile document (${refreshedUser.handle || 'ready'})`,
      detailBn: hadHandleAndDiscoverable
        ? `প্রোফাইল যাচাই করা হয়েছে (${refreshedUser.handle || uid})`
        : existedBefore
          ? 'প্রোফাইলের অনুপস্থিত তথ্য ঠিক করা হয়েছে'
          : 'অ্যাকাউন্ট প্রোফাইল ডকুমেন্ট তৈরি করা হয়েছে',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push({
      id: 'profile',
      label: 'Account profile document',
      labelBn: 'অ্যাকাউন্ট প্রোফাইল ডকুমেন্ট',
      status: 'error',
      detail: `Failed to sync profile: ${msg}`,
      detailBn: `প্রোফাইল সিঙ্ক ব্যর্থ হয়েছে: ${msg}`,
    });
  }

  // 2. Ensure /userDirectory/{uid} exists with discoverable: true (for Find People)
  try {
    const dirSnap = await getDoc(doc(db, 'userDirectory', uid));
    const dirExisted = dirSnap.exists();
    const dirDiscoverable = dirExisted && dirSnap.data()?.discoverable === true;
    await syncUserDirectoryProfile(fbUser, refreshedUser, true);

    const isFixed = !dirExisted || (!dirDiscoverable && refreshedUser.discoverable !== false);
    steps.push({
      id: 'directory',
      label: 'Find People public directory',
      labelBn: 'মানুষ খুঁজুন পাবলিক ডিরেক্টরি',
      status: isFixed ? 'fixed' : 'ok',
      detail: !dirExisted
        ? 'Added you to the Find People directory (discoverable: on)'
        : !dirDiscoverable
          ? 'Updated directory discoverability'
          : 'Visible in Find People directory',
      detailBn: !dirExisted
        ? 'আপনাকে "মানুষ খুঁজুন" ডিরেক্টরিতে যোগ করা হয়েছে'
        : !dirDiscoverable
          ? 'ডিরেক্টরি দৃশ্যমানতা আপডেট করা হয়েছে'
          : '"মানুষ খুঁজুন" ডিরেক্টরিতে দৃশ্যমান',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push({
      id: 'directory',
      label: 'Find People public directory',
      labelBn: 'মানুষ খুঁজুন পাবলিক ডিরেক্টরি',
      status: 'error',
      detail: `Directory sync failed: ${msg}`,
      detailBn: `ডিরেক্টরি সিঙ্ক ব্যর্থ: ${msg}`,
    });
  }

  // 3. Ensure welcome notifications exist in /users/{uid}/notifications
  try {
    const notifRes = await seedStarterNotificationsOnce(fbUser, refreshedUser, {
      forceCheck: force,
    });
    if (notifRes.error) {
      steps.push({
        id: 'notifications',
        label: 'Welcome notifications',
        labelBn: 'স্বাগতম নোটিফিকেশন',
        status: 'error',
        detail: `Could not verify notifications: ${notifRes.error}`,
        detailBn: `নোটিফিকেশন যাচাই ব্যর্থ: ${notifRes.error}`,
      });
    } else if (notifRes.createdCount > 0) {
      steps.push({
        id: 'notifications',
        label: 'Welcome notifications',
        labelBn: 'স্বাগতম নোটিফিকেশন',
        status: 'fixed',
        detail: `Restored ${notifRes.createdCount} starter notification(s)`,
        detailBn: `${notifRes.createdCount}টি স্বাগতম নোটিফিকেশন পুনরুদ্ধার করা হয়েছে`,
      });
    } else {
      steps.push({
        id: 'notifications',
        label: 'Welcome notifications',
        labelBn: 'স্বাগতম নোটিফিকেশন',
        status: 'ok',
        detail: `${notifRes.alreadyHadCount} notification(s) already present`,
        detailBn: `${notifRes.alreadyHadCount}টি নোটিফিকেশন ইতিমধ্যে রয়েছে`,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push({
      id: 'notifications',
      label: 'Welcome notifications',
      labelBn: 'স্বাগতম নোটিফিকেশন',
      status: 'error',
      detail: msg,
      detailBn: msg,
    });
  }

  // 4. Ensure "Rizik Team" welcome conversation + messages exist
  try {
    const convRes = await seedStarterDemoConversationsOnce(fbUser, refreshedUser, force);
    if (convRes.status === 'error') {
      steps.push({
        id: 'welcome_chat',
        label: 'Rizik Team welcome chat',
        labelBn: 'Rizik টিম স্বাগতম চ্যাট',
        status: 'error',
        detail: `Failed to verify welcome chat: ${convRes.error}`,
        detailBn: `স্বাগতম চ্যাট যাচাই ব্যর্থ: ${convRes.error}`,
      });
    } else if (convRes.status === 'created' || convRes.status === 'repaired') {
      steps.push({
        id: 'welcome_chat',
        label: 'Rizik Team welcome chat',
        labelBn: 'Rizik টিম স্বাগতম চ্যাট',
        status: 'fixed',
        detail:
          convRes.status === 'created'
            ? 'Created Rizik Team welcome conversation'
            : 'Repaired missing welcome messages in Rizik Team chat',
        detailBn:
          convRes.status === 'created'
            ? 'Rizik টিম স্বাগতম চ্যাট তৈরি করা হয়েছে'
            : 'Rizik টিম চ্যাটের অনুপস্থিত বার্তা ঠিক করা হয়েছে',
      });
    } else {
      steps.push({
        id: 'welcome_chat',
        label: 'Rizik Team welcome chat',
        labelBn: 'Rizik টিম স্বাগতম চ্যাট',
        status: 'ok',
        detail: 'Rizik Team welcome thread active',
        detailBn: 'Rizik টিম চ্যাট সক্রিয় রয়েছে',
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push({
      id: 'welcome_chat',
      label: 'Rizik Team welcome chat',
      labelBn: 'Rizik টিম স্বাগতম চ্যাট',
      status: 'error',
      detail: msg,
      detailBn: msg,
    });
  }

  // 5. Ensure membership in all existing community rooms
  try {
    const roomsSnap = await getDocs(collection(db, 'rooms'));
    if (roomsSnap.empty) {
      steps.push({
        id: 'rooms',
        label: 'Community rooms membership',
        labelBn: 'কমিউনিটি রুম সদস্যপদ',
        status: 'ok',
        detail: 'No community rooms found in Firestore yet (admin can seed rooms)',
        detailBn: 'এখনো কোনো কমিউনিটি রুম সিড করা হয়নি',
      });
    } else {
      let createdRooms = 0;
      let updatedRooms = 0;
      let failedRooms = 0;
      for (const rDoc of roomsSnap.docs) {
        const res = await ensureRoomMemberPresence(rDoc.id, refreshedUser, true);
        if (!res.ok) failedRooms += 1;
        else if (res.action === 'created') createdRooms += 1;
        else updatedRooms += 1;
      }
      steps.push({
        id: 'rooms',
        label: 'Community rooms membership',
        labelBn: 'কমিউনিটি রুম সদস্যপদ',
        status: failedRooms > 0 ? 'error' : createdRooms > 0 ? 'fixed' : 'ok',
        detail:
          failedRooms > 0
            ? `Synced ${createdRooms + updatedRooms} room(s), failed ${failedRooms}`
            : createdRooms > 0
              ? `Joined ${createdRooms} community room(s) (${updatedRooms} already joined)`
              : `Active member in all ${updatedRooms} community room(s)`,
        detailBn:
          failedRooms > 0
            ? `${createdRooms + updatedRooms}টি রুমে যুক্ত, ${failedRooms}টি ব্যর্থ`
            : createdRooms > 0
              ? `${createdRooms}টি কমিউনিটি রুমে যুক্ত হয়েছেন`
              : `${updatedRooms}টি কমিউনিটি রুমে সক্রিয় সদস্য`,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push({
      id: 'rooms',
      label: 'Community rooms membership',
      labelBn: 'কমিউনিটি রুম সদস্যপদ',
      status: 'error',
      detail: `Could not sync community rooms: ${msg}`,
      detailBn: `কমিউনিটি রুম সিঙ্ক ব্যর্থ: ${msg}`,
    });
  }

  const fixedCount = steps.filter((s) => s.status === 'fixed').length;
  const errorCount = steps.filter((s) => s.status === 'error').length;

  return {
    ranAt: new Date().toISOString(),
    overallOk: errorCount === 0,
    fixedCount,
    errorCount,
    steps,
    refreshedUser,
  };
}
