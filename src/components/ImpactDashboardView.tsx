import { useCallback, useEffect, useState } from 'react';
import {
  Award,
  Flame,
  HeartHandshake,
  Leaf,
  Lock,
  LogIn,
  MoonStar,
  QrCode,
  Scale,
  TrendingUp,
  Users,
  Utensils,
} from 'lucide-react';
import type { ImpactDashboardData, User } from '../types';
import { api } from '../lib/api';
import { useI18n } from '../i18n/I18nContext';

interface ImpactDashboardViewProps {
  user: User | null;
  onNavigateVolunteers: () => void;
  onNavigateLeaderboard: () => void;
  onNavigateDonate: () => void;
  onLoginClick: () => void;
}

export function ImpactDashboardView({
  user,
  onNavigateVolunteers,
  onNavigateLeaderboard,
  onNavigateDonate,
  onLoginClick,
}: ImpactDashboardViewProps) {
  const { t, formatNumber } = useI18n();
  const [data, setData] = useState<ImpactDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadImpact = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getImpactDashboard();
      setData(res);
    } catch {
      // Resilient on transient network failure
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadImpact();
  }, [loadImpact, user?.id]);

  const kpis = data
    ? [
        {
          key: 'mealsShared',
          label: t('impact.mealsShared'),
          value: formatNumber(data.mealsShared),
          icon: Utensils,
        },
        {
          key: 'kgSaved',
          label: t('impact.kgSaved'),
          value: formatNumber(data.kgSaved),
          icon: Scale,
        },
        {
          key: 'co2Avoided',
          label: t('impact.co2Avoided'),
          value: formatNumber(data.co2AvoidedKg),
          icon: Leaf,
        },
        {
          key: 'mealsFunded',
          label: t('impact.mealsFunded'),
          value: formatNumber(data.mealsFunded),
          icon: HeartHandshake,
        },
        {
          key: 'qrHandovers',
          label: t('impact.qrHandovers'),
          value: formatNumber(data.qrHandovers),
          icon: QrCode,
        },
        {
          key: 'donationsRaised',
          label: t('impact.donationsRaised'),
          value: `৳${formatNumber(data.raisedBdt)}`,
          icon: TrendingUp,
        },
        {
          key: 'flashActive',
          label: t('impact.flashActive'),
          value: formatNumber(data.flashListingsNow),
          icon: Flame,
        },
        {
          key: 'ramadanTotal',
          label: t('impact.ramadanTotal'),
          value: `৳${formatNumber(data.ramadanDonationsBdt)}`,
          icon: MoonStar,
        },
      ]
    : [];

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <section className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border-subtle)] p-5 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-[var(--brand-text)]">
            <TrendingUp className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{t('nav.impactDashboard')}</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
            {t('impact.title')}
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
            {t('impact.subtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onNavigateVolunteers}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] hover:bg-[var(--brand-soft)] text-xs font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Users className="w-4 h-4 text-[var(--brand-text)] shrink-0" aria-hidden="true" />
            <span>{t('nav.volunteerHub')}</span>
          </button>
          <button
            type="button"
            onClick={onNavigateLeaderboard}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Award className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{t('nav.leaderboard')}</span>
          </button>
        </div>
      </section>

      {/* 8 Live KPI Cards */}
      {loading && !data ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <div
              key={n}
              className="h-28 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {kpis.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.key}
                className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-4 sm:p-5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">
                    {item.label}
                  </span>
                  <Icon className="w-4 h-4 text-[var(--brand-text)] shrink-0" aria-hidden="true" />
                </div>
                <p className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tabular-nums">
                  {item.value}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Split: Personal Contribution + Environmental Equivalence */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <section className="lg:col-span-7 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 sm:p-6 space-y-4">
          <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
            {t('impact.personalTitle')}
          </h2>

          {!user ? (
            <div className="p-5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Lock className="w-4 h-4 text-[var(--brand-text)] shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                  {t('impact.guestPersonalHint')}
                </p>
              </div>
              <button
                type="button"
                onClick={onLoginClick}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <LogIn className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{t('gate.loginBtn')}</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-1">
                <p className="text-xs text-[var(--text-muted)]">{t('impact.personalMeals')}</p>
                <p className="font-display text-2xl font-extrabold text-[var(--brand-text)] tabular-nums">
                  {formatNumber(data?.personal?.mealsImpact ?? 0)}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-1">
                <p className="text-xs text-[var(--text-muted)]">{t('impact.personalDonated')}</p>
                <p className="font-display text-2xl font-extrabold text-[var(--brand-text)] tabular-nums">
                  ৳{formatNumber(data?.personal?.cashDonatedBdt ?? 0)}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-1">
                <p className="text-xs text-[var(--text-muted)]">{t('impact.personalHours')}</p>
                <p className="font-display text-2xl font-extrabold text-[var(--brand-text)] tabular-nums">
                  {formatNumber(data?.personal?.volunteerHours ?? 0)}
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="lg:col-span-5 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 sm:p-6 flex flex-col justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--brand-text)]">
              <Leaf className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t('impact.envTitle')}</span>
            </div>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed tabular-nums">
              {t('impact.envBody', {
                kg: formatNumber(data?.kgSaved ?? 0),
                co2: formatNumber(data?.co2AvoidedKg ?? 0),
                funded: formatNumber(data?.mealsFunded ?? 0),
              })}
            </p>
          </div>
          <div>
            <button
              type="button"
              onClick={onNavigateDonate}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
            >
              <HeartHandshake className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t('home.donateBannerBtn')}</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
