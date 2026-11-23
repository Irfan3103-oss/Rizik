import 'dart:math';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb_auth;
import 'package:firebase_core/firebase_core.dart';
import '../data/demo_personas.dart';
import '../firebase_options.dart';
import '../models/models.dart';
import 'firestore_error_helper.dart';

class HealthCheckItem {
  final String id;
  final String title;
  final String titleBn;
  final String status; // 'pass' | 'warn' | 'fail'
  final String detail;
  final String detailBn;
  final String fixHint;
  final String fixHintBn;
  final String? errorCode;
  final String? indexUrl;

  const HealthCheckItem({
    required this.id,
    required this.title,
    required this.titleBn,
    required this.status,
    required this.detail,
    required this.detailBn,
    required this.fixHint,
    required this.fixHintBn,
    this.errorCode,
    this.indexUrl,
  });
}

class HealthCheckReport {
  final String ranAt;
  final String mode; // 'user' | 'admin'
  final int passCount;
  final int warnCount;
  final int failCount;
  final List<HealthCheckItem> items;

  const HealthCheckReport({
    required this.ranAt,
    required this.mode,
    required this.passCount,
    required this.warnCount,
    required this.failCount,
    required this.items,
  });
}

class HealthCheckService {
  HealthCheckService._();
  static final HealthCheckService instance = HealthCheckService._();

  final Random _rng = Random();

  FirebaseFirestore get db => FirebaseFirestore.instanceFor(
        app: Firebase.app(),
        databaseId: DefaultFirebaseOptions.firestoreDatabaseId,
      );

