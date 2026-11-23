import 'dart:async';
import 'package:firebase_auth/firebase_auth.dart' as fb_auth;
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import '../models/models.dart';
import '../services/api_service.dart';
import '../services/firestore_service.dart';
import '../services/messenger_service.dart';
import '../services/notification_service.dart';

class AuthProvider extends ChangeNotifier {
  AppUser? _user;
  fb_auth.User? _firebaseUser;
  bool _booting = true;
  bool _isAdmin = false;
  Timer? _presenceTimer;
  StreamSubscription<AppUser>? _userSub;

  AuthProvider() {
    _bootstrap();
  }

  AppUser? get user => _user;
  fb_auth.User? get firebaseUser => _firebaseUser;
  bool get isLoggedIn => _user != null;
  bool get booting => _booting;
  bool get isAdmin => _isAdmin || _user?.role == UserRole.admin;
  bool get isFirebaseSession => _firebaseUser != null;
  bool get isFirebaseVerified => _firebaseUser?.emailVerified == true;

  void _stopFirebaseSideEffects() {
    _presenceTimer?.cancel();
    _presenceTimer = null;
    _userSub?.cancel();
    _userSub = null;
  }

  void _startFirebaseSideEffects(fb_auth.User fbUser, AppUser initialUser) {
    _stopFirebaseSideEffects();
    if (!fbUser.emailVerified) return;

    unawaited(
      MessengerService.instance
          .syncUserDirectoryProfile(fbUser, initialUser, online: true)
          .catchError((_) {}),
    );
    unawaited(
      MessengerService.instance
          .seedStarterDemoConversationsOnce(fbUser, initialUser)
          .catchError((_) {}),
    );
    unawaited(
      NotificationService.instance
          .seedStarterNotificationsOnce(fbUser, initialUser)
          .catchError((_) {}),
    );

    _presenceTimer = Timer.periodic(const Duration(seconds: 60), (_) {
      final current = _user;
      if (_firebaseUser != null &&
          _firebaseUser!.emailVerified &&
          current != null) {
        unawaited(
          MessengerService.instance
              .syncUserDirectoryProfile(_firebaseUser!, current, online: true)
              .catchError((_) {}),
        );
      }
    });

    _userSub = FirestoreService.instance
        .watchMyFirebaseUser(fbUser, isAdmin: _isAdmin)
        .listen((nextUser) {
      _user = nextUser;
      notifyListeners();
    });
  }

  Future<void> _bootstrap() async {
    try {
      final token = await ApiService.instance.getStoredToken();
      if (token != null && token.isNotEmpty) {
        _user = await ApiService.instance.getMe();
        _isAdmin = _user?.role == UserRole.admin;
        await ApiService.instance.connectWebSocket();
      } else {
        final fbUser = fb_auth.FirebaseAuth.instance.currentUser;
        _firebaseUser = fbUser;
        if (fbUser != null && fbUser.emailVerified) {
          _user = await FirestoreService.instance.syncUserProfile(fbUser);
          _isAdmin = _user?.isAdmin == true;
          _startFirebaseSideEffects(fbUser, _user!);
          await ApiService.instance.connectWebSocket();
        }
      }
    } catch (_) {
      await ApiService.instance.setStoredToken(null);
    } finally {
      _booting = false;
      notifyListeners();
    }
  }

  Future<void> loginWithPassword(String identifier, String password) async {
    _stopFirebaseSideEffects();
    final session = await ApiService.instance.login(identifier, password);
    _user = session.user;
    _firebaseUser = null;
    _isAdmin = session.user.role == UserRole.admin;
    await ApiService.instance.connectWebSocket();
    notifyListeners();
  }

  Future<void> registerExpress(Map<String, dynamic> payload) async {
    _stopFirebaseSideEffects();
    final session = await ApiService.instance.register(payload);
    _user = session.user;
    _firebaseUser = null;
    _isAdmin = session.user.role == UserRole.admin;
    await ApiService.instance.connectWebSocket();
    notifyListeners();
  }

  Future<void> demoLogin(String userId) async {
    _stopFirebaseSideEffects();
    final session = await ApiService.instance.demoLogin(userId);
    _user = session.user;
    _firebaseUser = null;
    _isAdmin = session.user.role == UserRole.admin;
    await ApiService.instance.connectWebSocket();
    notifyListeners();
  }

