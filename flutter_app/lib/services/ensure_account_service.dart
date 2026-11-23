import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb_auth;
import 'package:firebase_core/firebase_core.dart';
import '../firebase_options.dart';
import '../models/models.dart';
import 'community_rooms_service.dart';
import 'firestore_error_helper.dart';
import 'firestore_service.dart';
import 'messenger_service.dart';
import 'notification_service.dart';

class EnsureAccountStep {
  final String id; // 'profile' | 'directory' | 'notifications' | 'welcome_chat' | 'rooms'
  final String label;
  final String labelBn;
  final String status; // 'ok' | 'fixed' | 'error'
  final String detail;
  final String detailBn;

  const EnsureAccountStep({
    required this.id,
    required this.label,
    required this.labelBn,
    required this.status,
    required this.detail,
    required this.detailBn,
  });
}

class EnsureAccountReport {
  final String ranAt;
  final bool overallOk;
  final int fixedCount;
  final int errorCount;
  final List<EnsureAccountStep> steps;
  final AppUser? refreshedUser;

  const EnsureAccountReport({
    required this.ranAt,
    required this.overallOk,
    required this.fixedCount,
    required this.errorCount,
    required this.steps,
    this.refreshedUser,
  });
}

class EnsureAccountService {
  EnsureAccountService._();
  static final EnsureAccountService instance = EnsureAccountService._();

  final Map<String, Future<EnsureAccountReport>> _inFlight = {};

  FirebaseFirestore get db => FirebaseFirestore.instanceFor(
        app: Firebase.app(),
        databaseId: DefaultFirebaseOptions.firestoreDatabaseId,
      );

  Future<EnsureAccountReport> ensureAccount(
    fb_auth.User fbUser,
    AppUser appUser, {
    bool force = false,
  }) {
    if (!force) {
      final existing = _inFlight[fbUser.uid];
      if (existing != null) return existing;
    }

    final future =
        _doEnsureAccount(fbUser, appUser, force: force).whenComplete(() {
      _inFlight.remove(fbUser.uid);
    });
    if (!force) {
      _inFlight[fbUser.uid] = future;
    }
    return future;
  }

