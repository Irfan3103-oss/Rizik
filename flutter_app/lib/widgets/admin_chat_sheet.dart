import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../i18n/i18n_provider.dart';
import '../models/models.dart';
import '../providers/auth_provider.dart';
import '../services/admin_chat_service.dart';
import '../theme/palettes.dart';
import 'common_widgets.dart';

Future<void> showAdminSupportChatSheet(
  BuildContext context, {
  required AuthProvider auth,
  required I18nProvider i18n,
  required PaletteTokens tokens,
  required String ownerUid,
  String? ownerName,
  String? restaurantName,
  String? restaurantLogoUrl,
  RestaurantVerificationStatus verificationStatus =
      RestaurantVerificationStatus.pending,
}) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => FractionallySizedBox(
      heightFactor: 0.92,
      child: AdminSupportChatSheet(
        auth: auth,
        i18n: i18n,
        tokens: tokens,
        ownerUid: ownerUid,
        ownerName: ownerName ?? 'Owner',
        restaurantName: restaurantName ?? 'Restaurant',
        restaurantLogoUrl: restaurantLogoUrl,
        verificationStatus: verificationStatus,
      ),
    ),
  );
}

class AdminSupportChatSheet extends StatefulWidget {
  final AuthProvider auth;
  final I18nProvider i18n;
  final PaletteTokens tokens;
  final String ownerUid;
  final String ownerName;
  final String restaurantName;
  final String? restaurantLogoUrl;
  final RestaurantVerificationStatus verificationStatus;

  const AdminSupportChatSheet({
    super.key,
    required this.auth,
    required this.i18n,
    required this.tokens,
    required this.ownerUid,
    required this.ownerName,
    required this.restaurantName,
    this.restaurantLogoUrl,
    required this.verificationStatus,
  });

  @override
  State<AdminSupportChatSheet> createState() => _AdminSupportChatSheetState();
}

class _AdminSupportChatSheetState extends State<AdminSupportChatSheet> {
  final TextEditingController _msgCtrl = TextEditingController();
  final ScrollController _scrollCtrl = ScrollController();
  AdminConversation? _conv;
  List<AdminChatMessage> _messages = [];
  StreamSubscription? _convSub;
  StreamSubscription? _msgSub;
  Timer? _typingTimer;
  bool _sending = false;

  String get _convId => AdminChatService.instance.getAdminConvId(widget.ownerUid);
  String get _viewerRole => widget.auth.isAdmin ? 'admin' : 'owner';

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    try {
      await AdminChatService.instance.ensureAdminConversationForOwner(
        ownerUid: widget.ownerUid,
        ownerName: widget.ownerName,
        restaurantName: widget.restaurantName,
        restaurantLogoUrl: widget.restaurantLogoUrl,
        verificationStatus: widget.verificationStatus,
      );
    } catch (_) {}

    _convSub = AdminChatService.instance
        .watchMyAdminConversation(widget.ownerUid)
        .listen((c) {
      if (mounted) setState(() => _conv = c);
    }, onError: (_) {});

