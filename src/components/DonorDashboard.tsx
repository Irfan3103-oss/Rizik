import { useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Clock,
  Edit3,
  MessageCircle,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import type { Claim, Listing } from '../types';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import {
  deleteFirestoreListing,
  updateFirestoreClaimStatus,
  updateFirestoreListing,
} from '../lib/firestoreService';
import { FoodImage } from './FoodImage';
import { RestaurantResubmitModal } from './RestaurantResubmitModal';
import { useI18n } from '../i18n/I18nContext';

interface DonorDashboardProps {
  listings: Listing[];
  incomingClaims: Claim[];
  onCreateListing: () => void;
  onEditListing: (listing: Listing) => void;
  onOpenChat: (conversationId: string) => void;
  onVerifyPickup: (claim: Claim) => void;
  onRefresh: () => void;
}

export function DonorDashboard({
  listings,
  incomingClaims,
  onCreateListing,
  onEditListing,
  onOpenChat,
  onVerifyPickup,
  onRefresh,
}: DonorDashboardProps) {
  const { t, formatNumber, formatWindow, formatTimeLeft, formatUnit, formatArea } = useI18n();
  const { user, updateUser, isFirebaseSession, isFirebaseVerified } = useAuth();
  const [subTab, setSubTab] = useState<'listings' | 'requests'>('requests');
  const [error, setError] = useState<string | null>(null);
  const [resubmitOpen, setResubmitOpen] = useState(false);

  const isRestaurantOwner = user?.accountType === 'restaurantOwner' && Boolean(user.restaurant);
  const verStatus = user?.restaurant?.verificationStatus;
  const canPostListings = !isRestaurantOwner || verStatus === 'approved';
  const adminTeamConvId = user ? `admin_${user.id}` : '';

  const pendingCount = incomingClaims.filter((c) => c.status === 'requested').length;

  const handleTogglePause = async (listing: Listing) => {
    const nextStatus = listing.status === 'paused' ? 'active' : 'paused';
    if (isFirebaseSession) {
      if (!isFirebaseVerified) {
        setError(t('settings.unverifiedBanner'));
        return;
      }
      await updateFirestoreListing(listing.id, { status: nextStatus });
    } else {
      await api.updateListing(listing.id, { status: nextStatus });
    }
    onRefresh();
  };

  const handleMarkClaimed = async (listing: Listing) => {
    if (isFirebaseSession) {
      if (!isFirebaseVerified) {
        setError(t('settings.unverifiedBanner'));
        return;
      }
      await updateFirestoreListing(listing.id, { status: 'claimed', remainingQuantity: 0 });
    } else {
      await api.updateListing(listing.id, { status: 'claimed', remainingQuantity: 0 });
    }
    onRefresh();
  };

  const handleDelete = async (listingId: string) => {
    if (isFirebaseSession) {
      if (!isFirebaseVerified) {
        setError(t('settings.unverifiedBanner'));
        return;
      }
      await deleteFirestoreListing(listingId);
    } else {
      await api.deleteListing(listingId);
    }
    onRefresh();
  };

  const handleClaimAction = async (claimId: string, status: 'accepted' | 'cancelled') => {
    setError(null);
    try {
      if (isFirebaseSession) {
        if (!isFirebaseVerified) {
          setError(t('settings.unverifiedBanner'));
          return;
        }
        await updateFirestoreClaimStatus(claimId, status);
      } else {
        await api.updateClaimStatus(claimId, { status });
      }
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('donor.unableToUpdate'));
    }
  };

  return (
    <div className="space-y-5">
      {isRestaurantOwner && user?.restaurant && (
        <RestaurantResubmitModal
          open={resubmitOpen}
          restaurant={user.restaurant}
          onClose={() => setResubmitOpen(false)}
          onResubmitted={(updated) => {
            updateUser(updated);
            onRefresh();
          }}
        />
      )}

      {/* Restaurant Owner Verification Banner */}
      {isRestaurantOwner && verStatus === 'pending' && (
        <div className="rounded-2xl border border-amber-300 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/40 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <h3 className="font-display text-sm sm:text-base font-bold text-[var(--text-primary)]">
                {t('restaurant.pendingBannerTitle')}
              </h3>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                {t('restaurant.pendingBannerBody')}
              </p>
            </div>
          </div>
          {adminTeamConvId && (
            <button
              type="button"
              onClick={() => onOpenChat(adminTeamConvId)}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <MessageCircle className="w-4 h-4 shrink-0" />
              {t('restaurant.messageTeamBtn')}
            </button>
          )}
        </div>
      )}

      {isRestaurantOwner && verStatus === 'rejected' && (
        <div className="rounded-2xl border border-red-300 dark:border-red-900/70 bg-red-50 dark:bg-red-950/40 p-4 sm:p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="min-w-0 space-y-1 flex-1">
              <h3 className="font-display text-sm sm:text-base font-bold text-red-900 dark:text-red-200">
                {t('restaurant.rejectedBannerTitle')}
              </h3>
              {user?.restaurant?.rejectionReason && (
                <p className="text-xs sm:text-sm text-red-800 dark:text-red-300 leading-relaxed">
                  <strong>{t('restaurant.rejectionReasonHeading')}:</strong>{' '}
                  {user.restaurant.rejectionReason}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setResubmitOpen(true)}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 shrink-0" />
              {t('restaurant.updateAndResubmitBtn')}
            </button>
            {adminTeamConvId && (
              <button
                type="button"
                onClick={() => onOpenChat(adminTeamConvId)}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[var(--text-primary)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <MessageCircle className="w-4 h-4 text-[var(--brand-text)] shrink-0" />
                {t('restaurant.messageTeamBtn')}
              </button>
            )}
          </div>
        </div>
      )}

      {isRestaurantOwner && verStatus === 'approved' && (
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-emerald-800 dark:text-emerald-200">
            <BadgeCheck className="w-4 h-4 shrink-0" />
            <span>
              {user?.restaurant?.restaurantName} · {t('common.verifiedDonor')}
            </span>
          </div>
          {adminTeamConvId && (
            <button
              type="button"
              onClick={() => onOpenChat(adminTeamConvId)}
              className="text-xs font-semibold text-[var(--brand-text)] hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              {t('restaurant.messageTeamBtn')}
            </button>
          )}
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 bg-[var(--bg-subtle)] p-1 rounded-xl w-full sm:w-auto border border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => setSubTab('requests')}
            className={`flex-1 sm:flex-initial min-w-0 min-h-[40px] px-2.5 sm:px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors truncate sm:whitespace-nowrap text-center cursor-pointer ${
              subTab === 'requests'
                ? 'bg-[var(--bg-surface)] text-[var(--brand-text)] shadow-xs'
                : 'text-[var(--text-muted)]'
            }`}
          >
            {t('donor.requestsTab', { count: pendingCount })}
          </button>
          <button
            type="button"
            onClick={() => setSubTab('listings')}
            className={`flex-1 sm:flex-initial min-w-0 min-h-[40px] px-2.5 sm:px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors truncate sm:whitespace-nowrap text-center cursor-pointer ${
              subTab === 'listings'
                ? 'bg-[var(--bg-surface)] text-[var(--brand-text)] shadow-xs'
                : 'text-[var(--text-muted)]'
            }`}
          >
            {t('donor.myListingsTab', { count: listings.length })}
          </button>
        </div>

        <button
          type="button"
          disabled={!canPostListings}
          onClick={() => {
            if (!canPostListings) {
              setError(t('restaurant.pendingBannerBody'));
              return;
            }
            onCreateListing();
          }}
          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-[var(--brand-primary-fg)] text-sm font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
        >
          <Plus className="w-4 h-4 shrink-0" />
          {t('donor.createListing')}
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs font-medium">
          {error}
        </div>
      )}

      {subTab === 'requests' ? (
        incomingClaims.length === 0 ? (
          <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-10 text-center space-y-2">
            <p className="text-base font-bold text-[var(--text-primary)]">
              {t('donor.noRequestsTitle')}
            </p>
            <p className="text-xs text-[var(--text-muted)]">{t('donor.noRequestsSubtitle')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {incomingClaims.map((claim) => (
              <div
                key={claim.id}
                className="min-w-0 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-4 flex flex-col justify-between gap-4 shadow-xs"
              >
                <div className="flex gap-3.5">
                  <FoodImage
                    src={claim.listingPhoto}
                    alt={claim.listingTitle}
                    className="w-16 h-16 rounded-xl shrink-0"
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-[var(--brand-text)]">
                        {t(`claims.statuses.${claim.status}`)}
                      </span>
                      <span className="text-[var(--text-muted)] tabular-nums shrink-0">
                        {formatNumber(claim.quantityClaimed)} {t('common.portions')}
                      </span>
                    </div>
                    <h3 className="font-display text-sm font-bold text-[var(--text-primary)] truncate">
                      {claim.recipientOrg
                        ? `${claim.recipientName} · ${claim.recipientOrg}`
                        : claim.recipientName}
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] truncate">
                      {claim.listingTitle}
                    </p>
                    {claim.notes && (
                      <p className="text-xs text-[var(--text-muted)] italic line-clamp-2">
                        &ldquo;{claim.notes}&rdquo;
                      </p>
                    )}
                    <p className="text-[11px] text-[var(--text-muted)] tabular-nums pt-0.5">
                      {formatArea(claim.recipientArea)} · {formatWindow(claim.pickupStart, claim.pickupEnd)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[var(--border-subtle)]">
                  {claim.status === 'requested' && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleClaimAction(claim.id, 'accepted')}
                        className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 sm:whitespace-nowrap cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        {t('common.accept')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleClaimAction(claim.id, 'cancelled')}
                        className="min-h-[44px] px-3 py-2 rounded-xl border border-red-200 dark:border-red-900/70 text-red-600 dark:text-red-400 text-xs font-semibold inline-flex items-center gap-1 hover:bg-red-50 dark:hover:bg-red-950/35 sm:whitespace-nowrap cursor-pointer"
                      >
                        <XCircle className="w-4 h-4 shrink-0" />
                        {t('common.decline')}
                      </button>
                    </>
                  )}

                  {claim.status === 'accepted' && (
                    <button
                      type="button"
                      onClick={() => onVerifyPickup(claim)}
                      className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-[var(--brand-accent)] hover:bg-[var(--brand-accent-hover)] text-[var(--brand-accent-fg)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 sm:whitespace-nowrap cursor-pointer"
                    >
                      <ShieldCheck className="w-4 h-4 shrink-0" />
                      {t('donor.confirmPickupCode')}
                    </button>
                  )}

                  {claim.conversationId && (
                    <button
                      type="button"
                      onClick={() => onOpenChat(claim.conversationId!)}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[var(--text-primary)] text-xs font-semibold inline-flex items-center gap-1.5 sm:whitespace-nowrap cursor-pointer"
                    >
                      <MessageCircle className="w-4 h-4 text-[var(--brand-text)] shrink-0" />
                      {t('donor.chatBtn')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : listings.length === 0 ? (
        <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-10 text-center space-y-3">
          <p className="text-base font-bold text-[var(--text-primary)]">
            {t('donor.noListingsTitle')}
          </p>
          <p className="text-xs text-[var(--text-muted)]">{t('donor.noListingsSubtitle')}</p>
          <button
            type="button"
            disabled={!canPostListings}
            onClick={onCreateListing}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-[var(--brand-primary-fg)] text-sm font-semibold cursor-pointer"
          >
            {t('donor.createListing')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {listings.map((l) => {
            const timeLeft = formatTimeLeft(l.pickupEnd);
            const expiredLabel = t('feed.expired');
            return (
              <div
                key={l.id}
                className="min-w-0 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-4 flex flex-col justify-between gap-4 shadow-xs"
              >
                <div className="flex gap-3.5">
                  <FoodImage src={l.photoUrls[0]} alt={l.title} className="w-20 h-20 rounded-xl shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span
                        className={`font-bold ${
                          l.status === 'active'
                            ? 'text-[var(--brand-text)]'
                            : l.status === 'paused'
                              ? 'text-[var(--brand-accent-text)]'
                              : 'text-[var(--text-muted)]'
                        }`}
                      >
                        {t(`donor.statuses.${l.status}`)}
                      </span>
                      <span className="text-[var(--text-muted)] tabular-nums shrink-0">
                        {formatNumber(l.remainingQuantity)}/{formatNumber(l.quantity)}{' '}
                        {formatUnit(l.unit)}
                      </span>
                    </div>
                    <h3 className="font-display text-sm font-bold text-[var(--text-primary)] line-clamp-2">
                      {l.title}
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] inline-flex items-center gap-1 tabular-nums">
                      <Clock className="w-3 h-3 shrink-0" />
                      {timeLeft === expiredLabel
                        ? expiredLabel
                        : t('donor.remaining', { time: timeLeft })}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() => onEditListing(l)}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-[var(--bg-subtle)] sm:whitespace-nowrap cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5 shrink-0" />
                    {t('donor.editBtn')}
                  </button>
                  {(l.status === 'active' || l.status === 'paused') && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleTogglePause(l)}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-[var(--bg-subtle)] sm:whitespace-nowrap cursor-pointer"
                      >
                        {l.status === 'paused' ? (
                          <>
                            <PlayCircle className="w-3.5 h-3.5 text-[var(--brand-text)] shrink-0" />
                            {t('donor.resumeBtn')}
                          </>
                        ) : (
                          <>
                            <PauseCircle className="w-3.5 h-3.5 text-[var(--brand-accent-text)] shrink-0" />
                            {t('donor.pauseBtn')}
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMarkClaimed(l)}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-semibold hover:bg-[var(--bg-subtle)] sm:whitespace-nowrap cursor-pointer"
                      >
                        {t('donor.markClaimedBtn')}
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    aria-label={t('donor.deleteListing')}
                    onClick={() => handleDelete(l.id)}
                    className="min-h-[40px] min-w-[40px] ml-auto rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/35 flex items-center justify-center cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
