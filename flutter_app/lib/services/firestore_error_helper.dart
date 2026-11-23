import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import '../firebase_options.dart';

class FirestoreListenerError implements Exception {
  final String code;
  final String message;
  final String operationType;
  final String path;
  final bool isPermissionError;
  final bool isIndexError;
  final bool isOfflineError;
  final String? indexUrl;
  final Object? rawError;

  const FirestoreListenerError({
    required this.code,
    required this.message,
    required this.operationType,
    required this.path,
    required this.isPermissionError,
    required this.isIndexError,
    required this.isOfflineError,
    this.indexUrl,
    this.rawError,
  });

  String toFriendlyMessage({bool isBn = false}) {
    if (isOfflineError) {
      return isBn
          ? 'ক্লায়েন্ট অফলাইন (unavailable) — ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।'
          : 'Network unavailable ($code). Check your internet connection and retry.';
    }
    if (isPermissionError) {
      return isBn
          ? 'অনুমতি অস্বীকৃত ($code) — অনুগ্রহ করে নিশ্চিত করুন আপনার ইমেইল যাচাই করা আছে এবং হেলথ চেক চালান।'
          : 'Permission denied ($code) on $path. Please ensure your email is verified and run a health check.';
    }
    if (isIndexError) {
      return isBn
          ? 'ডাটাবেস ইনডেক্স প্রয়োজন ($code) — অ্যাডমিন হেলথ চেক থেকে ইনডেক্স লিঙ্কটি দেখুন।'
          : 'Database index required ($code) for $path. Run health check for the index setup link.';
    }
    return isBn
        ? 'ডাটা লোড করা যায়নি ($code): $message'
        : 'Could not load data ($code): $message';
  }

  @override
  String toString() => '[$operationType @ $path] ($code) $message';
}

bool isFirestoreOfflineError(Object? error) {
  if (error == null) return false;
  if (error is FirebaseException && error.code == 'unavailable') return true;
  final msg = error.toString().toLowerCase();
  return msg.contains('client is offline') ||
      msg.contains('failed to get document because the client is offline') ||
      msg.contains('unavailable');
}

String? _extractIndexUrl(String raw) {
  final match = RegExp(
    r'https://console\.firebase\.google\.com/[^\s"\x27)]+',
  ).firstMatch(raw);
  return match?.group(0);
}

FirestoreListenerError parseFirestoreListenerError(
  Object error,
  String operationType,
  String path,
) {
  var code = 'unknown';
  var message = error.toString();

  if (error is FirebaseException) {
    code = error.code;
    message = error.message ?? error.toString();
  } else {
    final lower = message.toLowerCase();
    if (lower.contains('permission-denied')) {
      code = 'permission-denied';
    } else if (lower.contains('failed-precondition') || lower.contains('index')) {
      code = 'failed-precondition';
    } else if (lower.contains('unavailable') || lower.contains('offline')) {
      code = 'unavailable';
    } else if (lower.contains('not-found')) {
      code = 'not-found';
    }
  }

  final lowerMsg = message.toLowerCase();
  final isPerm = code == 'permission-denied' ||
      lowerMsg.contains('missing or insufficient permissions');
  final isIdx =
      code == 'failed-precondition' || lowerMsg.contains('requires an index');
  final isOffline = code == 'unavailable' || isFirestoreOfflineError(error);
  final indexUrl = _extractIndexUrl(message);

  debugPrint(
    '[Firestore Error] [$operationType] path="$path" code="$code" '
    'msg="$message"${indexUrl != null ? ' indexUrl=$indexUrl' : ''}',
  );

  return FirestoreListenerError(
    code: code,
    message: message,
    operationType: operationType,
    path: path,
    isPermissionError: isPerm,
    isIndexError: isIdx,
    isOfflineError: isOffline,
    indexUrl: indexUrl,
    rawError: error,
  );
}

Future<bool> reconnectFirestore(FirebaseFirestore db) async {
  try {
    await db.enableNetwork();
    return true;
  } catch (e) {
    debugPrint('[Firestore] reconnectFirestore failed: $e');
    return false;
  }
}

Future<DocumentSnapshot<Map<String, dynamic>>> getDocResilient(
  DocumentReference<Map<String, dynamic>> ref, {
  FirebaseFirestore? db,
}) async {
  try {
    return await ref.get();
  } catch (err) {
    if (!isFirestoreOfflineError(err)) rethrow;

    if (db != null) {
      await reconnectFirestore(db);
      try {
        return await ref.get();
      } catch (_) {}
    }

    try {
      return await ref.get(const GetOptions(source: Source.cache));
    } catch (_) {
      rethrow;
    }
  }
}

Future<QuerySnapshot<Map<String, dynamic>>> getDocsResilient(
  Query<Map<String, dynamic>> q, {
  FirebaseFirestore? db,
}) async {
  try {
    return await q.get();
  } catch (err) {
    if (!isFirestoreOfflineError(err)) rethrow;

    if (db != null) {
      await reconnectFirestore(db);
      try {
        return await q.get();
      } catch (_) {}
    }

    try {
      return await q.get(const GetOptions(source: Source.cache));
    } catch (_) {
      rethrow;
    }
  }
}

String formatAuthError(Object error) {
  final raw = error.toString();
  if (isFirestoreOfflineError(error)) {
    return 'Cannot reach Firebase servers right now because the device appears offline. '
        'Check your internet connection or tap Retry.';
  }
  if (raw.contains('wrong-password') || raw.contains('invalid-credential')) {
    return 'Incorrect email or password. Please try again.';
  }
  if (raw.contains('user-not-found')) {
    return 'No account found with this email.';
  }
  if (raw.contains('email-already-in-use')) {
    return 'An account with this email already exists.';
  }
  if (raw.contains('network-request-failed')) {
    return 'Network error communicating with Firebase. Please check your connection.';
  }
  if (raw.startsWith('Exception: ')) {
    return raw.substring('Exception: '.length);
  }
  return raw;
}

class FirebaseConfigHealth {
  final bool ok;
  final String projectId;
  final String firestoreDatabaseId;
  final bool hasStorageBucket;
  final bool hasRtdbUrl;
  final List<String> missingKeys;

  const FirebaseConfigHealth({
    required this.ok,
    required this.projectId,
    required this.firestoreDatabaseId,
    required this.hasStorageBucket,
    required this.hasRtdbUrl,
    required this.missingKeys,
  });
}

FirebaseConfigHealth getFirebaseConfigHealth() {
  final opts = DefaultFirebaseOptions.currentPlatform;
  final dbId = DefaultFirebaseOptions.firestoreDatabaseId;
  final missing = <String>[];
  if (opts.apiKey.isEmpty) missing.add('apiKey');
  if (opts.projectId.isEmpty) missing.add('projectId');
  if (opts.appId.isEmpty) missing.add('appId');
  if (opts.messagingSenderId.isEmpty) missing.add('messagingSenderId');
  if (dbId.isEmpty) missing.add('firestoreDatabaseId');

  return FirebaseConfigHealth(
    ok: missing.isEmpty,
    projectId: opts.projectId,
    firestoreDatabaseId: dbId,
    hasStorageBucket: (opts.storageBucket ?? '').isNotEmpty,
    hasRtdbUrl: (opts.databaseURL ?? '').isNotEmpty,
    missingKeys: missing,
  );
}
