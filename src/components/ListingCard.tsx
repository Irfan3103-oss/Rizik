import { BadgeCheck, Clock, MapPin, Star, Zap } from 'lucide-react';
import type { Listing } from '../types';
import { FoodImage } from './FoodImage';
import { useI18n } from '../i18n/I18nContext';
import { useCountdown } from '../hooks/useCountdown';

interface ListingCardProps {
  listing: Listing;
  onSelect: (listing: Listing) => void;
}

const ALLERGEN_TAG_SET = new Set(['Contains Nuts', 'Contains Dairy', 'Contains Gluten']);

export function ListingCard({ listing, onSelect }: ListingCardProps) {
  const { t, formatNumber, formatTimeLeft, formatUnit, formatDietary, formatArea } = useI18n();
  const countdown = useCountdown(listing.pickupEnd);
  const timeLeft = formatTimeLeft(listing.pickupEnd);
  const expiredLabel = t('feed.expired');
  const isUrgent = Boolean(listing.isFlashRescue) || countdown.urgent;

  const dietTags = listing.dietaryTags.filter((tag) => !ALLERGEN_TAG_SET.has(tag));
  const allergenTags = listing.dietaryTags.filter((tag) => ALLERGEN_TAG_SET.has(tag));

  return (
    <button
      type="button"
      onClick={() => onSelect(listing)}
      className="group w-full text-left bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] overflow-hidden shadow-xs hover:shadow-md hover:border-[var(--brand-primary)] transition-all flex flex-col cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--bg-subtle)]">
        <FoodImage
          src={listing.photoUrls[0]}
          alt={listing.title}
          className="w-full h-full group-hover:scale-[1.02] transition-transform duration-300"
        />
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
        {(listing.isFlashRescue || listing.isRamadanSpecial) && (
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
            {listing.isFlashRescue && !countdown.expired && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-xs text-amber-300 text-[11px] font-bold tracking-tight">
                <Zap className="w-3 h-3 shrink-0" aria-hidden="true" />
                {t('flash.badge')}
              </span>
            )}
            {listing.isRamadanSpecial && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-xs text-emerald-300 text-[11px] font-bold">
                {t('ramadan.filterToggle')}
              </span>
            )}
          </div>
        )}
        <div className="absolute bottom-3 left-3.5 right-3.5 flex items-center justify-between gap-2 text-white text-xs font-medium">
          <span className="truncate font-semibold">{formatArea(listing.donorArea)}</span>
          <span className="tabular-nums shrink-0 font-semibold">
            {formatNumber(listing.remainingQuantity)} {formatUnit(listing.unit)} {t('feed.left')}
          </span>
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <span className="font-medium text-[var(--text-secondary)] truncate">
              {listing.donorName}
            </span>
            {listing.donorVerified && (
              <BadgeCheck
                className="w-3.5 h-3.5 text-[var(--brand-text)] shrink-0"
                aria-label={t('common.verifiedDonor')}
              />
            )}
            {listing.donorAvgRating !== null && listing.donorAvgRating !== undefined && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-0.5 font-semibold text-[var(--text-primary)] tabular-nums shrink-0">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-500" aria-hidden="true" />
                  {formatNumber(listing.donorAvgRating)}
                </span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className="shrink-0">{t(`feed.categories.${listing.category}`)}</span>
          </div>

          <h3 className="font-display text-base font-bold text-[var(--text-primary)] leading-snug line-clamp-2">
            {listing.title}
          </h3>

          {(dietTags.length > 0 || allergenTags.length > 0) && (
            <p className="text-xs text-[var(--text-muted)] truncate">
              {dietTags.map(formatDietary).join(' · ')}
              {dietTags.length > 0 && allergenTags.length > 0 ? ' · ' : ''}
              {allergenTags.length > 0 && (
                <span className="text-[var(--brand-accent-text)] font-medium">
                  {allergenTags.map(formatDietary).join(', ')}
                </span>
              )}
            </p>
          )}
        </div>

        <div className="pt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs tabular-nums gap-2">
          <span className="inline-flex items-center gap-1 text-[var(--text-secondary)] font-medium truncate">
            <MapPin className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
            {listing.distanceKm !== undefined
              ? `${formatNumber(listing.distanceKm)} ${t('feed.km')}`
              : formatArea(listing.donorArea)}
          </span>
          <span
            className={`inline-flex items-center gap-1 font-semibold shrink-0 tabular-nums ${
              isUrgent ? 'text-[var(--brand-accent-text)]' : 'text-[var(--brand-text)]'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            {countdown.expired
              ? expiredLabel
              : isUrgent
                ? t('flash.endsInTimer', { timer: formatNumber(countdown.formatted) })
                : `${t('feed.endsIn')} ${timeLeft}`}
          </span>
        </div>
      </div>
    </button>
  );
}
