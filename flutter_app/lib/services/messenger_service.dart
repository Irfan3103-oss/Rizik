import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb_auth;
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../firebase_options.dart';
import '../models/models.dart';
import 'notification_service.dart';

class _DemoShopSpec {
  final String key;
  final String shopUid;
  final String name;
  final String nameBn;
  final String handle;
  final String area;
  final String avatar;
  final String hours;
  final bool isOfficial;
  final List<({bool fromShop, String text})> sampleMessages;
  final String autoReply;

  const _DemoShopSpec({
    required this.key,
    required this.shopUid,
    required this.name,
    required this.nameBn,
    required this.handle,
    required this.area,
    required this.avatar,
    required this.hours,
    required this.isOfficial,
    required this.sampleMessages,
    required this.autoReply,
  });
}

class QueuedMessengerMessage {
  final String tempId;
  final String conversationId;
  final String senderId;
  final String senderName;
  final String text;
  final MessageType messageType;
  final String? mediaUrl;
  final String? fileName;
  final int? fileSize;
  final String? fileMime;
  final int? durationSec;
  final double? locationLat;
  final double? locationLng;
  final String? locationLabel;
  final String? locationExpiresAt;
  final String? replyToId;
  final String? replyToText;
  final String? forwardedFrom;

  const QueuedMessengerMessage({
    required this.tempId,
    required this.conversationId,
    required this.senderId,
    required this.senderName,
    required this.text,
    this.messageType = MessageType.text,
    this.mediaUrl,
    this.fileName,
    this.fileSize,
    this.fileMime,
    this.durationSec,
    this.locationLat,
    this.locationLng,
    this.locationLabel,
    this.locationExpiresAt,
    this.replyToId,
    this.replyToText,
    this.forwardedFrom,
  });

  Map<String, dynamic> toJson() => {
        'tempId': tempId,
        'conversationId': conversationId,
        'senderId': senderId,
        'senderName': senderName,
        'text': text,
        'messageType': MessengerService.instance.mapMessageTypeToFirestore(messageType),
        'mediaUrl': mediaUrl,
        'fileName': fileName,
        'fileSize': fileSize,
        'fileMime': fileMime,
        'durationSec': durationSec,
        'locationLat': locationLat,
        'locationLng': locationLng,
        'locationLabel': locationLabel,
        'locationExpiresAt': locationExpiresAt,
        'replyToId': replyToId,
        'replyToText': replyToText,
        'forwardedFrom': forwardedFrom,
      };

  factory QueuedMessengerMessage.fromJson(Map<String, dynamic> j) =>
      QueuedMessengerMessage(
        tempId: (j['tempId'] ?? '').toString(),
        conversationId: (j['conversationId'] ?? '').toString(),
        senderId: (j['senderId'] ?? '').toString(),
        senderName: (j['senderName'] ?? '').toString(),
        text: (j['text'] ?? '').toString(),
        messageType: parseMessageType(j['messageType']?.toString()),
        mediaUrl: j['mediaUrl']?.toString(),
        fileName: j['fileName']?.toString(),
        fileSize: (j['fileSize'] as num?)?.toInt(),
        fileMime: j['fileMime']?.toString(),
        durationSec: (j['durationSec'] as num?)?.toInt(),
        locationLat: (j['locationLat'] as num?)?.toDouble(),
        locationLng: (j['locationLng'] as num?)?.toDouble(),
        locationLabel: j['locationLabel']?.toString(),
        locationExpiresAt: j['locationExpiresAt']?.toString(),
        replyToId: j['replyToId']?.toString(),
        replyToText: j['replyToText']?.toString(),
        forwardedFrom: j['forwardedFrom']?.toString(),
      );
}

class DirectoryPageResult {
  final List<UserDirectoryEntry> entries;
  final bool hasMore;
  const DirectoryPageResult(this.entries, this.hasMore);
}

class MessengerMessagesPage {
  final List<ChatMessage> messages;
  final bool hasMore;
  const MessengerMessagesPage(this.messages, this.hasMore);
}

class MessengerService {
  MessengerService._();
  static final MessengerService instance = MessengerService._();

  final Map<String, Future<void>> _inFlightDirSync = {};
  final Map<String, Future<void>> _inFlightStarterSeed = {};
  final Random _rng = Random();

  static const String _offlineQueueKey = 'ahar_fb_chat_offline_queue_v1';

  FirebaseFirestore get db => FirebaseFirestore.instanceFor(
        app: Firebase.app(),
        databaseId: DefaultFirebaseOptions.firestoreDatabaseId,
      );

  static const List<_DemoShopSpec> _demoShops = [
    _DemoShopSpec(
      key: 'team',
      shopUid: 'demo_team',
      name: 'Rizik Team',
      nameBn: 'Rizik Team',
      handle: '@rizik_team',
      area: 'Dhaka',
      avatar: '',
      hours: '24/7 Support',
      isOfficial: true,
      sampleMessages: [
        (
          fromShop: true,
          text:
              'Welcome to Rizik Messenger! You can message nearby partner restaurants, claim Flash Rescue batches before closing, or donate surplus meals anytime.',
        ),
        (
          fromShop: true,
          text:
              'Quick guide: Tap "New chat" to discover verified kitchens & community members, or tap "Message" on any food listing to coordinate pickup.',
        ),
      ],
      autoReply:
          'Auto-reply (demo): Thanks for reaching out to the Rizik Team! Explore active food batches on Home or invite friends from "Find people".',
    ),
    _DemoShopSpec(
      key: 'biryani',
      shopUid: 'demo_biryani',
      name: 'Nawab Biryani House',
      nameBn: 'নবাব বিরিয়ানি হাউস',
      handle: '@nawab_biryani_demo',
      area: 'Old Dhaka',
      avatar: '/images/kacchi-biryani.jpg',
      hours: '11:00 AM - 11:00 PM',
      isOfficial: false,
      sampleMessages: [
        (
          fromShop: true,
          text:
              'Assalamu Alaikum! We pack fresh leftover chicken & kacchi biryani boxes around 9:45 PM every evening.',
        ),
        (
          fromShop: false,
          text: 'Hi! Around what time can volunteers or neighbors pick up today?',
        ),
        (
          fromShop: true,
          text:
              'Usually between 9:50 PM and 10:45 PM at the Chawkbazar side counter. Please bring your QR pickup code!',
        ),
      ],
      autoReply:
          'Auto-reply (demo): Thanks for checking Nawab Biryani House! Evening biryani surplus boxes are usually packed at 9:45 PM.',
    ),
    _DemoShopSpec(
      key: 'mishti',
      shopUid: 'demo_mishti',
      name: 'Roshmalai Mishti Mahal',
      nameBn: 'রসমালাই মিষ্টি মহল',
      handle: '@roshmalai_demo',
      area: 'Dhanmondi',
      avatar: '/images/wedding-celebration-bd.jpg',
      hours: '8:30 AM - 10:30 PM',
      isOfficial: false,
      sampleMessages: [
        (
          fromShop: true,
          text:
              'Hello! Today we have fresh sealed misti & nimki boxes available for community shelters before 9:30 PM.',
        ),
        (
          fromShop: false,
          text: 'Great! Are the containers sealed for transport?',
        ),
        (
          fromShop: true,
          text:
              'Yes, packed in clean food-grade boxes ready for quick collection.',
        ),
      ],
      autoReply:
          'Auto-reply (demo): Roshmalai Mishti Mahal received your demo message! Freshly sealed sweet boxes are shared before closing.',
    ),
    _DemoShopSpec(
      key: 'bakery',
      shopUid: 'demo_bakery',
      name: 'BanglaOven Artisan Bakery',
      nameBn: 'বাংলাওভেন আর্টিজান বেকারি',
      handle: '@banglaoven_demo',
      area: 'Banani',
      avatar: '/images/dhaka-bakery-bread.jpg',
      hours: '7:30 AM - 10:00 PM',
      isOfficial: false,
      sampleMessages: [
        (
          fromShop: true,
          text:
              'Hi neighbor! Whole-wheat buns, sandwich loaves, and croissants are shared every night at 9:15 PM.',
        ),
        (
          fromShop: true,
          text:
              'Tap Reply anytime to test demo instant messages and attachments.',
        ),
      ],
      autoReply:
          'Auto-reply (demo): BanglaOven Bakery got your message! Daily bakery surplus packs go live around 9:15 PM.',
    ),
  ];

