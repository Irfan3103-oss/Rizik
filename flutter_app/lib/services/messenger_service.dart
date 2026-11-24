import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb_auth;
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../data/demo_personas.dart';
import '../firebase_options.dart';
import '../models/models.dart';
import 'firestore_error_helper.dart';
import 'notification_service.dart';

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

class StarterConvSeedResult {
  final String status; // 'already_present' | 'created' | 'repaired' | 'error'
  final String? error;

  const StarterConvSeedResult({required this.status, this.error});
}

class MessengerService {
  MessengerService._();
  static final MessengerService instance = MessengerService._();

  final Map<String, Future<void>> _inFlightDirSync = {};
  final Map<String, Future<StarterConvSeedResult>> _inFlightStarterSeed = {};
  final Random _rng = Random();

  static const String _offlineQueueKey = 'ahar_fb_chat_offline_queue_v1';

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
      return 'id_${DateTime.now().millisecondsSinceEpoch}';
    }
    return cleaned.length > 128 ? cleaned.substring(0, 128) : cleaned;
  }

  String _tsToIso(dynamic val) {
    if (val is Timestamp) return val.toDate().toIso8601String();
    if (val is String && val.isNotEmpty) return val;
    return DateTime.now().toIso8601String();
  }

  String _parseDirectoryRole(dynamic raw) {
    final s = (raw ?? 'user').toString();
    const valid = {
      'admin',
      'restaurantOwner',
      'donor',
      'recipient',
      'volunteer',
      'ngo',
      'organizer',
      'user',
    };
    return valid.contains(s) ? s : 'user';
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

    late DocumentSnapshot<Map<String, dynamic>> dirSnap;
    try {
      dirSnap = await getDocResilient(dirRef, db: db);
    } catch (e) {
      debugPrint('[MessengerService] Failed reading userDirectory/$uid: $e');
      return;
    }

    Map<String, dynamic>? existingUserData;
    try {
      final userSnap = await getDocResilient(userRef, db: db);
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
      'isDemo': false,
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
    int pageLimit = 40,
    void Function(FirestoreListenerError err)? onError,
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
        final isDemo = data['isDemo'] == true || uid.startsWith('demo_');
        final role = _parseDirectoryRole(data['role']);
        final lastSeenIso = _tsToIso(data['lastSeen']);
        final lastSeenDt = DateTime.tryParse(lastSeenIso);
        final recentlyActive = lastSeenDt != null &&
            (nowMs - lastSeenDt.millisecondsSinceEpoch) < 120000;
        list.add(UserDirectoryEntry(
          uid: uid,
          displayName: (data['displayName'] ?? 'Community Member').toString(),
          handle:
              (data['handle'] ?? generatePublicHandle('member', uid)).toString(),
          photoURL: data['photoURL']?.toString(),
          role: role,
          restaurantName: data['restaurantName']?.toString(),
          restaurantType: data['restaurantType']?.toString(),
          area: (data['area'] ?? 'Dhaka').toString(),
          verified: data['verified'] == true,
          discoverable: data['discoverable'] == true,
          online: isDemo ? (data['online'] == true) : (data['online'] == true && recentlyActive),
          lastSeen: lastSeenIso,
          isDemo: isDemo,
          bio: data['bio']?.toString(),
          bioBn: data['bioBn']?.toString(),
          openingHours: data['openingHours']?.toString(),
          rating: (data['rating'] as num?)?.toDouble(),
          reviewCount: (data['reviewCount'] as num?)?.toInt(),
        ));
      }
      list.sort((a, b) {
        if (a.online != b.online) return a.online ? -1 : 1;
        return b.lastSeen.compareTo(a.lastSeen);
      });
      return DirectoryPageResult(list, snap.docs.length >= effLimit);
    }).handleError((e) {
      final parsed = parseFirestoreListenerError(e, 'LIST', 'userDirectory');
      onError?.call(parsed);
      throw parsed;
    });
  }

  // --- Block & Report Users ---

  Stream<List<BlockedUserEntry>> watchMyBlockedUsers(
    String myUid, {
    void Function(FirestoreListenerError err)? onError,
  }) {
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
    }).handleError((e) {
      final parsed =
          parseFirestoreListenerError(e, 'LIST', 'users/$safeUid/blocked');
      onError?.call(parsed);
      throw parsed;
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

  // --- Isolated Client-Side Demo Persona Conversations (Strictly Under users/{uid}/demo*) ---

  Future<StarterConvSeedResult> seedStarterDemoConversationsOnce(
    fb_auth.User fbUser,
    AppUser appUser, {
    bool forceCheck = false,
  }) {
    if (!forceCheck) {
      final existing = _inFlightStarterSeed[fbUser.uid];
      if (existing != null) return existing;
    }

    final future = _doSeedStarterDemoConversationsOnce(
      fbUser,
      appUser,
      forceCheck: forceCheck,
    ).whenComplete(() {
      _inFlightStarterSeed.remove(fbUser.uid);
    });
    if (!forceCheck) {
      _inFlightStarterSeed[fbUser.uid] = future;
    }
    return future;
  }

  Future<StarterConvSeedResult> _doSeedStarterDemoConversationsOnce(
    fb_auth.User fbUser,
    AppUser _, {
    bool forceCheck = false,
  }) async {
    final uid = _sanitizeId(fbUser.uid);
    final localSeedFlag = 'rizik_demo_team_v2_$uid';
    if (!forceCheck) {
      try {
        final prefs = await SharedPreferences.getInstance();
        if (prefs.getString(localSeedFlag) == '1') {
          return const StarterConvSeedResult(status: 'already_present');
        }
      } catch (_) {}
    }

    final convId = rizikTeamPersona.id;
    final teamConvRef = db
        .collection('users')
        .doc(uid)
        .collection('demoConversations')
        .doc(convId);

    var convExists = false;
    var existingMsgCount = 0;
    try {
      final results = await Future.wait([
        getDocResilient(teamConvRef, db: db),
        getDocsResilient(
          db
              .collection('users')
              .doc(uid)
              .collection('demoMessages')
              .where('conversationId', isEqualTo: convId)
              .limit(5),
          db: db,
        ),
      ]);
      final existingConv = results[0] as DocumentSnapshot<Map<String, dynamic>>;
      final existingMsgs = results[1] as QuerySnapshot<Map<String, dynamic>>;
      convExists = existingConv.exists;
      existingMsgCount = existingMsgs.size;
      if (convExists && existingMsgCount > 0) {
        try {
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString(localSeedFlag, '1');
        } catch (_) {}
        return const StarterConvSeedResult(status: 'already_present');
      }
    } catch (err) {
      debugPrint(
        '[MessengerService] Could not inspect starter demo_team thread: $err',
      );
      return StarterConvSeedResult(status: 'error', error: err.toString());
    }

    const welcomeMsgs = [
      'Welcome to Rizik! Join Community Rooms above, tap "New chat" to message partner kitchens & neighbors, or message demo personas anytime.',
      'রিজিক-এ স্বাগতম! উপরে কমিউনিটি রুমে যোগ দিন, "নতুন চ্যাট" থেকে কাছের রেস্তোরাঁ বা প্রতিবেশীর সাথে চ্যাট করুন। এটি একটি ডেমো সহায়তা থ্রেড।',
    ];

    try {
      final batch = db.batch();
      if (!convExists) {
        batch.set(teamConvRef, {
          'personaId': rizikTeamPersona.id,
          'personaName': rizikTeamPersona.displayName,
          'personaHandle': rizikTeamPersona.handle,
          'personaRole': rizikTeamPersona.role,
          'personaArea': rizikTeamPersona.area,
          'personaAvatar': null,
          'personaVerified': true,
          'isOfficial': true,
          'lastMessage': _clampStr(welcomeMsgs[1], 500),
          'lastMessageType': 'text',
          'lastMessageSenderId': rizikTeamPersona.id,
          'lastMessageAt': FieldValue.serverTimestamp(),
          'unreadCount': 1,
          'isMuted': false,
          'isArchived': false,
          'createdAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
        });
      }

      if (existingMsgCount == 0) {
        for (var index = 0; index < welcomeMsgs.length; index++) {
          final msgId = _sanitizeId('demo_team_welcome_$index');
          batch.set(
            db.collection('users').doc(uid).collection('demoMessages').doc(msgId),
            {
              'conversationId': convId,
              'personaId': rizikTeamPersona.id,
              'senderId': rizikTeamPersona.id,
              'senderName': rizikTeamPersona.displayName,
              'text': _clampStr(welcomeMsgs[index], 2000),
              'messageType': 'text',
              'reactions': <String, dynamic>{},
              'isDemoAutoReply': true,
              'createdAt': FieldValue.serverTimestamp(),
            },
          );
        }
      }

      await batch.commit();

      try {
        await db.collection('users').doc(uid).update({
          'starterSeeded': true,
          'updatedAt': FieldValue.serverTimestamp(),
        });
      } catch (_) {}

      try {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(localSeedFlag, '1');
      } catch (_) {}

      return StarterConvSeedResult(
        status: convExists ? 'repaired' : 'created',
      );
    } catch (err) {
      debugPrint('[MessengerService] Starter demo_team seed skipped: $err');
      return StarterConvSeedResult(status: 'error', error: err.toString());
    }
  }

  DemoPersonaSpec _buildPersonaSpecFromEntry(UserDirectoryEntry entry) {
    final known = allDemoPersonasMap[entry.uid];
    if (known != null) return known;
    return DemoPersonaSpec(
      id: entry.uid,
      displayName: entry.restaurantName ?? entry.displayName,
      displayNameBn: entry.restaurantName ?? entry.displayName,
      handle: entry.handle,
      role: entry.role,
      avatar: entry.photoURL,
      restaurantName: entry.restaurantName,
      restaurantType: entry.restaurantType,
      area: entry.area.isNotEmpty ? entry.area : 'Dhaka',
      verified: entry.verified,
      bio: entry.bio ?? '${entry.displayName} in ${entry.area}',
      bioBn: entry.bioBn ?? entry.bio ?? '${entry.area} এলাকার ${entry.displayName}',
      openingHours: entry.openingHours,
      rating: entry.rating,
      reviewCount: entry.reviewCount,
      online: entry.online,
      categoryKey: entry.role == 'volunteer' ? 'volunteer' : 'team',
    );
  }

  DemoPersonaSpec _buildPersonaSpecFromConversation(Conversation conv) {
    final personaId = conv.demoPersonaId ?? conv.peerUid ?? conv.id;
    final known = allDemoPersonasMap[personaId];
    if (known != null) return known;
    return DemoPersonaSpec(
      id: personaId,
      displayName: conv.donorName.isNotEmpty ? conv.donorName : 'Demo Partner',
      displayNameBn:
          conv.donorName.isNotEmpty ? conv.donorName : 'ডেমো পার্টনার',
      handle: conv.peerHandle ?? '@demo_partner',
      role: _parseDirectoryRole(conv.peerRole),
      avatar: conv.donorLogoUrl,
      restaurantName: conv.peerRestaurantName,
      area: conv.peerArea ?? 'Dhaka',
      verified: conv.peerVerified ?? false,
      bio: conv.peerBio ?? '',
      bioBn: conv.peerBioBn ?? '',
      openingHours: conv.donorHours,
      rating: conv.peerRating,
      reviewCount: conv.peerReviewCount,
      online: true,
      isOfficial: conv.isOfficial,
      categoryKey: 'team',
    );
  }

  Future<String> getOrCreateDemoPersonaConversation(
    AppUser me,
    UserDirectoryEntry target, {
    String lang = 'en',
  }) async {
    final myUid = _sanitizeId(me.id);
    final spec = _buildPersonaSpecFromEntry(target);
    final convId = _sanitizeId(spec.id);
    final convRef = db
        .collection('users')
        .doc(myUid)
        .collection('demoConversations')
        .doc(convId);

    try {
      final existing = await getDocResilient(convRef, db: db);
      if (existing.exists) {
        await convRef.update({
          'isArchived': false,
          'updatedAt': FieldValue.serverTimestamp(),
        });
        return convId;
      }
    } catch (_) {}

    final greetingText = lang == 'bn'
        ? '${spec.displayNameBn}-এ স্বাগতম! (${spec.area}) — ${spec.bioBn}'
        : 'Hi! Welcome to ${spec.displayName} (${spec.area}). ${spec.bio}';

    final batch = db.batch();
    batch.set(convRef, {
      'personaId': spec.id,
      'personaName': _clampStr(spec.displayName, 120),
      'personaHandle': _clampStr(spec.handle, 40),
      'personaRole': spec.role,
      'personaArea':
          _clampStr(spec.area, 80).isNotEmpty ? _clampStr(spec.area, 80) : 'Dhaka',
      'personaAvatar':
          (spec.avatar != null && spec.avatar!.length <= 248000) ? spec.avatar : null,
      'personaVerified': spec.verified,
      'isOfficial': spec.isOfficial,
      'lastMessage': _clampStr(greetingText, 500),
      'lastMessageType': 'text',
      'lastMessageSenderId': spec.id,
      'lastMessageAt': FieldValue.serverTimestamp(),
      'unreadCount': 0,
      'isMuted': false,
      'isArchived': false,
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });

    final greetMsgId = _sanitizeId(
      'demo_greet_${convId}_${DateTime.now().millisecondsSinceEpoch}',
    );
    batch.set(
      db.collection('users').doc(myUid).collection('demoMessages').doc(greetMsgId),
      {
        'conversationId': convId,
        'personaId': spec.id,
        'senderId': spec.id,
        'senderName': _clampStr(spec.displayName, 120),
        'text': _clampStr(greetingText, 2000),
        'messageType': 'text',
        'reactions': <String, dynamic>{},
        'isDemoAutoReply': true,
        'createdAt': FieldValue.serverTimestamp(),
      },
    );

    await batch.commit();
    return convId;
  }

  Conversation _mapDemoConversationDoc(
    String id,
    Map<String, dynamic> data,
    String safeUid,
  ) {
    final personaId = (data['personaId'] ?? id).toString();
    final spec = allDemoPersonasMap[personaId];
    final personaName =
        (data['personaName'] ?? spec?.displayName ?? 'Demo Partner').toString();
    final personaAvatar = data['personaAvatar']?.toString() ?? spec?.avatar;
    final personaRole =
        _parseDirectoryRole(data['personaRole'] ?? spec?.role ?? 'restaurantOwner');
    final personaArea =
        (data['personaArea'] ?? spec?.area ?? 'Dhaka').toString();
    final personaHandle =
        (data['personaHandle'] ?? spec?.handle ?? '@demo_rizik').toString();
    final lastMsgAt = _tsToIso(data['lastMessageAt'] ?? data['updatedAt']);

    return Conversation(
      id: id,
      listingId: '',
      claimId: '',
      donorId: personaId,
      recipientId: safeUid,
      uidA: safeUid,
      uidB: personaId,
      participants: [safeUid],
      conversationKind: 'demo',
      donorName: personaName,
      donorLogoUrl: personaAvatar,
      donorVerified: data['personaVerified'] == true || (spec?.verified == true),
      donorArea: personaArea,
      donorHours: spec?.openingHours,
      peerOnline: spec?.online ?? true,
      peerLastSeen: null,
      peerTyping: false,
      peerUid: personaId,
      peerHandle: personaHandle,
      peerRole: personaRole,
      peerVerified: data['personaVerified'] == true || (spec?.verified == true),
      peerArea: personaArea,
      peerRestaurantName: spec?.restaurantName ?? personaName,
      peerBio: spec?.bio,
      peerBioBn: spec?.bioBn,
      peerRating: spec?.rating,
      peerReviewCount: spec?.reviewCount,
      recipientName: 'You',
      recipientLogoUrl: null,
      listingTitle: spec?.isOfficial == true
          ? 'Official Guide · Demo'
          : '$personaArea · Demo Account',
      listingPhoto: (personaAvatar != null && personaAvatar.isNotEmpty)
          ? personaAvatar
          : '/images/kacchi-biryani.jpg',
      pickupStart: lastMsgAt,
      pickupEnd: lastMsgAt,
      claimStatus: ClaimStatus.requested,
      isDirect: true,
      isStarter: true,
      isDemo: true,
      demoPersonaId: personaId,
      demoShopKey: spec?.categoryKey,
      isOfficial: data['isOfficial'] == true || (spec?.isOfficial == true),
      isMuted: data['isMuted'] == true,
      isArchived: data['isArchived'] == true,
      isFirestoreBacked: true,
      lastMessage: (data['lastMessage'] ?? '').toString(),
      lastMessageType: mapMessageTypeFromFirestore(data['lastMessageType']),
      lastMessageSenderId: data['lastMessageSenderId']?.toString(),
      lastMessageAt: lastMsgAt,
      unreadCount: (data['unreadCount'] as num?)?.toInt() ?? 0,
      isBlocked: false,
      blockedByMe: false,
      createdAt: _tsToIso(data['createdAt']),
      updatedAt: _tsToIso(data['updatedAt']),
    );
  }

  Stream<List<Conversation>> watchMyDemoConversations(
    String myUid, {
    void Function(FirestoreListenerError err)? onError,
  }) {
    final safeUid = _sanitizeId(myUid);
    return db
        .collection('users')
        .doc(safeUid)
        .collection('demoConversations')
        .snapshots()
        .map((snap) {
      final list = snap.docs
          .map((d) => _mapDemoConversationDoc(d.id, d.data(), safeUid))
          .toList()
        ..sort((a, b) => (b.lastMessageAt ?? b.updatedAt)
            .compareTo(a.lastMessageAt ?? a.updatedAt));
      return list;
    }).handleError((e) {
      final parsed = parseFirestoreListenerError(
        e,
        'LIST',
        'users/$safeUid/demoConversations',
      );
      onError?.call(parsed);
      throw parsed;
    });
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

    final uidA = (data['uidA'] ?? data['donorId'] ?? myUid).toString();
    final uidB = (data['uidB'] ?? data['recipientId'] ?? myUid).toString();
    final peerUid = uidA == myUid ? uidB : uidA;

    final profiles =
        (data['participantProfiles'] as Map?)?.cast<String, dynamic>() ?? {};
    final peerMeta =
        (profiles[peerUid] as Map?)?.cast<String, dynamic>() ?? {};
    final liveDir = directoryMap[peerUid];

    final peerName = liveDir?.restaurantName ??
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

    final peerAvatar = liveDir?.photoURL ?? peerMeta['photoURL']?.toString();
    final peerRole = liveDir?.role ?? peerMeta['role']?.toString() ?? 'user';
    final peerVerified = liveDir?.verified ?? (peerMeta['verified'] == true);
    final peerArea = liveDir?.area ?? peerMeta['area']?.toString() ?? 'Dhaka';
    final peerHandle = liveDir?.handle ??
        peerMeta['handle']?.toString() ??
        generatePublicHandle(peerName, peerUid);

    final unreadMap =
        (data['unreadCount'] as Map?)?.cast<String, dynamic>() ?? {};
    final mutedMap = (data['mutedBy'] as Map?)?.cast<String, dynamic>() ?? {};
    final archivedMap =
        (data['archivedBy'] as Map?)?.cast<String, dynamic>() ?? {};
    final typingMap = (data['typingBy'] as Map?)?.cast<String, dynamic>() ?? {};

    final blockedByMe = blockedSet.contains(peerUid);
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
      conversationKind:
          data['conversationKind'] == 'pickup' ? 'pickup' : 'direct',
      donorName: data['donorId']?.toString() == peerUid
          ? peerName
          : (data['donorName'] ?? peerName).toString(),
      donorLogoUrl: peerAvatar,
      donorVerified: peerVerified,
      donorArea: peerArea,
      peerOnline: liveDir?.online ?? false,
      peerLastSeen: liveDir?.lastSeen,
      peerTyping: typingMap[peerUid] == true,
      peerUid: peerUid,
      peerHandle: peerHandle,
      peerRole: peerRole,
      peerVerified: peerVerified,
      peerArea: peerArea,
      peerRestaurantName: liveDir?.restaurantName,
      recipientName: data['recipientId']?.toString() == peerUid
          ? peerName
          : (data['recipientName'] ?? 'Neighbor').toString(),
      recipientLogoUrl: peerAvatar,
      listingTitle: (data['listingTitle']?.toString().isNotEmpty == true)
          ? data['listingTitle'].toString()
          : peerHandle,
      listingPhoto: (peerAvatar != null && peerAvatar.isNotEmpty)
          ? peerAvatar
          : '/images/kacchi-biryani.jpg',
      pickupStart: lastMsgAt,
      pickupEnd: lastMsgAt,
      claimStatus: ClaimStatus.requested,
      isDirect: listingId.isEmpty || listingId.startsWith('direct_'),
      isStarter: false,
      isDemo: false,
      isOfficial: peerMeta['isOfficial'] == true,
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
    void Function(FirestoreListenerError err)? onError,
  }) {
    final safeUid = _sanitizeId(myUid);
    late StreamController<List<Conversation>> controller;
    StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? realSub;
    StreamSubscription<List<Conversation>>? demoSub;

    var realConvs = <Conversation>[];
    var demoConvs = <Conversation>[];

    void emitMerged() {
      if (controller.isClosed) return;
      final map = <String, Conversation>{};
      for (final c in demoConvs) {
        map[c.id] = c;
      }
      for (final c in realConvs) {
        map[c.id] = c;
      }
      final merged = map.values.toList()
        ..sort((a, b) => (b.lastMessageAt ?? b.updatedAt)
            .compareTo(a.lastMessageAt ?? a.updatedAt));
      controller.add(merged);
    }

    controller = StreamController<List<Conversation>>(
      onListen: () {
        realSub = db
            .collection('conversations')
            .where('participants', arrayContains: safeUid)
            .snapshots()
            .listen(
          (snap) {
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
            realConvs = mapped;
            emitMerged();
          },
          onError: (e, st) {
            final parsed =
                parseFirestoreListenerError(e, 'LIST', 'conversations');
            onError?.call(parsed);
            if (!controller.isClosed) controller.addError(parsed, st);
          },
        );

        demoSub = watchMyDemoConversations(
          safeUid,
          onError: onError,
        ).listen(
          (list) {
            demoConvs = list;
            emitMerged();
          },
          onError: (e, st) {
            if (!controller.isClosed) controller.addError(e, st);
          },
        );
      },
      onCancel: () async {
        await realSub?.cancel();
        await demoSub?.cancel();
      },
    );

    return controller.stream;
  }

  Future<String> getOrCreateDirectConversation(
    AppUser me,
    UserDirectoryEntry target, {
    Listing? initialListing,
    String lang = 'en',
  }) async {
    if (target.isDemo || target.uid.startsWith('demo_')) {
      return getOrCreateDemoPersonaConversation(me, target, lang: lang);
    }

    final myUid = _sanitizeId(me.id);
    final targetUid = _sanitizeId(target.uid);
    if (myUid == targetUid) {
      throw Exception('Cannot start a chat with yourself');
    }

    final myBlockSnap = await getDocResilient(
      db.collection('users').doc(myUid).collection('blocked').doc(targetUid),
      db: db,
    );
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
    final existingSnap = await getDocResilient(convRef, db: db);

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
      final snap = await getDocResilient(
        db.collection('userDirectory').doc(safeDonorId),
        db: db,
      );
      if (snap.exists && snap.data() != null) {
        final d = snap.data()!;
        final role = _parseDirectoryRole(d['role']);
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
          isDemo: d['isDemo'] == true || safeDonorId.startsWith('demo_'),
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
      isDemo: safeDonorId.startsWith('demo_'),
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
    bool isDemo = false,
    void Function(FirestoreListenerError err)? onError,
  }) {
    final safeConvId = _sanitizeId(conversationId);
    final safeMyUid = _sanitizeId(myUid);

    if (isDemo || safeConvId.startsWith('demo_')) {
      return db
          .collection('users')
          .doc(safeMyUid)
          .collection('demoMessages')
          .where('conversationId', isEqualTo: safeConvId)
          .snapshots()
          .map((snap) {
        final all = <ChatMessage>[];
        for (final d in snap.docs) {
          final m = _mapFirestoreChatMessage(d.id, d.data(), safeMyUid);
          if (m != null) all.add(m.copyWith(status: 'read'));
        }
        all.sort((a, b) => a.sentAt.compareTo(b.sentAt));
        final hasMore = all.length > pageSize;
        final sliced = hasMore ? all.sublist(all.length - pageSize) : all;
        return MessengerMessagesPage(sliced, hasMore);
      }).handleError((e) {
        final parsed = parseFirestoreListenerError(
          e,
          'LIST',
          'users/$safeMyUid/demoMessages',
        );
        onError?.call(parsed);
        throw parsed;
      });
    }

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
        if (!controller.isClosed) {
          controller.add(MessengerMessagesPage(sliced, hasMore));
        }
      } else {
        if (!controller.isClosed) {
          controller.add(MessengerMessagesPage(all, docs.length >= pageSize));
        }
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
              final parsed = parseFirestoreListenerError(
                e,
                'LIST',
                'conversations/$safeConvId/messages',
              );
              onError?.call(parsed);
              if (!controller.isClosed) controller.addError(parsed, st);
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
                final parsed = parseFirestoreListenerError(
                  e,
                  'LIST',
                  'conversations/$safeConvId/messages',
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

  Future<void> triggerDemoPersonaAutoReply({
    required String myUid,
    required Conversation conversation,
    required String userText,
    String lang = 'en',
    bool markUnread = false,
  }) async {
    final safeUid = _sanitizeId(myUid);
    final convId = _sanitizeId(conversation.id);
    final spec = _buildPersonaSpecFromConversation(conversation);
    final replyText = generatePersonaAutoReply(spec, userText, lang);

    final rand = _rng.nextInt(9000) + 1000;
    final replyId = _sanitizeId(
      'demo_ar_${DateTime.now().millisecondsSinceEpoch}_$rand',
    );
    final batch = db.batch();
    batch.set(
      db.collection('users').doc(safeUid).collection('demoMessages').doc(replyId),
      {
        'conversationId': convId,
        'personaId': spec.id,
        'senderId': spec.id,
        'senderName': _clampStr(spec.displayName, 120),
        'text': _clampStr(replyText, 2000),
        'messageType': 'text',
        'reactions': <String, dynamic>{},
        'isDemoAutoReply': true,
        'createdAt': FieldValue.serverTimestamp(),
      },
    );
    batch.update(
      db
          .collection('users')
          .doc(safeUid)
          .collection('demoConversations')
          .doc(convId),
      {
        'lastMessage': _clampStr(replyText, 500),
        'lastMessageType': 'text',
        'lastMessageSenderId': spec.id,
        'lastMessageAt': FieldValue.serverTimestamp(),
        'unreadCount': markUnread ? FieldValue.increment(1) : 0,
        'updatedAt': FieldValue.serverTimestamp(),
      },
    );
    try {
      await batch.commit();
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
    String lang = 'en',
  }) async {
    final convId = _sanitizeId(conversation.id);
    final myUid = _sanitizeId(senderId);
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
    final previewText = fsType == 'image'
        ? '📷 Photo'
        : fsType == 'file'
            ? '📎 ${_clampStr(fileName, 60).isNotEmpty ? _clampStr(fileName, 60) : 'File'}'
            : fsType == 'location'
                ? '📍 ${_clampStr(locationLabel, 80).isNotEmpty ? _clampStr(locationLabel, 80) : 'Location'}'
                : fsType == 'audio'
                    ? '🎤 Voice note'
                    : cleanText;

    if (conversation.isDemo || conversation.conversationKind == 'demo') {
      final personaId = _sanitizeId(
        conversation.demoPersonaId ?? conversation.peerUid ?? convId,
      );
      final rand = _rng.nextInt(90000) + 10000;
      final msgId = _sanitizeId(
        'dm_${DateTime.now().millisecondsSinceEpoch}_$rand',
      );
      final batch = db.batch();
      batch.set(
        db.collection('users').doc(myUid).collection('demoMessages').doc(msgId),
        {
          'conversationId': convId,
          'personaId': personaId,
          'senderId': myUid,
          'senderName': _clampStr(senderName, 120).isNotEmpty
              ? _clampStr(senderName, 120)
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
          'locationExpiresAt': locationExpiresAt != null
              ? _clampStr(locationExpiresAt, 64)
              : null,
          'durationSec': durationSec != null ? durationSec.clamp(0, 600) : null,
          'replyToId': replyToId != null ? _sanitizeId(replyToId) : null,
          'replyToText':
              replyToText != null ? _clampStr(replyToText, 200) : null,
          'forwardedFrom':
              forwardedFrom != null ? _clampStr(forwardedFrom, 120) : null,
          'reactions': <String, dynamic>{},
          'isDemoAutoReply': false,
          'createdAt': FieldValue.serverTimestamp(),
        },
      );
      batch.update(
        db
            .collection('users')
            .doc(myUid)
            .collection('demoConversations')
            .doc(convId),
        {
          'lastMessage': _clampStr(previewText, 500),
          'lastMessageType': fsType,
          'lastMessageSenderId': myUid,
          'lastMessageAt': FieldValue.serverTimestamp(),
          'unreadCount': 0,
          'updatedAt': FieldValue.serverTimestamp(),
        },
      );
      await batch.commit();

      Timer(const Duration(milliseconds: 650), () {
        unawaited(triggerDemoPersonaAutoReply(
          myUid: myUid,
          conversation: conversation,
          userText: cleanText,
          lang: lang,
          markUnread: false,
        ));
      });
      return;
    }

    final participants = conversation.participants.isNotEmpty
        ? conversation.participants.map(_sanitizeId).toList()
        : [myUid, _sanitizeId(conversation.peerUid ?? conversation.donorId)];

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

    final String? peerUid = participants.cast<String?>().firstWhere(
              (p) => p != myUid,
              orElse: () => null,
            ) ??
        conversation.peerUid;

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

    if (peerUid != null && peerUid != myUid && !peerUid.startsWith('demo_')) {
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

    if (conversation.isDemo || conversation.conversationKind == 'demo') {
      if (markRead && conversation.unreadCount > 0) {
        try {
          await db
              .collection('users')
              .doc(safeMyUid)
              .collection('demoConversations')
              .doc(safeConvId)
              .update({
            'unreadCount': 0,
            'updatedAt': FieldValue.serverTimestamp(),
          });
        } catch (_) {}
      }
      return;
    }

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
    String myUid, {
    bool isDemo = false,
  }) async {
    if (isDemo || conversationId.startsWith('demo_')) return;
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
    bool isTyping, {
    bool isDemo = false,
  }) async {
    if (isDemo || conversationId.startsWith('demo_')) return;
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
    bool muted, {
    bool isDemo = false,
  }) async {
    final safeUid = _sanitizeId(myUid);
    final safeConv = _sanitizeId(conversationId);
    if (isDemo || safeConv.startsWith('demo_')) {
      await db
          .collection('users')
          .doc(safeUid)
          .collection('demoConversations')
          .doc(safeConv)
          .update({
        'isMuted': muted,
        'updatedAt': FieldValue.serverTimestamp(),
      });
      return;
    }
    await db.collection('conversations').doc(safeConv).update({
      'mutedBy.$safeUid': muted,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> toggleConversationArchive(
    String conversationId,
    String myUid,
    bool archived, {
    bool isDemo = false,
  }) async {
    final safeUid = _sanitizeId(myUid);
    final safeConv = _sanitizeId(conversationId);
    if (isDemo || safeConv.startsWith('demo_')) {
      await db
          .collection('users')
          .doc(safeUid)
          .collection('demoConversations')
          .doc(safeConv)
          .update({
        'isArchived': archived,
        'updatedAt': FieldValue.serverTimestamp(),
      });
      return;
    }
    await db.collection('conversations').doc(safeConv).update({
      'archivedBy.$safeUid': archived,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> deleteConversationForMe(
    String conversationId,
    String myUid, {
    bool isDemo = false,
  }) async {
    final safeMyUid = _sanitizeId(myUid);
    final safeConv = _sanitizeId(conversationId);
    if (isDemo || safeConv.startsWith('demo_')) {
      final msgsSnap = await db
          .collection('users')
          .doc(safeMyUid)
          .collection('demoMessages')
          .where('conversationId', isEqualTo: safeConv)
          .get();
      final batch = db.batch();
      for (final d in msgsSnap.docs) {
        batch.delete(d.reference);
      }
      batch.delete(db
          .collection('users')
          .doc(safeMyUid)
          .collection('demoConversations')
          .doc(safeConv));
      await batch.commit();
      return;
    }
    await db.collection('conversations').doc(safeConv).update({
      'deletedFor.$safeMyUid': true,
      'unreadCount.$safeMyUid': 0,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> deleteMessageForMe(
    String conversationId,
    String messageId,
    String myUid, {
    bool isDemo = false,
  }) async {
    final safeUid = _sanitizeId(myUid);
    final safeConv = _sanitizeId(conversationId);
    if (isDemo || safeConv.startsWith('demo_')) {
      await db
          .collection('users')
          .doc(safeUid)
          .collection('demoMessages')
          .doc(_sanitizeId(messageId))
          .delete();
      return;
    }
    await db
        .collection('conversations')
        .doc(safeConv)
        .collection('messages')
        .doc(_sanitizeId(messageId))
        .update({
      'deletedFor': FieldValue.arrayUnion([safeUid]),
    });
  }

  Future<void> toggleMessengerReaction(
    String conversationId,
    ChatMessage message,
    String myUid,
    String emoji, {
    bool isDemo = false,
  }) async {
    final safeConv = _sanitizeId(conversationId);
    final safeMyUid = _sanitizeId(myUid);
    final currentForEmoji = message.reactions
        .where((r) => r.emoji == emoji)
        .map((r) => r.userId)
        .toList();
    final nextForEmoji = currentForEmoji.contains(safeMyUid)
        ? currentForEmoji.where((u) => u != safeMyUid).toList()
        : [...currentForEmoji, safeMyUid];

    if (isDemo || safeConv.startsWith('demo_')) {
      await db
          .collection('users')
          .doc(safeMyUid)
          .collection('demoMessages')
          .doc(message.id)
          .update({'reactions.$emoji': nextForEmoji});
      return;
    }

    await db
        .collection('conversations')
        .doc(safeConv)
        .collection('messages')
        .doc(message.id)
        .update({'reactions.$emoji': nextForEmoji});
  }

  Future<void> forwardMessengerMessage({
    required List<Conversation> targets,
    required ChatMessage sourceMessage,
    required String senderId,
    required String senderName,
    required String forwardedFromLabel,
    String lang = 'en',
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
        lang: lang,
      );
    }
  }
}
