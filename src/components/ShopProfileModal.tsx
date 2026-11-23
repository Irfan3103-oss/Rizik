import { useEffect, useState } from 'react';
import {
  BadgeCheck,
  Ban,
  Clock,
  Flag,
  MapPin,
  Palette,
  Phone,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  Video,
  X,
} from 'lucide-react';
import type { Conversation, DonorReviewsResponse } from '../types';
import { DemoBadge } from './DemoBadge';
import { ShopAvatar } from './ShopAvatar';
import { FoodImage } from './FoodImage';
import { useI18n } from '../i18n/I18nContext';
import { api } from '../lib/api';

interface ShopProfileModalProps {
  conversation: Conversation | null;
  peerName: string;
  peerAvatarUrl?: string | null;
  statusLine: string;
  isDonorPeer: boolean;
  onClose: () => void;
  onVoiceCall: () => void;
  onVideoCall: () => void;
  onOpenChatSettings: () => void;
  onToggleBlock?: () => void;
  onReportUser?: () => void;
}

export function ShopProfileModal({
  conversation,
  peerName,
  peerAvatarUrl,
  statusLine,
  isDonorPeer,
  onClose,
  onVoiceCall,
  onVideoCall,
  onOpenChatSettings,
  onToggleBlock,
  onReportUser,
}: ShopProfileModalProps) {
  const { lang, t, formatNumber, formatWindow, formatAddress, formatHours } = useI18n();
  const [reviewsData, setReviewsData] = useState<DonorReviewsResponse | null>(null);

  useEffect(() => {
    if (!conversation || conversation.isDirect || !isDonorPeer || !conversation.donorId) {
      setReviewsData(null);
      return;
    }
    let active = true;
    api
      .getDonorReviews(conversation.donorId)
      .then((res) => {
        if (active) setReviewsData(res);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [conversation?.donorId, isDonorPeer, conversation]);

  if (!conversation) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('shopProfile.title')}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-[var(--bg-surface)] rounded-t-3xl sm:rounded-2xl border border-[var(--border-subtle)] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
            {t('shopProfile.title')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="min-h-[38px] min-w-[38px] rounded-xl hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Identity Card */}
          <div className="flex flex-col items-center text-center space-y-2">
            <ShopAvatar
              name={peerName}
              imageUrl={peerAvatarUrl}
              online={Boolean(conversation.peerOnline)}
              showStatusDot
              size="lg"
            />
            <div className="space-y-1">
              <div className="inline-flex items-center justify-center gap-1.5">
                <h4 className="font-display text-lg font-extrabold text-[var(--text-primary)]">
                  {peerName}
                </h4>
                {isDonorPeer && conversation.donorVerified && (
                  <BadgeCheck className="w-4 h-4 text-[var(--brand-text)] shrink-0" />
                )}
              </div>
              {conversation.peerHandle && (
                <p className="text-xs font-mono text-[var(--brand-text)]">
                  {conversation.peerHandle}
                </p>
              )}
              <p
                className={`text-xs font-medium ${
                  conversation.peerOnline
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-[var(--text-muted)]'
                }`}
              >
                {statusLine}
              </p>
              {conversation.isDemo ? (
                <div className="flex items-center justify-center gap-1.5 pt-0.5">
                  <DemoBadge />
                </div>
              ) : (
                isDonorPeer &&
                conversation.donorVerified && (
                  <p className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--brand-text)] bg-[var(--brand-soft)] px-2.5 py-0.5 rounded-lg border border-[var(--border-subtle)]">
                    <Store className="w-3 h-3" />
                    {t('shopProfile.verifiedBadge')}
                  </p>
                )
              )}
              {(conversation.peerRating ?? null) !== null && (
                <p className="text-[11px] font-semibold text-[var(--text-secondary)] flex items-center justify-center gap-1 tabular-nums">
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" aria-hidden="true" />
                  <span>{formatNumber(Number(conversation.peerRating).toFixed(1))}</span>
                  {typeof conversation.peerReviewCount === 'number' && (
                    <span className="text-[var(--text-muted)]">
                      ({formatNumber(conversation.peerReviewCount)})
                    </span>
                  )}
                </p>
              )}
              {isDonorPeer && reviewsData && reviewsData.avgRating !== null && (
                <p className="text-[11px] font-semibold text-[var(--text-secondary)] flex items-center justify-center gap-1 tabular-nums">
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" aria-hidden="true" />
                  <span>
                    {t('reviews.donorSummary', {
                      avg: formatNumber(reviewsData.avgRating.toFixed(1)),
                      count: formatNumber(reviewsData.reviewCount),
                      hygiene: formatNumber(reviewsData.hygieneRatePct),
                    })}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={conversation.isBlocked}
              onClick={() => {
                onClose();
                onVoiceCall();
              }}
              className="min-h-[44px] px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--brand-primary)] text-xs font-semibold text-[var(--text-primary)] flex flex-col items-center justify-center gap-1 disabled:opacity-45 cursor-pointer"
            >
              <Phone className="w-4 h-4 text-[var(--brand-text)]" />
              <span>{t('shopProfile.voiceCall')}</span>
            </button>
            <button
              type="button"
              disabled={conversation.isBlocked}
              onClick={() => {
                onClose();
                onVideoCall();
              }}
              className="min-h-[44px] px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--brand-primary)] text-xs font-semibold text-[var(--text-primary)] flex flex-col items-center justify-center gap-1 disabled:opacity-45 cursor-pointer"
            >
              <Video className="w-4 h-4 text-[var(--brand-text)]" />
              <span>{t('shopProfile.videoCall')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenChatSettings();
              }}
              className="min-h-[44px] px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--brand-primary)] text-xs font-semibold text-[var(--text-primary)] flex flex-col items-center justify-center gap-1 cursor-pointer"
            >
              <Palette className="w-4 h-4 text-[var(--brand-text)]" />
              <span className="truncate max-w-full">{t('chat.chatSettings')}</span>
            </button>
          </div>

          {/* Details */}
          <div className="space-y-2.5 text-xs">
            {(conversation.peerBio || conversation.peerBioBn) && (
              <div className="p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-secondary)] leading-relaxed">
                {lang === 'bn' && conversation.peerBioBn
                  ? conversation.peerBioBn
                  : conversation.peerBio}
              </div>
            )}
            {conversation.donorAddress && (
              <div className="p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-[var(--brand-text)] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[11px] font-semibold text-[var(--text-muted)]">
                    {t('shopProfile.addressLabel')}
                  </p>
                  <p className="text-[var(--text-primary)] font-medium mt-0.5">
                    {formatAddress(conversation.donorAddress, conversation.donorAddressBn)}
                  </p>
                </div>
              </div>
            )}

            {conversation.donorHours && (
              <div className="p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-[var(--brand-accent-text)] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[11px] font-semibold text-[var(--text-muted)]">
                    {t('shopProfile.hoursLabel')}
                  </p>
                  <p className="text-[var(--text-primary)] font-medium mt-0.5">
                    {formatHours(conversation.donorHours)}
                  </p>
                </div>
              </div>
            )}

            {(isDonorPeer ? conversation.donorPhone : conversation.recipientPhone) && (
              <div className="p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex items-start gap-2.5">
                <Phone className="w-4 h-4 text-[var(--brand-text)] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[11px] font-semibold text-[var(--text-muted)]">
                    {t('shopProfile.phoneLabel')}
                  </p>
                  <p className="text-[var(--text-primary)] font-medium mt-0.5 tabular-nums">
                    {isDonorPeer ? conversation.donorPhone : conversation.recipientPhone}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Current Listing */}
          {!conversation.isDirect && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                {t('shopProfile.activeDish')}
              </p>
              <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] flex items-center gap-3">
                <FoodImage
                  src={conversation.listingPhoto}
                  alt={conversation.listingTitle}
                  className="w-12 h-12 rounded-xl shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[var(--text-primary)] truncate">
                    {conversation.listingTitle}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] tabular-nums mt-0.5">
                    {formatWindow(conversation.pickupStart, conversation.pickupEnd)}
                  </p>
                </div>
              </div>
            </div>
          )}
          {/* Recent Donor Reviews */}
          {isDonorPeer && !conversation.isDirect && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                {t('reviews.recentTitle')}
              </p>
              {reviewsData && reviewsData.reviews.length > 0 ? (
                <div className="space-y-2">
                  {reviewsData.reviews.slice(0, 2).map((rev) => (
                    <div
                      key={rev.id}
                      className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[var(--text-primary)] truncate">
                          {rev.reviewerOrg || rev.reviewerName}
                        </span>
                        <span className="inline-flex items-center gap-1 font-mono font-bold text-amber-600 dark:text-amber-400 tabular-nums shrink-0">
                          <Star className="w-3 h-3 fill-amber-500 text-amber-500" aria-hidden="true" />
                          {formatNumber(rev.rating)}
                          {rev.hygieneOk && (
                            <ShieldCheck
                              className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 ml-0.5"
                              aria-hidden="true"
                            />
                          )}
                        </span>
                      </div>
                      {rev.comment && (
                        <p className="text-[11px] text-[var(--text-secondary)] leading-snug">
                          {rev.comment}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-[var(--text-muted)]">{t('reviews.noReviews')}</p>
              )}
            </div>
          )}

          {/* Safety Controls (Block / Report for real conversations) */}
          {!conversation.isDemo && (onToggleBlock || onReportUser) && (
            <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center gap-2">
              {onReportUser && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onReportUser();
                  }}
                  className="flex-1 min-h-[40px] px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-canvas)] text-xs font-semibold text-[var(--text-primary)] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Flag className="w-3.5 h-3.5 text-[var(--brand-accent-text)] shrink-0" />
                  <span>{t('shopProfile.reportBtn')}</span>
                </button>
              )}
              {onToggleBlock && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onToggleBlock();
                  }}
                  className="flex-1 min-h-[40px] px-3 py-2 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/70 dark:bg-red-950/30 hover:bg-red-100/70 text-xs font-semibold text-red-700 dark:text-red-300 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Ban className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {conversation.isBlocked
                      ? t('shopProfile.unblockBtn')
                      : t('shopProfile.blockBtn')}
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
