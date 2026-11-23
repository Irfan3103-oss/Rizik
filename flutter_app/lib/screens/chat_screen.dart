import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';
import '../data/demo_personas.dart';
import '../i18n/i18n_provider.dart';
import '../models/models.dart';
import '../providers/auth_provider.dart';
import '../services/admin_chat_service.dart';
import '../services/api_service.dart';
import '../services/community_rooms_service.dart';
import '../services/firestore_error_helper.dart';
import '../services/messenger_service.dart';
import '../theme/palettes.dart';
import '../widgets/admin_chat_sheet.dart';
import '../widgets/common_widgets.dart';
import '../widgets/find_people_sheet.dart';
import '../widgets/health_check_sheet.dart';
import 'community_room_screen.dart';

class ChatScreen extends StatefulWidget {
  final AuthProvider auth;
  final I18nProvider i18n;
  final PaletteTokens tokens;
  final String? initialConvId;
  final VoidCallback onRequestLogin;

  const ChatScreen({
    super.key,
    required this.auth,
    required this.i18n,
    required this.tokens,
    this.initialConvId,
    required this.onRequestLogin,
  });

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final TextEditingController _searchCtrl = TextEditingController();
  final TextEditingController _msgCtrl = TextEditingController();
  final ScrollController _scrollCtrl = ScrollController();

  List<Conversation> _expressConvs = [];
  List<Conversation> _fbConvs = [];
  Set<String> _blockedSet = {};
  Map<String, UserDirectoryEntry> _directoryMap = {};
  List<AdminConversation> _adminConvs = [];
  AdminConversation? _myAdminConv;
  List<CommunityRoom> _rooms = [];
  FirestoreListenerError? _inboxError;
  FirestoreListenerError? _threadError;

  Conversation? _selected;
  List<ChatMessage> _messages = [];
  List<ChatMessage> _optimisticPending = [];
  bool _hasOlderMessages = false;
  int _messagePageSize = 30;
  String _inboxFilter = 'all'; // 'all' | 'unread' | 'archived'
  bool _peerTypingExpress = false;
  ChatMessage? _replyingTo;
  final Map<String, String> _translations = {};

  StreamSubscription? _wsSub;
  StreamSubscription? _fbConvSub;
  StreamSubscription? _fbMsgSub;
  StreamSubscription? _blockedSub;
  StreamSubscription? _dirSub;
  StreamSubscription? _adminSub;
  StreamSubscription? _roomsSub;
  Timer? _typingTimer;

  bool get _isFirebaseVerified =>
      widget.auth.isFirebaseSession && widget.auth.isFirebaseVerified;

  @override
  void initState() {
    super.initState();
    _bindListeners();
  }

