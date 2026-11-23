import 'dart:async';
import 'dart:math';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_core/firebase_core.dart';
import '../firebase_options.dart';
import '../models/models.dart';
import 'notification_service.dart';

class AdminChatService {
  AdminChatService._();
  static final AdminChatService instance = AdminChatService._();

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

  String getAdminConvId(String ownerUid) => _sanitizeId('admin_$ownerUid');

  RestaurantVerificationStatus _parseVerStatus(String? raw) {
    if (raw == 'approved') return RestaurantVerificationStatus.approved;
    if (raw == 'rejected') return RestaurantVerificationStatus.rejected;
    return RestaurantVerificationStatus.pending;
  }

  Future<void> createNewRestaurantOwnerNotification({
    required String ownerUid,
    required String restaurantName,
    required String ownerName,
  }) async {
    final safeOwner = _sanitizeId(ownerUid);
    final notifId = _sanitizeId('new_owner_$safeOwner');
    final conversationId = getAdminConvId(safeOwner);
    try {
      await db.collection('adminNotifications').doc(notifId).set({
        'type': 'newRestaurantOwner',
        'ownerUid': safeOwner,
        'restaurantName': _clampStr(restaurantName, 120).isNotEmpty
            ? _clampStr(restaurantName, 120)
            : 'New Restaurant',
        'ownerName': _clampStr(ownerName, 100).isNotEmpty
            ? _clampStr(ownerName, 100)
            : 'Owner',
        'conversationId': conversationId,
        'messagePreview':
            _clampStr('New application from $restaurantName', 240),
        'read': false,
        'createdAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });
    } catch (_) {
      // Non-fatal if doc already exists
    }
  }

  Future<void> createResubmittedNotification({
    required String ownerUid,
    required String restaurantName,
    required String ownerName,
  }) async {
    final safeOwner = _sanitizeId(ownerUid);
    final notifId =
        _sanitizeId('resub_${safeOwner}_${DateTime.now().millisecondsSinceEpoch}');
    final conversationId = getAdminConvId(safeOwner);
    await db.collection('adminNotifications').doc(notifId).set({
      'type': 'resubmittedRestaurantOwner',
      'ownerUid': safeOwner,
      'restaurantName': _clampStr(restaurantName, 120).isNotEmpty
          ? _clampStr(restaurantName, 120)
          : 'Restaurant',
      'ownerName': _clampStr(ownerName, 100).isNotEmpty
          ? _clampStr(ownerName, 100)
          : 'Owner',
      'conversationId': conversationId,
      'messagePreview': _clampStr(
        '$restaurantName updated & resubmitted application',
        240,
      ),
      'read': false,
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> createNewOwnerMessageNotification({
    required String ownerUid,
    required String restaurantName,
    required String ownerName,
    required String conversationId,
    required String messagePreview,
  }) async {
    final safeOwner = _sanitizeId(ownerUid);
    final rand = _rng.nextInt(9000) + 1000;
    final notifId = _sanitizeId(
      'msg_${safeOwner}_${DateTime.now().millisecondsSinceEpoch}_$rand',
    );
    try {
      await db.collection('adminNotifications').doc(notifId).set({
        'type': 'newOwnerMessage',
        'ownerUid': safeOwner,
        'restaurantName': _clampStr(restaurantName, 120).isNotEmpty
            ? _clampStr(restaurantName, 120)
            : 'Restaurant',
        'ownerName': _clampStr(ownerName, 100).isNotEmpty
            ? _clampStr(ownerName, 100)
            : 'Owner',
        'conversationId': _sanitizeId(conversationId),
        'messagePreview': _clampStr(messagePreview, 240),
        'read': false,
        'createdAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });
    } catch (_) {
      // Non-fatal
    }
  }

  AdminConversation _mapAdminConv(String id, Map<String, dynamic> data) {
    final msgTypeRaw = data['lastMessageType']?.toString();
    final lastMessageType = (msgTypeRaw == 'image' ||
            msgTypeRaw == 'file' ||
            msgTypeRaw == 'system')
        ? msgTypeRaw!
        : 'text';
    final senderRoleRaw = data['lastSenderRole']?.toString();
    final lastSenderRole = (senderRoleRaw == 'admin' || senderRoleRaw == 'system')
        ? senderRoleRaw!
        : 'owner';
    return AdminConversation(
      id: id,
      ownerUid: (data['ownerUid'] ?? '').toString(),
      ownerName: (data['ownerName'] ?? 'Owner').toString(),
      restaurantName: (data['restaurantName'] ?? 'Restaurant').toString(),
      restaurantLogoUrl: data['restaurantLogoUrl']?.toString(),
      verificationStatus:
          _parseVerStatus(data['verificationStatus']?.toString()),
      lastMessage: (data['lastMessage'] ?? '').toString(),
      lastMessageType: lastMessageType,
      lastSenderRole: lastSenderRole,
      lastMessageAt: _tsToIso(data['lastMessageAt']),
      ownerUnreadCount: (data['ownerUnreadCount'] as num?)?.toInt() ?? 0,
      adminUnreadCount: (data['adminUnreadCount'] as num?)?.toInt() ?? 0,
      ownerTyping: data['ownerTyping'] == true,
      adminTyping: data['adminTyping'] == true,
      createdAt: _tsToIso(data['createdAt']),
      updatedAt: _tsToIso(data['updatedAt']),
    );
  }

  Future<AdminConversation> ensureAdminConversationForOwner({
    required String ownerUid,
    required String ownerName,
    required String restaurantName,
    String? restaurantLogoUrl,
    RestaurantVerificationStatus verificationStatus =
        RestaurantVerificationStatus.pending,
    String? welcomeMessage,
  }) async {
    final safeOwner = _sanitizeId(ownerUid);
    final convId = getAdminConvId(safeOwner);
    final convRef = db.collection('adminConversations').doc(convId);

    final snap = await convRef.get();
    if (snap.exists && snap.data() != null) {
      return _mapAdminConv(snap.id, snap.data()!);
    }

    final initialLastMsg = _clampStr(
      welcomeMessage ??
          'Application submitted. Awaiting Ahar For All review.',
      500,
    );
    final logo = (restaurantLogoUrl != null && restaurantLogoUrl.length <= 245000)
        ? restaurantLogoUrl
        : null;

    final payload = <String, dynamic>{
      'ownerUid': safeOwner,
      'ownerName': _clampStr(ownerName, 100).isNotEmpty
          ? _clampStr(ownerName, 100)
          : 'Owner',
      'restaurantName': _clampStr(restaurantName, 120).isNotEmpty
          ? _clampStr(restaurantName, 120)
          : 'Restaurant',
      'restaurantLogoUrl': logo,
      'verificationStatus': verificationStatus.name,
      'lastMessage': initialLastMsg,
      'lastMessageType': 'system',
      'lastSenderRole': 'system',
      'lastMessageAt': FieldValue.serverTimestamp(),
      'ownerUnreadCount': 0,
      'adminUnreadCount': 0,
      'ownerTyping': false,
      'adminTyping': false,
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    };

    await convRef.set(payload);
    final fresh = await convRef.get();
    return _mapAdminConv(fresh.id, fresh.data() ?? payload);
  }

  Stream<List<AdminNotificationItem>> watchAdminNotifications() {
    return db
        .collection('adminNotifications')
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snap) {
      return snap.docs.map((d) {
        final data = d.data();
        final typeRaw = data['type']?.toString();
        final type = (typeRaw == 'resubmittedRestaurantOwner' ||
                typeRaw == 'newOwnerMessage')
            ? typeRaw!
            : 'newRestaurantOwner';
        return AdminNotificationItem(
          id: d.id,
          type: type,
          ownerUid: (data['ownerUid'] ?? '').toString(),
          restaurantName: (data['restaurantName'] ?? '').toString(),
          ownerName: (data['ownerName'] ?? '').toString(),
          conversationId: data['conversationId']?.toString(),
          messagePreview: data['messagePreview']?.toString(),
          read: data['read'] == true,
          createdAt: _tsToIso(data['createdAt']),
        );
      }).toList();
    });
  }

  Future<void> markAdminNotificationRead(String notificationId) async {
    await db
        .collection('adminNotifications')
        .doc(_sanitizeId(notificationId))
        .update({
      'read': true,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> markAllAdminNotificationsRead(
    List<AdminNotificationItem> items,
  ) async {
    final unread = items.where((n) => !n.read).take(100).toList();
    if (unread.isEmpty) return;
    final batch = db.batch();
    for (final item in unread) {
      batch.update(db.collection('adminNotifications').doc(item.id), {
        'read': true,
        'updatedAt': FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }

  Future<void> reviewRestaurantApplication({
    required String ownerUid,
    required String adminUid,
    required String decision, // 'approved' | 'rejected'
    String? rejectionReason,
    required String restaurantName,
    required String ownerName,
    String? restaurantLogoUrl,
    required String systemMessageText,
  }) async {
    final uid = _sanitizeId(ownerUid);
    final safeAdmin = _sanitizeId(adminUid);
    final nowIso = DateTime.now().toIso8601String();
    final safeNowIso = nowIso.length > 64 ? nowIso.substring(0, 64) : nowIso;
    final cleanReason = decision == 'rejected'
        ? (_clampStr(rejectionReason, 500).isNotEmpty
            ? _clampStr(rejectionReason, 500)
            : null)
        : null;

    await db.collection('users').doc(uid).update({
      'verified': decision == 'approved',
      'restaurant.verificationStatus': decision,
      'restaurant.rejectionReason': cleanReason,
      'restaurant.reviewedAt': safeNowIso,
      'restaurant.reviewedBy': safeAdmin,
      'updatedAt': FieldValue.serverTimestamp(),
    });

    try {
      await db.collection('userDirectory').doc(uid).update({
        'verified': decision == 'approved',
        'updatedAt': FieldValue.serverTimestamp(),
      });
    } catch (_) {
      // Non-fatal if userDirectory entry does not exist yet
    }

    final conv = await ensureAdminConversationForOwner(
      ownerUid: uid,
      ownerName: ownerName,
      restaurantName: restaurantName,
      restaurantLogoUrl: restaurantLogoUrl,
      verificationStatus: _parseVerStatus(decision),
    );

    final rand = _rng.nextInt(9000) + 1000;
    final msgId = _sanitizeId(
      'sys_${DateTime.now().millisecondsSinceEpoch}_$rand',
    );
    final cleanMsg = _clampStr(systemMessageText, 2000);

    await db
        .collection('adminConversations')
        .doc(conv.id)
        .collection('messages')
        .doc(msgId)
        .set({
      'conversationId': conv.id,
      'ownerUid': uid,
      'senderId': safeAdmin,
      'senderRole': 'system',
      'senderName': 'Ahar For All Team',
      'text': cleanMsg,
      'messageType': 'system',
      'status': 'sent',
      'readAt': null,
      'createdAt': FieldValue.serverTimestamp(),
    });

    await db.collection('adminConversations').doc(conv.id).update({
      'verificationStatus': decision,
      'lastMessage': _clampStr(cleanMsg, 500),
      'lastMessageType': 'system',
      'lastSenderRole': 'system',
      'lastMessageAt': FieldValue.serverTimestamp(),
      'ownerUnreadCount': FieldValue.increment(1),
      'updatedAt': FieldValue.serverTimestamp(),
    });

    try {
      final snap = await db
          .collection('adminNotifications')
          .where('ownerUid', isEqualTo: uid)
          .get();
      final batch = db.batch();
      var hasUpdates = false;
      for (final d in snap.docs) {
        final data = d.data();
        if (data['read'] != true &&
            (data['type'] == 'newRestaurantOwner' ||
                data['type'] == 'resubmittedRestaurantOwner')) {
          batch.update(d.reference, {
            'read': true,
            'updatedAt': FieldValue.serverTimestamp(),
          });
          hasUpdates = true;
        }
      }
      if (hasUpdates) await batch.commit();
    } catch (_) {
      // Non-fatal cleanup
    }

    unawaited(NotificationService.instance.createCrossUserNotification(
      recipientUid: uid,
      senderUid: safeAdmin,
      senderName: 'Ahar For All Team',
      type: 'restaurant_status',
      title: decision == 'approved'
          ? '$restaurantName is approved!'
          : 'Update on $restaurantName',
      titleBn: decision == 'approved'
          ? '$restaurantName অনুমোদিত হয়েছে!'
          : '$restaurantName আবেদনের আপডেট',
      body: _clampStr(systemMessageText, 300),
      bodyBn: _clampStr(systemMessageText, 300),
      conversationId: conv.id,
      linkTab: decision == 'approved' ? 'donor' : 'account',
    ));
  }

  Stream<List<AdminConversation>> watchAllAdminConversations() {
    return db
        .collection('adminConversations')
        .orderBy('lastMessageAt', descending: true)
        .snapshots()
        .map((snap) =>
            snap.docs.map((d) => _mapAdminConv(d.id, d.data())).toList());
  }

  Stream<AdminConversation?> watchMyAdminConversation(String ownerUid) {
    final convId = getAdminConvId(ownerUid);
    return db.collection('adminConversations').doc(convId).snapshots().map(
          (snap) => (snap.exists && snap.data() != null)
              ? _mapAdminConv(snap.id, snap.data()!)
              : null,
        );
  }

  Stream<List<AdminChatMessage>> watchAdminChatMessages(
    String conversationId,
    String ownerUid,
  ) {
    final safeConvId = _sanitizeId(conversationId);
    final safeOwnerUid = _sanitizeId(ownerUid);
    return db
        .collection('adminConversations')
        .doc(safeConvId)
        .collection('messages')
        .where('ownerUid', isEqualTo: safeOwnerUid)
        .snapshots()
        .map((snap) {
      final msgs = snap.docs.map((d) {
        final data = d.data();
        final sr = data['senderRole']?.toString();
        final senderRole = (sr == 'admin' || sr == 'system') ? sr! : 'owner';
        final mt = data['messageType']?.toString();
        final messageType =
            (mt == 'image' || mt == 'file' || mt == 'system') ? mt! : 'text';
        final status = data['status'] == 'read' ? 'read' : 'sent';
        return AdminChatMessage(
          id: d.id,
          conversationId: (data['conversationId'] ?? safeConvId).toString(),
          ownerUid: (data['ownerUid'] ?? safeOwnerUid).toString(),
          senderId: (data['senderId'] ?? '').toString(),
          senderRole: senderRole,
          senderName: (data['senderName'] ?? '').toString(),
          text: (data['text'] ?? '').toString(),
          messageType: messageType,
          mediaUrl: data['mediaUrl']?.toString(),
          fileName: data['fileName']?.toString(),
          fileSize: (data['fileSize'] as num?)?.toInt(),
          fileMime: data['fileMime']?.toString(),
          status: status,
          readAt: data['readAt'] != null ? _tsToIso(data['readAt']) : null,
          createdAt: _tsToIso(data['createdAt']),
        );
      }).toList()
        ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
      return msgs;
    });
  }

  Future<String> sendAdminChatMessage({
    required String conversationId,
    required String ownerUid,
    required String senderId,
    required String senderRole, // 'owner' | 'admin'
    required String senderName,
    required String restaurantName,
    required String ownerName,
    String? restaurantLogoUrl,
    RestaurantVerificationStatus verificationStatus =
        RestaurantVerificationStatus.pending,
    required String text,
    String messageType = 'text', // 'text' | 'image' | 'file'
    String? mediaUrl,
    String? fileName,
    int? fileSize,
    String? fileMime,
  }) async {
    final convId = _sanitizeId(conversationId);
    final safeOwner = _sanitizeId(ownerUid);

    await ensureAdminConversationForOwner(
      ownerUid: safeOwner,
      ownerName: ownerName,
      restaurantName: restaurantName,
      restaurantLogoUrl: restaurantLogoUrl,
      verificationStatus: verificationStatus,
    );

    final rand = _rng.nextInt(9000) + 1000;
    final msgId = _sanitizeId(
      'm_${DateTime.now().millisecondsSinceEpoch}_$rand',
    );
    final cleanText = _clampStr(text, 2000);
    final preview = cleanText.isNotEmpty
        ? cleanText
        : messageType == 'image'
            ? 'Photo attachment'
            : (fileName != null && fileName.isNotEmpty)
                ? 'File: $fileName'
                : 'New message';

    final msgPayload = <String, dynamic>{
      'conversationId': convId,
      'ownerUid': safeOwner,
      'senderId': _sanitizeId(senderId),
      'senderRole': senderRole,
      'senderName': _clampStr(senderName, 100).isNotEmpty
          ? _clampStr(senderName, 100)
          : (senderRole == 'admin' ? 'Ahar For All Team' : 'Owner'),
      'text': cleanText.isNotEmpty ? cleanText : preview,
      'messageType': messageType,
      'status': 'sent',
      'readAt': null,
      'createdAt': FieldValue.serverTimestamp(),
    };

    if (mediaUrl != null && mediaUrl.isNotEmpty) {
      msgPayload['mediaUrl'] =
          mediaUrl.length > 449000 ? mediaUrl.substring(0, 449000) : mediaUrl;
    }
    if (fileName != null && fileName.isNotEmpty) {
      msgPayload['fileName'] = _clampStr(fileName, 160);
    }
    if (fileSize != null) {
      msgPayload['fileSize'] = fileSize.clamp(0, 500000);
    }
    if (fileMime != null && fileMime.isNotEmpty) {
      msgPayload['fileMime'] = _clampStr(fileMime, 100);
    }

    await db
        .collection('adminConversations')
        .doc(convId)
        .collection('messages')
        .doc(msgId)
        .set(msgPayload);

    final convUpdates = <String, dynamic>{
      'lastMessage': _clampStr(preview, 500),
      'lastMessageType': messageType,
      'lastSenderRole': senderRole,
      'lastMessageAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
      if (senderRole == 'owner') ...{
        'adminUnreadCount': FieldValue.increment(1),
        'ownerTyping': false,
      } else ...{
        'ownerUnreadCount': FieldValue.increment(1),
        'adminTyping': false,
      },
    };

    await db.collection('adminConversations').doc(convId).update(convUpdates);

    if (senderRole == 'owner') {
      await createNewOwnerMessageNotification(
        ownerUid: safeOwner,
        restaurantName: restaurantName,
        ownerName: ownerName,
        conversationId: convId,
        messagePreview: preview,
      );
    }

    return msgId;
  }

  Future<void> markAdminConversationRead({
    required String conversationId,
    required String viewerUid,
    required String viewerRole, // 'owner' | 'admin'
    required List<AdminChatMessage> messages,
    required int unreadCount,
  }) async {
    final convId = _sanitizeId(conversationId);
    if (unreadCount > 0) {
      try {
        await db.collection('adminConversations').doc(convId).update({
          viewerRole == 'admin' ? 'adminUnreadCount' : 'ownerUnreadCount': 0,
          'updatedAt': FieldValue.serverTimestamp(),
        });
      } catch (_) {}
    }

    final peerSent = messages
        .where((m) => m.status == 'sent' && m.senderId != viewerUid)
        .toList();
    if (peerSent.isEmpty) return;

    final start = peerSent.length > 50 ? peerSent.length - 50 : 0;
    try {
      final batch = db.batch();
      for (final m in peerSent.sublist(start)) {
        batch.update(
          db
              .collection('adminConversations')
              .doc(convId)
              .collection('messages')
              .doc(m.id),
          {
            'status': 'read',
            'readAt': FieldValue.serverTimestamp(),
          },
        );
      }
      await batch.commit();
    } catch (_) {}
  }

  Future<void> setAdminChatTyping({
    required String conversationId,
    required String viewerRole,
    required bool isTyping,
  }) async {
    final convId = _sanitizeId(conversationId);
    try {
      await db.collection('adminConversations').doc(convId).update({
        viewerRole == 'admin' ? 'adminTyping' : 'ownerTyping': isTyping,
        'updatedAt': FieldValue.serverTimestamp(),
      });
    } catch (_) {}
  }
}
