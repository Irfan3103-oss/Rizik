import 'dart:async';
import 'dart:math';
import 'dart:typed_data';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import '../data/demo_personas.dart';
import '../firebase_options.dart';
import '../models/models.dart';
import 'firestore_error_helper.dart';
import 'messenger_service.dart';

class DemoSeedProgress {
  final String step;
  final int current;
  final int total;

  const DemoSeedProgress({
    required this.step,
    required this.current,
    required this.total,
  });
}

class DemoSeedErrorItem {
  final String step;
  final String code;
  final String message;

  const DemoSeedErrorItem({
    required this.step,
    required this.code,
    required this.message,
  });
}

class DemoSeedSummary {
  final int personasCreated;
  final int personasUpdated;
  final int personasTotal;
  final int roomsCreated;
  final int roomsUpdated;
  final int roomsTotal;
  final int messagesCreated;
  final int messagesAlreadyExisted;
  final int totalRoomMessages;
  final int verifiedPersonasCount;
  final int verifiedRoomsCount;
  final int verifiedMessagesCount;
  final List<DemoSeedErrorItem> errors;

  const DemoSeedSummary({
    required this.personasCreated,
    required this.personasUpdated,
    required this.personasTotal,
    required this.roomsCreated,
    required this.roomsUpdated,
    required this.roomsTotal,
    required this.messagesCreated,
    required this.messagesAlreadyExisted,
    required this.totalRoomMessages,
    required this.verifiedPersonasCount,
    required this.verifiedRoomsCount,
    required this.verifiedMessagesCount,
    required this.errors,
  });
}

class DemoRemoveResult {
  final int deletedPersonas;
  final int deletedMessages;
  final int deletedRooms;

  const DemoRemoveResult({
    required this.deletedPersonas,
    required this.deletedMessages,
    required this.deletedRooms,
  });
}

class RoomMessagesPage {
  final List<RoomMessage> messages;
  final bool hasMore;

  const RoomMessagesPage(this.messages, this.hasMore);
}

