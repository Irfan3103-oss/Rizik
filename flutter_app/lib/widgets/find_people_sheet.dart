import 'dart:async';
import 'package:flutter/material.dart';
import '../i18n/i18n_provider.dart';
import '../models/models.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../services/firestore_error_helper.dart';
import '../services/messenger_service.dart';
import '../theme/palettes.dart';
import 'common_widgets.dart';
import 'health_check_sheet.dart';

class FindPeopleSheet extends StatefulWidget {
  final AuthProvider auth;
  final I18nProvider i18n;
  final PaletteTokens tokens;
  final Set<String> blockedUids;
  final void Function(UserDirectoryEntry entry) onSelectPerson;

  const FindPeopleSheet({
    super.key,
    required this.auth,
    required this.i18n,
    required this.tokens,
    this.blockedUids = const {},
    required this.onSelectPerson,
  });

  @override
  State<FindPeopleSheet> createState() => _FindPeopleSheetState();
}

class _FindPeopleSheetState extends State<FindPeopleSheet> {
  final TextEditingController _searchCtrl = TextEditingController();
  String _tab = 'all'; // 'all' | 'restaurants' | 'people' | 'volunteers' | 'online'
  bool _includeDemo = true;
  int _pageLimit = 40;
  bool _hasMore = false;
  bool _loading = true;
  FirestoreListenerError? _error;
  List<UserDirectoryEntry> _entries = [];
  StreamSubscription<DirectoryPageResult>? _dirSub;

  @override
  void initState() {
    super.initState();
    _subscribe();
  }

  void _subscribe() {
    _dirSub?.cancel();
    final me = widget.auth.user;
    if (me == null) return;

    if (widget.auth.isFirebaseSession && widget.auth.isFirebaseVerified) {
      setState(() {
        _loading = true;
        _error = null;
      });
      _dirSub = MessengerService.instance
          .watchDiscoverableDirectory(
        me.id,
        pageLimit: _pageLimit,
        onError: (err) {
          if (mounted) {
            setState(() {
              _error = err;
              _loading = false;
            });
          }
        },
      )
          .listen(
        (res) {
          if (!mounted) return;
          setState(() {
            _entries = res.entries;
            _hasMore = res.hasMore;
            _loading = false;
            _error = null;
          });
        },
        onError: (e) {
          final parsed = e is FirestoreListenerError
              ? e
              : parseFirestoreListenerError(e, 'LIST', 'userDirectory');
          if (mounted) {
            setState(() {
              _error = parsed;
              _loading = false;
            });
          }
        },
      );
    } else {
      _loadExpressFallback();
    }
  }