    _msgSub = AdminChatService.instance
        .watchAdminChatMessages(_convId, widget.ownerUid)
        .listen((msgs) {
      if (!mounted) return;
      setState(() => _messages = msgs);
      final me = widget.auth.user;
      if (me != null) {
        final unread = _viewerRole == 'admin'
            ? (_conv?.adminUnreadCount ?? 0)
            : (_conv?.ownerUnreadCount ?? 0);
        unawaited(AdminChatService.instance.markAdminConversationRead(
          conversationId: _convId,
          viewerUid: me.id,
          viewerRole: _viewerRole,
          messages: msgs,
          unreadCount: unread,
        ));
      }
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scrollCtrl.hasClients) {
          _scrollCtrl.animateTo(
            _scrollCtrl.position.maxScrollExtent,
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOut,
          );
        }
      });
    }, onError: (_) {});
  }

  @override
  void dispose() {
    _typingTimer?.cancel();
    _convSub?.cancel();
    _msgSub?.cancel();
    _msgCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  Future<void> _sendText() async {
    final text = _msgCtrl.text.trim();
    final me = widget.auth.user;
    if (text.isEmpty || me == null || _sending) return;
    _msgCtrl.clear();
    _typingTimer?.cancel();
    unawaited(AdminChatService.instance.setAdminChatTyping(
      conversationId: _convId,
      viewerRole: _viewerRole,
      isTyping: false,
    ));
    setState(() => _sending = true);
    try {
      await AdminChatService.instance.sendAdminChatMessage(
        conversationId: _convId,
        ownerUid: widget.ownerUid,
        senderId: me.id,
        senderRole: _viewerRole,
        senderName: widget.auth.isAdmin ? 'Rizik Team' : me.name,
        restaurantName: _conv?.restaurantName ?? widget.restaurantName,
        ownerName: _conv?.ownerName ?? widget.ownerName,
        restaurantLogoUrl:
            _conv?.restaurantLogoUrl ?? widget.restaurantLogoUrl,
        verificationStatus:
            _conv?.verificationStatus ?? widget.verificationStatus,
        text: text,
        messageType: 'text',
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _pickImage() async {
    final me = widget.auth.user;
    if (me == null) return;
    final picker = ImagePicker();
    final xfile = await picker.pickImage(
        source: ImageSource.gallery, maxWidth: 960, imageQuality: 75);
    if (xfile == null) return;
    final bytes = await xfile.readAsBytes();
    final b64 = 'data:image/jpeg;base64,${base64Encode(bytes)}';
    if (b64.length > 445000) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Image is too large (max ~440 KB).')),
        );
      }
      return;
    }
    await AdminChatService.instance.sendAdminChatMessage(
      conversationId: _convId,
      ownerUid: widget.ownerUid,
      senderId: me.id,
      senderRole: _viewerRole,
      senderName: widget.auth.isAdmin ? 'Rizik Team' : me.name,
      restaurantName: _conv?.restaurantName ?? widget.restaurantName,
      ownerName: _conv?.ownerName ?? widget.ownerName,
      restaurantLogoUrl: _conv?.restaurantLogoUrl ?? widget.restaurantLogoUrl,
      verificationStatus:
          _conv?.verificationStatus ?? widget.verificationStatus,
      text: 'Shared photo',
      messageType: 'image',
      mediaUrl: b64,
    );
  }

  @override
  Widget build(BuildContext context) {
    final peerTyping = widget.auth.isAdmin
        ? (_conv?.ownerTyping == true)
        : (_conv?.adminTyping == true);
    final statusLabel =
        (_conv?.verificationStatus ?? widget.verificationStatus).name;

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(
          children: [
            ShopAvatar(
              name: widget.restaurantName,
              imageUrl: widget.restaurantLogoUrl,
              size: 36,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.auth.isAdmin
                        ? '${widget.restaurantName} · ${widget.ownerName}'
                        : widget.i18n.t('chat.adminSupport'),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w800),
                  ),
                  Text(
                    peerTyping
                        ? widget.i18n.t('chat.typing')
                        : 'Verification: ${statusLabel.toUpperCase()}',
                    style:
                        TextStyle(fontSize: 11, color: widget.tokens.textMuted),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: _messages.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        widget.i18n.t('chat.adminSupportSub'),
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
                      if (m.senderRole == 'system') {
                        return Container(
                          margin: const EdgeInsets.symmetric(vertical: 8),
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: widget.tokens.soft,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            children: [
                              Icon(Icons.info_outline_rounded,
                                  size: 16, color: widget.tokens.primary),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  m.text,
                                  style: const TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600),
                                ),
                              ),
                            ],
                          ),
                        );
                      }
                      final isMe = m.senderId == widget.auth.user?.id;
                      return Align(
                        alignment:
                            isMe ? Alignment.centerRight : Alignment.centerLeft,
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.all(12),
                          constraints: const BoxConstraints(maxWidth: 300),
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
                              if (m.mediaUrl != null &&
                                  m.messageType == 'image')
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 6),
                                  child: ClipRRect(
                                    borderRadius: BorderRadius.circular(10),
                                    child: m.mediaUrl!.startsWith('data:image')
                                        ? Image.memory(
                                            base64Decode(
                                                m.mediaUrl!.split(',').last),
                                            height: 150,
                                            width: 220,
                                            fit: BoxFit.cover,
                                          )
                                        : FoodImageView(
                                            url: m.mediaUrl,
                                            height: 150,
                                            width: 220,
                                          ),
                                  ),
                                ),
                              Text(
                                m.text,
                                style: TextStyle(
                                  color: isMe
                                      ? Colors.white
                                      : widget.tokens.textPrimary,
                                ),
                              ),
                              const SizedBox(height: 3),
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(
                                    m.senderName,
                                    style: TextStyle(
                                      fontSize: 10,
                                      color: isMe
                                          ? Colors.white70
                                          : widget.tokens.textMuted,
                                    ),
                                  ),
                                  if (isMe) ...[
                                    const SizedBox(width: 4),
                                    Icon(
                                      m.status == 'read'
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
                      );
                    },
                  ),
          ),
          Padding(
            padding: const EdgeInsets.all(10),
            child: Row(
              children: [
                IconButton(
                  onPressed: _pickImage,
                  icon: const Icon(Icons.photo_outlined),
                ),
                Expanded(
                  child: TextField(
                    controller: _msgCtrl,
                    onChanged: (v) {
                      _typingTimer?.cancel();
                      unawaited(AdminChatService.instance.setAdminChatTyping(
                        conversationId: _convId,
                        viewerRole: _viewerRole,
                        isTyping: v.isNotEmpty,
                      ));
                      if (v.isNotEmpty) {
                        _typingTimer = Timer(const Duration(seconds: 2), () {
                          unawaited(AdminChatService.instance.setAdminChatTyping(
                            conversationId: _convId,
                            viewerRole: _viewerRole,
                            isTyping: false,
                          ));
                        });
                      }
                    },
                    onSubmitted: (_) => _sendText(),
                    decoration: InputDecoration(
                      hintText: widget.i18n.t('chat.typeMessage'),
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
        ],
      ),
    );
  }
}
