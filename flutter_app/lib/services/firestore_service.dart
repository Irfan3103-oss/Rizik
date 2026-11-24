import 'dart:async';
import 'dart:math';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb_auth;
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import '../firebase_options.dart';
import '../models/models.dart';
import 'admin_chat_service.dart';
import 'firestore_error_helper.dart';
import 'messenger_service.dart';
import 'notification_service.dart';

class FirestoreService {
  FirestoreService._();
  static final FirestoreService instance = FirestoreService._();

  final Map<String, Future<AppUser>> _inFlightProfileSync = {};
  final Random _rng = Random();

  FirebaseFirestore get db => FirebaseFirestore.instanceFor(
        app: Firebase.app(),
        databaseId: DefaultFirebaseOptions.firestoreDatabaseId,
      );

  String _clampStr(String? val, int maxLen) {
    final trimmed = (val ?? '').trim();
    return trimmed.length <= maxLen ? trimmed : trimmed.substring(0, maxLen);
  }

  String _tsToIso(dynamic v) {
    if (v is Timestamp) return v.toDate().toIso8601String();
    if (v is String && v.isNotEmpty) return v;
    return DateTime.now().toIso8601String();
  }

  String _sanitizeId(String raw) {
    final cleaned = raw.replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '_');
    if (cleaned.isEmpty) {
      return 'id_${DateTime.now().millisecondsSinceEpoch}';
    }
    return cleaned.length > 128 ? cleaned.substring(0, 128) : cleaned;
  }

  static const Map<FoodCategory, String> _categoryImages = {
    FoodCategory.cooked: '/images/kacchi-biryani.jpg',
    FoodCategory.bakery: '/images/dhaka-bakery-bread.jpg',
    FoodCategory.produce: '/images/dhaka-vegetables.jpg',
    FoodCategory.packaged: '/images/rice-dal-bhorta.jpg',
  };

  Future<bool> checkIsAdmin(
    fb_auth.User? fbUser, {
    bool forceRefresh = false,
  }) async {
    if (fbUser == null || !fbUser.emailVerified) return false;
    final email = fbUser.email?.toLowerCase() ?? '';
    if (email == 'sheikhsahel513@gmail.com') return false;

    try {
      var tokenResult = await fbUser.getIdTokenResult(forceRefresh);
      if (fbUser.emailVerified && tokenResult.claims?['email_verified'] != true) {
        tokenResult = await fbUser.getIdTokenResult(true);
      }
      if (tokenResult.claims?['admin'] == true) return true;
    } catch (_) {}

    if (email == 'jafor05101007@student.ndub.edu.bd') return true;

    try {
      final adminDoc =
          await getDocResilient(db.collection('admins').doc(fbUser.uid), db: db);
      if (adminDoc.exists) {
        if (adminDoc.data()?['enabled'] == false) return false;
        return true;
      }
    } catch (_) {}

    try {
      await getDocResilient(db.collection('admins').doc('adminverify'), db: db);
      return true;
    } catch (_) {
      return false;
    }
  }

  Map<String, dynamic> _sanitizeRestaurant(
    RestaurantInfo r, {
    String? verificationStatus,
    String? rejectionReason,
    String? submittedAt,
    String? reviewedAt,
    String? reviewedBy,
    bool clearReview = false,
  }) {
    final safePhoto = (r.restaurantPhotoUrl != null &&
            r.restaurantPhotoUrl!.length <= 248000)
        ? r.restaurantPhotoUrl
        : null;
    final safeLicense =
        (r.licensePhotoUrl != null && r.licensePhotoUrl!.length <= 248000)
            ? r.licensePhotoUrl
            : null;
    final nowIso = DateTime.now().toIso8601String();
    final safeSubmitted = submittedAt ?? r.submittedAt ?? nowIso;

    return {
      'restaurantName': _clampStr(r.restaurantName, 120),
      'ownerName': _clampStr(r.ownerName, 100),
      'phone': _clampStr(r.phone, 32),
      'email': r.email != null && r.email!.isNotEmpty
          ? _clampStr(r.email, 160)
          : null,
      'address': _clampStr(r.address, 240),
      'area': _clampStr(r.area, 80).isNotEmpty
          ? _clampStr(r.area, 80)
          : 'Dhanmondi',
      'city':
          _clampStr(r.city, 80).isNotEmpty ? _clampStr(r.city, 80) : 'Dhaka',
      'lat': r.lat.clamp(-90.0, 90.0),
      'lng': r.lng.clamp(-180.0, 180.0),
      'restaurantType': r.restaurantType.isNotEmpty
          ? r.restaurantType
          : 'restaurant',
      'tradeLicenseNumber': r.tradeLicenseNumber != null &&
              r.tradeLicenseNumber!.isNotEmpty
          ? _clampStr(r.tradeLicenseNumber, 80)
          : null,
      'restaurantPhotoUrl': safePhoto,
      'licensePhotoUrl': safeLicense,
      'openingHours': _clampStr(r.openingHours, 80).isNotEmpty
          ? _clampStr(r.openingHours, 80)
          : '9:00 AM - 10:00 PM',
      'approxDailySurplus': r.approxDailySurplus != null &&
              r.approxDailySurplus!.isNotEmpty
          ? _clampStr(r.approxDailySurplus, 100)
          : null,
      'acceptedSafetyTerms': true,
      'verificationStatus': verificationStatus ?? r.verificationStatus.name,
      'rejectionReason': clearReview
          ? null
          : (rejectionReason ?? r.rejectionReason) != null
              ? _clampStr(rejectionReason ?? r.rejectionReason, 500)
              : null,
      'submittedAt': safeSubmitted.length > 64
          ? safeSubmitted.substring(0, 64)
          : safeSubmitted,
      'reviewedAt': clearReview ? null : (reviewedAt ?? r.reviewedAt),
      'reviewedBy': clearReview ? null : (reviewedBy ?? r.reviewedBy),
    };
  }

  AppUser buildAppUser(
    fb_auth.User fbUser, {
    Map<String, dynamic>? pubData,
    Map<String, dynamic>? privData,
    bool isAdmin = false,
  }) {
    final restRaw = pubData?['restaurant'];
    final restaurant = restRaw is Map
        ? RestaurantInfo.fromJson(Map<String, dynamic>.from(restRaw))
        : null;
    final rawRole = pubData?['role']?.toString() ?? 'user';
    final accType = (rawRole == 'restaurantOwner' || restaurant != null)
        ? AccountType.restaurantOwner
        : AccountType.user;
    final role = isAdmin
        ? UserRole.admin
        : (accType == AccountType.restaurantOwner || rawRole == 'donor')
            ? UserRole.donor
            : UserRole.recipient;

    final name = (pubData?['name']?.toString().isNotEmpty == true
            ? pubData!['name'].toString()
            : null) ??
        (pubData?['displayName']?.toString().isNotEmpty == true
            ? pubData!['displayName'].toString()
            : null) ??
        fbUser.displayName ??
        fbUser.email?.split('@').first ??
        'Community Member';
    final area = restaurant?.area ?? pubData?['area']?.toString() ?? 'Dhanmondi';
    final verified = accType == AccountType.restaurantOwner
        ? (restaurant?.verificationStatus ==
                RestaurantVerificationStatus.approved ||
            pubData?['verified'] == true)
        : pubData?['verified'] == true;
    final handle = pubData?['handle']?.toString() ??
        MessengerService.instance.generatePublicHandle(name, fbUser.uid);

    return AppUser(
      id: fbUser.uid,
      role: role,
      accountType: accType,
      isAdmin: isAdmin,
      name: name,
      handle: handle,
      photoURL: pubData?['photoURL']?.toString() ??
          restaurant?.restaurantPhotoUrl ??
          fbUser.photoURL,
      phone: restaurant?.phone ?? privData?['phone']?.toString() ?? '',
      email: privData?['email']?.toString() ??
          pubData?['email']?.toString() ??
          fbUser.email ??
          '',
      location: area,
      area: area,
      organizationName: pubData?['organizationName']?.toString(),
      verified: verified,
      discoverable: pubData?['discoverable'] != false,
      language: pubData?['language'] == 'bn' ? 'bn' : 'en',
      savedRadiusKm: (pubData?['savedRadiusKm'] as num?)?.toDouble() ?? 10,
      createdAt: _tsToIso(pubData?['createdAt']),
      restaurant: restaurant,
      donorProfile: (role == UserRole.donor ||
              accType == AccountType.restaurantOwner)
          ? DonorProfile(
              userId: fbUser.uid,
              businessName: restaurant?.restaurantName ??
                  pubData?['businessName']?.toString() ??
                  name,
              address: restaurant?.address ??
                  privData?['address']?.toString() ??
                  '$area, Dhaka',
              lat: restaurant?.lat ?? 23.7465,
              lng: restaurant?.lng ?? 90.376,
              hours: restaurant?.openingHours ??
                  pubData?['hours']?.toString() ??
                  '9:00 AM - 10:00 PM',
              verificationStatus: restaurant?.verificationStatus ==
                      RestaurantVerificationStatus.approved
                  ? 'verified'
                  : restaurant?.verificationStatus ==
                          RestaurantVerificationStatus.rejected
                      ? 'unverified'
                      : 'pending',
              logoUrl: restaurant?.restaurantPhotoUrl ?? fbUser.photoURL,
            )
          : null,
    );
  }

  Future<AppUser> syncUserProfile(
    fb_auth.User fbUser, {
    String preferredLang = 'en',
    Map<String, dynamic>? initialPatch,
    RestaurantInfo? initialRestaurant,
    bool? isAdminOverride,
  }) {
    final existing = _inFlightProfileSync[fbUser.uid];
    if (existing != null) return existing;

    final future = _doSyncUserProfile(
      fbUser,
      preferredLang: preferredLang,
      initialPatch: initialPatch,
      initialRestaurant: initialRestaurant,
      isAdminOverride: isAdminOverride,
    ).whenComplete(() {
      _inFlightProfileSync.remove(fbUser.uid);
    });
    _inFlightProfileSync[fbUser.uid] = future;
    return future;
  }

  Future<AppUser> _doSyncUserProfile(
    fb_auth.User fbUser, {
    String preferredLang = 'en',
    Map<String, dynamic>? initialPatch,
    RestaurantInfo? initialRestaurant,
    bool? isAdminOverride,
  }) async {
    final uid = _sanitizeId(fbUser.uid);
    final userRef = db.collection('users').doc(uid);
    final privRef = userRef.collection('private').doc('info');

    final pubSnap = await getDocResilient(userRef, db: db);
    final privSnap = await getDocResilient(privRef, db: db);

    final displayName =
        (initialPatch?['displayName']?.toString().trim().isNotEmpty == true)
            ? _clampStr(initialPatch!['displayName'].toString(), 100)
            : (initialRestaurant != null &&
                    initialRestaurant.ownerName.trim().isNotEmpty)
                ? _clampStr(initialRestaurant.ownerName, 100)
                : (fbUser.displayName?.trim().isNotEmpty == true
                    ? _clampStr(fbUser.displayName, 100)
                    : _clampStr(
                        fbUser.email?.split('@').first ?? 'Community Member',
                        100,
                      ));

    final safeEmail = _clampStr(fbUser.email, 160).isNotEmpty
        ? _clampStr(fbUser.email, 160)
        : '$uid@users.aharforall.local';
    RestaurantInfo? createdNewRest;

    if (!pubSnap.exists) {
      final isRest = initialPatch?['accountType'] == 'restaurantOwner' ||
          initialPatch?['role'] == 'restaurantOwner' ||
          initialRestaurant != null;
      final generatedHandle =
          MessengerService.instance.generatePublicHandle(displayName, uid);

      final payload = <String, dynamic>{
        'uid': uid,
        'name': displayName,
        'displayName': displayName,
        'handle': generatedHandle,
        'role': isRest
            ? 'restaurantOwner'
            : (initialPatch?['role'] == 'donor' ? 'donor' : 'user'),
        'area': _clampStr(
          initialRestaurant?.area ?? initialPatch?['area']?.toString(),
          80,
        ).isNotEmpty
            ? _clampStr(
                initialRestaurant?.area ?? initialPatch?['area']?.toString(),
                80,
              )
            : 'Dhanmondi',
        'verified': false,
        'discoverable': true,
        'starterSeeded': false,
        'notificationsSeeded': false,
        'language': preferredLang == 'bn' ? 'bn' : 'en',
        'savedRadiusKm': 10,
        'createdAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      };
      if (fbUser.photoURL != null && fbUser.photoURL!.length <= 248000) {
        payload['photoURL'] = fbUser.photoURL;
      }
      final org = _clampStr(initialPatch?['organizationName']?.toString(), 120);
      if (org.isNotEmpty) payload['organizationName'] = org;

      final biz = _clampStr(
        initialRestaurant?.restaurantName ??
            initialPatch?['businessName']?.toString(),
        120,
      );
      if (biz.isNotEmpty) payload['businessName'] = biz;

      final hrs = _clampStr(
        initialRestaurant?.openingHours ?? initialPatch?['hours']?.toString(),
        80,
      );
      if (hrs.isNotEmpty) payload['hours'] = hrs;

      if (isRest && initialRestaurant != null) {
        payload['restaurant'] = _sanitizeRestaurant(
          initialRestaurant,
          verificationStatus: 'pending',
          clearReview: true,
        );
        createdNewRest = initialRestaurant;
      }

      await userRef.set(payload);
    } else {
      final existing = pubSnap.data() ?? <String, dynamic>{};
      final existingDisplayName = existing['displayName']?.toString();
      final nextDisplayName = (existingDisplayName != null &&
              existingDisplayName.isNotEmpty)
          ? _clampStr(existingDisplayName, 100)
          : displayName;
      final patchData = <String, dynamic>{
        'displayName': nextDisplayName,
        'updatedAt': FieldValue.serverTimestamp(),
      };
      if (existing['name'] == null ||
          existing['name'].toString().trim().isEmpty) {
        patchData['name'] = nextDisplayName;
      }
      if (existing['handle'] == null ||
          existing['handle'].toString().trim().isEmpty) {
        patchData['handle'] =
            MessengerService.instance.generatePublicHandle(nextDisplayName, uid);
      }
      if (existing['discoverable'] is! bool) {
        patchData['discoverable'] = true;
      }
      if (existing['area'] == null ||
          existing['area'].toString().trim().isEmpty) {
        patchData['area'] = 'Dhanmondi';
      }
      await userRef.update(patchData);
    }

    if (!privSnap.exists) {
      final privPayload = <String, dynamic>{
        'uid': uid,
        'email': safeEmail,
        'updatedAt': FieldValue.serverTimestamp(),
      };
      final phone = _clampStr(
        initialRestaurant?.phone ?? initialPatch?['phone']?.toString(),
        32,
      );
      if (phone.isNotEmpty) privPayload['phone'] = phone;
      final addr = _clampStr(
        initialRestaurant?.address ?? initialPatch?['address']?.toString(),
        240,
      );
      if (addr.isNotEmpty) privPayload['address'] = addr;
      await privRef.set(privPayload);
    } else if (privSnap.data()?['email'] != safeEmail) {
      await privRef.update({
        'email': safeEmail,
        'updatedAt': FieldValue.serverTimestamp(),
      });
    }

    if (createdNewRest != null) {
      await AdminChatService.instance
          .ensureAdminConversationForOwner(
            ownerUid: uid,
            ownerName: createdNewRest.ownerName.isNotEmpty
                ? createdNewRest.ownerName
                : displayName,
            restaurantName: createdNewRest.restaurantName,
            restaurantLogoUrl: createdNewRest.restaurantPhotoUrl,
            verificationStatus: RestaurantVerificationStatus.pending,
          )
          .catchError((_) => AdminConversation(
                id: 'admin_$uid',
                ownerUid: uid,
                ownerName: displayName,
                restaurantName: createdNewRest!.restaurantName,
                verificationStatus: RestaurantVerificationStatus.pending,
                lastMessage: '',
                lastMessageType: 'system',
                lastSenderRole: 'system',
                lastMessageAt: DateTime.now().toIso8601String(),
                ownerUnreadCount: 0,
                adminUnreadCount: 0,
                ownerTyping: false,
                adminTyping: false,
                createdAt: DateTime.now().toIso8601String(),
                updatedAt: DateTime.now().toIso8601String(),
              ));
      await AdminChatService.instance
          .createNewRestaurantOwnerNotification(
            ownerUid: uid,
            restaurantName: createdNewRest.restaurantName,
            ownerName: createdNewRest.ownerName.isNotEmpty
                ? createdNewRest.ownerName
                : displayName,
          )
          .catchError((_) {});
    }

    Map<String, dynamic>? freshPubData = pubSnap.data();
    Map<String, dynamic>? freshPrivData = privSnap.data();
    try {
      final freshPub = await getDocResilient(userRef, db: db);
      if (freshPub.exists) freshPubData = freshPub.data();
    } catch (e) {
      debugPrint('[FirestoreService] freshPub read fallback ($uid): $e');
    }
    try {
      final freshPriv = await getDocResilient(privRef, db: db);
      if (freshPriv.exists) freshPrivData = freshPriv.data();
    } catch (e) {
      debugPrint('[FirestoreService] freshPriv read fallback ($uid): $e');
    }

    final isAdmin = isAdminOverride ?? await checkIsAdmin(fbUser);
    return buildAppUser(
      fbUser,
      pubData: freshPubData,
      privData: freshPrivData,
      isAdmin: isAdmin,
    );
  }

  Stream<AppUser> watchMyFirebaseUser(
    fb_auth.User fbUser, {
    bool isAdmin = false,
  }) {
    final uid = _sanitizeId(fbUser.uid);
    late StreamController<AppUser> controller;
    Map<String, dynamic>? latestPub;
    Map<String, dynamic>? latestPriv;
    StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>? subPub;
    StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>? subPriv;

    void emit() {
      if (latestPub != null && !controller.isClosed) {
        controller.add(buildAppUser(
          fbUser,
          pubData: latestPub,
          privData: latestPriv,
          isAdmin: isAdmin,
        ));
      }
    }

    controller = StreamController<AppUser>(
      onListen: () {
        subPub = db.collection('users').doc(uid).snapshots().listen(
          (snap) {
            if (snap.exists && snap.data() != null) {
              latestPub = snap.data();
              emit();
            }
          },
          onError: (e) {
            debugPrint('[FirestoreService] watchMyFirebaseUser pub error: $e');
          },
        );
        subPriv = db
            .collection('users')
            .doc(uid)
            .collection('private')
            .doc('info')
            .snapshots()
            .listen(
          (snap) {
            if (snap.exists && snap.data() != null) {
              latestPriv = snap.data();
              emit();
            }
          },
          onError: (e) {
            debugPrint('[FirestoreService] watchMyFirebaseUser priv error: $e');
          },
        );
      },
      onCancel: () async {
        await subPub?.cancel();
        await subPriv?.cancel();
      },
    );
    return controller.stream;
  }

  Future<void> updateUserProfile(
    String uid,
    Map<String, dynamic> patch,
  ) async {
    final safeUid = _sanitizeId(uid);
    final pubUpdates = <String, dynamic>{
      'updatedAt': FieldValue.serverTimestamp(),
    };
    if (patch['displayName'] != null &&
        patch['displayName'].toString().trim().isNotEmpty) {
      final safeName = _clampStr(patch['displayName'].toString(), 100);
      pubUpdates['displayName'] = safeName;
      pubUpdates['name'] = safeName;
    } else if (patch['name'] != null &&
        patch['name'].toString().trim().isNotEmpty) {
      final safeName = _clampStr(patch['name'].toString(), 100);
      pubUpdates['displayName'] = safeName;
      pubUpdates['name'] = safeName;
    }
    if (patch['area'] != null && patch['area'].toString().trim().isNotEmpty) {
      pubUpdates['area'] = _clampStr(patch['area'].toString(), 80);
    }
    if (patch['organizationName'] != null) {
      pubUpdates['organizationName'] =
          _clampStr(patch['organizationName'].toString(), 120);
    }
    if (patch['businessName'] != null &&
        patch['businessName'].toString().trim().isNotEmpty) {
      pubUpdates['businessName'] =
          _clampStr(patch['businessName'].toString(), 120);
    }
    if (patch['hours'] != null && patch['hours'].toString().trim().isNotEmpty) {
      pubUpdates['hours'] = _clampStr(patch['hours'].toString(), 80);
    }
    if (patch['language'] == 'en' || patch['language'] == 'bn') {
      pubUpdates['language'] = patch['language'];
    }
    if (patch['savedRadiusKm'] is num) {
      pubUpdates['savedRadiusKm'] =
          (patch['savedRadiusKm'] as num).round().clamp(1, 50);
    }
    if (patch['discoverable'] is bool) {
      pubUpdates['discoverable'] = patch['discoverable'];
    }

    await db.collection('users').doc(safeUid).update(pubUpdates);

    final dirUpdates = <String, dynamic>{
      'updatedAt': FieldValue.serverTimestamp(),
    };
    if (pubUpdates['displayName'] != null) {
      dirUpdates['displayName'] = pubUpdates['displayName'];
    }
    if (pubUpdates['area'] != null) dirUpdates['area'] = pubUpdates['area'];
    if (pubUpdates['businessName'] != null) {
      dirUpdates['restaurantName'] = pubUpdates['businessName'];
    }
    if (patch['discoverable'] is bool) {
      dirUpdates['discoverable'] = patch['discoverable'];
    }
    if (dirUpdates.length > 1) {
      try {
        await db.collection('userDirectory').doc(safeUid).update(dirUpdates);
      } catch (_) {}
    }

    final privUpdates = <String, dynamic>{};
    if (patch['phone'] != null && patch['phone'].toString().trim().isNotEmpty) {
      privUpdates['phone'] = _clampStr(patch['phone'].toString(), 32);
    }
    if (patch['address'] != null &&
        patch['address'].toString().trim().isNotEmpty) {
      privUpdates['address'] = _clampStr(patch['address'].toString(), 240);
    }
    if (privUpdates.isNotEmpty) {
      privUpdates['updatedAt'] = FieldValue.serverTimestamp();
      try {
        await db
            .collection('users')
            .doc(safeUid)
            .collection('private')
            .doc('info')
            .update(privUpdates);
      } catch (_) {}
    }
  }

  Future<AppUser> submitRestaurantOwnerResubmission(
    fb_auth.User fbUser,
    RestaurantInfo nextInfo,
    String resubmittedChatMessage,
  ) async {
    final uid = _sanitizeId(fbUser.uid);
    final userRef = db.collection('users').doc(uid);
    final privRef = userRef.collection('private').doc('info');

    final snap = await userRef.get();
    final existingRestRaw = snap.data()?['restaurant'];
    final existingRest = existingRestRaw is Map
        ? RestaurantInfo.fromJson(Map<String, dynamic>.from(existingRestRaw))
        : null;

    final nowIso = DateTime.now().toIso8601String();
    final sanitizedRest = _sanitizeRestaurant(
      nextInfo,
      verificationStatus: 'pending',
      rejectionReason: null,
      submittedAt: nowIso,
      reviewedAt: existingRest?.reviewedAt,
      reviewedBy: existingRest?.reviewedBy,
    );
    // Keep clearReview false except rejectionReason explicit null
    sanitizedRest['rejectionReason'] = null;

    await userRef.update({
      'name': _clampStr(nextInfo.ownerName, 100),
      'displayName': _clampStr(nextInfo.ownerName, 100),
      'area': _clampStr(nextInfo.area, 80).isNotEmpty
          ? _clampStr(nextInfo.area, 80)
          : 'Dhanmondi',
      'businessName': _clampStr(nextInfo.restaurantName, 120),
      'hours': _clampStr(nextInfo.openingHours, 80),
      'restaurant': sanitizedRest,
      'updatedAt': FieldValue.serverTimestamp(),
    });

    try {
      await privRef.update({
        'phone': _clampStr(nextInfo.phone, 32),
        'address': _clampStr(nextInfo.address, 240),
        'updatedAt': FieldValue.serverTimestamp(),
      });
    } catch (_) {}

    await AdminChatService.instance.createResubmittedNotification(
      ownerUid: uid,
      restaurantName: nextInfo.restaurantName,
      ownerName: nextInfo.ownerName,
    );

    try {
      await AdminChatService.instance.sendAdminChatMessage(
        conversationId: 'admin_$uid',
        ownerUid: uid,
        senderId: uid,
        senderRole: 'owner',
        senderName: nextInfo.ownerName,
        restaurantName: nextInfo.restaurantName,
        ownerName: nextInfo.ownerName,
        restaurantLogoUrl: nextInfo.restaurantPhotoUrl,
        verificationStatus: RestaurantVerificationStatus.pending,
        text: resubmittedChatMessage,
        messageType: 'text',
      );
    } catch (_) {}

    return syncUserProfile(fbUser);
  }

  Stream<List<Listing>> watchActiveListings() {
    return db
        .collection('listings')
        .where('status', isEqualTo: 'active')
        .snapshots()
        .map((snap) {
      return snap.docs.map((d) {
        final data = Map<String, dynamic>.from(d.data());
        data['id'] = d.id;
        data['createdAt'] = _tsToIso(data['createdAt']);
        if (data['photoUrls'] == null) {
          final cat = foodCategoryFromWire(data['category']?.toString());
          data['photoUrls'] = [_categoryImages[cat] ?? '/images/kacchi-biryani.jpg'];
        }
        return Listing.fromJson(data);
      }).toList()
        ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    });
  }

  Stream<List<Listing>> watchMyDonorListings(String donorId) {
    final safeDonorId = _sanitizeId(donorId);
    return db
        .collection('listings')
        .where('donorId', isEqualTo: safeDonorId)
        .snapshots()
        .map((snap) {
      return snap.docs.map((d) {
        final data = Map<String, dynamic>.from(d.data());
        data['id'] = d.id;
        data['createdAt'] = _tsToIso(data['createdAt']);
        if (data['photoUrls'] == null) {
          final cat = foodCategoryFromWire(data['category']?.toString());
          data['photoUrls'] = [_categoryImages[cat] ?? '/images/kacchi-biryani.jpg'];
        }
        return Listing.fromJson(data);
      }).toList()
        ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    });
  }

  Future<String> createListing(
    AppUser user,
    Map<String, dynamic> payload,
  ) async {
    final rand = _rng.nextInt(90000) + 10000;
    final id = _sanitizeId(
      'fb_lst_${DateTime.now().millisecondsSinceEpoch}_$rand',
    );
    final qty = ((payload['quantity'] as num?)?.toInt() ?? 1).clamp(1, 5000);
    final donorNameRaw = user.restaurant?.restaurantName ??
        user.donorProfile?.businessName ??
        user.name;
    final donorName = _clampStr(donorNameRaw, 120).isNotEmpty
        ? _clampStr(donorNameRaw, 120)
        : 'Community Kitchen';
    final donorArea = _clampStr(user.area, 80).isNotEmpty
        ? _clampStr(user.area, 80)
        : 'Dhanmondi';
    final unit = _clampStr(payload['unit']?.toString(), 32).isNotEmpty
        ? _clampStr(payload['unit']?.toString(), 32)
        : 'boxes';
    final title = _clampStr(payload['title']?.toString(), 140);
    final pickupStart = _clampStr(payload['pickupStart']?.toString(), 64);
    final pickupEnd = _clampStr(payload['pickupEnd']?.toString(), 64);
    final pickupAddr = _clampStr(payload['pickupAddress']?.toString(), 240);
    final nowIso = DateTime.now().toIso8601String();

    final docData = <String, dynamic>{
      'donorId': _sanitizeId(user.id),
      'donorName': donorName,
      'donorVerified': user.verified ||
          user.restaurant?.verificationStatus ==
              RestaurantVerificationStatus.approved,
      'donorArea': donorArea,
      'title': title,
      'category': payload['category']?.toString() ?? 'cooked',
      'quantity': qty,
      'remainingQuantity': qty,
      'unit': unit,
      'pickupStart': pickupStart.length >= 4 ? pickupStart : nowIso,
      'pickupEnd': pickupEnd.length >= 4
          ? pickupEnd
          : DateTime.now().add(const Duration(hours: 3)).toIso8601String(),
      'pickupAddress': pickupAddr.length >= 2 ? pickupAddr : 'Dhaka',
      'preparedAt': nowIso.length > 64 ? nowIso.substring(0, 64) : nowIso,
      'status': 'active',
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    };

    final desc = _clampStr(payload['description']?.toString(), 1000);
    if (desc.isNotEmpty) docData['description'] = desc;

    if (payload['dietaryTags'] is List) {
      final tags = (payload['dietaryTags'] as List)
          .map((t) => _clampStr(t?.toString(), 40))
          .where((t) => t.isNotEmpty)
          .take(10)
          .toList();
      if (tags.isNotEmpty) docData['dietaryTags'] = tags;
    }

    final safetyNote = _clampStr(payload['safetyNote']?.toString(), 400);
    if (safetyNote.isNotEmpty) docData['safetyNote'] = safetyNote;

    if (payload['consumeWithinHours'] is num) {
      docData['consumeWithinHours'] =
          (payload['consumeWithinHours'] as num).round().clamp(1, 72);
    }
    if (payload['storageMethod'] != null) {
      docData['storageMethod'] = payload['storageMethod'].toString();
    }
    final isFlash = payload['isFlashRescue'] == true;
    if (payload['isFlashRescue'] is bool) {
      docData['isFlashRescue'] = isFlash;
    }
    if (payload['isRamadanSpecial'] is bool) {
      docData['isRamadanSpecial'] = payload['isRamadanSpecial'];
    }
    if (payload['lat'] is num) {
      docData['lat'] = (payload['lat'] as num).toDouble().clamp(-90.0, 90.0);
    }
    if (payload['lng'] is num) {
      docData['lng'] = (payload['lng'] as num).toDouble().clamp(-180.0, 180.0);
    }

    await db.collection('listings').doc(id).set(docData);

    if (isFlash) {
      unawaited(
        db
            .collection('userDirectory')
            .where('discoverable', isEqualTo: true)
            .limit(25)
            .get()
            .then((snap) {
          final areaLower = donorArea.toLowerCase();
          final targets = snap.docs
              .map((d) => (
                    uid: (d.data()['uid'] ?? d.id).toString(),
                    area: (d.data()['area'] ?? '').toString(),
                  ))
              .where((e) => e.uid.isNotEmpty && e.uid != user.id)
              .toList()
            ..sort((a, b) {
              final am = a.area.toLowerCase() == areaLower ? 0 : 1;
              final bm = b.area.toLowerCase() == areaLower ? 0 : 1;
              return am.compareTo(bm);
            });

          for (final target in targets.take(12)) {
            unawaited(NotificationService.instance.createCrossUserNotification(
              recipientUid: target.uid,
              senderUid: user.id,
              senderName: donorName,
              type: 'flash_near_you',
              title: 'Flash Rescue near $donorArea!',
              titleBn: '$donorArea-এ ফ্ল্যাশ রেসকিউ শুরু হয়েছে!',
              body: '$donorName: $qty $unit of $title ready for quick pickup.',
              bodyBn:
                  '$donorName: দ্রুত সংগ্রহের জন্য $qtyটি "$title" এখন উপলব্ধ।',
              listingId: id,
              linkTab: 'discover',
            ));
          }
        }).catchError((_) {}),
      );
    }

    return id;
  }

  Future<void> updateListing(
    String listingId,
    Map<String, dynamic> patch,
  ) async {
    final updates = <String, dynamic>{
      'updatedAt': FieldValue.serverTimestamp(),
    };
    if (patch['title'] != null &&
        _clampStr(patch['title'].toString(), 140).length >= 2) {
      updates['title'] = _clampStr(patch['title'].toString(), 140);
    }
    if (patch['description'] != null) {
      updates['description'] = _clampStr(patch['description'].toString(), 1000);
    }
    if (patch['remainingQuantity'] is num) {
      updates['remainingQuantity'] =
          max(0, (patch['remainingQuantity'] as num).round());
    }
    if (patch['status'] != null) {
      updates['status'] = patch['status'].toString();
    }
    if (patch['safetyNote'] != null) {
      updates['safetyNote'] = _clampStr(patch['safetyNote'].toString(), 400);
    }
    if (patch['pickupEnd'] != null &&
        _clampStr(patch['pickupEnd'].toString(), 64).length >= 4) {
      updates['pickupEnd'] = _clampStr(patch['pickupEnd'].toString(), 64);
    }
    if (patch['storageMethod'] != null) {
      updates['storageMethod'] = patch['storageMethod'].toString();
    }
    if (patch['isFlashRescue'] is bool) {
      updates['isFlashRescue'] = patch['isFlashRescue'];
    }
    if (patch['isRamadanSpecial'] is bool) {
      updates['isRamadanSpecial'] = patch['isRamadanSpecial'];
    }
    await db
        .collection('listings')
        .doc(_sanitizeId(listingId))
        .update(updates);
  }

  Future<void> deleteListing(String listingId) async {
    await db.collection('listings').doc(_sanitizeId(listingId)).delete();
  }

  Future<Claim?> createClaimIfSupported(
    AppUser user,
    Listing listing,
    int quantityClaimed, {
    String? notes,
  }) async {
    final safeListingId = _sanitizeId(listing.id);
    final snap = await db.collection('listings').doc(safeListingId).get();
    if (!snap.exists || snap.data()?['status'] != 'active') {
      return null;
    }

    final rand = _rng.nextInt(9000) + 1000;
    final claimId = _sanitizeId(
      'fb_clm_${DateTime.now().millisecondsSinceEpoch}_$rand',
    );
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    final pickupCode = List.generate(
      6,
      (_) => chars[_rng.nextInt(chars.length)],
    ).join();
    final safeQty = quantityClaimed.clamp(1, 500);
    final safeNotes = _clampStr(notes, 400);

    final docData = <String, dynamic>{
      'listingId': safeListingId,
      'donorId': _sanitizeId(listing.donorId),
      'recipientId': _sanitizeId(user.id),
      'recipientName': _clampStr(user.name, 100).isNotEmpty
          ? _clampStr(user.name, 100)
          : 'Neighbor',
      'donorBusinessName': _clampStr(listing.donorName, 120).isNotEmpty
          ? _clampStr(listing.donorName, 120)
          : 'Community Kitchen',
      'listingTitle': _clampStr(listing.title, 140).isNotEmpty
          ? _clampStr(listing.title, 140)
          : 'Surplus Food',
      'quantityClaimed': safeQty,
      'status': 'requested',
      'pickupCode': pickupCode,
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    };
    if (safeNotes.isNotEmpty) docData['notes'] = safeNotes;

    await db.collection('claims').doc(claimId).set(docData);

    unawaited(NotificationService.instance.createCrossUserNotification(
      recipientUid: _sanitizeId(listing.donorId),
      senderUid: user.id,
      senderName: user.name,
      type: 'claim_request',
      title: 'New claim request for ${listing.title}',
      titleBn: '${listing.title}-এর জন্য নতুন সংগ্রহের অনুরোধ',
      body: '${user.name} requested $safeQty ${listing.unit}.',
      bodyBn: '${user.name} $safeQtyটি অংশ সংগ্রহের অনুরোধ করেছেন।',
      claimId: claimId,
      listingId: safeListingId,
      linkTab: 'donor',
    ));

    return Claim(
      id: claimId,
      listingId: safeListingId,
      recipientId: user.id,
      recipientName: user.name,
      recipientArea: user.area,
      donorId: listing.donorId,
      donorBusinessName: listing.donorName,
      donorAddress: listing.pickupAddress,
      donorVerified: listing.donorVerified,
      listingTitle: listing.title,
      listingPhoto: listing.photoUrls.isNotEmpty
          ? listing.photoUrls.first
          : (_categoryImages[listing.category] ?? '/images/kacchi-biryani.jpg'),
      listingCategory: listing.category,
      pickupStart: listing.pickupStart,
      pickupEnd: listing.pickupEnd,
      quantityClaimed: safeQty,
      status: ClaimStatus.requested,
      pickupCode: pickupCode,
      notes: safeNotes.isNotEmpty ? safeNotes : null,
      createdAt: DateTime.now().toIso8601String(),
    );
  }

  Stream<List<Claim>> watchMyClaims(String uid, {bool asDonor = false}) {
    final safeUid = _sanitizeId(uid);
    final field = asDonor ? 'donorId' : 'recipientId';
    return db
        .collection('claims')
        .where(field, isEqualTo: safeUid)
        .snapshots()
        .map((snap) {
      return snap.docs.map((d) {
        final data = Map<String, dynamic>.from(d.data());
        data['id'] = d.id;
        data['createdAt'] = _tsToIso(data['createdAt']);
        return Claim.fromJson(data);
      }).toList()
        ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    });
  }

  Future<void> updateClaimStatus(
    String claimId,
    String status, {
    String handoverMethod = 'manual',
    Claim? claim,
    AppUser? actor,
  }) async {
    final safeClaimId = _sanitizeId(claimId);
    final updates = <String, dynamic>{
      'status': status,
      'updatedAt': FieldValue.serverTimestamp(),
    };
    if (status == 'completed') {
      updates['handoverMethod'] = handoverMethod;
    }
    await db.collection('claims').doc(safeClaimId).update(updates);

    if (claim != null && actor != null) {
      if (status == 'accepted' && claim.recipientId != actor.id) {
        unawaited(NotificationService.instance.createCrossUserNotification(
          recipientUid: claim.recipientId,
          senderUid: actor.id,
          senderName: claim.donorBusinessName,
          type: 'claim_accepted',
          title: 'Claim accepted: ${claim.listingTitle}',
          titleBn: 'অনুরোধ গৃহীত হয়েছে: ${claim.listingTitle}',
          body: 'Use pickup code ${claim.pickupCode} when you arrive.',
          bodyBn: 'পিকআপের সময় কোড ${claim.pickupCode} ব্যবহার করুন।',
          claimId: safeClaimId,
          listingId: claim.listingId,
          linkTab: 'claims',
        ));
      } else if (status == 'completed' && claim.recipientId != actor.id) {
        unawaited(NotificationService.instance.createCrossUserNotification(
          recipientUid: claim.recipientId,
          senderUid: actor.id,
          senderName: claim.donorBusinessName,
          type: 'pickup_completed',
          title: 'Pickup completed — ${claim.listingTitle}',
          titleBn: 'খাবার সংগ্রহ সম্পন্ন — ${claim.listingTitle}',
          body:
              'Thank you for rescuing ${claim.quantityClaimed} portion(s) with Ahar For All!',
          bodyBn:
              'আহার সবার জন্য-এর সাথে ${claim.quantityClaimed} অংশ খাবার উদ্ধার করার জন্য ধন্যবাদ!',
          claimId: safeClaimId,
          listingId: claim.listingId,
          linkTab: 'claims',
        ));
      }
    }
  }

  Future<void> submitReview({
    required AppUser user,
    required Claim claim,
    required int rating,
    required bool hygieneOk,
    String? comment,
  }) async {
    final rand = _rng.nextInt(9000) + 1000;
    final reviewId = _sanitizeId(
      'fb_rev_${DateTime.now().millisecondsSinceEpoch}_$rand',
    );
    final payload = <String, dynamic>{
      'claimId': _sanitizeId(claim.id),
      'donorId': _sanitizeId(claim.donorId),
      'reviewerId': _sanitizeId(user.id),
      'reviewerName': _clampStr(user.name, 100).isNotEmpty
          ? _clampStr(user.name, 100)
          : 'Neighbor',
      'rating': rating.clamp(1, 5),
      'hygieneOk': hygieneOk,
      'createdAt': FieldValue.serverTimestamp(),
    };
    final safeComment = _clampStr(comment, 500);
    if (safeComment.isNotEmpty) payload['comment'] = safeComment;
    await db.collection('reviews').doc(reviewId).set(payload);
  }

  Future<DonationRecord> createDonation(
    AppUser user, {
    required int amountBdt,
    required String frequency,
    required String cause,
    required String paymentMethod,
    required bool isAnonymous,
    String? honorOf,
    String? donorName,
  }) async {
    final rand = _rng.nextInt(90000) + 10000;
    final id = _sanitizeId(
      'fb_don_${DateTime.now().millisecondsSinceEpoch}_$rand',
    );
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    final receiptCode =
        'AFA-${List.generate(6, (_) => chars[_rng.nextInt(chars.length)]).join()}';
    final safeAmt = amountBdt.clamp(20, 5000000);
    final displayName = isAnonymous
        ? 'Anonymous'
        : (_clampStr(
                  donorName ?? user.donorProfile?.businessName ?? user.name,
                  120,
                ).isNotEmpty
            ? _clampStr(
                donorName ?? user.donorProfile?.businessName ?? user.name,
                120,
              )
            : 'Supporter');

    final docData = <String, dynamic>{
      'userId': _sanitizeId(user.id),
      'donorDisplayName': displayName,
      'amountBdt': safeAmt,
      'frequency': frequency == 'monthly' ? 'monthly' : 'one_time',
      'cause': cause,
      'paymentMethod': paymentMethod,
      'isAnonymous': isAnonymous,
      'receiptCode': receiptCode,
      'createdAt': FieldValue.serverTimestamp(),
    };
    final safeHonor = _clampStr(honorOf, 140);
    if (safeHonor.isNotEmpty) docData['honorOf'] = safeHonor;

    await db.collection('donations').doc(id).set(docData);

    return DonationRecord(
      id: id,
      donorDisplayName: displayName,
      amountBdt: safeAmt,
      frequency: frequency == 'monthly'
          ? DonationFrequency.monthly
          : DonationFrequency.oneTime,
      cause: donationCauseFromWire(cause),
      paymentMethod: paymentMethodFromWire(paymentMethod),
      isAnonymous: isAnonymous,
      honorOf: safeHonor.isNotEmpty ? safeHonor : null,
      receiptCode: receiptCode,
      status: 'completed',
      createdAt: DateTime.now().toIso8601String(),
    );
  }

  Stream<List<DonationRecord>> watchMyDonations(String userId) {
    final safeUid = _sanitizeId(userId);
    return db
        .collection('donations')
        .where('userId', isEqualTo: safeUid)
        .snapshots()
        .map((snap) {
      return snap.docs.map((d) {
        final data = Map<String, dynamic>.from(d.data());
        data['id'] = d.id;
        data['createdAt'] = _tsToIso(data['createdAt']);
        return DonationRecord.fromJson(data);
      }).toList()
        ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    });
  }

  Stream<List<RestaurantOwnerApplication>> watchRestaurantApplications() {
    return db
        .collection('users')
        .where('role', isEqualTo: 'restaurantOwner')
        .snapshots()
        .map((snap) {
      final list = <RestaurantOwnerApplication>[];
      for (final d in snap.docs) {
        final data = d.data();
        final rest = data['restaurant'];
        if (rest is! Map) continue;
        final info = RestaurantInfo.fromJson(Map<String, dynamic>.from(rest));
        list.add(RestaurantOwnerApplication(
          uid: data['uid']?.toString() ?? d.id,
          name: (data['name'] ?? data['displayName'] ?? info.ownerName)
              .toString(),
          email: (data['email'] ?? info.email ?? '').toString(),
          area: (data['area'] ?? info.area).toString(),
          verified: data['verified'] == true,
          createdAt: _tsToIso(data['createdAt']),
          restaurant: info,
        ));
      }
      list.sort((a, b) => b.createdAt.compareTo(a.createdAt));
      return list;
    });
  }

  Future<void> reviewRestaurantApplication({
    required String ownerUid,
    required String adminUid,
    required String decision,
    String? rejectionReason,
    String? restaurantName,
    String? ownerName,
    String? restaurantLogoUrl,
    String? systemMessageText,
  }) {
    return AdminChatService.instance.reviewRestaurantApplication(
      ownerUid: ownerUid,
      adminUid: adminUid,
      decision: decision,
      rejectionReason: rejectionReason,
      restaurantName: restaurantName ?? 'Restaurant',
      ownerName: ownerName ?? 'Owner',
      restaurantLogoUrl: restaurantLogoUrl,
      systemMessageText: systemMessageText ??
          (decision == 'approved'
              ? 'Your restaurant verification was approved! You can now share surplus meals with verified trust.'
              : 'Application needs update: ${rejectionReason ?? 'Please review details and resubmit.'}'),
    );
  }

  Stream<List<AdminNotificationItem>> watchAdminNotifications() =>
      AdminChatService.instance.watchAdminNotifications();

  Future<void> markAdminNotificationRead(String id) =>
      AdminChatService.instance.markAdminNotificationRead(id);

  Stream<List<Conversation>> watchMyConversations(String myUid) =>
      MessengerService.instance.watchMyConversations(
        myUid,
        getBlockedSet: () => const <String>{},
        getDirectoryMap: () => const <String, UserDirectoryEntry>{},
      );
}
