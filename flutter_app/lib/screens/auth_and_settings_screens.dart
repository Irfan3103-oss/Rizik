import 'dart:async';
import 'package:flutter/material.dart';
import '../i18n/i18n_provider.dart';
import '../models/models.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../services/community_rooms_service.dart';
import '../services/ensure_account_service.dart';
import '../services/firestore_error_helper.dart';
import '../services/firestore_service.dart';
import '../services/messenger_service.dart';
import '../theme/palettes.dart';
import '../theme/theme_provider.dart';
import '../widgets/admin_chat_sheet.dart';
import '../widgets/health_check_sheet.dart';

class OnboardingAuthScreen extends StatefulWidget {
  final AuthProvider auth;
  final I18nProvider i18n;
  final PaletteTokens tokens;
  final VoidCallback? onSuccess;

  const OnboardingAuthScreen({
    super.key,
    required this.auth,
    required this.i18n,
    required this.tokens,
    this.onSuccess,
  });

  @override
  State<OnboardingAuthScreen> createState() => _OnboardingAuthScreenState();
}

class _OnboardingAuthScreenState extends State<OnboardingAuthScreen> {
  final _idCtrl = TextEditingController();
  final _pwCtrl = TextEditingController();
  final _nameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _areaCtrl = TextEditingController(text: 'Dhanmondi');
  final _orgCtrl = TextEditingController();
  final _restNameCtrl = TextEditingController();
  final _restAddrCtrl = TextEditingController();
  final _otpCtrl = TextEditingController();

  String _mode = 'login'; // 'login' | 'signup' | 'forgot'
  bool _useFirebaseEmail = true;
  bool _isRestaurantOwner = false;
  bool _busy = false;
  String? _error;
  String? _info;
  List<Map<String, dynamic>> _demoAccounts = [];

  @override
  void initState() {
    super.initState();
    _loadDemoAccounts();
  }

  Future<void> _loadDemoAccounts() async {
    try {
      final list = await ApiService.instance.getDemoAccounts();
      if (mounted) setState(() => _demoAccounts = list);
    } catch (_) {}
  }

