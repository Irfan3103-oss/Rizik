import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../i18n/i18n_provider.dart';
import '../models/models.dart';
import '../providers/auth_provider.dart';
import '../services/community_rooms_service.dart';
import '../services/firestore_error_helper.dart';
import '../theme/palettes.dart';
import '../widgets/common_widgets.dart';
import '../widgets/health_check_sheet.dart';

class CommunityRoomScreen extends StatefulWidget {
  final CommunityRoom room;
  final AuthProvider auth;
  final I18nProvider i18n;
  final PaletteTokens tokens;
  final void Function(RoomMember member) onOpenDirectChat;

  const CommunityRoomScreen({
    super.key,
    required this.room,
    required this.auth,
    required this.i18n,
    required this.tokens,
    required this.onOpenDirectChat,
  });

  @override
  State<CommunityRoomScreen> createState() => _CommunityRoomScreenState();
}

class _CommunityRoomScreenState extends State<CommunityRoomScreen> {
  final TextEditingController _msgCtrl = TextEditingController();
  final ScrollController _scrollCtrl = ScrollController();

  late CommunityRoom _room;
  List<RoomMessage> _messages = [];
  List<RoomMember> _members = [];
  bool _hasMore = false;
  int _pageSize = 40;
  bool _sending = false;
  RoomMessage? _replyingTo;
  FirestoreListenerError? _error;

  StreamSubscription<RoomMessagesPage>? _msgSub;
  StreamSubscription<List<RoomMember>>? _memSub;
  StreamSubscription<List<CommunityRoom>>? _roomSub;

  @override
  void initState() {
    super.initState();
    _room = widget.room;
    _subscribe();
    _syncPresence(online: true);
  }

  void _syncPresence({required bool online}) {
    final user = widget.auth.user;
    if (user == null ||
        !widget.auth.isFirebaseSession ||
        !widget.auth.isFirebaseVerified) {
      return;
    }
    unawaited(
      CommunityRoomsService.instance.ensureRoomMemberPresence(
        _room.id,
        user,
        online: online,
      ),
    );
  }