  Future<void> _loadExpressFallback() async {
    setState(() => _loading = true);
    try {
      final users = await ApiService.instance.getUsers();
      final meId = widget.auth.user?.id;
      final list = users.where((u) => u.id != meId).map((u) {
        final roleStr = u.role == UserRole.admin
            ? 'admin'
            : u.role == UserRole.donor
                ? 'restaurantOwner'
                : 'user';
        return UserDirectoryEntry(
          uid: u.id,
          displayName: u.name,
          handle: u.handle ??
              MessengerService.instance.generatePublicHandle(u.name, u.id),
          photoURL: u.logoUrl,
          role: roleStr,
          restaurantName: u.businessName,
          area: u.area,
          verified: u.verified,
          discoverable: true,
          online: u.isOnline,
          lastSeen: DateTime.now().toIso8601String(),
        );
      }).toList();
      if (mounted) {
        setState(() {
          _entries = list;
          _hasMore = false;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _dirSub?.cancel();
    _searchCtrl.dispose();
    super.dispose();
  }

  String _roleLabel(String role) {
    final t = widget.i18n.t;
    switch (role) {
      case 'admin':
        return t('findPeople.roleAdmin');
      case 'restaurantOwner':
        return t('findPeople.roleOwner');
      case 'donor':
        return t('findPeople.rolePartner');
      case 'volunteer':
      case 'organizer':
        return t('findPeople.roleVolunteer');
      case 'ngo':
        return t('findPeople.roleNgo');
      default:
        return t('findPeople.roleMember');
    }
  }

  List<UserDirectoryEntry> get _filtered {
    final q = _searchCtrl.text.trim().toLowerCase();
    return _entries.where((e) {
      if (widget.blockedUids.contains(e.uid)) return false;
      if (!_includeDemo && (e.isDemo || e.uid.startsWith('demo_'))) {
        return false;
      }
      if (_tab == 'restaurants' &&
          e.role != 'restaurantOwner' &&
          e.role != 'donor') {
        return false;
      }
      if (_tab == 'people' &&
          (e.role == 'restaurantOwner' || e.role == 'donor')) {
        return false;
      }
      if (_tab == 'volunteers' &&
          e.role != 'volunteer' &&
          e.role != 'ngo' &&
          e.role != 'organizer') {
        return false;
      }
      if (_tab == 'online' && !e.online) return false;
      if (q.isNotEmpty) {
        final match = e.displayName.toLowerCase().contains(q) ||
            (e.restaurantName?.toLowerCase().contains(q) ?? false) ||
            e.area.toLowerCase().contains(q) ||
            e.handle.toLowerCase().contains(q);
        if (!match) return false;
      }
      return true;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.i18n.t;
    final list = _filtered;

    return SafeArea(
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 12, 6),
            child: Row(
              children: [
                Icon(Icons.people_alt_rounded, color: widget.tokens.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        t('findPeople.title'),
                        style: const TextStyle(
                            fontSize: 18, fontWeight: FontWeight.w800),
                      ),
                      Text(
                        t('findPeople.subtitle'),
                        style: TextStyle(
                            fontSize: 12, color: widget.tokens.textMuted),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close_rounded),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: TextField(
              controller: _searchCtrl,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                hintText: t('findPeople.searchPlaceholder'),
                prefixIcon: const Icon(Icons.search_rounded),
                contentPadding: const EdgeInsets.symmetric(horizontal: 14),
                suffixIcon: _searchCtrl.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear_rounded, size: 18),
                        onPressed: () {
                          _searchCtrl.clear();
                          setState(() {});
                        },
                      )
                    : null,
              ),
            ),
          ),
          SizedBox(
            height: 44,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: [
                for (final item in [
                  (id: 'all', label: t('findPeople.tabAll')),
                  (id: 'restaurants', label: t('findPeople.tabRestaurants')),
                  (id: 'volunteers', label: t('findPeople.tabVolunteers')),
                  (id: 'people', label: t('findPeople.tabPeople')),
                  (id: 'online', label: t('findPeople.tabOnline')),
                ])
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(item.label),
                      selected: _tab == item.id,
                      onSelected: (_) => setState(() => _tab = item.id),
                    ),
                  ),
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    label: Text(t('findPeople.includeDemo')),
                    selected: _includeDemo,
                    onSelected: (v) => setState(() => _includeDemo = v),
                  ),
                ),
              ],
            ),
          ),
          if (_error != null)
            FirestoreErrorBanner(
              error: _error!,
              i18n: widget.i18n,
              tokens: widget.tokens,
              onRetry: _subscribe,
              onRunHealthCheck: () => showHealthCheckSheet(
                context,
                auth: widget.auth,
                i18n: widget.i18n,
                tokens: widget.tokens,
                mode: widget.auth.isAdmin ? 'admin' : 'user',
              ),
            ),
          const Divider(height: 1),
          Expanded(
            child: _loading && _entries.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : list.isEmpty
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.person_off_outlined,
                                  size: 40, color: widget.tokens.textMuted),
                              const SizedBox(height: 8),
                              Text(
                                t('findPeople.empty'),
                                style: const TextStyle(
                                    fontWeight: FontWeight.w700, fontSize: 15),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                t('findPeople.emptySub'),
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                    fontSize: 12,
                                    color: widget.tokens.textMuted),
                              ),
                            ],
                          ),
                        ),
                      )
                    : _buildGroupedList(list, t),
          ),
        ],
      ),
    );
  }

  Widget _buildGroupedList(
    List<UserDirectoryEntry> list,
    String Function(String, [Map<String, String>?]) t,
  ) {
    final demoList =
        list.where((e) => e.isDemo || e.uid.startsWith('demo_')).toList();
    final memberList =
        list.where((e) => !e.isDemo && !e.uid.startsWith('demo_')).toList();

    return ListView(
      padding: const EdgeInsets.symmetric(vertical: 6),
      children: [
        if (demoList.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            child: Text(
              '${t('findPeople.demoSection')} (${demoList.length})',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: widget.tokens.primary,
              ),
            ),
          ),
          ...demoList.map((e) => _buildEntryTile(e, t)),
        ],
        if (memberList.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 4),
            child: Text(
              '${t('findPeople.membersSection')} (${memberList.length})',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: widget.tokens.textMuted,
              ),
            ),
          ),
          ...memberList.map((e) => _buildEntryTile(e, t)),
        ],
        if (_hasMore)
          Center(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: OutlinedButton(
                onPressed: () {
                  _pageLimit += 30;
                  _subscribe();
                },
                child: Text(t('findPeople.loadMore')),
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildEntryTile(
    UserDirectoryEntry entry,
    String Function(String, [Map<String, String>?]) t,
  ) {
    final isRest = entry.role == 'restaurantOwner' || entry.role == 'donor';
    final isDemo = entry.isDemo || entry.uid.startsWith('demo_');

    return ListTile(
      leading: ShopAvatar(
        name: entry.effectiveTitle,
        imageUrl: entry.photoURL,
        online: entry.online,
      ),
      title: Row(
        children: [
          Flexible(
            child: Text(
              entry.effectiveTitle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
          if (entry.verified) ...[
            const SizedBox(width: 4),
            Icon(Icons.verified_rounded, size: 16, color: widget.tokens.primary),
          ],
          if (isDemo) ...[
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
              decoration: BoxDecoration(
                color: widget.tokens.soft,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                t('chat.demoBadge'),
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  color: widget.tokens.textOnSurface,
                ),
              ),
            ),
          ],
        ],
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            isRest && entry.restaurantName != null
                ? '${entry.restaurantName} · ${entry.area}'
                : '${entry.handle} · ${entry.area}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 12, color: widget.tokens.textMuted),
          ),
          const SizedBox(height: 3),
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(
                  color: widget.tokens.soft,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  _roleLabel(entry.role),
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: widget.tokens.textOnSurface,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                entry.online
                    ? t('findPeople.online')
                    : t('findPeople.offline'),
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: entry.online
                      ? const Color(0xFF16A34A)
                      : widget.tokens.textMuted,
                ),
              ),
            ],
          ),
        ],
      ),
      trailing: Icon(Icons.chat_bubble_outline_rounded,
          size: 20, color: widget.tokens.primary),
      onTap: () {
        Navigator.pop(context);
        widget.onSelectPerson(entry);
      },
    );
  }
}
