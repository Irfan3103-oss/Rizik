import 'package:flutter/material.dart';
import '../i18n/i18n_provider.dart';
import '../models/models.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../theme/palettes.dart';
import '../widgets/common_widgets.dart';

class WeddingPickupScreen extends StatefulWidget {
  final AuthProvider auth;
  final I18nProvider i18n;
  final PaletteTokens tokens;
  final void Function(String tab, {String? convId}) onNavigate;
  final VoidCallback onRequestLogin;

  const WeddingPickupScreen({
    super.key,
    required this.auth,
    required this.i18n,
    required this.tokens,
    required this.onNavigate,
    required this.onRequestLogin,
  });

  @override
  State<WeddingPickupScreen> createState() => _WeddingPickupScreenState();
}

class _WeddingPickupScreenState extends State<WeddingPickupScreen> {
  List<WeddingPickupRequest> _pickups = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final list = await ApiService.instance.getWeddingPickups();
      if (mounted) setState(() => _pickups = list);
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Wedding & Event Leftover Pickup',
                    style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Rescue surplus food from weddings, walima, corporate buffets, and community banquets across Dhaka.',
                    style: TextStyle(color: widget.tokens.textSecondary),
                  ),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: () {
                      if (!widget.auth.isLoggedIn) {
                        widget.onRequestLogin();
                        return;
                      }
                      _openSubmitForm();
                    },
                    icon: const Icon(Icons.local_shipping_rounded),
                    label: const Text('Request Bulk Event Pickup'),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          const Text('Live Pickup Queue',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          if (_loading && _pickups.isEmpty)
            const Center(child: CircularProgressIndicator())
          else
            ..._pickups.map((p) => Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                '${p.venueName} (${p.eventType})',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800, fontSize: 16),
                              ),
                            ),
                            if (p.isUrgent)
                              Chip(
                                label: const Text('URGENT'),
                                backgroundColor: Colors.red.shade50,
                                visualDensity: VisualDensity.compact,
                              ),
                          ],
                        ),
                        Text(p.address),
                        const SizedBox(height: 4),
                        Text(
                          '~${p.approxServings} servings · Ready ${p.readyTime} · Status: ${p.status.name}',
                          style: TextStyle(
                              fontWeight: FontWeight.w600,
                              color: widget.tokens.textOnSurface),
                        ),
                        const SizedBox(height: 10),
                        if (widget.auth.isLoggedIn)
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              if (p.status == WeddingPickupStatus.submitted)
                                FilledButton(
                                  onPressed: () async {
                                    await ApiService.instance
                                        .updateWeddingPickupStatus(p.id,
                                            status: WeddingPickupStatus
                                                .volunteerAssigned);
                                    _load();
                                  },
                                  child: const Text('Volunteer to Collect'),
                                ),
                              if (p.status ==
                                  WeddingPickupStatus.volunteerAssigned)
                                FilledButton(
                                  onPressed: () async {
                                    await ApiService.instance
                                        .updateWeddingPickupStatus(p.id,
                                            status: WeddingPickupStatus.onTheWay);
                                    _load();
                                  },
                                  child: const Text('Mark On The Way'),
                                ),
                              if (p.status == WeddingPickupStatus.onTheWay)
                                FilledButton(
                                  onPressed: () async {
                                    await ApiService.instance
                                        .updateWeddingPickupStatus(p.id,
                                            status: WeddingPickupStatus.collected);
                                    _load();
                                  },
                                  child: const Text('Mark Collected'),
                                ),
                              if (p.status == WeddingPickupStatus.collected)
                                FilledButton(
                                  onPressed: () async {
                                    await ApiService.instance
                                        .updateWeddingPickupStatus(p.id,
                                            status: WeddingPickupStatus.delivered,
                                            deliveredMeals: p.approxServings);
                                    _load();
                                  },
                                  child: const Text('Confirm Delivered'),
                                ),
                              if (p.ngoClaimerId == null)
                                OutlinedButton(
                                  onPressed: () async {
                                    await ApiService.instance.claimWeddingNgo(
                                        p.id,
                                        ngoName: widget.auth.user?.organizationName);
                                    _load();
                                  },
                                  child: const Text('Claim for Shelter/NGO'),
                                ),
                              OutlinedButton.icon(
                                onPressed: () async {
                                  final convId = await ApiService.instance
                                      .openWeddingChat(p.id);
                                  widget.onNavigate('chat', convId: convId);
                                },
                                icon: const Icon(Icons.chat_outlined, size: 17),
                                label: const Text('Open Chat'),
                              ),
                            ],
                          ),
                      ],
                    ),
                  ),
                )),
        ],
      ),
    );
  }

  void _openSubmitForm() {
    final venueCtrl = TextEditingController();
    final addrCtrl = TextEditingController();
    final contactCtrl =
        TextEditingController(text: widget.auth.user?.name ?? '');
    final phoneCtrl =
        TextEditingController(text: widget.auth.user?.phone ?? '');
    final servingsCtrl = TextEditingController(text: '120');
    bool checkUntouched = true;
    bool checkCovered = true;
    bool checkFresh = true;
    bool isUrgent = false;
    double lat = 23.775;
    double lng = 90.405;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDlg) => AlertDialog(
          title: const Text('Submit Wedding / Buffet Pickup'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                    controller: venueCtrl,
                    decoration: const InputDecoration(labelText: 'Venue Name')),
                const SizedBox(height: 8),
                TextField(
                    controller: addrCtrl,
                    decoration: const InputDecoration(labelText: 'Street Address')),
                const SizedBox(height: 8),
                TextField(
                    controller: contactCtrl,
                    decoration:
                        const InputDecoration(labelText: 'Contact Person')),
                const SizedBox(height: 8),
                TextField(
                    controller: phoneCtrl,
                    decoration: const InputDecoration(labelText: 'Phone')),
                const SizedBox(height: 8),
                TextField(
                    controller: servingsCtrl,
                    keyboardType: TextInputType.number,
                    decoration:
                        const InputDecoration(labelText: 'Approx Servings')),
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
                    value: checkUntouched,
                    onChanged: (v) => setDlg(() => checkUntouched = v ?? true),
                    title: const Text('Food untouched from buffet trays')),
                CheckboxListTile(
                    value: checkCovered,
                    onChanged: (v) => setDlg(() => checkCovered = v ?? true),
                    title: const Text('Covered & stored hygienically')),
                CheckboxListTile(
                    value: checkFresh,
                    onChanged: (v) => setDlg(() => checkFresh = v ?? true),
                    title: const Text('Freshly cooked within last 3 hours')),
                SwitchListTile(
                    value: isUrgent,
                    onChanged: (v) => setDlg(() => isUrgent = v),
                    title: const Text('Urgent Pickup Needed')),
              ],
            ),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Cancel')),
            FilledButton(
              onPressed: () async {
                await ApiService.instance.createWeddingPickup({
                  'eventType': 'Wedding / Walima',
                  'venueName': venueCtrl.text.trim(),
                  'address': addrCtrl.text.trim(),
                  'lat': lat,
                  'lng': lng,
                  'contactPerson': contactCtrl.text.trim(),
                  'phone': phoneCtrl.text.trim(),
                  'eventDate': DateTime.now().toIso8601String().substring(0, 10),
                  'readyTime': '10:30 PM',
                  'approxServings': int.tryParse(servingsCtrl.text.trim()) ?? 100,
                  'foodTypes': ['Kacchi Biryani', 'Chicken Roast', 'Borhani'],
                  'isHalal': true,
                  'isVeg': false,
                  'storageMethod': 'Covered stainless chafing dishes',
                  'isUrgent': isUrgent,
                  'checklistUntouched': checkUntouched,
                  'checklistCovered': checkCovered,
                  'checklistFresh': checkFresh,
                });
                if (ctx.mounted) Navigator.pop(ctx);
                _load();
              },
              child: const Text('Submit Request'),
            ),
          ],
        ),
      ),
    );
  }
}
