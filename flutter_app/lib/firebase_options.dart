import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

/// Firebase configuration synced with `/firebase-applet-config.json`.
class DefaultFirebaseOptions {
  static const String firestoreDatabaseId =
      'ai-studio-nourishloop-73bca805-3fbc-4853-bf13-b6677e5fc115';

  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      return web;
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
      case TargetPlatform.macOS:
        return ios;
      default:
        return web;
    }
  }

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'AIzaSyD4bOumO00n2cBTFOLLuOd3bMolLPiUUuA',
    appId: '1:318012951605:web:d50cbb3dc67ed20178b57c',
    messagingSenderId: '318012951605',
    projectId: 'ahar-for-all-58560',
    authDomain: 'ahar-for-all-58560.firebaseapp.com',
    databaseURL: 'https://ahar-for-all-58560-default-rtdb.firebaseio.com',
    storageBucket: 'ahar-for-all-58560.firebasestorage.app',
  );

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyD4bOumO00n2cBTFOLLuOd3bMolLPiUUuA',
    appId: '1:318012951605:web:d50cbb3dc67ed20178b57c',
    messagingSenderId: '318012951605',
    projectId: 'ahar-for-all-58560',
    databaseURL: 'https://ahar-for-all-58560-default-rtdb.firebaseio.com',
    storageBucket: 'ahar-for-all-58560.firebasestorage.app',
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'AIzaSyD4bOumO00n2cBTFOLLuOd3bMolLPiUUuA',
    appId: '1:318012951605:web:d50cbb3dc67ed20178b57c',
    messagingSenderId: '318012951605',
    projectId: 'ahar-for-all-58560',
    authDomain: 'ahar-for-all-58560.firebaseapp.com',
    databaseURL: 'https://ahar-for-all-58560-default-rtdb.firebaseio.com',
    storageBucket: 'ahar-for-all-58560.firebasestorage.app',
    iosBundleId: 'org.aharforall.app',
  );
}
