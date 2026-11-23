import 'package:flutter/material.dart';
import '../i18n/i18n_provider.dart';
import '../models/models.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../theme/palettes.dart';
import '../widgets/common_widgets.dart';

class ClientsScreen extends StatefulWidget {
  final AuthProvider auth;
  final I18nProvider i18n;
  final PaletteTokens tokens;
  final VoidCallback onRequestLogin;

  const ClientsScreen({
    super.key,
    required this.auth,
    required this.i18n,
    required this.tokens,
    required this.onRequestLogin,
  });

  @override
  State<ClientsScreen> createState() => _ClientsScreenState();
}

class _ClientsScreenState extends State<ClientsScreen> {
  List<Partner> _partners = [];
  List<Testimonial> _testimonials = [];
  Map<String, dynamic> _stats = {};
  String _category = 'all';
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await ApiService.instance.getPartners();
      if (mounted) {
        setState(() {
          _partners = res.partners;
          _testimonials = res.testimonials;
          _stats = res.stats;
        });
      }
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Partner> get _filtered {
    if (_category == 'all') return _partners;
    return _partners.where((p) => p.category == _category).toList();
  }

  String _categoryLabel(String cat) {
    switch (cat) {
      case 'restaurants_cafes':
        return 'Restaurants & Cafés';
      case 'ngos_shelters':
        return 'NGOs & Shelters';
      case 'corporate_sponsors':
        return 'Corporate Sponsors';
      case 'event_partners':
        return 'Event Partners';
      default:
        return 'All Partners';
    }
  }

  @override
  Widget build(BuildContext context) {
    final partners = _filtered;
    final totalMeals = _stats['totalMealsContributed'] ?? 0;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Our Clients & Community Partners',
                    style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Restaurants, bakeries, charities, and civic sponsors across Dhaka working together to prevent food waste.',
                    style: TextStyle(color: widget.tokens.textSecondary),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 12,
                    runSpacing: 8,
                    children: [
                      Chip(
                        avatar: const Icon(Icons.store_rounded, size: 17),
                        label: Text(
                            '${widget.i18n.formatNumber(_partners.length)} Partners'),
                      ),
                      Chip(
                        avatar: const Icon(Icons.restaurant_rounded, size: 17),
                        label: Text(
                            '${widget.i18n.formatNumber(totalMeals is num ? totalMeals : 0)} Meals Contributed'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: _openApplyDialog,
                    icon: const Icon(Icons.handshake_rounded),
                    label: const Text('Apply as Partner Kitchen / NGO'),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          SizedBox(
            height: 44,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                for (final cat in [
                  'all',
                  'restaurants_cafes',
                  'ngos_shelters',
                  'corporate_sponsors',
                  'event_partners',
                ])
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(_categoryLabel(cat)),
                      selected: _category == cat,
                      onSelected: (_) => setState(() => _category = cat),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          if (_loading && _partners.isEmpty)
            const Padding(
              padding: EdgeInsets.all(32),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (partners.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: Text('No partners in this category yet.')),
              ),
            )
          else
            ...partners.map((p) => Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ShopAvatar(
                          name: widget.i18n.isBn ? p.nameBn : p.name,
                          imageUrl: p.logoUrl,
                          size: 50,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      widget.i18n.isBn ? p.nameBn : p.name,
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w800,
                                          fontSize: 16),
                                    ),
                                  ),
                                  if (p.featured)
                                    Icon(Icons.verified_rounded,
                                        size: 18, color: widget.tokens.primary),
                                ],
                              ),
                              Text(
                                '${p.area} · Since ${p.sinceYear}',
                                style: TextStyle(
                                    fontSize: 12,
                                    color: widget.tokens.textMuted),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                widget.i18n.isBn
                                    ? p.descriptionBn
                                    : p.description,
                                style: TextStyle(
                                    color: widget.tokens.textSecondary),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                '${widget.i18n.formatNumber(p.mealsContributed)} meals contributed',
                                style: TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 13,
                                  color: widget.tokens.textOnSurface,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                )),
          if (_testimonials.isNotEmpty) ...[
            const SizedBox(height: 16),
            const Text('Partner Voices',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            ..._testimonials.map((t) => Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: ListTile(
                    leading: ShopAvatar(
                      name: t.authorName,
                      imageUrl: t.avatarUrl,
                      size: 42,
                    ),
                    title: Text(
                      '"${widget.i18n.isBn ? t.quoteBn : t.quote}"',
                      style: const TextStyle(
                          fontStyle: FontStyle.italic, fontSize: 13),
                    ),
                    subtitle: Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(
                        '${widget.i18n.isBn ? t.authorNameBn : t.authorName} · ${t.orgName}',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                  ),
                )),
          ],
        ],
      ),
    );
  }

  void _openApplyDialog() {
    final orgCtrl = TextEditingController();
    final contactCtrl =
        TextEditingController(text: widget.auth.user?.name ?? '');
    final phoneCtrl =
        TextEditingController(text: widget.auth.user?.phone ?? '');
    final areaCtrl =
        TextEditingController(text: widget.auth.user?.area ?? 'Dhanmondi');
    final noteCtrl = TextEditingController();
    String category = 'restaurants_cafes';
    bool submitting = false;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDlg) => AlertDialog(
          title: const Text('Partner Application'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: orgCtrl,
                  decoration: const InputDecoration(
                      labelText: 'Restaurant / Organization Name'),
                ),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  value: category,
                  items: const [
                    DropdownMenuItem(
                        value: 'restaurants_cafes',
                        child: Text('Restaurant / Café / Bakery')),
                    DropdownMenuItem(
                        value: 'ngos_shelters', child: Text('NGO / Shelter')),
                    DropdownMenuItem(
                        value: 'corporate_sponsors',
                        child: Text('Corporate Sponsor')),
                    DropdownMenuItem(
                        value: 'event_partners', child: Text('Event Partner')),
                  ],
                  onChanged: (v) =>
                      setDlg(() => category = v ?? 'restaurants_cafes'),
                  decoration: const InputDecoration(labelText: 'Category'),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: contactCtrl,
                  decoration: const InputDecoration(labelText: 'Contact Name'),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: phoneCtrl,
                  decoration: const InputDecoration(labelText: 'Phone Number'),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: areaCtrl,
                  decoration: const InputDecoration(labelText: 'Dhaka Area'),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: noteCtrl,
                  maxLines: 2,
                  decoration: const InputDecoration(
                      labelText: 'Daily surplus estimate / notes'),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: submitting
                  ? null
                  : () async {
                      if (orgCtrl.text.trim().isEmpty) return;
                      setDlg(() => submitting = true);
                      try {
                        await ApiService.instance.applyPartner({
                          'name': orgCtrl.text.trim(),
                          'category': category,
                          'contactName': contactCtrl.text.trim(),
                          'phone': phoneCtrl.text.trim(),
                          'area': areaCtrl.text.trim(),
                          'notes': noteCtrl.text.trim(),
                        });
                        if (ctx.mounted) Navigator.pop(ctx);
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                                content: Text(
                                    'Partner application submitted! Our team will contact you.')),
                          );
                        }
                      } catch (e) {
                        setDlg(() => submitting = false);
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text(e.toString())));
                        }
                      }
                    },
              child: Text(submitting ? 'Submitting...' : 'Submit'),
            ),
          ],
        ),
      ),
    );
  }
}
