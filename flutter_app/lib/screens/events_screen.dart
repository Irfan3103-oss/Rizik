import 'package:flutter/material.dart';
import '../i18n/i18n_provider.dart';
import '../models/models.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../theme/palettes.dart';
import '../widgets/common_widgets.dart';

class EventsScreen extends StatefulWidget {
  final AuthProvider auth;
  final I18nProvider i18n;
  final PaletteTokens tokens;
  final VoidCallback onRequestLogin;

  const EventsScreen({
    super.key,
    required this.auth,
    required this.i18n,
    required this.tokens,
    required this.onRequestLogin,
  });

  @override
  State<EventsScreen> createState() => _EventsScreenState();
}

class _EventsScreenState extends State<EventsScreen> {
  List<CommunityEvent> _events = [];
  String _status = 'all';
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final items = await ApiService.instance.getEvents(status: _status);
      if (mounted) setState(() => _events = items);
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
          child: Row(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (final st in ['all', 'ongoing', 'upcoming', 'past'])
                        Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: ChoiceChip(
                            label: Text(st.toUpperCase()),
                            selected: _status == st,
                            onSelected: (_) {
                              setState(() => _status = st);
                              _load();
                            },
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              if (widget.auth.isLoggedIn)
                IconButton.filledTonal(
                  onPressed: _openCreateEventDialog,
                  icon: const Icon(Icons.add_rounded),
                  tooltip: 'Organize Event',
                ),
            ],
          ),
        ),
        Expanded(
          child: _loading && _events.isEmpty
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _events.length,
                    itemBuilder: (_, idx) {
                      final ev = _events[idx];
                      return Card(
                        margin: const EdgeInsets.only(bottom: 14),
                        clipBehavior: Clip.antiAlias,
                        child: InkWell(
                          onTap: () => _openEventDetail(ev),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              FoodImageView(
                                url: ev.bannerUrl,
                                height: 155,
                                width: double.infinity,
                              ),
                              Padding(
                                padding: const EdgeInsets.all(14),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      widget.i18n.isBn ? ev.titleBn : ev.title,
                                      style: const TextStyle(
                                          fontSize: 17,
                                          fontWeight: FontWeight.w800),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      '${ev.area} · ${ev.eventDate} (${ev.startTime}–${ev.endTime})',
                                      style: TextStyle(
                                          color: widget.tokens.textSecondary),
                                    ),
                                    const SizedBox(height: 8),
                                    Row(
                                      children: [
                                        Chip(
                                          label: Text(ev.status.name.toUpperCase()),
                                          visualDensity: VisualDensity.compact,
                                        ),
                                        const SizedBox(width: 8),
                                        Text(
                                          '${ev.registeredCount}/${ev.volunteersNeeded} volunteers · ${ev.expectedMeals} meals',
                                          style: TextStyle(
                                              fontSize: 12,
                                              color: widget.tokens.textMuted),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
        ),
      ],
    );
  }

  void _openEventDetail(CommunityEvent ev) {
    final nameCtrl = TextEditingController(text: widget.auth.user?.name ?? '');
    final phoneCtrl = TextEditingController(text: widget.auth.user?.phone ?? '');
    String role = 'distribution';

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.8,
          builder: (_, scrollCtrl) => ListView(
            controller: scrollCtrl,
            padding: const EdgeInsets.all(20),
            children: [
              FoodImageView(
                url: ev.bannerUrl,
                height: 180,
                width: double.infinity,
                borderRadius: BorderRadius.circular(14),
              ),
              const SizedBox(height: 12),
              Text(widget.i18n.isBn ? ev.titleBn : ev.title,
                  style: const TextStyle(
                      fontSize: 20, fontWeight: FontWeight.w800)),
              Text('${ev.organizer} · ${ev.locationName}'),
              const SizedBox(height: 10),
              Text(widget.i18n.isBn ? ev.descriptionBn : ev.description),
              const SizedBox(height: 14),
              if (ev.schedule.isNotEmpty) ...[
                const Text('Schedule',
                    style: TextStyle(fontWeight: FontWeight.w800)),
                const SizedBox(height: 6),
                ...ev.schedule.map((s) => ListTile(
                      dense: true,
                      leading: const Icon(Icons.schedule_rounded, size: 18),
                      title: Text(widget.i18n.isBn ? s.activityBn : s.activity),
                      subtitle: Text(s.time),
                    )),
              ],
              const SizedBox(height: 12),
              if (widget.auth.isLoggedIn) ...[
                const Text('Register as Event Volunteer',
                    style: TextStyle(fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                TextField(
                    controller: nameCtrl,
                    decoration: const InputDecoration(labelText: 'Full Name')),
                const SizedBox(height: 8),
                TextField(
                    controller: phoneCtrl,
                    decoration: const InputDecoration(labelText: 'Phone')),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  value: role,
                  items: const [
                    DropdownMenuItem(value: 'cooking', child: Text('Cooking')),
                    DropdownMenuItem(value: 'packing', child: Text('Packing')),
                    DropdownMenuItem(
                        value: 'distribution', child: Text('Distribution')),
                    DropdownMenuItem(
                        value: 'transport', child: Text('Transport')),
                  ],
                  onChanged: (v) => setSheet(() => role = v ?? 'distribution'),
                  decoration: const InputDecoration(labelText: 'Preferred Role'),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    OutlinedButton.icon(
                      onPressed: () async {
                        await ApiService.instance.toggleEventReminder(ev.id);
                        if (ctx.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Reminder updated!')));
                        }
                      },
                      icon: const Icon(Icons.notifications_active_outlined),
                      label: const Text('Remind Me'),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: FilledButton(
                        onPressed: () async {
                          await ApiService.instance.registerEventVolunteer(ev.id, {
                            'name': nameCtrl.text.trim(),
                            'phone': phoneCtrl.text.trim(),
                            'availability': '${ev.startTime}-${ev.endTime}',
                            'preferredRole': role,
                          });
                          if (ctx.mounted) Navigator.pop(ctx);
                          _load();
                        },
                        child: const Text('Join as Volunteer'),
                      ),
                    ),
                  ],
                ),
              ] else
                FilledButton(
                  onPressed: () {
                    Navigator.pop(ctx);
                    widget.onRequestLogin();
                  },
                  child: const Text('Sign In to Volunteer'),
                ),
            ],
          ),
        ),
      ),
    );
  }

  void _openCreateEventDialog() {
    final titleCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    final areaCtrl = TextEditingController(text: 'Dhanmondi');
    final locCtrl = TextEditingController(text: 'Rabindra Sarobar');
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Create Distribution Event'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                  controller: titleCtrl,
                  decoration: const InputDecoration(labelText: 'Event Title')),
              const SizedBox(height: 8),
              TextField(
                  controller: descCtrl,
                  decoration: const InputDecoration(labelText: 'Description')),
              const SizedBox(height: 8),
              TextField(
                  controller: areaCtrl,
                  decoration: const InputDecoration(labelText: 'Area')),
              const SizedBox(height: 8),
              TextField(
                  controller: locCtrl,
                  decoration: const InputDecoration(labelText: 'Location Name')),
            ],
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
            onPressed: () async {
              await ApiService.instance.createEvent({
                'title': titleCtrl.text.trim(),
                'description': descCtrl.text.trim(),
                'organizer': widget.auth.user!.name,
                'area': areaCtrl.text.trim(),
                'locationName': locCtrl.text.trim(),
                'eventDate': DateTime.now()
                    .add(const Duration(days: 2))
                    .toIso8601String()
                    .substring(0, 10),
                'startTime': '16:00',
                'endTime': '19:00',
                'expectedMeals': 200,
                'volunteersNeeded': 15,
              });
              if (ctx.mounted) Navigator.pop(ctx);
              _load();
            },
            child: const Text('Publish Event'),
          ),
        ],
      ),
    );
  }
}
