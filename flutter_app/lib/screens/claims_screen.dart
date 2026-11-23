import 'dart:async';
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../i18n/i18n_provider.dart';
import '../models/models.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../services/firestore_service.dart';
import '../services/messenger_service.dart';
import '../theme/palettes.dart';
import '../widgets/common_widgets.dart';

class ClaimsScreen extends StatefulWidget {
  final AuthProvider auth;
  final I18nProvider i18n;
  final PaletteTokens tokens;
  final void Function(String tab, {String? convId}) onNavigate;
  final VoidCallback onRequestLogin;

  const ClaimsScreen({
    super.key,
    required this.auth,
    required this.i18n,
    required this.tokens,
    required this.onNavigate,
    required this.onRequestLogin,
  });

  @override
  State<ClaimsScreen> createState() => _ClaimsScreenState();
}

class _ClaimsScreenState extends State<ClaimsScreen> {
  List<Claim> _expressClaims = [];
  List<Claim> _fbClaims = [];
  final Set<String> _reviewedIds = {};
  StreamSubscription? _fbClaimsSub;
  int _usedToday = 0;
  int _dailyLimit = 3;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    if (widget.auth.isLoggedIn) {
      _load();
      _fbClaimsSub = FirestoreService.instance
          .watchMyClaims(widget.auth.user!.id)
          .listen((items) {
        if (mounted) setState(() => _fbClaims = items);
      }, onError: (_) {});
    }
  }

  @override
  void dispose() {
    _fbClaimsSub?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await ApiService.instance.getClaims('recipient');
      if (mounted) {
        setState(() {
          _expressClaims = res.claims;
          _usedToday = res.usedToday;
          _dailyLimit = res.dailyLimit;
        });
      }
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Claim> get _allClaims {
    final map = <String, Claim>{};
    for (final c in _fbClaims) {
      map[c.id] = c;
    }
    for (final c in _expressClaims) {
      map[c.id] = c;
    }
    return map.values.toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  }

  Future<void> _openClaimChat(Claim c) async {
    if (c.conversationId != null && c.conversationId!.isNotEmpty) {
      widget.onNavigate('chat', convId: c.conversationId);
      return;
    }
    if (widget.auth.isFirebaseSession &&
        widget.auth.isFirebaseVerified &&
        widget.auth.user != null) {
      try {
        final convId =
            await MessengerService.instance.openDirectChatForListingOrShop(
          widget.auth.user!,
          donorId: c.donorId,
          donorName: c.donorBusinessName,
          donorArea: c.recipientArea,
          donorVerified: c.donorVerified,
        );
        if (mounted) widget.onNavigate('chat', convId: convId);
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.auth.isLoggedIn) {
      return AuthGateCard(
        title: 'Sign in to view your Claims',
        subtitle:
            'Track food pickup approvals, QR handover codes, and donor messages.',
        onSignIn: widget.onRequestLogin,
      );
    }

    final claims = _allClaims;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: widget.tokens.soft,
                child: Icon(Icons.local_mall_rounded,
                    color: widget.tokens.textOnSurface),
              ),
              title: Text(widget.i18n.t('claims.title'),
                  style: const TextStyle(fontWeight: FontWeight.w800)),
              subtitle: Text(
                  'Daily rescue quota: ${widget.i18n.formatNumber(_usedToday)} / ${widget.i18n.formatNumber(_dailyLimit)} active today'),
            ),
          ),
          const SizedBox(height: 14),
          if (_loading && claims.isEmpty)
            const Center(
                child: Padding(
                    padding: EdgeInsets.all(32),
                    child: CircularProgressIndicator()))
          else if (claims.isEmpty)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    const Text('No food claims yet',
                        style: TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 10),
                    FilledButton(
                      onPressed: () => widget.onNavigate('discover'),
                      child: Text(widget.i18n.t('home.browseFood')),
                    ),
                  ],
                ),
              ),
            )
          else
            ...claims.map((c) => _buildClaimCard(c)),
        ],
      ),
    );
  }

  Widget _buildClaimCard(Claim c) {
    final canOpenChat = (c.conversationId != null &&
            c.conversationId!.isNotEmpty) ||
        (widget.auth.isFirebaseSession && widget.auth.isFirebaseVerified);
    final isReviewed = c.myRating != null || _reviewedIds.contains(c.id);

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                FoodImageView(
                  url: c.listingPhoto,
                  width: 60,
                  height: 60,
                  borderRadius: BorderRadius.circular(10),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(c.listingTitle,
                          style: const TextStyle(
                              fontWeight: FontWeight.w800, fontSize: 15)),
                      Text(
                          '${c.donorBusinessName} · ${c.quantityClaimed} portion(s)'),
                      const SizedBox(height: 4),
                      Chip(
                        label: Text(c.status.name.toUpperCase(),
                            style: const TextStyle(fontSize: 11)),
                        visualDensity: VisualDensity.compact,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (c.status == ClaimStatus.accepted ||
                    c.status == ClaimStatus.requested)
                  FilledButton.icon(
                    onPressed: () => _showQrCodeDialog(c),
                    icon: const Icon(Icons.qr_code_2_rounded, size: 18),
                    label: Text('Code: ${c.pickupCode}'),
                  ),
                if (canOpenChat)
                  OutlinedButton.icon(
                    onPressed: () => _openClaimChat(c),
                    icon: const Icon(Icons.chat_outlined, size: 18),
                    label: Text(widget.i18n.t('claims.openChat')),
                  ),
                if (c.status == ClaimStatus.completed && !isReviewed)
                  OutlinedButton.icon(
                    onPressed: () => _openReviewDialog(c),
                    icon: const Icon(Icons.star_outline_rounded, size: 18),
                    label: Text(widget.i18n.t('claims.rateDonor')),
                  ),
                if (c.status == ClaimStatus.requested ||
                    c.status == ClaimStatus.accepted)
                  TextButton(
                    onPressed: () async {
                      if (c.id.startsWith('fb_') &&
                          widget.auth.isFirebaseSession &&
                          widget.auth.isFirebaseVerified) {
                        await FirestoreService.instance.updateClaimStatus(
                          c.id,
                          'cancelled',
                          claim: c,
                          actor: widget.auth.user,
                        );
                      } else {
                        await ApiService.instance
                            .updateClaimStatus(c.id, 'cancelled');
                      }
                      _load();
                    },
                    child: Text(widget.i18n.t('common.cancel')),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _showQrCodeDialog(Claim c) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Pickup Verification Code'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 210,
              height: 210,
              child: QrImageView(
                data: 'ahar:${c.id}:${c.pickupCode}',
                backgroundColor: Colors.white,
              ),
            ),
            const SizedBox(height: 12),
            SelectableText(
              c.pickupCode,
              style: const TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w900,
                letterSpacing: 4,
              ),
            ),
            const SizedBox(height: 6),
            Text(c.donorAddress, textAlign: TextAlign.center),
          ],
        ),
        actions: [
          FilledButton(
              onPressed: () => Navigator.pop(ctx), child: const Text('Done')),
        ],
      ),
    );
  }

  void _openReviewDialog(Claim c) {
    int rating = 5;
    bool hygieneOk = true;
    final commentCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDlg) => AlertDialog(
          title: Text('Rate ${c.donorBusinessName}'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  5,
                  (i) => IconButton(
                    onPressed: () => setDlg(() => rating = i + 1),
                    icon: Icon(
                      i < rating ? Icons.star_rounded : Icons.star_border,
                      color: Colors.amber,
                    ),
                  ),
                ),
              ),
              CheckboxListTile(
                value: hygieneOk,
                onChanged: (v) => setDlg(() => hygieneOk = v ?? true),
                title: const Text('Packaging & food hygiene looked fresh'),
              ),
              TextField(
                controller: commentCtrl,
                decoration:
                    const InputDecoration(labelText: 'Feedback (optional)'),
              ),
            ],
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Cancel')),
            FilledButton(
              onPressed: () async {
                if (c.id.startsWith('fb_') &&
                    widget.auth.isFirebaseSession &&
                    widget.auth.isFirebaseVerified &&
                    widget.auth.user != null) {
                  await FirestoreService.instance.submitReview(
                    user: widget.auth.user!,
                    claim: c,
                    rating: rating,
                    hygieneOk: hygieneOk,
                    comment: commentCtrl.text.trim(),
                  );
                  if (mounted) setState(() => _reviewedIds.add(c.id));
                } else {
                  await ApiService.instance.submitClaimReview(
                    c.id,
                    rating: rating,
                    hygieneOk: hygieneOk,
                    comment: commentCtrl.text.trim(),
                  );
                }
                if (ctx.mounted) Navigator.pop(ctx);
                _load();
              },
              child: const Text('Submit Review'),
            ),
          ],
        ),
      ),
    );
  }
}