  Future<void> _handleSubmit() async {
    setState(() {
      _busy = true;
      _error = null;
      _info = null;
    });
    try {
      if (_mode == 'login') {
        if (_useFirebaseEmail && _idCtrl.text.contains('@')) {
          await widget.auth.signInWithFirebaseEmail(
              _idCtrl.text.trim(), _pwCtrl.text);
        } else {
          await widget.auth
              .loginWithPassword(_idCtrl.text.trim(), _pwCtrl.text);
        }
        if (widget.auth.isLoggedIn &&
            (!widget.auth.isFirebaseSession || widget.auth.isFirebaseVerified)) {
          widget.onSuccess?.call();
        } else if (widget.auth.isFirebaseSession &&
            !widget.auth.isFirebaseVerified) {
          setState(() => _info =
              'Verification email sent. Please verify your email and tap Refresh Status.');
        }
      } else if (_mode == 'signup') {
        if (_useFirebaseEmail) {
          final rest = _isRestaurantOwner
              ? RestaurantInfo(
                  restaurantName: _restNameCtrl.text.trim().isEmpty
                      ? _nameCtrl.text.trim()
                      : _restNameCtrl.text.trim(),
                  ownerName: _nameCtrl.text.trim(),
                  phone: _phoneCtrl.text.trim(),
                  email: _idCtrl.text.trim(),
                  address: _restAddrCtrl.text.trim().isEmpty
                      ? '${_areaCtrl.text.trim()}, Dhaka'
                      : _restAddrCtrl.text.trim(),
                  area: _areaCtrl.text.trim(),
                  city: 'Dhaka',
                  lat: 23.7465,
                  lng: 90.376,
                  restaurantType: 'restaurant',
                  openingHours: '9:00 AM - 10:00 PM',
                )
              : null;
          await widget.auth.signUpWithFirebaseEmail(
            name: _nameCtrl.text.trim(),
            email: _idCtrl.text.trim(),
            password: _pwCtrl.text,
            area: _areaCtrl.text.trim(),
            phone: _phoneCtrl.text.trim(),
            organizationName: _orgCtrl.text.trim().isEmpty
                ? null
                : _orgCtrl.text.trim(),
            restaurant: rest,
          );
          setState(() => _info =
              'Account created! Check your inbox for the Firebase verification link, then tap Check Verification.');
        } else {
          await widget.auth.registerExpress({
            'name': _nameCtrl.text.trim(),
            'identifier': _idCtrl.text.trim(),
            'password': _pwCtrl.text,
            'role': _isRestaurantOwner ? 'donor' : 'recipient',
            'area': _areaCtrl.text.trim(),
            'phone': _phoneCtrl.text.trim(),
            if (_orgCtrl.text.trim().isNotEmpty)
              'organizationName': _orgCtrl.text.trim(),
            if (_isRestaurantOwner)
              'businessName': _restNameCtrl.text.trim().isEmpty
                  ? _nameCtrl.text.trim()
                  : _restNameCtrl.text.trim(),
            if (_isRestaurantOwner) 'address': _restAddrCtrl.text.trim(),
          });
          widget.onSuccess?.call();
        }
      } else {
        if (_otpCtrl.text.trim().isEmpty) {
          final hint =
              await ApiService.instance.forgotPassword(_idCtrl.text.trim());
          setState(() => _info =
              'Reset code sent${hint.isNotEmpty ? ' (Dev hint: $hint)' : ''}. Enter code & new password.');
        } else {
          await ApiService.instance.resetPassword(
              _idCtrl.text.trim(), _otpCtrl.text.trim(), _pwCtrl.text);
          setState(() {
            _mode = 'login';
            _info = 'Password updated. You can now sign in.';
          });
        }
      }
    } catch (e) {
      setState(() => _error = formatAuthError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.i18n.t;
    final needsVerify =
        widget.auth.isFirebaseSession && !widget.auth.isFirebaseVerified;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    radius: 22,
                    backgroundColor: widget.tokens.primary,
                    child: const Icon(Icons.eco_rounded, color: Colors.white),
                  ),
                  const SizedBox(width: 12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(t('app.name'),
                          style: const TextStyle(
                              fontSize: 20, fontWeight: FontWeight.w800)),
                      Text(t('app.tagline'),
                          style: TextStyle(
                              fontSize: 12, color: widget.tokens.textMuted)),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 18),
              if (needsVerify) ...[
                Card(
                  color: widget.tokens.soft,
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      children: [
                        const Text(
                          'Email Verification Pending',
                          style: TextStyle(
                              fontWeight: FontWeight.w800, fontSize: 16),
                        ),
                        const SizedBox(height: 6),
                        Text(
                            'Please click the verification link sent to ${widget.auth.firebaseUser?.email ?? 'your email'}.'),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Expanded(
                              child: FilledButton(
                                onPressed: () async {
                                  final ok =
                                      await widget.auth.refreshVerification();
                                  if (ok) widget.onSuccess?.call();
                                },
                                child: const Text('I Verified — Continue'),
                              ),
                            ),
                            const SizedBox(width: 8),
                            TextButton(
                              onPressed: () => widget.auth.logout(),
                              child: const Text('Sign Out'),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
              ],
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      SegmentedButton<String>(
                        segments: const [
                          ButtonSegment(value: 'login', label: Text('Sign In')),
                          ButtonSegment(
                              value: 'signup', label: Text('Create Account')),
                          ButtonSegment(value: 'forgot', label: Text('Reset')),
                        ],
                        selected: {_mode},
                        onSelectionChanged: (s) => setState(() {
                          _mode = s.first;
                          _error = null;
                          _info = null;
                        }),
                      ),
                      const SizedBox(height: 14),
                      if (_error != null)
                        Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: Colors.red.shade50,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(_error!,
                              style: TextStyle(color: Colors.red.shade800)),
                        ),
                      if (_info != null)
                        Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: widget.tokens.soft,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(_info!),
                        ),
                      if (_mode != 'forgot') ...[
                        OutlinedButton.icon(
                          onPressed: _busy
                              ? null
                              : () async {
                                  setState(() {
                                    _busy = true;
                                    _error = null;
                                  });
                                  try {
                                    await widget.auth.signInWithGoogle();
                                    widget.onSuccess?.call();
                                  } catch (e) {
                                    setState(() => _error = formatAuthError(e));
                                  } finally {
                                    if (mounted) setState(() => _busy = false);
                                  }
                                },
                          icon: const Icon(Icons.g_mobiledata_rounded, size: 26),
                          label: Text(t('auth.googleBtn')),
                        ),
                        const SizedBox(height: 12),
                      ],
                      if (_mode == 'signup') ...[
                        TextField(
                          controller: _nameCtrl,
                          decoration:
                              const InputDecoration(labelText: 'Full Name'),
                        ),
                        const SizedBox(height: 10),
                      ],
                      TextField(
                        controller: _idCtrl,
                        decoration: InputDecoration(
                          labelText: _useFirebaseEmail
                              ? 'Email address'
                              : 'Email or phone',
                        ),
                      ),
                      const SizedBox(height: 10),
                      if (_mode == 'forgot' && _info != null) ...[
                        TextField(
                          controller: _otpCtrl,
                          decoration: const InputDecoration(labelText: 'OTP Code'),
                        ),
                        const SizedBox(height: 10),
                      ],
                      if (_mode != 'forgot' || _info != null) ...[
                        TextField(
                          controller: _pwCtrl,
                          obscureText: true,
                          decoration: InputDecoration(
                            labelText: _mode == 'forgot'
                                ? 'New Password'
                                : 'Password',
                          ),
                        ),
                        const SizedBox(height: 10),
                      ],
                      if (_mode == 'signup') ...[
                        TextField(
                          controller: _areaCtrl,
                          decoration:
                              const InputDecoration(labelText: 'Dhaka Area'),
                        ),
                        const SizedBox(height: 10),
                        TextField(
                          controller: _phoneCtrl,
                          decoration: const InputDecoration(
                              labelText: 'Phone (optional)'),
                        ),
                        const SizedBox(height: 10),
                        TextField(
                          controller: _orgCtrl,
                          decoration: const InputDecoration(
                              labelText: 'NGO / Shelter / Org (optional)'),
                        ),
                        SwitchListTile(
                          value: _isRestaurantOwner,
                          onChanged: (v) =>
                              setState(() => _isRestaurantOwner = v),
                          title: const Text('Register as Restaurant / Kitchen'),
                        ),
                        if (_isRestaurantOwner) ...[
                          TextField(
                            controller: _restNameCtrl,
                            decoration: const InputDecoration(
                                labelText: 'Restaurant / Kitchen Name'),
                          ),
                          const SizedBox(height: 8),
                          TextField(
                            controller: _restAddrCtrl,
                            decoration: const InputDecoration(
                                labelText: 'Street Address'),
                          ),
                          const SizedBox(height: 10),
                        ],
                      ],
                      if (_mode != 'forgot')
                        SwitchListTile(
                          value: _useFirebaseEmail,
                          onChanged: (v) =>
                              setState(() => _useFirebaseEmail = v),
                          title: const Text('Use Firebase Account'),
                          subtitle: const Text(
                              'Off = Express server username/phone login'),
                        ),
                      const SizedBox(height: 8),
                      FilledButton(
                        onPressed: _busy ? null : _handleSubmit,
                        child: Text(_busy
                            ? 'Please wait...'
                            : _mode == 'login'
                                ? 'Sign In'
                                : _mode == 'signup'
                                    ? 'Create Account'
                                    : (_info == null
                                        ? 'Send Reset Code'
                                        : 'Update Password')),
                      ),
                    ],
                  ),
                ),
              ),
              if (_demoAccounts.isNotEmpty) ...[
                const SizedBox(height: 18),
                Text(t('auth.demoHeading'),
                    style: const TextStyle(fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _demoAccounts.map((acc) {
                    return ActionChip(
                      avatar: const Icon(Icons.person_outline, size: 17),
                      label: Text('${acc['name']} (${acc['role']})'),
                      onPressed: _busy
                          ? null
                          : () async {
                              setState(() => _busy = true);
                              try {
                                await widget.auth
                                    .demoLogin(acc['id'].toString());
                                widget.onSuccess?.call();
                              } finally {
                                if (mounted) setState(() => _busy = false);
                              }
                            },
                    );
                  }).toList(),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class ProfileSettingsScreen extends StatefulWidget {
  final AuthProvider auth;
  final I18nProvider i18n;
  final ThemeProvider theme;
  final VoidCallback onRequestLogin;

  const ProfileSettingsScreen({
    super.key,
    required this.auth,
    required this.i18n,
    required this.theme,
    required this.onRequestLogin,
  });

  @override
  State<ProfileSettingsScreen> createState() => _ProfileSettingsScreenState();
}

class _ProfileSettingsScreenState extends State<ProfileSettingsScreen> {
  late final TextEditingController _nameCtrl;
  late final TextEditingController _areaCtrl;
  late final TextEditingController _orgCtrl;
  late double _radiusKm;
  bool _discoverable = true;
  bool _saving = false;
  bool _repairing = false;
  EnsureAccountReport? _repairReport;
  List<BlockedUserEntry> _blockedUsers = [];
  StreamSubscription? _blockedSub;

  @override
  void initState() {
    super.initState();
    final u = widget.auth.user;
    _nameCtrl = TextEditingController(text: u?.name ?? '');
    _areaCtrl = TextEditingController(text: u?.area ?? 'Dhanmondi');
    _orgCtrl = TextEditingController(text: u?.organizationName ?? '');
    _radiusKm = (u?.savedRadiusKm ?? 10).clamp(1, 25);
    _discoverable = u?.discoverable ?? true;
    if (u != null &&
        widget.auth.isFirebaseSession &&
        widget.auth.isFirebaseVerified) {
      _blockedSub = MessengerService.instance
          .watchMyBlockedUsers(u.id)
          .listen((items) {
        if (mounted) setState(() => _blockedUsers = items);
      }, onError: (_) {});
    }
  }

  @override
  void dispose() {
    _blockedSub?.cancel();
    _nameCtrl.dispose();
    _areaCtrl.dispose();
    _orgCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final u = widget.auth.user;
    if (u == null) return;
    setState(() => _saving = true);
    try {
      final patch = {
        'name': _nameCtrl.text.trim(),
        'displayName': _nameCtrl.text.trim(),
        'area': _areaCtrl.text.trim(),
        'organizationName': _orgCtrl.text.trim(),
        'savedRadiusKm': _radiusKm,
        'discoverable': _discoverable,
        'language': widget.i18n.lang,
      };
      if (widget.auth.isFirebaseSession && widget.auth.isFirebaseVerified) {
        await FirestoreService.instance.updateUserProfile(u.id, patch);
        await MessengerService.instance
            .updateMyDiscoverableSetting(u.id, _discoverable)
            .catchError((_) {});
      } else {
        final updated = await ApiService.instance.updateProfile(patch);
        widget.auth.updateUser(updated);
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profile & preferences saved.')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _openResubmitDialog(AppUser u) {
    final rest = u.restaurant;
    final restNameCtrl = TextEditingController(text: rest?.restaurantName ?? '');
    final ownerNameCtrl = TextEditingController(text: rest?.ownerName ?? u.name);
    final phoneCtrl = TextEditingController(text: rest?.phone ?? u.phone);
    final addrCtrl = TextEditingController(text: rest?.address ?? '');
    final areaCtrl = TextEditingController(text: rest?.area ?? u.area);
    final noteCtrl = TextEditingController();
    bool busy = false;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDlg) => AlertDialog(
          title: const Text('Resubmit Restaurant Application'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: restNameCtrl,
                  decoration: const InputDecoration(labelText: 'Restaurant Name'),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: ownerNameCtrl,
                  decoration: const InputDecoration(labelText: 'Owner Name'),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: phoneCtrl,
                  decoration: const InputDecoration(labelText: 'Phone'),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: areaCtrl,
                  decoration: const InputDecoration(labelText: 'Area'),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: addrCtrl,
                  decoration: const InputDecoration(labelText: 'Street Address'),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: noteCtrl,
                  maxLines: 2,
                  decoration: const InputDecoration(
                      labelText: 'Note for Admin Reviewer (optional)'),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: busy ? null : () => Navigator.pop(ctx),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: busy
                  ? null
                  : () async {
                      final fbUser = widget.auth.firebaseUser;
                      if (fbUser == null || rest == null) return;
                      setDlg(() => busy = true);
                      try {
                        final updatedRest = RestaurantInfo(
                          restaurantName: restNameCtrl.text.trim(),
                          ownerName: ownerNameCtrl.text.trim(),
                          phone: phoneCtrl.text.trim(),
                          email: rest.email,
                          address: addrCtrl.text.trim(),
                          area: areaCtrl.text.trim(),
                          city: rest.city,
                          lat: rest.lat,
                          lng: rest.lng,
                          restaurantType: rest.restaurantType,
                          tradeLicenseNumber: rest.tradeLicenseNumber,
                          restaurantPhotoUrl: rest.restaurantPhotoUrl,
                          licensePhotoUrl: rest.licensePhotoUrl,
                          openingHours: rest.openingHours,
                          approxDailySurplus: rest.approxDailySurplus,
                          acceptedSafetyTerms: true,
                          verificationStatus:
                              RestaurantVerificationStatus.pending,
                        );
                        final updatedUser = await FirestoreService.instance
                            .submitRestaurantOwnerResubmission(
                          fbUser,
                          updatedRest,
                          noteCtrl.text.trim().isNotEmpty
                              ? noteCtrl.text.trim()
                              : 'Updated restaurant verification application submitted for review.',
                        );
                        widget.auth.updateUser(updatedUser);
                        if (ctx.mounted) Navigator.pop(ctx);
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                                content:
                                    Text('Application resubmitted for review.')),
                          );
                        }
                      } catch (e) {
                        setDlg(() => busy = false);
                        if (ctx.mounted) {
                          ScaffoldMessenger.of(ctx).showSnackBar(
                            SnackBar(content: Text(e.toString())),
                          );
                        }
                      }
                    },
              child: Text(busy ? 'Submitting...' : 'Submit'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final u = widget.auth.user;
    final tokens = widget.theme.tokens;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Appearance & Language',
                    style:
                        TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                SwitchListTile(
                  value: widget.theme.isDark,
                  onChanged: (v) => widget.theme.toggleDarkMode(v),
                  title: const Text('Dark Mode'),
                ),
                SwitchListTile(
                  value: widget.i18n.isBn,
                  onChanged: (v) => widget.i18n.setLanguage(v ? 'bn' : 'en'),
                  title: const Text('বাংলা (Bangla Interface)'),
                ),
                const SizedBox(height: 8),
                const Text('Color Theme Palette',
                    style: TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: kPalettePresets.map((p) {
                    final selected = widget.theme.paletteId == p.id;
                    return ChoiceChip(
                      avatar: CircleAvatar(backgroundColor: p.swatch, radius: 8),
                      label: Text(p.label),
                      selected: selected,
                      onSelected: (_) => widget.theme.setPalette(p.id),
                    );
                  }).toList(),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        if (u == null)
          Card(
            child: ListTile(
              title: const Text('Sign in to edit your profile'),
              trailing: FilledButton(
                onPressed: widget.onRequestLogin,
                child: const Text('Sign In'),
              ),
            ),
          )
        else ...[
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${u.name} (${u.role.name.toUpperCase()})',
                      style: const TextStyle(
                          fontSize: 17, fontWeight: FontWeight.w800)),
                  Text(
                    u.handle ?? u.email,
                    style: TextStyle(
                        color: tokens.primary, fontWeight: FontWeight.w700),
                  ),
                  if (u.handle != null && u.email.isNotEmpty)
                    Text(u.email, style: TextStyle(color: tokens.textMuted)),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _nameCtrl,
                    decoration: const InputDecoration(labelText: 'Display Name'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _areaCtrl,
                    decoration: const InputDecoration(labelText: 'Dhaka Area'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _orgCtrl,
                    decoration:
                        const InputDecoration(labelText: 'Organization / NGO'),
                  ),
                  const SizedBox(height: 12),
                  Text('Default Search Radius: ${_radiusKm.round()} km'),
                  Slider(
                    value: _radiusKm,
                    min: 1,
                    max: 25,
                    divisions: 24,
                    onChanged: (v) => setState(() => _radiusKm = v),
                  ),
                  SwitchListTile(
                    value: _discoverable,
                    onChanged: (v) => setState(() => _discoverable = v),
                    title: Text(widget.i18n.t('profile.discoverable')),
                    subtitle: Text(widget.i18n.t('profile.discoverableDesc')),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: FilledButton(
                          onPressed: _saving ? null : _save,
                          child: Text(_saving ? 'Saving...' : 'Save Profile'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      OutlinedButton.icon(
                        onPressed: () => widget.auth.logout(),
                        icon: const Icon(Icons.logout_rounded),
                        label: Text(widget.i18n.t('nav.logout')),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          if (u.accountType == AccountType.restaurantOwner &&
              widget.auth.isFirebaseSession &&
              widget.auth.isFirebaseVerified &&
              u.restaurant != null) ...[
            const SizedBox(height: 14),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            u.restaurant!.restaurantName,
                            style: const TextStyle(
                                fontSize: 16, fontWeight: FontWeight.w800),
                          ),
                        ),
                        Chip(
                          label: Text(
                            u.restaurant!.verificationStatus.name.toUpperCase(),
                            style: const TextStyle(fontSize: 11),
                          ),
                        ),
                      ],
                    ),
                    if (u.restaurant!.verificationStatus ==
                            RestaurantVerificationStatus.rejected &&
                        u.restaurant!.rejectionReason != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 6, bottom: 8),
                        child: Text(
                          'Reason: ${u.restaurant!.rejectionReason}',
                          style: TextStyle(color: Colors.red.shade700),
                        ),
                      ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        FilledButton.tonalIcon(
                          onPressed: () => showAdminSupportChatSheet(
                            context,
                            auth: widget.auth,
                            i18n: widget.i18n,
                            tokens: tokens,
                            ownerUid: u.id,
                            ownerName: u.restaurant!.ownerName,
                            restaurantName: u.restaurant!.restaurantName,
                            restaurantLogoUrl:
                                u.restaurant!.restaurantPhotoUrl,
                            verificationStatus:
                                u.restaurant!.verificationStatus,
                          ),
                          icon: const Icon(Icons.support_agent_rounded),
                          label: Text(widget.i18n.t('chat.adminSupport')),
                        ),
                        if (u.restaurant!.verificationStatus ==
                            RestaurantVerificationStatus.rejected)
                          OutlinedButton.icon(
                            onPressed: () => _openResubmitDialog(u),
                            icon: const Icon(Icons.refresh_rounded),
                            label: const Text('Resubmit Application'),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
          if (widget.auth.isFirebaseSession &&
              widget.auth.isFirebaseVerified) ...[
            const SizedBox(height: 14),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.build_circle_outlined,
                            color: tokens.primary),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            widget.i18n.t('repair.title'),
                            style: const TextStyle(
                                fontSize: 16, fontWeight: FontWeight.w800),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      widget.i18n.t('repair.subtitle'),
                      style: TextStyle(fontSize: 12, color: tokens.textMuted),
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        FilledButton.icon(
                          onPressed: _repairing
                              ? null
                              : () async {
                                  setState(() => _repairing = true);
                                  final report = await widget.auth
                                      .runEnsureAccount(force: true);
                                  if (!mounted) return;
                                  setState(() {
                                    _repairing = false;
                                    _repairReport = report ??
                                        widget.auth.lastEnsureReport;
                                  });
                                },
                          icon: _repairing
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Icon(Icons.auto_fix_high_rounded,
                                  size: 18),
                          label: Text(_repairing
                              ? widget.i18n.t('repair.running')
                              : widget.i18n.t('repair.button')),
                        ),
                        OutlinedButton.icon(
                          onPressed: () => showHealthCheckSheet(
                            context,
                            auth: widget.auth,
                            i18n: widget.i18n,
                            tokens: tokens,
                            mode: widget.auth.isAdmin ? 'admin' : 'user',
                          ),
                          icon: const Icon(Icons.health_and_safety_outlined,
                              size: 18),
                          label: Text(widget.i18n.t('health.runBtn')),
                        ),
                      ],
                    ),
                    if ((_repairReport ?? widget.auth.lastEnsureReport) !=
                        null) ...[
                      const SizedBox(height: 12),
                      ...(_repairReport ?? widget.auth.lastEnsureReport)!
                          .steps
                          .map((step) {
                        final isErr = step.status == 'error';
                        final isFixed = step.status == 'fixed';
                        final color = isErr
                            ? Colors.red.shade700
                            : isFixed
                                ? Colors.blue.shade700
                                : const Color(0xFF16A34A);
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(
                                isErr
                                    ? Icons.error_outline_rounded
                                    : isFixed
                                        ? Icons.auto_fix_high_rounded
                                        : Icons.check_circle_outline_rounded,
                                size: 17,
                                color: color,
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  '${widget.i18n.isBn ? step.labelBn : step.label}: '
                                  '${widget.i18n.isBn ? step.detailBn : step.detail}',
                                  style: const TextStyle(fontSize: 12),
                                ),
                              ),
                            ],
                          ),
                        );
                      }),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(widget.i18n.t('profile.blockedUsers'),
                        style: const TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 8),
                    if (_blockedUsers.isEmpty)
                      Text(widget.i18n.t('profile.noBlocked'),
                          style: TextStyle(color: tokens.textMuted))
                    else
                      ..._blockedUsers.map(
                        (b) => ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(b.name,
                              style:
                                  const TextStyle(fontWeight: FontWeight.w700)),
                          subtitle:
                              b.handle != null ? Text(b.handle!) : null,
                          trailing: OutlinedButton(
                            onPressed: () => MessengerService.instance
                                .unblockUserInFirestore(u.id, b.uid),
                            child: Text(widget.i18n.t('chat.unblock')),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ],
        ],
      ],
    );
  }
}

class AdminApplicationsScreen extends StatefulWidget {
  final AuthProvider auth;
  final I18nProvider i18n;
  final PaletteTokens tokens;

  const AdminApplicationsScreen({
    super.key,
    required this.auth,
    required this.i18n,
    required this.tokens,
  });

  @override
  State<AdminApplicationsScreen> createState() =>
      _AdminApplicationsScreenState();
}

class _AdminApplicationsScreenState extends State<AdminApplicationsScreen> {
  List<RestaurantOwnerApplication> _apps = [];
  List<AdminNotificationItem> _alerts = [];
  FirestoreListenerError? _adminError;
  bool _seeding = false;
  DemoSeedProgress? _seedProgress;
  DemoSeedSummary? _seedSummary;
  DemoRemoveResult? _removeResult;
  StreamSubscription? _appsSub;
  StreamSubscription? _alertsSub;

  @override
  void initState() {
    super.initState();
    _subscribeAdminStreams();
  }

  void _subscribeAdminStreams() {
    _appsSub?.cancel();
    _alertsSub?.cancel();
    if (widget.auth.isAdmin && widget.auth.isFirebaseSession) {
      setState(() => _adminError = null);
      _appsSub = FirestoreService.instance
          .watchRestaurantApplications()
          .listen(
        (list) {
          if (mounted) {
            setState(() {
              _apps = list;
              _adminError = null;
            });
          }
        },
        onError: (e) {
          final parsed = parseFirestoreListenerError(e, 'LIST', 'users');
          if (mounted) setState(() => _adminError = parsed);
        },
      );
      _alertsSub = FirestoreService.instance.watchAdminNotifications().listen(
        (list) {
          if (mounted) setState(() => _alerts = list);
        },
        onError: (e) {
          final parsed =
              parseFirestoreListenerError(e, 'LIST', 'adminNotifications');
          if (mounted) setState(() => _adminError ??= parsed);
        },
      );
    }
  }

  Future<void> _runSeedDemo() async {
    final adminUid = widget.auth.user?.id;
    if (adminUid == null || _seeding) return;
    setState(() {
      _seeding = true;
      _seedSummary = null;
      _removeResult = null;
      _seedProgress = const DemoSeedProgress(
        step: 'Starting demo seed...',
        current: 0,
        total: 1,
      );
    });
    try {
      final summary = await CommunityRoomsService.instance.seedAllDemoData(
        adminUid,
        onProgress: (p) {
          if (mounted) setState(() => _seedProgress = p);
        },
      );
      if (mounted) {
        setState(() {
          _seedSummary = summary;
          _seeding = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _seeding = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Seed error: $e')),
        );
      }
    }
  }

  Future<void> _runCleanDemo() async {
    if (_seeding) return;
    setState(() {
      _seeding = true;
      _seedSummary = null;
      _removeResult = null;
      _seedProgress = const DemoSeedProgress(
        step: 'Removing seeded demo data...',
        current: 0,
        total: 4,
      );
    });
    try {
      final result = await CommunityRoomsService.instance.removeAllDemoData(
        onProgress: (p) {
          if (mounted) setState(() => _seedProgress = p);
        },
      );
      if (mounted) {
        setState(() {
          _removeResult = result;
          _seeding = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _seeding = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Cleanup error: $e')),
        );
      }
    }
  }

  @override
  void dispose() {
    _appsSub?.cancel();
    _alertsSub?.cancel();
    super.dispose();
  }

  void _promptReject(RestaurantOwnerApplication app) {
    final reasonCtrl = TextEditingController(
      text: 'Please upload clearer trade license or storefront details.',
    );
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Reject ${app.restaurant.restaurantName}'),
        content: TextField(
          controller: reasonCtrl,
          maxLines: 3,
          decoration: const InputDecoration(labelText: 'Rejection reason'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () async {
              Navigator.pop(ctx);
              await FirestoreService.instance.reviewRestaurantApplication(
                ownerUid: app.uid,
                adminUid: widget.auth.user!.id,
                decision: 'rejected',
                rejectionReason: reasonCtrl.text.trim(),
                restaurantName: app.restaurant.restaurantName,
                ownerName: app.restaurant.ownerName,
                restaurantLogoUrl: app.restaurant.restaurantPhotoUrl,
              );
            },
            child: const Text('Confirm Reject'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.auth.isAdmin) {
      return const Center(
        child: Text('Admin access required to review restaurant applications.'),
      );
    }

    final t = widget.i18n.t;
    final progress = _seedProgress;
    final ratio = (progress != null && progress.total > 0)
        ? (progress.current / progress.total).clamp(0.0, 1.0)
        : 0.0;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (_adminError != null)
          FirestoreErrorBanner(
            error: _adminError!,
            i18n: widget.i18n,
            tokens: widget.tokens,
            onRetry: _subscribeAdminStreams,
            onRunHealthCheck: () => showHealthCheckSheet(
              context,
              auth: widget.auth,
              i18n: widget.i18n,
              tokens: widget.tokens,
              mode: 'admin',
            ),
          ),
        Card(
          margin: const EdgeInsets.only(bottom: 16),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.dataset_linked_rounded,
                        color: widget.tokens.primary),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        t('admin.seedTitle'),
                        style: const TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w800),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  t('admin.seedDesc'),
                  style: TextStyle(fontSize: 12, color: widget.tokens.textMuted),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    FilledButton.icon(
                      onPressed: _seeding ? null : _runSeedDemo,
                      icon: const Icon(Icons.cloud_upload_outlined, size: 18),
                      label: Text(_seeding
                          ? t('admin.seeding')
                          : t('admin.seedBtn')),
                    ),
                    OutlinedButton.icon(
                      onPressed: _seeding ? null : _runCleanDemo,
                      icon: const Icon(Icons.cleaning_services_outlined,
                          size: 18),
                      label: Text(t('admin.cleanBtn')),
                    ),
                    FilledButton.tonalIcon(
                      onPressed: () => showHealthCheckSheet(
                        context,
                        auth: widget.auth,
                        i18n: widget.i18n,
                        tokens: widget.tokens,
                        mode: 'admin',
                      ),
                      icon: const Icon(Icons.health_and_safety_outlined,
                          size: 18),
                      label: Text(t('admin.healthBtn')),
                    ),
                  ],
                ),
                if (progress != null && _seeding) ...[
                  const SizedBox(height: 12),
                  LinearProgressIndicator(value: ratio),
                  const SizedBox(height: 6),
                  Text(
                    '${progress.step} (${progress.current}/${progress.total})',
                    style: const TextStyle(fontSize: 12),
                  ),
                ],
                if (_seedSummary != null) ...[
                  const SizedBox(height: 12),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: widget.tokens.soft,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Personas: ${_seedSummary!.personasCreated} created, '
                          '${_seedSummary!.personasUpdated} updated '
                          '(verified in DB: ${_seedSummary!.verifiedPersonasCount})',
                          style: const TextStyle(
                              fontSize: 12, fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          'Rooms: ${_seedSummary!.roomsCreated} created, '
                          '${_seedSummary!.roomsUpdated} updated '
                          '(verified in DB: ${_seedSummary!.verifiedRoomsCount})',
                          style: const TextStyle(fontSize: 12),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          'Messages: ${_seedSummary!.messagesCreated} created, '
                          '${_seedSummary!.messagesAlreadyExisted} existed '
                          '(verified in DB: ${_seedSummary!.verifiedMessagesCount})',
                          style: const TextStyle(fontSize: 12),
                        ),
                        if (_seedSummary!.errors.isNotEmpty) ...[
                          const SizedBox(height: 6),
                          ..._seedSummary!.errors.map((err) => Text(
                                'Error [${err.step}] (${err.code}): ${err.message}',
                                style: TextStyle(
                                    fontSize: 11, color: Colors.red.shade800),
                              )),
                        ],
                      ],
                    ),
                  ),
                ],
                if (_removeResult != null) ...[
                  const SizedBox(height: 10),
                  Text(
                    'Removed ${_removeResult!.deletedPersonas} personas, '
                    '${_removeResult!.deletedMessages} messages, '
                    '${_removeResult!.deletedRooms} rooms.',
                    style: const TextStyle(
                        fontSize: 12, fontWeight: FontWeight.w700),
                  ),
                ],
              ],
            ),
          ),
        ),
        const Text('Restaurant Verification Queue',
            style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800)),
        const SizedBox(height: 10),
        if (_apps.isEmpty)
          const Card(
            child: Padding(
              padding: EdgeInsets.all(20),
              child: Text('No restaurant owner applications found in Firestore.'),
            ),
          )
        else
          ..._apps.map((app) {
            final st = app.restaurant.verificationStatus;
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
                          child: Text(app.restaurant.restaurantName,
                              style: const TextStyle(
                                  fontWeight: FontWeight.w800, fontSize: 16)),
                        ),
                        Chip(label: Text(st.name.toUpperCase())),
                      ],
                    ),
                    Text('${app.restaurant.ownerName} · ${app.restaurant.area}'),
                    Text(app.restaurant.address,
                        style: TextStyle(color: widget.tokens.textMuted)),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        if (st != RestaurantVerificationStatus.approved)
                          FilledButton.icon(
                            onPressed: () => FirestoreService.instance
                                .reviewRestaurantApplication(
                              ownerUid: app.uid,
                              adminUid: widget.auth.user!.id,
                              decision: 'approved',
                              restaurantName: app.restaurant.restaurantName,
                              ownerName: app.restaurant.ownerName,
                              restaurantLogoUrl:
                                  app.restaurant.restaurantPhotoUrl,
                            ),
                            icon: const Icon(Icons.check_rounded),
                            label: const Text('Approve'),
                          ),
                        if (st != RestaurantVerificationStatus.approved)
                          OutlinedButton.icon(
                            onPressed: () => _promptReject(app),
                            icon: const Icon(Icons.close_rounded),
                            label: const Text('Reject'),
                          ),
                        OutlinedButton.icon(
                          onPressed: () => showAdminSupportChatSheet(
                            context,
                            auth: widget.auth,
                            i18n: widget.i18n,
                            tokens: widget.tokens,
                            ownerUid: app.uid,
                            ownerName: app.restaurant.ownerName,
                            restaurantName: app.restaurant.restaurantName,
                            restaurantLogoUrl:
                                app.restaurant.restaurantPhotoUrl,
                            verificationStatus: st,
                          ),
                          icon: const Icon(Icons.chat_bubble_outline_rounded),
                          label: const Text('Support Chat'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          }),
        if (_alerts.isNotEmpty) ...[
          const SizedBox(height: 16),
          const Text('Admin Notifications',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          ..._alerts.map((n) => Card(
                child: ListTile(
                  leading: Icon(
                    n.read
                        ? Icons.notifications_none_rounded
                        : Icons.notifications_active_rounded,
                    color: widget.tokens.primary,
                  ),
                  title: Text('${n.restaurantName} (${n.ownerName})'),
                  subtitle: Text(n.messagePreview ?? n.type),
                  trailing: IconButton(
                    icon: const Icon(Icons.chat_outlined),
                    onPressed: () {
                      FirestoreService.instance
                          .markAdminNotificationRead(n.id);
                      showAdminSupportChatSheet(
                        context,
                        auth: widget.auth,
                        i18n: widget.i18n,
                        tokens: widget.tokens,
                        ownerUid: n.ownerUid,
                        ownerName: n.ownerName,
                        restaurantName: n.restaurantName,
                      );
                    },
                  ),
                  onTap: () =>
                      FirestoreService.instance.markAdminNotificationRead(n.id),
                ),
              )),
        ],
      ],
    );
  }
}
