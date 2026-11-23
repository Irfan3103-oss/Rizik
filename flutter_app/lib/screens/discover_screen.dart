import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../i18n/i18n_provider.dart';
import '../models/models.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../services/firestore_service.dart';
import '../services/messenger_service.dart';
import '../theme/palettes.dart';
import '../widgets/common_widgets.dart';

class DiscoverScreen extends StatefulWidget {
  final AuthProvider auth;
  final I18nProvider i18n;
  final PaletteTokens tokens;
  final void Function(String tab, {String? convId}) onNavigate;
  final VoidCallback onRequestLogin;

  const DiscoverScreen({
    super.key,
    required this.auth,
    required this.i18n,
    required this.tokens,
    required this.onNavigate,
    required this.onRequestLogin,
  });

  @override
  State<DiscoverScreen> createState() => _DiscoverScreenState();
}

class _DiscoverScreenState extends State<DiscoverScreen> {
  final TextEditingController _searchCtrl = TextEditingController();
  List<Listing> _expressListings = [];
  List<Listing> _firestoreListings = [];
  bool _loading = true;
  bool _mapMode = false;

  double _radiusKm = 15;
  String _category = 'all';
  List<String> _dietary = [];
  int? _pickupWithinMin;
  bool _flashOnly = false;
  bool _ramadanOnly = false;

  @override
  void initState() {
    super.initState();
    _loadListings();
    FirestoreService.instance.watchActiveListings().listen((items) {
      if (mounted) setState(() => _firestoreListings = items);
    }, onError: (_) {});
  }

