import 'package:flutter/material.dart';
import '../i18n/i18n_provider.dart';
import '../models/models.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../theme/palettes.dart';
import '../widgets/common_widgets.dart';

class ImpactDashboardScreen extends StatefulWidget {
  final AuthProvider auth;
  final I18nProvider i18n;
  final PaletteTokens tokens;

  const ImpactDashboardScreen({
    super.key,
    required this.auth,
    required this.i18n,
    required this.tokens,
  });

  @override
  State<ImpactDashboardScreen> createState() => _ImpactDashboardScreenState();
}

class _ImpactDashboardScreenState extends State<ImpactDashboardScreen> {
  ImpactDashboardData? _data;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await ApiService.instance.getImpactDashboard();
      if (mounted) setState(() => _data = res);
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    final personal = d?.personal;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'Community Impact Dashboard',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 4),
          Text(
            'Live transparency metrics across rescued meals, CO₂ prevented, and community funds.',
            style: TextStyle(color: widget.tokens.textSecondary),
          ),
          const SizedBox(height: 16),
          if (_loading && d == null)
            const Padding(
              padding: EdgeInsets.all(36),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (d != null) ...[
            GridView.count(
              crossAxisCount: MediaQuery.of(context).size.width > 640 ? 3 : 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 1.32,
              children: [
                StatMetricCard(
                  icon: Icons.restaurant_rounded,
                  value: widget.i18n.formatNumber(d.mealsShared),
                  label: 'Meals Shared',
                  tokens: widget.tokens,
                ),
                StatMetricCard(
                  icon: Icons.scale_rounded,
                  value: '${widget.i18n.formatNumber(d.kgSaved)} kg',
                  label: 'Food Rescued',
                  tokens: widget.tokens,
                ),
                StatMetricCard(
                  icon: Icons.cloud_done_rounded,
                  value: '${widget.i18n.formatNumber(d.co2AvoidedKg)} kg',
                  label: 'CO₂ Avoided',
                  tokens: widget.tokens,
                ),
                StatMetricCard(
                  icon: Icons.storefront_rounded,
                  value: widget.i18n.formatNumber(d.activeDonors),
                  label: 'Active Kitchens',
                  tokens: widget.tokens,
                ),
                StatMetricCard(
                  icon: Icons.qr_code_2_rounded,
                  value: widget.i18n.formatNumber(d.qrHandovers),
                  label: 'QR Verified Handovers',
                  tokens: widget.tokens,
                ),
                StatMetricCard(
                  icon: Icons.bolt_rounded,
                  value: widget.i18n.formatNumber(d.flashListingsNow),
                  label: 'Flash Rescues Now',
                  tokens: widget.tokens,
                ),
              ],
            ),
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Financial & Ramadan Support',
                        style: TextStyle(
                            fontWeight: FontWeight.w800, fontSize: 16)),
                    const SizedBox(height: 10),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.volunteer_activism_rounded),
                      title: Text(
                          '৳${widget.i18n.formatNumber(d.raisedBdt)} total community donations'),
                      subtitle: Text(
                          '${widget.i18n.formatNumber(d.mealsFunded)} meals funded across ${widget.i18n.formatNumber(d.donationCount)} contributions'),
                    ),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.nights_stay_rounded),
                      title: Text(
                          '৳${widget.i18n.formatNumber(d.ramadanDonationsBdt)} Ramadan / Iftar fund'),
                      subtitle: Text(
                          '${widget.i18n.formatNumber(d.peopleHelped)} neighbors served'),
                    ),
                  ],
                ),
              ),
            ),
            if (personal != null) ...[
              const SizedBox(height: 14),
              Card(
                color: widget.tokens.soft,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Your Personal Impact',
                          style: TextStyle(
                              fontWeight: FontWeight.w800, fontSize: 16)),
                      const SizedBox(height: 8),
                      Text(
                        'Meals rescued: ${personal['mealsRescued'] ?? 0} · Claims completed: ${personal['completedClaims'] ?? 0} · Volunteer hours: ${personal['volunteerHours'] ?? 0}h',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }
}

class VolunteerHubScreen extends StatefulWidget {
  final AuthProvider auth;
  final I18nProvider i18n;
  final PaletteTokens tokens;
  final VoidCallback onRequestLogin;

