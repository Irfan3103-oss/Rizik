import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../i18n/i18n_provider.dart';
import '../services/api_service.dart';
import '../theme/palettes.dart';

class FoodImageView extends StatelessWidget {
  final String? url;
  final double? width;
  final double? height;
  final BorderRadius? borderRadius;

  const FoodImageView({
    super.key,
    required this.url,
    this.width,
    this.height,
    this.borderRadius,
  });

  @override
  Widget build(BuildContext context) {
    final resolved = ApiService.instance.resolveMediaUrl(url);
    final img = Image.network(
      resolved,
      width: width,
      height: height,
      fit: BoxFit.cover,
      errorBuilder: (_, __, ___) => Container(
        width: width,
        height: height,
        color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.12),
        child: Icon(
          Icons.restaurant_rounded,
          color: Theme.of(context).colorScheme.primary,
          size: 32,
        ),
      ),
    );
    if (borderRadius != null) {
      return ClipRRect(borderRadius: borderRadius!, child: img);
    }
    return img;
  }
}

class ShopAvatar extends StatelessWidget {
  final String name;
  final String? imageUrl;
  final double size;
  final bool online;

  const ShopAvatar({
    super.key,
    required this.name,
    this.imageUrl,
    this.size = 42,
    this.online = false,
  });

  @override
  Widget build(BuildContext context) {
    final initials = name
        .trim()
        .split(RegExp(r'\s+'))
        .take(2)
        .map((p) => p.isNotEmpty ? p[0].toUpperCase() : '')
        .join();
    return Stack(
      children: [
        CircleAvatar(
          radius: size / 2,
          backgroundColor:
              Theme.of(context).colorScheme.primary.withValues(alpha: 0.14),
          backgroundImage: (imageUrl != null && imageUrl!.isNotEmpty)
              ? NetworkImage(ApiService.instance.resolveMediaUrl(imageUrl))
              : null,
          child: (imageUrl == null || imageUrl!.isEmpty)
              ? Text(
                  initials.isEmpty ? 'A' : initials,
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                )
              : null,
        ),
        if (online)
          Positioned(
            right: 0,
            bottom: 0,
            child: Container(
              width: 11,
              height: 11,
              decoration: BoxDecoration(
                color: const Color(0xFF22C55E),
                shape: BoxShape.circle,
                border: Border.all(
                  color: Theme.of(context).scaffoldBackgroundColor,
                  width: 2,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class CountdownBadge extends StatefulWidget {
  final String isoEnd;
  final I18nProvider i18n;

  const CountdownBadge({super.key, required this.isoEnd, required this.i18n});

  @override
  State<CountdownBadge> createState() => _CountdownBadgeState();
}

class _CountdownBadgeState extends State<CountdownBadge> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final label = widget.i18n.formatTimeRemaining(widget.isoEnd);
    final isExpired = label == widget.i18n.t('feed.expired');
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: isExpired ? Colors.red.shade50 : Colors.orange.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: isExpired ? Colors.red.shade200 : Colors.orange.shade200,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.schedule_rounded,
            size: 13,
            color: isExpired ? Colors.red.shade700 : Colors.orange.shade800,
          ),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: isExpired ? Colors.red.shade700 : Colors.orange.shade800,
            ),
          ),
        ],
      ),
    );
  }
}

class AuthGateCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final VoidCallback onSignIn;

  const AuthGateCard({
    super.key,
    required this.title,
    required this.subtitle,
    required this.onSignIn,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 440),
        child: Card(
          margin: const EdgeInsets.all(24),
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircleAvatar(
                  radius: 28,
                  backgroundColor: Theme.of(context)
                      .colorScheme
                      .primary
                      .withValues(alpha: 0.12),
                  child: Icon(
                    Icons.lock_outline_rounded,
                    color: Theme.of(context).colorScheme.primary,
                    size: 28,
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  title,
                  style: Theme.of(context)
                      .textTheme
                      .titleLarge
                      ?.copyWith(fontWeight: FontWeight.w800),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  subtitle,
                  style: Theme.of(context).textTheme.bodyMedium,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: onSignIn,
                    icon: const Icon(Icons.login_rounded),
                    label: const Text('Sign In / Create Account'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class StatMetricCard extends StatelessWidget {
  final IconData icon;
  final String value;
  final String label;
  final PaletteTokens tokens;

  const StatMetricCard({
    super.key,
    required this.icon,
    required this.value,
    required this.label,
    required this.tokens,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: tokens.bgSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: tokens.borderSubtle),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: tokens.soft,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 18, color: tokens.textOnSurface),
          ),
          const SizedBox(height: 10),
          Text(
            value,
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: tokens.textPrimary,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: TextStyle(fontSize: 12, color: tokens.textMuted),
          ),
        ],
      ),
    );
  }
}

Future<LatLng?> showMapPinPickerDialog(
  BuildContext context, {
  LatLng initial = const LatLng(23.765, 90.391),
}) {
  return showDialog<LatLng>(
    context: context,
    builder: (ctx) {
      LatLng selected = initial;
      return StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          title: const Text('Pick Location on Dhaka Map'),
          content: SizedBox(
            width: 420,
            height: 320,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: FlutterMap(
                options: MapOptions(
                  initialCenter: selected,
                  initialZoom: 13.5,
                  onTap: (_, pos) => setState(() => selected = pos),
                ),
                children: [
                  TileLayer(
                    urlTemplate:
                        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                    userAgentPackageName: 'org.aharforall.app',
                  ),
                  MarkerLayer(
                    markers: [
                      Marker(
                        point: selected,
                        width: 40,
                        height: 40,
                        child: const Icon(
                          Icons.location_on_rounded,
                          color: Colors.red,
                          size: 36,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, selected),
              child: const Text('Use Pin'),
            ),
          ],
        ),
      );
    },
  );
}