  Future<EnsureAccountReport> _doEnsureAccount(
    fb_auth.User fbUser,
    AppUser appUser, {
    required bool force,
  }) async {
    final uid = fbUser.uid;
    final steps = <EnsureAccountStep>[];
    var refreshedUser = appUser;

    // 1. Ensure /users/{uid} and /users/{uid}/private/info exist & have required fields
    try {
      final existingPubSnap =
          await getDocResilient(db.collection('users').doc(uid), db: db);
      final existedBefore = existingPubSnap.exists;
      final d = existingPubSnap.data();
      final hadHandleAndDiscoverable = existedBefore &&
          (d?['handle']?.toString().isNotEmpty == true) &&
          (d?['discoverable'] is bool) &&
          (d?['area']?.toString().isNotEmpty == true);

      refreshedUser = await FirestoreService.instance.syncUserProfile(
        fbUser,
        preferredLang: appUser.language == 'bn' ? 'bn' : 'en',
        isAdminOverride: appUser.isAdmin ? true : null,
      );

      steps.add(EnsureAccountStep(
        id: 'profile',
        label: 'Account profile document',
        labelBn: 'অ্যাকাউন্ট প্রোফাইল ডকুমেন্ট',
        status: hadHandleAndDiscoverable ? 'ok' : 'fixed',
        detail: hadHandleAndDiscoverable
            ? 'Profile verified (${refreshedUser.handle ?? uid})'
            : existedBefore
                ? 'Repaired missing profile fields (${refreshedUser.handle ?? 'handle added'})'
                : 'Created missing profile document (${refreshedUser.handle ?? 'ready'})',
        detailBn: hadHandleAndDiscoverable
            ? 'প্রোফাইল যাচাই করা হয়েছে (${refreshedUser.handle ?? uid})'
            : existedBefore
                ? 'প্রোফাইলের অনুপস্থিত তথ্য ঠিক করা হয়েছে'
                : 'অ্যাকাউন্ট প্রোফাইল ডকুমেন্ট তৈরি করা হয়েছে',
      ));
    } catch (err) {
      final msg = err.toString();
      steps.add(EnsureAccountStep(
        id: 'profile',
        label: 'Account profile document',
        labelBn: 'অ্যাকাউন্ট প্রোফাইল ডকুমেন্ট',
        status: 'error',
        detail: 'Failed to sync profile: $msg',
        detailBn: 'প্রোফাইল সিঙ্ক ব্যর্থ হয়েছে: $msg',
      ));
    }

    // 2. Ensure /userDirectory/{uid} exists with discoverable: true
    try {
      final dirSnap =
          await getDocResilient(db.collection('userDirectory').doc(uid), db: db);
      final dirExisted = dirSnap.exists;
      final dirDiscoverable =
          dirExisted && dirSnap.data()?['discoverable'] == true;

      await MessengerService.instance.syncUserDirectoryProfile(
        fbUser,
        refreshedUser,
        online: true,
      );

      final isFixed = !dirExisted ||
          (!dirDiscoverable && refreshedUser.discoverable != false);
      steps.add(EnsureAccountStep(
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
      ));
    } catch (err) {
      final msg = err.toString();
      steps.add(EnsureAccountStep(
        id: 'directory',
        label: 'Find People public directory',
        labelBn: 'মানুষ খুঁজুন পাবলিক ডিরেক্টরি',
        status: 'error',
        detail: 'Directory sync failed: $msg',
        detailBn: 'ডিরেক্টরি সিঙ্ক ব্যর্থ: $msg',
      ));
    }

    // 3. Ensure welcome notifications exist in /users/{uid}/notifications
    try {
      final notifRes =
          await NotificationService.instance.seedStarterNotificationsOnce(
        fbUser,
        refreshedUser,
        forceCheck: force,
      );
      if (notifRes.error != null) {
        steps.add(EnsureAccountStep(
          id: 'notifications',
          label: 'Welcome notifications',
          labelBn: 'স্বাগতম নোটিফিকেশন',
          status: 'error',
          detail: 'Could not verify notifications: ${notifRes.error}',
          detailBn: 'নোটিফিকেশন যাচাই ব্যর্থ: ${notifRes.error}',
        ));
      } else if (notifRes.createdCount > 0) {
        steps.add(EnsureAccountStep(
          id: 'notifications',
          label: 'Welcome notifications',
          labelBn: 'স্বাগতম নোটিফিকেশন',
          status: 'fixed',
          detail: 'Restored ${notifRes.createdCount} starter notification(s)',
          detailBn:
              '${notifRes.createdCount}টি স্বাগতম নোটিফিকেশন পুনরুদ্ধার করা হয়েছে',
        ));
      } else {
        steps.add(EnsureAccountStep(
          id: 'notifications',
          label: 'Welcome notifications',
          labelBn: 'স্বাগতম নোটিফিকেশন',
          status: 'ok',
          detail:
              '${notifRes.alreadyHadCount} notification(s) already present',
          detailBn: '${notifRes.alreadyHadCount}টি নোটিফিকেশন ইতিমধ্যে রয়েছে',
        ));
      }
    } catch (err) {
      final msg = err.toString();
      steps.add(EnsureAccountStep(
        id: 'notifications',
        label: 'Welcome notifications',
        labelBn: 'স্বাগতম নোটিফিকেশন',
        status: 'error',
        detail: msg,
        detailBn: msg,
      ));
    }

    // 4. Ensure "Rizik Team" welcome conversation + messages exist
    try {
      final convRes =
          await MessengerService.instance.seedStarterDemoConversationsOnce(
        fbUser,
        refreshedUser,
        forceCheck: force,
      );
      if (convRes.status == 'error') {
        steps.add(EnsureAccountStep(
          id: 'welcome_chat',
          label: 'Rizik Team welcome chat',
          labelBn: 'Rizik টিম স্বাগতম চ্যাট',
          status: 'error',
          detail: 'Failed to verify welcome chat: ${convRes.error}',
          detailBn: 'স্বাগতম চ্যাট যাচাই ব্যর্থ: ${convRes.error}',
        ));
      } else if (convRes.status == 'created' || convRes.status == 'repaired') {
        steps.add(EnsureAccountStep(
          id: 'welcome_chat',
          label: 'Rizik Team welcome chat',
          labelBn: 'Rizik টিম স্বাগতম চ্যাট',
          status: 'fixed',
          detail: convRes.status == 'created'
              ? 'Created Rizik Team welcome conversation'
              : 'Repaired missing welcome messages in Rizik Team chat',
          detailBn: convRes.status == 'created'
              ? 'Rizik টিম স্বাগতম চ্যাট তৈরি করা হয়েছে'
              : 'Rizik টিম চ্যাটের অনুপস্থিত বার্তা ঠিক করা হয়েছে',
        ));
      } else {
        steps.add(EnsureAccountStep(
          id: 'welcome_chat',
          label: 'Rizik Team welcome chat',
          labelBn: 'Rizik টিম স্বাগতম চ্যাট',
          status: 'ok',
          detail: 'Rizik Team welcome thread active',
          detailBn: 'Rizik টিম চ্যাট সক্রিয় রয়েছে',
        ));
      }
    } catch (err) {
      final msg = err.toString();
      steps.add(EnsureAccountStep(
        id: 'welcome_chat',
        label: 'Rizik Team welcome chat',
        labelBn: 'Rizik টিম স্বাগতম চ্যাট',
        status: 'error',
        detail: msg,
        detailBn: msg,
      ));
    }

    // 5. Ensure membership in all existing community rooms
    try {
      final roomsSnap =
          await getDocsResilient(db.collection('rooms'), db: db);
      if (roomsSnap.docs.isEmpty) {
        steps.add(const EnsureAccountStep(
          id: 'rooms',
          label: 'Community rooms membership',
          labelBn: 'কমিউনিটি রুম সদস্যপদ',
          status: 'ok',
          detail: 'No community rooms found in Firestore yet (admin can seed rooms)',
          detailBn: 'এখনো কোনো কমিউনিটি রুম সিড করা হয়নি',
        ));
      } else {
        var createdRooms = 0;
        var updatedRooms = 0;
        var failedRooms = 0;
        for (final rDoc in roomsSnap.docs) {
          final res =
              await CommunityRoomsService.instance.ensureRoomMemberPresence(
            rDoc.id,
            refreshedUser,
            online: true,
          );
          if (!res.ok) {
            failedRooms += 1;
          } else if (res.action == 'created') {
            createdRooms += 1;
          } else {
            updatedRooms += 1;
          }
        }
        steps.add(EnsureAccountStep(
          id: 'rooms',
          label: 'Community rooms membership',
          labelBn: 'কমিউনিটি রুম সদস্যপদ',
          status: failedRooms > 0
              ? 'error'
              : createdRooms > 0
                  ? 'fixed'
                  : 'ok',
          detail: failedRooms > 0
              ? 'Synced ${createdRooms + updatedRooms} room(s), failed $failedRooms'
              : createdRooms > 0
                  ? 'Joined $createdRooms community room(s) ($updatedRooms already joined)'
                  : 'Active member in all $updatedRooms community room(s)',
          detailBn: failedRooms > 0
              ? '${createdRooms + updatedRooms}টি রুমে যুক্ত, $failedRoomsটি ব্যর্থ'
              : createdRooms > 0
                  ? '$createdRoomsটি কমিউনিটি রুমে যুক্ত হয়েছেন'
                  : '$updatedRoomsটি কমিউনিটি রুমে সক্রিয় সদস্য',
        ));
      }
    } catch (err) {
      final msg = err.toString();
      steps.add(EnsureAccountStep(
        id: 'rooms',
        label: 'Community rooms membership',
        labelBn: 'কমিউনিটি রুম সদস্যপদ',
        status: 'error',
        detail: 'Could not sync community rooms: $msg',
        detailBn: 'কমিউনিটি রুম সিঙ্ক ব্যর্থ: $msg',
      ));
    }

    final fixedCount = steps.where((s) => s.status == 'fixed').length;
    final errorCount = steps.where((s) => s.status == 'error').length;

    return EnsureAccountReport(
      ranAt: DateTime.now().toIso8601String(),
      overallOk: errorCount == 0,
      fixedCount: fixedCount,
      errorCount: errorCount,
      steps: steps,
      refreshedUser: refreshedUser,
    );
  }
}
