import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileText,
  Handshake,
  Heart,
  HeartHandshake,
  Lock,
  LogIn,
  Mail,
  Share2,
  Smartphone,
  CreditCard,
  Landmark,
  Users,
  Utensils,
} from 'lucide-react';
import type {
  CommunityEvent,
  DonationCause,
  DonationFrequency,
  DonationRecord,
  DonationSummary,
  PaymentMethodId,
  User,
} from '../types';
import type { DonateDraft, PendingAuthAction } from '../auth/AuthContext';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import {
  createFirestoreDonation,
  subscribeMyFirestoreDonations,
} from '../lib/firestoreService';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeContext';
import { getImageAlt, IMAGES } from '../data/images';
import { FoodImage } from './FoodImage';

interface DonateMoneyViewProps {
  user: User | null;
  preselectedCause?: DonationCause;
  preselectedEventId?: string | null;
  restoredDraft?: DonateDraft | null;
  onConsumeDraft?: () => void;
  onNavigateEvents: () => void;
  onNavigateWedding: () => void;
  onNavigateClients: () => void;
  onRequireLogin: (action: PendingAuthAction, onAllowed?: () => void) => boolean;
  onLoginClick: () => void;
}

const QUICK_AMOUNTS = [100, 500, 1000, 5000];
const BASE_CAUSES: DonationCause[] = [
  'general',
  'events',
  'wedding_pickup',
  'iftar_packs',
  'sadaqah',
  'zakat',
  'platform',
];
const RAMADAN_FIRST_CAUSES: DonationCause[] = [
  'iftar_packs',
  'sadaqah',
  'zakat',
  'general',
  'events',
  'wedding_pickup',
  'platform',
];
const METHODS: { id: PaymentMethodId; icon: typeof Smartphone }[] = [
  { id: 'bkash', icon: Smartphone },
  { id: 'nagad', icon: Smartphone },
  { id: 'rocket', icon: Smartphone },
  { id: 'card_sandbox', icon: CreditCard },
  { id: 'bank_transfer', icon: Landmark },
];

