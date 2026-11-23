import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import '../i18n/i18n_provider.dart';
import '../providers/auth_provider.dart';
import '../services/firestore_error_helper.dart';
import '../services/health_check_service.dart';
import '../theme/palettes.dart';

class FirestoreErrorBanner extends StatelessWidget {
  final FirestoreListenerError error;
  final I18nProvider i18n;
  final PaletteTokens tokens;
  final VoidCallback? onRetry;
  final VoidCallback? onRunHealthCheck;

  const FirestoreErrorBanner({
    super.key,
    required this.error,
    required this.i18n,
    required this.tokens,
    this.onRetry,
    this.onRunHealthCheck,
  });

  @override
  Widget build(BuildContext context) {
    final t = i18n.t;
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.red.shade50,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.red.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.error_outline_rounded,
                  color: Colors.red.shade700, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  error.toFriendlyMessage(isBn: i18n.isBn),
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: Colors.red.shade900,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              if (onRetry != null)
                OutlinedButton.icon(
                  onPressed: onRetry,
                  icon: const Icon(Icons.refresh_rounded, size: 16),
                  label: Text(t('chat.retry')),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.red.shade800,
                    side: BorderSide(color: Colors.red.shade300),
                    minimumSize: const Size(0, 34),
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                  ),
                ),
              if (onRunHealthCheck != null)
                FilledButton.icon(
                  onPressed: onRunHealthCheck,
                  icon: const Icon(Icons.health_and_safety_outlined, size: 16),
                  label: Text(t('health.runBtn')),
                  style: FilledButton.styleFrom(
                    backgroundColor: Colors.red.shade700,
                    foregroundColor: Colors.white,
                    minimumSize: const Size(0, 34),
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

void showHealthCheckSheet(
  BuildContext context, {
  required AuthProvider auth,
  required I18nProvider i18n,
  required PaletteTokens tokens,
  String mode = 'user',
}) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (ctx) => FractionallySizedBox(
      heightFactor: 0.90,
      child: _HealthCheckSheetBody(
        auth: auth,
        i18n: i18n,
        tokens: tokens,
        mode: mode,
      ),
    ),
  );
}

class _HealthCheckSheetBody extends StatefulWidget {
  final AuthProvider auth;
  final I18nProvider i18n;
  final PaletteTokens tokens;
  final String mode;

  const _HealthCheckSheetBody({
    required this.auth,
    required this.i18n,
    required this.tokens,
    required this.mode,
  });

  @override
  State<_HealthCheckSheetBody> createState() => _HealthCheckSheetBodyState();
}

class _HealthCheckSheetBodyState extends State<_HealthCheckSheetBody> {
  HealthCheckReport? _report;
  bool _running = true;
  bool _repairing = false;
  String? _repairStatus;

  @override
  void initState() {
    super.initState();
    _run();
  }

