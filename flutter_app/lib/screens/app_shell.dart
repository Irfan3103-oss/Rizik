import 'dart:async';
import 'package:flutter/material.dart';
import '../i18n/i18n_provider.dart';
import '../models/models.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../services/messenger_service.dart';
import '../services/notification_service.dart';
import '../theme/theme_provider.dart';
import 'auth_and_settings_screens.dart';
import 'chat_screen.dart';
import 'claims_screen.dart';
import 'clients_screen.dart';
import 'discover_screen.dart';
import 'donate_screen.dart';
import 'donor_dashboard_screen.dart';
import 'events_screen.dart';
import 'home_screen.dart';
import 'impact_volunteer_leaderboard_screens.dart';
import 'wedding_pickup_screen.dart';

class AppShell extends StatefulWidget {
  final AuthProvider auth;
  final I18nProvider i18n;
  final ThemeProvider theme;

  const AppShell({
    super.key,
    required this.auth,
    required this.i18n,
    required this.theme,
  });

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  String _activeTab = 'home';
  String? _initialConvId;
  List<NotificationItem> _expressNotifications = [];
  List<NotificationItem> _fbNotifications = [];
  int _fbUnreadMessages = 0;
  Set<String> _knownNotifIds = {};
  bool _initialFbSnapshotDone = false;
  String? _boundUid;

  StreamSubscription? _wsSub;
  StreamSubscription? _fbNotifSub;
  StreamSubscription? _fbConvSub;