  Future<void> _loadListings() async {
    setState(() => _loading = true);
    try {
      final items = await ApiService.instance.getListings(
        radiusKm: _radiusKm,
        category: _category,
        dietary: _dietary,
        pickupWithinMin: _pickupWithinMin,
        search: _searchCtrl.text.trim(),
        flashOnly: _flashOnly,
        ramadanOnly: _ramadanOnly,
      );
      if (mounted) setState(() => _expressListings = items);
    } catch (_) {
      final cached = await ApiService.instance.getCachedListings();
      if (mounted) setState(() => _expressListings = cached);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Listing> get _mergedListings {
    final map = <String, Listing>{};
    for (final l in _firestoreListings) {
      map[l.id] = l;
    }
    for (final l in _expressListings) {
      map[l.id] = l;
    }
    final q = _searchCtrl.text.trim().toLowerCase();
    return map.values.where((l) {
      if (_category != 'all' && l.category.name != _category) return false;
      if (_flashOnly && !l.isFlashRescue) return false;
      if (_ramadanOnly && !l.isRamadanSpecial) return false;
      if (_dietary.isNotEmpty &&
          !_dietary.every((tag) => l.dietaryTags.contains(tag))) {
        return false;
      }
      if (q.isNotEmpty &&
          !l.title.toLowerCase().contains(q) &&
          !l.donorName.toLowerCase().contains(q) &&
          !l.donorArea.toLowerCase().contains(q)) {
        return false;
      }
      return true;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.i18n.t;
    final tokens = widget.tokens;
    final items = _mergedListings;

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _searchCtrl,
                  onChanged: (_) => setState(() {}),
                  onSubmitted: (_) => _loadListings(),
                  decoration: InputDecoration(
                    hintText: t('feed.searchHint'),
                    prefixIcon: const Icon(Icons.search_rounded),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filledTonal(
                onPressed: _openFilterSheet,
                icon: const Icon(Icons.tune_rounded),
                tooltip: t('feed.filters'),
              ),
              const SizedBox(width: 6),
              SegmentedButton<bool>(
                segments: [
                  ButtonSegment(
                      value: false,
                      icon: const Icon(Icons.view_agenda_outlined, size: 18),
                      label: Text(t('feed.feedView'))),
                  ButtonSegment(
                      value: true,
                      icon: const Icon(Icons.map_outlined, size: 18),
                      label: Text(t('feed.mapView'))),
                ],
                selected: {_mapMode},
                onSelectionChanged: (s) => setState(() => _mapMode = s.first),
              ),
            ],
          ),
        ),
        SizedBox(
          height: 44,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            children: [
              for (final cat in ['all', 'cooked', 'bakery', 'produce', 'packaged'])
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(t('cat.$cat')),
                    selected: _category == cat,
                    onSelected: (_) {
                      setState(() => _category = cat);
                      _loadListings();
                    },
                  ),
                ),
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: FilterChip(
                  avatar: const Icon(Icons.bolt_rounded, size: 16),
                  label: Text(t('feed.flashOnly')),
                  selected: _flashOnly,
                  onSelected: (v) {
                    setState(() => _flashOnly = v);
                    _loadListings();
                  },
                ),
              ),
              FilterChip(
                avatar: const Icon(Icons.nights_stay_rounded, size: 16),
                label: Text(t('feed.ramadanOnly')),
                selected: _ramadanOnly,
                onSelected: (v) {
                  setState(() => _ramadanOnly = v);
                  _loadListings();
                },
              ),
            ],
          ),
        ),
        const SizedBox(height: 6),
        Expanded(
          child: _loading && items.isEmpty
              ? const Center(child: CircularProgressIndicator())
              : items.isEmpty
                  ? Center(child: Text(t('feed.noListings')))
                  : _mapMode
                      ? _buildMapView(items, tokens)
                      : RefreshIndicator(
                          onRefresh: _loadListings,
                          child: ListView.builder(
                            padding: const EdgeInsets.all(16),
                            itemCount: items.length,
                            itemBuilder: (_, idx) =>
                                _buildListingCard(items[idx], tokens),
                          ),
                        ),
        ),
      ],
    );
  }

  Widget _buildMapView(List<Listing> items, PaletteTokens tokens) {
    return FlutterMap(
      options: const MapOptions(
        initialCenter: LatLng(23.765, 90.391),
        initialZoom: 12.5,
      ),
      children: [
        TileLayer(
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          userAgentPackageName: 'org.aharforall.app',
        ),
        MarkerLayer(
          markers: items
              .map(
                (l) => Marker(
                  point: LatLng(l.lat, l.lng),
                  width: 44,
                  height: 44,
                  child: GestureDetector(
                    onTap: () => _openListingDetail(l),
                    child: Container(
                      decoration: BoxDecoration(
                        color: l.isFlashRescue ? tokens.accent : tokens.primary,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 2.5),
                      ),
                      child: const Icon(Icons.restaurant_rounded,
                          color: Colors.white, size: 20),
                    ),
                  ),
                ),
              )
              .toList(),
        ),
      ],
    );
  }

  Widget _buildListingCard(Listing l, PaletteTokens tokens) {
    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => _openListingDetail(l),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Stack(
              children: [
                FoodImageView(
                  url: l.photoUrls.isNotEmpty ? l.photoUrls.first : null,
                  height: 170,
                  width: double.infinity,
                ),
                Positioned(
                  top: 10,
                  left: 10,
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.72),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      widget.i18n.formatCategory(l.category),
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
                if (l.isFlashRescue)
                  Positioned(
                    top: 10,
                    right: 10,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: tokens.accent,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Text(
                        'FLASH',
                        style: TextStyle(
                            color: Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.w800),
                      ),
                    ),
                  ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          l.title,
                          style: const TextStyle(
                              fontSize: 16, fontWeight: FontWeight.w800),
                        ),
                      ),
                      CountdownBadge(isoEnd: l.pickupEnd, i18n: widget.i18n),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Text(
                        l.donorName,
                        style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: tokens.textSecondary),
                      ),
                      if (l.donorVerified) ...[
                        const SizedBox(width: 4),
                        Icon(Icons.verified_rounded,
                            size: 16, color: tokens.primary),
                      ],
                      const Spacer(),
                      Text(
                        '${widget.i18n.formatNumber(l.remainingQuantity)} ${l.unit} ${widget.i18n.t('feed.left')}',
                        style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: tokens.textOnSurface),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${l.donorArea}${l.distanceKm != null ? ' · ${l.distanceKm!.toStringAsFixed(1)} ${widget.i18n.t('feed.km')}' : ''}',
                    style: TextStyle(fontSize: 12, color: tokens.textMuted),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _openFilterSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        double tempRadius = _radiusKm;
        List<String> tempDietary = List.from(_dietary);
        int? tempWindow = _pickupWithinMin;
        return StatefulBuilder(
          builder: (ctx, setSheetState) => Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(widget.i18n.t('filters.title'),
                    style: const TextStyle(
                        fontSize: 18, fontWeight: FontWeight.w800)),
                const SizedBox(height: 12),
                Text('Max Distance: ${tempRadius.round()} km'),
                Slider(
                  value: tempRadius,
                  min: 1,
                  max: 25,
                  divisions: 24,
                  onChanged: (v) => setSheetState(() => tempRadius = v),
                ),
                const SizedBox(height: 8),
                const Text('Dietary Preferences',
                    style: TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: [
                    for (final tag in [
                      'Halal',
                      'Veg',
                      'Vegan',
                      'Gluten-Free',
                      'Nut-Free'
                    ])
                      FilterChip(
                        label: Text(tag),
                        selected: tempDietary.contains(tag),
                        onSelected: (sel) => setSheetState(() {
                          sel ? tempDietary.add(tag) : tempDietary.remove(tag);
                        }),
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                const Text('Pickup Ends Within',
                    style: TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: [
                    for (final entry in <int?, String>{
                      null: 'Anytime',
                      60: '1h',
                      120: '2h',
                      240: '4h',
                    }.entries)
                      ChoiceChip(
                        label: Text(entry.value),
                        selected: tempWindow == entry.key,
                        onSelected: (_) =>
                            setSheetState(() => tempWindow = entry.key),
                      ),
                  ],
                ),
                const SizedBox(height: 18),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: () {
                      Navigator.pop(ctx);
                      setState(() {
                        _radiusKm = tempRadius;
                        _dietary = tempDietary;
                        _pickupWithinMin = tempWindow;
                      });
                      _loadListings();
                    },
                    child: const Text('Apply Filters'),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _openListingDetail(Listing l) {
    final notesCtrl = TextEditingController();
    int qty = 1;
    bool submitting = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.85,
          maxChildSize: 0.95,
          builder: (_, scrollCtrl) => ListView(
            controller: scrollCtrl,
            padding: const EdgeInsets.all(20),
            children: [
              FoodImageView(
                url: l.photoUrls.isNotEmpty ? l.photoUrls.first : null,
                height: 210,
                width: double.infinity,
                borderRadius: BorderRadius.circular(16),
              ),
              const SizedBox(height: 14),
              Text(l.title,
                  style: const TextStyle(
                      fontSize: 20, fontWeight: FontWeight.w800)),
              const SizedBox(height: 6),
              Text('${l.donorName} · ${l.donorArea}',
                  style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: widget.tokens.textOnSurface)),
              const SizedBox(height: 8),
              Text(l.description),
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: widget.tokens.soft,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(widget.i18n.t('detail.safetyNote'),
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 4),
                    Text(l.safetyNote.isEmpty
                        ? 'Inspect packaging and consume within ${l.consumeWithinHours} hours.'
                        : l.safetyNote),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              Text(
                widget.auth.isLoggedIn
                    ? 'Pickup Address: ${l.pickupAddress}'
                    : 'Sign in to view exact street address & contact phone.',
                style: TextStyle(color: widget.tokens.textSecondary),
              ),
              const SizedBox(height: 16),
              if (widget.auth.isLoggedIn) ...[
                Row(
                  children: [
                    const Text('Portions:',
                        style: TextStyle(fontWeight: FontWeight.w700)),
                    const Spacer(),
                    IconButton(
                      onPressed: qty > 1 ? () => setSheet(() => qty--) : null,
                      icon: const Icon(Icons.remove_circle_outline),
                    ),
                    Text('$qty',
                        style: const TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w800)),
                    IconButton(
                      onPressed: qty < l.remainingQuantity
                          ? () => setSheet(() => qty++)
                          : null,
                      icon: const Icon(Icons.add_circle_outline),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: notesCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Arrival note for donor (optional)',
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    OutlinedButton.icon(
                      onPressed: () async {
                        try {
                          String? convId;
                          if (widget.auth.isFirebaseSession &&
                              widget.auth.isFirebaseVerified &&
                              widget.auth.user != null) {
                            convId = await MessengerService.instance
                                .openDirectChatForListingOrShop(
                              widget.auth.user!,
                              donorId: l.donorId,
                              donorName: l.donorName,
                              donorArea: l.donorArea,
                              donorVerified: l.donorVerified,
                              listing: l,
                            );
                          } else {
                            convId = await ApiService.instance
                                .openShopConversation(l.donorId, listingId: l.id);
                          }
                          if (ctx.mounted) Navigator.pop(ctx);
                          widget.onNavigate('chat', convId: convId);
                        } catch (e) {
                          if (ctx.mounted) {
                            ScaffoldMessenger.of(ctx).showSnackBar(
                              SnackBar(
                                  content: Text(e
                                      .toString()
                                      .replaceFirst('Exception: ', ''))),
                            );
                          }
                        }
                      },
                      icon: const Icon(Icons.chat_bubble_outline_rounded),
                      label: Text(widget.i18n.t('detail.messageShop')),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: FilledButton(
                        onPressed: submitting
                            ? null
                            : () async {
                                setSheet(() => submitting = true);
                                try {
                                  String pickupCode;
                                  if (widget.auth.isFirebaseSession &&
                                      widget.auth.isFirebaseVerified &&
                                      widget.auth.user != null) {
                                    final fbClaim = await FirestoreService
                                        .instance
                                        .createClaimIfSupported(
                                      widget.auth.user!,
                                      l,
                                      qty,
                                      notes: notesCtrl.text.trim(),
                                    );
                                    if (fbClaim != null) {
                                      pickupCode = fbClaim.pickupCode;
                                    } else {
                                      final res = await ApiService.instance
                                          .createClaim(
                                        l.id,
                                        qty,
                                        notes: notesCtrl.text.trim(),
                                      );
                                      pickupCode = res.pickupCode;
                                    }
                                  } else {
                                    final res = await ApiService.instance
                                        .createClaim(
                                      l.id,
                                      qty,
                                      notes: notesCtrl.text.trim(),
                                    );
                                    pickupCode = res.pickupCode;
                                  }
                                  if (ctx.mounted) Navigator.pop(ctx);
                                  if (mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(
                                          content: Text(
                                              'Pickup requested! Code: $pickupCode')),
                                    );
                                    _loadListings();
                                  }
                                } catch (e) {
                                  setSheet(() => submitting = false);
                                  if (ctx.mounted) {
                                    ScaffoldMessenger.of(ctx).showSnackBar(
                                      SnackBar(content: Text(e.toString())),
                                    );
                                  }
                                }
                              },
                        child: Text(submitting
                            ? 'Requesting...'
                            : '${widget.i18n.t('detail.requestPickup')} ($qty)'),
                      ),
                    ),
                  ],
                ),
              ] else
                FilledButton.icon(
                  onPressed: () {
                    Navigator.pop(ctx);
                    widget.onRequestLogin();
                  },
                  icon: const Icon(Icons.login_rounded),
                  label: Text(widget.i18n.t('detail.signInToClaim')),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
