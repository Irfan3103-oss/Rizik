import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  Clock,
  Flag,
  Lock,
  MapPin,
  MessageCircle,
  Minus,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Star,
  Thermometer,
  X,
  Zap,
} from 'lucide-react';
import type { DonorReviewsResponse, Listing, User } from '../types';
import { useAuth, type PendingAuthAction } from '../auth/AuthContext';
import { api } from '../lib/api';
import { createFirestoreClaimIfSupported } from '../lib/firestoreService';
import { openDirectChatForListingOrShop } from '../lib/messengerService';
import { FoodImage } from './FoodImage';
import { useI18n } from '../i18n/I18nContext';
import { useCountdown } from '../hooks/useCountdown';

interface ListingDetailModalProps {
  listing: Listing | null;
  user: User | null;
  quota: { usedToday: number; dailyLimit: number };
  initialDraft?: { quantity?: number; notes?: string; openReport?: boolean } | null;
  onClose: () => void;
  onClaimCreated: (conversationId: string) => void;
  onOpenShopChat?: (conversationId: string) => void;
  onRequireLogin: (action: PendingAuthAction) => void;
}

const REPORT_REASONS = [
  { key: 'detail.reportReason1', value: 'Food quality or safety concern' },
  { key: 'detail.reportReason2', value: 'Inaccurate description or allergen info' },
  { key: 'detail.reportReason3', value: 'Suspicious or spam listing' },
];

const ALLERGEN_TAG_SET = new Set(['Contains Nuts', 'Contains Dairy', 'Contains Gluten']);