  void _subscribe() {
    _msgSub?.cancel();
    _memSub?.cancel();
    _roomSub?.cancel();
    setState(() => _error = null);

    _roomSub = CommunityRoomsService.instance.watchCommunityRooms().listen(
      (rooms) {
        final match = rooms.where((r) => r.id == _room.id).firstOrNull;
        if (match != null && mounted) {
          setState(() => _room = match);
        }
      },
      onError: (_) {},
    );

    _msgSub = CommunityRoomsService.instance
        .watchRoomMessages(
      _room.id,
      pageSize: _pageSize,
      onError: (err) {
        if (mounted) setState(() => _error = err);
      },
    )
        .listen(
      (page) {
        if (!mounted) return;
        setState(() {
          _messages = page.messages;
          _hasMore = page.hasMore;
          _error = null;
        });
        _scrollToBottom();
      },
      onError: (e) {
        final parsed = e is FirestoreListenerError
            ? e
            : parseFirestoreListenerError(
                e, 'LIST', 'rooms/${_room.id}/messages');
        if (mounted) setState(() => _error = parsed);
      },
    );

    _memSub = CommunityRoomsService.instance
        .watchRoomMembers(
      _room.id,
      onError: (err) {
        if (mounted && _error == null) setState(() => _error = err);
      },
    )
        .listen(
      (members) {
        if (mounted) setState(() => _members = members);
      },
      onError: (_) {},
    );
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  void dispose() {
    _syncPresence(online: false);
    _msgSub?.cancel();
    _memSub?.cancel();
    _roomSub?.cancel();
    _msgCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  Future<void> _sendText() async {
    final user = widget.auth.user;
    final text = _msgCtrl.text.trim();
    if (user == null || text.isEmpty || _sending) return;
    _msgCtrl.clear();
    final reply = _replyingTo;
    setState(() {
      _sending = true;
      _replyingTo = null;
    });
    try {
      await CommunityRoomsService.instance.sendRoomMessage(
        room: _room,
        user: user,
        text: text,
        replyTo: reply,
      );
      _scrollToBottom();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _sendImage(ImageSource source) async {
    final user = widget.auth.user;
    if (user == null || _sending) return;
    final picker = ImagePicker();
    final xfile = await picker.pickImage(
      source: source,
      maxWidth: 1080,
      imageQuality: 75,
    );
    if (xfile == null) return;
    final bytes = await xfile.readAsBytes();
    final b64Fallback = 'data:image/jpeg;base64,${base64Encode(bytes)}';
    setState(() => _sending = true);
    try {
      await CommunityRoomsService.instance.sendRoomMessage(
        room: _room,
        user: user,
        text: _msgCtrl.text.trim(),
        imageBytes: bytes,
        mediaUrlFallback: b64Fallback.length <= 445000 ? b64Fallback : null,
        replyTo: _replyingTo,
      );
      _msgCtrl.clear();
      if (mounted) setState(() => _replyingTo = null);
      _scrollToBottom();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _openMembersSheet() {
    final t = widget.i18n.t;
    final myUid = widget.auth.user?.id ?? '';
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: FractionallySizedBox(
          heightFactor: 0.72,
          child: Column(
            children: [
              ListTile(
                leading:
                    Icon(Icons.groups_rounded, color: widget.tokens.primary),
                title: Text(
                  '${t('rooms.members')} (${_members.length})',
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                subtitle: Text(t('rooms.tapMemberHint'),
                    style: const TextStyle(fontSize: 12)),
                trailing: IconButton(
                  icon: const Icon(Icons.close_rounded),
                  onPressed: () => Navigator.pop(ctx),
                ),
              ),
              const Divider(height: 1),
              Expanded(
                child: _members.isEmpty
                    ? Center(child: Text(t('common.loading')))
                    : ListView.builder(
                        itemCount: _members.length,
                        itemBuilder: (_, idx) {
                          final mem = _members[idx];
                          final isMe = mem.uid == myUid;
                          final isMuted = _room.mutedUids.contains(mem.uid);
                          return ListTile(
                            leading: ShopAvatar(
                              name: mem.displayName,
                              imageUrl: mem.photoURL,
                              online: mem.online,
                            ),
                            title: Row(
                              children: [
                                Flexible(
                                  child: Text(
                                    mem.displayName,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w700),
                                  ),
                                ),
                                if (mem.isDemo) ...[
                                  const SizedBox(width: 6),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 6, vertical: 1),
                                    decoration: BoxDecoration(
                                      color: widget.tokens.soft,
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: Text(
                                      t('chat.demoBadge'),
                                      style: TextStyle(
                                          fontSize: 10,
                                          fontWeight: FontWeight.w800,
                                          color: widget.tokens.textOnSurface),
                                    ),
                                  ),
                                ],
                                if (isMuted) ...[
                                  const SizedBox(width: 6),
                                  const Icon(Icons.volume_off_rounded,
                                      size: 14, color: Colors.red),
                                ],
                              ],
                            ),
                            subtitle: Text(
                              '${mem.handle ?? mem.uid} · ${mem.area ?? 'Dhaka'}',
                              style: TextStyle(
                                  fontSize: 12, color: widget.tokens.textMuted),
                            ),
                            trailing: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                if (widget.auth.isAdmin && !isMe && !mem.isDemo)
                                  IconButton(
                                    tooltip: isMuted ? 'Unmute' : 'Mute',
                                    icon: Icon(
                                      isMuted
                                          ? Icons.volume_up_rounded
                                          : Icons.volume_off_rounded,
                                      size: 19,
                                      color: isMuted
                                          ? Colors.green
                                          : Colors.orange.shade700,
                                    ),
                                    onPressed: () async {
                                      await CommunityRoomsService.instance
                                          .adminToggleMuteUserInRoom(
                                        _room.id,
                                        mem.uid,
                                        !isMuted,
                                      );
                                    },
                                  ),
                                if (!isMe)
                                  Icon(Icons.chat_bubble_outline_rounded,
                                      size: 19, color: widget.tokens.primary),
                              ],
                            ),
                            onTap: isMe
                                ? null
                                : () {
                                    Navigator.pop(ctx);
                                    Navigator.pop(context);
                                    widget.onOpenDirectChat(mem);
                                  },
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showMessageActions(RoomMessage m) {
    final me = widget.auth.user;
    if (me == null || m.deleted) return;
    final t = widget.i18n.t;

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
                  for (final e in ['❤️', '🙏', '👍', '🍽️', '😊'])
                    InkWell(
                      onTap: () async {
                        Navigator.pop(ctx);
                        await CommunityRoomsService.instance
                            .toggleRoomMessageReaction(_room.id, m, me.id, e);
                      },
                      child: Text(e, style: const TextStyle(fontSize: 26)),
                    ),
                ],
              ),
            ),
            ListTile(
              leading: const Icon(Icons.reply_rounded),
              title: Text(t('chat.reply')),
              onTap: () {
                Navigator.pop(ctx);
                setState(() => _replyingTo = m);
              },
            ),
            if (m.senderId != me.id)
              ListTile(
                leading: const Icon(Icons.chat_outlined),
                title: Text('Direct Message ${m.senderName}'),
                onTap: () {
                  Navigator.pop(ctx);
                  Navigator.pop(context);
                  widget.onOpenDirectChat(RoomMember(
                    uid: m.senderId,
                    displayName: m.senderName,
                    handle: m.senderHandle,
                    photoURL: m.senderAvatar,
                    role: m.senderRole,
                    area: m.senderArea,
                    online: true,
                    isDemo: m.senderIsDemo,
                    updatedAt: DateTime.now().toIso8601String(),
                  ));
                },
              ),
            if (m.senderId != me.id)
              ListTile(
                leading: const Icon(Icons.flag_outlined, color: Colors.orange),
                title: Text(t('chat.reportUser')),
                onTap: () async {
                  Navigator.pop(ctx);
                  await CommunityRoomsService.instance.reportRoomMessage(
                    roomId: _room.id,
                    message: m,
                    reporterUid: me.id,
                    reason: 'Reported from community room',
                  );
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(t('chat.reportSubmitted'))),
                    );
                  }
                },
              ),
            if (widget.auth.isAdmin)
              ListTile(
                leading:
                    const Icon(Icons.delete_outline_rounded, color: Colors.red),
                title: const Text('Remove message (Moderator)',
                    style: TextStyle(color: Colors.red)),
                onTap: () async {
                  Navigator.pop(ctx);
                  await CommunityRoomsService.instance
                      .adminSetRoomMessageDeleted(_room.id, m.id, true);
                },
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.i18n.t;
    final isBn = widget.i18n.isBn;
    final myUid = widget.auth.user?.id ?? '';
    final isMuted = _room.mutedUids.contains(myUid);
    final onlineCount = _members.where((m) => m.online).length;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              isBn ? _room.nameBn : _room.name,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
            ),
            Text(
              '${_members.isNotEmpty ? _members.length : _room.memberCount} ${t('rooms.members')} · '
              '${onlineCount > 0 ? onlineCount : _room.onlineCount} ${t('rooms.onlineCount')}',
              style: TextStyle(fontSize: 12, color: widget.tokens.textMuted),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: t('rooms.members'),
            icon: const Icon(Icons.groups_rounded),
            onPressed: _openMembersSheet,
          ),
        ],
      ),
      body: Column(
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            color: widget.tokens.soft,
            child: Text(
              isBn ? _room.descriptionBn : _room.description,
              style: TextStyle(
                  fontSize: 12,
                  color: widget.tokens.textOnSurface,
                  fontWeight: FontWeight.w600),
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
          if (_hasMore)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: OutlinedButton(
                onPressed: () {
                  setState(() => _pageSize += 30);
                  _subscribe();
                },
                child: Text(t('chat.loadOlder')),
              ),
            ),
          Expanded(
            child: _messages.isEmpty && _error == null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        t('rooms.empty'),
                        textAlign: TextAlign.center,
                        style: TextStyle(color: widget.tokens.textMuted),
                      ),
                    ),
                  )
                : ListView.builder(
                    controller: _scrollCtrl,
                    padding: const EdgeInsets.all(14),
                    itemCount: _messages.length,
                    itemBuilder: (_, idx) {
                      final m = _messages[idx];
                      final isMe = m.senderId == myUid;
                      final dt = DateTime.tryParse(m.createdAt)?.toLocal() ??
                          DateTime.now();
                      final timeStr =
                          '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';

                      return Align(
                        alignment:
                            isMe ? Alignment.centerRight : Alignment.centerLeft,
                        child: GestureDetector(
                          onLongPress: () => _showMessageActions(m),
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 10),
                            padding: const EdgeInsets.all(12),
                            constraints: const BoxConstraints(maxWidth: 320),
                            decoration: BoxDecoration(
                              color: isMe
                                  ? widget.tokens.primary
                                  : widget.tokens.bgSurface,
                              borderRadius: BorderRadius.circular(16),
                              border: isMe
                                  ? null
                                  : Border.all(
                                      color: widget.tokens.borderSubtle),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                if (!isMe)
                                  Padding(
                                    padding: const EdgeInsets.only(bottom: 4),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        ShopAvatar(
                                          name: m.senderName,
                                          imageUrl: m.senderAvatar,
                                          size: 20,
                                        ),
                                        const SizedBox(width: 6),
                                        Flexible(
                                          child: Text(
                                            m.senderName,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: TextStyle(
                                              fontSize: 12,
                                              fontWeight: FontWeight.w800,
                                              color: widget.tokens.primary,
                                            ),
                                          ),
                                        ),
                                        if (m.senderVerified) ...[
                                          const SizedBox(width: 4),
                                          Icon(Icons.verified_rounded,
                                              size: 13,
                                              color: widget.tokens.primary),
                                        ],
                                        if (m.senderIsDemo) ...[
                                          const SizedBox(width: 5),
                                          Container(
                                            padding: const EdgeInsets.symmetric(
                                                horizontal: 5, vertical: 1),
                                            decoration: BoxDecoration(
                                              color: widget.tokens.soft,
                                              borderRadius:
                                                  BorderRadius.circular(5),
                                            ),
                                            child: Text(
                                              t('chat.demoBadge'),
                                              style: TextStyle(
                                                fontSize: 9,
                                                fontWeight: FontWeight.w800,
                                                color:
                                                    widget.tokens.textOnSurface,
                                              ),
                                            ),
                                          ),
                                        ],
                                      ],
                                    ),
                                  ),
                                if (m.replyToText != null)
                                  Container(
                                    margin: const EdgeInsets.only(bottom: 6),
                                    padding: const EdgeInsets.all(6),
                                    decoration: BoxDecoration(
                                      color:
                                          Colors.black.withValues(alpha: 0.10),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Text(
                                      '${m.replyToSenderName ?? ''}: ${m.replyToText}',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                        fontSize: 11,
                                        color: isMe
                                            ? Colors.white70
                                            : widget.tokens.textMuted,
                                      ),
                                    ),
                                  ),
                                if (m.deleted)
                                  Text(
                                    t('rooms.deletedMessage'),
                                    style: TextStyle(
                                      fontStyle: FontStyle.italic,
                                      color: isMe
                                          ? Colors.white70
                                          : widget.tokens.textMuted,
                                    ),
                                  )
                                else ...[
                                  if (m.mediaUrl != null &&
                                      m.mediaUrl!.isNotEmpty)
                                    Padding(
                                      padding: const EdgeInsets.only(bottom: 6),
                                      child: m.mediaUrl!
                                              .startsWith('data:image')
                                          ? ClipRRect(
                                              borderRadius:
                                                  BorderRadius.circular(10),
                                              child: Image.memory(
                                                base64Decode(
                                                    m.mediaUrl!.split(',').last),
                                                height: 160,
                                                width: 240,
                                                fit: BoxFit.cover,
                                              ),
                                            )
                                          : FoodImageView(
                                              url: m.mediaUrl,
                                              height: 160,
                                              width: 240,
                                              borderRadius:
                                                  BorderRadius.circular(10),
                                            ),
                                    ),
                                  if (m.text.isNotEmpty)
                                    Text(
                                      m.text,
                                      style: TextStyle(
                                        color: isMe
                                            ? Colors.white
                                            : widget.tokens.textPrimary,
                                      ),
                                    ),
                                ],
                                if (m.reactions.isNotEmpty) ...[
                                  const SizedBox(height: 6),
                                  Wrap(
                                    spacing: 6,
                                    children: m.reactions.entries
                                        .where((e) => e.value.isNotEmpty)
                                        .map((e) => Container(
                                              padding:
                                                  const EdgeInsets.symmetric(
                                                      horizontal: 6,
                                                      vertical: 2),
                                              decoration: BoxDecoration(
                                                color: Colors.black
                                                    .withValues(alpha: 0.08),
                                                borderRadius:
                                                    BorderRadius.circular(10),
                                              ),
                                              child: Text(
                                                '${e.key} ${e.value.length}',
                                                style: TextStyle(
                                                  fontSize: 11,
                                                  color: isMe
                                                      ? Colors.white
                                                      : widget
                                                          .tokens.textPrimary,
                                                ),
                                              ),
                                            ))
                                        .toList(),
                                  ),
                                ],
                                const SizedBox(height: 4),
                                Text(
                                  timeStr,
                                  style: TextStyle(
                                    fontSize: 10,
                                    color: isMe
                                        ? Colors.white70
                                        : widget.tokens.textMuted,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
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
                    child: Text(
                      '${t('rooms.replyingTo')} ${_replyingTo!.senderName}: ${_replyingTo!.text}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close_rounded, size: 18),
                    onPressed: () => setState(() => _replyingTo = null),
                  ),
                ],
              ),
            ),
          if (isMuted)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              color: Colors.red.shade50,
              child: Text(
                t('rooms.mutedBanner'),
                textAlign: TextAlign.center,
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: Colors.red.shade800),
              ),
            )
          else
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.all(10),
                child: Row(
                  children: [
                    IconButton(
                      onPressed: () => _sendImage(ImageSource.gallery),
                      icon: const Icon(Icons.photo_outlined),
                    ),
                    Expanded(
                      child: TextField(
                        controller: _msgCtrl,
                        onSubmitted: (_) => _sendText(),
                        decoration: InputDecoration(
                          hintText: t('rooms.typePlaceholder'),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton.filled(
                      onPressed: _sending ? null : _sendText,
                      icon: const Icon(Icons.send_rounded),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
