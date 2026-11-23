import {
  ArrowRight,
  Award,
  BadgeCheck,
  Calendar,
  ChefHat,
  Clock,
  Flame,
  Handshake,
  HeartHandshake,
  MapPin,
  MessageCircle,
  MoonStar,
  Search,
  TrendingUp,
  Truck,
  Users,
} from 'lucide-react';
import type { HomeSummary, Listing } from '../types';
import { ListingCard } from './ListingCard';
import { FoodImage } from './FoodImage';
import { ShopAvatar } from './ShopAvatar';
import { TestimonialsCarousel } from './TestimonialsCarousel';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeContext';
import { getImageAlt, IMAGES } from '../data/images';

interface HomeViewProps {
  listings: Listing[];
  loadingListings: boolean;
  summary: HomeSummary | null;
  activeConvId?: string | null;
  onBackToActiveChat?: () => void;
  onFindFood: () => void;
  onFindFlash?: () => void;
  onFindIftar?: () => void;
  onDonateFood: () => void;
  onSelectListing: (listing: Listing) => void;
  onSelectDonorFeed: (donorName: string) => void;
  onNavigateClients: () => void;
  onNavigateEvents: () => void;
  onOpenEventDetail: (eventId: string) => void;
  onNavigateWedding: () => void;
  onNavigateDonate: () => void;
  onNavigateSadaqah?: () => void;
  onNavigateImpact?: () => void;
  onNavigateVolunteers?: () => void;
  onNavigateLeaderboard?: () => void;
}