  @override
  void didUpdateWidget(covariant ChatScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialConvId != widget.initialConvId &&
        widget.initialConvId != null) {
      final match = _allConvs
          .where((c) => c.id == widget.initialConvId)
          .firstOrNull;
      if (match != null) _openConv(match);
    }
  }

  void _bindListeners() {
    if (!widget.auth.isLoggedIn) return;
    _loadExpressConvs();

    _wsSub = ApiService.instance.wsEvents.listen((ev) {
      final type = ev['event']?.toString();
      final data = ev['data'];
      if (type == 'chat:message' && data is Map<String, dynamic>) {
        final m = ChatMessage.fromJson(data);
        if (_selected?.id == m.conversationId &&
            _selected?.isFirestoreBacked != true &&
            mounted) {
          setState(() => _messages.add(m));
          _scrollToBottom();
        }
        _loadExpressConvs();
      } else if (type == 'chat:typing' && data is Map<String, dynamic>) {
        if (_selected?.id == data['conversationId'] &&
            data['userId'] != widget.auth.user?.id &&
            mounted) {
          setState(() => _peerTypingExpress = data['isTyping'] == true);
        }
      }
    });

    final me = widget.auth.user;
    if (_isFirebaseVerified && me != null) {
      _inboxError = null;
      _blockedSub?.cancel();
      _dirSub?.cancel();
      _fbConvSub?.cancel();
      _roomsSub?.cancel();
      _adminSub?.cancel();

      _blockedSub = MessengerService.instance
          .watchMyBlockedUsers(me.id)
          .listen((items) {
        if (mounted) {
          setState(() => _blockedSet = items.map((e) => e.uid).toSet());
        }
      }, onError: (_) {});

      _dirSub = MessengerService.instance
          .watchDiscoverableDirectory(
        me.id,
        pageLimit: 100,
        onError: (err) {
          if (mounted) setState(() => _inboxError ??= err);
        },
      )
          .listen((res) {
        if (mounted) {
          setState(() {
            _directoryMap = {for (final e in res.entries) e.uid: e};
          });
        }
      }, onError: (_) {});

      _roomsSub = CommunityRoomsService.instance
          .watchCommunityRooms(
        onError: (err) {
          if (mounted) setState(() => _inboxError ??= err);
        },
      )
          .listen(
        (rooms) {
          if (mounted) setState(() => _rooms = rooms);
        },
        onError: (e) {
          final parsed = e is FirestoreListenerError
              ? e
              : parseFirestoreListenerError(e, 'LIST', 'rooms');
          if (mounted) setState(() => _inboxError ??= parsed);
        },
      );

      _fbConvSub = MessengerService.instance
          .watchMyConversations(
        me.id,
        getBlockedSet: () => _blockedSet,
        getDirectoryMap: () => _directoryMap,
        onError: (err) {
          if (mounted) setState(() => _inboxError = err);
        },
      )
          .listen(
        (list) {
          if (!mounted) return;
          setState(() {
            _fbConvs = list;
            _inboxError = null;
            if (_selected != null) {
              final updatedSel = list
                  .where((c) => c.id == _selected!.id)
                  .firstOrNull;
              if (updatedSel != null) _selected = updatedSel;
            }
          });
          for (final c in list) {
            if (c.unreadCount > 0 && _selected?.id != c.id) {
              unawaited(MessengerService.instance
                  .markConversationUnreadAsDelivered(c.id, me.id,
                      isDemo: c.isDemo));
            }
          }
          if (widget.initialConvId != null && _selected == null) {
            final match =
                list.where((c) => c.id == widget.initialConvId).firstOrNull;
            if (match != null) _openConv(match);
          }
        },
        onError: (e) {
          final parsed = e is FirestoreListenerError
              ? e
              : parseFirestoreListenerError(e, 'LIST', 'conversations');
          if (mounted) setState(() => _inboxError = parsed);
        },
      );

      if (widget.auth.isAdmin) {
        _adminSub = AdminChatService.instance
            .watchAllAdminConversations()
            .listen((list) {
          if (mounted) setState(() => _adminConvs = list);
        }, onError: (_) {});
      } else if (me.accountType == AccountType.restaurantOwner) {
        _adminSub = AdminChatService.instance
            .watchMyAdminConversation(me.id)
            .listen((conv) {
          if (mounted) setState(() => _myAdminConv = conv);
        }, onError: (_) {});
      }

      unawaited(_restoreOfflineQueue(me.id));
    }
  }

  Future<void> _restoreOfflineQueue(String uid) async {
    final queued = await MessengerService.instance.readOfflineMessageQueue(uid);
    if (!mounted || queued.isEmpty) return;
    setState(() {
      _optimisticPending = queued
          .map((q) => ChatMessage(
                id: q.tempId,
                conversationId: q.conversationId,
                senderId: q.senderId,
                senderName: q.senderName,
                text: q.text,
                messageType: q.messageType,
                fileName: q.fileName,
                locationLat: q.locationLat,
                locationLng: q.locationLng,
                locationLabel: q.locationLabel,
                replyToId: q.replyToId,
                replyToText: q.replyToText,
                forwardedFrom: q.forwardedFrom,
                sentAt: DateTime.now().toIso8601String(),
                failed: true,
              ))
          .toList();
    });
  }

  @override
  void dispose() {
    _wsSub?.cancel();
    _fbConvSub?.cancel();
    _fbMsgSub?.cancel();
    _blockedSub?.cancel();
    _dirSub?.cancel();
    _adminSub?.cancel();
    _roomsSub?.cancel();
    _typingTimer?.cancel();
    _searchCtrl.dispose();
    _msgCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadExpressConvs() async {
    try {
      final list = await ApiService.instance.getConversations();
      if (!mounted) return;
      setState(() => _expressConvs = list);
      if (widget.initialConvId != null && _selected == null) {
        final match = _allConvs
            .where((c) => c.id == widget.initialConvId)
            .firstOrNull;
        if (match != null) _openConv(match);
      }
    } catch (_) {}
  }

  List<Conversation> get _allConvs {
    final map = <String, Conversation>{};
    for (final c in _expressConvs) {
      map[c.id] = c;
    }
    for (final c in _fbConvs) {
      map[c.id] = c;
    }
    return map.values.toList()
      ..sort((a, b) =>
          (b.lastMessageAt ?? b.updatedAt)
              .compareTo(a.lastMessageAt ?? a.updatedAt));
  }

  List<Conversation> get _filteredConvs {
    final q = _searchCtrl.text.trim().toLowerCase();
    final myId = widget.auth.user?.id ?? '';
    return _allConvs.where((c) {
      if (_inboxFilter == 'archived' && !c.isArchived) return false;
      if (_inboxFilter != 'archived' && c.isArchived) return false;
      if (_inboxFilter == 'unread' && c.unreadCount <= 0) return false;
      if (q.isNotEmpty) {
        final peerName = _peerName(c, myId).toLowerCase();
        final handle = (c.peerHandle ?? '').toLowerCase();
        final lastMsg = (c.lastMessage ?? '').toLowerCase();
        final title = c.listingTitle.toLowerCase();
        if (!peerName.contains(q) &&
            !handle.contains(q) &&
            !lastMsg.contains(q) &&
            !title.contains(q)) {
          return false;
        }
      }
      return true;
    }).toList();
  }

  String _peerName(Conversation c, String myId) {
    if (c.isDemo) return c.donorName;
    if (c.peerRestaurantName != null && c.peerRestaurantName!.isNotEmpty) {
      return c.peerRestaurantName!;
    }
    return c.donorId == myId ? c.recipientName : c.donorName;
  }

  String _peerId(Conversation c, String myId) {
    if (c.peerUid != null && c.peerUid!.isNotEmpty) return c.peerUid!;
    return c.donorId == myId ? c.recipientId : c.donorId;
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _openConv(Conversation conv) async {
    _fbMsgSub?.cancel();
    setState(() {
      _selected = conv;
      _messages = [];
      _messagePageSize = 30;
      _hasOlderMessages = false;
      _peerTypingExpress = false;
      _replyingTo = null;
    });

    final me = widget.auth.user;
    if (conv.isFirestoreBacked && me != null) {
      _subscribeFirestoreMessages(conv, me.id);
    } else {
      try {
        final msgs = await ApiService.instance.getMessages(conv.id);
        await ApiService.instance.markConversationRead(conv.id);
        if (mounted) {
          setState(() => _messages = msgs);
          _scrollToBottom();
        }
      } catch (_) {}
    }
  }

  void _subscribeFirestoreMessages(Conversation conv, String myUid) {
    _fbMsgSub?.cancel();
    setState(() => _threadError = null);
    _fbMsgSub = MessengerService.instance
        .watchConversationMessages(
      conv.id,
      myUid,
      peerUid: conv.peerUid,
      pageSize: _messagePageSize,
      isDemo: conv.isDemo,
      onError: (err) {
        if (mounted) setState(() => _threadError = err);
      },
    )
        .listen(
      (page) {
        if (!mounted) return;
        setState(() {
          _messages = page.messages;
          _hasOlderMessages = page.hasMore;
          _threadError = null;
        });
        unawaited(MessengerService.instance.markConversationDeliveredAndRead(
          conversation: conv,
          myUid: myUid,
          messages: page.messages,
          markRead: true,
        ));
      },
      onError: (e) {
        final parsed = e is FirestoreListenerError
            ? e
            : parseFirestoreListenerError(
                e, 'LIST', 'conversations/${conv.id}/messages');
        if (mounted) setState(() => _threadError = parsed);
      },
    );
  }

  Future<void> _sendFirestoreWithOptimistic({
    required Conversation conv,
    required String text,
    MessageType messageType = MessageType.text,
    String? mediaUrl,
    String? fileName,
    int? fileSize,
    String? fileMime,
    double? locationLat,
    double? locationLng,
    String? locationLabel,
  }) async {
    final me = widget.auth.user!;
    final tempId = 'opt_${DateTime.now().millisecondsSinceEpoch}';
    final replyId = _replyingTo?.id;
    final replyText = _replyingTo?.text;

    final optimistic = ChatMessage(
      id: tempId,
      conversationId: conv.id,
      senderId: me.id,
      senderName: me.name,
      text: text,
      messageType: messageType,
      imageUrl: messageType == MessageType.image ? mediaUrl : null,
      fileUrl: messageType == MessageType.file ? mediaUrl : null,
      fileName: fileName,
      fileSize: fileSize,
      fileMime: fileMime,
      locationLat: locationLat,
      locationLng: locationLng,
      locationLabel: locationLabel,
      replyToId: replyId,
      replyToText: replyText,
      sentAt: DateTime.now().toIso8601String(),
      status: 'sent',
      pending: true,
    );

    setState(() {
      _replyingTo = null;
      _optimisticPending.add(optimistic);
    });
    _scrollToBottom();

    try {
      await MessengerService.instance.sendMessengerMessage(
        conversation: conv,
        senderId: me.id,
        senderName: me.name,
        text: text,
        messageType: messageType,
        mediaUrl: mediaUrl,
        fileName: fileName,
        fileSize: fileSize,
        fileMime: fileMime,
        locationLat: locationLat,
        locationLng: locationLng,
        locationLabel: locationLabel,
        replyToId: replyId,
        replyToText: replyText,
        lang: widget.i18n.lang,
      );
      if (mounted) {
        setState(() => _optimisticPending.removeWhere((m) => m.id == tempId));
      }
    } catch (_) {
      final queue = await MessengerService.instance.readOfflineMessageQueue(me.id);
      queue.add(QueuedMessengerMessage(
        tempId: tempId,
        conversationId: conv.id,
        senderId: me.id,
        senderName: me.name,
        text: text,
        messageType: messageType,
        mediaUrl: mediaUrl,
        fileName: fileName,
        fileSize: fileSize,
        fileMime: fileMime,
        locationLat: locationLat,
        locationLng: locationLng,
        locationLabel: locationLabel,
        replyToId: replyId,
        replyToText: replyText,
      ));
      await MessengerService.instance.writeOfflineMessageQueue(me.id, queue);
      if (mounted) {
        setState(() {
          final idx = _optimisticPending.indexWhere((m) => m.id == tempId);
          if (idx >= 0) {
            _optimisticPending[idx] = _optimisticPending[idx]
                .copyWith(pending: false, failed: true);
          }
        });
      }
    }
  }

  Future<void> _retryFailedMessage(ChatMessage failedMsg) async {
    final conv = _selected;
    final me = widget.auth.user;
    if (conv == null || me == null) return;
    setState(() {
      final idx = _optimisticPending.indexWhere((m) => m.id == failedMsg.id);
      if (idx >= 0) {
        _optimisticPending[idx] =
            _optimisticPending[idx].copyWith(pending: true, failed: false);
      }
    });
    try {
      await MessengerService.instance.sendMessengerMessage(
        conversation: conv,
        senderId: me.id,
        senderName: me.name,
        text: failedMsg.text,
        messageType: failedMsg.messageType,
        mediaUrl: failedMsg.imageUrl ?? failedMsg.fileUrl,
        fileName: failedMsg.fileName,
        fileSize: failedMsg.fileSize,
        fileMime: failedMsg.fileMime,
        locationLat: failedMsg.locationLat,
        locationLng: failedMsg.locationLng,
        locationLabel: failedMsg.locationLabel,
        replyToId: failedMsg.replyToId,
        replyToText: failedMsg.replyToText,
        lang: widget.i18n.lang,
      );
      final queue = await MessengerService.instance.readOfflineMessageQueue(me.id);
      queue.removeWhere((q) => q.tempId == failedMsg.id);
      await MessengerService.instance.writeOfflineMessageQueue(me.id, queue);
      if (mounted) {
        setState(() => _optimisticPending.removeWhere((m) => m.id == failedMsg.id));
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          final idx = _optimisticPending.indexWhere((m) => m.id == failedMsg.id);
          if (idx >= 0) {
            _optimisticPending[idx] =
                _optimisticPending[idx].copyWith(pending: false, failed: true);
          }
        });
      }
    }
  }

  Future<void> _sendText() async {
    final conv = _selected;
    final text = _msgCtrl.text.trim();
    final me = widget.auth.user;
    if (conv == null || text.isEmpty || me == null) return;
    _msgCtrl.clear();
    _typingTimer?.cancel();

    if (conv.isFirestoreBacked) {
      unawaited(MessengerService.instance
          .setMessengerTyping(conv.id, me.id, false, isDemo: conv.isDemo));
      await _sendFirestoreWithOptimistic(conv: conv, text: text);
    } else {
      ApiService.instance.sendTyping(conv.id, false);
      final sent = await ApiService.instance.sendMessage(conv.id, {
        'text': text,
        'messageType': 'text',
        if (_replyingTo != null) 'replyToId': _replyingTo!.id,
        if (_replyingTo != null) 'replyToText': _replyingTo!.text,
      });
      if (mounted) {
        setState(() {
          _replyingTo = null;
          _messages.add(sent);
        });
        _scrollToBottom();
      }
    }
  }

  Future<void> _pickAndSendImage(ImageSource source) async {
    final conv = _selected;
    final me = widget.auth.user;
    if (conv == null || me == null) return;
    final picker = ImagePicker();
    final xfile = await picker.pickImage(
        source: source, maxWidth: 1080, imageQuality: 75);
    if (xfile == null) return;
    final bytes = await xfile.readAsBytes();
    final b64 = 'data:image/jpeg;base64,${base64Encode(bytes)}';

    if (conv.isFirestoreBacked) {
      String? url = await MessengerService.instance.uploadChatMediaBytes(
        conversationId: conv.id,
        senderId: me.id,
        bytes: bytes,
        fileName: xfile.name,
        contentType: 'image/jpeg',
      );
      url ??= b64;
      await _sendFirestoreWithOptimistic(
        conv: conv,
        text: 'Shared a photo',
        messageType: MessageType.image,
        mediaUrl: url,
      );
    } else {
      final url = await ApiService.instance.uploadImageBase64(b64);
      final sent = await ApiService.instance.sendMessage(conv.id, {
        'text': 'Shared a photo',
        'messageType': 'image',
        'imageUrl': url,
      });
      if (mounted) {
        setState(() => _messages.add(sent));
        _scrollToBottom();
      }
    }
  }

  Future<void> _sendLocation() async {
    final conv = _selected;
    if (conv == null) return;
    final picked = await showMapPinPickerDialog(context);
    if (picked == null) return;

    if (conv.isFirestoreBacked) {
      await _sendFirestoreWithOptimistic(
        conv: conv,
        text: 'Shared pickup location',
        messageType: MessageType.location,
        locationLat: picked.latitude,
        locationLng: picked.longitude,
        locationLabel: 'Dhaka Meetup Pin',
      );
    } else {
      final sent = await ApiService.instance.sendMessage(conv.id, {
        'text': 'Shared pickup location',
        'messageType': 'location',
        'locationLat': picked.latitude,
        'locationLng': picked.longitude,
        'locationLabel': 'Dhaka Meetup Pin',
      });
      if (mounted) {
        setState(() => _messages.add(sent));
        _scrollToBottom();
      }
    }
  }

  Future<void> _sendTextNoteAttachment() async {
    final conv = _selected;
    if (conv == null) return;
    final titleCtrl = TextEditingController(text: 'pickup-instructions.txt');
    final bodyCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Attach Text / Pickup Note File'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: titleCtrl,
              decoration: const InputDecoration(labelText: 'File name'),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: bodyCtrl,
              maxLines: 3,
              decoration: const InputDecoration(labelText: 'Note contents'),
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text(widget.i18n.t('common.cancel'))),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Send File')),
        ],
      ),
    );
    if (ok != true || bodyCtrl.text.trim().isEmpty) return;
    final fname = titleCtrl.text.trim().isEmpty
        ? 'note.txt'
        : titleCtrl.text.trim();
    final encoded =
        'data:text/plain;base64,${base64Encode(utf8.encode(bodyCtrl.text.trim()))}';

    if (conv.isFirestoreBacked) {
      await _sendFirestoreWithOptimistic(
        conv: conv,
        text: 'Shared file: $fname',
        messageType: MessageType.file,
        mediaUrl: encoded,
        fileName: fname,
        fileSize: bodyCtrl.text.trim().length,
        fileMime: 'text/plain',
      );
    }
  }

  String _formatLastSeen(String? iso) {
    if (iso == null || iso.isEmpty) return widget.i18n.t('findPeople.offline');
    final dt = DateTime.tryParse(iso)?.toLocal();
    if (dt == null) return widget.i18n.t('findPeople.offline');
    final hh = dt.hour.toString().padLeft(2, '0');
    final mm = dt.minute.toString().padLeft(2, '0');
    return '${widget.i18n.t('chat.lastSeenPrefix')} $hh:$mm';
  }

  String _dateLabel(DateTime dt) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final target = DateTime(dt.year, dt.month, dt.day);
    final diff = today.difference(target).inDays;
    if (diff == 0) return widget.i18n.t('chat.today');
    if (diff == 1) return widget.i18n.t('chat.yesterday');
    return '${dt.day}/${dt.month}/${dt.year}';
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.auth.isLoggedIn) {
      return AuthGateCard(
        title: 'Sign in to access Inbox',
        subtitle:
            'Coordinate food pickups, message nearby kitchens, and find community volunteers.',
        onSignIn: widget.onRequestLogin,
      );
    }

    if (_selected != null) {
      return _buildThread(_selected!);
    }

    final t = widget.i18n.t;
    final convs = _filteredConvs;
    final me = widget.auth.user!;
    final showSupportCard = _isFirebaseVerified &&
        (widget.auth.isAdmin || me.accountType == AccountType.restaurantOwner);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  t('chat.title'),
                  style: const TextStyle(
                      fontSize: 20, fontWeight: FontWeight.w800),
                ),
              ),
              FilledButton.icon(
                onPressed: _openFindPeopleSheet,
                icon: const Icon(Icons.person_search_rounded, size: 18),
                label: Text(t('chat.newChat')),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          child: TextField(
            controller: _searchCtrl,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              hintText: t('chat.searchInbox'),
              prefixIcon: const Icon(Icons.search_rounded),
              contentPadding: const EdgeInsets.symmetric(horizontal: 14),
            ),
          ),
        ),
        SizedBox(
          height: 44,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            children: [
              for (final f in [
                (id: 'all', label: t('chat.filterAll')),
                (id: 'unread', label: t('chat.filterUnread')),
                (id: 'archived', label: t('chat.filterArchived')),
              ])
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(f.label),
                    selected: _inboxFilter == f.id,
                    onSelected: (_) => setState(() => _inboxFilter = f.id),
                  ),
                ),
            ],
          ),
        ),
        if (showSupportCard) _buildSupportBanner(),
        if (_inboxError != null)
          FirestoreErrorBanner(
            error: _inboxError!,
            i18n: widget.i18n,
            tokens: widget.tokens,
            onRetry: _bindListeners,
            onRunHealthCheck: () => showHealthCheckSheet(
              context,
              auth: widget.auth,
              i18n: widget.i18n,
              tokens: widget.tokens,
              mode: widget.auth.isAdmin ? 'admin' : 'user',
            ),
          ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _loadExpressConvs,
            child: ListView(
              children: [
                if (_isFirebaseVerified && _rooms.isNotEmpty)
                  _buildCommunityRoomsSection(),
                if (convs.isEmpty)
                  Padding(
                    padding: const EdgeInsets.all(24),
                    child: Center(
                      child: Text(
                        t('chat.emptyFilter'),
                        textAlign: TextAlign.center,
                        style: TextStyle(color: widget.tokens.textMuted),
                      ),
                    ),
                  )
                else
                  ...convs.map(_buildConversationTile),
                if (_isFirebaseVerified && _inboxFilter == 'all')
                  _buildSuggestedChatsSection(),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _startDirectChatWithDirectoryEntry(
      UserDirectoryEntry entry) async {
    final me = widget.auth.user;
    if (me == null) return;
    try {
      String convId;
      if (_isFirebaseVerified) {
        convId = await MessengerService.instance.getOrCreateDirectConversation(
          me,
          entry,
          lang: widget.i18n.lang,
        );
      } else {
        convId = await ApiService.instance.openDirectConversation(entry.uid);
        await _loadExpressConvs();
      }
      if (!mounted) return;
      final match = _allConvs.where((c) => c.id == convId).firstOrNull;
      if (match != null) {
        _openConv(match);
      } else {
        final isDemo = entry.isDemo || entry.uid.startsWith('demo_');
        setState(() {
          _selected = Conversation(
            id: convId,
            listingId: '',
            claimId: '',
            donorId: entry.uid,
            recipientId: me.id,
            uidA: isDemo ? me.id : ([me.id, entry.uid]..sort()).first,
            uidB: isDemo ? entry.uid : ([me.id, entry.uid]..sort()).last,
            participants: isDemo ? [me.id] : ([me.id, entry.uid]..sort()),
            conversationKind: isDemo ? 'demo' : 'direct',
            donorName: entry.effectiveTitle,
            donorLogoUrl: entry.photoURL,
            donorVerified: entry.verified,
            donorArea: entry.area,
            peerOnline: entry.online,
            peerLastSeen: entry.lastSeen,
            peerUid: entry.uid,
            peerHandle: entry.handle,
            peerRole: entry.role,
            peerVerified: entry.verified,
            peerArea: entry.area,
            peerRestaurantName: entry.restaurantName,
            recipientName: me.name,
            listingTitle: entry.handle,
            listingPhoto: entry.photoURL ?? '/images/kacchi-biryani.jpg',
            pickupStart: DateTime.now().toIso8601String(),
            pickupEnd: DateTime.now().toIso8601String(),
            isDirect: true,
            isDemo: isDemo,
            demoPersonaId: isDemo ? entry.uid : null,
            isFirestoreBacked: _isFirebaseVerified,
            createdAt: DateTime.now().toIso8601String(),
            updatedAt: DateTime.now().toIso8601String(),
          );
        });
        if (_isFirebaseVerified) {
          _subscribeFirestoreMessages(_selected!, me.id);
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
        );
      }
    }
  }

  Widget _buildCommunityRoomsSection() {
    final t = widget.i18n.t;
    final isBn = widget.i18n.isBn;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 6),
          child: Row(
            children: [
              Icon(Icons.forum_rounded, size: 16, color: widget.tokens.primary),
              const SizedBox(width: 6),
              Text(
                t('rooms.title'),
                style: const TextStyle(
                    fontSize: 13, fontWeight: FontWeight.w800),
              ),
              const SizedBox(width: 8),
              _smallTag(t('rooms.pinnedBadge'), widget.tokens.soft,
                  widget.tokens.textOnSurface),
            ],
          ),
        ),
        SizedBox(
          height: 92,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            itemCount: _rooms.length,
            itemBuilder: (_, idx) {
              final room = _rooms[idx];
              final iconData = room.iconKey == 'restaurant'
                  ? Icons.storefront_rounded
                  : room.iconKey == 'volunteer'
                      ? Icons.volunteer_activism_rounded
                      : Icons.groups_rounded;
              return Container(
                width: 225,
                margin: const EdgeInsets.only(right: 10),
                child: Card(
                  margin: EdgeInsets.zero,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(18),
                    onTap: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => CommunityRoomScreen(
                            room: room,
                            auth: widget.auth,
                            i18n: widget.i18n,
                            tokens: widget.tokens,
                            onOpenDirectChat: (member) {
                              _startDirectChatWithDirectoryEntry(
                                UserDirectoryEntry(
                                  uid: member.uid,
                                  displayName: member.displayName,
                                  handle: member.handle ?? '@member',
                                  photoURL: member.photoURL,
                                  role: member.role,
                                  area: member.area ?? 'Dhaka',
                                  verified: false,
                                  discoverable: true,
                                  online: member.online,
                                  lastSeen: member.updatedAt,
                                  isDemo: member.isDemo,
                                ),
                              );
                            },
                          ),
                        ),
                      );
                    },
                    child: Padding(
                      padding: const EdgeInsets.all(10),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(iconData,
                                  size: 18, color: widget.tokens.primary),
                              const SizedBox(width: 6),
                              Expanded(
                                child: Text(
                                  isBn ? room.nameBn : room.name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w800,
                                      fontSize: 13),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Expanded(
                            child: Text(
                              room.lastMessage.isNotEmpty
                                  ? '${room.lastMessageSenderName}: ${room.lastMessage}'
                                  : (isBn ? room.descriptionBn : room.description),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                  fontSize: 11, color: widget.tokens.textMuted),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 6),
      ],
    );
  }

  Widget _buildSuggestedChatsSection() {
    final t = widget.i18n.t;
    final existingPeerIds =
        _fbConvs.map((c) => c.peerUid ?? c.demoPersonaId).whereType<String>().toSet();
    final suggestions = [rizikTeamPersona, ...demoPersonas]
        .where((p) => !existingPeerIds.contains(p.id))
        .take(5)
        .toList();
    if (suggestions.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Divider(height: 20),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 2),
          child: Text(
            t('chat.suggestedTitle'),
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: Text(
            t('chat.suggestedSub'),
            style: TextStyle(fontSize: 12, color: widget.tokens.textMuted),
          ),
        ),
        ...suggestions.map((spec) {
          final entry = personaToDirectoryEntry(spec);
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
                const SizedBox(width: 6),
                _smallTag(
                  spec.isOfficial ? t('chat.officialBadge') : t('chat.demoBadge'),
                  spec.isOfficial ? widget.tokens.primary : widget.tokens.soft,
                  spec.isOfficial ? Colors.white : widget.tokens.textOnSurface,
                ),
              ],
            ),
            subtitle: Text(
              '${entry.handle} · ${entry.area}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12, color: widget.tokens.textMuted),
            ),
            trailing: OutlinedButton(
              onPressed: () => _startDirectChatWithDirectoryEntry(entry),
              child: const Text('Chat'),
            ),
            onTap: () => _startDirectChatWithDirectoryEntry(entry),
          );
        }),
        const SizedBox(height: 16),
      ],
    );
  }

  Widget _buildSupportBanner() {
    final t = widget.i18n.t;
    final me = widget.auth.user!;
    final unread = widget.auth.isAdmin
        ? _adminConvs.fold<int>(0, (s, c) => s + c.adminUnreadCount)
        : (_myAdminConv?.ownerUnreadCount ?? 0);

    return Card(
      margin: const EdgeInsets.fromLTRB(16, 4, 16, 6),
      color: widget.tokens.soft,
      child: ListTile(
        dense: true,
        leading: CircleAvatar(
          backgroundColor: widget.tokens.primary,
          child: const Icon(Icons.support_agent_rounded, color: Colors.white),
        ),
        title: Text(
          t('chat.adminSupport'),
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        subtitle: Text(
          widget.auth.isAdmin
              ? '${_adminConvs.length} owner support thread(s)'
              : (_myAdminConv?.lastMessage ?? t('chat.adminSupportSub')),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: unread > 0
            ? CircleAvatar(
                radius: 12,
                backgroundColor: widget.tokens.primary,
                child: Text('$unread',
                    style: const TextStyle(color: Colors.white, fontSize: 11)),
              )
            : const Icon(Icons.chevron_right_rounded),
        onTap: () {
          if (widget.auth.isAdmin) {
            _pickAdminThreadSheet();
          } else {
            showAdminSupportChatSheet(
              context,
              auth: widget.auth,
              i18n: widget.i18n,
              tokens: widget.tokens,
              ownerUid: me.id,
              ownerName: me.name,
              restaurantName:
                  me.restaurant?.restaurantName ?? '${me.name} Kitchen',
              restaurantLogoUrl: me.restaurant?.restaurantPhotoUrl,
              verificationStatus: me.restaurant?.verificationStatus ??
                  RestaurantVerificationStatus.pending,
            );
          }
        },
      ),
    );
  }

  void _pickAdminThreadSheet() {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: Text(
                widget.i18n.t('chat.adminSupport'),
                style:
                    const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
              ),
            ),
            const Divider(height: 1),
            if (_adminConvs.isEmpty)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Text('No restaurant support threads yet.'),
              )
            else
              Flexible(
                child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: _adminConvs.length,
                  itemBuilder: (_, idx) {
                    final ac = _adminConvs[idx];
                    return ListTile(
                      leading: ShopAvatar(
                        name: ac.restaurantName,
                        imageUrl: ac.restaurantLogoUrl,
                      ),
                      title: Text('${ac.restaurantName} · ${ac.ownerName}',
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text(ac.lastMessage,
                          maxLines: 1, overflow: TextOverflow.ellipsis),
                      trailing: ac.adminUnreadCount > 0
                          ? CircleAvatar(
                              radius: 11,
                              backgroundColor: widget.tokens.primary,
                              child: Text('${ac.adminUnreadCount}',
                                  style: const TextStyle(
                                      color: Colors.white, fontSize: 11)),
                            )
                          : null,
                      onTap: () {
                        Navigator.pop(ctx);
                        showAdminSupportChatSheet(
                          context,
                          auth: widget.auth,
                          i18n: widget.i18n,
                          tokens: widget.tokens,
                          ownerUid: ac.ownerUid,
                          ownerName: ac.ownerName,
                          restaurantName: ac.restaurantName,
                          restaurantLogoUrl: ac.restaurantLogoUrl,
                          verificationStatus: ac.verificationStatus,
                        );
                      },
                    );
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildConversationTile(Conversation c) {
    final myId = widget.auth.user!.id;
    final peerName = _peerName(c, myId);
    final peerVerified = c.peerVerified ?? c.donorVerified;
    final timeDt =
        DateTime.tryParse(c.lastMessageAt ?? c.updatedAt)?.toLocal();
    final timeStr = timeDt != null
        ? '${timeDt.hour.toString().padLeft(2, '0')}:${timeDt.minute.toString().padLeft(2, '0')}'
        : '';

    return ListTile(
      leading: ShopAvatar(
        name: peerName,
        imageUrl: c.donorLogoUrl ?? c.listingPhoto,
        online: c.peerOnline,
      ),
      title: Row(
        children: [
          Flexible(
            child: Text(
              peerName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
          if (peerVerified) ...[
            const SizedBox(width: 4),
            Icon(Icons.verified_rounded, size: 15, color: widget.tokens.primary),
          ],
          if (c.isOfficial) ...[
            const SizedBox(width: 4),
            _smallTag(widget.i18n.t('chat.officialBadge'),
                widget.tokens.primary, Colors.white),
          ] else if (c.isDemo) ...[
            const SizedBox(width: 4),
            _smallTag(widget.i18n.t('chat.demoBadge'), widget.tokens.soft,
                widget.tokens.textOnSurface),
          ],
          if (c.isMuted) ...[
            const SizedBox(width: 4),
            Icon(Icons.notifications_off_outlined,
                size: 14, color: widget.tokens.textMuted),
          ],
        ],
      ),
      subtitle: Text(
        c.peerTyping
            ? widget.i18n.t('chat.typing')
            : (c.lastMessage?.isNotEmpty == true
                ? c.lastMessage!
                : c.listingTitle),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(timeStr,
              style: TextStyle(fontSize: 11, color: widget.tokens.textMuted)),
          const SizedBox(height: 4),
          if (c.unreadCount > 0)
            CircleAvatar(
              radius: 11,
              backgroundColor: widget.tokens.primary,
              child: Text('${c.unreadCount}',
                  style: const TextStyle(color: Colors.white, fontSize: 11)),
            ),
        ],
      ),
      onTap: () => _openConv(c),
      onLongPress: () => _showConvMenu(c),
    );
  }

  Widget _smallTag(String text, Color bg, Color fg) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(6)),
      child: Text(text,
          style: TextStyle(
              fontSize: 10, fontWeight: FontWeight.w800, color: fg)),
    );
  }

  void _showConvMenu(Conversation c) {
    final t = widget.i18n.t;
    final myId = widget.auth.user!.id;
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (c.isFirestoreBacked) ...[
              ListTile(
                leading: Icon(c.isMuted
                    ? Icons.notifications_active_outlined
                    : Icons.notifications_off_outlined),
                title: Text(c.isMuted ? t('chat.unmute') : t('chat.mute')),
                onTap: () async {
                  Navigator.pop(ctx);
                  await MessengerService.instance.toggleConversationMute(
                    c.id,
                    myId,
                    !c.isMuted,
                    isDemo: c.isDemo,
                  );
                },
              ),
              ListTile(
                leading: Icon(c.isArchived
                    ? Icons.unarchive_outlined
                    : Icons.archive_outlined),
                title:
                    Text(c.isArchived ? t('chat.unarchive') : t('chat.archive')),
                onTap: () async {
                  Navigator.pop(ctx);
                  await MessengerService.instance.toggleConversationArchive(
                    c.id,
                    myId,
                    !c.isArchived,
                    isDemo: c.isDemo,
                  );
                },
              ),
              ListTile(
                leading: const Icon(Icons.delete_outline_rounded,
                    color: Colors.red),
                title: Text(t('chat.deleteForMe'),
                    style: const TextStyle(color: Colors.red)),
                onTap: () async {
                  Navigator.pop(ctx);
                  await MessengerService.instance.deleteConversationForMe(
                    c.id,
                    myId,
                    isDemo: c.isDemo,
                  );
                  if (_selected?.id == c.id && mounted) {
                    setState(() => _selected = null);
                  }
                },
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildThread(Conversation conv) {
    final t = widget.i18n.t;
    final myId = widget.auth.user!.id;
    final peerName = _peerName(conv, myId);
    final peerId = _peerId(conv, myId);
    final peerVerified = conv.peerVerified ?? conv.donorVerified;
    final isTyping =
        conv.isFirestoreBacked ? conv.peerTyping : _peerTypingExpress;

    final threadMessages = [
      ..._messages,
      ..._optimisticPending.where((m) => m.conversationId == conv.id),
    ];

    final subtitleText = isTyping
        ? t('chat.typing')
        : conv.isOfficial
            ? t('chat.officialBadge')
            : conv.isDemo
                ? t('chat.demoBadge')
                : conv.peerOnline
                    ? t('findPeople.online')
                    : _formatLastSeen(conv.peerLastSeen);

    return Column(
      children: [
        Material(
          color: widget.tokens.bgSurface,
          child: Row(
            children: [
              IconButton(
                icon: const Icon(Icons.arrow_back_rounded),
                onPressed: () {
                  _fbMsgSub?.cancel();
                  setState(() => _selected = null);
                },
              ),
              ShopAvatar(
                name: peerName,
                imageUrl: conv.donorLogoUrl ?? conv.listingPhoto,
                size: 36,
                online: conv.peerOnline,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(peerName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style:
                                  const TextStyle(fontWeight: FontWeight.w800)),
                        ),
                        if (peerVerified) ...[
                          const SizedBox(width: 4),
                          Icon(Icons.verified_rounded,
                              size: 15, color: widget.tokens.primary),
                        ],
                      ],
                    ),
                    Text(
                      subtitleText,
                      style: TextStyle(
                          fontSize: 12,
                          color: isTyping
                              ? widget.tokens.primary
                              : widget.tokens.textMuted),
                    ),
                  ],
                ),
              ),
              PopupMenuButton<String>(
                onSelected: (act) async {
                  if (act == 'mute' && conv.isFirestoreBacked) {
                    await MessengerService.instance.toggleConversationMute(
                      conv.id,
                      myId,
                      !conv.isMuted,
                      isDemo: conv.isDemo,
                    );
                  } else if (act == 'archive' && conv.isFirestoreBacked) {
                    await MessengerService.instance.toggleConversationArchive(
                      conv.id,
                      myId,
                      !conv.isArchived,
                      isDemo: conv.isDemo,
                    );
                    if (mounted) setState(() => _selected = null);
                  } else if (act == 'delete' && conv.isFirestoreBacked) {
                    await MessengerService.instance.deleteConversationForMe(
                      conv.id,
                      myId,
                      isDemo: conv.isDemo,
                    );
                    if (mounted) setState(() => _selected = null);
                  } else if (act == 'block') {
                    if (conv.isFirestoreBacked) {
                      if (conv.blockedByMe) {
                        await MessengerService.instance
                            .unblockUserInFirestore(myId, peerId);
                      } else {
                        await MessengerService.instance.blockUserInFirestore(
                          myUid: myId,
                          targetUid: peerId,
                          targetName: peerName,
                          targetHandle: conv.peerHandle,
                        );
                      }
                    } else {
                      await ApiService.instance
                          .toggleBlock(peerId, unblock: conv.blockedByMe);
                      _loadExpressConvs();
                    }
                  } else if (act == 'report') {
                    await _openReportDialog(conv, peerId, peerName);
                  }
                },
                itemBuilder: (_) => [
                  if (conv.isFirestoreBacked) ...[
                    PopupMenuItem(
                      value: 'mute',
                      child:
                          Text(conv.isMuted ? t('chat.unmute') : t('chat.mute')),
                    ),
                    PopupMenuItem(
                      value: 'archive',
                      child: Text(conv.isArchived
                          ? t('chat.unarchive')
                          : t('chat.archive')),
                    ),
                    PopupMenuItem(
                      value: 'delete',
                      child: Text(t('chat.deleteForMe')),
                    ),
                  ],
                  if (!conv.isDemo) ...[
                    PopupMenuItem(
                      value: 'block',
                      child: Text(conv.blockedByMe
                          ? t('chat.unblockUser')
                          : t('chat.blockUser')),
                    ),
                    PopupMenuItem(
                      value: 'report',
                      child: Text(t('chat.reportUser')),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
        const Divider(height: 1),
        if (_threadError != null)
          FirestoreErrorBanner(
            error: _threadError!,
            i18n: widget.i18n,
            tokens: widget.tokens,
            onRetry: () => _subscribeFirestoreMessages(conv, myId),
            onRunHealthCheck: () => showHealthCheckSheet(
              context,
              auth: widget.auth,
              i18n: widget.i18n,
              tokens: widget.tokens,
              mode: widget.auth.isAdmin ? 'admin' : 'user',
            ),
          ),
        if (_hasOlderMessages && conv.isFirestoreBacked)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: OutlinedButton(
              onPressed: () {
                setState(() => _messagePageSize += 30);
                _subscribeFirestoreMessages(conv, myId);
              },
              child: Text(t('chat.loadOlder')),
            ),
          ),
        if (conv.blockedByMe)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            color: Colors.red.shade50,
            child: Text(
              t('chat.blockedBanner'),
              style: TextStyle(fontSize: 12, color: Colors.red.shade800),
            ),
          ),
        Expanded(
          child: ListView.builder(
            controller: _scrollCtrl,
            padding: const EdgeInsets.all(14),
            itemCount: threadMessages.length,
            itemBuilder: (_, idx) {
              final m = threadMessages[idx];
              final dt = DateTime.tryParse(m.sentAt)?.toLocal() ?? DateTime.now();
              final prevDt = idx > 0
                  ? DateTime.tryParse(threadMessages[idx - 1].sentAt)?.toLocal()
                  : null;
              final showDate = prevDt == null ||
                  prevDt.year != dt.year ||
                  prevDt.month != dt.month ||
                  prevDt.day != dt.day;

              return Column(
                children: [
                  if (showDate)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: widget.tokens.soft,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          _dateLabel(dt),
                          style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: widget.tokens.textOnSurface),
                        ),
                      ),
                    ),
                  _buildMessageBubble(conv, m, myId, dt),
                ],
              );
            },
          ),
        ),
        if (_replyingTo != null)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            color: widget.tokens.soft,
            child: Row(
              children: [
                Expanded(
                  child: Text('Replying to: ${_replyingTo!.text}',
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                ),
                IconButton(
                  icon: const Icon(Icons.close, size: 18),
                  onPressed: () => setState(() => _replyingTo = null),
                ),
              ],
            ),
          ),
        if (!conv.blockedByMe)
          Padding(
            padding: const EdgeInsets.all(10),
            child: Row(
              children: [
                IconButton(
                  onPressed: () => _showAttachMenu(conv),
                  icon: const Icon(Icons.add_circle_outline_rounded),
                ),
                Expanded(
                  child: TextField(
                    controller: _msgCtrl,
                    onChanged: (v) {
                      if (conv.isFirestoreBacked) {
                        _typingTimer?.cancel();
                        unawaited(MessengerService.instance.setMessengerTyping(
                            conv.id, myId, v.isNotEmpty,
                            isDemo: conv.isDemo));
                        if (v.isNotEmpty) {
                          _typingTimer = Timer(const Duration(seconds: 2), () {
                            unawaited(MessengerService.instance
                                .setMessengerTyping(conv.id, myId, false,
                                    isDemo: conv.isDemo));
                          });
                        }
                      } else {
                        ApiService.instance.sendTyping(conv.id, v.isNotEmpty);
                      }
                    },
                    onSubmitted: (_) => _sendText(),
                    decoration: InputDecoration(
                      hintText: t('chat.typeMessage'),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  onPressed: _sendText,
                  icon: const Icon(Icons.send_rounded),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _buildMessageBubble(
    Conversation conv,
    ChatMessage m,
    String myId,
    DateTime dt,
  ) {
    final t = widget.i18n.t;
    final isMe = m.senderId == myId;
    final translated = _translations[m.id];
    final timeStr =
        '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';

    return Align(
      alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
      child: GestureDetector(
        onLongPress: () => _showMessageActions(conv, m),
        child: Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(12),
          constraints: const BoxConstraints(maxWidth: 300),
          decoration: BoxDecoration(
            color: isMe ? widget.tokens.primary : widget.tokens.bgSurface,
            borderRadius: BorderRadius.circular(16),
            border: isMe ? null : Border.all(color: widget.tokens.borderSubtle),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (m.isDemoAutoReply)
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: _smallTag(t('chat.autoReplyDemo'), widget.tokens.soft,
                      widget.tokens.textOnSurface),
                ),
              if (m.isForwarded)
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Text(
                    '↪ ${t('chat.forwarded')}${m.forwardedFrom != null ? ' · ${m.forwardedFrom}' : ''}',
                    style: TextStyle(
                      fontSize: 10,
                      fontStyle: FontStyle.italic,
                      color: isMe ? Colors.white70 : widget.tokens.textMuted,
                    ),
                  ),
                ),
              if (m.replyToText != null)
                Container(
                  margin: const EdgeInsets.only(bottom: 6),
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    m.replyToText!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 11,
                        color: isMe ? Colors.white70 : widget.tokens.textMuted),
                  ),
                ),
              if (m.imageUrl != null && m.imageUrl!.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: GestureDetector(
                    onTap: () => _openImageLightbox(m.imageUrl!),
                    child: m.imageUrl!.startsWith('data:image')
                        ? ClipRRect(
                            borderRadius: BorderRadius.circular(10),
                            child: Image.memory(
                              base64Decode(m.imageUrl!.split(',').last),
                              height: 160,
                              width: 240,
                              fit: BoxFit.cover,
                            ),
                          )
                        : FoodImageView(
                            url: m.imageUrl,
                            height: 160,
                            width: 240,
                            borderRadius: BorderRadius.circular(10),
                          ),
                  ),
                ),
              if (m.messageType == MessageType.file && m.fileName != null)
                Container(
                  margin: const EdgeInsets.only(bottom: 6),
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.attach_file_rounded,
                          size: 16,
                          color:
                              isMe ? Colors.white : widget.tokens.textPrimary),
                      const SizedBox(width: 6),
                      Flexible(
                        child: Text(
                          m.fileName!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontWeight: FontWeight.w700,
                              color: isMe
                                  ? Colors.white
                                  : widget.tokens.textPrimary),
                        ),
                      ),
                    ],
                  ),
                ),
              if (m.messageType == MessageType.location && m.locationLat != null)
                InkWell(
                  onTap: () {
                    final uri = Uri.parse(
                        'https://www.openstreetmap.org/?mlat=${m.locationLat}&mlon=${m.locationLng}#map=16/${m.locationLat}/${m.locationLng}');
                    unawaited(launchUrl(uri, mode: LaunchMode.externalApplication));
                  },
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.location_pin,
                            size: 16, color: isMe ? Colors.white : Colors.red),
                        const SizedBox(width: 4),
                        Text(
                          '${m.locationLabel ?? 'Pin'}: ${m.locationLat!.toStringAsFixed(4)}, ${m.locationLng!.toStringAsFixed(4)}',
                          style: TextStyle(
                              decoration: TextDecoration.underline,
                              color: isMe
                                  ? Colors.white
                                  : widget.tokens.textPrimary,
                              fontWeight: FontWeight.w700),
                        ),
                      ],
                    ),
                  ),
                ),
              Text(
                m.text,
                style: TextStyle(
                  color: isMe ? Colors.white : widget.tokens.textPrimary,
                ),
              ),
              if (translated != null) ...[
                const SizedBox(height: 6),
                Text(
                  translated,
                  style: TextStyle(
                    fontSize: 12,
                    fontStyle: FontStyle.italic,
                    color:
                        isMe ? Colors.white70 : widget.tokens.textSecondary,
                  ),
                ),
              ],
              if (m.reactions.isNotEmpty) ...[
                const SizedBox(height: 4),
                Wrap(
                  spacing: 4,
                  children: m.reactions.map((r) => Text(r.emoji)).toList(),
                ),
              ],
              const SizedBox(height: 4),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    timeStr,
                    style: TextStyle(
                        fontSize: 10,
                        color: isMe ? Colors.white70 : widget.tokens.textMuted),
                  ),
                  if (isMe) ...[
                    const SizedBox(width: 4),
                    if (m.pending)
                      const SizedBox(
                        width: 10,
                        height: 10,
                        child: CircularProgressIndicator(
                            strokeWidth: 1.5, color: Colors.white70),
                      )
                    else if (m.failed)
                      InkWell(
                        onTap: () => _retryFailedMessage(m),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.error_outline,
                                size: 13, color: Colors.amberAccent),
                            const SizedBox(width: 3),
                            Text(t('chat.retry'),
                                style: const TextStyle(
                                    fontSize: 10, color: Colors.amberAccent)),
                          ],
                        ),
                      )
                    else
                      Icon(
                        m.status == 'read' || m.status == 'delivered'
                            ? Icons.done_all_rounded
                            : Icons.done_rounded,
                        size: 13,
                        color: m.status == 'read'
                            ? Colors.lightBlueAccent
                            : Colors.white70,
                      ),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _openImageLightbox(String url) {
    showDialog(
      context: context,
      builder: (ctx) => Dialog(
        child: InteractiveViewer(
          child: url.startsWith('data:image')
              ? Image.memory(base64Decode(url.split(',').last))
              : FoodImageView(url: url),
        ),
      ),
    );
  }

  void _showAttachMenu(Conversation conv) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Photo Gallery'),
              onTap: () {
                Navigator.pop(ctx);
                _pickAndSendImage(ImageSource.gallery);
              },
            ),
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined),
              title: const Text('Camera Photo'),
              onTap: () {
                Navigator.pop(ctx);
                _pickAndSendImage(ImageSource.camera);
              },
            ),
            ListTile(
              leading: const Icon(Icons.location_on_outlined),
              title: const Text('Share Map Pin'),
              onTap: () {
                Navigator.pop(ctx);
                _sendLocation();
              },
            ),
            if (conv.isFirestoreBacked)
              ListTile(
                leading: const Icon(Icons.description_outlined),
                title: const Text('Attach Text Note File'),
                onTap: () {
                  Navigator.pop(ctx);
                  _sendTextNoteAttachment();
                },
              ),
          ],
        ),
      ),
    );
  }

  void _showMessageActions(Conversation conv, ChatMessage m) {
    final t = widget.i18n.t;
    final myId = widget.auth.user!.id;
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  for (final e in ['👍', '❤️', '🙏', '😊', '🍽️'])
                    InkWell(
                      onTap: () async {
                        Navigator.pop(ctx);
                        if (conv.isFirestoreBacked) {
                          await MessengerService.instance
                              .toggleMessengerReaction(
                            conv.id,
                            m,
                            myId,
                            e,
                            isDemo: conv.isDemo,
                          );
                        } else {
                          await ApiService.instance.reactToMessage(m.id, e);
                          _openConv(conv);
                        }
                      },
                      child: Text(e, style: const TextStyle(fontSize: 26)),
                    ),
                ],
              ),
            ),
            ListTile(
              leading: const Icon(Icons.reply_rounded),
              title: const Text('Reply'),
              onTap: () {
                Navigator.pop(ctx);
                setState(() => _replyingTo = m);
              },
            ),
            if (conv.isFirestoreBacked)
              ListTile(
                leading: const Icon(Icons.forward_rounded),
                title: Text(t('chat.forwardTo')),
                onTap: () {
                  Navigator.pop(ctx);
                  _openForwardSheet(conv, m);
                },
              ),
            ListTile(
              leading: const Icon(Icons.translate_rounded),
              title: Text(widget.i18n.isBn
                  ? 'Translate to English'
                  : 'Translate to বাংলা'),
              onTap: () async {
                Navigator.pop(ctx);
                final out = await ApiService.instance.translateMessage(
                    m.text, widget.i18n.isBn ? 'en' : 'bn');
                if (mounted) setState(() => _translations[m.id] = out);
              },
            ),
            if (conv.isFirestoreBacked && !m.pending)
              ListTile(
                leading: const Icon(Icons.delete_outline_rounded,
                    color: Colors.red),
                title: Text(t('chat.deleteForMe'),
                    style: const TextStyle(color: Colors.red)),
                onTap: () async {
                  Navigator.pop(ctx);
                  await MessengerService.instance.deleteMessageForMe(
                    conv.id,
                    m.id,
                    myId,
                    isDemo: conv.isDemo,
                  );
                },
              ),
          ],
        ),
      ),
    );
  }

  void _openForwardSheet(Conversation sourceConv, ChatMessage m) {
    final targets = _allConvs
        .where((c) => c.id != sourceConv.id && c.isFirestoreBacked && !c.isBlocked)
        .toList();
    final me = widget.auth.user!;
    final fromLabel = _peerName(sourceConv, me.id);
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: Text(widget.i18n.t('chat.forwardTo'),
                  style: const TextStyle(
                      fontWeight: FontWeight.w800, fontSize: 16)),
            ),
            const Divider(height: 1),
            if (targets.isEmpty)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Text('No other Firestore conversations available.'),
              )
            else
              Flexible(
                child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: targets.length,
                  itemBuilder: (_, idx) {
                    final target = targets[idx];
                    final name = _peerName(target, me.id);
                    return ListTile(
                      leading: ShopAvatar(
                          name: name,
                          imageUrl: target.donorLogoUrl ?? target.listingPhoto),
                      title: Text(name),
                      onTap: () async {
                        Navigator.pop(ctx);
                        await MessengerService.instance.forwardMessengerMessage(
                          targets: [target],
                          sourceMessage: m,
                          senderId: me.id,
                          senderName: me.name,
                          forwardedFromLabel: fromLabel,
                          lang: widget.i18n.lang,
                        );
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('Forwarded to $name')),
                          );
                        }
                      },
                    );
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _openReportDialog(
    Conversation conv,
    String peerId,
    String peerName,
  ) async {
    final t = widget.i18n.t;
    final reasonCtrl = TextEditingController(text: 'Inappropriate behavior');
    final detailsCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('${t('chat.reportUser')}: $peerName'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: reasonCtrl,
              decoration: InputDecoration(labelText: t('chat.reportReason')),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: detailsCtrl,
              maxLines: 3,
              decoration: InputDecoration(labelText: t('chat.reportDetails')),
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text(t('common.cancel'))),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(t('chat.submitReport'))),
        ],
      ),
    );
    if (ok != true) return;
    if (conv.isFirestoreBacked) {
      await MessengerService.instance.reportUserInFirestore(
        reporterId: widget.auth.user!.id,
        targetUserId: peerId,
        targetName: peerName,
        reason: reasonCtrl.text.trim(),
        details: detailsCtrl.text.trim(),
        conversationId: conv.id,
      );
    } else {
      await ApiService.instance.submitReport(
        targetType: 'user',
        targetId: peerId,
        reason: reasonCtrl.text.trim(),
      );
    }
    if (mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(t('chat.reportSubmitted'))));
    }
  }

  void _openFindPeopleSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => FractionallySizedBox(
        heightFactor: 0.88,
        child: FindPeopleSheet(
          auth: widget.auth,
          i18n: widget.i18n,
          tokens: widget.tokens,
          blockedUids: _blockedSet,
          onSelectPerson: _startDirectChatWithDirectoryEntry,
        ),
      ),
    );
  }
}