  Future<HealthCheckReport> runHealthCheck({
    required String mode, // 'user' | 'admin'
    required fb_auth.User? fbUser,
    required AppUser? user,
  }) async {
    final items = <HealthCheckItem>[];

    // 1. Firebase Config Check
    final cfg = getFirebaseConfigHealth();
    items.add(HealthCheckItem(
      id: 'firebase_config',
      title: 'Firebase configuration & database ID',
      titleBn: 'Firebase কনফিগারেশন ও ডাটাবেস আইডি',
      status: cfg.ok ? 'pass' : 'fail',
      detail: cfg.ok
          ? 'Project: ${cfg.projectId} · DB: ${cfg.firestoreDatabaseId} · Storage: ${cfg.hasStorageBucket ? 'ok' : 'none'} · RTDB: ${cfg.hasRtdbUrl ? 'ok' : 'none'}'
          : 'Missing keys: ${cfg.missingKeys.join(', ')}',
      detailBn: cfg.ok
          ? 'প্রজেক্ট: ${cfg.projectId} · ডাটাবেস: ${cfg.firestoreDatabaseId}'
          : 'অনুপস্থিত কনফিগ কী: ${cfg.missingKeys.join(', ')}',
      fixHint: cfg.ok
          ? 'All required Firebase client configuration values are loaded.'
          : 'Check firebase_options.dart and google-services.json in Android Studio.',
      fixHintBn: cfg.ok
          ? 'সকল প্রয়োজনীয় Firebase কনফিগারেশন সঠিকভাবে লোড হয়েছে।'
          : 'firebase_options.dart ও google-services.json যাচাই করুন।',
    ));

    // 2. Auth Session & Email Verification Check
    if (fbUser == null || user == null) {
      items.add(const HealthCheckItem(
        id: 'auth_session',
        title: 'Signed-in Firebase session',
        titleBn: 'সাইন-ইন করা Firebase সেশন',
        status: 'fail',
        detail: 'No verified Firebase account is currently signed in.',
        detailBn: 'বর্তমানে কোনো Firebase অ্যাকাউন্টে সাইন-ইন করা নেই।',
        fixHint:
            'Sign in with Email or Google to enable real-time chats, Find People, and notifications.',
        fixHintBn:
            'রিয়েল-টাইম চ্যাট ও নোটিফিকেশন চালু করতে ইমেইল বা Google দিয়ে সাইন-ইন করুন।',
      ));
      return _buildReport(mode, items);
    }

    final uid = fbUser.uid;
    items.add(HealthCheckItem(
      id: 'auth_verified',
      title: 'Email verification & auth token',
      titleBn: 'ইমেইল ভেরিফিকেশন ও অথ টোকেন',
      status: fbUser.emailVerified ? 'pass' : 'fail',
      detail: fbUser.emailVerified
          ? 'Verified account (${fbUser.email ?? uid})'
          : 'Signed in as ${fbUser.email ?? uid}, but emailVerified is false',
      detailBn: fbUser.emailVerified
          ? 'যাচাইকৃত অ্যাকাউন্ট (${fbUser.email ?? uid})'
          : '${fbUser.email ?? uid} অ্যাকাউন্টটির ইমেইল এখনো যাচাই করা হয়নি',
      fixHint: fbUser.emailVerified
          ? 'Firebase security rules grant full member access to verified accounts.'
          : 'Open your inbox for the verification email, click the link, then refresh status. Firestore rules block unverified sessions.',
      fixHintBn: fbUser.emailVerified
          ? 'আপনার যাচাইকৃত অ্যাকাউন্টের জন্য চ্যাট ও ডিরেক্টরি অনুমতি চালু আছে।'
          : 'আপনার ইমেইলে পাঠানো ভেরিফিকেশন লিঙ্কে ক্লিক করে যাচাই করুন।',
    ));

    if (!fbUser.emailVerified) {
      return _buildReport(mode, items);
    }

    // 3. My Profile Document & Discoverable Status
    try {
      final results = await Future.wait([
        getDocResilient(db.collection('users').doc(uid), db: db),
        getDocResilient(db.collection('userDirectory').doc(uid), db: db),
      ]);
      final userSnap = results[0];
      final dirSnap = results[1];
      final userExists = userSnap.exists;
      final dirExists = dirSnap.exists;
      final isDiscoverable =
          dirExists && dirSnap.data()?['discoverable'] == true;
      final handle =
          (dirSnap.data()?['handle'] ?? userSnap.data()?['handle'] ?? '')
              .toString();

      if (userExists && dirExists && isDiscoverable) {
        items.add(HealthCheckItem(
          id: 'profile_discoverable',
          title: 'My profile & Find People visibility',
          titleBn: 'আমার প্রোফাইল ও মানুষ খুঁজুন দৃশ্যমানতা',
          status: 'pass',
          detail:
              'Profile & directory ready (${handle.isNotEmpty ? handle : uid}, discoverable: true)',
          detailBn:
              'প্রোফাইল ও ডিরেক্টরি প্রস্তুত (${handle.isNotEmpty ? handle : uid})',
          fixHint: 'Other members can find you and start direct chats with you.',
          fixHintBn:
              'অন্যান্য সদস্যরা আপনাকে খুঁজে পাবেন এবং সরাসরি চ্যাট করতে পারবেন।',
        ));
      } else {
        items.add(HealthCheckItem(
          id: 'profile_discoverable',
          title: 'My profile & Find People visibility',
          titleBn: 'আমার প্রোফাইল ও মানুষ খুঁজুন দৃশ্যমানতা',
          status: userExists && dirExists ? 'warn' : 'fail',
          detail:
              'users/$uid: ${userExists ? 'exists' : 'MISSING'} · userDirectory/$uid: ${dirExists ? 'exists' : 'MISSING'} · discoverable: ${dirSnap.data()?['discoverable'] ?? 'unset'}',
          detailBn:
              'প্রোফাইল: ${userExists ? 'আছে' : 'নেই'} · ডিরেক্টরি: ${dirExists ? 'আছে' : 'নেই'} · দৃশ্যমান: ${isDiscoverable ? 'হ্যাঁ' : 'না'}',
          fixHint:
              'Tap "Repair my account" in Settings to create or repair your profile and Find People listing.',
          fixHintBn:
              'সেটিংস থেকে "আমার অ্যাকাউন্ট মেরামত করুন" বাটনে ট্যাপ করে প্রোফাইল ঠিক করুন।',
        ));
      }
    } catch (err) {
      final parsed = parseFirestoreListenerError(err, 'GET', 'users/$uid');
      items.add(HealthCheckItem(
        id: 'profile_discoverable',
        title: 'My profile & Find People visibility',
        titleBn: 'আমার প্রোফাইল ও মানুষ খুঁজুন দৃশ্যমানতা',
        status: 'fail',
        detail: 'Failed (${parsed.code}): ${parsed.message}',
        detailBn: 'ব্যর্থ (${parsed.code}): প্রোফাইল পড়া যায়নি',
        fixHint:
            'Verify firestore.rules allows owners to read/write users/{uid} and userDirectory/{uid}.',
        fixHintBn:
            'firestore.rules-এ নিজের users ও userDirectory ডকুমেন্ট পড়ার ও লেখার অনুমতি আছে কিনা যাচাই করুন।',
        errorCode: parsed.code,
      ));
    }

    // 4. My Notifications Read Check
    try {
      final notifSnap = await getDocsResilient(
        db
            .collection('users')
            .doc(uid)
            .collection('notifications')
            .orderBy('createdAt', descending: true)
            .limit(25),
        db: db,
      );
      final unreadCount =
          notifSnap.docs.where((d) => d.data()['read'] == false).length;
      items.add(HealthCheckItem(
        id: 'notifications_read',
        title: 'My notifications read access',
        titleBn: 'আমার নোটিফিকেশন পড়ার অনুমতি',
        status: notifSnap.size > 0 ? 'pass' : 'warn',
        detail:
            '${notifSnap.size} notification(s) found ($unreadCount unread)',
        detailBn:
            '${notifSnap.size}টি নোটিফিকেশন পাওয়া গেছে ($unreadCountটি অপঠিত)',
        fixHint: notifSnap.size > 0
            ? 'Real-time notifications listener can read your notifications subcollection.'
            : 'No notifications yet — tap "Repair my account" to seed starter welcome notifications.',
        fixHintBn: notifSnap.size > 0
            ? 'রিয়েল-টাইম নোটিফিকেশন সঠিকভাবে কাজ করছে।'
            : 'স্বাগতম নোটিফিকেশন পেতে "আমার অ্যাকাউন্ট মেরামত করুন" ট্যাপ করুন।',
      ));
    } catch (err) {
      final parsed = parseFirestoreListenerError(
          err, 'LIST', 'users/$uid/notifications');
      items.add(HealthCheckItem(
        id: 'notifications_read',
        title: 'My notifications read access',
        titleBn: 'আমার নোটিফিকেশন পড়ার অনুমতি',
        status: 'fail',
        detail: 'Error (${parsed.code}): ${parsed.message}',
        detailBn: 'ত্রুটি (${parsed.code}): নোটিফিকেশন লোড করা যায়নি',
        fixHint:
            'Publish the updated firestore.rules so users/{uid}/notifications allows owner list/get/create.',
        fixHintBn:
            'আপডেট করা firestore.rules প্রকাশ করুন যাতে নিজের নোটিফিকেশন পড়া যায়।',
        errorCode: parsed.code,
        indexUrl: parsed.indexUrl,
      ));
    }

    // 5. My Conversations Read Check
    try {
      final snaps = await Future.wait([
        getDocsResilient(
          db.collection('conversations').where('participants', arrayContains: uid),
          db: db,
        ),
        getDocsResilient(
          db.collection('users').doc(uid).collection('demoConversations'),
          db: db,
        ),
      ]);
      final directSize = snaps[0].size;
      final demoSize = snaps[1].size;
      items.add(HealthCheckItem(
        id: 'conversations_read',
        title: 'My conversations & welcome chat',
        titleBn: 'আমার কথোপকথন ও স্বাগতম চ্যাট',
        status: directSize + demoSize > 0 ? 'pass' : 'warn',
        detail: '$directSize real 1-to-1 chat(s) · $demoSize demo/team chat(s)',
        detailBn: '$directSizeটি সরাসরি চ্যাট · $demoSizeটি ডেমো/টিম চ্যাট',
        fixHint: directSize + demoSize > 0
            ? 'Direct conversations and personal demo threads are readable.'
            : 'Tap "Repair my account" in Settings to restore the Rizik Team welcome chat.',
        fixHintBn: directSize + demoSize > 0
            ? 'সরাসরি ও ডেমো কথোপকথন পড়ার অনুমতি সক্রিয় আছে।'
            : '"আমার অ্যাকাউন্ট মেরামত করুন" ক্লিক করে স্বাগতম চ্যাট তৈরি করুন।',
      ));
    } catch (err) {
      final parsed = parseFirestoreListenerError(err, 'LIST', 'conversations');
      items.add(HealthCheckItem(
        id: 'conversations_read',
        title: 'My conversations & welcome chat',
        titleBn: 'আমার কথোপকথন ও স্বাগতম চ্যাট',
        status: 'fail',
        detail: 'Error (${parsed.code}): ${parsed.message}',
        detailBn: 'ত্রুটি (${parsed.code}): চ্যাট তালিকা লোড করা যায়নি',
        fixHint:
            'Check firestore.rules for conversations list permission (participants array-contains auth.uid).',
        fixHintBn: 'firestore.rules-এ conversations পড়ার নিয়ম পরীক্ষা করুন।',
        errorCode: parsed.code,
        indexUrl: parsed.indexUrl,
      ));
    }

    // 6. Find People Directory Read Check
    try {
      final dirSnap = await getDocsResilient(
        db
            .collection('userDirectory')
            .where('discoverable', isEqualTo: true)
            .limit(100),
        db: db,
      );
      var demoCount = 0;
      var realCount = 0;
      for (final d in dirSnap.docs) {
        if (d.data()['isDemo'] == true || d.id.startsWith('demo_')) {
          demoCount += 1;
        } else {
          realCount += 1;
        }
      }
      items.add(HealthCheckItem(
        id: 'find_people_read',
        title: 'Find People directory read',
        titleBn: 'মানুষ খুঁজুন ডিরেক্টরি পড়া',
        status: dirSnap.size > 0 && demoCount > 0 ? 'pass' : 'warn',
        detail:
            '${dirSnap.size} discoverable profile(s) found ($realCount community user(s), $demoCount demo persona(s))',
        detailBn:
            '${dirSnap.size}টি প্রোফাইল পাওয়া গেছে ($realCount জন ব্যবহারকারী, $demoCountটি ডেমো অ্যাকাউন্ট)',
        fixHint: demoCount == 0
            ? 'No demo personas found in Firestore yet — an Admin should run "Seed / Repair Demo Data" in Admin Review.'
            : 'Find People directory is readable with both community users and demo accounts.',
        fixHintBn: demoCount == 0
            ? 'ডেমো অ্যাকাউন্ট এখনো সিড করা হয়নি — অ্যাডমিন প্যানেল থেকে "Seed Demo Data" চালান।'
            : 'কমিউনিটি সদস্য ও ডেমো অ্যাকাউন্ট উভয়ই ডিরেক্টরি থেকে পড়া যাচ্ছে।',
      ));
    } catch (err) {
      final parsed = parseFirestoreListenerError(err, 'LIST', 'userDirectory');
      items.add(HealthCheckItem(
        id: 'find_people_read',
        title: 'Find People directory read',
        titleBn: 'মানুষ খুঁজুন ডিরেক্টরি পড়া',
        status: 'fail',
        detail: 'Error (${parsed.code}): ${parsed.message}',
        detailBn: 'ত্রুটি (${parsed.code}): মানুষ খুঁজুন ডিরেক্টরি পড়া যায়নি',
        fixHint:
            'Publish firestore.rules so all verified signed-in users can read discoverable userDirectory entries.',
        fixHintBn:
            'firestore.rules প্রকাশ করুন যাতে যাচাইকৃত ব্যবহারকারীরা userDirectory পড়তে পারেন।',
        errorCode: parsed.code,
        indexUrl: parsed.indexUrl,
      ));
    }

    // 7. Community Rooms & Messages Read Check
    String? targetRoomIdForWriteTest;
    try {
      final roomsSnap = await getDocsResilient(
        db.collection('rooms').orderBy('pinnedOrder', descending: false),
        db: db,
      );
      final firstRoomId = roomsSnap.docs
              .where((d) => d.id == 'room_rizik_community')
              .firstOrNull
              ?.id ??
          roomsSnap.docs.firstOrNull?.id;
      targetRoomIdForWriteTest = firstRoomId;

      var firstRoomMsgCount = 0;
      if (firstRoomId != null) {
        final msgsSnap = await getDocsResilient(
          db
              .collection('rooms')
              .doc(firstRoomId)
              .collection('messages')
              .orderBy('createdAt', descending: true)
              .limit(50),
          db: db,
        );
        firstRoomMsgCount = msgsSnap.size;
      }

      items.add(HealthCheckItem(
        id: 'community_rooms_read',
        title: 'Community rooms & history read',
        titleBn: 'কমিউনিটি রুম ও বার্তা ইতিহাস',
        status: roomsSnap.size > 0 && firstRoomMsgCount > 0 ? 'pass' : 'warn',
        detail: roomsSnap.size > 0
            ? '${roomsSnap.size} room(s) found · $firstRoomId: $firstRoomMsgCount message(s)'
            : '0 community rooms found in Firestore',
        detailBn: roomsSnap.size > 0
            ? '${roomsSnap.size}টি রুম পাওয়া গেছে · $firstRoomId: $firstRoomMsgCountটি বার্তা'
            : 'কোনো কমিউনিটি রুম পাওয়া যায়নি',
        fixHint: roomsSnap.size > 0 && firstRoomMsgCount > 0
            ? 'Rizik Community rooms and history are readable.'
            : 'Run "Seed / Repair Demo Data" from Admin Review to create the 3 community rooms and history.',
        fixHintBn: roomsSnap.size > 0 && firstRoomMsgCount > 0
            ? 'কমিউনিটি রুম ও পুরনো বার্তা সঠিকভাবে পড়া যাচ্ছে।'
            : 'অ্যাডমিন প্যানেল থেকে "Seed Demo Data" চালিয়ে কমিউনিটি রুম তৈরি করুন।',
      ));
    } catch (err) {
      final parsed = parseFirestoreListenerError(err, 'LIST', 'rooms');
      items.add(HealthCheckItem(
        id: 'community_rooms_read',
        title: 'Community rooms & history read',
        titleBn: 'কমিউনিটি রুম ও বার্তা ইতিহাস',
        status: 'fail',
        detail: 'Error (${parsed.code}): ${parsed.message}',
        detailBn: 'ত্রুটি (${parsed.code}): কমিউনিটি রুম পড়া যায়নি',
        fixHint:
            'Ensure firestore.rules allows verified signed-in users to read rooms and rooms/{roomId}/messages.',
        fixHintBn:
            'firestore.rules-এ rooms ও রুমের messages পড়ার অনুমতি নিশ্চিত করুন।',
        errorCode: parsed.code,
        indexUrl: parsed.indexUrl,
      ));
    }

    // --- ADMIN-ONLY CHECKS ---
    if (mode == 'admin') {
      // 8. Demo Data Seeded Counts
      try {
        final demoDirSnap = await getDocsResilient(
          db.collection('userDirectory').where('isDemo', isEqualTo: true),
          db: db,
        );
        final roomsSnap =
            await getDocsResilient(db.collection('rooms'), db: db);
        var totalSeededMsgs = 0;
        for (final spec in communityRoomSpecs) {
          try {
            final ms = await getDocsResilient(
              db.collection('rooms').doc(spec.id).collection('messages'),
              db: db,
            );
            totalSeededMsgs += ms.size;
          } catch (_) {}
        }

        final expectedPersonas = demoPersonas.length;
        final expectedRooms = communityRoomSpecs.length;
        final expectedMsgs = communityRoomSpecs.fold<int>(
          0,
          (acc, r) => acc + r.messages.length,
        );
        final allSeeded = demoDirSnap.size >= expectedPersonas &&
            roomsSnap.size >= expectedRooms &&
            totalSeededMsgs >= expectedMsgs;

        items.add(HealthCheckItem(
          id: 'admin_demo_counts',
          title: 'Demo data seeded inventory',
          titleBn: 'ডেমো ডাটা সিডিং অবস্থা',
          status: allSeeded ? 'pass' : 'warn',
          detail:
              'Personas: ${demoDirSnap.size}/$expectedPersonas · Rooms: ${roomsSnap.size}/$expectedRooms · Messages: $totalSeededMsgs/$expectedMsgs',
          detailBn:
              'ডেমো প্রোফাইল: ${demoDirSnap.size}/$expectedPersonas · রুম: ${roomsSnap.size}/$expectedRooms · বার্তা: $totalSeededMsgs/$expectedMsgs',
          fixHint: allSeeded
              ? 'All expected demo personas, rooms, and messages exist in Firestore.'
              : 'Tap "Seed / Repair Demo Data" in Admin Review to populate missing records.',
          fixHintBn: allSeeded
              ? 'সকল ডেমো অ্যাকাউন্ট, কমিউনিটি রুম এবং বার্তা সঠিকভাবে সিড করা আছে।'
              : 'অ্যাডমিন প্যানেল থেকে "Seed / Repair Demo Data" বাটনে ক্লিক করে ডেমো ডাটা সিড করুন।',
        ));
      } catch (err) {
        final parsed =
            parseFirestoreListenerError(err, 'LIST', 'userDirectory');
        items.add(HealthCheckItem(
          id: 'admin_demo_counts',
          title: 'Demo data seeded inventory',
          titleBn: 'ডেমো ডাটা সিডিং অবস্থা',
          status: 'fail',
          detail: 'Error (${parsed.code}): ${parsed.message}',
          detailBn: 'ত্রুটি (${parsed.code}): ডেমো ডাটা যাচাই করা যায়নি',
          fixHint: 'Check admin privileges and firestore.rules.',
          fixHintBn: 'অ্যাডমিন অনুমতি ও firestore.rules যাচাই করুন।',
          errorCode: parsed.code,
        ));
      }

      // 9. Community Room Write -> Read Back -> Delete Test
      if (targetRoomIdForWriteTest == null) {
        items.add(const HealthCheckItem(
          id: 'admin_room_write_test',
          title: 'Community room write, read-back & delete test',
          titleBn: 'কমিউনিটি রুম লেখা, পড়া ও মোছার পরীক্ষা',
          status: 'warn',
          detail: 'Skipped because no community room exists yet.',
          detailBn: 'কোনো কমিউনিটি রুম না থাকায় পরীক্ষা চালানো যায়নি।',
          fixHint: 'Seed demo rooms first, then re-run this health check.',
          fixHintBn: 'প্রথমে ডেমো রুম সিড করুন এবং আবার পরীক্ষা চালান।',
        ));
      } else {
        final rand = _rng.nextInt(9000) + 1000;
        final testMsgId = 'hc_${DateTime.now().millisecondsSinceEpoch}_$rand';
        final testMsgRef = db
            .collection('rooms')
            .doc(targetRoomIdForWriteTest)
            .collection('messages')
            .doc(testMsgId);

        try {
          await testMsgRef.set({
            'roomId': targetRoomIdForWriteTest,
            'senderId': uid,
            'senderName':
                user.name.isNotEmpty ? user.name : 'Admin Health Check',
            'senderHandle': user.handle ?? '@admin',
            'senderAvatar': null,
            'senderRole': 'admin',
            'senderArea': user.area.isNotEmpty ? user.area : 'Dhaka',
            'senderVerified': true,
            'senderIsDemo': false,
            'text': 'Health check test message (auto-deleted)',
            'messageType': 'text',
            'mediaUrl': null,
            'replyToId': null,
            'replyToText': null,
            'replyToSenderName': null,
            'reactions': <String, dynamic>{},
            'reportedBy': <String>[],
            'deleted': false,
            'isDemo': false,
            'createdAt': FieldValue.serverTimestamp(),
          });
          final readBack = await testMsgRef.get();
          final readOk = readBack.exists;
          await testMsgRef.delete();

          items.add(HealthCheckItem(
            id: 'admin_room_write_test',
            title: 'Community room write, read-back & delete test',
            titleBn: 'কমিউনিটি রুম লেখা, পড়া ও মোছার পরীক্ষা',
            status: readOk ? 'pass' : 'fail',
            detail: readOk
                ? 'Created, read back, and cleaned up test message in $targetRoomIdForWriteTest'
                : 'Test message written to $targetRoomIdForWriteTest could not be read back',
            detailBn: readOk
                ? '$targetRoomIdForWriteTest রুমে টেস্ট বার্তা তৈরি, পড়া ও সফলভাবে মুছে ফেলা হয়েছে'
                : 'টেস্ট বার্তাটি পুনরায় পড়া যায়নি',
            fixHint: readOk
                ? 'Room write, read-back, and delete permissions are healthy.'
                : 'Verify firestore.rules on rooms/{roomId}/messages.',
            fixHintBn: readOk
                ? 'কমিউনিটি রুমে লেখা, পড়া ও মোছার অনুমতি সঠিকভাবে কাজ করছে।'
                : 'firestore.rules-এ rooms/{roomId}/messages নিয়ম যাচাই করুন।',
          ));
        } catch (err) {
          try {
            await testMsgRef.delete();
          } catch (_) {}
          final parsed = parseFirestoreListenerError(
            err,
            'WRITE',
            'rooms/$targetRoomIdForWriteTest/messages/$testMsgId',
          );
          items.add(HealthCheckItem(
            id: 'admin_room_write_test',
            title: 'Community room write, read-back & delete test',
            titleBn: 'কমিউনিটি রুম লেখা, পড়া ও মোছার পরীক্ষা',
            status: 'fail',
            detail: 'Failed (${parsed.code}): ${parsed.message}',
            detailBn: 'ব্যর্থ (${parsed.code}): রুমে বার্তা লেখা বা মোছা যায়নি',
            fixHint:
                'Publish the updated firestore.rules (admins can write/delete room messages).',
            fixHintBn:
                'আপডেট করা firestore.rules প্রকাশ করুন এবং নিশ্চিত করুন আপনি রুমে মিউট করা নন।',
            errorCode: parsed.code,
          ));
        }
      }

      // 10. Composite Indexes Probe
      final indexProbes = <({String name, Future<Object?> Function() run})>[
        (
          name: 'conversations(participants + lastMessageAt)',
          run: () => db
              .collection('conversations')
              .where('participants', arrayContains: uid)
              .orderBy('lastMessageAt', descending: true)
              .limit(1)
              .get(),
        ),
        (
          name: 'collectionGroup(messages)(participants + createdAt)',
          run: () => db
              .collectionGroup('messages')
              .where('participants', arrayContains: uid)
              .orderBy('createdAt', descending: true)
              .limit(1)
              .get(),
        ),
        (
          name: 'userDirectory(discoverable + lastSeen)',
          run: () => db
              .collection('userDirectory')
              .where('discoverable', isEqualTo: true)
              .orderBy('lastSeen', descending: true)
              .limit(1)
              .get(),
        ),
        (
          name: 'listings(status + createdAt)',
          run: () => db
              .collection('listings')
              .where('status', isEqualTo: 'active')
              .orderBy('createdAt', descending: true)
              .limit(1)
              .get(),
        ),
        (
          name: 'adminNotifications(read + createdAt)',
          run: () => db
              .collection('adminNotifications')
              .where('read', isEqualTo: false)
              .orderBy('createdAt', descending: true)
              .limit(1)
              .get(),
        ),
      ];

      final missingIndexNames = <String>[];
      String? firstIndexUrl;
      final otherErrors = <String>[];

      for (final probe in indexProbes) {
        try {
          await probe.run();
        } catch (err) {
          final parsed =
              parseFirestoreListenerError(err, 'LIST', probe.name);
          if (parsed.isIndexError) {
            missingIndexNames.add(probe.name);
            firstIndexUrl ??= parsed.indexUrl;
          } else if (!parsed.isPermissionError) {
            otherErrors.add('${probe.name}: ${parsed.code}');
          }
        }
      }

      if (missingIndexNames.isEmpty && otherErrors.isEmpty) {
        items.add(HealthCheckItem(
          id: 'admin_indexes',
          title: 'Firestore composite indexes',
          titleBn: 'Firestore কম্পোজিট ইনডেক্স',
          status: 'pass',
          detail:
              'All ${indexProbes.length}/${indexProbes.length} composite queries passed without missing-index errors',
          detailBn:
              '${indexProbes.length}/${indexProbes.length}টি কম্পোজিট কোয়েরি সফলভাবে সম্পন্ন হয়েছে',
          fixHint: 'All required composite indexes are deployed and enabled.',
          fixHintBn: 'প্রয়োজনীয় সকল কম্পোজিট ইনডেক্স সক্রিয় আছে।',
        ));
      } else {
        items.add(HealthCheckItem(
          id: 'admin_indexes',
          title: 'Firestore composite indexes',
          titleBn: 'Firestore কম্পোজিট ইনডেক্স',
          status: 'fail',
          detail:
              'Missing index for: ${missingIndexNames.join(', ')}${otherErrors.isNotEmpty ? ' · Errors: ${otherErrors.join('; ')}' : ''}',
          detailBn: 'অনুপস্থিত ইনডেক্স: ${missingIndexNames.join(', ')}',
          fixHint:
              'Deploy firestore.indexes.json via Firebase CLI (firebase deploy --only firestore:indexes) or open the Firebase Console link.',
          fixHintBn:
              'Firebase CLI দিয়ে firestore.indexes.json ডিপ্লয় করুন অথবা কনসোল লিঙ্ক থেকে ইনডেক্স তৈরি করুন।',
          errorCode: 'failed-precondition',
          indexUrl: firstIndexUrl,
        ));
      }
    }

    return _buildReport(mode, items);
  }

  HealthCheckReport _buildReport(String mode, List<HealthCheckItem> items) {
    return HealthCheckReport(
      ranAt: DateTime.now().toIso8601String(),
      mode: mode,
      passCount: items.where((i) => i.status == 'pass').length,
      warnCount: items.where((i) => i.status == 'warn').length,
      failCount: items.where((i) => i.status == 'fail').length,
      items: items,
    );
  }
}
