import 'dart:async';
import 'dart:math';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb_auth;
import 'package:firebase_core/firebase_core.dart';
import '../firebase_options.dart';
import '../models/models.dart';

class NotificationService {
  NotificationService._();
  static final NotificationService instance = NotificationService._();

  final Map<String, Future<void>> _inFlightSeed = {};
  final Random _rng = Random();

  FirebaseFirestore get db => FirebaseFirestore.instanceFor(
        app: Firebase.app(),
        databaseId: DefaultFirebaseOptions.firestoreDatabaseId,
      );

  String _clampStr(String? val, int maxLen) {
    final trimmed = (val ?? '').trim();
    return trimmed.length <= maxLen ? trimmed : trimmed.substring(0, maxLen);
  }

  String _sanitizeId(String raw) {
    final cleaned = raw.replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '_');
    if (cleaned.isEmpty) {
      return 'notif_${DateTime.now().millisecondsSinceEpoch}';
    }
    return cleaned.length > 128 ? cleaned.substring(0, 128) : cleaned;
  }

  String _tsToIso(dynamic val) {
    if (val is Timestamp) return val.toDate().toIso8601String();
    if (val is String && val.isNotEmpty) return val;
    return DateTime.now().toIso8601String();
  }

  static const Set<String> _validLinkTabs = {
    'discover',
    'inbox',
    'claims',
    'events',
    'donate',
    'account',
    'post',
    'donor',
    'admin',
  };

  Future<void> seedStarterNotificationsOnce(
    fb_auth.User fbUser,
    AppUser appUser,
  ) {
    final existing = _inFlightSeed[fbUser.uid];
    if (existing != null) return existing;

    final future = _doSeedStarterNotificationsOnce(fbUser, appUser).whenComplete(() {
      _inFlightSeed.remove(fbUser.uid);
    });
    _inFlightSeed[fbUser.uid] = future;
    return future;
  }

  Future<void> _doSeedStarterNotificationsOnce(
    fb_auth.User fbUser,
    AppUser _,
  ) async {
    final uid = _sanitizeId(fbUser.uid);
    final userRef = db.collection('users').doc(uid);

    DocumentSnapshot<Map<String, dynamic>> userSnap;
    try {
      userSnap = await userRef.get();
    } catch (_) {
      return;
    }

    if (!userSnap.exists) return;
    if (userSnap.data()?['notificationsSeeded'] == true) return;

    final demoTeamConvId = _sanitizeId('demo_${uid}_team');
    final starters = <Map<String, String?>>[
      {
        'id': _sanitizeId('starter_welcome_$uid'),
        'type': 'welcome',
        'title': 'Welcome to Rizik!',
        'titleBn': 'Rizik-এ স্বাগতম!',
        'body':
            'Rescue surplus food nearby, connect directly with partner kitchens, and help reduce waste in Dhaka.',
        'bodyBn':
            'কাছের অতিরিক্ত খাবার উদ্ধার করুন, অংশীদার রান্নাঘরের সাথে সরাসরি যোগাযোগ করুন এবং ঢাকায় অপচয় কমাতে সহায়তা করুন।',
        'linkTab': 'discover',
        'conversationId': null,
      },
      {
        'id': _sanitizeId('starter_profile_$uid'),
        'type': 'complete_profile',
        'title': 'Complete your profile',
        'titleBn': 'আপনার প্রোফাইল সম্পূর্ণ করুন',
        'body':
            'Set your neighborhood area, pickup radius, and Find People discoverability in Account settings.',
        'bodyBn':
            'অ্যাকাউন্ট সেটিংসে আপনার এলাকা, পিকআপ দূরত্ব এবং "মানুষ খুঁজুন" দৃশ্যমানতা ঠিক করুন।',
        'linkTab': 'account',
        'conversationId': null,
      },
      {
        'id': _sanitizeId('starter_flash_$uid'),
        'type': 'flash_rescue',
        'title': 'Try Flash Rescue',
        'titleBn': 'ফ্ল্যাশ রেসকিউ চেষ্টা করুন',
        'body':
            'Urgent surplus food batches expiring soon appear at the top with live countdown timers.',
        'bodyBn':
            'জরুরি অতিরিক্ত খাবারের ব্যাচগুলো লাইভ কাউন্টডাউনসহ তালিকার শীর্ষে দেখানো হয়।',
        'linkTab': 'discover',
        'conversationId': null,
      },
      {
        'id': _sanitizeId('starter_events_$uid'),
        'type': 'events_upcoming',
        'title': 'Check upcoming events',
        'titleBn': 'আসন্ন কমিউনিটি ইভেন্ট দেখুন',
        'body':
            'Join neighborhood food distribution drives and volunteer shifts happening across Dhaka this week.',
        'bodyBn':
            'এই সপ্তাহে ঢাকা জুড়ে আসন্ন খাবার বিতরণ ও স্বেচ্ছাসেবক শিফটে যোগ দিন।',
        'linkTab': 'events',
        'conversationId': null,
      },
      {
        'id': _sanitizeId('starter_team_$uid'),
        'type': 'team_hello',
        'title': 'Say hello to the Rizik Team',
        'titleBn': 'Rizik টিমকে হ্যালো বলুন',
        'body':
            'Open your Messenger Inbox to chat with Rizik Team or explore sample partner shops.',
        'bodyBn':
            'Rizik টিমের সাথে চ্যাট করতে বা নমুনা অংশীদার দোকান দেখতে আপনার ইনবক্স খুলুন।',
        'linkTab': 'inbox',
        'conversationId': demoTeamConvId,
      },
    ];

    final batch = db.batch();
    for (final item in starters) {
      final notifRef = db
          .collection('users')
          .doc(uid)
          .collection('notifications')
          .doc(item['id']!);
      batch.set(notifRef, {
        'recipientUid': uid,
        'senderUid': uid,
        'senderName': 'Rizik Team',
        'type': item['type'],
        'title': _clampStr(item['title'], 140),
        'titleBn': _clampStr(item['titleBn'], 180),
        'body': _clampStr(item['body'], 500),
        'bodyBn': _clampStr(item['bodyBn'], 600),
        'read': false,
        'isStarter': true,
        'conversationId': item['conversationId'],
        'listingId': null,
        'claimId': null,
        'linkTab': item['linkTab'],
        'createdAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });
    }
    batch.update(userRef, {
      'notificationsSeeded': true,
      'updatedAt': FieldValue.serverTimestamp(),
    });

    try {
      await batch.commit();
    } catch (_) {
      // Non-fatal if concurrently seeded or offline
    }
  }

  Stream<List<NotificationItem>> watchUserNotifications(String uid) {
    final safeUid = _sanitizeId(uid);
    return db
        .collection('users')
        .doc(safeUid)
        .collection('notifications')
        .orderBy('createdAt', descending: true)
        .limit(60)
        .snapshots()
        .map((snap) {
      return snap.docs.map((d) {
        final data = d.data();
        return NotificationItem(
          id: d.id,
          userId: (data['recipientUid'] ?? safeUid).toString(),
          type: (data['type'] ?? 'system').toString(),
          title: (data['title'] ?? '').toString(),
          titleBn: data['titleBn']?.toString(),
          body: (data['body'] ?? '').toString(),
          bodyBn: data['bodyBn']?.toString(),
          read: data['read'] == true,
          isStarter: data['isStarter'] == true,
          conversationId: data['conversationId']?.toString(),
          listingId: data['listingId']?.toString(),
          claimId: data['claimId']?.toString(),
          linkTab: data['linkTab']?.toString(),
          senderUid: data['senderUid']?.toString(),
          senderName: data['senderName']?.toString(),
          createdAt: _tsToIso(data['createdAt']),
        );
      }).toList();
    });
  }

  Future<void> markUserNotificationRead(String uid, String notificationId) async {
    final safeUid = _sanitizeId(uid);
    final safeNotifId = _sanitizeId(notificationId);
    await db
        .collection('users')
        .doc(safeUid)
        .collection('notifications')
        .doc(safeNotifId)
        .update({
      'read': true,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> markAllUserNotificationsRead(String uid) async {
    final safeUid = _sanitizeId(uid);
    final snap = await db
        .collection('users')
        .doc(safeUid)
        .collection('notifications')
        .get();
    final batch = db.batch();
    var count = 0;
    for (final d in snap.docs) {
      if (d.data()['read'] == false) {
        batch.update(d.reference, {
          'read': true,
          'updatedAt': FieldValue.serverTimestamp(),
        });
        count += 1;
      }
    }
    if (count > 0) {
      await batch.commit();
    }
  }

  Future<void> deleteUserNotification(String uid, String notificationId) async {
    final safeUid = _sanitizeId(uid);
    final safeNotifId = _sanitizeId(notificationId);
    await db
        .collection('users')
        .doc(safeUid)
        .collection('notifications')
        .doc(safeNotifId)
        .delete();
  }

  Future<void> createCrossUserNotification({
    required String recipientUid,
    required String senderUid,
    required String senderName,
    required String type,
    required String title,
    String? titleBn,
    required String body,
    String? bodyBn,
    String? conversationId,
    String? listingId,
    String? claimId,
    String linkTab = 'inbox',
  }) async {
    if (recipientUid.isEmpty ||
        recipientUid == senderUid ||
        recipientUid.startsWith('demo_')) {
      return;
    }

    final safeRecipient = _sanitizeId(recipientUid);
    final safeSender = _sanitizeId(senderUid);
    final randSuffix = _rng.nextInt(90000) + 10000;
    final notifId = _sanitizeId(
      'n_${DateTime.now().millisecondsSinceEpoch}_$randSuffix',
    );
    final safeTab = _validLinkTabs.contains(linkTab) ? linkTab : 'inbox';

    try {
      await db
          .collection('users')
          .doc(safeRecipient)
          .collection('notifications')
          .doc(notifId)
          .set({
        'recipientUid': safeRecipient,
        'senderUid': safeSender,
        'senderName': _clampStr(senderName, 120).isNotEmpty
            ? _clampStr(senderName, 120)
            : 'Rizik User',
        'type': type,
        'title': _clampStr(title, 140),
        'titleBn': titleBn != null ? _clampStr(titleBn, 180) : null,
        'body': _clampStr(body, 500),
        'bodyBn': bodyBn != null ? _clampStr(bodyBn, 600) : null,
        'read': false,
        'isStarter': false,
        'conversationId':
            conversationId != null ? _sanitizeId(conversationId) : null,
        'listingId': listingId != null ? _sanitizeId(listingId) : null,
        'claimId': claimId != null ? _sanitizeId(claimId) : null,
        'linkTab': safeTab,
        'createdAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });
    } catch (_) {
      // Non-fatal if recipient is a seeded non-Firestore user or blocked
    }
  }
}