export function DonateMoneyView({
  user,
  preselectedCause,
  preselectedEventId,
  restoredDraft,
  onConsumeDraft,
  onNavigateEvents,
  onNavigateWedding,
  onNavigateClients,
  onRequireLogin,
  onLoginClick,
}: DonateMoneyViewProps) {
  const { lang, t, formatNumber } = useI18n();
  const { ramadanMode } = useTheme();
  const { firebaseUser, firebaseAuthReady, isFirebaseSession, isFirebaseVerified } = useAuth();
  const orderedCauses = ramadanMode ? RAMADAN_FIRST_CAUSES : BASE_CAUSES;
  const [summary, setSummary] = useState<DonationSummary | null>(null);
  const [myDonations, setMyDonations] = useState<DonationRecord[]>([]);
  const [eventsList, setEventsList] = useState<CommunityEvent[]>([]);

  // Form state (Strictly zero card numbers or PIN fields collected or stored)
  const [frequency, setFrequency] = useState<DonationFrequency>('one_time');
  const [amountBdt, setAmountBdt] = useState<number>(500);
  const [customInput, setCustomInput] = useState<string>('');
  const [cause, setCause] = useState<DonationCause>(preselectedCause ?? 'general');
  const [eventId, setEventId] = useState<string>(preselectedEventId ?? '');
  const [honorOf, setHonorOf] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>('bkash');
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<DonationRecord | null>(null);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [showInquiryNote, setShowInquiryNote] = useState(false);
  const [readyNoticeAmount, setReadyNoticeAmount] = useState<number | null>(null);

  useEffect(() => {
    if (preselectedCause) setCause(preselectedCause);
    if (preselectedEventId) {
      setCause('events');
      setEventId(preselectedEventId);
    }
  }, [preselectedCause, preselectedEventId]);

  useEffect(() => {
    if (!restoredDraft) return;
    setAmountBdt(restoredDraft.amountBdt);
    setCustomInput(restoredDraft.customInput);
    setFrequency(restoredDraft.frequency);
    setCause(restoredDraft.cause);
    setEventId(restoredDraft.eventId);
    setHonorOf(restoredDraft.honorOf);
    setIsAnonymous(restoredDraft.isAnonymous);
    setPaymentMethod(restoredDraft.paymentMethod);
    const eff = restoredDraft.customInput
      ? Math.max(0, Number(restoredDraft.customInput))
      : restoredDraft.amountBdt;
    if (user && eff >= 20) {
      setReadyNoticeAmount(eff);
    }
    onConsumeDraft?.();
  }, [restoredDraft, user, onConsumeDraft]);

  const loadData = useCallback(async () => {
    try {
      const [sumRes, evRes, mineRes] = await Promise.all([
        api.getDonationSummary(),
        api.getEvents({ status: 'all' }),
        user && !isFirebaseSession
          ? api.getMyDonations()
          : Promise.resolve({ donations: [] as DonationRecord[] }),
      ]);
      setSummary(sumRes);
      if (!isFirebaseSession) {
        setMyDonations(mineRes.donations);
      }
      setEventsList(evRes.events.filter((e) => e.status === 'upcoming' || e.status === 'ongoing'));
    } catch {
      // Ignore
    }
  }, [user, isFirebaseSession]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!(isFirebaseVerified && firebaseAuthReady && firebaseUser)) return;
    const unsub = subscribeMyFirestoreDonations(firebaseUser.uid, (items) => {
      setMyDonations(items);
    });
    return () => unsub();
  }, [isFirebaseVerified, firebaseAuthReady, firebaseUser]);

  const effectiveAmount = customInput ? Math.max(0, Number(customInput)) : amountBdt;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (effectiveAmount < 20) return;

    const draft: DonateDraft = {
      amountBdt: effectiveAmount,
      customInput,
      frequency,
      cause,
      eventId,
      honorOf,
      isAnonymous,
      paymentMethod,
    };

    if (!onRequireLogin({ type: 'donate', draft })) {
      return;
    }

    if (!user) return;
    setSubmitting(true);
    setReadyNoticeAmount(null);
    try {
      if (isFirebaseSession) {
        if (!isFirebaseVerified || !firebaseUser) {
          setShareToast(t('settings.unverifiedBanner'));
          return;
        }
        const created = await createFirestoreDonation(user, {
          amountBdt: effectiveAmount,
          frequency,
          cause,
          paymentMethod,
          isAnonymous,
          honorOf: honorOf.trim() || null,
          donorName: user.donorProfile?.businessName || user.name,
        });
        setReceipt(created);
      } else {
        const res = await api.submitDonation({
          amountBdt: effectiveAmount,
          frequency,
          cause,
          eventId: cause === 'events' && eventId ? eventId : null,
          paymentMethod,
          isAnonymous,
          honorOf: honorOf.trim() || null,
          donorName: user.donorProfile?.businessName || user.name,
        });
        setReceipt(res.donation);
        await loadData();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadReceipt = (rec: DonationRecord) => {
    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Receipt ${rec.receiptCode}</title>
<style>body{font-family:system-ui,sans-serif;padding:40px;color:#0f172a;max-width:620px;margin:auto;border:2px solid #15803d;border-radius:16px}h1{color:#15803d;margin-bottom:4px}.row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #e2e8f0}</style></head>
<body><h1>${t('common.appName')}</h1><p>${t('donate.receiptTitle')}</p><hr/>
<div class="row"><span>${t('donate.receiptCodeLabel')}</span><strong>${rec.receiptCode}</strong></div>
<div class="row"><span>${t('donate.receiptDateLabel')}</span><strong>${new Date(rec.createdAt).toLocaleDateString()}</strong></div>
<div class="row"><span>${t('donate.receiptAmountLabel')}</span><strong>BDT ${rec.amountBdt} (${rec.frequency})</strong></div>
<div class="row"><span>${t('donate.receiptMethodLabel')}</span><strong>${rec.paymentMethod}</strong></div>
<div class="row"><span>${t('donate.receiptCauseLabel')}</span><strong>${t(`donate.causes.${rec.cause}`)}</strong></div>
${rec.honorOf ? `<div class="row"><span>${t('donate.receiptHonorLabel')}</span><strong>${rec.honorOf}</strong></div>` : ''}
${rec.cause === 'zakat' ? `<p style="margin-top:16px;font-size:12px;color:#15803d;">${t('ramadan.zakatNote')}</p>` : ''}
</body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${rec.receiptCode}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleShareImpact = async (amt?: number) => {
    const text = amt
      ? t('donate.shareWithAmount', { amount: formatNumber(amt) })
      : t('donate.shareGeneral');
    try {
      if (navigator.share) {
        await navigator.share({ title: t('common.appName'), text, url: window.location.origin });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${text} ${window.location.origin}`);
      }
      setShareToast(t('donate.shareCopied'));
      window.setTimeout(() => setShareToast(null), 3000);
    } catch {
      // Ignore
    }
  };

  const raised = summary?.raisedBdt ?? 179000;
  const goal = summary?.goalBdt ?? 250000;
  const pct = Math.min(100, Math.round((raised / goal) * 100));

  return (
    <div className="space-y-8 pb-6">
      {shareToast && (
        <div className="fixed top-20 inset-x-4 sm:inset-x-auto sm:right-4 sm:max-w-sm z-50 px-4 py-2.5 rounded-xl bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] text-xs font-semibold shadow-lg">
          {shareToast}
        </div>
      )}

      {/* Hero + Live Campaign Goal Progress */}
      <section className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border-subtle)] p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <div className="lg:col-span-7 min-w-0 space-y-4">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--brand-text)]">
            <HeartHandshake className="w-4 h-4 shrink-0" />
            <span>{t('donate.campaignTitle')}</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
            {t('donate.title')}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{t('donate.subtitle')}</p>

          <div className="p-4 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-display text-xl font-extrabold text-[var(--brand-text)] tabular-nums">
                {t('donate.raisedAmount', { amount: formatNumber(raised) })}
              </p>
              <p className="text-xs font-semibold text-[var(--text-muted)] tabular-nums">
                {t('donate.goalAmount', { amount: formatNumber(goal) })} ({formatNumber(pct)}%)
              </p>
            </div>
            <div className="h-3 w-full rounded-full bg-[var(--border-subtle)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--brand-primary)] transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-[var(--text-muted)] tabular-nums">
              {t('donate.supportersMeta', {
                donors: formatNumber(summary?.totalDonationsCount ?? 42),
                monthly: formatNumber(summary?.monthlySupportersCount ?? 15),
              })}
            </p>
          </div>
        </div>

        <div className="lg:col-span-5 min-w-0 aspect-[4/3] rounded-2xl overflow-hidden border border-[var(--border-subtle)]">
          <FoodImage
            src={IMAGES.donateBanner.src}
            alt={getImageAlt(IMAGES.donateBanner, lang)}
            className="w-full h-full object-cover"
          />
        </div>
      </section>

      {/* Main Split: Donation Form / Receipt + Use of Funds & Recent Supporters */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Donation Form or Receipt */}
        <section className="lg:col-span-7 min-w-0 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 sm:p-6 space-y-5">
          {receipt ? (
            <div className="space-y-5 py-2">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[var(--brand-soft)] text-[var(--brand-text)] flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold text-[var(--text-primary)]">
                    {t('donate.receiptTitle')}
                  </h2>
                  <p className="text-xs font-mono text-[var(--brand-text)] font-semibold">
                    {t('donate.receiptCodeLabel')}: {receipt.receiptCode}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/50 divide-y divide-[var(--border-subtle)] text-xs sm:text-sm">
                <div className="px-4 py-3 flex flex-wrap justify-between gap-2">
                  <span className="text-[var(--text-muted)]">{t('donate.receiptAmountLabel')}</span>
                  <span className="font-bold text-[var(--text-primary)] tabular-nums">
                    ৳{formatNumber(receipt.amountBdt)} ·{' '}
                    {receipt.frequency === 'monthly' ? t('donate.monthly') : t('donate.oneTime')}
                  </span>
                </div>
                <div className="px-4 py-3 flex flex-wrap justify-between gap-2">
                  <span className="text-[var(--text-muted)]">{t('donate.receiptMethodLabel')}</span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {t(`donate.methods.${receipt.paymentMethod}`)}
                  </span>
                </div>
                <div className="px-4 py-3 flex flex-wrap justify-between gap-2">
                  <span className="text-[var(--text-muted)]">{t('donate.receiptCauseLabel')}</span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {t(`donate.causes.${receipt.cause}`)}
                  </span>
                </div>
                {receipt.honorOf && (
                  <div className="px-4 py-3 flex flex-wrap justify-between gap-2">
                    <span className="text-[var(--text-muted)]">{t('donate.receiptHonorLabel')}</span>
                    <span className="font-semibold text-[var(--text-primary)]">{receipt.honorOf}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleDownloadReceipt(receipt)}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  {t('donate.downloadReceipt')}
                </button>
                <button
                  type="button"
                  onClick={() => handleShareImpact(receipt.amountBdt)}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Share2 className="w-4 h-4" />
                  {t('donate.shareDonation')}
                </button>
                <button
                  type="button"
                  onClick={() => setReceipt(null)}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-semibold text-[var(--brand-text)] hover:underline cursor-pointer ml-auto"
                >
                  {t('donate.donateAgain')}
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
                  {t('donate.formTitle')}
                </h2>
                <div className="inline-flex rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-1">
                  {(['one_time', 'monthly'] as DonationFrequency[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFrequency(f)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                        frequency === f
                          ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {f === 'one_time' ? t('donate.oneTime') : t('donate.monthly')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount selector */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                  {t('donate.amountLabel')}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {QUICK_AMOUNTS.map((amt) => {
                    const active = !customInput && amountBdt === amt;
                    return (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => {
                          setAmountBdt(amt);
                          setCustomInput('');
                        }}
                        className={`min-h-[44px] rounded-xl text-sm font-bold tabular-nums cursor-pointer transition-colors ${
                          active
                            ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]'
                            : 'bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--brand-primary)]'
                        }`}
                      >
                        ৳{formatNumber(amt)}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="number"
                  min={20}
                  max={5000000}
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder={t('donate.customAmountLabel')}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
                />
              </div>

              {/* Cause & Specific Event */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    {t('donate.causeLabel')}
                  </label>
                  <select
                    value={cause}
                    onChange={(e) => setCause(e.target.value as DonationCause)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
                  >
                    {orderedCauses.map((c) => (
                      <option key={c} value={c}>
                        {t(`donate.causes.${c}`)}
                      </option>
                    ))}
                  </select>
                </div>

                {cause === 'events' && (
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      {t('donate.specificEventLabel')}
                    </label>
                    <select
                      value={eventId}
                      onChange={(e) => setEventId(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
                    >
                      <option value="">{t('donate.anyEventOption')}</option>
                      {eventsList.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {lang === 'bn' ? ev.titleBn : ev.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {cause === 'zakat' && (
                <div className="p-3 rounded-xl bg-[var(--brand-soft)] border border-[var(--brand-primary)]/35 text-xs font-medium text-[var(--brand-text)]">
                  {t('ramadan.zakatNote')}
                </div>
              )}

              {/* Honor & Anonymous */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    {t('donate.honorLabel')}
                  </label>
                  <input
                    type="text"
                    value={honorOf}
                    onChange={(e) => setHonorOf(e.target.value)}
                    placeholder={t('donate.honorPlaceholder')}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
                  />
                </div>

                <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAnonymous}
                    onChange={(e) => setIsAnonymous(e.target.checked)}
                    style={{ accentColor: 'var(--brand-primary)' }}
                    className="w-4 h-4"
                  />
                  {t('donate.anonymousLabel')}
                </label>
              </div>

              {/* Payment Method Selector */}
              <div className="space-y-2.5">
                <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                  {t('donate.paymentMethodLabel')}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {METHODS.map((m) => {
                    const Icon = m.icon;
                    const active = paymentMethod === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPaymentMethod(m.id)}
                        className={`min-h-[44px] min-w-0 px-3 py-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-2 text-left cursor-pointer transition-colors ${
                          active
                            ? 'border-[var(--brand-primary)] bg-[var(--brand-soft)] text-[var(--brand-text)]'
                            : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="min-w-0">{t(`donate.methods.${m.id}`)}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="p-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] leading-relaxed">
                  {paymentMethod === 'bank_transfer'
                    ? t('donate.bankDetails')
                    : paymentMethod === 'card_sandbox'
                      ? t('donate.cardNotice')
                      : t('donate.mfsNotice', { provider: t(`donate.methods.${paymentMethod}`) })}
                </div>
              </div>

              {readyNoticeAmount && (
                <div className="p-3.5 rounded-xl bg-[var(--brand-soft)] border border-[var(--brand-primary)]/35 text-xs font-semibold text-[var(--brand-text)]">
                  {t('gate.readyDonateNotice', { amount: formatNumber(readyNoticeAmount) })}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || effectiveAmount < 20}
                className="w-full min-h-[48px] px-6 py-3 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                {!user ? (
                  <Lock className="w-4 h-4 shrink-0" aria-hidden="true" />
                ) : (
                  <Heart className="w-4 h-4 shrink-0" aria-hidden="true" />
                )}
                <span>
                  {submitting
                    ? t('donate.processingBtn')
                    : t('donate.donateBtn', { amount: formatNumber(effectiveAmount) })}
                </span>
              </button>
            </form>
          )}
        </section>

        {/* Right: Percentage Fund Breakdown Bar Chart + Recent Donors */}
        <div className="lg:col-span-5 min-w-0 space-y-5">
          <section className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 space-y-4">
            <div>
              <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                {t('donate.storyTitle')}
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                {t('donate.storyDesc')}
              </p>
            </div>
            <div className="space-y-3">
              {(summary?.breakdown ?? [
                { key: 'packaging', percentage: 32 },
                { key: 'transport', percentage: 26 },
                { key: 'events', percentage: 22 },
                { key: 'emergency', percentage: 12 },
                { key: 'platform', percentage: 8 },
              ]).map((item) => (
                <div key={item.key} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-[var(--text-primary)]">
                      {t(`donate.breakdown.${item.key}`)}
                    </span>
                    <span className="font-mono font-bold text-[var(--brand-text)] tabular-nums">
                      {formatNumber(item.percentage)}%
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-[var(--bg-subtle)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--brand-primary)]"
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 space-y-3">
            <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
              {t('donate.recentDonorsTitle')}
            </h2>
            <div className="divide-y divide-[var(--border-subtle)] max-h-72 overflow-y-auto">
              {(summary?.recentDonors ?? []).map((don) => (
                <div key={don.id} className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-bold text-[var(--text-primary)] truncate">
                      {don.isAnonymous ? t('donate.anonymousName') : don.donorDisplayName}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">
                      {t(`donate.causes.${don.cause}`)}
                      {don.honorOf ? ` · ${don.honorOf}` : ''}
                    </p>
                  </div>
                  <span className="font-mono font-bold text-[var(--brand-text)] whitespace-nowrap tabular-nums">
                    ৳{formatNumber(don.amountBdt)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Transparency Ledger & My Donations */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 min-w-0 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                {t('donate.transparencyTitle')}
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{t('donate.transparencyDesc')}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowInquiryNote((s) => !s)}
              className="text-xs font-semibold text-[var(--brand-text)] hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <Mail className="w-3.5 h-3.5" />
              {t('donate.financialInquiryBtn')}
            </button>
          </div>

          {showInquiryNote && (
            <div className="p-3.5 rounded-xl bg-[var(--brand-soft)] border border-[var(--brand-primary)]/30 text-xs text-[var(--text-primary)]">
              {t('donate.financialInquiryNote')}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
                  <th className="py-2 pr-3 font-semibold">{t('donate.monthCol')}</th>
                  <th className="py-2 px-3 font-semibold">{t('donate.incomeCol')}</th>
                  <th className="py-2 px-3 font-semibold">{t('donate.spentCol')}</th>
                  <th className="py-2 pl-3 font-semibold text-right">{t('donate.mealsFundedCol')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {(summary?.monthlyReports ?? []).map((row) => (
                  <tr key={row.monthKey}>
                    <td className="py-2.5 pr-3 font-semibold text-[var(--text-primary)]">
                      {lang === 'bn' ? row.monthLabelBn : row.monthLabel}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-[var(--brand-text)] font-bold">
                      ৳{formatNumber(row.incomeBdt)}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-[var(--text-secondary)]">
                      ৳{formatNumber(row.spentBdt)}
                    </td>
                    <td className="py-2.5 pl-3 font-mono tabular-nums text-right text-[var(--text-primary)]">
                      {formatNumber(row.mealsFunded)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="lg:col-span-5 min-w-0 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 sm:p-6 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[var(--brand-text)]" />
            <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
              {t('donate.myDonationsTitle')}
            </h2>
          </div>

          {!user ? (
            <div className="py-5 px-4 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-center space-y-3">
              <Lock className="w-5 h-5 mx-auto text-[var(--brand-text)]" aria-hidden="true" />
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                {t('gate.guestDonationsNote')}
              </p>
              <button
                type="button"
                onClick={onLoginClick}
                className="min-h-[38px] px-4 py-1.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                {t('gate.loginBtn')}
              </button>
            </div>
          ) : myDonations.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] py-6 text-center">
              {t('donate.noMyDonations')}
            </p>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)] max-h-64 overflow-y-auto">
              {myDonations.map((d) => (
                <div key={d.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-bold text-[var(--text-primary)] font-mono">{d.receiptCode}</p>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">
                      {t(`donate.causes.${d.cause}`)} · {t(`donate.methods.${d.paymentMethod}`)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono font-bold text-[var(--brand-text)] tabular-nums">
                      ৳{formatNumber(d.amountBdt)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDownloadReceipt(d)}
                      aria-label={t('donate.downloadReceipt')}
                      className="p-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Non-Money Ways to Help */}
      <section className="space-y-4">
        <div>
          <h2 className="font-display text-xl font-bold text-[var(--canvas-text-primary)]">
            {t('donate.nonMoneyTitle')}
          </h2>
          <p className="text-xs sm:text-sm text-[var(--canvas-text-muted)] mt-0.5">
            {t('donate.nonMoneySubtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: Users, title: t('donate.way1Title'), desc: t('donate.way1Desc'), onClick: onNavigateEvents },
            { icon: Utensils, title: t('donate.way2Title'), desc: t('donate.way2Desc'), onClick: onNavigateWedding },
            { icon: Share2, title: t('donate.way3Title'), desc: t('donate.way3Desc'), onClick: () => handleShareImpact() },
            { icon: Handshake, title: t('donate.way4Title'), desc: t('donate.way4Desc'), onClick: onNavigateClients },
          ].map((card, idx) => {
            const Icon = card.icon;
            return (
              <button
                key={idx}
                type="button"
                onClick={card.onClick}
                className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] hover:border-[var(--brand-primary)] p-5 text-left space-y-2.5 transition-colors cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-[var(--brand-soft)] text-[var(--brand-text)] flex items-center justify-center">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
                  {card.title}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{card.desc}</p>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