  const VolunteerHubScreen({
    super.key,
    required this.auth,
    required this.i18n,
    required this.tokens,
    required this.onRequestLogin,
  });

  @override
  State<VolunteerHubScreen> createState() => _VolunteerHubScreenState();
}

class _VolunteerHubScreenState extends State<VolunteerHubScreen> {
  List<VolunteerShift> _shifts = [];
  double _myTotalHours = 0;
  String _roleFilter = 'all';
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await ApiService.instance.getVolunteerShifts(role: _roleFilter);
      if (mounted) {
        setState(() {
          _shifts = res.shifts;
          _myTotalHours = res.myTotalHours;
        });
      }
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
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: widget.tokens.soft,
                child: Icon(Icons.badge_rounded,
                    color: widget.tokens.textOnSurface),
              ),
              title: const Text('Volunteer Shift Hub',
                  style: TextStyle(fontWeight: FontWeight.w800)),
              subtitle: Text(
                  'My logged service: ${_myTotalHours.toStringAsFixed(1)} hours'),
              trailing: widget.auth.isLoggedIn
                  ? IconButton.filledTonal(
                      onPressed: _openCreateShiftDialog,
                      icon: const Icon(Icons.add_rounded),
                      tooltip: 'Post Shift',
                    )
                  : null,
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 44,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                for (final r in [
                  'all',
                  'distribution',
                  'transport',
                  'packing',
                  'cooking'
                ])
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(r.toUpperCase()),
                      selected: _roleFilter == r,
                      onSelected: (_) {
                        setState(() => _roleFilter = r);
                        _load();
                      },
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          if (_loading && _shifts.isEmpty)
            const Padding(
              padding: EdgeInsets.all(32),
              child: Center(child: CircularProgressIndicator()),
            )
          else
            ..._shifts.map((s) {
              final signedStatus = s.mySignup?['status']?.toString();
              final spotsLeft = (s.slotsTotal - s.slotsFilled).clamp(0, 999);
              return Card(
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
                              widget.i18n.isBn ? s.titleBn : s.title,
                              style: const TextStyle(
                                  fontWeight: FontWeight.w800, fontSize: 16),
                            ),
                          ),
                          Chip(
                            label: Text(s.role.toUpperCase(),
                                style: const TextStyle(fontSize: 11)),
                            visualDensity: VisualDensity.compact,
                          ),
                        ],
                      ),
                      Text('${s.locationName} (${s.area})'),
                      const SizedBox(height: 4),
                      Text(
                        '${s.shiftDate} · ${s.startTime} – ${s.endTime} · $spotsLeft spots open',
                        style: TextStyle(
                            fontSize: 12, color: widget.tokens.textMuted),
                      ),
                      const SizedBox(height: 10),
                      if (signedStatus == null)
                        FilledButton(
                          onPressed: spotsLeft == 0
                              ? null
                              : () async {
                                  if (!widget.auth.isLoggedIn) {
                                    widget.onRequestLogin();
                                    return;
                                  }
                                  await ApiService.instance
                                      .signupVolunteerShift(s.id);
                                  _load();
                                },
                          child: Text(
                              spotsLeft == 0 ? 'Shift Full' : 'Sign Up for Shift'),
                        )
                      else
                        Wrap(
                          spacing: 8,
                          children: [
                            Chip(
                              label: Text('Status: $signedStatus'),
                              backgroundColor: widget.tokens.soft,
                            ),
                            if (signedStatus == 'registered')
                              FilledButton(
                                onPressed: () async {
                                  await ApiService.instance
                                      .updateVolunteerShiftStatus(
                                          s.id, 'checked_in');
                                  _load();
                                },
                                child: const Text('Check In'),
                              ),
                            if (signedStatus == 'checked_in')
                              FilledButton(
                                onPressed: () async {
                                  await ApiService.instance
                                      .updateVolunteerShiftStatus(
                                          s.id, 'completed');
                                  _load();
                                },
                                child: const Text('Complete Shift'),
                              ),
                          ],
                        ),
                    ],
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }

  void _openCreateShiftDialog() {
    final titleCtrl = TextEditingController();
    final areaCtrl = TextEditingController(text: 'Dhanmondi');
    final locCtrl = TextEditingController();
    String role = 'distribution';
    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDlg) => AlertDialog(
          title: const Text('Post Volunteer Shift'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: titleCtrl,
                decoration: const InputDecoration(labelText: 'Shift Title'),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: areaCtrl,
                decoration: const InputDecoration(labelText: 'Area'),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: locCtrl,
                decoration: const InputDecoration(labelText: 'Meeting Point'),
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                value: role,
                items: const [
                  DropdownMenuItem(
                      value: 'distribution', child: Text('Distribution')),
                  DropdownMenuItem(value: 'transport', child: Text('Transport')),
                  DropdownMenuItem(value: 'packing', child: Text('Packing')),
                  DropdownMenuItem(value: 'cooking', child: Text('Cooking')),
                ],
                onChanged: (v) => setDlg(() => role = v ?? 'distribution'),
                decoration: const InputDecoration(labelText: 'Role'),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () async {
                await ApiService.instance.createVolunteerShift({
                  'title': titleCtrl.text.trim(),
                  'area': areaCtrl.text.trim(),
                  'locationName': locCtrl.text.trim(),
                  'role': role,
                  'shiftDate': DateTime.now()
                      .add(const Duration(days: 1))
                      .toIso8601String()
                      .substring(0, 10),
                  'startTime': '17:00',
                  'endTime': '20:00',
                  'slotsTotal': 8,
                });
                if (ctx.mounted) Navigator.pop(ctx);
                _load();
              },
              child: const Text('Create Shift'),
            ),
          ],
        ),
      ),
    );
  }
}