class CommunityRoomsService {
  CommunityRoomsService._();
  static final CommunityRoomsService instance = CommunityRoomsService._();

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
      return 'id_${DateTime.now().millisecondsSinceEpoch}';
    }
    return cleaned.length > 128 ? cleaned.substring(0, 128) : cleaned;
  }

  String _tsToIso(dynamic val) {
    if (val is Timestamp) return val.toDate().toIso8601String();
    if (val is String && val.isNotEmpty) return val;
    return DateTime.now().toIso8601String();
  }

  String _mapDirectoryRole(AppUser user) {
    if (user.isAdmin) return 'admin';
    if (user.accountType == AccountType.restaurantOwner) {
      return 'restaurantOwner';
    }
    if (user.role == UserRole.donor) return 'donor';
    return 'user';
  }

  String _parseDirectoryRole(dynamic raw) {
    final s = (raw ?? 'user').toString();
    const allowed = {
      'admin',
      'restaurantOwner',
      'donor',
      'recipient',
      'volunteer',
      'ngo',
      'organizer',
      'user',
    };
    return allowed.contains(s) ? s : 'user';
  }

  String _extractErrCode(Object err) {
    if (err is FirebaseException) return err.code;
    final msg = err.toString().toLowerCase();
    if (msg.contains('permission-denied')) return 'permission-denied';
    if (msg.contains('failed-precondition')) return 'failed-precondition';
    if (msg.contains('unavailable') || msg.contains('offline')) {
      return 'unavailable';
    }
    return 'unknown';
  }

  Future<DemoSeedSummary> seedAllDemoData(
    String adminUid, {
    void Function(DemoSeedProgress progress)? onProgress,
  }) async {
    final totalMsgsSpec =
        communityRoomSpecs.fold<int>(0, (sum, r) => sum + r.messages.length);
    final totalSteps =
        demoPersonas.length + communityRoomSpecs.length + totalMsgsSpec + 1;

    var completed = 0;
    var personasCreated = 0;
    var personasUpdated = 0;
    var roomsCreated = 0;
    var roomsUpdated = 0;
    var messagesCreated = 0;
    var messagesAlreadyExisted = 0;
    var totalRoomMessages = 0;
    var verifiedPersonasCount = 0;
    var verifiedRoomsCount = 0;
    var verifiedMessagesCount = 0;
    final errors = <DemoSeedErrorItem>[];

    void recordError(String step, Object err) {
      final code = _extractErrCode(err);
      final message = err.toString();
      debugPrint('[seedAllDemoData] $step ($code): $message');
      errors.add(DemoSeedErrorItem(step: step, code: code, message: message));
    }

    onProgress?.call(DemoSeedProgress(
      step: 'Checking existing demo profiles in Find People directory...',
      current: 0,
      total: totalSteps,
    ));

    // 1. Seed Demo Personas into userDirectory
    final existingDemoIds = <String>{};
    try {
      final existingDirSnap = await getDocsResilient(
        db.collection('userDirectory').where('isDemo', isEqualTo: true),
        db: db,
      );
      for (final d in existingDirSnap.docs) {
        existingDemoIds.add(d.id);
      }
    } catch (err) {
      recordError('Query existing demo personas', err);
      for (final p in demoPersonas) {
        try {
          final snap =
              await getDocResilient(db.collection('userDirectory').doc(p.id), db: db);
          if (snap.exists) existingDemoIds.add(p.id);
        } catch (innerErr) {
          recordError('Inspect persona ${p.id}', innerErr);
          break;
        }
      }
    }

    try {
      final dirBatch = db.batch();
      for (final persona in demoPersonas) {
        final entry = personaToDirectoryEntry(persona);
        final ref = db.collection('userDirectory').doc(persona.id);
        final payload = <String, dynamic>{
          'uid': persona.id,
          'displayName': _clampStr(entry.displayName, 100),
          'handle': _clampStr(entry.handle, 40),
          'photoURL': entry.photoURL,
          'role': entry.role,
          'restaurantName': entry.restaurantName != null
              ? _clampStr(entry.restaurantName, 120)
              : null,
          'restaurantType': entry.restaurantType != null
              ? _clampStr(entry.restaurantType, 40)
              : null,
          'area': _clampStr(entry.area, 80).isNotEmpty
              ? _clampStr(entry.area, 80)
              : 'Dhaka',
          'verified': entry.verified,
          'discoverable': true,
          'online': persona.online,
          'isDemo': true,
          'bio': _clampStr(persona.bio, 260),
          'bioBn': _clampStr(persona.bioBn, 340),
          'openingHours': persona.openingHours != null
              ? _clampStr(persona.openingHours, 80)
              : null,
          'rating': persona.rating,
          'reviewCount': persona.reviewCount,
          'lastSeen': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
        };

        if (existingDemoIds.contains(persona.id)) {
          dirBatch.update(ref, payload);
          personasUpdated += 1;
        } else {
          dirBatch.set(ref, {
            ...payload,
            'createdAt': FieldValue.serverTimestamp(),
          });
          personasCreated += 1;
        }
        completed += 1;
      }
      await dirBatch.commit();
    } catch (err) {
      recordError('Write demo personas to userDirectory', err);
      completed += demoPersonas.length;
    }

    onProgress?.call(DemoSeedProgress(
      step: 'Seeded $personasCreated new & updated $personasUpdated demo profiles',
      current: completed,
      total: totalSteps,
    ));

    // 2. Seed Rooms + Members + Messages
    for (final roomSpec in communityRoomSpecs) {
      final roomRef = db.collection('rooms').doc(roomSpec.id);
      var roomExists = false;
      var existingMuted = <dynamic>[];

      try {
        final roomSnap = await getDocResilient(roomRef, db: db);
        roomExists = roomSnap.exists;
        final mutedRaw = roomSnap.data()?['mutedUids'];
        if (roomExists && mutedRaw is List) {
          existingMuted = List<dynamic>.from(mutedRaw);
        }
      } catch (err) {
        recordError('Read room ${roomSpec.id}', err);
      }

      final roomPersonas = demoPersonas.where((p) {
        if (roomSpec.id == 'room_rizik_community') return true;
        if (roomSpec.id == 'room_restaurant_corner') {
          return p.role == 'restaurantOwner' ||
              p.role == 'organizer' ||
              p.role == 'ngo' ||
              p.id == 'demo_persona_vol_tanvir';
        }
        return p.role == 'volunteer' ||
            p.role == 'organizer' ||
            p.role == 'ngo' ||
            p.id == 'demo_persona_hotel_gulshan' ||
            p.id == 'demo_persona_rec_farhana';
      }).toList();

      final lastMsgSpec = roomSpec.messages.last;
      final lastSender = allDemoPersonasMap[lastMsgSpec.personaId];
      final nowMs = DateTime.now().millisecondsSinceEpoch;
      final lastMsgTs = Timestamp.fromMillisecondsSinceEpoch(
        nowMs - lastMsgSpec.offsetMinutesAgo * 60000,
      );

      var existingRealMembersCount = 0;
      var existingRealOnlineCount = 0;
      try {
        final existingRealMembersSnap = await getDocsResilient(
          db.collection('rooms').doc(roomSpec.id).collection('members'),
          db: db,
        );
        for (final d in existingRealMembersSnap.docs) {
          final m = d.data();
          if (m['isDemo'] != true) {
            existingRealMembersCount += 1;
            if (m['online'] == true) existingRealOnlineCount += 1;
          }
        }
      } catch (err) {
        recordError('Read members for ${roomSpec.id}', err);
      }

      final onlineDemoCount = roomPersonas.where((p) => p.online).length;
      final roomPayload = <String, dynamic>{
        'slug': roomSpec.slug,
        'name': _clampStr(roomSpec.name, 100),
        'nameBn': _clampStr(roomSpec.nameBn, 120),
        'description': _clampStr(roomSpec.description, 300),
        'descriptionBn': _clampStr(roomSpec.descriptionBn, 400),
        'iconKey': roomSpec.iconKey,
        'pinnedOrder': roomSpec.pinnedOrder,
        'memberCount': roomPersonas.length + existingRealMembersCount,
        'onlineCount': onlineDemoCount + existingRealOnlineCount,
        'lastMessage': _clampStr(lastMsgSpec.text, 500),
        'lastMessageSenderName':
            _clampStr(lastSender?.displayName ?? 'Rizik Member', 120),
        'lastMessageAt': lastMsgTs,
        'mutedUids': existingMuted,
        'isDemoSeeded': true,
        'updatedAt': FieldValue.serverTimestamp(),
      };

      try {
        if (roomExists) {
          await roomRef.update(roomPayload);
          roomsUpdated += 1;
        } else {
          await roomRef.set({
            ...roomPayload,
            'createdAt': FieldValue.serverTimestamp(),
          });
          roomsCreated += 1;
        }
      } catch (err) {
        recordError(
            '${roomExists ? 'Update' : 'Create'} room ${roomSpec.id}', err);
      }

      try {
        final memberBatch = db.batch();
        for (final p in roomPersonas) {
          memberBatch.set(
            db.collection('rooms').doc(roomSpec.id).collection('members').doc(p.id),
            {
              'uid': p.id,
              'displayName': _clampStr(p.displayName, 100),
              'handle': _clampStr(p.handle, 40),
              'photoURL': p.avatar,
              'role': p.role,
              'area': _clampStr(p.area, 80),
              'online': p.online,
              'isDemo': true,
              'lastMessageAt': null,
              'updatedAt': FieldValue.serverTimestamp(),
            },
          );
        }
        await memberBatch.commit();
      } catch (err) {
        recordError('Seed members for ${roomSpec.id}', err);
      }
      completed += 1;

      final existingMsgIds = <String>{};
      try {
        final existingMsgsSnap = await getDocsResilient(
          db.collection('rooms').doc(roomSpec.id).collection('messages'),
          db: db,
        );
        for (final d in existingMsgsSnap.docs) {
          existingMsgIds.add(d.id);
        }
      } catch (err) {
        recordError('Read existing messages for ${roomSpec.id}', err);
      }

      final pendingMsgs = <({String id, Map<String, dynamic> data})>[];
      for (final msgSpec in roomSpec.messages) {
        totalRoomMessages += 1;
        final msgId = _sanitizeId('seed_${roomSpec.id}_${msgSpec.idSuffix}');
        if (existingMsgIds.contains(msgId)) {
          messagesAlreadyExisted += 1;
          completed += 1;
          continue;
        }

        final sender = allDemoPersonasMap[msgSpec.personaId];
        if (sender != null) {
          final replySpec = msgSpec.replyToSuffix != null
              ? roomSpec.messages
                  .where((x) => x.idSuffix == msgSpec.replyToSuffix)
                  .firstOrNull
              : null;
          final replySender = replySpec != null
              ? allDemoPersonasMap[replySpec.personaId]
              : null;

          pendingMsgs.add((
            id: msgId,
            data: {
              'roomId': roomSpec.id,
              'senderId': sender.id,
              'senderName': _clampStr(sender.displayName, 120),
              'senderHandle': _clampStr(sender.handle, 40),
              'senderAvatar': sender.avatar,
              'senderRole': sender.role,
              'senderArea': _clampStr(sender.area, 80),
              'senderVerified': sender.verified,
              'senderIsDemo': true,
              'text': _clampStr(msgSpec.text, 2000),
              'messageType': 'text',
              'mediaUrl': null,
              'replyToId': msgSpec.replyToSuffix != null
                  ? _sanitizeId('seed_${roomSpec.id}_${msgSpec.replyToSuffix}')
                  : null,
              'replyToText':
                  replySpec != null ? _clampStr(replySpec.text, 200) : null,
              'replyToSenderName': replySender != null
                  ? _clampStr(replySender.displayName, 120)
                  : null,
              'reactions': msgSpec.reactions ?? <String, dynamic>{},
              'reportedBy': <String>[],
              'deleted': false,
              'isDemo': true,
              'createdAt': Timestamp.fromMillisecondsSinceEpoch(
                nowMs - msgSpec.offsetMinutesAgo * 60000,
              ),
            },
          ));
        }
        completed += 1;
      }

      for (var i = 0; i < pendingMsgs.length; i += 150) {
        final end =
            (i + 150) > pendingMsgs.length ? pendingMsgs.length : i + 150;
        final chunk = pendingMsgs.sublist(i, end);
        final batch = db.batch();
        for (final item in chunk) {
          batch.set(
            db
                .collection('rooms')
                .doc(roomSpec.id)
                .collection('messages')
                .doc(item.id),
            item.data,
          );
        }
        try {
          await batch.commit();
          messagesCreated += chunk.length;
        } catch (err) {
          recordError('Write messages for ${roomSpec.id}', err);
        }
      }

      onProgress?.call(DemoSeedProgress(
        step: 'Seeded ${roomSpec.name} (${roomSpec.messages.length} messages checked)',
        current: completed,
        total: totalSteps,
      ));
    }

    // 3. Post-seed Read-Back Verification
    onProgress?.call(DemoSeedProgress(
      step: 'Verifying seeded personas, rooms, and messages in Firestore...',
      current: completed,
      total: totalSteps,
    ));

    try {
      final verifyDirSnap = await getDocsResilient(
        db.collection('userDirectory').where('isDemo', isEqualTo: true),
        db: db,
      );
      verifiedPersonasCount = verifyDirSnap.size;
    } catch (err) {
      recordError('Verify seeded personas read-back', err);
    }

    try {
      final verifyRoomsSnap =
          await getDocsResilient(db.collection('rooms'), db: db);
      verifiedRoomsCount = verifyRoomsSnap.size;
      for (final roomSpec in communityRoomSpecs) {
        final verifyMsgsSnap = await getDocsResilient(
          db.collection('rooms').doc(roomSpec.id).collection('messages'),
          db: db,
        );
        verifiedMessagesCount += verifyMsgsSnap.size;
      }
    } catch (err) {
      recordError('Verify seeded rooms & messages read-back', err);
    }

    onProgress?.call(DemoSeedProgress(
      step: 'Verification complete',
      current: totalSteps,
      total: totalSteps,
    ));

    return DemoSeedSummary(
      personasCreated: personasCreated,
      personasUpdated: personasUpdated,
      personasTotal: demoPersonas.length,
      roomsCreated: roomsCreated,
      roomsUpdated: roomsUpdated,
      roomsTotal: communityRoomSpecs.length,
      messagesCreated: messagesCreated,
      messagesAlreadyExisted: messagesAlreadyExisted,
      totalRoomMessages: totalRoomMessages,
      verifiedPersonasCount: verifiedPersonasCount,
      verifiedRoomsCount: verifiedRoomsCount,
      verifiedMessagesCount: verifiedMessagesCount,
      errors: errors,
    );
  }

  Future<DemoRemoveResult> removeAllDemoData({
    void Function(DemoSeedProgress progress)? onProgress,
  }) async {
    var deletedPersonas = 0;
    var deletedMessages = 0;
    var deletedRooms = 0;

    onProgress?.call(const DemoSeedProgress(
      step: 'Removing demo profiles...',
      current: 1,
      total: 4,
    ));

    QuerySnapshot<Map<String, dynamic>>? demoDirSnap;
    try {
      demoDirSnap = await db
          .collection('userDirectory')
          .where('isDemo', isEqualTo: true)
          .get();
    } catch (_) {}

    final idsToDelete = <String>{for (final p in demoPersonas) p.id};
    if (demoDirSnap != null) {
      for (final d in demoDirSnap.docs) {
        idsToDelete.add(d.id);
      }
    }

    final dirList = idsToDelete.toList();
    for (var i = 0; i < dirList.length; i += 250) {
      final end = (i + 250) > dirList.length ? dirList.length : i + 250;
      final batch = db.batch();
      for (final id in dirList.sublist(i, end)) {
        batch.delete(db.collection('userDirectory').doc(id));
        deletedPersonas += 1;
      }
      try {
        await batch.commit();
      } catch (_) {}
    }

    onProgress?.call(const DemoSeedProgress(
      step: 'Cleaning community rooms...',
      current: 2,
      total: 4,
    ));

    QuerySnapshot<Map<String, dynamic>>? roomsSnap;
    try {
      roomsSnap = await db.collection('rooms').get();
    } catch (_) {}

    final roomIds = <String>{for (final r in communityRoomSpecs) r.id};
    if (roomsSnap != null) {
      for (final d in roomsSnap.docs) {
        if (d.data()['isDemoSeeded'] == true) roomIds.add(d.id);
      }
    }

    for (final roomId in roomIds) {
      QuerySnapshot<Map<String, dynamic>>? msgsSnap;
      try {
        msgsSnap =
            await db.collection('rooms').doc(roomId).collection('messages').get();
      } catch (_) {}

      final demoMsgDocs =
          msgsSnap?.docs.where((d) => d.data()['isDemo'] == true).toList() ?? [];
      final realMsgDocs =
          msgsSnap?.docs.where((d) => d.data()['isDemo'] != true).toList() ?? [];

      for (var i = 0; i < demoMsgDocs.length; i += 250) {
        final end =
            (i + 250) > demoMsgDocs.length ? demoMsgDocs.length : i + 250;
        final batch = db.batch();
        for (final mDoc in demoMsgDocs.sublist(i, end)) {
          batch.delete(mDoc.reference);
          deletedMessages += 1;
        }
        await batch.commit();
      }

      QuerySnapshot<Map<String, dynamic>>? memSnap;
      try {
        memSnap =
            await db.collection('rooms').doc(roomId).collection('members').get();
      } catch (_) {}

      final demoMemDocs =
          memSnap?.docs.where((d) => d.data()['isDemo'] == true).toList() ?? [];
      final realMemDocs =
          memSnap?.docs.where((d) => d.data()['isDemo'] != true).toList() ?? [];

      for (var i = 0; i < demoMemDocs.length; i += 250) {
        final end =
            (i + 250) > demoMemDocs.length ? demoMemDocs.length : i + 250;
        final batch = db.batch();
        for (final mDoc in demoMemDocs.sublist(i, end)) {
          batch.delete(mDoc.reference);
        }
        await batch.commit();
      }

      if (realMsgDocs.isEmpty) {
        try {
          await db.collection('rooms').doc(roomId).delete();
          deletedRooms += 1;
        } catch (_) {}
      } else {
        realMsgDocs.sort((a, b) => _tsToIso(b.data()['createdAt'])
            .compareTo(_tsToIso(a.data()['createdAt'])));
        final latest = realMsgDocs.first.data();
        try {
          await db.collection('rooms').doc(roomId).update({
            'isDemoSeeded': false,
            'memberCount': realMemDocs.length,
            'onlineCount':
                realMemDocs.where((d) => d.data()['online'] == true).length,
            'lastMessage': _clampStr(latest['text']?.toString(), 500),
            'lastMessageSenderName': _clampStr(
              latest['senderName']?.toString() ?? 'Member',
              120,
            ),
            'lastMessageAt': latest['createdAt'] ?? FieldValue.serverTimestamp(),
            'updatedAt': FieldValue.serverTimestamp(),
          });
        } catch (_) {}
      }
    }

    onProgress?.call(const DemoSeedProgress(
      step: 'Demo cleanup complete',
      current: 4,
      total: 4,
    ));

    return DemoRemoveResult(
      deletedPersonas: deletedPersonas,
      deletedMessages: deletedMessages,
      deletedRooms: deletedRooms,
    );
  }

  CommunityRoom _mapCommunityRoomDoc(String id, Map<String, dynamic> data) {
    final iconRaw = (data['iconKey'] ?? 'community').toString();
    final iconKey =
        (iconRaw == 'restaurant' || iconRaw == 'volunteer') ? iconRaw : 'community';
    return CommunityRoom(
      id: id,
      slug: (data['slug'] ?? id).toString(),
      name: (data['name'] ?? 'Rizik Community').toString(),
      nameBn: (data['nameBn'] ?? data['name'] ?? 'রিজিক কমিউনিটি').toString(),
      description: (data['description'] ?? '').toString(),
      descriptionBn:
          (data['descriptionBn'] ?? data['description'] ?? '').toString(),
      iconKey: iconKey,
      pinnedOrder: (data['pinnedOrder'] as num?)?.toInt() ?? 0,
      memberCount: (data['memberCount'] as num?)?.toInt() ?? 0,
      onlineCount: (data['onlineCount'] as num?)?.toInt() ?? 0,
      lastMessage: (data['lastMessage'] ?? '').toString(),
      lastMessageSenderName: (data['lastMessageSenderName'] ?? '').toString(),
      lastMessageAt: _tsToIso(data['lastMessageAt'] ?? data['updatedAt']),
      mutedUids:
          (data['mutedUids'] as List?)?.map((e) => e.toString()).toList() ?? [],
      isDemoSeeded: data['isDemoSeeded'] == true,
      createdAt: _tsToIso(data['createdAt']),
      updatedAt: _tsToIso(data['updatedAt']),
    );
  }

  Stream<List<CommunityRoom>> watchCommunityRooms({
    void Function(FirestoreListenerError err)? onError,
  }) {
    late StreamController<List<CommunityRoom>> controller;
    StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? sub;
    var usingFallback = false;

    void attachFallback() {
      if (usingFallback || controller.isClosed) return;
      usingFallback = true;
      sub?.cancel();
      sub = db.collection('rooms').snapshots().listen(
        (snap) {
          final rooms = snap.docs
              .map((d) => _mapCommunityRoomDoc(d.id, d.data()))
              .toList()
            ..sort((a, b) => a.pinnedOrder.compareTo(b.pinnedOrder));
          if (!controller.isClosed) controller.add(rooms);
        },
        onError: (e, st) {
          final parsed = parseFirestoreListenerError(e, 'LIST', 'rooms');
          onError?.call(parsed);
          if (!controller.isClosed) controller.addError(parsed, st);
        },
      );
    }

    controller = StreamController<List<CommunityRoom>>(
      onListen: () {
        sub = db
            .collection('rooms')
            .orderBy('pinnedOrder', descending: false)
            .snapshots()
            .listen(
          (snap) {
            final rooms = snap.docs
                .map((d) => _mapCommunityRoomDoc(d.id, d.data()))
                .toList();
            if (!controller.isClosed) controller.add(rooms);
          },
          onError: (e, st) {
            final parsed = parseFirestoreListenerError(e, 'LIST', 'rooms');
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

  RoomMessage _mapRoomMessageDoc(
    String id,
    Map<String, dynamic> data,
    String safeRoomId,
  ) {
    final reactions = <String, List<String>>{};
    final rawReact = data['reactions'];
    if (rawReact is Map) {
      rawReact.forEach((k, v) {
        if (v is List) {
          reactions[k.toString()] = v.map((e) => e.toString()).toList();
        }
      });
    }

    return RoomMessage(
      id: id,
      roomId: (data['roomId'] ?? safeRoomId).toString(),
      senderId: (data['senderId'] ?? '').toString(),
      senderName: (data['senderName'] ?? 'Member').toString(),
      senderHandle: data['senderHandle']?.toString(),
      senderAvatar: data['senderAvatar']?.toString(),
      senderRole: _parseDirectoryRole(data['senderRole']),
      senderArea: data['senderArea']?.toString(),
      senderVerified: data['senderVerified'] == true,
      senderIsDemo: data['senderIsDemo'] == true,
      text: (data['text'] ?? '').toString(),
      messageType: data['messageType'] == 'image' ? 'image' : 'text',
      mediaUrl: data['mediaUrl']?.toString(),
      replyToId: data['replyToId']?.toString(),
      replyToText: data['replyToText']?.toString(),
      replyToSenderName: data['replyToSenderName']?.toString(),
      reactions: reactions,
      reportedBy:
          (data['reportedBy'] as List?)?.map((e) => e.toString()).toList() ?? [],
      deleted: data['deleted'] == true,
      isDemo: data['isDemo'] == true,
      createdAt: _tsToIso(data['createdAt']),
    );
  }

  Stream<RoomMessagesPage> watchRoomMessages(
    String roomId, {
    int pageSize = 40,
    void Function(FirestoreListenerError err)? onError,
  }) {
    final safeRoomId = _sanitizeId(roomId);
    final safeLimit = pageSize < 20 ? 20 : pageSize;
    late StreamController<RoomMessagesPage> controller;
    StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? sub;
    var usingFallback = false;

    void attachFallback() {
      if (usingFallback || controller.isClosed) return;
      usingFallback = true;
      sub?.cancel();
      sub = db
          .collection('rooms')
          .doc(safeRoomId)
          .collection('messages')
          .snapshots()
          .listen(
        (snap) {
          final list = snap.docs
              .map((d) => _mapRoomMessageDoc(d.id, d.data(), safeRoomId))
              .toList()
            ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
          final hasMore = list.length > safeLimit;
          final sliced = hasMore ? list.sublist(list.length - safeLimit) : list;
          if (!controller.isClosed) {
            controller.add(RoomMessagesPage(sliced, hasMore));
          }
        },
        onError: (e, st) {
          final parsed = parseFirestoreListenerError(
            e,
            'LIST',
            'rooms/$safeRoomId/messages',
          );
          onError?.call(parsed);
          if (!controller.isClosed) controller.addError(parsed, st);
        },
      );
    }

    controller = StreamController<RoomMessagesPage>(
      onListen: () {
        sub = db
            .collection('rooms')
            .doc(safeRoomId)
            .collection('messages')
            .orderBy('createdAt', descending: true)
            .limit(safeLimit)
            .snapshots()
            .listen(
          (snap) {
            final list = snap.docs
                .map((d) => _mapRoomMessageDoc(d.id, d.data(), safeRoomId))
                .toList()
              ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
            if (!controller.isClosed) {
              controller.add(RoomMessagesPage(list, snap.docs.length >= safeLimit));
            }
          },
          onError: (e, st) {
            final parsed = parseFirestoreListenerError(
              e,
              'LIST',
              'rooms/$safeRoomId/messages',
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

  Stream<List<RoomMember>> watchRoomMembers(
    String roomId, {
    void Function(FirestoreListenerError err)? onError,
  }) {
    final safeRoomId = _sanitizeId(roomId);
    return db
        .collection('rooms')
        .doc(safeRoomId)
        .collection('members')
        .limit(120)
        .snapshots()
        .map((snap) {
      final members = snap.docs.map((d) {
        final data = d.data();
        return RoomMember(
          uid: (data['uid'] ?? d.id).toString(),
          displayName: (data['displayName'] ?? 'Member').toString(),
          handle: data['handle']?.toString(),
          photoURL: data['photoURL']?.toString(),
          role: _parseDirectoryRole(data['role']),
          area: data['area']?.toString(),
          online: data['online'] == true,
          isDemo: data['isDemo'] == true,
          lastMessageAt:
              data['lastMessageAt'] != null ? _tsToIso(data['lastMessageAt']) : null,
          updatedAt: _tsToIso(data['updatedAt']),
        );
      }).toList()
        ..sort((a, b) {
          if (a.online != b.online) return a.online ? -1 : 1;
          return a.displayName.compareTo(b.displayName);
        });
      return members;
    }).handleError((e) {
      final parsed = parseFirestoreListenerError(
        e,
        'LIST',
        'rooms/$safeRoomId/members',
      );
      onError?.call(parsed);
      throw parsed;
    });
  }

  Future<({bool ok, String action, String? error})> ensureRoomMemberPresence(
    String roomId,
    AppUser user, {
    bool online = true,
  }) async {
    final safeRoomId = _sanitizeId(roomId);
    final uid = _sanitizeId(user.id);
    final memberRef =
        db.collection('rooms').doc(safeRoomId).collection('members').doc(uid);

    final displayName = user.accountType == AccountType.restaurantOwner
        ? _clampStr(
            user.restaurant?.restaurantName ??
                user.donorProfile?.businessName ??
                user.name,
            100,
          )
        : _clampStr(user.name, 100);
    final handle = _clampStr(
      user.handle ?? MessengerService.instance.generatePublicHandle(displayName, uid),
      40,
    );
    final rawAvatar = user.restaurant?.restaurantPhotoUrl ??
        user.donorProfile?.logoUrl ??
        user.photoURL;
    final avatar =
        (rawAvatar != null && rawAvatar.length <= 248000) ? rawAvatar : null;

    try {
      final snap = await getDocResilient(memberRef, db: db);
      final payload = <String, dynamic>{
        'uid': uid,
        'displayName':
            displayName.isNotEmpty ? displayName : 'Community Member',
        'handle': handle,
        'photoURL': avatar,
        'role': _mapDirectoryRole(user),
        'area':
            _clampStr(user.area, 80).isNotEmpty ? _clampStr(user.area, 80) : 'Dhaka',
        'online': online,
        'isDemo': false,
        'updatedAt': FieldValue.serverTimestamp(),
      };
      if (snap.exists) {
        await memberRef.update(payload);
        return (ok: true, action: 'updated', error: null);
      } else {
        await memberRef.set({...payload, 'lastMessageAt': null});
        return (ok: true, action: 'created', error: null);
      }
    } catch (err) {
      debugPrint(
        '[CommunityRoomsService] Failed syncing member presence in $safeRoomId: $err',
      );
      return (ok: false, action: 'error', error: err.toString());
    }
  }

  Future<void> sendRoomMessage({
    required CommunityRoom room,
    required AppUser user,
    required String text,
    Uint8List? imageBytes,
    String? mediaUrlFallback,
    RoomMessage? replyTo,
  }) async {
    final roomId = _sanitizeId(room.id);
    final myUid = _sanitizeId(user.id);
    final trimmed = _clampStr(text, 2000);
    if (trimmed.isEmpty && imageBytes == null && mediaUrlFallback == null) {
      return;
    }
    if (room.mutedUids.contains(myUid)) {
      throw Exception('You are currently muted in this room by a moderator.');
    }

    String? mediaUrl = mediaUrlFallback;
    if (imageBytes != null) {
      final uploaded = await MessengerService.instance.uploadChatMediaBytes(
        conversationId: roomId,
        senderId: myUid,
        bytes: imageBytes,
        fileName: 'room_img_${DateTime.now().millisecondsSinceEpoch}.jpg',
        contentType: 'image/jpeg',
      );
      if (uploaded != null) mediaUrl = uploaded;
    }
    if (mediaUrl != null && mediaUrl.length > 445000) {
      mediaUrl = null;
    }

    final messageType = mediaUrl != null ? 'image' : 'text';
    final cleanText =
        trimmed.isNotEmpty ? trimmed : (messageType == 'image' ? '📷 Shared a photo' : 'Message');

    final senderName = user.accountType == AccountType.restaurantOwner
        ? _clampStr(
            user.restaurant?.restaurantName ??
                user.donorProfile?.businessName ??
                user.name,
            120,
          )
        : (_clampStr(user.name, 120).isNotEmpty
            ? _clampStr(user.name, 120)
            : 'Community Member');
    final senderHandle = _clampStr(
      user.handle ?? MessengerService.instance.generatePublicHandle(senderName, myUid),
      40,
    );
    final rawAvatar = user.restaurant?.restaurantPhotoUrl ??
        user.donorProfile?.logoUrl ??
        user.photoURL;
    final senderAvatar =
        (rawAvatar != null && rawAvatar.length <= 248000) ? rawAvatar : null;

    final rand = _rng.nextInt(90000) + 10000;
    final msgId = _sanitizeId('rm_${DateTime.now().millisecondsSinceEpoch}_$rand');

    final batch = db.batch();
    batch.set(
      db.collection('rooms').doc(roomId).collection('messages').doc(msgId),
      {
        'roomId': roomId,
        'senderId': myUid,
        'senderName': senderName,
        'senderHandle': senderHandle,
        'senderAvatar': senderAvatar,
        'senderRole': _mapDirectoryRole(user),
        'senderArea':
            _clampStr(user.area, 80).isNotEmpty ? _clampStr(user.area, 80) : 'Dhaka',
        'senderVerified': user.verified,
        'senderIsDemo': false,
        'text': cleanText,
        'messageType': messageType,
        'mediaUrl': mediaUrl,
        'replyToId': replyTo != null ? _sanitizeId(replyTo.id) : null,
        'replyToText': replyTo != null ? _clampStr(replyTo.text, 200) : null,
        'replyToSenderName':
            replyTo != null ? _clampStr(replyTo.senderName, 120) : null,
        'reactions': <String, dynamic>{},
        'reportedBy': <String>[],
        'deleted': false,
        'isDemo': false,
        'createdAt': FieldValue.serverTimestamp(),
      },
    );

    batch.set(
      db.collection('rooms').doc(roomId).collection('members').doc(myUid),
      {
        'uid': myUid,
        'displayName': _clampStr(senderName, 100),
        'handle': senderHandle,
        'photoURL': senderAvatar,
        'role': _mapDirectoryRole(user),
        'area':
            _clampStr(user.area, 80).isNotEmpty ? _clampStr(user.area, 80) : 'Dhaka',
        'online': true,
        'isDemo': false,
        'lastMessageAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      },
    );

    batch.update(db.collection('rooms').doc(roomId), {
      'lastMessage': _clampStr(
          messageType == 'image' && trimmed.isEmpty ? '📷 Photo' : cleanText, 500),
      'lastMessageSenderName': senderName,
      'lastMessageAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });

    await batch.commit();
  }

  Future<void> toggleRoomMessageReaction(
    String roomId,
    RoomMessage message,
    String myUid,
    String emoji,
  ) async {
    final safeRoom = _sanitizeId(roomId);
    final safeUid = _sanitizeId(myUid);
    final current = message.reactions[emoji] ?? <String>[];
    final next = current.contains(safeUid)
        ? current.where((u) => u != safeUid).toList()
        : [...current, safeUid];

    await db
        .collection('rooms')
        .doc(safeRoom)
        .collection('messages')
        .doc(message.id)
        .update({'reactions.$emoji': next});
  }

  Future<void> reportRoomMessage({
    required String roomId,
    required RoomMessage message,
    required String reporterUid,
    required String reason,
    String? details,
  }) async {
    final safeRoom = _sanitizeId(roomId);
    final safeReporter = _sanitizeId(reporterUid);
    final rand = _rng.nextInt(90000) + 10000;
    final reportId =
        _sanitizeId('rrep_${DateTime.now().millisecondsSinceEpoch}_$rand');

    final batch = db.batch();
    batch.update(
      db.collection('rooms').doc(safeRoom).collection('messages').doc(message.id),
      {
        'reportedBy': FieldValue.arrayUnion([safeReporter]),
      },
    );
    batch.set(db.collection('reports').doc(reportId), {
      'reporterId': safeReporter,
      'targetUserId': _sanitizeId(message.senderId),
      'targetName': _clampStr(message.senderName, 120),
      'roomId': safeRoom,
      'messageId': _sanitizeId(message.id),
      'reason': _clampStr(reason, 120).isNotEmpty
          ? _clampStr(reason, 120)
          : 'Inappropriate room message',
      'details': (details != null && _clampStr(details, 1000).isNotEmpty)
          ? _clampStr(details, 1000)
          : _clampStr(message.text, 400),
      'status': 'open',
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
    await batch.commit();
  }

  Future<void> adminSetRoomMessageDeleted(
    String roomId,
    String messageId,
    bool deleted,
  ) async {
    await db
        .collection('rooms')
        .doc(_sanitizeId(roomId))
        .collection('messages')
        .doc(_sanitizeId(messageId))
        .update({'deleted': deleted});
  }

  Future<void> adminToggleMuteUserInRoom(
    String roomId,
    String targetUid,
    bool mute,
  ) async {
    final safeTarget = _sanitizeId(targetUid);
    await db.collection('rooms').doc(_sanitizeId(roomId)).update({
      'mutedUids': mute
          ? FieldValue.arrayUnion([safeTarget])
          : FieldValue.arrayRemove([safeTarget]),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }
}
