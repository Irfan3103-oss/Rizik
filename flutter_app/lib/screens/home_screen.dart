import 'package:flutter/material.dart';
import '../i18n/i18n_provider.dart';
import '../models/models.dart';
import '../services/api_service.dart';
import '../theme/palettes.dart';
import '../widgets/common_widgets.dart';

class HomeScreen extends StatefulWidget {
  final I18nProvider i18n;
  final PaletteTokens tokens;
  final void Function(String tab, {String? eventId}) onNavigate;

  const HomeScreen({
    super.key,
    required this.i18n,
    required this.tokens,
    required this.onNavigate,
  });

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  HomeSummary? _summary;
  bool _loading = true;
  int _testimonialIdx = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final s = await ApiService.instance.getHomeSummary();
      if (mounted) setState(() => _summary = s);
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.i18n.t;
    final tokens = widget.tokens;
    final s = _summary;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Hero Card
          Container(
            padding: const EdgeInsets.all(22),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [tokens.primary, tokens.primaryHover],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(22),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    'Dhaka Surplus Food Rescue Network',
                    style: TextStyle(
                      color: tokens.primaryFg,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  t('home.heroTitle'),
                  style: TextStyle(
                    color: tokens.primaryFg,
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    height: 1.25,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  t('home.heroSubtitle'),
                  style: TextStyle(
                    color: tokens.primaryFg.withValues(alpha: 0.9),
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    ElevatedButton.icon(
                      onPressed: () => widget.onNavigate('discover'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.white,
                        foregroundColor: tokens.primary,
                      ),
                      icon: const Icon(Icons.explore_rounded),
                      label: Text(t('home.browseFood')),
                    ),
                    OutlinedButton.icon(
                      onPressed: () => widget.onNavigate('donor'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: const BorderSide(color: Colors.white70),
                      ),
                      icon: const Icon(Icons.volunteer_activism_rounded),
                      label: Text(t('home.donateFood')),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          if (_loading && s == null)
            const Padding(
              padding: EdgeInsets.all(32),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (s != null) ...[
            // Impact Grid
            GridView.count(
              crossAxisCount: MediaQuery.of(context).size.width > 640 ? 4 : 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 1.35,
              children: [
                StatMetricCard(
                  icon: Icons.restaurant_rounded,
                  value: widget.i18n.formatNumber(s.mealsShared),
                  label: t('home.mealsShared'),
                  tokens: tokens,
                ),
                StatMetricCard(
                  icon: Icons.eco_rounded,
                  value: '${widget.i18n.formatNumber(s.kgSaved)} kg',
                  label: t('home.kgSaved'),
                  tokens: tokens,
                ),
                StatMetricCard(
                  icon: Icons.storefront_rounded,
                  value: widget.i18n.formatNumber(s.activeDonors),
                  label: t('home.activeDonors'),
                  tokens: tokens,
                ),
                StatMetricCard(
                  icon: Icons.groups_rounded,
                  value: widget.i18n.formatNumber(s.peopleHelped),
                  label: t('home.peopleHelped'),
                  tokens: tokens,
                ),
              ],
            ),
            const SizedBox(height: 18),

            // Quick Feature Shortcuts
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _QuickChip(
                  icon: Icons.celebration_rounded,
                  label: t('nav.wedding'),
                  tokens: tokens,
                  onTap: () => widget.onNavigate('wedding'),
                ),
                _QuickChip(
                  icon: Icons.favorite_rounded,
                  label: t('nav.donate'),
                  tokens: tokens,
                  onTap: () => widget.onNavigate('donate'),
                ),
                _QuickChip(
                  icon: Icons.handshake_rounded,
                  label: t('nav.clients'),
                  tokens: tokens,
                  onTap: () => widget.onNavigate('clients'),
                ),
                _QuickChip(
                  icon: Icons.emoji_events_rounded,
                  label: t('nav.leaderboard'),
                  tokens: tokens,
                  onTap: () => widget.onNavigate('leaderboard'),
                ),
              ],
            ),
            const SizedBox(height: 20),

            // Campaign Progress
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          t('home.campaignTitle'),
                          style: const TextStyle(
                              fontWeight: FontWeight.w800, fontSize: 16),
                        ),
                        TextButton(
                          onPressed: () => widget.onNavigate('donate'),
                          child: Text(t('nav.donate')),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    LinearProgressIndicator(
                      value: (s.raisedBdt / s.goalBdt).clamp(0.0, 1.0),
                      minHeight: 8,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '৳${widget.i18n.formatNumber(s.raisedBdt)} raised of ৳${widget.i18n.formatNumber(s.goalBdt)} · ${widget.i18n.formatNumber(s.donorCount)} supporters',
                      style: TextStyle(fontSize: 12, color: tokens.textSecondary),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 18),

            // Featured Verified Kitchens
            Text(
              t('home.featuredDonors'),
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 10),
            SizedBox(
              height: 186,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: s.featuredDonors.length,
                separatorBuilder: (_, __) => const SizedBox(width: 12),
                itemBuilder: (_, idx) {
                  final d = s.featuredDonors[idx];
                  return SizedBox(
                    width: 210,
                    child: Card(
                      clipBehavior: Clip.antiAlias,
                      child: InkWell(
                        onTap: () => widget.onNavigate('discover'),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            FoodImageView(
                              url: d['photoUrl']?.toString(),
                              height: 98,
                              width: double.infinity,
                            ),
                            Padding(
                              padding: const EdgeInsets.all(10),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    d['businessName']?.toString() ?? '',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w700, fontSize: 14),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    '${d['area']} · ${d['activeListings']} active',
                                    style: TextStyle(
                                        fontSize: 12, color: tokens.textMuted),
                                  ),
                                ],
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
            const SizedBox(height: 18),

            // Upcoming Events
            if (s.upcomingEvents.isNotEmpty) ...[
              Text(
                t('home.upcomingEvents'),
                style:
                    const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 10),
              ...s.upcomingEvents.map((ev) => Card(
                    margin: const EdgeInsets.only(bottom: 10),
                    child: ListTile(
                      leading: FoodImageView(
                        url: ev.bannerUrl,
                        width: 56,
                        height: 56,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      title: Text(
                        widget.i18n.isBn ? ev.titleBn : ev.title,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      subtitle: Text(
                        '${ev.area} · ${ev.eventDate} (${ev.startTime}–${ev.endTime})',
                      ),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: () => widget.onNavigate('events', eventId: ev.id),
                    ),
                  )),
              const SizedBox(height: 14),
            ],

            // Recent Community Rescues
            if (s.recentActivity.isNotEmpty) ...[
              Text(
                t('home.recentActivity'),
                style:
                    const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 10),
              ...s.recentActivity.map((act) => Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      leading: CircleAvatar(
                        backgroundColor: tokens.soft,
                        child: Icon(Icons.check_circle_outline_rounded,
                            color: tokens.textOnSurface),
                      ),
                      title: Text(
                        '${act['quantity']} ${act['unit']} · ${act['listingTitle']}',
                        style: const TextStyle(
                            fontWeight: FontWeight.w600, fontSize: 14),
                      ),
                      subtitle: Text('${act['donorName']} (${act['area']})'),
                    ),
                  )),
              const SizedBox(height: 14),
            ],

            // Testimonials Carousel
            if (s.testimonials.isNotEmpty) ...[
              Text(
                t('home.testimonials'),
                style:
                    const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 10),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '"${widget.i18n.isBn ? s.testimonials[_testimonialIdx % s.testimonials.length].quoteBn : s.testimonials[_testimonialIdx % s.testimonials.length].quote}"',
                        style: const TextStyle(
                            fontStyle: FontStyle.italic, fontSize: 14),
                      ),
                      const SizedBox(height: 10),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            '— ${widget.i18n.isBn ? s.testimonials[_testimonialIdx % s.testimonials.length].authorNameBn : s.testimonials[_testimonialIdx % s.testimonials.length].authorName} · ${s.testimonials[_testimonialIdx % s.testimonials.length].orgName}',
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 12,
                              color: tokens.textSecondary,
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.arrow_forward_rounded),
                            onPressed: () => setState(
                                () => _testimonialIdx = _testimonialIdx + 1),
                          ),
                        ],
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

class _QuickChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final PaletteTokens tokens;
  final VoidCallback onTap;

  const _QuickChip({
    required this.icon,
    required this.label,
    required this.tokens,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ActionChip(
      avatar: Icon(icon, size: 17, color: tokens.textOnSurface),
      label: Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
      backgroundColor: tokens.bgSurface,
      side: BorderSide(color: tokens.borderSubtle),
      onPressed: onTap,
    );
  }
}
