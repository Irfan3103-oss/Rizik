import 'dart:async';
import 'dart:convert';
import 'package:firebase_auth/firebase_auth.dart' as fb_auth;
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../models/models.dart';

class ApiService {
  ApiService._();
  static final ApiService instance = ApiService._();

  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );

  static const String _tokenKey = 'aharforall_token';
  static const String _feedCacheKey = 'aharforall_feed_cache';

  WebSocketChannel? _ws;
  // Reconnect/keepalive state: hosted servers and mobile networks drop idle sockets.
  bool _wsWanted = false;
  int _wsAttempt = 0;
  Timer? _wsReconnectTimer;
  Timer? _wsPingTimer;
  final StreamController<Map<String, dynamic>> _wsEvents =
      StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get wsEvents => _wsEvents.stream;

  String resolveMediaUrl(String? raw) {
    if (raw == null || raw.isEmpty) {
      return '$baseUrl/images/kacchi-biryani.jpg';
    }
    if (raw.startsWith('http://') ||
        raw.startsWith('https://') ||
        raw.startsWith('data:')) {
      return raw;
    }
    return '$baseUrl${raw.startsWith('/') ? raw : '/$raw'}';
  }

  Future<String?> getStoredToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_tokenKey);
  }

  Future<void> setStoredToken(String? token) async {
    final prefs = await SharedPreferences.getInstance();
    if (token != null && token.isNotEmpty) {
      await prefs.setString(_tokenKey, token);
    } else {
      await prefs.remove(_tokenKey);
    }
  }

  Future<String?> getAuthBearerToken({bool forceRefresh = false}) async {
    final stored = await getStoredToken();
    if (stored != null && stored.isNotEmpty) return stored;
    final fbUser = fb_auth.FirebaseAuth.instance.currentUser;
    if (fbUser != null && fbUser.emailVerified) {
      final idToken = await fbUser.getIdToken(forceRefresh);
      if (idToken != null) return 'fb:$idToken';
    }
    return null;
  }

  Future<Map<String, dynamic>> _request(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
  }) async {
    final token = await getAuthBearerToken();
    final headers = <String, String>{
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };

    final uri = Uri.parse('$baseUrl$path');
    late http.Response res;
    switch (method) {
      case 'POST':
        res = await http.post(uri, headers: headers, body: jsonEncode(body ?? {}));
        break;
      case 'PATCH':
        res = await http.patch(uri, headers: headers, body: jsonEncode(body ?? {}));
        break;
      case 'DELETE':
        res = await http.delete(uri, headers: headers);
        break;
      default:
        res = await http.get(uri, headers: headers);
        break;
    }

    final decoded = res.body.isNotEmpty
        ? (jsonDecode(res.body) as Map<String, dynamic>)
        : <String, dynamic>{};

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception(decoded['error']?.toString() ?? 'Request failed (${res.statusCode})');
    }
    return decoded;
  }

  // --- WebSocket ---
  Future<void> connectWebSocket() async {
    _wsWanted = true;
    _wsReconnectTimer?.cancel();
    final token = await getAuthBearerToken();
    if (token == null) {
      _wsWanted = false;
      return;
    }
    await _closeWebSocket();
    // A concurrent connect may have opened a socket while we awaited; drop it.
    _wsPingTimer?.cancel();
    _ws?.sink.close();
    final wsBase = baseUrl.replaceFirst('https://', 'wss://').replaceFirst('http://', 'ws://');
    final uri = Uri.parse('$wsBase/ws?token=${Uri.encodeComponent(token)}');
    final channel = WebSocketChannel.connect(uri);
    _ws = channel;
    channel.stream.listen(
      (raw) {
        _wsAttempt = 0; // server answered: reset backoff
        try {
          final map = jsonDecode(raw.toString()) as Map<String, dynamic>;
          _wsEvents.add(map);
        } catch (_) {}
      },
      onError: (_) => _onWebSocketClosed(channel),
      onDone: () => _onWebSocketClosed(channel),
      cancelOnError: true,
    );
    // The server answers {"event":"ping"} with pong; the web client pings every 25 s.
    _wsPingTimer = Timer.periodic(const Duration(seconds: 25), (_) {
      try {
        channel.sink.add(jsonEncode({'event': 'ping'}));
      } catch (_) {}
    });
  }

  void _onWebSocketClosed(WebSocketChannel channel) {
    if (!identical(channel, _ws)) return; // an older socket we already replaced
    _wsPingTimer?.cancel();
    _wsPingTimer = null;
    _ws = null;
    if (!_wsWanted) return;
    // Backoff 1s, 2s, 4s... capped at 30s.
    final delaySec = (1 << _wsAttempt.clamp(0, 5)).clamp(1, 30);
    _wsAttempt++;
    _wsReconnectTimer?.cancel();
    _wsReconnectTimer = Timer(Duration(seconds: delaySec), () {
      if (_wsWanted) connectWebSocket();
    });
  }

  Future<void> _closeWebSocket() async {
    _wsPingTimer?.cancel();
    _wsPingTimer = null;
    final old = _ws;
    _ws = null;
    await old?.sink.close();
  }

  Future<void> disconnectWebSocket() async {
    _wsWanted = false;
    _wsAttempt = 0;
    _wsReconnectTimer?.cancel();
    _wsReconnectTimer = null;
    await _closeWebSocket();
  }

  void sendTyping(String conversationId, bool isTyping) {
    _ws?.sink.add(jsonEncode({
      'event': 'chat:typing',
      'data': {'conversationId': conversationId, 'isTyping': isTyping},
    }));
  }

  // --- Auth ---
  Future<AuthSession> login(String identifier, String password) async {
    final data = await _request('/api/auth/login',
        method: 'POST', body: {'identifier': identifier, 'password': password});
    final token = data['token'].toString();
    await setStoredToken(token);
    return AuthSession(
      token: token,
      user: AppUser.fromJson(data['user'] as Map<String, dynamic>),
    );
  }

  Future<AuthSession> register(Map<String, dynamic> payload) async {
    final data = await _request('/api/auth/register', method: 'POST', body: payload);
    final token = data['token'].toString();
    await setStoredToken(token);
    return AuthSession(
      token: token,
      user: AppUser.fromJson(data['user'] as Map<String, dynamic>),
    );
  }

  Future<String> forgotPassword(String identifier) async {
    final data = await _request('/api/auth/forgot-password',
        method: 'POST', body: {'identifier': identifier});
    return data['devOtpHint']?.toString() ?? '';
  }

  Future<void> resetPassword(String identifier, String code, String newPassword) async {
    await _request('/api/auth/reset-password', method: 'POST', body: {
      'identifier': identifier,
      'code': code,
      'newPassword': newPassword,
    });
  }

  Future<List<Map<String, dynamic>>> getDemoAccounts() async {
    final data = await _request('/api/auth/demo-accounts');
    return (data['accounts'] as List?)?.cast<Map<String, dynamic>>() ?? [];
  }

  Future<AuthSession> demoLogin(String userId) async {
    final data = await _request('/api/auth/demo-login',
        method: 'POST', body: {'userId': userId});
    final token = data['token'].toString();
    await setStoredToken(token);
    return AuthSession(
      token: token,
      user: AppUser.fromJson(data['user'] as Map<String, dynamic>),
    );
  }

  Future<AppUser> getMe() async {
    final data = await _request('/api/auth/me');
    return AppUser.fromJson(data['user'] as Map<String, dynamic>);
  }

  Future<AppUser> updateProfile(Map<String, dynamic> payload) async {
    final data = await _request('/api/auth/profile', method: 'PATCH', body: payload);
    return AppUser.fromJson(data['user'] as Map<String, dynamic>);
  }

  Future<void> logout() async {
    try {
      await _request('/api/auth/logout', method: 'POST');
    } catch (_) {}
    await setStoredToken(null);
    await disconnectWebSocket();
  }

  // --- Home & Listings ---
  Future<HomeSummary> getHomeSummary() async {
    final data = await _request('/api/home-summary');
    return HomeSummary.fromJson(data);
  }

  Future<List<Listing>> getListings({
    double lat = 23.765,
    double lng = 90.391,
    double? radiusKm,
    String? category,
    List<String>? dietary,
    int? pickupWithinMin,
    String? search,
    String? donorId,
    bool includeAll = false,
    bool flashOnly = false,
    bool ramadanOnly = false,
  }) async {
    final qs = <String, String>{
      'lat': lat.toString(),
      'lng': lng.toString(),
      if (radiusKm != null) 'radiusKm': radiusKm.toString(),
      if (category != null && category != 'all') 'category': category,
      if (dietary != null && dietary.isNotEmpty) 'dietary': dietary.join(','),
      if (pickupWithinMin != null) 'pickupWithinMin': pickupWithinMin.toString(),
      if (search != null && search.isNotEmpty) 'search': search,
      if (donorId != null) 'donorId': donorId,
      if (includeAll) 'includeAll': 'true',
      if (flashOnly) 'flashOnly': 'true',
      if (ramadanOnly) 'ramadanOnly': 'true',
    };
    final uri = Uri(path: '/api/listings', queryParameters: qs);
    final data = await _request(uri.toString());
    final raw = (data['listings'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    final items = raw.map(Listing.fromJson).toList();
    if (!includeAll) {
      await _cacheListings(raw);
    }
    return items;
  }

  Future<void> _cacheListings(List<Map<String, dynamic>> raw) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_feedCacheKey, jsonEncode(raw));
    } catch (_) {}
  }

  Future<List<Listing>> getCachedListings() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final str = prefs.getString(_feedCacheKey);
      if (str == null) return [];
      final raw = (jsonDecode(str) as List).cast<Map<String, dynamic>>();
      return raw.map(Listing.fromJson).toList();
    } catch (_) {
      return [];
    }
  }

  Future<String> createListing(Map<String, dynamic> payload) async {
    final data = await _request('/api/listings', method: 'POST', body: payload);
    return data['id'].toString();
  }

  Future<void> updateListing(String id, Map<String, dynamic> payload) async {
    await _request('/api/listings/$id', method: 'PATCH', body: payload);
  }

  Future<void> deleteListing(String id) async {
    await _request('/api/listings/$id', method: 'DELETE');
  }

  // --- Claims ---
  Future<({List<Claim> claims, int usedToday, int dailyLimit})> getClaims(
      String scope) async {
    final data = await _request('/api/claims?scope=$scope');
    final list = (data['claims'] as List?)
            ?.map((c) => Claim.fromJson(c as Map<String, dynamic>))
            .toList() ??
        [];
    final quota = (data['quota'] as Map<String, dynamic>?) ?? {};
    return (
      claims: list,
      usedToday: (quota['usedToday'] as num?)?.toInt() ?? 0,
      dailyLimit: (quota['dailyLimit'] as num?)?.toInt() ?? 3,
    );
  }

  Future<({String claimId, String conversationId, String pickupCode})> createClaim(
    String listingId,
    int quantityClaimed, {
    String? notes,
  }) async {
    final data = await _request('/api/claims', method: 'POST', body: {
      'listingId': listingId,
      'quantityClaimed': quantityClaimed,
      if (notes != null && notes.isNotEmpty) 'notes': notes,
    });
    return (
      claimId: data['claimId'].toString(),
      conversationId: data['conversationId'].toString(),
      pickupCode: data['pickupCode'].toString(),
    );
  }

  Future<void> updateClaimStatus(
    String claimId,
    String status, {
    String? pickupCode,
    String? cancelReason,
    String handoverMethod = 'manual',
  }) async {
    await _request('/api/claims/$claimId/status', method: 'PATCH', body: {
      'status': status,
      if (pickupCode != null) 'pickupCode': pickupCode,
      if (cancelReason != null) 'cancelReason': cancelReason,
      'handoverMethod': handoverMethod,
    });
  }

  Future<void> submitClaimReview(
    String claimId, {
    required int rating,
    required bool hygieneOk,
    String? comment,
  }) async {
    await _request('/api/claims/$claimId/review', method: 'POST', body: {
      'rating': rating,
      'hygieneOk': hygieneOk,
      if (comment != null && comment.isNotEmpty) 'comment': comment,
    });
  }

  // --- Conversations & Chat ---
  Future<List<Conversation>> getConversations() async {
    final data = await _request('/api/conversations');
    return (data['conversations'] as List?)
            ?.map((c) => Conversation.fromJson(c as Map<String, dynamic>))
            .toList() ??
        [];
  }

  Future<List<PlatformUserSummary>> getUsers() async {
    final data = await _request('/api/users');
    return (data['users'] as List?)
            ?.map((u) => PlatformUserSummary.fromJson(u as Map<String, dynamic>))
            .toList() ??
        [];
  }

  Future<String> openDirectConversation(String targetUserId) async {
    final data = await _request('/api/conversations/direct',
        method: 'POST', body: {'targetUserId': targetUserId});
    return data['conversationId'].toString();
  }

  Future<String> openShopConversation(String donorId, {String? listingId}) async {
    final data = await _request('/api/conversations/with-donor',
        method: 'POST',
        body: {'donorId': donorId, if (listingId != null) 'listingId': listingId});
    return data['conversationId'].toString();
  }

  Future<List<ChatMessage>> getMessages(String conversationId) async {
    final data = await _request('/api/conversations/$conversationId/messages');
    return (data['messages'] as List?)
            ?.map((m) => ChatMessage.fromJson(m as Map<String, dynamic>))
            .toList() ??
        [];
  }

  Future<void> markConversationRead(String conversationId) async {
    await _request('/api/conversations/$conversationId/read', method: 'POST');
  }

  Future<ChatMessage> sendMessage(
    String conversationId,
    Map<String, dynamic> payload,
  ) async {
    final data = await _request('/api/conversations/$conversationId/messages',
        method: 'POST', body: payload);
    return ChatMessage.fromJson(data['message'] as Map<String, dynamic>);
  }

  Future<void> reactToMessage(String messageId, String emoji) async {
    await _request('/api/messages/$messageId/react',
        method: 'POST', body: {'emoji': emoji});
  }

  Future<String> translateMessage(String text, String targetLang) async {
    final data = await _request('/api/translate',
        method: 'POST', body: {'text': text, 'targetLang': targetLang});
    return data['translated']?.toString() ?? text;
  }

  Future<void> toggleBlock(String targetUserId, {bool unblock = false}) async {
    await _request('/api/blocks',
        method: 'POST', body: {'targetUserId': targetUserId, 'unblock': unblock});
  }

  Future<void> submitReport({
    required String targetType,
    required String targetId,
    required String reason,
    String? details,
  }) async {
    await _request('/api/reports', method: 'POST', body: {
      'targetType': targetType,
      'targetId': targetId,
      'reason': reason,
      if (details != null && details.isNotEmpty) 'details': details,
    });
  }

  Future<String> uploadImageBase64(String dataUrl) async {
    final data = await _request('/api/upload',
        method: 'POST', body: {'dataUrl': dataUrl});
    return data['url'].toString();
  }

  // --- Notifications ---
  Future<List<NotificationItem>> getNotifications() async {
    final data = await _request('/api/notifications');
    return (data['notifications'] as List?)
            ?.map((n) => NotificationItem.fromJson(n as Map<String, dynamic>))
            .toList() ??
        [];
  }

  Future<void> markAllNotificationsRead() async {
    await _request('/api/notifications/read-all', method: 'POST');
  }

  // --- Partners & Testimonials ---
  Future<({List<Partner> partners, List<Testimonial> testimonials, Map<String, dynamic> stats})>
      getPartners() async {
    final data = await _request('/api/partners');
    return (
      partners: (data['partners'] as List?)
              ?.map((p) => Partner.fromJson(p as Map<String, dynamic>))
              .toList() ??
          [],
      testimonials: (data['testimonials'] as List?)
              ?.map((t) => Testimonial.fromJson(t as Map<String, dynamic>))
              .toList() ??
          [],
      stats: (data['stats'] as Map<String, dynamic>?) ?? {},
    );
  }

  Future<void> applyPartner(Map<String, dynamic> payload) async {
    await _request('/api/partners/apply', method: 'POST', body: payload);
  }

  // --- Events ---
  Future<List<CommunityEvent>> getEvents({String? status, String? area}) async {
    final qs = <String, String>{
      if (status != null && status != 'all') 'status': status,
      if (area != null && area != 'all') 'area': area,
    };
    final uri = Uri(path: '/api/events', queryParameters: qs.isEmpty ? null : qs);
    final data = await _request(uri.toString());
    return (data['events'] as List?)
            ?.map((e) => CommunityEvent.fromJson(e as Map<String, dynamic>))
            .toList() ??
        [];
  }

  Future<({CommunityEvent event, List<EventRegistration> registrations})> getEventDetail(
      String eventId) async {
    final data = await _request('/api/events/$eventId');
    return (
      event: CommunityEvent.fromJson(data['event'] as Map<String, dynamic>),
      registrations: (data['registrations'] as List?)
              ?.map((r) => EventRegistration.fromJson(r as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }

  Future<CommunityEvent> createEvent(Map<String, dynamic> payload) async {
    final data = await _request('/api/events', method: 'POST', body: payload);
    return CommunityEvent.fromJson(data['event'] as Map<String, dynamic>);
  }

  Future<void> registerEventVolunteer(
      String eventId, Map<String, dynamic> payload) async {
    await _request('/api/events/$eventId/register', method: 'POST', body: payload);
  }

  Future<bool> toggleEventReminder(String eventId) async {
    final data = await _request('/api/events/$eventId/remind', method: 'POST');
    return data['reminded'] == true;
  }

  // --- Wedding Pickup ---
  Future<List<WeddingPickupRequest>> getWeddingPickups({
    double lat = 23.765,
    double lng = 90.391,
  }) async {
    final data = await _request('/api/wedding-pickups?lat=$lat&lng=$lng');
    return (data['pickups'] as List?)
            ?.map((p) => WeddingPickupRequest.fromJson(p as Map<String, dynamic>))
            .toList() ??
        [];
  }

  Future<WeddingPickupRequest> createWeddingPickup(
      Map<String, dynamic> payload) async {
    final data =
        await _request('/api/wedding-pickups', method: 'POST', body: payload);
    return WeddingPickupRequest.fromJson(data['pickup'] as Map<String, dynamic>);
  }

  Future<WeddingPickupRequest> updateWeddingPickupStatus(
    String pickupId, {
    required WeddingPickupStatus status,
    int? deliveredMeals,
    String? deliveryNote,
  }) async {
    final data = await _request('/api/wedding-pickups/$pickupId/status',
        method: 'PATCH',
        body: {
          'status': weddingStatusToWire(status),
          if (deliveredMeals != null) 'deliveredMeals': deliveredMeals,
          if (deliveryNote != null) 'deliveryNote': deliveryNote,
        });
    return WeddingPickupRequest.fromJson(data['pickup'] as Map<String, dynamic>);
  }

  Future<WeddingPickupRequest> claimWeddingNgo(String pickupId,
      {String? ngoName}) async {
    final data = await _request('/api/wedding-pickups/$pickupId/claim-ngo',
        method: 'POST', body: {if (ngoName != null) 'ngoName': ngoName});
    return WeddingPickupRequest.fromJson(data['pickup'] as Map<String, dynamic>);
  }

  Future<String> openWeddingChat(String pickupId) async {
    final data = await _request('/api/wedding-pickups/$pickupId/open-chat',
        method: 'POST');
    return data['conversationId'].toString();
  }

  // --- Donations ---
  Future<DonationSummary> getDonationSummary() async {
    final data = await _request('/api/donations/summary');
    return DonationSummary.fromJson(data);
  }

  Future<List<DonationRecord>> getMyDonations() async {
    final data = await _request('/api/donations/mine');
    return (data['donations'] as List?)
            ?.map((d) => DonationRecord.fromJson(d as Map<String, dynamic>))
            .toList() ??
        [];
  }

  Future<DonationRecord> submitDonation(Map<String, dynamic> payload) async {
    final data = await _request('/api/donations', method: 'POST', body: payload);
    return DonationRecord.fromJson(data['donation'] as Map<String, dynamic>);
  }

  // --- Impact, Volunteers & Leaderboard ---
  Future<ImpactDashboardData> getImpactDashboard() async {
    final data = await _request('/api/impact-dashboard');
    return ImpactDashboardData.fromJson(data);
  }

  Future<({List<VolunteerShift> shifts, double myTotalHours})> getVolunteerShifts({
    String? area,
    String? role,
  }) async {
    final qs = <String, String>{
      if (area != null && area != 'all') 'area': area,
      if (role != null && role != 'all') 'role': role,
    };
    final uri = Uri(path: '/api/volunteer-shifts', queryParameters: qs.isEmpty ? null : qs);
    final data = await _request(uri.toString());
    return (
      shifts: (data['shifts'] as List?)
              ?.map((s) => VolunteerShift.fromJson(s as Map<String, dynamic>))
              .toList() ??
          [],
      myTotalHours: (data['myTotalHours'] as num?)?.toDouble() ?? 0,
    );
  }

  Future<void> signupVolunteerShift(String shiftId) async {
    await _request('/api/volunteer-shifts/$shiftId/signup', method: 'POST');
  }

  Future<void> updateVolunteerShiftStatus(String shiftId, String status) async {
    await _request('/api/volunteer-shifts/$shiftId/status',
        method: 'PATCH', body: {'status': status});
  }

  Future<void> createVolunteerShift(Map<String, dynamic> payload) async {
    await _request('/api/volunteer-shifts', method: 'POST', body: payload);
  }

  Future<LeaderboardData> getLeaderboard() async {
    final data = await _request('/api/community/leaderboard');
    return LeaderboardData.fromJson(data);
  }
}