  String _clampStr(String? val, int maxLen) {
    final trimmed = (val ?? '').trim();
    return trimmed.length <= maxLen ? trimmed : trimmed.substring(0, maxLen);
  }

  String _sanitizeId(String raw) {
    final cleaned = raw.replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '_');
    if (cleaned.isEmpty) {
      return 'id_${DateTime.now().millisecondsSinceEpoch}';
    }
    return cleaned.length > 128 ? cleaned.substring(0, 128) : cleaned;
  }

  String _tsToIso(dynamic val) {
    if (val is Timestamp) return val.toDate().toIso8601String();
    if (val is String && val.isNotEmpty) return val;
    return DateTime.now().toIso8601String();
  }

  String generatePublicHandle(String displayName, String uid) {
    final rawSlug = displayName
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9]+'), '_')
        .replaceAll(RegExp(r'^_+|_+$'), '');
    final baseSlug = rawSlug.length > 16 ? rawSlug.substring(0, 16) : rawSlug;
    final cleanBase = baseSlug.length >= 2 ? baseSlug : 'member';
    final cleanUid = uid.replaceAll(RegExp(r'[^a-zA-Z0-9]'), '');
    final suffix = (cleanUid.length >= 4
            ? cleanUid.substring(cleanUid.length - 4)
            : cleanUid.padRight(4, '0'))
        .toLowerCase();
    final handle = '@${cleanBase}_$suffix';
    return handle.length > 40 ? handle.substring(0, 40) : handle;
  }

  String getDirectConversationId(String uid1, String uid2) {
    final sorted = [_sanitizeId(uid1), _sanitizeId(uid2)]..sort();
    return _sanitizeId('direct_${sorted[0]}_${sorted[1]}');
  }

  String mapMessageTypeToFirestore(MessageType? mt) {
    switch (mt) {
      case MessageType.voice:
        return 'audio';
      case MessageType.call:
        return 'call_log';
      case MessageType.image:
        return 'image';
      case MessageType.file:
        return 'file';
      case MessageType.location:
        return 'location';
      case MessageType.text:
      case null:
        return 'text';
    }
  }

  MessageType mapMessageTypeFromFirestore(dynamic raw) {
    return parseMessageType(raw?.toString());
  }

  // --- Zero-PII Public User Directory Sync ---

  Future<void> syncUserDirectoryProfile(
    fb_auth.User fbUser,
    AppUser appUser, {
    bool online = true,
  }) {
    final existing = _inFlightDirSync[fbUser.uid];
    if (existing != null) return existing;

    final future =
        _doSyncUserDirectoryProfile(fbUser, appUser, online).whenComplete(() {
      _inFlightDirSync.remove(fbUser.uid);
    });
    _inFlightDirSync[fbUser.uid] = future;
    return future;
  }

  Future<void> _doSyncUserDirectoryProfile(
    fb_auth.User fbUser,
    AppUser appUser,
    bool online,
  ) async {
    final uid = _sanitizeId(fbUser.uid);
    final dirRef = db.collection('userDirectory').doc(uid);
    final userRef = db.collection('users').doc(uid);

    DocumentSnapshot<Map<String, dynamic>> dirSnap;
    try {
      dirSnap = await dirRef.get();
    } catch (_) {
      return;
    }

    Map<String, dynamic>? existingUserData;
    try {
      final userSnap = await userRef.get();
      existingUserData = userSnap.data();
    } catch (_) {
      existingUserData = null;
    }

    final displayName = _clampStr(
      appUser.name.isNotEmpty ? appUser.name : fbUser.displayName,
      100,
    );
    final safeDisplayName =
        displayName.isNotEmpty ? displayName : 'Community Member';

    final handleCandidate = _clampStr(
      existingUserData?['handle']?.toString() ??
          dirSnap.data()?['handle']?.toString() ??
          appUser.handle,
      40,
    );
    final handle = handleCandidate.isNotEmpty
        ? handleCandidate
        : generatePublicHandle(safeDisplayName, uid);

    final dirRole = appUser.isAdmin
        ? 'admin'
        : appUser.accountType == AccountType.restaurantOwner
            ? 'restaurantOwner'
            : appUser.role == UserRole.donor
                ? 'donor'
                : 'user';

    final photoCandidate = appUser.restaurant?.restaurantPhotoUrl ??
        appUser.photoURL ??
        fbUser.photoURL;
    final safePhoto =
        (photoCandidate != null && photoCandidate.length <= 248000)
            ? photoCandidate
            : null;

    final restaurantNameRaw = appUser.accountType == AccountType.restaurantOwner
        ? _clampStr(
            appUser.restaurant?.restaurantName ??
                appUser.donorProfile?.businessName,
            120,
          )
        : '';
    final restaurantName =
        restaurantNameRaw.isNotEmpty ? restaurantNameRaw : null;

    final restaurantType = appUser.accountType == AccountType.restaurantOwner
        ? (_clampStr(appUser.restaurant?.restaurantType, 40).isNotEmpty
            ? _clampStr(appUser.restaurant?.restaurantType, 40)
            : 'restaurant')
        : null;

    final discoverable = existingUserData?['discoverable'] is bool
        ? existingUserData!['discoverable'] == true
        : appUser.discoverable;

    final verified =
        existingUserData?['verified'] == true || appUser.verified;

    final payload = <String, dynamic>{
      'uid': uid,
      'displayName': safeDisplayName,
      'handle': handle,
      'photoURL': safePhoto,
      'role': dirRole,
      'restaurantName': restaurantName,
      'restaurantType': restaurantType,
      'area': _clampStr(appUser.area, 80).isNotEmpty
          ? _clampStr(appUser.area, 80)
          : 'Dhanmondi',
      'verified': verified,
      'discoverable': discoverable,
      'online': online,
      'lastSeen': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    };

    if (!dirSnap.exists) {
      payload['createdAt'] = FieldValue.serverTimestamp();
      await dirRef.set(payload);
    } else {
      if (!appUser.isAdmin && dirSnap.data()?['role'] != null) {
        payload['role'] = dirSnap.data()!['role'];
      }
      await dirRef.update(payload);
    }

    if (existingUserData != null && existingUserData['handle'] == null) {
      try {
        await userRef.update({
          'handle': handle,
          'discoverable': discoverable,
          'updatedAt': FieldValue.serverTimestamp(),
        });
      } catch (_) {}
    }
  }

  Future<void> updateMyDiscoverableSetting(String uid, bool discoverable) async {
    final safeUid = _sanitizeId(uid);
    await db.collection('users').doc(safeUid).update({
      'discoverable': discoverable,
      'updatedAt': FieldValue.serverTimestamp(),
    });
    await db.collection('userDirectory').doc(safeUid).update({
      'discoverable': discoverable,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Stream<DirectoryPageResult> watchDiscoverableDirectory(
    String myUid, {
    int pageLimit = 25,
  }) {
    final safeMyUid = _sanitizeId(myUid);
    final effLimit = pageLimit < 20 ? 20 : pageLimit;
    return db
        .collection('userDirectory')
        .where('discoverable', isEqualTo: true)
        .limit(effLimit)
        .snapshots()
        .map((snap) {
      final list = <UserDirectoryEntry>[];
      final nowMs = DateTime.now().millisecondsSinceEpoch;
      for (final d in snap.docs) {
        final data = d.data();
        final uid = (data['uid'] ?? d.id).toString();
        if (uid == safeMyUid) continue;
        final rawRole = (data['role'] ?? 'user').toString();
        const validRoles = {
          'admin',
          'restaurantOwner',
          'donor',
          'recipient',
          'user',
        };
        final role = validRoles.contains(rawRole) ? rawRole : 'user';
        final lastSeenIso = _tsToIso(data['lastSeen']);
        final lastSeenDt = DateTime.tryParse(lastSeenIso);
        final recentlyActive = lastSeenDt != null &&
            (nowMs - lastSeenDt.millisecondsSinceEpoch) < 120000;
        list.add(UserDirectoryEntry(
          uid: uid,
          displayName: (data['displayName'] ?? 'Community Member').toString(),
          handle: (data['handle'] ?? generatePublicHandle('member', uid))
              .toString(),
          photoURL: data['photoURL']?.toString(),
          role: role,
          restaurantName: data['restaurantName']?.toString(),
          restaurantType: data['restaurantType']?.toString(),
          area: (data['area'] ?? 'Dhaka').toString(),
          verified: data['verified'] == true,
          discoverable: data['discoverable'] == true,
          online: data['online'] == true && recentlyActive,
          lastSeen: lastSeenIso,
        ));
      }
      list.sort((a, b) {
        if (a.online != b.online) return a.online ? -1 : 1;
        return b.lastSeen.compareTo(a.lastSeen);
      });
      return DirectoryPageResult(list, snap.docs.length >= effLimit);
    });
  }

  // --- Block & Report Users ---

  Stream<List<BlockedUserEntry>> watchMyBlockedUsers(String myUid) {
    final safeUid = _sanitizeId(myUid);
    return db
        .collection('users')
        .doc(safeUid)
        .collection('blocked')
        .snapshots()
        .map((snap) {
      return snap.docs.map((d) {
        final data = d.data();
        return BlockedUserEntry(
          uid: (data['blockedUid'] ?? d.id).toString(),
          name: (data['blockedName'] ?? 'User').toString(),
          handle: data['blockedHandle']?.toString(),
        );
      }).toList();
    });
  }

  Future<void> blockUserInFirestore({
    required String myUid,
    required String targetUid,
    required String targetName,
    String? targetHandle,
  }) async {
    final safeMyUid = _sanitizeId(myUid);
    final safeTargetUid = _sanitizeId(targetUid);
    if (safeMyUid == safeTargetUid) return;
    await db
        .collection('users')
        .doc(safeMyUid)
        .collection('blocked')
        .doc(safeTargetUid)
        .set({
      'blockerUid': safeMyUid,
      'blockedUid': safeTargetUid,
      'blockedName': _clampStr(targetName, 100).isNotEmpty
          ? _clampStr(targetName, 100)
          : 'Community Member',
      'blockedHandle':
          targetHandle != null ? _clampStr(targetHandle, 40) : null,
      'createdAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> unblockUserInFirestore(String myUid, String targetUid) async {
    final safeMyUid = _sanitizeId(myUid);
    final safeTargetUid = _sanitizeId(targetUid);
    await db
        .collection('users')
        .doc(safeMyUid)
        .collection('blocked')
        .doc(safeTargetUid)
        .delete();
  }

  Future<void> reportUserInFirestore({
    required String reporterId,
    required String targetUserId,
    required String targetName,
    required String reason,
    String? details,
    String? conversationId,
  }) async {
    final safeReporter = _sanitizeId(reporterId);
    final safeTarget = _sanitizeId(targetUserId);
    if (safeReporter == safeTarget) return;
    final rand = _rng.nextInt(90000) + 10000;
    final reportId = _sanitizeId(
      'rep_${DateTime.now().millisecondsSinceEpoch}_$rand',
    );
    await db.collection('reports').doc(reportId).set({
      'reporterId': safeReporter,
      'targetUserId': safeTarget,
      'targetName': _clampStr(targetName, 120).isNotEmpty
          ? _clampStr(targetName, 120)
          : 'Community Member',
      'conversationId':
          conversationId != null ? _sanitizeId(conversationId) : null,
      'reason': _clampStr(reason, 120).isNotEmpty
          ? _clampStr(reason, 120)
          : 'Inappropriate behavior',
      'details': (details != null && _clampStr(details, 1000).isNotEmpty)
          ? _clampStr(details, 1000)
          : null,
      'status': 'open',
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  // --- Starter / Demo Conversations (Seeded Once Per User) ---

  Future<void> seedStarterDemoConversationsOnce(
    fb_auth.User fbUser,
    AppUser appUser,
  ) {
    final existing = _inFlightStarterSeed[fbUser.uid];
    if (existing != null) return existing;

    final future =
        _doSeedStarterDemoConversationsOnce(fbUser, appUser).whenComplete(() {
      _inFlightStarterSeed.remove(fbUser.uid);
    });
    _inFlightStarterSeed[fbUser.uid] = future;
    return future;
  }

  Future<void> _doSeedStarterDemoConversationsOnce(
    fb_auth.User fbUser,
    AppUser appUser,
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
    if (userSnap.data()?['starterSeeded'] == true) return;

    final myNameRaw = _clampStr(
      appUser.name.isNotEmpty ? appUser.name : fbUser.displayName,
      100,
    );
    final myName = myNameRaw.isNotEmpty ? myNameRaw : 'Community Member';
    final handleRaw = _clampStr(
      userSnap.data()?['handle']?.toString() ?? appUser.handle,
      40,
    );
    final myHandle =
        handleRaw.isNotEmpty ? handleRaw : generatePublicHandle(myName, uid);

    for (final shop in _demoShops) {
      final convId = _sanitizeId('demo_${uid}_${shop.key}');
      final lastSample = shop.sampleMessages.last;

      try {
        await db.collection('conversations').doc(convId).set({
          'conversationKind': 'demo',
          'participants': [uid],
          'uidA': uid,
          'uidB': shop.shopUid,
          'donorId': shop.shopUid,
          'recipientId': uid,
          'listingId': 'demo_listing_${shop.key}',
          'donorName': shop.name,
          'recipientName': myName,
          'listingTitle': shop.isOfficial
              ? 'Official Welcome & Guide'
              : '${shop.area} · Sample Partner',
          'isDemo': true,
          'demoShopKey': shop.key,
          'demoOwnerUid': uid,
          'participantProfiles': {
            uid: {
              'displayName': myName,
              'handle': myHandle,
              'role': appUser.isAdmin ? 'admin' : appUser.accountType.name,
              'area': appUser.area.isNotEmpty ? appUser.area : 'Dhaka',
              'verified': appUser.verified,
            },
            shop.shopUid: {
              'displayName': shop.name,
              'handle': shop.handle,
              'photoURL': shop.avatar.isNotEmpty ? shop.avatar : null,
              'role': shop.isOfficial ? 'admin' : 'restaurantOwner',
              'restaurantName': shop.name,
              'area': shop.area,
              'verified': true,
              'isOfficial': shop.isOfficial,
            },
          },
          'lastMessage': _clampStr(lastSample.text, 500),
          'lastMessageType': 'text',
          'lastMessageSenderId': lastSample.fromShop ? shop.shopUid : uid,
          'lastMessageAt': FieldValue.serverTimestamp(),
          'unreadCount': {uid: 1},
          'mutedBy': <String, dynamic>{},
          'archivedBy': <String, dynamic>{},
          'deletedFor': <String, dynamic>{},
          'typingBy': <String, dynamic>{},
          'createdAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
        });

        final batch = db.batch();
        for (var i = 0; i < shop.sampleMessages.length; i++) {
          final sample = shop.sampleMessages[i];
          final msgId = _sanitizeId(
            'demo_msg_${shop.key}_${i}_${DateTime.now().millisecondsSinceEpoch}',
          );
          final msgRef = db
              .collection('conversations')
              .doc(convId)
              .collection('messages')
              .doc(msgId);
          batch.set(msgRef, {
            'conversationId': convId,
            'participants': [uid],
            'donorId': shop.shopUid,
            'recipientId': uid,
            'senderId': sample.fromShop ? shop.shopUid : uid,
            'senderName': sample.fromShop ? shop.name : myName,
            'text': _clampStr(sample.text, 2000),
            'messageType': 'text',
            'deliveredTo': [uid],
            'readBy': sample.fromShop ? <String>[] : <String>[uid],
            'deletedFor': <String>[],
            'status': sample.fromShop ? 'delivered' : 'read',
            'isDemoAutoReply': sample.fromShop,
            'createdAt': FieldValue.serverTimestamp(),
          });
        }
        await batch.commit();
      } catch (_) {}
    }

    try {
      await userRef.update({
        'starterSeeded': true,
        'updatedAt': FieldValue.serverTimestamp(),
      });
    } catch (_) {}
  }

  // --- Real-Time 1-to-1 Messenger Conversations ---

  Conversation? _mapFirestoreConversation(
    String id,
    Map<String, dynamic> data,
    String myUid,
    Set<String> blockedSet,
    Map<String, UserDirectoryEntry> directoryMap,
  ) {
    final deletedForMap =
        (data['deletedFor'] as Map?)?.cast<String, dynamic>() ?? {};
    if (deletedForMap[myUid] == true) return null;

    final isDemo = data['isDemo'] == true;
    final demoShopKeyRaw = data['demoShopKey']?.toString();
    final _DemoShopSpec? demoSpec = demoShopKeyRaw != null
        ? _demoShops.cast<_DemoShopSpec?>().firstWhere(
              (s) => s?.key == demoShopKeyRaw,
              orElse: () => null,
            )
        : null;

    final uidA = (data['uidA'] ?? data['donorId'] ?? myUid).toString();
    final uidB = (data['uidB'] ?? data['recipientId'] ?? myUid).toString();
    final peerUid = isDemo ? uidB : (uidA == myUid ? uidB : uidA);

    final profiles =
        (data['participantProfiles'] as Map?)?.cast<String, dynamic>() ?? {};
    final peerMeta =
        (profiles[peerUid] as Map?)?.cast<String, dynamic>() ?? {};
    final liveDir = directoryMap[peerUid];

    final peerName = demoSpec?.name ??
        liveDir?.restaurantName ??
        liveDir?.displayName ??
        ((peerMeta['restaurantName'] is String &&
                (peerMeta['restaurantName'] as String).isNotEmpty)
            ? peerMeta['restaurantName'] as String
            : null) ??
        ((peerMeta['displayName'] is String &&
                (peerMeta['displayName'] as String).isNotEmpty)
            ? peerMeta['displayName'] as String
            : null) ??
        (data['donorId']?.toString() == peerUid
            ? (data['donorName'] ?? 'Community Member').toString()
            : (data['recipientName'] ?? 'Community Member').toString());

    final peerAvatar = (demoSpec?.avatar.isNotEmpty == true)
        ? demoSpec!.avatar
        : liveDir?.photoURL ?? peerMeta['photoURL']?.toString();

    final peerRole = demoSpec != null
        ? (demoSpec.isOfficial ? 'admin' : 'donor')
        : (liveDir?.role ?? peerMeta['role']?.toString() ?? 'user');

    final peerVerified = demoSpec != null
        ? true
        : (liveDir?.verified ?? (peerMeta['verified'] == true));

    final peerArea =
        demoSpec?.area ?? liveDir?.area ?? peerMeta['area']?.toString() ?? 'Dhaka';

    final peerHandle = demoSpec?.handle ??
        liveDir?.handle ??
        peerMeta['handle']?.toString() ??
        generatePublicHandle(peerName, peerUid);

    final unreadMap =
        (data['unreadCount'] as Map?)?.cast<String, dynamic>() ?? {};
    final mutedMap = (data['mutedBy'] as Map?)?.cast<String, dynamic>() ?? {};
    final archivedMap =
        (data['archivedBy'] as Map?)?.cast<String, dynamic>() ?? {};
    final typingMap = (data['typingBy'] as Map?)?.cast<String, dynamic>() ?? {};

    final blockedByMe = !isDemo && blockedSet.contains(peerUid);
    final lastMsgAt = _tsToIso(data['lastMessageAt'] ?? data['updatedAt']);
    final listingId = (data['listingId'] ?? '').toString();

    return Conversation(
      id: id,
      listingId: listingId,
      claimId: '',
      donorId: (data['donorId'] ??
              ((peerRole == 'restaurantOwner' || peerRole == 'donor')
                  ? peerUid
                  : uidA))
          .toString(),
      recipientId: (data['recipientId'] ??
              ((peerRole == 'restaurantOwner' || peerRole == 'donor')
                  ? myUid
                  : uidB))
          .toString(),
      uidA: uidA,
      uidB: uidB,
      participants: (data['participants'] as List?)
              ?.map((e) => e.toString())
              .toList() ??
          [uidA, uidB],
      conversationKind: isDemo
          ? 'demo'
          : (data['conversationKind'] == 'pickup' ? 'pickup' : 'direct'),
      donorName: data['donorId']?.toString() == peerUid
          ? peerName
          : (data['donorName'] ?? peerName).toString(),
      donorLogoUrl: peerAvatar,
      donorVerified: peerVerified,
      donorArea: peerArea,
      donorHours: demoSpec?.hours,
      peerOnline: isDemo ? true : (liveDir?.online ?? false),
      peerLastSeen: isDemo ? null : liveDir?.lastSeen,
      peerTyping: !isDemo && typingMap[peerUid] == true,
      peerUid: peerUid,
      peerHandle: peerHandle,
      peerRole: peerRole,
      peerVerified: peerVerified,
      peerArea: peerArea,
      peerRestaurantName: liveDir?.restaurantName ?? demoSpec?.name,
      recipientName: data['recipientId']?.toString() == peerUid
          ? peerName
          : (data['recipientName'] ?? 'Neighbor').toString(),
      recipientLogoUrl: peerAvatar,
      listingTitle: (data['listingTitle']?.toString().isNotEmpty == true)
          ? data['listingTitle'].toString()
          : (demoSpec != null
              ? '${demoSpec.area} · ${demoSpec.isOfficial ? 'Official' : 'Demo Partner'}'
              : peerHandle),
      listingPhoto: (peerAvatar != null && peerAvatar.isNotEmpty)
          ? peerAvatar
          : '/images/kacchi-biryani.jpg',
      pickupStart: lastMsgAt,
      pickupEnd: lastMsgAt,
      claimStatus: ClaimStatus.requested,
      isDirect:
          listingId.isEmpty || listingId.startsWith('direct_') || isDemo,
      isStarter: isDemo,
      isDemo: isDemo,
      demoShopKey: demoShopKeyRaw,
      isOfficial: demoSpec?.isOfficial == true || peerMeta['isOfficial'] == true,
      isMuted: mutedMap[myUid] == true,
      isArchived: archivedMap[myUid] == true,
      isFirestoreBacked: true,
      lastMessage: data['lastMessage']?.toString() ?? '',
      lastMessageType: mapMessageTypeFromFirestore(data['lastMessageType']),
      lastMessageSenderId: data['lastMessageSenderId']?.toString(),
      lastMessageAt: lastMsgAt,
      unreadCount: (unreadMap[myUid] as num?)?.toInt() ?? 0,
      isBlocked: blockedByMe,
      blockedByMe: blockedByMe,
      createdAt: _tsToIso(data['createdAt']),
      updatedAt: _tsToIso(data['updatedAt']),
    );
  }

  Stream<List<Conversation>> watchMyConversations(
    String myUid, {
    required Set<String> Function() getBlockedSet,
    required Map<String, UserDirectoryEntry> Function() getDirectoryMap,
  }) {
    final safeUid = _sanitizeId(myUid);
    return db
        .collection('conversations')
        .where('participants', arrayContains: safeUid)
        .snapshots()
        .map((snap) {
      final blockedSet = getBlockedSet();
      final directoryMap = getDirectoryMap();
      final mapped = <Conversation>[];
      for (final d in snap.docs) {
        final conv = _mapFirestoreConversation(
          d.id,
          d.data(),
          safeUid,
          blockedSet,
          directoryMap,
        );
        if (conv != null) mapped.add(conv);
      }
      mapped.sort((a, b) =>
          (b.lastMessageAt ?? b.updatedAt)
              .compareTo(a.lastMessageAt ?? a.updatedAt));
      return mapped;
    });
  }

  Future<String> getOrCreateDirectConversation(
    AppUser me,
    UserDirectoryEntry target, {
    Listing? initialListing,
  }) async {
    final myUid = _sanitizeId(me.id);
    final targetUid = _sanitizeId(target.uid);
    if (myUid == targetUid) {
      throw Exception('Cannot start a chat with yourself');
    }

    final myBlockSnap = await db
        .collection('users')
        .doc(myUid)
        .collection('blocked')
        .doc(targetUid)
        .get();
    if (myBlockSnap.exists) {
      throw Exception(
        'You blocked this user. Unblock them in Account Settings to send messages.',
      );
    }

    final convId = getDirectConversationId(myUid, targetUid);
    final sorted = [myUid, targetUid]..sort();
    final uidA = sorted[0];
    final uidB = sorted[1];
    final convRef = db.collection('conversations').doc(convId);
    final existingSnap = await convRef.get();

    final myDisplayName = me.accountType == AccountType.restaurantOwner
        ? (me.restaurant?.restaurantName ??
            me.donorProfile?.businessName ??
            me.name)
        : me.name;
    final myHandle = me.handle ?? generatePublicHandle(me.name, myUid);
    final targetName = target.effectiveTitle;
    final isTargetDonor = target.role == 'restaurantOwner' ||
        target.role == 'donor' ||
        initialListing != null;

    if (existingSnap.exists && existingSnap.data() != null) {
      final existingData = existingSnap.data()!;
      final updates = <String, dynamic>{
        'deletedFor.$myUid': false,
        'archivedBy.$myUid': false,
        'updatedAt': FieldValue.serverTimestamp(),
      };
      if (initialListing != null) {
        updates['listingId'] = _sanitizeId(initialListing.id);
        updates['listingTitle'] = _clampStr(initialListing.title, 140);
      }
      if (existingData['participantProfiles'] == null) {
        updates['participantProfiles'] = {
          myUid: {
            'displayName': _clampStr(myDisplayName, 100),
            'handle': myHandle,
            'photoURL': me.donorProfile?.logoUrl ?? me.photoURL,
            'role': me.isAdmin ? 'admin' : me.accountType.name,
            'restaurantName': me.restaurant?.restaurantName,
            'area': me.area.isNotEmpty ? me.area : 'Dhaka',
            'verified': me.verified,
          },
          targetUid: {
            'displayName': _clampStr(target.displayName, 100),
            'handle': target.handle,
            'photoURL': target.photoURL,
            'role': target.role,
            'restaurantName': target.restaurantName,
            'area': target.area.isNotEmpty ? target.area : 'Dhaka',
            'verified': target.verified,
          },
        };
      }
      try {
        await convRef.update(updates);
      } catch (_) {}
      return convId;
    }

    final initialPreview = initialListing != null
        ? 'About: ${_clampStr(initialListing.title, 80)}'
        : 'Started a conversation';

    await convRef.set({
      'conversationKind': initialListing != null ? 'pickup' : 'direct',
      'participants': [uidA, uidB],
      'uidA': uidA,
      'uidB': uidB,
      'donorId': isTargetDonor ? targetUid : myUid,
      'recipientId': isTargetDonor ? myUid : targetUid,
      'listingId':
          initialListing != null ? _sanitizeId(initialListing.id) : null,
      'donorName': _clampStr(isTargetDonor ? targetName : myDisplayName, 120),
      'recipientName':
          _clampStr(isTargetDonor ? myDisplayName : targetName, 120),
      'listingTitle':
          initialListing != null ? _clampStr(initialListing.title, 140) : null,
      'participantProfiles': {
        myUid: {
          'displayName': _clampStr(myDisplayName, 100),
          'handle': myHandle,
          'photoURL': me.donorProfile?.logoUrl ?? me.photoURL,
          'role': me.isAdmin ? 'admin' : me.accountType.name,
          'restaurantName': me.restaurant?.restaurantName,
          'area': me.area.isNotEmpty ? me.area : 'Dhaka',
          'verified': me.verified,
        },
        targetUid: {
          'displayName': _clampStr(target.displayName, 100),
          'handle': target.handle,
          'photoURL': target.photoURL,
          'role': target.role,
          'restaurantName': target.restaurantName,
          'area': target.area.isNotEmpty ? target.area : 'Dhaka',
          'verified': target.verified,
        },
      },
      'isDemo': false,
      'lastMessage': _clampStr(initialPreview, 500),
      'lastMessageType': 'text',
      'lastMessageSenderId': myUid,
      'lastMessageAt': FieldValue.serverTimestamp(),
      'unreadCount': {uidA: 0, uidB: 0},
      'mutedBy': <String, dynamic>{},
      'archivedBy': <String, dynamic>{},
      'deletedFor': <String, dynamic>{},
      'typingBy': <String, dynamic>{},
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });

    unawaited(NotificationService.instance.createCrossUserNotification(
      recipientUid: targetUid,
      senderUid: myUid,
      senderName: myDisplayName,
      type: 'new_conversation',
      title: 'New chat from $myDisplayName',
      titleBn: '$myDisplayName নতুন চ্যাট শুরু করেছেন',
      body: initialListing != null
          ? 'Asked about "${initialListing.title}"'
          : 'Started a new direct conversation with you.',
      bodyBn: initialListing != null
          ? '"${initialListing.title}" সম্পর্কে বার্তা পাঠিয়েছেন'
          : 'আপনার সাথে সরাসরি কথোপকথন শুরু করেছেন।',
      conversationId: convId,
      listingId: initialListing?.id,
      linkTab: 'inbox',
    ));

    return convId;
  }

  Future<String> openDirectChatForListingOrShop(
    AppUser me, {
    required String donorId,
    required String donorName,
    String donorArea = 'Dhaka',
    String? donorLogoUrl,
    bool donorVerified = false,
    Listing? listing,
  }) async {
    final safeDonorId = _sanitizeId(donorId);
    UserDirectoryEntry? target;
    try {
      final snap = await db.collection('userDirectory').doc(safeDonorId).get();
      if (snap.exists && snap.data() != null) {
        final d = snap.data()!;
        final roleRaw = d['role']?.toString();
        final role = (roleRaw == 'restaurantOwner' ||
                roleRaw == 'admin' ||
                roleRaw == 'donor')
            ? roleRaw!
            : 'restaurantOwner';
        target = UserDirectoryEntry(
          uid: (d['uid'] ?? safeDonorId).toString(),
          displayName: (d['displayName'] ?? donorName).toString(),
          handle: (d['handle'] ?? generatePublicHandle(donorName, safeDonorId))
              .toString(),
          photoURL: d['photoURL']?.toString() ?? donorLogoUrl,
          role: role,
          restaurantName: d['restaurantName']?.toString() ?? donorName,
          area: (d['area'] ?? donorArea).toString(),
          verified: d['verified'] == true,
          discoverable: d['discoverable'] != false,
          online: d['online'] == true,
          lastSeen: _tsToIso(d['lastSeen']),
        );
      }
    } catch (_) {}

    target ??= UserDirectoryEntry(
      uid: safeDonorId,
      displayName: donorName,
      handle: generatePublicHandle(donorName, safeDonorId),
      photoURL: donorLogoUrl,
      role: 'restaurantOwner',
      restaurantName: donorName,
      area: donorArea,
      verified: donorVerified,
      discoverable: true,
      online: false,
      lastSeen: DateTime.now().toIso8601String(),
    );

    return getOrCreateDirectConversation(me, target, initialListing: listing);
  }

  // --- Real-Time Messages (Paginated + Delivery/Read Status) ---

  ChatMessage? _mapFirestoreChatMessage(
    String id,
    Map<String, dynamic> data,
    String myUid, {
    String? peerUid,
  }) {
    final deletedFor =
        (data['deletedFor'] as List?)?.map((e) => e.toString()).toList() ?? [];
    if (deletedFor.contains(myUid)) return null;

    final deliveredTo =
        (data['deliveredTo'] as List?)?.map((e) => e.toString()).toList() ?? [];
    final readBy =
        (data['readBy'] as List?)?.map((e) => e.toString()).toList() ?? [];
    final senderId = (data['senderId'] ?? '').toString();
    final messageType = mapMessageTypeFromFirestore(data['messageType']);
    final mediaUrl = data['mediaUrl']?.toString();

    final reactionsObj =
        (data['reactions'] as Map?)?.cast<String, dynamic>() ?? {};
    final reactions = <MessageReaction>[];
    reactionsObj.forEach((emoji, userIds) {
      if (userIds is List) {
        for (final uid in userIds) {
          reactions.add(MessageReaction(emoji: emoji, userId: uid.toString()));
        }
      }
    });

    var status = 'sent';
    if (data['status'] == 'read' ||
        (peerUid != null &&
            !peerUid.startsWith('demo_') &&
            readBy.contains(peerUid)) ||
        (senderId == myUid && readBy.any((u) => u != myUid))) {
      status = 'read';
    } else if (data['status'] == 'delivered' ||
        (peerUid != null && deliveredTo.contains(peerUid)) ||
        deliveredTo.any((u) => u != senderId)) {
      status = 'delivered';
    }

    return ChatMessage(
      id: id,
      conversationId: (data['conversationId'] ?? '').toString(),
      senderId: senderId,
      senderName: data['senderName']?.toString(),
      text: (data['text'] ?? '').toString(),
      messageType: messageType,
      imageUrl: messageType == MessageType.image ? mediaUrl : null,
      audioUrl: messageType == MessageType.voice ? mediaUrl : null,
      fileUrl: messageType == MessageType.file ? mediaUrl : null,
      fileName: data['fileName']?.toString(),
      fileSize: (data['fileSize'] as num?)?.toInt(),
      fileMime: data['fileMime']?.toString(),
      durationSec: (data['durationSec'] as num?)?.toInt(),
      locationLat: (data['locationLat'] as num?)?.toDouble(),
      locationLng: (data['locationLng'] as num?)?.toDouble(),
      locationLabel: data['locationLabel']?.toString(),
      locationExpiresAt: data['locationExpiresAt']?.toString(),
      forwardedFrom: data['forwardedFrom']?.toString(),
      isForwarded: data['forwardedFrom'] != null,
      replyToId: data['replyToId']?.toString(),
      replyToText: data['replyToText']?.toString(),
      sentAt: _tsToIso(data['createdAt']),
      readAt: data['readAt'] != null
          ? _tsToIso(data['readAt'])
          : (status == 'read' ? _tsToIso(data['createdAt']) : null),
      deliveredTo: deliveredTo,
      readBy: readBy,
      deletedFor: deletedFor,
      reactions: reactions,
      status: status,
      isDemoAutoReply: data['isDemoAutoReply'] == true,
    );
  }

  Stream<MessengerMessagesPage> watchConversationMessages(
    String conversationId,
    String myUid, {
    String? peerUid,
    int pageSize = 30,
  }) {
    final safeConvId = _sanitizeId(conversationId);
    final safeMyUid = _sanitizeId(myUid);

    late StreamController<MessengerMessagesPage> controller;
    StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? sub;
    var usingFallback = false;

    void emitDocs(
      List<QueryDocumentSnapshot<Map<String, dynamic>>> docs,
      bool fallbackMode,
    ) {
      final all = <ChatMessage>[];
      for (final d in docs) {
        final m = _mapFirestoreChatMessage(
          d.id,
          d.data(),
          safeMyUid,
          peerUid: peerUid,
        );
        if (m != null) all.add(m);
      }
      all.sort((a, b) => a.sentAt.compareTo(b.sentAt));
      if (fallbackMode) {
        final hasMore = all.length > pageSize;
        final sliced = hasMore ? all.sublist(all.length - pageSize) : all;
        controller.add(MessengerMessagesPage(sliced, hasMore));
      } else {
        controller.add(MessengerMessagesPage(all, docs.length >= pageSize));
      }
    }

    void attachFallback() {
      if (usingFallback || controller.isClosed) return;
      usingFallback = true;
      sub?.cancel();
      sub = db
          .collection('conversations')
          .doc(safeConvId)
          .collection('messages')
          .where('participants', arrayContains: safeMyUid)
          .snapshots()
          .listen(
            (snap) => emitDocs(snap.docs, true),
            onError: (e, st) {
              if (!controller.isClosed) controller.addError(e, st);
            },
          );
    }

    controller = StreamController<MessengerMessagesPage>(
      onListen: () {
        sub = db
            .collection('conversations')
            .doc(safeConvId)
            .collection('messages')
            .where('participants', arrayContains: safeMyUid)
            .orderBy('createdAt', descending: true)
            .limit(pageSize)
            .snapshots()
            .listen(
              (snap) => emitDocs(snap.docs, false),
              onError: (e, st) {
                final msg = e.toString().toLowerCase();
                if (msg.contains('index') || msg.contains('failed-precondition')) {
                  attachFallback();
                } else if (!controller.isClosed) {
                  controller.addError(e, st);
                }
              },
            );
      },
      onCancel: () async {
        await sub?.cancel();
      },
    );

    return controller.stream;
  }

  // --- Optional Storage Upload + Offline Queue & Retry ---

  Future<String?> uploadChatMediaBytes({
    required String conversationId,
    required String senderId,
    required Uint8List bytes,
    required String fileName,
    String? contentType,
  }) async {
    try {
      final cleanName =
          '${DateTime.now().millisecondsSinceEpoch}_${fileName.replaceAll(RegExp(r'[^a-zA-Z0-9._-]'), '_')}';
      final safeName =
          cleanName.length > 80 ? cleanName.substring(0, 80) : cleanName;
      final ref = FirebaseStorage.instance.ref(
        'chatMedia/${_sanitizeId(conversationId)}/${_sanitizeId(senderId)}/$safeName',
      );
      await ref.putData(
        bytes,
        contentType != null ? SettableMetadata(contentType: contentType) : null,
      );
      return await ref.getDownloadURL();
    } catch (_) {
      return null;
    }
  }

  Future<List<QueuedMessengerMessage>> readOfflineMessageQueue(String uid) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString('${_offlineQueueKey}_${_sanitizeId(uid)}');
      if (raw == null || raw.isEmpty) return [];
      final decoded = jsonDecode(raw);
      if (decoded is! List) return [];
      return decoded
          .whereType<Map>()
          .map((e) => QueuedMessengerMessage.fromJson(
              Map<String, dynamic>.from(e)))
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> writeOfflineMessageQueue(
    String uid,
    List<QueuedMessengerMessage> items,
  ) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final key = '${_offlineQueueKey}_${_sanitizeId(uid)}';
      if (items.isEmpty) {
        await prefs.remove(key);
      } else {
        final trimmed =
            items.length > 25 ? items.sublist(items.length - 25) : items;
        await prefs.setString(
          key,
          jsonEncode(trimmed.map((e) => e.toJson()).toList()),
        );
      }
    } catch (_) {}
  }

  Future<void> sendMessengerMessage({
    required Conversation conversation,
    required String senderId,
    required String senderName,
    required String text,
    MessageType messageType = MessageType.text,
    String? mediaUrl,
    String? fileName,
    int? fileSize,
    String? fileMime,
    int? durationSec,
    double? locationLat,
    double? locationLng,
    String? locationLabel,
    String? locationExpiresAt,
    String? replyToId,
    String? replyToText,
    String? forwardedFrom,
  }) async {
    final convId = _sanitizeId(conversation.id);
    final myUid = _sanitizeId(senderId);
    final participants = conversation.participants.isNotEmpty
        ? conversation.participants.map(_sanitizeId).toList()
        : conversation.isDemo
            ? [myUid]
            : [myUid, _sanitizeId(conversation.peerUid ?? conversation.donorId)];

    final fsType = mapMessageTypeToFirestore(messageType);
    final clampedText = _clampStr(text, 2000);
    final cleanText = clampedText.isNotEmpty
        ? clampedText
        : fsType == 'image'
            ? 'Photo'
            : fsType == 'file'
                ? (fileName ?? 'Attachment')
                : fsType == 'location'
                    ? (locationLabel ?? 'Shared location')
                    : fsType == 'audio'
                        ? 'Voice note'
                        : 'Message';

    final safeMedia =
        (mediaUrl != null && mediaUrl.length <= 445000) ? mediaUrl : null;

    final rand = _rng.nextInt(90000) + 10000;
    final msgId = _sanitizeId(
      'm_${DateTime.now().millisecondsSinceEpoch}_$rand',
    );

    final msgPayload = <String, dynamic>{
      'conversationId': convId,
      'participants': participants,
      'senderId': myUid,
      'senderName': _clampStr(senderName, 100).isNotEmpty
          ? _clampStr(senderName, 100)
          : 'Member',
      'text': cleanText,
      'messageType': fsType,
      'mediaUrl': safeMedia,
      'fileName': fileName != null ? _clampStr(fileName, 160) : null,
      'fileSize': fileSize != null && fileSize >= 0 ? fileSize : null,
      'fileMime': fileMime != null ? _clampStr(fileMime, 100) : null,
      'locationLat': locationLat,
      'locationLng': locationLng,
      'locationLabel':
          locationLabel != null ? _clampStr(locationLabel, 160) : null,
      'locationExpiresAt':
          locationExpiresAt != null ? _clampStr(locationExpiresAt, 64) : null,
      'durationSec': durationSec != null ? durationSec.clamp(0, 600) : null,
      'replyToId': replyToId != null ? _sanitizeId(replyToId) : null,
      'replyToText': replyToText != null ? _clampStr(replyToText, 200) : null,
      'forwardedFrom':
          forwardedFrom != null ? _clampStr(forwardedFrom, 120) : null,
      'deliveredTo': [myUid],
      'readBy': [myUid],
      'deletedFor': <String>[],
      'reactions': <String, dynamic>{},
      'status': 'sent',
      'isDemoAutoReply': false,
      'createdAt': FieldValue.serverTimestamp(),
    };

    await db
        .collection('conversations')
        .doc(convId)
        .collection('messages')
        .doc(msgId)
        .set(msgPayload);

    final String? peerUid = conversation.isDemo
        ? null
        : (participants.cast<String?>().firstWhere(
                  (p) => p != myUid,
                  orElse: () => null,
                ) ??
            conversation.peerUid);

    final previewText = fsType == 'image'
        ? '📷 Photo'
        : fsType == 'file'
            ? '📎 ${_clampStr(fileName, 60).isNotEmpty ? _clampStr(fileName, 60) : 'File'}'
            : fsType == 'location'
                ? '📍 ${_clampStr(locationLabel, 80).isNotEmpty ? _clampStr(locationLabel, 80) : 'Location'}'
                : fsType == 'audio'
                    ? '🎤 Voice note'
                    : cleanText;

    final convUpdates = <String, dynamic>{
      'lastMessage': _clampStr(previewText, 500),
      'lastMessageType': fsType,
      'lastMessageSenderId': myUid,
      'lastMessageAt': FieldValue.serverTimestamp(),
      'unreadCount.$myUid': 0,
      'deletedFor.$myUid': false,
      'typingBy.$myUid': false,
      'updatedAt': FieldValue.serverTimestamp(),
    };

    if (peerUid != null && peerUid.isNotEmpty) {
      final safePeer = _sanitizeId(peerUid);
      convUpdates['unreadCount.$safePeer'] = FieldValue.increment(1);
      convUpdates['deletedFor.$safePeer'] = false;
    }

    await db.collection('conversations').doc(convId).update(convUpdates);

    if (conversation.isDemo && conversation.demoShopKey != null) {
      final spec = _demoShops.cast<_DemoShopSpec?>().firstWhere(
            (s) => s?.key == conversation.demoShopKey,
            orElse: () => null,
          );
      if (spec != null) {
        Timer(const Duration(milliseconds: 650), () async {
          final arRand = _rng.nextInt(9000) + 1000;
          final replyId = _sanitizeId(
            'demo_ar_${DateTime.now().millisecondsSinceEpoch}_$arRand',
          );
          try {
            await db
                .collection('conversations')
                .doc(convId)
                .collection('messages')
                .doc(replyId)
                .set({
              'conversationId': convId,
              'participants': participants,
              'senderId': spec.shopUid,
              'senderName': spec.name,
              'text': _clampStr(spec.autoReply, 2000),
              'messageType': 'text',
              'deliveredTo': [myUid],
              'readBy': <String>[],
              'deletedFor': <String>[],
              'reactions': <String, dynamic>{},
              'status': 'delivered',
              'isDemoAutoReply': true,
              'createdAt': FieldValue.serverTimestamp(),
            });
            await db.collection('conversations').doc(convId).update({
              'lastMessage': _clampStr(spec.autoReply, 500),
              'lastMessageType': 'text',
              'lastMessageSenderId': spec.shopUid,
              'lastMessageAt': FieldValue.serverTimestamp(),
              'unreadCount.$myUid': FieldValue.increment(1),
              'updatedAt': FieldValue.serverTimestamp(),
            });
          } catch (_) {}
        });
      }
      return;
    }

    if (peerUid != null && peerUid != myUid) {
      unawaited(NotificationService.instance.createCrossUserNotification(
        recipientUid: peerUid,
        senderUid: myUid,
        senderName: senderName,
        type: replyToId != null ? 'reply' : 'new_message',
        title: 'New message from $senderName',
        titleBn: '$senderName নতুন বার্তা পাঠিয়েছেন',
        body: _clampStr(previewText, 240),
        bodyBn: _clampStr(previewText, 240),
        conversationId: convId,
        linkTab: 'inbox',
      ));
    }
  }

  Future<void> markConversationDeliveredAndRead({
    required Conversation conversation,
    required String myUid,
    required List<ChatMessage> messages,
    required bool markRead,
  }) async {
    final safeConvId = _sanitizeId(conversation.id);
    final safeMyUid = _sanitizeId(myUid);

    if (markRead && conversation.unreadCount > 0) {
      try {
        await db.collection('conversations').doc(safeConvId).update({
          'unreadCount.$safeMyUid': 0,
          'updatedAt': FieldValue.serverTimestamp(),
        });
      } catch (_) {}
    }

    final pendingReceipts = messages.where((m) {
      if (m.senderId == safeMyUid || m.pending) return false;
      final alreadyDelivered = m.deliveredTo.contains(safeMyUid);
      final alreadyRead = m.readBy.contains(safeMyUid);
      if (markRead) return !alreadyRead || !alreadyDelivered;
      return !alreadyDelivered;
    }).toList();

    if (pendingReceipts.isEmpty) return;

    final start =
        pendingReceipts.length > 20 ? pendingReceipts.length - 20 : 0;
    final batch = db.batch();
    var writes = 0;
    for (final m in pendingReceipts.sublist(start)) {
      final msgRef = db
          .collection('conversations')
          .doc(safeConvId)
          .collection('messages')
          .doc(m.id);
      final updateData = <String, dynamic>{
        'deliveredTo': FieldValue.arrayUnion([safeMyUid]),
        'status': markRead
            ? 'read'
            : (m.status == 'read' ? 'read' : 'delivered'),
      };
      if (markRead) {
        updateData['readBy'] = FieldValue.arrayUnion([safeMyUid]);
        updateData['readAt'] = FieldValue.serverTimestamp();
      }
      batch.update(msgRef, updateData);
      writes += 1;
    }

    if (writes > 0) {
      try {
        await batch.commit();
      } catch (_) {}
    }
  }

  Future<void> markConversationUnreadAsDelivered(
    String conversationId,
    String myUid,
  ) async {
    final safeConvId = _sanitizeId(conversationId);
    final safeMyUid = _sanitizeId(myUid);
    try {
      final snap = await db
          .collection('conversations')
          .doc(safeConvId)
          .collection('messages')
          .where('participants', arrayContains: safeMyUid)
          .orderBy('createdAt', descending: true)
          .limit(10)
          .get();
      if (snap.docs.isEmpty) return;
      final batch = db.batch();
      var writes = 0;
      for (final d in snap.docs) {
        final data = d.data();
        if (data['senderId']?.toString() == safeMyUid) continue;
        final deliveredTo =
            (data['deliveredTo'] as List?)?.map((e) => e.toString()).toList() ??
                [];
        if (deliveredTo.contains(safeMyUid)) continue;
        batch.update(d.reference, {
          'deliveredTo': FieldValue.arrayUnion([safeMyUid]),
          'status': data['status'] == 'read' ? 'read' : 'delivered',
        });
        writes += 1;
      }
      if (writes > 0) await batch.commit();
    } catch (_) {}
  }

  Future<void> setMessengerTyping(
    String conversationId,
    String myUid,
    bool isTyping,
  ) async {
    try {
      await db
          .collection('conversations')
          .doc(_sanitizeId(conversationId))
          .update({
        'typingBy.${_sanitizeId(myUid)}': isTyping,
        'updatedAt': FieldValue.serverTimestamp(),
      });
    } catch (_) {}
  }

  Future<void> toggleConversationMute(
    String conversationId,
    String myUid,
    bool muted,
  ) async {
    await db
        .collection('conversations')
        .doc(_sanitizeId(conversationId))
        .update({
      'mutedBy.${_sanitizeId(myUid)}': muted,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> toggleConversationArchive(
    String conversationId,
    String myUid,
    bool archived,
  ) async {
    await db
        .collection('conversations')
        .doc(_sanitizeId(conversationId))
        .update({
      'archivedBy.${_sanitizeId(myUid)}': archived,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> deleteConversationForMe(
    String conversationId,
    String myUid,
  ) async {
    final safeMyUid = _sanitizeId(myUid);
    await db
        .collection('conversations')
        .doc(_sanitizeId(conversationId))
        .update({
      'deletedFor.$safeMyUid': true,
      'unreadCount.$safeMyUid': 0,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> deleteMessageForMe(
    String conversationId,
    String messageId,
    String myUid,
  ) async {
    await db
        .collection('conversations')
        .doc(_sanitizeId(conversationId))
        .collection('messages')
        .doc(_sanitizeId(messageId))
        .update({
      'deletedFor': FieldValue.arrayUnion([_sanitizeId(myUid)]),
    });
  }

  Future<void> toggleMessengerReaction(
    String conversationId,
    ChatMessage message,
    String myUid,
    String emoji,
  ) async {
    final safeConv = _sanitizeId(conversationId);
    final safeMyUid = _sanitizeId(myUid);
    final currentForEmoji = message.reactions
        .where((r) => r.emoji == emoji)
        .map((r) => r.userId)
        .toList();
    final nextForEmoji = currentForEmoji.contains(safeMyUid)
        ? currentForEmoji.where((u) => u != safeMyUid).toList()
        : [...currentForEmoji, safeMyUid];

    await db
        .collection('conversations')
        .doc(safeConv)
        .collection('messages')
        .doc(message.id)
        .update({
      'reactions.$emoji': nextForEmoji,
    });
  }

  Future<void> forwardMessengerMessage({
    required List<Conversation> targets,
    required ChatMessage sourceMessage,
    required String senderId,
    required String senderName,
    required String forwardedFromLabel,
  }) async {
    final mediaUrl = sourceMessage.imageUrl ??
        sourceMessage.fileUrl ??
        sourceMessage.audioUrl;

    for (final target in targets) {
      await sendMessengerMessage(
        conversation: target,
        senderId: senderId,
        senderName: senderName,
        text: sourceMessage.text,
        messageType: sourceMessage.messageType,
        mediaUrl: mediaUrl,
        fileName: sourceMessage.fileName,
        fileSize: sourceMessage.fileSize,
        fileMime: sourceMessage.fileMime,
        durationSec: sourceMessage.durationSec,
        locationLat: sourceMessage.locationLat,
        locationLng: sourceMessage.locationLng,
        locationLabel: sourceMessage.locationLabel,
        forwardedFrom: forwardedFromLabel,
      );
    }
  }
}