  Future<void> signInWithGoogle() async {
    late fb_auth.UserCredential cred;
    if (kIsWeb) {
      final provider = fb_auth.GoogleAuthProvider();
      provider.setCustomParameters({'prompt': 'select_account'});
      cred = await fb_auth.FirebaseAuth.instance.signInWithPopup(provider);
    } else {
      final googleUser = await GoogleSignIn().signIn();
      if (googleUser == null) {
        throw Exception('Google sign-in cancelled.');
      }
      final googleAuth = await googleUser.authentication;
      final oauthCred = fb_auth.GoogleAuthProvider.credential(
        accessToken: googleAuth.accessToken,
        idToken: googleAuth.idToken,
      );
      cred = await fb_auth.FirebaseAuth.instance.signInWithCredential(oauthCred);
    }

    final fbUser = cred.user;
    if (fbUser == null || !fbUser.emailVerified) {
      await fb_auth.FirebaseAuth.instance.signOut();
      throw Exception('Please use a Google account with a verified email.');
    }

    await ApiService.instance.setStoredToken(null);
    _firebaseUser = fbUser;
    _user = await FirestoreService.instance.syncUserProfile(fbUser);
    _isAdmin = _user?.isAdmin == true;
    _startFirebaseSideEffects(fbUser, _user!);
    await ApiService.instance.connectWebSocket();
    notifyListeners();
  }

  Future<void> signInWithFirebaseEmail(String email, String password) async {
    final cred = await fb_auth.FirebaseAuth.instance
        .signInWithEmailAndPassword(email: email, password: password);
    final fbUser = cred.user;
    if (fbUser == null) throw Exception('Authentication failed.');
    await ApiService.instance.setStoredToken(null);
    _firebaseUser = fbUser;
    if (fbUser.emailVerified) {
      _user = await FirestoreService.instance.syncUserProfile(fbUser);
      _isAdmin = _user?.isAdmin == true;
      _startFirebaseSideEffects(fbUser, _user!);
      await ApiService.instance.connectWebSocket();
    } else {
      _user = FirestoreService.instance.buildAppUser(fbUser);
    }
    notifyListeners();
  }

  Future<void> signUpWithFirebaseEmail({
    required String name,
    required String email,
    required String password,
    required String area,
    String? phone,
    String? organizationName,
    RestaurantInfo? restaurant,
  }) async {
    final cred = await fb_auth.FirebaseAuth.instance
        .createUserWithEmailAndPassword(email: email, password: password);
    final fbUser = cred.user!;
    await fbUser.updateDisplayName(name);
    await fbUser.sendEmailVerification();
    await ApiService.instance.setStoredToken(null);
    _firebaseUser = fbUser;
    _pendingSignupPatch = {
      'displayName': name,
      'area': area,
      'accountType': restaurant != null ? 'restaurantOwner' : 'user',
      if (phone != null) 'phone': phone,
      if (organizationName != null) 'organizationName': organizationName,
    };
    _pendingRestaurant = restaurant;
    _user = FirestoreService.instance.buildAppUser(
      fbUser,
      pubData: {
        'name': name,
        'area': area,
        'role': restaurant != null ? 'restaurantOwner' : 'user',
        if (organizationName != null) 'organizationName': organizationName,
        if (restaurant != null) 'restaurant': restaurant.toJson(),
      },
      privData: {'email': email, if (phone != null) 'phone': phone},
    );
    notifyListeners();
  }

  Map<String, dynamic>? _pendingSignupPatch;
  RestaurantInfo? _pendingRestaurant;

  Future<bool> refreshVerification() async {
    final current = fb_auth.FirebaseAuth.instance.currentUser;
    if (current == null) return false;
    await current.reload();
    final reloaded = fb_auth.FirebaseAuth.instance.currentUser;
    if (reloaded != null && reloaded.emailVerified) {
      await reloaded.getIdToken(true);
      _firebaseUser = reloaded;
      _user = await FirestoreService.instance.syncUserProfile(
        reloaded,
        initialPatch: _pendingSignupPatch,
        initialRestaurant: _pendingRestaurant,
      );
      _pendingSignupPatch = null;
      _pendingRestaurant = null;
      _isAdmin = _user?.isAdmin == true;
      _startFirebaseSideEffects(reloaded, _user!);
      await ApiService.instance.connectWebSocket();
      notifyListeners();
      return true;
    }
    return false;
  }

  void updateUser(AppUser next) {
    _user = next;
    notifyListeners();
  }

  Future<void> logout() async {
    final prevFbUser = _firebaseUser;
    final prevUser = _user;
    _stopFirebaseSideEffects();
    if (prevFbUser != null && prevFbUser.emailVerified && prevUser != null) {
      try {
        await MessengerService.instance.syncUserDirectoryProfile(
          prevFbUser,
          prevUser,
          online: false,
        );
      } catch (_) {}
    }
    await ApiService.instance.logout();
    try {
      await fb_auth.FirebaseAuth.instance.signOut();
    } catch (_) {}
    _user = null;
    _firebaseUser = null;
    _isAdmin = false;
    notifyListeners();
  }

  @override
  void dispose() {
    _stopFirebaseSideEffects();
    super.dispose();
  }
}
