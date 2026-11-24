import 'dart:async';
import 'dart:math';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb_auth;
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import '../firebase_options.dart';
import '../models/models.dart';
import 'firestore_error_helper.dart';

class NotificationSeedResult {
  final int createdCount;
  final int alreadyHadCount;
  final bool markedFlag;
  final String? error;

  const NotificationSeedResult({
    required this.createdCount,
    required this.alreadyHadCount,
    required this.markedFlag,
    this.error,
  });
}

class NotificationService {
  NotificationService._();
  static final NotificationService instance = NotificationService._();

  final Map<String, Future<NotificationSeedResult>> _inFlightSeed = {};
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

  Future<NotificationSeedResult> seedStarterNotificationsOnce(
    fb_auth.User fbUser,
    AppUser appUser, {
    bool forceCheck = false,
  }) {
    if (!forceCheck) {
      final existing = _inFlightSeed[fbUser.uid];
      if (existing != null) return existing;
    }

    final future =
        _doSeedStarterNotificationsOnce(fbUser, appUser, forceCheck: forceCheck)
            .whenComplete(() {
      _inFlightSeed.remove(fbUser.uid);
    });
    if (!forceCheck) {
      _inFlightSeed[fbUser.uid] = future;
    }
    return future;
  }

  Future<NotificationSeedResult> _doSeedStarterNotificationsOnce(
    fb_auth.User fbUser,
    AppUser _, {
    bool forceCheck = false,
  }) async {
    final uid = _sanitizeId(fbUser.uid);
    final userRef = db.collection('users').doc(uid);
    final notifCol = userRef.collection('notifications');

    Map<String, dynamic>? userData;
    try {
      final userSnap = await getDocResilient(userRef, db: db);
      if (userSnap.exists) userData = userSnap.data();
    } catch (err) {
      debugPrint(
        '[NotificationService] Could not read user doc before seeding notifications: $err',
      );
    }

    Set<String> existingIds = {};
    var totalExisting = 0;
    try {
      final existingSnap = await getDocsResilient(notifCol.limit(40), db: db);
      totalExisting = existingSnap.size;
      existingIds = existingSnap.docs.map((d) => d.id).toSet();
    } catch (err) {
      debugPrint(
        '[NotificationService] Failed reading notifications subcollection: $err',
      );
      return NotificationSeedResult(
        createdCount: 0,
        alreadyHadCount: 0,
        markedFlag: false,
        error: err.toString(),
      );
    }

    if (!forceCheck &&
        userData?['notificationsSeeded'] == true &&
        totalExisting > 0) {
      return NotificationSeedResult(
        createdCount: 0,
        alreadyHadCount: totalExisting,
        markedFlag: true,
      );
    }

    const demoTeamConvId = 'demo_team';
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

    final missingStarters =
        starters.where((s) => !existingIds.contains(s['id'])).toList();
    var createdCount = 0;

    if (missingStarters.isNotEmpty &&
        (totalExisting == 0 ||
            userData?['notificationsSeeded'] != true ||
            forceCheck)) {
      final batch = db.batch();
      for (final item in missingStarters) {
        final notifRef = notifCol.doc(item['id']!);
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
        createdCount += 1;
      }

      try {
        await batch.commit();
      } catch (err) {
        debugPrint(
          '[NotificationService] Failed committing starter notifications: $err',
        );
        return NotificationSeedResult(
          createdCount: 0,
          alreadyHadCount: totalExisting,
          markedFlag: false,
          error: err.toString(),
        );
      }
    }

    var markedFlag = userData?['notificationsSeeded'] == true;
    if (!markedFlag && userData != null) {
      try {
        await userRef.update({
          'notificationsSeeded': true,
          'updatedAt': FieldValue.serverTimestamp(),
        });
        markedFlag = true;
      } catch (err) {
        debugPrint(
          '[NotificationService] Notifications seeded, but could not mark flag on user doc: $err',
        );
      }
    }

    return NotificationSeedResult(
      createdCount: createdCount,
      alreadyHadCount: totalExisting,
      markedFlag: markedFlag,
    );
  }

  NotificationItem _mapDoc(
    String id,
    Map<String, dynamic> data,
    String safeUid,
  ) {
    return NotificationItem(
      id: id,
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
  }

  Stream<List<NotificationItem>> watchUserNotifications(
    String uid, {
    void Function(FirestoreListenerError err)? onError,
  }) {
    final safeUid = _sanitizeId(uid);
    late StreamController<List<NotificationItem>> controller;
    StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? sub;
    var usingFallback = false;

    void attachFallback() {
      if (usingFallback || controller.isClosed) return;
      usingFallback = true;
      sub?.cancel();
      sub = db
          .collection('users')
          .doc(safeUid)
          .collection('notifications')
          .limit(60)
          .snapshots()
          .listen(
        (snap) {
          final items = snap.docs
              .map((d) => _mapDoc(d.id, d.data(), safeUid))
              .toList()
            ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
          if (!controller.isClosed) controller.add(items);
        },
        onError: (e, st) {
          final parsed = parseFirestoreListenerError(
            e,
            'LIST',
            'users/$safeUid/notifications',
          );
          onError?.call(parsed);
          if (!controller.isClosed) controller.addError(parsed, st);
        },
      );
    }

    controller = StreamController<List<NotificationItem>>(
      onListen: () {
        sub = db
            .collection('users')
            .doc(safeUid)
            .collection('notifications')
            .orderBy('createdAt', descending: true)
            .limit(60)
            .snapshots()
            .listen(
          (snap) {
            final items = snap.docs
                .map((d) => _mapDoc(d.id, d.data(), safeUid))
                .toList();
            if (!controller.isClosed) controller.add(items);
          },
          onError: (e, st) {
            final parsed = parseFirestoreListenerError(
              e,
              'LIST',
              'users/$safeUid/notifications',
            );
            if (parsed.isIndexError) {
              attachFallback();
              return;
            }
            onError?.call(parsed);
            if (!controller.isClosed) controller.addError(parsed, st);
          },
        );
      },
      onCancel: () async => await sub?.cancel(),
    );
    return controller.stream;
  }

  Future<void> markUserNotificationRead(
    String uid,
    String notificationId,
  ) async {
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

  Future<void> deleteUserNotification(
    String uid,
    String notificationId,
  ) async {
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
    final cleanTitle = _clampStr(title, 140);
    final cleanBody = _clampStr(body, 500);
    final cleanSenderName = _clampStr(senderName, 120);

    try {
      await db
          .collection('users')
          .doc(safeRecipient)
          .collection('notifications')
          .doc(notifId)
          .set({
        'recipientUid': safeRecipient,
        'senderUid': safeSender,
        'senderName': cleanSenderName.isNotEmpty ? cleanSenderName : 'Rizik User',
        'type': type,
        'title': cleanTitle.isNotEmpty ? cleanTitle : 'Rizik',
        'titleBn': titleBn != null ? _clampStr(titleBn, 180) : null,
        'body': cleanBody.isNotEmpty ? cleanBody : 'New update',
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
    } catch (err) {
      debugPrint(
        '[NotificationService] Could not deliver notification ($type) to $safeRecipient: $err',
      );
    }
  }
}