export function ListingDetailModal({
  listing,
  user,
  quota,
  initialDraft,
  onClose,
  onClaimCreated,
  onOpenShopChat,
  onRequireLogin,
}: ListingDetailModalProps) {
  const {
    t,
    formatNumber,
    formatTime,
    formatWindow,
    formatTimeLeft,
    formatUnit,
    formatDietary,
    formatArea,
    formatAddress,
  } = useI18n();
  const { isFirebaseSession, isFirebaseVerified } = useAuth();
  const [quantity, setQuantity] = useState(initialDraft?.quantity ?? 1);
  const [notes, setNotes] = useState(initialDraft?.notes ?? '');
  const [agreedSafety, setAgreedSafety] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(Boolean(initialDraft?.openReport));
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0].value);
  const [reportDone, setReportDone] = useState(false);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [donorReviews, setDonorReviews] = useState<DonorReviewsResponse | null>(null);

  const pickupCountdown = useCountdown(listing?.pickupEnd);
  const safetyTargetIso =
    listing?.safeUntil ??
    (listing
      ? new Date(new Date(listing.preparedAt).getTime() + listing.consumeWithinHours * 3600_000).toISOString()
      : null);
  const safetyCountdown = useCountdown(safetyTargetIso);

  useEffect(() => {
    setQuantity(initialDraft?.quantity ?? 1);
    setNotes(initialDraft?.notes ?? '');
    setReporting(Boolean(initialDraft?.openReport));
    setAgreedSafety(false);
    setError(null);
    setReportDone(false);
    setReviewsOpen(false);
    setDonorReviews(null);
  }, [listing?.id, initialDraft]);

  useEffect(() => {
    if (!listing?.donorId) return;
    api
      .getDonorReviews(listing.donorId)
      .then((res) => setDonorReviews(res))
      .catch(() => {});
  }, [listing?.donorId]);

  if (!listing) return null;
  const maxSelectable = Math.max(1, Math.min(listing.remainingQuantity, 5));
  const isOwner = user?.id === listing.donorId;
  const quotaExceeded = Boolean(user && quota.usedToday >= quota.dailyLimit);
  const timeLeft = formatTimeLeft(listing.pickupEnd);
  const expiredLabel = t('feed.expired');
  const unitLabel = formatUnit(listing.unit);
  const isFlash = Boolean(listing.isFlashRescue) || pickupCountdown.urgent;

  const dietTags = listing.dietaryTags.filter((tag) => !ALLERGEN_TAG_SET.has(tag));
  const allergenTags = listing.dietaryTags.filter((tag) => ALLERGEN_TAG_SET.has(tag));
  const storageKey = listing.storageMethod || 'covered_hot';

  const avgRating = donorReviews?.avgRating ?? listing.donorAvgRating ?? null;
  const reviewCount = donorReviews?.reviewCount ?? listing.donorReviewCount ?? 0;

  const handleMessageShop = async () => {
    if (!user) {
      onRequireLogin({
        type: 'chat',
        listingId: listing.id,
        donorId: listing.donorId,
        shopName: listing.donorName,
      });
      return;
    }
    setError(null);
    setOpeningChat(true);
    try {
      if (isFirebaseSession) {
        if (!isFirebaseVerified) {
          setError(t('settings.unverifiedBanner'));
          return;
        }
        const convId = await openDirectChatForListingOrShop(
          user,
          listing.donorId,
          listing.donorName,
          listing.donorArea,
          null,
          listing.donorVerified,
          listing
        );
        if (onOpenShopChat) onOpenShopChat(convId);
        else onClaimCreated(convId);
        return;
      }
      const res = await api.openShopConversation(listing.donorId, listing.id);
      if (onOpenShopChat) onOpenShopChat(res.conversationId);
      else onClaimCreated(res.conversationId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('permission-denied') || msg.includes('PERMISSION_DENIED') || msg.includes('blocked')) {
        setError(t('chat.blockedNotice'));
      } else {
        setError(msg || t('detail.unableToClaim'));
      }
    } finally {
      setOpeningChat(false);
    }
  };

  const handleClaim = async () => {
    if (!user) {
      onRequireLogin({
        type: 'claim',
        listingId: listing.id,
        quantity,
        notes: notes.trim() || undefined,
      });
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      if (isFirebaseSession) {
        if (!isFirebaseVerified) {
          setError(t('settings.unverifiedBanner'));
          return;
        }
        const created = await createFirestoreClaimIfSupported(
          user,
          listing,
          quantity,
          notes || undefined
        );
        if (created) {
          onClaimCreated('');
          return;
        }
        // Listing lives in SQLite (e.g. seeded demo food): fall through to the Express API,
        // which accepts the Firebase token.
      }
      const res = await api.createClaim(listing.id, quantity, notes || undefined);
      onClaimCreated(res.conversationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('detail.unableToClaim'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReportButton = () => {
    if (!user) {
      onRequireLogin({ type: 'report', listingId: listing.id });
      return;
    }
    setReporting((r) => !r);
  };

  const handleReport = async () => {
    try {
      await api.submitReport({
        targetType: 'listing',
        targetId: listing.id,
        reason: reportReason,
      });
      setReportDone(true);
      setReporting(false);
    } catch {
      // Ignore
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={listing.title}
    >
      <div className="w-full md:max-w-2xl bg-[var(--bg-surface)] rounded-t-3xl md:rounded-2xl border border-[var(--border-subtle)] shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Image Header */}
        <div className="relative h-56 sm:h-64 w-full shrink-0 bg-[var(--bg-subtle)]">
          <FoodImage src={listing.photoUrls[0]} alt={listing.title} className="w-full h-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/35" />

          {(isFlash || listing.isRamadanSpecial) && (
            <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
              {isFlash && !pickupCountdown.expired && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-xs text-amber-300 text-xs font-bold">
                  <Zap className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  {t('flash.badge')}
                </span>
              )}
              {listing.isRamadanSpecial && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-xs text-emerald-300 text-xs font-bold">
                  {t('ramadan.filterToggle')}
                </span>
              )}
            </div>
          )}

          <div className="absolute top-3 right-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleReportButton}
              aria-label={t('detail.reportListing')}
              className="min-h-[44px] min-w-[44px] rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-sm cursor-pointer"
            >
              <Flag className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('detail.closeDetails')}
              className="min-h-[44px] min-w-[44px] rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-sm cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="absolute bottom-4 left-5 right-5 text-white">
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-200 font-medium mb-1">
              <span>{listing.donorName}</span>
              {listing.donorVerified && (
                <BadgeCheck
                  className="w-4 h-4 text-emerald-300"
                  aria-label={t('common.verifiedDonor')}
                />
              )}
              {avgRating !== null && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-amber-300 tabular-nums">
                    <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300" aria-hidden="true" />
                    {formatNumber(avgRating)} ({formatNumber(reviewCount)})
                  </span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span>{formatArea(listing.donorArea)}</span>
              {listing.distanceKm !== undefined && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">
                    {formatNumber(listing.distanceKm)} {t('feed.km')}
                  </span>
                </>
              )}
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-bold leading-tight">
              {listing.title}
            </h2>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {reporting && user && (
            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 space-y-3">
              <p className="text-sm font-semibold text-red-900 dark:text-red-200">
                {t('detail.reportTitle')}
              </p>
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-red-200 dark:border-red-800 bg-[var(--bg-surface)] text-[var(--text-primary)] text-sm"
              >
                {REPORT_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {t(r.key)}
                  </option>
                ))}
              </select>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReporting(false)}
                  className="px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleReport}
                  className="px-3.5 py-1.5 rounded-xl bg-red-600 text-white text-xs font-semibold cursor-pointer"
                >
                  {t('detail.submitReport')}
                </button>
              </div>
            </div>
          )}

          {reportDone && (
            <p className="text-xs text-[var(--brand-text)] font-medium">
              {t('detail.reportSuccess')}
            </p>
          )}

          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            {listing.description}
          </p>

          {/* Clean Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="p-3.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                <Clock className="w-3.5 h-3.5 text-[var(--brand-accent-text)]" />
                <span>{t('detail.pickupWindow')}</span>
              </div>
              <p className="font-semibold text-[var(--text-primary)] tabular-nums">
                {formatWindow(listing.pickupStart, listing.pickupEnd)}
              </p>
              <p className="text-xs text-[var(--brand-accent-text)] font-semibold tabular-nums">
                {pickupCountdown.expired
                  ? expiredLabel
                  : isFlash
                    ? t('flash.endsInTimer', { timer: formatNumber(pickupCountdown.formatted) })
                    : `${t('feed.endsIn')} ${timeLeft}`}
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                <MapPin className="w-3.5 h-3.5 text-[var(--brand-text)]" />
                <span>{t('detail.pickupLocation')}</span>
              </div>
              <p className="font-semibold text-[var(--text-primary)] line-clamp-2">
                {user
                  ? formatAddress(listing.pickupAddress, listing.pickupAddressBn)
                  : formatArea(listing.donorArea)}
              </p>
              <p className="text-xs text-[var(--text-muted)] inline-flex items-center gap-1">
                {!user ? (
                  <>
                    <Lock className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <span>{t('detail.contactLockedGuest')}</span>
                  </>
                ) : listing.donorPhone ? (
                  t('detail.phoneLabel', { phone: listing.donorPhone })
                ) : (
                  t('detail.phoneLocked')
                )}
              </p>
            </div>
          </div>

          {/* Food Safety Timer + Separated Dietary & Allergen Info */}
          <div className="p-4 rounded-2xl bg-[var(--brand-accent-soft)] border border-[var(--border-subtle)] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[var(--brand-accent-text)] text-xs font-bold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{t('detail.safetyAllergenTitle')}</span>
              </div>
              <span className="text-xs font-bold text-[var(--brand-text)] tabular-nums inline-flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                {safetyCountdown.expired
                  ? t('safety.safeExpired')
                  : t('safety.safeForLabel', { timer: formatNumber(safetyCountdown.formatted) })}
              </span>
            </div>

            <p className="text-xs text-[var(--text-primary)] leading-relaxed">
              {listing.safetyNote}
            </p>

            <div className="text-xs text-[var(--text-secondary)] flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
              <span>{t('detail.preparedAt', { time: formatTime(listing.preparedAt) })}</span>
              <span aria-hidden="true">·</span>
              <span>{t('detail.consumeWithin', { hours: listing.consumeWithinHours })}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <Thermometer className="w-3.5 h-3.5 text-[var(--brand-text)] shrink-0" aria-hidden="true" />
                {t(`safety.storage.${storageKey}`)}
              </span>
            </div>

            {(dietTags.length > 0 || allergenTags.length > 0) && (
              <div className="pt-2 border-t border-[var(--border-subtle)] grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="font-semibold text-[var(--text-muted)] block">
                    {t('safety.dietTagsTitle')}
                  </span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {dietTags.length > 0 ? dietTags.map(formatDietary).join(' · ') : '—'}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-[var(--text-muted)] block">
                    {t('safety.allergenTitle')}
                  </span>
                  <span
                    className={`font-semibold ${
                      allergenTags.length > 0
                        ? 'text-red-700 dark:text-red-300'
                        : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    {allergenTags.length > 0
                      ? allergenTags.map(formatDietary).join(', ')
                      : t('safety.noAllergens')}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Expandable Verified Donor Rating & Recent Pickup Reviews */}
          {donorReviews && (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/60 overflow-hidden">
              <button
                type="button"
                onClick={() => setReviewsOpen((o) => !o)}
                className="w-full px-4 py-3 flex items-center justify-between gap-2 text-left text-xs cursor-pointer hover:bg-[var(--bg-subtle)]"
              >
                <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500 shrink-0" aria-hidden="true" />
                  {donorReviews.avgRating !== null
                    ? t('reviews.donorSummary', {
                        avg: donorReviews.avgRating,
                        count: donorReviews.reviewCount,
                        hygiene: donorReviews.hygieneRatePct,
                      })
                    : t('reviews.recentTitle')}
                </span>
                {reviewsOpen ? (
                  <ChevronUp className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                )}
              </button>
              {reviewsOpen && (
                <div className="px-4 pb-3 pt-1 border-t border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
                  {donorReviews.reviews.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)] py-2">{t('reviews.noReviews')}</p>
                  ) : (
                    donorReviews.reviews.slice(0, 3).map((rev) => (
                      <div key={rev.id} className="py-2 text-xs space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-[var(--text-primary)] truncate">
                            {rev.reviewerOrg || rev.reviewerName}
                          </span>
                          <span className="font-mono font-bold text-amber-600 dark:text-amber-300 tabular-nums shrink-0">
                            ★ {formatNumber(rev.rating)}/5
                          </span>
                        </div>
                        {rev.comment && (
                          <p className="text-[var(--text-secondary)]">{rev.comment}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Claim Controls */}
          {(!user || (!isOwner && user.role !== 'donor')) && (
            <div className="space-y-4 pt-2 border-t border-[var(--border-subtle)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {t('detail.portionsToRequest')}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] tabular-nums">
                    {user
                      ? t('detail.availableQuota', {
                          count: listing.remainingQuantity,
                          unit: unitLabel,
                          used: quota.usedToday,
                          limit: quota.dailyLimit,
                        })
                      : `${formatNumber(listing.remainingQuantity)} ${unitLabel} ${t('feed.left')}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    aria-label={t('detail.decreaseQty')}
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="min-h-[44px] min-w-[44px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] flex items-center justify-center hover:bg-[var(--bg-subtle)] cursor-pointer"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-8 text-center font-mono font-bold text-base tabular-nums text-[var(--text-primary)]">
                    {formatNumber(quantity)}
                  </span>
                  <button
                    type="button"
                    aria-label={t('detail.increaseQty')}
                    onClick={() => setQuantity((q) => Math.min(maxSelectable, q + 1))}
                    className="min-h-[44px] min-w-[44px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] flex items-center justify-center hover:bg-[var(--bg-subtle)] cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="claim-note"
                  className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                >
                  {t('detail.arrivalNoteLabel')}
                </label>
                <input
                  id="claim-note"
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('detail.arrivalNotePlaceholder')}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                />
              </div>

              {user ? (
                <>
                  <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agreedSafety}
                      onChange={(e) => setAgreedSafety(e.target.checked)}
                      className="mt-0.5 w-5 h-5 accent-[var(--brand-primary)] rounded cursor-pointer shrink-0"
                    />
                    <span className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      <strong className="text-[var(--text-primary)] block mb-0.5">
                        {t('detail.safetyNoticeTitle')}
                      </strong>
                      {t('detail.safetyNoticeBody')}
                    </span>
                  </label>

                  {quotaExceeded && (
                    <div className="flex items-center gap-2 text-xs text-[var(--brand-accent-text)] bg-[var(--brand-accent-soft)] border border-[var(--border-subtle)] px-3.5 py-2.5 rounded-xl">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span>{t('detail.quotaExceeded', { limit: quota.dailyLimit })}</span>
                    </div>
                  )}

                  {error && (
                    <p className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 px-3.5 py-2.5 rounded-xl">
                      {error}
                    </p>
                  )}
                </>
              ) : (
                <div className="p-3.5 rounded-2xl bg-[var(--brand-soft)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] leading-relaxed">
                  {t('detail.signInPrompt')}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sticky Footer Action */}
        {(!user || (!isOwner && user.role !== 'donor')) && (
          <div className="p-3.5 sm:p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-wrap sm:flex-nowrap items-center gap-2">
            <button
              type="button"
              disabled={openingChat}
              onClick={handleMessageShop}
              className="flex-1 sm:flex-initial min-h-[48px] px-4 py-3 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[var(--text-primary)] font-semibold text-sm inline-flex items-center justify-center gap-2 sm:whitespace-nowrap cursor-pointer"
            >
              <MessageCircle className="w-4 h-4 text-[var(--brand-text)] shrink-0" />
              <span>{openingChat ? t('detail.openingChat') : t('detail.messageShop')}</span>
              {!user && <Lock className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" aria-hidden="true" />}
            </button>
            <button
              type="button"
              disabled={
                user
                  ? !agreedSafety || submitting || quotaExceeded || listing.remainingQuantity < 1
                  : listing.remainingQuantity < 1
              }
              onClick={handleClaim}
              className="flex-1 min-h-[48px] px-5 py-3 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-45 text-[var(--brand-primary-fg)] font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {!user && <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
              <span>
                {submitting
                  ? t('detail.submittingRequest')
                  : t('detail.requestButton', { count: quantity, unit: unitLabel })}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