  @override
  void initState() {
    super.initState();
    widget.auth.addListener(_onAuthChanged);
    _rebindAuthStreams();
    _wsSub = ApiService.instance.wsEvents.listen((ev) {
      final type = ev['event']?.toString() ?? '';
      if (type == 'claim:new' ||
          type == 'claim:status' ||
          type == 'notification:new') {
        _loadExpressNotifications();
        if (mounted) {
          final msg = (ev['data'] is Map && ev['data']['title'] != null)
              ? ev['data']['title'].toString()
              : 'New rescue activity update';
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text(msg)));
        }
      }
    });
  }

  void _onAuthChanged() {
    _rebindAuthStreams();
  }

  void _rebindAuthStreams() {
    final user = widget.auth.user;
    final fbVerified =
        widget.auth.isFirebaseSession && widget.auth.isFirebaseVerified;
    final nextKey = user != null ? '${user.id}_$fbVerified' : null;
    if (_boundUid == nextKey) return;
    _boundUid = nextKey;

    _fbNotifSub?.cancel();
    _fbConvSub?.cancel();
    _fbNotifSub = null;
    _fbConvSub = null;
    _initialFbSnapshotDone = false;
    _knownNotifIds = {};

    if (user == null) {
      if (mounted) {
        setState(() {
          _expressNotifications = [];
          _fbNotifications = [];
          _fbUnreadMessages = 0;
        });
      }
      return;
    }

    _loadExpressNotifications();

    if (fbVerified) {
      _fbNotifSub = NotificationService.instance
          .watchUserNotifications(user.id)
          .listen((items) {
        if (!mounted) return;
        if (_initialFbSnapshotDone) {
          for (final n in items) {
            if (!n.read && !_knownNotifIds.contains(n.id)) {
              final titleText =
                  (widget.i18n.isBn && n.titleBn != null) ? n.titleBn! : n.title;
              ScaffoldMessenger.of(context)
                  .showSnackBar(SnackBar(content: Text(titleText)));
              break;
            }
          }
        }
        _knownNotifIds = items.map((e) => e.id).toSet();
        _initialFbSnapshotDone = true;
        setState(() => _fbNotifications = items);
      }, onError: (_) {});

      _fbConvSub = MessengerService.instance
          .watchMyConversations(
        user.id,
        getBlockedSet: () => const <String>{},
        getDirectoryMap: () => const <String, UserDirectoryEntry>{},
      )
          .listen((convs) {
        if (!mounted) return;
        final total = convs
            .where((c) => !c.isArchived)
            .fold<int>(0, (sum, c) => sum + c.unreadCount);
        setState(() => _fbUnreadMessages = total);
      }, onError: (_) {});
    }
  }

  @override
  void dispose() {
    widget.auth.removeListener(_onAuthChanged);
    _wsSub?.cancel();
    _fbNotifSub?.cancel();
    _fbConvSub?.cancel();
    super.dispose();
  }

  Future<void> _loadExpressNotifications() async {
    if (!widget.auth.isLoggedIn) return;
    try {
      final items = await ApiService.instance.getNotifications();
      if (mounted) setState(() => _expressNotifications = items);
    } catch (_) {}
  }

  List<NotificationItem> get _allNotifications {
    final map = <String, NotificationItem>{};
    for (final n in _expressNotifications) {
      map[n.id] = n;
    }
    for (final n in _fbNotifications) {
      map[n.id] = n;
    }
    return map.values.toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  }

  String _mapLinkTab(String raw) {
    switch (raw) {
      case 'inbox':
        return 'chat';
      case 'account':
        return 'settings';
      case 'post':
        return 'donor';
      default:
        return raw;
    }
  }

  void _navigate(String tab, {String? convId, String? eventId}) {
    setState(() {
      _activeTab = _mapLinkTab(tab);
      if (convId != null) _initialConvId = convId;
    });
  }

  void _openAuthSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (ctx) => FractionallySizedBox(
        heightFactor: 0.92,
        child: Scaffold(
          appBar: AppBar(
            title: Text(widget.i18n.t('nav.signIn')),
            leading: IconButton(
              icon: const Icon(Icons.close_rounded),
              onPressed: () => Navigator.pop(ctx),
            ),
          ),
          body: OnboardingAuthScreen(
            auth: widget.auth,
            i18n: widget.i18n,
            tokens: widget.theme.tokens,
            onSuccess: () {
              Navigator.pop(ctx);
              _loadExpressNotifications();
            },
          ),
        ),
      ),
    );
  }

  void _openNotificationsSheet() async {
    await _loadExpressNotifications();
    if (!mounted) return;
    final t = widget.i18n.t;
    final uid = widget.auth.user?.id;
    final fbVerified =
        widget.auth.isFirebaseSession && widget.auth.isFirebaseVerified;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: FractionallySizedBox(
          heightFactor: 0.72,
          child: StatefulBuilder(
            builder: (ctx, setSheetState) {
              final list = _allNotifications;
              return Column(
                children: [
                  ListTile(
                    title: Text(
                      t('notifications.title'),
                      style: const TextStyle(
                          fontWeight: FontWeight.w800, fontSize: 18),
                    ),
                    trailing: TextButton(
                      onPressed: () async {
                        if (fbVerified && uid != null) {
                          await NotificationService.instance
                              .markAllUserNotificationsRead(uid);
                        }
                        await ApiService.instance
                            .markAllNotificationsRead()
                            .catchError((_) {});
                        await _loadExpressNotifications();
                        if (ctx.mounted) setSheetState(() {});
                      },
                      child: Text(t('notifications.markAllRead')),
                    ),
                  ),
                  const Divider(height: 1),
                  Expanded(
                    child: list.isEmpty
                        ? Center(child: Text(t('notifications.empty')))
                        : ListView.builder(
                            itemCount: list.length,
                            itemBuilder: (_, idx) {
                              final n = list[idx];
                              final isFb =
                                  _fbNotifications.any((f) => f.id == n.id);
                              return ListTile(
                                leading: Icon(
                                  n.read
                                      ? Icons.notifications_none
                                      : Icons.notifications_active_rounded,
                                  color: widget.theme.tokens.primary,
                                ),
                                title: Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        widget.i18n.isBn && n.titleBn != null
                                            ? n.titleBn!
                                            : n.title,
                                        style: TextStyle(
                                          fontWeight: n.read
                                              ? FontWeight.w500
                                              : FontWeight.w800,
                                        ),
                                      ),
                                    ),
                                    if (n.isStarter)
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 6, vertical: 2),
                                        decoration: BoxDecoration(
                                          color: widget.theme.tokens.soft,
                                          borderRadius:
                                              BorderRadius.circular(6),
                                        ),
                                        child: Text(
                                          t('notifications.starter'),
                                          style: TextStyle(
                                            fontSize: 10,
                                            fontWeight: FontWeight.w700,
                                            color: widget
                                                .theme.tokens.textOnSurface,
                                          ),
                                        ),
                                      ),
                                  ],
                                ),
                                subtitle: Text(
                                  widget.i18n.isBn && n.bodyBn != null
                                      ? n.bodyBn!
                                      : n.body,
                                ),
                                trailing: isFb && uid != null
                                    ? IconButton(
                                        icon: const Icon(
                                            Icons.delete_outline_rounded,
                                            size: 18),
                                        onPressed: () async {
                                          await NotificationService.instance
                                              .deleteUserNotification(
                                                  uid, n.id);
                                          if (ctx.mounted) {
                                            setSheetState(() {});
                                          }
                                        },
                                      )
                                    : null,
                                onTap: () async {
                                  if (isFb && uid != null && !n.read) {
                                    unawaited(NotificationService.instance
                                        .markUserNotificationRead(uid, n.id));
                                  }
                                  Navigator.pop(ctx);
                                  if (n.conversationId != null &&
                                      n.conversationId!.isNotEmpty) {
                                    _navigate('chat', convId: n.conversationId);
                                  } else if (n.linkTab != null &&
                                      n.linkTab!.isNotEmpty) {
                                    _navigate(n.linkTab!);
                                  }
                                },
                              );
                            },
                          ),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  void _openMoreSheet() {
    final t = widget.i18n.t;
    final items = <({String id, IconData icon, String label})>[
      (id: 'claims', icon: Icons.local_mall_outlined, label: t('nav.claims')),
      (id: 'donor', icon: Icons.storefront_outlined, label: t('nav.donorHub')),
      (id: 'wedding', icon: Icons.celebration_outlined, label: t('nav.wedding')),
      (id: 'donate', icon: Icons.favorite_outline_rounded, label: t('nav.donate')),
      (id: 'clients', icon: Icons.handshake_outlined, label: t('nav.clients')),
      (id: 'impact', icon: Icons.insights_rounded, label: t('nav.impact')),
      (id: 'volunteers', icon: Icons.badge_outlined, label: t('nav.volunteers')),
      (id: 'leaderboard', icon: Icons.emoji_events_outlined, label: t('nav.leaderboard')),
      if (widget.auth.isAdmin)
        (id: 'admin', icon: Icons.verified_user_outlined, label: t('nav.admin')),
      (id: 'settings', icon: Icons.settings_outlined, label: t('nav.settings')),
    ];

    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.symmetric(vertical: 8),
          children: items
              .map((it) => ListTile(
                    leading: Icon(it.icon, color: widget.theme.tokens.primary),
                    title: Text(it.label,
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    selected: _activeTab == it.id,
                    onTap: () {
                      Navigator.pop(ctx);
                      _navigate(it.id);
                    },
                  ))
              .toList(),
        ),
      ),
    );
  }

  Widget _buildActiveScreen() {
    final tokens = widget.theme.tokens;
    switch (_activeTab) {
      case 'home':
        return HomeScreen(
          i18n: widget.i18n,
          tokens: tokens,
          onNavigate: (tab, {eventId}) => _navigate(tab, eventId: eventId),
        );
      case 'discover':
        return DiscoverScreen(
          auth: widget.auth,
          i18n: widget.i18n,
          tokens: tokens,
          onNavigate: (tab, {convId}) => _navigate(tab, convId: convId),
          onRequestLogin: _openAuthSheet,
        );
      case 'events':
        return EventsScreen(
          auth: widget.auth,
          i18n: widget.i18n,
          tokens: tokens,
          onRequestLogin: _openAuthSheet,
        );
      case 'claims':
        return ClaimsScreen(
          auth: widget.auth,
          i18n: widget.i18n,
          tokens: tokens,
          onNavigate: (tab, {convId}) => _navigate(tab, convId: convId),
          onRequestLogin: _openAuthSheet,
        );
      case 'donor':
        return DonorDashboardScreen(
          auth: widget.auth,
          i18n: widget.i18n,
          tokens: tokens,
          onRequestLogin: _openAuthSheet,
        );
      case 'chat':
        return ChatScreen(
          auth: widget.auth,
          i18n: widget.i18n,
          tokens: tokens,
          initialConvId: _initialConvId,
          onRequestLogin: _openAuthSheet,
        );
      case 'wedding':
        return WeddingPickupScreen(
          auth: widget.auth,
          i18n: widget.i18n,
          tokens: tokens,
          onNavigate: (tab, {convId}) => _navigate(tab, convId: convId),
          onRequestLogin: _openAuthSheet,
        );
      case 'donate':
        return DonateScreen(
          auth: widget.auth,
          i18n: widget.i18n,
          tokens: tokens,
          onRequestLogin: _openAuthSheet,
        );
      case 'clients':
        return ClientsScreen(
          auth: widget.auth,
          i18n: widget.i18n,
          tokens: tokens,
          onRequestLogin: _openAuthSheet,
        );
      case 'impact':
        return ImpactDashboardScreen(
          auth: widget.auth,
          i18n: widget.i18n,
          tokens: tokens,
        );
      case 'volunteers':
        return VolunteerHubScreen(
          auth: widget.auth,
          i18n: widget.i18n,
          tokens: tokens,
          onRequestLogin: _openAuthSheet,
        );
      case 'leaderboard':
        return LeaderboardScreen(
          auth: widget.auth,
          i18n: widget.i18n,
          tokens: tokens,
        );
      case 'admin':
        return AdminApplicationsScreen(
          auth: widget.auth,
          i18n: widget.i18n,
          tokens: tokens,
        );
      case 'settings':
        return ProfileSettingsScreen(
          auth: widget.auth,
          i18n: widget.i18n,
          theme: widget.theme,
          onRequestLogin: _openAuthSheet,
        );
      default:
        return HomeScreen(
          i18n: widget.i18n,
          tokens: tokens,
          onNavigate: (tab, {eventId}) => _navigate(tab, eventId: eventId),
        );
    }
  }

  int get _bottomNavIndex {
    switch (_activeTab) {
      case 'home':
        return 0;
      case 'discover':
        return 1;
      case 'events':
        return 2;
      case 'chat':
        return 3;
      default:
        return 4;
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.i18n.t;
    final unreadNotifs = _allNotifications.where((n) => !n.read).length;

    if (widget.auth.booting) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: InkWell(
          onTap: () => _navigate('home'),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircleAvatar(
                radius: 15,
                backgroundColor: widget.theme.tokens.primary,
                child: const Icon(Icons.eco_rounded, color: Colors.white, size: 17),
              ),
              const SizedBox(width: 8),
              Text(t('app.name'),
                  style: const TextStyle(fontWeight: FontWeight.w800)),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => widget.i18n.toggleLanguage(),
            child: Text(widget.i18n.isBn ? 'EN' : 'বাং',
                style: const TextStyle(fontWeight: FontWeight.w800)),
          ),
          IconButton(
            onPressed: () => widget.theme.toggleDarkMode(),
            icon: Icon(widget.theme.isDark
                ? Icons.light_mode_rounded
                : Icons.dark_mode_rounded),
          ),
          if (widget.auth.isLoggedIn)
            IconButton(
              onPressed: _openNotificationsSheet,
              icon: Badge(
                isLabelVisible: unreadNotifs > 0,
                label: Text('$unreadNotifs'),
                child: const Icon(Icons.notifications_outlined),
              ),
            )
          else
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: FilledButton(
                onPressed: _openAuthSheet,
                style: FilledButton.styleFrom(
                  minimumSize: const Size(64, 36),
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                ),
                child: Text(t('nav.signIn')),
              ),
            ),
        ],
      ),
      body: _buildActiveScreen(),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _bottomNavIndex,
        onDestinationSelected: (idx) {
          switch (idx) {
            case 0:
              _navigate('home');
              break;
            case 1:
              _navigate('discover');
              break;
            case 2:
              _navigate('events');
              break;
            case 3:
              _navigate('chat');
              break;
            case 4:
              _openMoreSheet();
              break;
          }
        },
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.home_outlined),
            selectedIcon: const Icon(Icons.home_rounded),
            label: t('nav.home'),
          ),
          NavigationDestination(
            icon: const Icon(Icons.explore_outlined),
            selectedIcon: const Icon(Icons.explore_rounded),
            label: t('nav.discover'),
          ),
          NavigationDestination(
            icon: const Icon(Icons.event_outlined),
            selectedIcon: const Icon(Icons.event_rounded),
            label: t('nav.events'),
          ),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: _fbUnreadMessages > 0,
              label: Text('$_fbUnreadMessages'),
              child: const Icon(Icons.chat_bubble_outline_rounded),
            ),
            selectedIcon: Badge(
              isLabelVisible: _fbUnreadMessages > 0,
              label: Text('$_fbUnreadMessages'),
              child: const Icon(Icons.chat_bubble_rounded),
            ),
            label: t('nav.chat'),
          ),
          NavigationDestination(
            icon: const Icon(Icons.grid_view_rounded),
            label: t('nav.more'),
          ),
        ],
      ),
    );
  }
}