  Future<void> _run() async {
    setState(() => _running = true);
    try {
      final report = await HealthCheckService.instance.runHealthCheck(
        mode: widget.mode,
        fbUser: widget.auth.firebaseUser,
        user: widget.auth.user,
      );
      if (mounted) {
        setState(() {
          _report = report;
          _running = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _running = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Health check failed: $e')),
        );
      }
    }
  }

  Future<void> _repairAccount() async {
    setState(() {
      _repairing = true;
      _repairStatus = null;
    });
    final report = await widget.auth.runEnsureAccount(force: true);
    if (!mounted) return;
    setState(() {
      _repairing = false;
      if (report != null) {
        _repairStatus =
            'Repaired ${report.fixedCount} item(s) · ${report.errorCount} error(s)';
      } else {
        _repairStatus = 'Sign in with a verified account to repair.';
      }
    });
    await _run();
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.i18n.t;
    final isBn = widget.i18n.isBn;
    final report = _report;

    return SafeArea(
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 10, 8),
            child: Row(
              children: [
                Icon(Icons.health_and_safety_rounded,
                    color: widget.tokens.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        widget.mode == 'admin'
                            ? t('health.title')
                            : t('health.userTitle'),
                        style: const TextStyle(
                            fontSize: 17, fontWeight: FontWeight.w800),
                      ),
                      if (report != null)
                        Text(
                          '${report.passCount} ${t('health.pass')} · '
                          '${report.warnCount} ${t('health.warn')} · '
                          '${report.failCount} ${t('health.fail')}',
                          style: TextStyle(
                              fontSize: 12, color: widget.tokens.textMuted),
                        ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: _running ? null : _run,
                  tooltip: t('health.rerunBtn'),
                  icon: const Icon(Icons.refresh_rounded),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close_rounded),
                ),
              ],
            ),
          ),
          if (widget.auth.isFirebaseSession && widget.auth.isFirebaseVerified)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _repairing ? null : _repairAccount,
                      icon: _repairing
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.build_circle_outlined, size: 18),
                      label: Text(_repairing
                          ? t('repair.running')
                          : t('health.repairFirst')),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton.icon(
                    onPressed: _running ? null : _run,
                    icon: const Icon(Icons.play_arrow_rounded, size: 18),
                    label: Text(t('health.rerunBtn')),
                  ),
                ],
              ),
            ),
          if (_repairStatus != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Container(
                width: double.infinity,
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: widget.tokens.soft,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  _repairStatus!,
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: widget.tokens.textOnSurface),
                ),
              ),
            ),
          const Divider(height: 1),
          Expanded(
            child: _running
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const CircularProgressIndicator(),
                        const SizedBox(height: 12),
                        Text(t('health.running')),
                      ],
                    ),
                  )
                : report == null
                    ? Center(child: Text(t('common.loading')))
                    : ListView.builder(
                        padding: const EdgeInsets.all(14),
                        itemCount: report.items.length,
                        itemBuilder: (_, idx) {
                          final item = report.items[idx];
                          final isPass = item.status == 'pass';
                          final isWarn = item.status == 'warn';
                          final badgeColor = isPass
                              ? const Color(0xFF16A34A)
                              : isWarn
                                  ? Colors.orange.shade800
                                  : Colors.red.shade700;
                          final badgeBg = isPass
                              ? Colors.green.shade50
                              : isWarn
                                  ? Colors.orange.shade50
                                  : Colors.red.shade50;
                          final icon = isPass
                              ? Icons.check_circle_rounded
                              : isWarn
                                  ? Icons.warning_amber_rounded
                                  : Icons.cancel_rounded;

                          return Card(
                            margin: const EdgeInsets.only(bottom: 10),
                            child: Padding(
                              padding: const EdgeInsets.all(12),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Icon(icon, color: badgeColor, size: 20),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: Text(
                                          isBn ? item.titleBn : item.title,
                                          style: const TextStyle(
                                              fontWeight: FontWeight.w800,
                                              fontSize: 14),
                                        ),
                                      ),
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 8, vertical: 2),
                                        decoration: BoxDecoration(
                                          color: badgeBg,
                                          borderRadius:
                                              BorderRadius.circular(8),
                                        ),
                                        child: Text(
                                          item.status.toUpperCase(),
                                          style: TextStyle(
                                              fontSize: 10,
                                              fontWeight: FontWeight.w800,
                                              color: badgeColor),
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    isBn ? item.detailBn : item.detail,
                                    style: const TextStyle(fontSize: 13),
                                  ),
                                  const SizedBox(height: 6),
                                  Container(
                                    width: double.infinity,
                                    padding: const EdgeInsets.all(8),
                                    decoration: BoxDecoration(
                                      color: widget.tokens.bgSubtle,
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Text(
                                      isBn ? item.fixHintBn : item.fixHint,
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: widget.tokens.textSecondary,
                                      ),
                                    ),
                                  ),
                                  if (item.indexUrl != null &&
                                      item.indexUrl!.isNotEmpty) ...[
                                    const SizedBox(height: 8),
                                    Wrap(
                                      spacing: 8,
                                      children: [
                                        FilledButton.tonalIcon(
                                          onPressed: () {
                                            final uri =
                                                Uri.tryParse(item.indexUrl!);
                                            if (uri != null) {
                                              launchUrl(uri,
                                                  mode: LaunchMode
                                                      .externalApplication);
                                            }
                                          },
                                          icon: const Icon(
                                              Icons.open_in_new_rounded,
                                              size: 16),
                                          label: Text(t('health.openIndex')),
                                        ),
                                        IconButton(
                                          icon: const Icon(Icons.copy_rounded,
                                              size: 18),
                                          onPressed: () async {
                                            await Clipboard.setData(
                                              ClipboardData(
                                                  text: item.indexUrl!),
                                            );
                                            if (context.mounted) {
                                              ScaffoldMessenger.of(context)
                                                  .showSnackBar(
                                                const SnackBar(
                                                  content:
                                                      Text('Index URL copied'),
                                                ),
                                              );
                                            }
                                          },
                                        ),
                                      ],
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }
}
