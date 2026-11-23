import type { User as FirebaseUser } from 'firebase/auth';
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { COMMUNITY_ROOM_SPECS, DEMO_PERSONAS } from '../data/demoPersonas';
import { db, getFirebaseConfigHealth, parseFirestoreListenerError, OperationType } from '../firebase';
import type { User } from '../types';

export type HealthCheckStatus = 'pass' | 'warn' | 'fail';

export interface HealthCheckItem {
  id: string;
  title: string;
  titleBn: string;
  status: HealthCheckStatus;
  detail: string;
  detailBn: string;
  fixHint: string;
  fixHintBn: string;
  errorCode?: string;
  indexUrl?: string | null;
}

export interface HealthCheckReport {
  ranAt: string;
  mode: 'user' | 'admin';
  summary: {
    pass: number;
    warn: number;
    fail: number;
  };
  items: HealthCheckItem[];
}

export async function runHealthCheck(params: {
  mode: 'user' | 'admin';
  fbUser: FirebaseUser | null;
  user: User | null;
}): Promise<HealthCheckReport> {
  const { mode, fbUser, user } = params;
  const items: HealthCheckItem[] = [];

  // 1. Firebase Config Check
  const cfg = getFirebaseConfigHealth();
  items.push({
    id: 'firebase_config',
    title: 'Firebase configuration & database ID',
    titleBn: 'Firebase কনফিগারেশন ও ডাটাবেস আইডি',
    status: cfg.ok ? 'pass' : 'fail',
    detail: cfg.ok
      ? `Project: ${cfg.projectId} · DB: ${cfg.firestoreDatabaseId} · Storage: ${cfg.hasStorageBucket ? 'ok' : 'none'} · RTDB: ${cfg.hasRtdbUrl ? 'ok' : 'none'}`
      : `Missing: ${cfg.missingKeys.join(', ') || 'none'} · Placeholders: ${cfg.placeholderKeys.join(', ') || 'none'}`,
    detailBn: cfg.ok
      ? `প্রজেক্ট: ${cfg.projectId} · ডাটাবেস: ${cfg.firestoreDatabaseId}`
      : `অনুপস্থিত বা ভুল কনফিগ কী: ${[...cfg.missingKeys, ...cfg.placeholderKeys].join(', ')}`,
    fixHint: cfg.ok
      ? 'All required Firebase client configuration values are loaded.'
      : 'Set valid VITE_FIREBASE_* variables or update firebase-applet-config.json and rebuild.',
    fixHintBn: cfg.ok
      ? 'সকল প্রয়োজনীয় Firebase কনফিগারেশন সঠিকভাবে লোড হয়েছে।'
      : 'সঠিক VITE_FIREBASE_* এনভায়রনমেন্ট ভেরিয়েবল অথবা firebase-applet-config.json সেট করে পুনরায় বিল্ড করুন।',
  });

  // 2. Auth Session & Email Verification Check
  if (!fbUser || !user) {
    items.push({
      id: 'auth_session',
      title: 'Signed-in Firebase session',
      titleBn: 'সাইন-ইন করা Firebase সেশন',
      status: 'fail',
      detail: 'No verified Firebase account is currently signed in.',
      detailBn: 'বর্তমানে কোনো Firebase অ্যাকাউন্টে সাইন-ইন করা নেই।',
      fixHint: 'Sign in with Email or Google to enable real-time chats, Find People, and notifications.',
      fixHintBn: 'রিয়েল-টাইম চ্যাট ও নোটিফিকেশন চালু করতে ইমেইল বা Google দিয়ে সাইন-ইন করুন।',
    });
    return buildReport(mode, items);
  }

  const uid = fbUser.uid;
  items.push({
    id: 'auth_verified',
    title: 'Email verification & auth token',
    titleBn: 'ইমেইল ভেরিফিকেশন ও অথ টোকেন',
    status: fbUser.emailVerified ? 'pass' : 'fail',
    detail: fbUser.emailVerified
      ? `Verified account (${fbUser.email || uid})`
      : `Signed in as ${fbUser.email || uid}, but emailVerified is false`,
    detailBn: fbUser.emailVerified
      ? `যাচাইকৃত অ্যাকাউন্ট (${fbUser.email || uid})`
      : `${fbUser.email || uid} অ্যাকাউন্টটির ইমেইল এখনো যাচাই করা হয়নি`,
    fixHint: fbUser.emailVerified
      ? 'Firebase security rules grant full member access to verified accounts.'
      : 'Open your inbox for the verification email, click the link, then click "I have verified" in Account Settings. Firestore rules block unverified sessions.',
    fixHintBn: fbUser.emailVerified
      ? 'আপনার যাচাইকৃত অ্যাকাউন্টের জন্য চ্যাট ও ডিরেক্টরি অনুমতি চালু আছে।'
      : 'আপনার ইমেইলে পাঠানো ভেরিফিকেশন লিঙ্কে ক্লিক করুন এবং Account Settings থেকে রিফ্রেশ করুন।',
  });

  if (!fbUser.emailVerified) {
    return buildReport(mode, items);
  }

  // 3. My Profile Document & Discoverable Status
  try {
    const [userSnap, dirSnap] = await Promise.all([
      getDoc(doc(db, 'users', uid)),
      getDoc(doc(db, 'userDirectory', uid)),
    ]);
    const userExists = userSnap.exists();
    const dirExists = dirSnap.exists();
    const isDiscoverable = dirExists && dirSnap.data()?.discoverable === true;
    const handle = String(dirSnap.data()?.handle || userSnap.data()?.handle || '');

    if (userExists && dirExists && isDiscoverable) {
      items.push({
        id: 'profile_discoverable',
        title: 'My profile & Find People visibility',
        titleBn: 'আমার প্রোফাইল ও মানুষ খুঁজুন দৃশ্যমানতা',
        status: 'pass',
        detail: `Profile & directory ready (${handle || uid}, discoverable: true)`,
        detailBn: `প্রোফাইল ও ডিরেক্টরি প্রস্তুত (${handle || uid})`,
        fixHint: 'Other members can find you and start direct chats with you.',
        fixHintBn: 'অন্যান্য সদস্যরা আপনাকে খুঁজে পাবেন এবং সরাসরি চ্যাট করতে পারবেন।',
      });
    } else {
      items.push({
        id: 'profile_discoverable',
        title: 'My profile & Find People visibility',
        titleBn: 'আমার প্রোফাইল ও মানুষ খুঁজুন দৃশ্যমানতা',
        status: userExists && dirExists ? 'warn' : 'fail',
        detail: `users/${uid}: ${userExists ? 'exists' : 'MISSING'} · userDirectory/${uid}: ${dirExists ? 'exists' : 'MISSING'} · discoverable: ${String(dirSnap.data()?.discoverable ?? 'unset')}`,
        detailBn: `প্রোফাইল: ${userExists ? 'আছে' : 'নেই'} · ডিরেক্টরি: ${dirExists ? 'আছে' : 'নেই'} · দৃশ্যমান: ${isDiscoverable ? 'হ্যাঁ' : 'না'}`,
        fixHint: 'Click "Repair my account" in Settings (or above) to create or repair your profile and Find People listing.',
        fixHintBn: 'সেটিংস থেকে "আমার অ্যাকাউন্ট মেরামত করুন" বাটনে ক্লিক করে আপনার প্রোফাইল ঠিক করুন।',
      });
    }
  } catch (err) {
    const parsed = parseFirestoreListenerError(err, OperationType.GET, `users/${uid}`);
    items.push({
      id: 'profile_discoverable',
      title: 'My profile & Find People visibility',
      titleBn: 'আমার প্রোফাইল ও মানুষ খুঁজুন দৃশ্যমানতা',
      status: 'fail',
      detail: `Failed (${parsed.code}): ${parsed.message}`,
      detailBn: `ব্যর্থ (${parsed.code}): প্রোফাইল পড়া যায়নি`,
      fixHint: 'Verify firestore.rules allows owners to read/write users/{uid} and userDirectory/{uid}.',
      fixHintBn: 'firestore.rules-এ নিজের users ও userDirectory ডকুমেন্ট পড়ার ও লেখার অনুমতি আছে কিনা যাচাই করুন।',
      errorCode: parsed.code,
    });
  }

  // 4. My Notifications Read Check
  try {
    const notifSnap = await getDocs(
      query(collection(db, 'users', uid, 'notifications'), orderBy('createdAt', 'desc'), limit(25))
    );
    const unreadCount = notifSnap.docs.filter((d) => d.data()?.read === false).length;
    items.push({
      id: 'notifications_read',
      title: 'My notifications read access',
      titleBn: 'আমার নোটিফিকেশন পড়ার অনুমতি',
      status: notifSnap.size > 0 ? 'pass' : 'warn',
      detail: `${notifSnap.size} notification(s) found (${unreadCount} unread)`,
      detailBn: `${notifSnap.size}টি নোটিফিকেশন পাওয়া গেছে (${unreadCount}টি অপঠিত)`,
      fixHint:
        notifSnap.size > 0
          ? 'Real-time notifications listener can read your notifications subcollection.'
          : 'No notifications yet — click "Repair my account" to seed starter welcome notifications.',
      fixHintBn:
        notifSnap.size > 0
          ? 'রিয়েল-টাইম নোটিফিকেশন সঠিকভাবে কাজ করছে।'
          : 'স্বাগতম নোটিফিকেশন পেতে "আমার অ্যাকাউন্ট মেরামত করুন" বাটনে ক্লিক করুন।',
    });
  } catch (err) {
    const parsed = parseFirestoreListenerError(
      err,
      OperationType.LIST,
      `users/${uid}/notifications`
    );
    items.push({
      id: 'notifications_read',
      title: 'My notifications read access',
      titleBn: 'আমার নোটিফিকেশন পড়ার অনুমতি',
      status: 'fail',
      detail: `Error (${parsed.code}): ${parsed.message}`,
      detailBn: `ত্রুটি (${parsed.code}): নোটিফিকেশন লোড করা যায়নি`,
      fixHint: 'Publish the updated firestore.rules so users/{uid}/notifications allows owner list/get/create.',
      fixHintBn: 'আপডেট করা firestore.rules প্রকাশ করুন যাতে নিজের নোটিফিকেশন পড়া যায়।',
      errorCode: parsed.code,
      indexUrl: parsed.indexUrl,
    });
  }

  // 5. My Conversations Read Check
  try {
    const [directSnap, demoSnap] = await Promise.all([
      getDocs(query(collection(db, 'conversations'), where('participants', 'array-contains', uid))),
      getDocs(collection(db, 'users', uid, 'demoConversations')),
    ]);
    items.push({
      id: 'conversations_read',
      title: 'My conversations & welcome chat',
      titleBn: 'আমার কথোপকথন ও স্বাগতম চ্যাট',
      status: directSnap.size + demoSnap.size > 0 ? 'pass' : 'warn',
      detail: `${directSnap.size} real 1-to-1 chat(s) · ${demoSnap.size} demo/team chat(s)`,
      detailBn: `${directSnap.size}টি সরাসরি চ্যাট · ${demoSnap.size}টি ডেমো/টিম চ্যাট`,
      fixHint:
        directSnap.size + demoSnap.size > 0
          ? 'Direct conversations and personal demo threads are readable.'
          : 'Click "Repair my account" to restore the Rizik Team welcome chat or start a chat from Find People.',
      fixHintBn:
        directSnap.size + demoSnap.size > 0
          ? 'সরাসরি ও ডেমো কথোপকথন পড়ার অনুমতি সক্রিয় আছে।'
          : '"আমার অ্যাকাউন্ট মেরামত করুন" ক্লিক করে স্বাগতম চ্যাট তৈরি করুন।',
    });
  } catch (err) {
    const parsed = parseFirestoreListenerError(err, OperationType.LIST, 'conversations');
    items.push({
      id: 'conversations_read',
      title: 'My conversations & welcome chat',
      titleBn: 'আমার কথোপকথন ও স্বাগতম চ্যাট',
      status: 'fail',
      detail: `Error (${parsed.code}): ${parsed.message}`,
      detailBn: `ত্রুটি (${parsed.code}): চ্যাট তালিকা লোড করা যায়নি`,
      fixHint: 'Check firestore.rules for conversations list permission (participants array-contains auth.uid).',
      fixHintBn: 'firestore.rules-এ conversations পড়ার নিয়ম পরীক্ষা করুন।',
      errorCode: parsed.code,
      indexUrl: parsed.indexUrl,
    });
  }

  // 6. Find People Directory Read Check
  try {
    const dirSnap = await getDocs(
      query(collection(db, 'userDirectory'), where('discoverable', '==', true), limit(100))
    );
    let demoCount = 0;
    let realCount = 0;
    dirSnap.docs.forEach((d) => {
      if (d.data()?.isDemo || d.id.startsWith('demo_')) demoCount += 1;
      else realCount += 1;
    });
    items.push({
      id: 'find_people_read',
      title: 'Find People directory read',
      titleBn: 'মানুষ খুঁজুন ডিরেক্টরি পড়া',
      status: dirSnap.size > 0 ? (demoCount > 0 ? 'pass' : 'warn') : 'warn',
      detail: `${dirSnap.size} discoverable profile(s) found (${realCount} community user(s), ${demoCount} demo persona(s))`,
      detailBn: `${dirSnap.size}টি প্রোফাইল পাওয়া গেছে (${realCount} জন ব্যবহারকারী, ${demoCount}টি ডেমো অ্যাকাউন্ট)`,
      fixHint:
        demoCount === 0
          ? 'No demo personas found in Firestore yet — an Admin should run "Seed / Repair Demo Data" in the Admin panel.'
          : 'Find People directory is readable with both community users and demo accounts.',
      fixHintBn:
        demoCount === 0
          ? 'ডেমো অ্যাকাউন্ট এখনো সিড করা হয়নি — অ্যাডমিন প্যানেল থেকে "Seed Demo Data" চালান।'
          : 'কমিউনিটি সদস্য ও ডেমো অ্যাকাউন্ট উভয়ই ডিরেক্টরি থেকে পড়া যাচ্ছে।',
    });
  } catch (err) {
    const parsed = parseFirestoreListenerError(err, OperationType.LIST, 'userDirectory');
    items.push({
      id: 'find_people_read',
      title: 'Find People directory read',
      titleBn: 'মানুষ খুঁজুন ডিরেক্টরি পড়া',
      status: 'fail',
      detail: `Error (${parsed.code}): ${parsed.message}`,
      detailBn: `ত্রুটি (${parsed.code}): মানুষ খুঁজুন ডিরেক্টরি পড়া যায়নি`,
      fixHint: 'Publish firestore.rules so all verified signed-in users can read discoverable userDirectory entries.',
      fixHintBn: 'firestore.rules প্রকাশ করুন যাতে যাচাইকৃত ব্যবহারকারীরা userDirectory পড়তে পারেন।',
      errorCode: parsed.code,
      indexUrl: parsed.indexUrl,
    });
  }

  // 7. Community Rooms & Messages Read Check
  let targetRoomIdForWriteTest: string | null = null;
  try {
    const roomsSnap = await getDocs(query(collection(db, 'rooms'), orderBy('pinnedOrder', 'asc')));
    const firstRoomId =
      roomsSnap.docs.find((d) => d.id === 'room_rizik_community')?.id ?? roomsSnap.docs[0]?.id ?? null;
    targetRoomIdForWriteTest = firstRoomId;

    let firstRoomMsgCount = 0;
    if (firstRoomId) {
      const msgsSnap = await getDocs(
        query(collection(db, 'rooms', firstRoomId, 'messages'), orderBy('createdAt', 'desc'), limit(50))
      );
      firstRoomMsgCount = msgsSnap.size;
    }

    items.push({
      id: 'community_rooms_read',
      title: 'Community rooms & history read',
      titleBn: 'কমিউনিটি রুম ও বার্তা ইতিহাস',
      status: roomsSnap.size > 0 && firstRoomMsgCount > 0 ? 'pass' : 'warn',
      detail:
        roomsSnap.size > 0
          ? `${roomsSnap.size} room(s) found · ${firstRoomId}: ${firstRoomMsgCount} message(s)`
          : '0 community rooms found in Firestore',
      detailBn:
        roomsSnap.size > 0
          ? `${roomsSnap.size}টি রুম পাওয়া গেছে · ${firstRoomId}: ${firstRoomMsgCount}টি বার্তা`
          : 'কোনো কমিউনিটি রুম পাওয়া যায়নি',
      fixHint:
        roomsSnap.size > 0 && firstRoomMsgCount > 0
          ? 'Rizik Community rooms and history are readable.'
          : 'Run "Seed / Repair Demo Data" from Admin panel to create the 3 community rooms and history.',
      fixHintBn:
        roomsSnap.size > 0 && firstRoomMsgCount > 0
          ? 'কমিউনিটি রুম ও পুরনো বার্তা সঠিকভাবে পড়া যাচ্ছে।'
          : 'অ্যাডমিন প্যানেল থেকে "Seed Demo Data" চালিয়ে কমিউনিটি রুম তৈরি করুন।',
    });
  } catch (err) {
    const parsed = parseFirestoreListenerError(err, OperationType.LIST, 'rooms');
    items.push({
      id: 'community_rooms_read',
      title: 'Community rooms & history read',
      titleBn: 'কমিউনিটি রুম ও বার্তা ইতিহাস',
      status: 'fail',
      detail: `Error (${parsed.code}): ${parsed.message}`,
      detailBn: `ত্রুটি (${parsed.code}): কমিউনিটি রুম পড়া যায়নি`,
      fixHint: 'Ensure firestore.rules allows verified signed-in users to read rooms and rooms/{roomId}/messages.',
      fixHintBn: 'firestore.rules-এ rooms ও রুমের messages পড়ার অনুমতি নিশ্চিত করুন।',
      errorCode: parsed.code,
      indexUrl: parsed.indexUrl,
    });
  }

  // --- ADMIN-ONLY CHECKS ---
  if (mode === 'admin') {
    // 8. Demo Data Seeded Counts
    try {
      const demoDirSnap = await getDocs(
        query(collection(db, 'userDirectory'), where('isDemo', '==', true))
      );
      const roomsSnap = await getDocs(collection(db, 'rooms'));
      let totalSeededMsgs = 0;
      for (const spec of COMMUNITY_ROOM_SPECS) {
        const ms = await getDocs(collection(db, 'rooms', spec.id, 'messages')).catch(() => null);
        totalSeededMsgs += ms?.size ?? 0;
      }
      const expectedPersonas = DEMO_PERSONAS.length;
      const expectedRooms = COMMUNITY_ROOM_SPECS.length;
      const expectedMsgs = COMMUNITY_ROOM_SPECS.reduce((acc, r) => acc + r.messages.length, 0);
      const allSeeded =
        demoDirSnap.size >= expectedPersonas &&
        roomsSnap.size >= expectedRooms &&
        totalSeededMsgs >= expectedMsgs;

      items.push({
        id: 'admin_demo_counts',
        title: 'Demo data seeded inventory',
        titleBn: 'ডেমো ডাটা সিডিং অবস্থা',
        status: allSeeded ? 'pass' : 'warn',
        detail: `Personas: ${demoDirSnap.size}/${expectedPersonas} · Rooms: ${roomsSnap.size}/${expectedRooms} · Messages: ${totalSeededMsgs}/${expectedMsgs}`,
        detailBn: `ডেমো প্রোফাইল: ${demoDirSnap.size}/${expectedPersonas} · রুম: ${roomsSnap.size}/${expectedRooms} · বার্তা: ${totalSeededMsgs}/${expectedMsgs}`,
        fixHint: allSeeded
          ? 'All expected demo personas, rooms, and messages exist in Firestore.'
          : 'Click "Seed / Repair Demo Data" in the Demo Seeding card above to populate missing records.',
        fixHintBn: allSeeded
          ? 'সকল ডেমো অ্যাকাউন্ট, কমিউনিটি রুম এবং বার্তা সঠিকভাবে সিড করা আছে।'
          : 'উপরে "Seed / Repair Demo Data" বাটনে ক্লিক করে ডেমো ডাটা সিড করুন।',
      });
    } catch (err) {
      const parsed = parseFirestoreListenerError(err, OperationType.LIST, 'userDirectory');
      items.push({
        id: 'admin_demo_counts',
        title: 'Demo data seeded inventory',
        titleBn: 'ডেমো ডাটা সিডিং অবস্থা',
        status: 'fail',
        detail: `Error (${parsed.code}): ${parsed.message}`,
        detailBn: `ত্রুটি (${parsed.code}): ডেমো ডাটা যাচাই করা যায়নি`,
        fixHint: 'Check admin privileges and firestore.rules.',
        fixHintBn: 'অ্যাডমিন অনুমতি ও firestore.rules যাচাই করুন।',
        errorCode: parsed.code,
      });
    }

    // 9. Community Room Write -> Read Back -> Delete Test
    if (!targetRoomIdForWriteTest) {
      items.push({
        id: 'admin_room_write_test',
        title: 'Community room write, read-back & delete test',
        titleBn: 'কমিউনিটি রুম লেখা, পড়া ও মোছার পরীক্ষা',
        status: 'warn',
        detail: 'Skipped because no community room exists yet.',
        detailBn: 'কোনো কমিউনিটি রুম না থাকায় পরীক্ষা চালানো যায়নি।',
        fixHint: 'Seed demo rooms first, then re-run this health check.',
        fixHintBn: 'প্রথমে ডেমো রুম সিড করুন এবং আবার পরীক্ষা চালান।',
      });
    } else {
      const testMsgId = `hc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const testMsgRef = doc(db, 'rooms', targetRoomIdForWriteTest, 'messages', testMsgId);
      try {
        await setDoc(testMsgRef, {
          roomId: targetRoomIdForWriteTest,
          senderId: uid,
          senderName: user.name || 'Admin Health Check',
          senderHandle: user.handle || '@admin',
          senderAvatar: null,
          senderRole: 'admin',
          senderArea: user.area || 'Dhaka',
          senderVerified: true,
          senderIsDemo: false,
          text: 'Health check test message (auto-deleted)',
          messageType: 'text',
          mediaUrl: null,
          replyToId: null,
          replyToText: null,
          replyToSenderName: null,
          reactions: {},
          reportedBy: [],
          deleted: false,
          isDemo: false,
          createdAt: serverTimestamp(),
        });
        const readBack = await getDoc(testMsgRef);
        const readOk = readBack.exists();
        await deleteDoc(testMsgRef);

        items.push({
          id: 'admin_room_write_test',
          title: 'Community room write, read-back & delete test',
          titleBn: 'কমিউনিটি রুম লেখা, পড়া ও মোছার পরীক্ষা',
          status: readOk ? 'pass' : 'fail',
          detail: readOk
            ? `Created, read back, and cleaned up test message in ${targetRoomIdForWriteTest}`
            : `Test message written to ${targetRoomIdForWriteTest} could not be read back`,
          detailBn: readOk
            ? `${targetRoomIdForWriteTest} রুমে টেস্ট বার্তা তৈরি, পড়া ও সফলভাবে মুছে ফেলা হয়েছে`
            : 'টেস্ট বার্তাটি পুনরায় পড়া যায়নি',
          fixHint: readOk
            ? 'Room write, read-back, and delete permissions are healthy.'
            : 'Verify firestore.rules on rooms/{roomId}/messages.',
          fixHintBn: readOk
            ? 'কমিউনিটি রুমে লেখা, পড়া ও মোছার অনুমতি সঠিকভাবে কাজ করছে।'
            : 'firestore.rules-এ rooms/{roomId}/messages নিয়ম যাচাই করুন।',
        });
      } catch (err) {
        // Best-effort cleanup if created before failing read/delete
        await deleteDoc(testMsgRef).catch(() => {});
        const parsed = parseFirestoreListenerError(
          err,
          OperationType.WRITE,
          `rooms/${targetRoomIdForWriteTest}/messages/${testMsgId}`
        );
        items.push({
          id: 'admin_room_write_test',
          title: 'Community room write, read-back & delete test',
          titleBn: 'কমিউনিটি রুম লেখা, পড়া ও মোছার পরীক্ষা',
          status: 'fail',
          detail: `Failed (${parsed.code}): ${parsed.message}`,
          detailBn: `ব্যর্থ (${parsed.code}): রুমে বার্তা লেখা বা মোছা যায়নি`,
          fixHint:
            'Publish the updated firestore.rules (admins can write/delete room messages, muted check & rate limit respected).',
          fixHintBn: 'আপডেট করা firestore.rules প্রকাশ করুন এবং নিশ্চিত করুন আপনি রুমে মিউট করা নন।',
          errorCode: parsed.code,
        });
      }
    }

    // 10. Composite Indexes Probe
    const indexProbes: Array<{ name: string; run: () => Promise<unknown> }> = [
      {
        name: 'conversations(participants + lastMessageAt)',
        run: () =>
          getDocs(
            query(
              collection(db, 'conversations'),
              where('participants', 'array-contains', uid),
              orderBy('lastMessageAt', 'desc'),
              limit(1)
            )
          ),
      },
      {
        name: 'collectionGroup(messages)(participants + createdAt)',
        run: () =>
          getDocs(
            query(
              collectionGroup(db, 'messages'),
              where('participants', 'array-contains', uid),
              orderBy('createdAt', 'desc'),
              limit(1)
            )
          ),
      },
      {
        name: 'userDirectory(discoverable + lastSeen)',
        run: () =>
          getDocs(
            query(
              collection(db, 'userDirectory'),
              where('discoverable', '==', true),
              orderBy('lastSeen', 'desc'),
              limit(1)
            )
          ),
      },
      {
        name: 'listings(status + createdAt)',
        run: () =>
          getDocs(
            query(
              collection(db, 'listings'),
              where('status', '==', 'active'),
              orderBy('createdAt', 'desc'),
              limit(1)
            )
          ),
      },
      {
        name: 'adminNotifications(read + createdAt)',
        run: () =>
          getDocs(
            query(
              collection(db, 'adminNotifications'),
              where('read', '==', false),
              orderBy('createdAt', 'desc'),
              limit(1)
            )
          ),
      },
    ];

    const missingIndexNames: string[] = [];
    let firstIndexUrl: string | null = null;
    const otherErrors: string[] = [];

    for (const probe of indexProbes) {
      try {
        await probe.run();
      } catch (err) {
        const parsed = parseFirestoreListenerError(err, OperationType.LIST, probe.name);
        if (parsed.isIndexError) {
          missingIndexNames.push(probe.name);
          if (!firstIndexUrl && parsed.indexUrl) {
            firstIndexUrl = parsed.indexUrl;
          }
        } else if (!parsed.isPermissionError) {
          otherErrors.push(`${probe.name}: ${parsed.code}`);
        }
      }
    }

    if (missingIndexNames.length === 0 && otherErrors.length === 0) {
      items.push({
        id: 'admin_indexes',
        title: 'Firestore composite indexes',
        titleBn: 'Firestore কম্পোজিট ইনডেক্স',
        status: 'pass',
        detail: `All ${indexProbes.length}/${indexProbes.length} composite queries passed without missing-index errors`,
        detailBn: `${indexProbes.length}/${indexProbes.length}টি কম্পোজিট কোয়েরি সফলভাবে সম্পন্ন হয়েছে`,
        fixHint: 'All required composite indexes are deployed and enabled.',
        fixHintBn: 'প্রয়োজনীয় সকল কম্পোজিট ইনডেক্স সক্রিয় আছে।',
      });
    } else {
      items.push({
        id: 'admin_indexes',
        title: 'Firestore composite indexes',
        titleBn: 'Firestore কম্পোজিট ইনডেক্স',
        status: 'fail',
        detail: `Missing index for: ${missingIndexNames.join(', ')}${otherErrors.length ? ` · Errors: ${otherErrors.join('; ')}` : ''}`,
        detailBn: `অনুপস্থিত ইনডেক্স: ${missingIndexNames.join(', ')}`,
        fixHint:
          'Deploy firestore.indexes.json via Firebase CLI (`firebase deploy --only firestore:indexes`) or click the Firebase Console link to create the missing index.',
        fixHintBn:
          'Firebase CLI দিয়ে `firestore.indexes.json` ডিপ্লয় করুন অথবা নিচের কনসোল লিঙ্ক থেকে ইনডেক্স তৈরি করুন।',
        errorCode: 'failed-precondition',
        indexUrl: firstIndexUrl,
      });
    }
  }

  return buildReport(mode, items);
}

function buildReport(mode: 'user' | 'admin', items: HealthCheckItem[]): HealthCheckReport {
  return {
    ranAt: new Date().toISOString(),
    mode,
    summary: {
      pass: items.filter((i) => i.status === 'pass').length,
      warn: items.filter((i) => i.status === 'warn').length,
      fail: items.filter((i) => i.status === 'fail').length,
    },
    items,
  };
}