class LeaderboardScreen extends StatefulWidget {
  final AuthProvider auth;
  final I18nProvider i18n;
  final PaletteTokens tokens;

  const LeaderboardScreen({
    super.key,
    required this.auth,
    required this.i18n,
    required this.tokens,
  });

  @override
  State<LeaderboardScreen> createState() => _LeaderboardScreenState();
}

class _LeaderboardScreenState extends State<LeaderboardScreen> {
  LeaderboardData? _data;
  bool _loading = true;
  int _tab = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await ApiService.instance.getLeaderboard();
      if (mounted) setState(() => _data = res);
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Community Leaderboard & Badges',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          SegmentedButton<int>(
            segments: const [
              ButtonSegment(value: 0, label: Text('Kitchens')),
              ButtonSegment(value: 1, label: Text('Volunteers')),
              ButtonSegment(value: 2, label: Text('Dhaka Areas')),
            ],
            selected: {_tab},
            onSelectionChanged: (v) => setState(() => _tab = v.first),
          ),
          const SizedBox(height: 14),
          if (_loading && d == null)
            const Padding(
              padding: EdgeInsets.all(32),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (d != null) ...[
            if (d.myBadges.isNotEmpty) ...[
              Card(
                color: widget.tokens.soft,
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Earned Badges',
                          style: TextStyle(fontWeight: FontWeight.w800)),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: d.myBadges
                            .map((b) => Chip(
                                  avatar: const Icon(Icons.military_tech_rounded,
                                      size: 16),
                                  label: Text(b['label']?.toString() ??
                                      b['id']?.toString() ??
                                      'Badge'),
                                ))
                            .toList(),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
            ],
            ...(_tab == 0
                    ? d.topDonors
                    : _tab == 1
                        ? d.topVolunteers
                        : d.topAreas)
                .asMap()
                .entries
                .map((entry) {
              final rank = entry.key + 1;
              final item = entry.value;
              final name = item['businessName'] ??
                  item['name'] ??
                  item['area'] ??
                  'Community Hero';
              final score = item['mealsShared'] ??
                  item['hours'] ??
                  item['meals'] ??
                  item['points'] ??
                  0;
              final unit = _tab == 1 ? 'hrs' : 'meals';
              return Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor: rank <= 3
                        ? widget.tokens.primary
                        : widget.tokens.soft,
                    child: Text(
                      '#$rank',
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        color:
                            rank <= 3 ? Colors.white : widget.tokens.textPrimary,
                      ),
                    ),
                  ),
                  title: Text(name.toString(),
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: item['area'] != null && _tab != 2
                      ? Text(item['area'].toString())
                      : null,
                  trailing: Text(
                    '${widget.i18n.formatNumber(score is num ? score : 0)} $unit',
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      color: widget.tokens.textOnSurface,
                    ),
                  ),
                ),
              );
            }),
          ],
        ],
      ),
    );
  }
}
