import { useState } from 'react';
import { Clock, MapPin, MessageCircle, QrCode, Star, XCircle } from 'lucide-react';
import type { Claim } from '../types';
import { api } from '../lib/api';
import { FoodImage } from './FoodImage';
import { useI18n } from '../i18n/I18nContext';

interface ClaimsViewProps {
  claims: Claim[];
  quota: { usedToday: number; dailyLimit: number };
  onOpenChat: (conversationId: string) => void;
  onShowPickupCode: (claim: Claim) => void;
  onCancelClaim: (claimId: string) => void;
  onBrowseFeed: () => void;
  onReviewSubmitted?: () => void;
}

const STATUS_COLOR: Record<string, string> = {
  requested: 'text-[var(--brand-accent-text)]',
  accepted: 'text-[var(--brand-text)]',
  picked_up: 'text-[var(--brand-text)]',
  completed: 'text-[var(--text-muted)]',
  cancelled: 'text-red-600 dark:text-red-400',
  expired: 'text-[var(--text-muted)]',
};

export function ClaimsView({
  claims,
  quota,
  onOpenChat,
  onShowPickupCode,
  onCancelClaim,
  onBrowseFeed,
  onReviewSubmitted,
}: ClaimsViewProps) {
  const { t, formatNumber, formatWindow, formatAddress } = useI18n();
  const [ratingClaimId, setRatingClaimId] = useState<string | null>(null);
  const [ratingValue, setRatingValue] = useState(5);
  const [hygieneOk, setHygieneOk] = useState(true);
  const [comment, setComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const openRatingForm = (claimId: string) => {
    setRatingClaimId(claimId);
    setRatingValue(5);
    setHygieneOk(true);
    setComment('');
    setReviewError(null);
  };

  const handleSubmitReview = async (e: React.FormEvent, claimId: string) => {
    e.preventDefault();
    setSubmittingReview(true);
    setReviewError(null);
    try {
      await api.submitClaimReview(claimId, {
        rating: ratingValue,
        hygieneOk,
        comment: comment.trim() || undefined,
      });
      setRatingClaimId(null);
      onReviewSubmitted?.();
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Unable to submit rating');
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-4">
        <div>
          <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
            {t('claims.title')}
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">{t('claims.subtitle')}</p>
        </div>
        <div className="text-xs font-medium text-[var(--text-secondary)] tabular-nums">
          {t('claims.dailyQuota')}:{' '}
          <strong className="text-[var(--brand-text)]">
            {formatNumber(quota.usedToday)} / {formatNumber(quota.dailyLimit)}
          </strong>{' '}
          {t('claims.activeToday')}
        </div>
      </div>

      {claims.length === 0 ? (
        <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-10 text-center space-y-3">
          <p className="text-base font-bold text-[var(--text-primary)]">
            {t('claims.emptyTitle')}
          </p>
          <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">
            {t('claims.emptySubtitle')}
          </p>
          <button
            type="button"
            onClick={onBrowseFeed}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-sm font-semibold cursor-pointer"
          >
            {t('claims.browseFood')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {claims.map((claim) => {
            const statusColor = STATUS_COLOR[claim.status] ?? STATUS_COLOR.requested;
            const statusText = t(`claims.statuses.${claim.status}`);
            const canCancel = claim.status === 'requested' || claim.status === 'accepted';
            const canRate = claim.status === 'completed' && !claim.myRating;
            const isRatingOpen = ratingClaimId === claim.id;

            return (
              <div
                key={claim.id}
                className="min-w-0 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-4 flex flex-col justify-between gap-4 shadow-xs"
              >
                <div className="flex gap-3.5">
                  <FoodImage
                    src={claim.listingPhoto}
                    alt={claim.listingTitle}
                    className="w-20 h-20 rounded-xl shrink-0"
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className={`font-bold ${statusColor}`}>
                        {statusText}
                        {claim.status === 'completed' && claim.handoverMethod === 'qr'
                          ? ' · QR'
                          : ''}
                      </span>
                      <span className="text-[var(--text-muted)] tabular-nums shrink-0">
                        {formatNumber(claim.quantityClaimed)} {t('common.portions')}
                      </span>
                    </div>
                    <h3 className="font-display text-sm font-bold text-[var(--text-primary)] line-clamp-2">
                      {claim.listingTitle}
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] truncate">
                      {claim.donorBusinessName}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)] pt-1">
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Clock className="w-3 h-3 text-[var(--brand-accent-text)]" />
                        {formatWindow(claim.pickupStart, claim.pickupEnd)}
                      </span>
                      <span className="inline-flex items-center gap-1 min-w-0 max-w-full">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">
                          {formatAddress(claim.donorAddress, claim.donorAddressBn)}
                        </span>
                      </span>
                    </div>
                    {claim.cancelReason && (
                      <p className="text-[11px] text-red-600 dark:text-red-400 pt-1">
                        {claim.cancelReason}
                      </p>
                    )}
                    {claim.myRating && (
                      <p className="text-xs font-semibold text-amber-600 dark:text-amber-300 inline-flex items-center gap-1 pt-1 tabular-nums">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" aria-hidden="true" />
                        {t('reviews.ratedLabel', { rating: claim.myRating })}
                      </p>
                    )}
                  </div>
                </div>

                {isRatingOpen && (
                  <form
                    onSubmit={(e) => handleSubmitReview(e, claim.id)}
                    className="p-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-3"
                  >
                    <p className="text-xs font-bold text-[var(--text-primary)]">
                      {t('reviews.modalTitle')}
                    </p>
                    <div className="flex items-center gap-1.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setRatingValue(star)}
                          aria-label={`${star} stars`}
                          className="min-h-[38px] min-w-[38px] rounded-lg flex items-center justify-center hover:bg-[var(--bg-surface)] cursor-pointer"
                        >
                          <Star
                            className={`w-5 h-5 ${
                              star <= ratingValue
                                ? 'fill-amber-400 text-amber-500'
                                : 'text-[var(--text-muted)]'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                    <label className="flex items-start gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hygieneOk}
                        onChange={(e) => setHygieneOk(e.target.checked)}
                        className="mt-0.5 w-4 h-4 accent-[var(--brand-primary)]"
                      />
                      <span>{t('reviews.hygieneCheck')}</span>
                    </label>
                    <input
                      type="text"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder={t('reviews.commentPlaceholder')}
                      className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                    />
                    {reviewError && (
                      <p className="text-xs text-red-600 dark:text-red-300">{reviewError}</p>
                    )}
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setRatingClaimId(null)}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] cursor-pointer"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        type="submit"
                        disabled={submittingReview}
                        className="min-h-[36px] px-4 py-1.5 rounded-lg bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] text-xs font-semibold cursor-pointer"
                      >
                        {submittingReview ? t('reviews.submitting') : t('reviews.submitBtn')}
                      </button>
                    </div>
                  </form>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[var(--border-subtle)]">
                  {claim.status === 'accepted' && (
                    <button
                      type="button"
                      onClick={() => onShowPickupCode(claim)}
                      className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 sm:whitespace-nowrap cursor-pointer"
                    >
                      <QrCode className="w-4 h-4 shrink-0" />
                      {t('claims.showCode', { code: claim.pickupCode })}
                    </button>
                  )}

                  {canRate && !isRatingOpen && (
                    <button
                      type="button"
                      onClick={() => openRatingForm(claim.id)}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[var(--brand-accent)] hover:bg-[var(--brand-accent-hover)] text-[var(--brand-accent-fg)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 sm:whitespace-nowrap cursor-pointer"
                    >
                      <Star className="w-4 h-4 shrink-0" />
                      {t('reviews.ratePickupBtn')}
                    </button>
                  )}

                  {claim.conversationId && (
                    <button
                      type="button"
                      onClick={() => onOpenChat(claim.conversationId!)}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[var(--text-primary)] text-xs font-semibold inline-flex items-center gap-1.5 sm:whitespace-nowrap cursor-pointer"
                    >
                      <MessageCircle className="w-4 h-4 text-[var(--brand-text)] shrink-0" />
                      {t('claims.backToChat')}
                    </button>
                  )}

                  {canCancel && (
                    <button
                      type="button"
                      onClick={() => onCancelClaim(claim.id)}
                      className="min-h-[44px] px-3 py-2 rounded-xl text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/35 inline-flex items-center gap-1 sm:whitespace-nowrap cursor-pointer"
                    >
                      <XCircle className="w-4 h-4 shrink-0" />
                      {t('claims.cancel')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
