import 'dart:async';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../i18n/i18n_provider.dart';
import '../models/models.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../services/firestore_service.dart';
import '../theme/palettes.dart';
import '../widgets/common_widgets.dart';

class DonorDashboardScreen extends StatefulWidget {
  final AuthProvider auth;
  final I18nProvider i18n;
  final PaletteTokens tokens;
  final VoidCallback onRequestLogin;

  const DonorDashboardScreen({
    super.key,
    required this.auth,
    required this.i18n,
    required this.tokens,
    required this.onRequestLogin,
  });

  @override
  State<DonorDashboardScreen> createState() => _DonorDashboardScreenState();
}

class _DonorDashboardScreenState extends State<DonorDashboardScreen> {
  List<Listing> _expressListings = [];
  List<Listing> _fbListings = [];
  List<Claim> _expressIncomingClaims = [];
  List<Claim> _fbIncomingClaims = [];
  StreamSubscription? _listingsSub;
  StreamSubscription? _claimsSub;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    if (widget.auth.isLoggedIn) {
      _load();
      _listingsSub = FirestoreService.instance
          .watchMyDonorListings(widget.auth.user!.id)
          .listen((items) {
        if (mounted) setState(() => _fbListings = items);
      }, onError: (_) {});
      _claimsSub = FirestoreService.instance
          .watchMyClaims(widget.auth.user!.id, asDonor: true)
          .listen((items) {
        if (mounted) setState(() => _fbIncomingClaims = items);
      }, onError: (_) {});
    }
  }

  @override
  void dispose() {
    _listingsSub?.cancel();
    _claimsSub?.cancel();
    super.dispose();
  }

  List<Listing> get _allListings {
    final map = <String, Listing>{};
    for (final l in _fbListings) {
      map[l.id] = l;
    }
    for (final l in _expressListings) {
      map[l.id] = l;
    }
    return map.values.toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  }

  List<Claim> get _allIncomingClaims {
    final map = <String, Claim>{};
    for (final c in _fbIncomingClaims) {
      map[c.id] = c;
    }
    for (final c in _expressIncomingClaims) {
      map[c.id] = c;
    }
    return map.values.toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final listings = await ApiService.instance.getListings(
        donorId: widget.auth.user!.id,
        includeAll: true,
      );
      final claimsRes = await ApiService.instance.getClaims('donor');
      if (mounted) {
        setState(() {
          _expressListings = listings;
          _expressIncomingClaims = claimsRes.claims;
        });
      }
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.auth.isLoggedIn) {
      return AuthGateCard(
        title: 'Sign in to access Donor Hub',
        subtitle:
            'Post surplus food batches, approve pickup requests, and verify QR handover codes.',
        onSignIn: widget.onRequestLogin,
      );
    }

    final incomingClaims = _allIncomingClaims;
    final myListings = _allListings;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: _openCreateListingDialog,
                  icon: const Icon(Icons.add_circle_outline_rounded),
                  label: Text(widget.i18n.t('donor.postFood')),
                ),
              ),
              const SizedBox(width: 10),
              OutlinedButton.icon(
                onPressed: _openQrScannerDialog,
                icon: const Icon(Icons.qr_code_scanner_rounded),
                label: const Text('Scan QR'),
              ),
            ],
          ),
          const SizedBox(height: 18),
          Text(widget.i18n.t('donor.incomingClaims'),
              style:
                  const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          if (_loading && incomingClaims.isEmpty)
            const Center(child: CircularProgressIndicator())
          else if (incomingClaims.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Text('No pickup requests yet.'),
              ),
            )
          else
            ...incomingClaims.map((c) => Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                            '${c.recipientName} · ${c.quantityClaimed}x ${c.listingTitle}',
                            style:
                                const TextStyle(fontWeight: FontWeight.w700)),
                        Text('Status: ${c.status.name} · Area: ${c.recipientArea}'),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 8,
                          children: [
                            if (c.status == ClaimStatus.requested) ...[
                              FilledButton(
                                onPressed: () async {
                                  if (c.id.startsWith('fb_') &&
                                      widget.auth.isFirebaseSession &&
                                      widget.auth.isFirebaseVerified) {
                                    await FirestoreService.instance
                                        .updateClaimStatus(
                                      c.id,
                                      'accepted',
                                      claim: c,
                                      actor: widget.auth.user,
                                    );
                                  } else {
                                    await ApiService.instance
                                        .updateClaimStatus(c.id, 'accepted');
                                  }
                                  _load();
                                },
                                child: const Text('Accept'),
                              ),
                              OutlinedButton(
                                onPressed: () async {
                                  if (c.id.startsWith('fb_') &&
                                      widget.auth.isFirebaseSession &&
                                      widget.auth.isFirebaseVerified) {
                                    await FirestoreService.instance
                                        .updateClaimStatus(
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
                                child: const Text('Decline'),
                              ),
                            ],
                            if (c.status == ClaimStatus.accepted)
                              FilledButton.icon(
                                onPressed: () => _verifyCodeManually(c),
                                icon: const Icon(Icons.verified_outlined),
                                label: const Text('Enter 6-Digit Code'),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                )),
          const SizedBox(height: 18),
          Text(widget.i18n.t('donor.myListings'),
              style:
                  const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          ...myListings.map((l) => Card(
                margin: const EdgeInsets.only(bottom: 10),
                child: ListTile(
                  leading: FoodImageView(
                    url: l.photoUrls.isNotEmpty ? l.photoUrls.first : null,
                    width: 54,
                    height: 54,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  title: Text(l.title,
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text(
                      '${l.remainingQuantity}/${l.quantity} ${l.unit} · ${l.status.name}'),
                  trailing: PopupMenuButton<String>(
                    onSelected: (action) async {
                      final isFb = l.id.startsWith('fb_') &&
                          widget.auth.isFirebaseSession &&
                          widget.auth.isFirebaseVerified;
                      if (action == 'pause') {
                        final nextStatus = l.status == ListingStatus.paused
                            ? 'active'
                            : 'paused';
                        if (isFb) {
                          await FirestoreService.instance.updateListing(l.id, {
                            'status': nextStatus,
                          });
                        } else {
                          await ApiService.instance.updateListing(l.id, {
                            'status': nextStatus,
                          });
                        }
                      } else if (action == 'delete') {
                        if (isFb) {
                          await FirestoreService.instance.deleteListing(l.id);
                        } else {
                          await ApiService.instance.deleteListing(l.id);
                        }
                      }
                      _load();
                    },
                    itemBuilder: (_) => [
                      PopupMenuItem(
                        value: 'pause',
                        child: Text(l.status == ListingStatus.paused
                            ? 'Resume'
                            : 'Pause'),
                      ),
                      const PopupMenuItem(value: 'delete', child: Text('Delete')),
                    ],
                  ),
                ),
              )),
        ],
      ),
    );
  }

  void _verifyCodeManually(Claim c) {
    final codeCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirm Pickup Code'),
        content: TextField(
          controller: codeCtrl,
          decoration: const InputDecoration(labelText: '6-character pickup code'),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
            onPressed: () async {
              final entered = codeCtrl.text.trim().toUpperCase();
              if (c.id.startsWith('fb_') &&
                  widget.auth.isFirebaseSession &&
                  widget.auth.isFirebaseVerified) {
                if (entered != c.pickupCode.trim().toUpperCase()) {
                  if (ctx.mounted) {
                    ScaffoldMessenger.of(ctx).showSnackBar(
                      const SnackBar(
                          content: Text('Pickup code does not match.')),
                    );
                  }
                  return;
                }
                await FirestoreService.instance.updateClaimStatus(
                  c.id,
                  'completed',
                  handoverMethod: 'manual',
                  claim: c,
                  actor: widget.auth.user,
                );
              } else {
                await ApiService.instance.updateClaimStatus(
                  c.id,
                  'completed',
                  pickupCode: entered,
                  handoverMethod: 'manual',
                );
              }
              if (ctx.mounted) Navigator.pop(ctx);
              _load();
            },
            child: const Text('Verify & Complete'),
          ),
        ],
      ),
    );
  }

  void _openQrScannerDialog() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Scan Recipient QR Code'),
        content: SizedBox(
          width: 300,
          height: 300,
          child: MobileScanner(
            onDetect: (capture) async {
              final raw = capture.barcodes.firstOrNull?.rawValue;
              if (raw == null || !raw.startsWith('ahar:')) return;
              final parts = raw.split(':');
              if (parts.length < 3) return;
              final claimId = parts[1];
              final code = parts[2].trim().toUpperCase();
              Navigator.pop(ctx);
              if (claimId.startsWith('fb_') &&
                  widget.auth.isFirebaseSession &&
                  widget.auth.isFirebaseVerified) {
                final match = _allIncomingClaims
                    .cast<Claim?>()
                    .firstWhere((c) => c?.id == claimId, orElse: () => null);
                if (match != null &&
                    match.pickupCode.trim().toUpperCase() != code) {
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('QR pickup code mismatch.')),
                    );
                  }
                  return;
                }
                await FirestoreService.instance.updateClaimStatus(
                  claimId,
                  'completed',
                  handoverMethod: 'qr',
                  claim: match,
                  actor: widget.auth.user,
                );
              } else {
                await ApiService.instance.updateClaimStatus(
                  claimId,
                  'completed',
                  pickupCode: code,
                  handoverMethod: 'qr',
                );
              }
              _load();
            },
          ),
        ),
      ),
    );
  }

  void _openCreateListingDialog() {
    final titleCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    final qtyCtrl = TextEditingController(text: '10');
    final addrCtrl = TextEditingController(
      text: widget.auth.user?.donorProfile?.address ?? 'Dhanmondi, Dhaka',
    );
    String category = 'cooked';
    bool isFlash = false;
    bool isRamadan = false;
    double lat = 23.7511;
    double lng = 90.3765;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDlg) => AlertDialog(
          title: Text(widget.i18n.t('donor.postFood')),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: titleCtrl,
                  decoration: const InputDecoration(labelText: 'Food title'),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: descCtrl,
                  decoration: const InputDecoration(labelText: 'Description'),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: qtyCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Quantity (portions)'),
                ),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  value: category,
                  items: const [
                    DropdownMenuItem(value: 'cooked', child: Text('Cooked Meal')),
                    DropdownMenuItem(value: 'bakery', child: Text('Bakery')),
                    DropdownMenuItem(value: 'produce', child: Text('Produce')),
                    DropdownMenuItem(value: 'packaged', child: Text('Packaged')),
                  ],
                  onChanged: (v) => setDlg(() => category = v ?? 'cooked'),
                  decoration: const InputDecoration(labelText: 'Category'),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: addrCtrl,
                  decoration: const InputDecoration(labelText: 'Pickup address'),
                ),
                const SizedBox(height: 8),
                TextButton.icon(
                  onPressed: () async {
                    final picked = await showMapPinPickerDialog(ctx);
                    if (picked != null) {
                      setDlg(() {
                        lat = picked.latitude;
                        lng = picked.longitude;
                      });
                    }
                  },
                  icon: const Icon(Icons.pin_drop_rounded),
                  label: Text('Pin: ${lat.toStringAsFixed(4)}, ${lng.toStringAsFixed(4)}'),
                ),
                CheckboxListTile(
                  value: isFlash,
                  onChanged: (v) => setDlg(() => isFlash = v ?? false),
                  title: const Text('Flash Rescue (urgent closing pickup)'),
                ),
                CheckboxListTile(
                  value: isRamadan,
                  onChanged: (v) => setDlg(() => isRamadan = v ?? false),
                  title: const Text('Ramadan / Iftar Special'),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Cancel')),
            FilledButton(
              onPressed: () async {
                final now = DateTime.now();
                final payload = {
                  'title': titleCtrl.text.trim(),
                  'description': descCtrl.text.trim(),
                  'category': category,
                  'quantity': int.tryParse(qtyCtrl.text.trim()) ?? 10,
                  'unit': 'boxes',
                  'dietaryTags': ['Halal'],
                  'pickupStart': now.toIso8601String(),
                  'pickupEnd': now.add(const Duration(hours: 3)).toIso8601String(),
                  'pickupAddress': addrCtrl.text.trim(),
                  'consumeWithinHours': 4,
                  'isFlashRescue': isFlash,
                  'isRamadanSpecial': isRamadan,
                  'lat': lat,
                  'lng': lng,
                };
                if (widget.auth.isFirebaseSession &&
                    widget.auth.isFirebaseVerified) {
                  await FirestoreService.instance
                      .createListing(widget.auth.user!, payload);
                } else {
                  await ApiService.instance.createListing(payload);
                }
                if (ctx.mounted) Navigator.pop(ctx);
                _load();
              },
              child: const Text('Publish Batch'),
            ),
          ],
        ),
      ),
    );
  }
}
