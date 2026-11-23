import 'dart:async';
import 'package:flutter/material.dart';
import '../i18n/i18n_provider.dart';
import '../models/models.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../services/firestore_service.dart';
import '../theme/palettes.dart';

class DonateScreen extends StatefulWidget {
  final AuthProvider auth;
  final I18nProvider i18n;
  final PaletteTokens tokens;
  final VoidCallback onRequestLogin;

  const DonateScreen({
    super.key,
    required this.auth,
    required this.i18n,
    required this.tokens,
    required this.onRequestLogin,
  });

  @override
  State<DonateScreen> createState() => _DonateScreenState();
}

class _DonateScreenState extends State<DonateScreen> {
  DonationSummary? _summary;
  List<DonationRecord> _expressDonations = [];
  List<DonationRecord> _fbDonations = [];
  StreamSubscription? _fbDonSub;
  int _amountBdt = 500;
  final TextEditingController _customCtrl = TextEditingController();
  final TextEditingController _honorCtrl = TextEditingController();
  DonationFrequency _frequency = DonationFrequency.oneTime;
  DonationCause _cause = DonationCause.general;
  PaymentMethodId _method = PaymentMethodId.bkash;
  bool _isAnonymous = false;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _load();
    if (widget.auth.isFirebaseSession &&
        widget.auth.isFirebaseVerified &&
        widget.auth.user != null) {
      _fbDonSub = FirestoreService.instance
          .watchMyDonations(widget.auth.user!.id)
          .listen((items) {
        if (mounted) setState(() => _fbDonations = items);
      }, onError: (_) {});
    }
  }

  @override
  void dispose() {
    _fbDonSub?.cancel();
    _customCtrl.dispose();
    _honorCtrl.dispose();
    super.dispose();
  }

  List<DonationRecord> get _myDonations {
    final map = <String, DonationRecord>{};
    for (final d in _fbDonations) {
      map[d.id] = d;
    }
    for (final d in _expressDonations) {
      map[d.id] = d;
    }
    return map.values.toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  }

  Future<void> _load() async {
    try {
      final sum = await ApiService.instance.getDonationSummary();
      List<DonationRecord> mine = [];
      if (widget.auth.isLoggedIn) {
        mine = await ApiService.instance.getMyDonations().catchError((_) => <DonationRecord>[]);
      }
      if (mounted) {
        setState(() {
          _summary = sum;
          _expressDonations = mine;
        });
      }
    } catch (_) {}
  }

  Future<void> _submit() async {
    if (!widget.auth.isLoggedIn) {
      widget.onRequestLogin();
      return;
    }
    final customVal = int.tryParse(_customCtrl.text.trim());
    final finalAmount =
        (customVal != null && customVal >= 20) ? customVal : _amountBdt;

    setState(() => _submitting = true);
    try {
      DonationRecord rec;
      final freqStr =
          _frequency == DonationFrequency.monthly ? 'monthly' : 'one_time';
      final causeStr = donationCauseToWire(_cause);
      final methodStr = paymentMethodToWire(_method);
      final honor = _honorCtrl.text.trim();

      if (widget.auth.isFirebaseSession &&
          widget.auth.isFirebaseVerified &&
          widget.auth.user != null) {
        rec = await FirestoreService.instance.createDonation(
          widget.auth.user!,
          amountBdt: finalAmount,
          frequency: freqStr,
          cause: causeStr,
          paymentMethod: methodStr,
          isAnonymous: _isAnonymous,
          honorOf: honor.isNotEmpty ? honor : null,
        );
      } else {
        rec = await ApiService.instance.submitDonation({
          'amountBdt': finalAmount,
          'frequency': freqStr,
          'cause': causeStr,
          'paymentMethod': methodStr,
          'isAnonymous': _isAnonymous,
          if (honor.isNotEmpty) 'honorOf': honor,
        });
      }
      if (mounted) {
        _customCtrl.clear();
        _honorCtrl.clear();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content:
                  Text('Thank you! Receipt ${rec.receiptCode} confirmed.')),
        );
        _load();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = _summary;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (s != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Community Meal & Logistics Fund',
                        style: TextStyle(
                            fontSize: 18, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 8),
                    LinearProgressIndicator(
                      value: (s.raisedBdt / s.goalBdt).clamp(0.0, 1.0),
                      minHeight: 9,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    const SizedBox(height: 8),
                    Text(
                        '৳${s.raisedBdt} raised of ৳${s.goalBdt} · ${s.monthlySupportersCount} monthly supporters'),
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
                  const Text('Support Rizik',
                      style:
                          TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 10),
                  SegmentedButton<DonationFrequency>(
                    segments: const [
                      ButtonSegment(
                          value: DonationFrequency.oneTime,
                          label: Text('One-time')),
                      ButtonSegment(
                          value: DonationFrequency.monthly,
                          label: Text('Monthly')),
                    ],
                    selected: {_frequency},
                    onSelectionChanged: (v) =>
                        setState(() => _frequency = v.first),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final amt in [100, 300, 500, 1000, 2500, 5000])
                        ChoiceChip(
                          label: Text('৳$amt'),
                          selected:
                              _customCtrl.text.isEmpty && _amountBdt == amt,
                          onSelected: (_) => setState(() {
                            _amountBdt = amt;
                            _customCtrl.clear();
                          }),
                        ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _customCtrl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: 'Or custom amount (BDT, min ৳20)'),
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<DonationCause>(
                    value: _cause,
                    items: const [
                      DropdownMenuItem(
                          value: DonationCause.general,
                          child: Text('General Food Rescue')),
                      DropdownMenuItem(
                          value: DonationCause.events,
                          child: Text('Community Events')),
                      DropdownMenuItem(
                          value: DonationCause.weddingPickup,
                          child: Text('Wedding Rescue Transport')),
                      DropdownMenuItem(
                          value: DonationCause.iftarPacks,
                          child: Text('Iftar / Sehri Packs')),
                      DropdownMenuItem(
                          value: DonationCause.sadaqah,
                          child: Text('Sadaqah Meal Fund')),
                      DropdownMenuItem(
                          value: DonationCause.zakat,
                          child: Text('Zakat Eligible Meals')),
                    ],
                    onChanged: (v) =>
                        setState(() => _cause = v ?? DonationCause.general),
                    decoration: const InputDecoration(labelText: 'Cause'),
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<PaymentMethodId>(
                    value: _method,
                    items: const [
                      DropdownMenuItem(
                          value: PaymentMethodId.bkash, child: Text('bKash')),
                      DropdownMenuItem(
                          value: PaymentMethodId.nagad, child: Text('Nagad')),
                      DropdownMenuItem(
                          value: PaymentMethodId.rocket, child: Text('Rocket')),
                      DropdownMenuItem(
                          value: PaymentMethodId.cardSandbox,
                          child: Text('Card (Visa / Mastercard)')),
                      DropdownMenuItem(
                          value: PaymentMethodId.bankTransfer,
                          child: Text('Bank Transfer')),
                    ],
                    onChanged: (v) =>
                        setState(() => _method = v ?? PaymentMethodId.bkash),
                    decoration:
                        const InputDecoration(labelText: 'Payment Method'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _honorCtrl,
                    decoration: const InputDecoration(
                        labelText: 'In honor / memory of (optional)'),
                  ),
                  CheckboxListTile(
                    value: _isAnonymous,
                    onChanged: (v) => setState(() => _isAnonymous = v ?? false),
                    title: const Text('Donate anonymously'),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: _submitting ? null : _submit,
                      icon: const Icon(Icons.favorite_rounded),
                      label: Text(_submitting ? 'Processing...' : 'Donate Now'),
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (_myDonations.isNotEmpty) ...[
            const SizedBox(height: 16),
            const Text('My Receipts',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            ..._myDonations.map((d) => Card(
                  child: ListTile(
                    leading: const Icon(Icons.receipt_long_rounded),
                    title: Text('৳${d.amountBdt} · ${d.cause.name}'),
                    subtitle: Text(
                        '${d.receiptCode} · ${d.paymentMethod.name.toUpperCase()}'),
                  ),
                )),
          ],
        ],
      ),
    );
  }
}