export function HomeView({
  listings,
  loadingListings,
  summary,
  activeConvId,
  onBackToActiveChat,
  onFindFood,
  onFindFlash,
  onFindIftar,
  onDonateFood,
  onSelectListing,
  onSelectDonorFeed,
  onNavigateClients,
  onNavigateEvents,
  onOpenEventDetail,
  onNavigateWedding,
  onNavigateDonate,
  onNavigateSadaqah,
  onNavigateImpact,
  onNavigateVolunteers,
  onNavigateLeaderboard,
}: HomeViewProps) {
  const { lang, t, formatNumber, formatUnit, formatArea, formatAddress } = useI18n();
  const { ramadanMode } = useTheme();

  const flashListings = listings.filter((l) => l.isFlashRescue).slice(0, 3);
  const previewListings = listings.slice(0, 6);
  const featuredPartners = summary?.featuredPartners ?? [];
  const upcomingEvents = summary?.upcomingEvents ?? [];
  const testimonials = summary?.testimonials ?? [];
  const campaign = summary?.campaignProgress ?? {
    goalBdt: 150000,
    raisedBdt: 82500,
    donorCount: 8,
  };
  const campaignPct = Math.min(
    100,
    Math.round((campaign.raisedBdt / Math.max(1, campaign.goalBdt)) * 100)
  );

  const impact = summary?.impact ?? {
    mealsShared: 1248,
    kgSaved: 562,
    activeDonors: 24,
    peopleHelped: 486,
    portionsAvailableNow: listings.reduce((s, l) => s + l.remainingQuantity, 0),
  };

  const impactMetrics = [
    { label: t('home.mealsShared'), value: formatNumber(impact.mealsShared) },
    { label: t('home.kgSaved'), value: formatNumber(impact.kgSaved) },
    { label: t('home.activeDonors'), value: formatNumber(impact.activeDonors) },
    { label: t('home.peopleHelped'), value: formatNumber(impact.peopleHelped) },
  ];

  const steps = [
    {
      num: t('home.step1Num'),
      title: t('home.step1Title'),
      desc: t('home.step1Desc'),
    },
    {
      num: t('home.step2Num'),
      title: t('home.step2Title'),
      desc: t('home.step2Desc'),
    },
    {
      num: t('home.step3Num'),
      title: t('home.step3Title'),
      desc: t('home.step3Desc'),
    },
  ];

  const activityStatusLabel = (status: string) => {
    switch (status) {
      case 'accepted':
        return t('home.activityAccepted');
      case 'picked_up':
        return t('home.activityPickedUp');
      case 'completed':
        return t('home.activityCompleted');
      default:
        return t('home.activityRequested');
    }
  };

  return (
    <div className="space-y-10 pb-6">
      {/* 1. Hero Split Section */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 min-w-0 bg-[var(--bg-surface)] rounded-3xl border border-[var(--border-subtle)] p-5 sm:p-9 flex flex-col justify-between gap-6">
          <div className="space-y-4">
            <div className="space-y-1">
              <span className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--brand-text)] block">
                {t('common.appName')}
              </span>
              <p
                className="font-bangla text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed text-balance"
                style={{ fontFamily: 'var(--font-bn)' }}
              >
                {t('common.tagline')}
              </p>
            </div>
            <p className="text-xs font-semibold text-[var(--brand-text)]">
              {t('home.heroEyebrow')}
            </p>
            <h1 className="font-display text-3xl sm:text-4xl lg:text-[2.65rem] font-extrabold tracking-tight leading-[1.15] text-[var(--text-primary)] text-balance">
              {t('home.heroTitle')}
            </h1>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed max-w-2xl">
              {t('home.heroTagline')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 pt-2">
            <button
              type="button"
              onClick={onFindFood}
              className="min-h-[48px] px-5 sm:px-6 py-3 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-sm font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors sm:whitespace-nowrap text-left max-w-full"
            >
              <Search className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t('home.findFood')}</span>
            </button>
            <button
              type="button"
              onClick={onDonateFood}
              className="min-h-[48px] px-5 sm:px-6 py-3 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] hover:bg-[var(--brand-soft)] text-[var(--text-primary)] text-sm font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors sm:whitespace-nowrap text-left max-w-full"
            >
              <ChefHat className="w-4 h-4 text-[var(--brand-accent-text)] shrink-0" aria-hidden="true" />
              <span>{t('home.donateFood')}</span>
            </button>
            <button
              type="button"
              onClick={onNavigateWedding}
              className="min-h-[48px] px-5 py-3 rounded-xl border border-[var(--brand-accent)]/45 bg-[var(--brand-accent-soft)] hover:border-[var(--brand-accent)] text-[var(--brand-accent-text)] text-sm font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors sm:whitespace-nowrap text-left max-w-full"
            >
              <Truck className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t('home.donateWeddingCta')}</span>
            </button>
            <button
              type="button"
              onClick={onNavigateDonate}
              className="min-h-[48px] px-4 py-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[var(--text-primary)] text-sm font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors sm:whitespace-nowrap text-left max-w-full"
            >
              <HeartHandshake className="w-4 h-4 text-[var(--brand-text)] shrink-0" aria-hidden="true" />
              <span>{t('home.supportUs')}</span>
            </button>
            {activeConvId && onBackToActiveChat && (
              <button
                type="button"
                onClick={onBackToActiveChat}
                className="min-h-[48px] px-4 py-3 rounded-xl border border-[var(--brand-primary)]/40 bg-[var(--brand-soft)] hover:border-[var(--brand-primary)] text-[var(--brand-text)] text-sm font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors sm:whitespace-nowrap text-left max-w-full"
              >
                <MessageCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{t('home.backToActiveChat')}</span>
              </button>
            )}
          </div>
        </div>

        <div className="lg:col-span-5 min-w-0 relative rounded-3xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-surface)] min-h-[260px]">
          <FoodImage
            eager
            src={IMAGES.hero.src}
            alt={getImageAlt(IMAGES.hero, lang)}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
          <div className="absolute bottom-0 inset-x-0 p-6 text-white space-y-1">
            <p className="font-display text-lg font-bold leading-snug">
              {t('home.heroCaptionTitle')}
            </p>
            <p className="text-xs text-slate-200 tabular-nums">
              {t('home.heroCaptionSub', {
                count: impact.portionsAvailableNow || previewListings.length,
              })}
            </p>
          </div>
        </div>
      </section>

      {/* Optional Ramadan / Eid Seasonal Banner */}
      {ramadanMode && (
        <section className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--brand-primary)]/45 p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <p className="text-xs font-bold text-[var(--brand-text)] inline-flex items-center gap-1.5">
              <MoonStar className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t('ramadan.bannerEyebrow')}</span>
            </p>
            <h2 className="font-display text-lg sm:text-xl font-extrabold text-[var(--text-primary)]">
              {t('ramadan.bannerTitle')}
            </h2>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] max-w-2xl leading-relaxed">
              {t('ramadan.bannerDesc')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {onFindIftar && (
              <button
                type="button"
                onClick={onFindIftar}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs sm:text-sm font-semibold cursor-pointer"
              >
                {t('ramadan.findIftarBtn')}
              </button>
            )}
            {onNavigateSadaqah && (
              <button
                type="button"
                onClick={onNavigateSadaqah}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] hover:bg-[var(--brand-soft)] text-[var(--text-primary)] text-xs sm:text-sm font-semibold cursor-pointer"
              >
                {t('ramadan.giveSadaqahBtn')}
              </button>
            )}
          </div>
        </section>
      )}

      {/* 2. Impact Summary Strip (Full-Width 4-Column Row) */}
      <section aria-label={t('home.impactTitle')} className="space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {impactMetrics.map((m) => (
            <div
              key={m.label}
              className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-4 sm:p-5 space-y-1"
            >
              <p className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--brand-text)] tabular-nums">
                {m.value}
              </p>
              <p className="text-xs sm:text-sm font-medium text-[var(--text-secondary)]">
                {m.label}
              </p>
            </div>
          ))}
        </div>

        {(onNavigateImpact || onNavigateVolunteers || onNavigateLeaderboard) && (
          <div className="flex flex-wrap items-center gap-2.5">
            {onNavigateImpact && (
              <button
                type="button"
                onClick={onNavigateImpact}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--brand-primary)] text-xs font-semibold text-[var(--text-primary)] inline-flex items-center gap-2 cursor-pointer transition-colors"
              >
                <TrendingUp className="w-4 h-4 text-[var(--brand-text)] shrink-0" aria-hidden="true" />
                <span>{t('impact.openDashboardBtn')}</span>
              </button>
            )}
            {onNavigateVolunteers && (
              <button
                type="button"
                onClick={onNavigateVolunteers}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--brand-primary)] text-xs font-semibold text-[var(--text-primary)] inline-flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Users className="w-4 h-4 text-[var(--brand-text)] shrink-0" aria-hidden="true" />
                <span>{t('nav.volunteerHub')}</span>
              </button>
            )}
            {onNavigateLeaderboard && (
              <button
                type="button"
                onClick={onNavigateLeaderboard}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--brand-primary)] text-xs font-semibold text-[var(--text-primary)] inline-flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Award className="w-4 h-4 text-[var(--brand-accent-text)] shrink-0" aria-hidden="true" />
                <span>{t('nav.leaderboard')}</span>
              </button>
            )}
          </div>
        )}
      </section>

      {/* 3. Our Clients & Partners Horizontal Strip */}
      {featuredPartners.length > 0 && (
        <section className="space-y-4 min-w-0">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[var(--canvas-text-primary)] flex items-center gap-2">
                <Handshake className="w-5 h-5 text-[var(--brand-text)] shrink-0" aria-hidden="true" />
                {t('home.partnersStripTitle')}
              </h2>
              <p className="text-xs sm:text-sm text-[var(--canvas-text-muted)] mt-0.5">
                {t('home.partnersStripSubtitle')}
              </p>
            </div>
            <button
              type="button"
              onClick={onNavigateClients}
              className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-[var(--canvas-brand-text,var(--brand-text))] hover:bg-[var(--brand-soft)] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors"
            >
              {t('home.seeAll')}
              <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
            </button>
          </div>

          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-1">
            {featuredPartners.map((partner) => (
              <button
                key={partner.id}
                type="button"
                onClick={onNavigateClients}
                className="min-w-[260px] max-w-[280px] shrink-0 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] hover:border-[var(--brand-primary)] p-4 text-left flex flex-col justify-between gap-3 transition-colors cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <ShopAvatar
                    name={lang === 'bn' ? partner.nameBn : partner.name}
                    imageUrl={partner.logoUrl ?? undefined}
                    size="md"
                  />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                      {lang === 'bn' ? partner.nameBn : partner.name}
                    </p>
                    <p className="text-[11px] font-semibold text-[var(--brand-text)] truncate">
                      {t(`clients.categories.${partner.category}`)}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] truncate flex items-center gap-1">
                      <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />
                      {formatArea(partner.area)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] tabular-nums">
                  <span>{t('clients.sinceLabel', { year: partner.sinceYear })}</span>
                  <span className="font-semibold text-[var(--text-secondary)]">
                    {t('clients.mealsSharedCount', { count: partner.mealsContributed })}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 4. Upcoming Events Preview */}
      {upcomingEvents.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[var(--canvas-text-primary)] flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[var(--brand-text)] shrink-0" aria-hidden="true" />
                {t('home.upcomingEventsTitle')}
              </h2>
              <p className="text-xs sm:text-sm text-[var(--canvas-text-muted)] mt-0.5">
                {t('home.upcomingEventsSubtitle')}
              </p>
            </div>
            <button
              type="button"
              onClick={onNavigateEvents}
              className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-[var(--canvas-brand-text,var(--brand-text))] hover:bg-[var(--brand-soft)] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors"
            >
              {t('home.seeAll')}
              <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {upcomingEvents.map((ev) => (
              <button
                key={ev.id}
                type="button"
                onClick={() => onOpenEventDetail(ev.id)}
                className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] hover:border-[var(--brand-primary)] overflow-hidden text-left flex flex-col transition-colors cursor-pointer group"
              >
                <div className="relative h-36 w-full overflow-hidden">
                  <FoodImage
                    src={ev.bannerUrl}
                    alt={lang === 'bn' ? ev.titleBn : ev.title}
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                  />
                  <span className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-[var(--bg-surface)]/95 text-[11px] font-bold text-[var(--brand-text)] border border-[var(--border-subtle)]">
                    {t(`events.statuses.${ev.status}`)}
                  </span>
                </div>
                <div className="p-4 flex-1 flex flex-col justify-between gap-2.5">
                  <div className="space-y-1">
                    <h3 className="font-display text-sm font-bold text-[var(--text-primary)] line-clamp-2">
                      {lang === 'bn' ? ev.titleBn : ev.title}
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] truncate flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      {formatAddress(ev.locationName, ev.locationNameBn)} · {formatArea(ev.area)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] tabular-nums">
                    <span>
                      {ev.eventDate} · {ev.startTime}
                    </span>
                    <span className="font-semibold text-[var(--brand-text)]">
                      {t('events.expectedMeals', { count: ev.expectedMeals })}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 4B. Flash Rescue Urgent Strip */}
      {flashListings.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[var(--canvas-text-primary)] flex items-center gap-2">
                <Flame className="w-5 h-5 text-amber-500 shrink-0" aria-hidden="true" />
                {t('flash.stripTitle')}
              </h2>
              <p className="text-xs sm:text-sm text-[var(--canvas-text-muted)] mt-0.5">
                {t('flash.stripSubtitle')}
              </p>
            </div>
            {onFindFlash && (
              <button
                type="button"
                onClick={onFindFlash}
                className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-[var(--canvas-brand-text,var(--brand-text))] hover:bg-[var(--brand-soft)] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors"
              >
                {t('home.viewAll')}
                <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {flashListings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} onSelect={onSelectListing} />
            ))}
          </div>
        </section>
      )}

      {/* 5. Food Available Near You Preview (Latest 4–6 Listings) */}
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-[var(--canvas-text-primary)]">
              {t('home.nearbyTitle')}
            </h2>
            <p className="text-xs sm:text-sm text-[var(--canvas-text-muted)] mt-0.5">
              {t('home.nearbySubtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onFindFood}
            className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-[var(--canvas-brand-text,var(--brand-text))] hover:bg-[var(--brand-soft)] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors"
          >
            {t('home.viewAll')}
            <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
          </button>
        </div>

        {loadingListings && previewListings.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="h-72 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] animate-pulse"
              />
            ))}
          </div>
        ) : previewListings.length === 0 ? (
          <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-8 text-center space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">{t('home.noNearby')}</p>
            <button
              type="button"
              onClick={onDonateFood}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-sm font-semibold cursor-pointer"
            >
              {t('home.donateFood')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {previewListings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                onSelect={onSelectListing}
              />
            ))}
          </div>
        )}
      </section>

      {/* 6. Wedding & Buffet Leftover Collection Call-to-Action Banner */}
      <section className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border-subtle)] overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        <div className="lg:col-span-5 min-w-0 relative min-h-[200px]">
          <FoodImage
            src={IMAGES.weddingBanner.src}
            alt={getImageAlt(IMAGES.weddingBanner, lang)}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t lg:bg-gradient-to-r from-black/50 via-transparent to-transparent" />
        </div>
        <div className="lg:col-span-7 min-w-0 p-5 sm:p-8 flex flex-col justify-center gap-4">
          <p className="text-xs font-bold text-[var(--brand-accent-text)] uppercase tracking-wide">
            {t('home.weddingBannerEyebrow')}
          </p>
          <h2 className="font-display text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] leading-snug">
            {t('home.weddingBannerTitle')}
          </h2>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
            {t('home.weddingBannerDesc')}
          </p>
          <div className="pt-1 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onNavigateWedding}
              className="min-h-[46px] px-5 py-2.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-sm font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Truck className="w-4 h-4 shrink-0" aria-hidden="true" />
              {t('home.donateWeddingCta')}
            </button>
            <span className="text-xs font-medium text-[var(--text-muted)]">
              {t('wedding.twoHourBadge')}
            </span>
          </div>
        </div>
      </section>

      {/* 7. Donate Money / Support Us Banner */}
      <section className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border-subtle)] p-5 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <div className="lg:col-span-7 min-w-0 space-y-3">
          <p className="text-xs font-bold text-[var(--brand-text)] uppercase tracking-wide">
            {t('home.donateBannerEyebrow')}
          </p>
          <h2 className="font-display text-xl sm:text-2xl font-extrabold text-[var(--text-primary)]">
            {t('home.donateBannerTitle')}
          </h2>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
            {t('home.donateBannerDesc')}
          </p>
        </div>

        <div className="lg:col-span-5 min-w-0 bg-[var(--bg-subtle)] rounded-2xl border border-[var(--border-subtle)] p-5 space-y-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
            <span className="font-bold text-[var(--text-primary)] tabular-nums">
              {t('donate.raisedAmount', { amount: formatNumber(campaign.raisedBdt) })}
            </span>
            <span className="text-[var(--text-muted)] tabular-nums">
              {t('donate.goalAmount', { amount: formatNumber(campaign.goalBdt) })}
            </span>
          </div>
          <div className="h-3 w-full rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--brand-primary)] transition-all duration-500"
              style={{ width: `${campaignPct}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <span className="text-[11px] font-semibold text-[var(--brand-text)] tabular-nums">
              {campaignPct}% · {formatNumber(campaign.donorCount)} {t('donate.recentDonorsTitle')}
            </span>
            <button
              type="button"
              onClick={onNavigateDonate}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors sm:whitespace-nowrap"
            >
              <HeartHandshake className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t('home.donateBannerBtn')}</span>
            </button>
          </div>
        </div>
      </section>

      {/* 8. How It Works (3 Steps: Post -> Connect/Chat -> Pick up) */}
      <section className="space-y-4">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-[var(--canvas-text-primary)]">
            {t('home.howItWorksTitle')}
          </h2>
          <p className="text-xs sm:text-sm text-[var(--canvas-text-muted)] mt-0.5">
            {t('home.howItWorksSubtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {steps.map((step) => (
            <div
              key={step.num}
              className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 space-y-2.5"
            >
              <span className="font-mono text-sm font-bold text-[var(--brand-text)] tabular-nums block">
                {step.num}
              </span>
              <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
                {step.title}
              </h3>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 9. Testimonials Carousel + Featured Donors & Recent Activity */}
      {testimonials.length > 0 && (
        <TestimonialsCarousel
          testimonials={testimonials}
          title={t('home.testimonialsTitle')}
          subtitle={t('home.testimonialsSubtitle')}
        />
      )}

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Featured Donors */}
        <div className="lg:col-span-7 min-w-0 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
              {t('home.featuredDonorsTitle')}
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {t('home.featuredDonorsSubtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(summary?.featuredDonors ?? []).map((donor) => (
              <button
                key={donor.id}
                type="button"
                onClick={() => onSelectDonorFeed(donor.businessName)}
                className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--brand-primary)] text-left flex items-center gap-3 transition-colors cursor-pointer"
              >
                <FoodImage
                  src={donor.photoUrl}
                  alt={donor.businessName}
                  className="w-14 h-14 rounded-xl shrink-0"
                />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-1">
                    <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                      {donor.businessName}
                    </p>
                    {donor.verified && (
                      <BadgeCheck
                        className="w-3.5 h-3.5 text-[var(--brand-text)] shrink-0"
                        aria-label={t('common.verifiedDonor')}
                      />
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-muted)] truncate inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />
                    {formatArea(donor.area)}
                  </p>
                  <p className="text-[11px] font-medium text-[var(--brand-text)] tabular-nums">
                    {t('home.activeBatches', { count: donor.activeListings })}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Recent Community Activity */}
        <div className="lg:col-span-5 min-w-0 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
              {t('home.recentActivityTitle')}
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {t('home.recentActivitySubtitle')}
            </p>
          </div>

          <div className="divide-y divide-[var(--border-subtle)]">
            {(summary?.recentActivity ?? []).map((item) => (
              <div key={item.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-[var(--text-primary)] truncate">
                    {item.donorName}
                  </span>
                  <span className="font-medium text-[var(--brand-text)] whitespace-nowrap shrink-0">
                    {activityStatusLabel(item.status)}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] truncate">
                  {item.listingTitle}
                </p>
                <p className="text-[11px] text-[var(--text-muted)] inline-flex items-center gap-2 tabular-nums">
                  <span>
                    {formatNumber(item.quantity)} {formatUnit(item.unit)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />
                    {formatArea(item.area)}
                  </span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer with direct links to Clients, Events, Wedding Pickup, and Support Us */}
      <footer className="pt-5 border-t border-[var(--border-subtle)] space-y-3 text-xs text-[var(--canvas-text-muted)]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="font-display font-bold text-[var(--canvas-text-secondary)] block">
              {t('common.appName')}
            </span>
            <p
              className="font-bangla text-xs text-[var(--canvas-text-muted)] leading-relaxed max-w-md text-balance"
              style={{ fontFamily: 'var(--font-bn)' }}
            >
              {t('common.tagline')}
            </p>
            <p className="mt-0.5">{t('home.footerNote')}</p>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-semibold text-[var(--canvas-text-secondary)]">
            <button
              type="button"
              onClick={onNavigateClients}
              className="hover:text-[var(--brand-text)] cursor-pointer transition-colors"
            >
              {t('nav.clients')}
            </button>
            <button
              type="button"
              onClick={onNavigateEvents}
              className="hover:text-[var(--brand-text)] cursor-pointer transition-colors"
            >
              {t('nav.events')}
            </button>
            <button
              type="button"
              onClick={onNavigateWedding}
              className="hover:text-[var(--brand-text)] cursor-pointer transition-colors"
            >
              {t('nav.weddingPickup')}
            </button>
            <button
              type="button"
              onClick={onNavigateDonate}
              className="hover:text-[var(--brand-text)] cursor-pointer transition-colors"
            >
              {t('nav.donateMoney')}
            </button>
            {onNavigateImpact && (
              <button
                type="button"
                onClick={onNavigateImpact}
                className="hover:text-[var(--brand-text)] cursor-pointer transition-colors"
              >
                {t('nav.impactDashboard')}
              </button>
            )}
            {onNavigateVolunteers && (
              <button
                type="button"
                onClick={onNavigateVolunteers}
                className="hover:text-[var(--brand-text)] cursor-pointer transition-colors"
              >
                {t('nav.volunteerHub')}
              </button>
            )}
            {onNavigateLeaderboard && (
              <button
                type="button"
                onClick={onNavigateLeaderboard}
                className="hover:text-[var(--brand-text)] cursor-pointer transition-colors"
              >
                {t('nav.leaderboard')}
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
