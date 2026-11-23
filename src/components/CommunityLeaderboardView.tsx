import { useCallback, useEffect, useState } from 'react';
import {
  Award,
  BadgeCheck,
  CheckCircle2,
  Download,
  HeartHandshake,
  Lock,
  LogIn,
  MapPin,
  MoonStar,
  QrCode,
  Star,
  Store,
  Trophy,
  Users,
  Utensils,
} from 'lucide-react';
import type { LeaderboardData, User } from '../types';
import { api } from '../lib/api';
import { useI18n } from '../i18n/I18nContext';
import { ShopAvatar } from './ShopAvatar';

interface CommunityLeaderboardViewProps {
  user: User | null;
  onLoginClick: () => void;
}

type LeaderboardTab = 'donors' | 'volunteers' | 'areas';

const BADGE_ICONS: Record<string, typeof Award> = {
  first_rescue: Utensils,
  meal_hero_20: Trophy,
  qr_verifier: QrCode,
  volunteer_star: Users,
  kind_supporter: HeartHandshake,
  ramadan_champion: MoonStar,
};

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function CommunityLeaderboardView({
  user,
  onLoginClick,
}: CommunityLeaderboardViewProps) {
  const { lang, t, formatNumber, formatArea } = useI18n();
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('donors');

  const loadLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getLeaderboard();
      setData(res);
    } catch {
      // Resilient fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard, user?.id]);

  const handleDownloadCertificate = () => {
    if (!user || !data) return;
    const recipientName = escapeXml(user.donorProfile?.businessName || user.organizationName || user.name);
    const issuedDate = escapeXml(new Date().toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-US'));
    const meals = escapeXml(formatNumber(data.myStats.mealsTotal));
    const hours = escapeXml(formatNumber(data.myStats.volunteerHours));
    const donated = escapeXml(`৳${formatNumber(data.myStats.donationsBdt)}`);

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="620" viewBox="0 0 960 620">
  <rect width="960" height="620" rx="24" fill="#f8fafc"/>
  <rect x="24" y="24" width="912" height="572" rx="18" fill="#ffffff" stroke="#15803d" stroke-width="3"/>
  <rect x="40" y="40" width="880" height="540" rx="12" fill="none" stroke="#cbd5e1" stroke-width="1"/>
  <text x="480" y="108" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" font-weight="700" fill="#15803d" letter-spacing="3">RIZIK</text>
  <text x="480" y="158" text-anchor="middle" font-family="system-ui, sans-serif" font-size="34" font-weight="800" fill="#0f172a">COMMUNITY IMPACT CERTIFICATE</text>
  <text x="480" y="218" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" fill="#475569">Proudly presented to</text>
  <text x="480" y="270" text-anchor="middle" font-family="system-ui, sans-serif" font-size="32" font-weight="800" fill="#15803d">${recipientName}</text>
  <line x1="220" y1="292" x2="740" y2="292" stroke="#cbd5e1" stroke-width="1.5"/>
  <text x="480" y="332" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" fill="#334155">For rescuing surplus food and supporting zero-waste community meals across Dhaka.</text>
  <rect x="110" y="370" width="220" height="104" rx="12" fill="#f1f5f9" stroke="#e2e8f0"/>
  <text x="220" y="416" text-anchor="middle" font-family="system-ui, sans-serif" font-size="28" font-weight="800" fill="#0f172a">${meals}</text>
  <text x="220" y="446" text-anchor="middle" font-family="system-ui, sans-serif" font-size="13" fill="#475569">Meals Rescued / Shared</text>
  <rect x="370" y="370" width="220" height="104" rx="12" fill="#f1f5f9" stroke="#e2e8f0"/>
  <text x="480" y="416" text-anchor="middle" font-family="system-ui, sans-serif" font-size="28" font-weight="800" fill="#0f172a">${hours}h</text>
  <text x="480" y="446" text-anchor="middle" font-family="system-ui, sans-serif" font-size="13" fill="#475569">Volunteer Hours</text>
  <rect x="630" y="370" width="220" height="104" rx="12" fill="#f1f5f9" stroke="#e2e8f0"/>
  <text x="740" y="416" text-anchor="middle" font-family="system-ui, sans-serif" font-size="28" font-weight="800" fill="#0f172a">${donated}</text>
  <text x="740" y="446" text-anchor="middle" font-family="system-ui, sans-serif" font-size="13" fill="#475569">Financial Support</text>
  <text x="110" y="542" font-family="system-ui, sans-serif" font-size="13" fill="#64748b">Issued: ${issuedDate}</text>
  <text x="850" y="542" text-anchor="end" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#15803d">Verified Community Impact Ledger</text>
</svg>`;

    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Rizik-Impact-Certificate.svg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <section className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border-subtle)] p-5 sm:p-8 space-y-2">
        <div className="inline-flex items-center gap-2 text-xs font-bold text-[var(--brand-text)]">
          <Trophy className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{t('nav.leaderboard')}</span>
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
          {t('community.title')}
        </h1>
        <p className="text-xs sm:text-sm text-[var(--text-secondary)] max-w-2xl leading-relaxed">
          {t('community.subtitle')}
        </p>
      </section>

      {/* Milestone Badges Grid */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-[var(--canvas-text-primary)]">
            {t('community.badgesTitle')}
          </h2>
          {!user && (
            <p className="text-xs text-[var(--canvas-text-muted)]">
              {t('community.guestBadgesHint')}
            </p>
          )}
        </div>

        {loading && !data ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div
                key={n}
                className="h-32 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(data?.myBadges ?? []).map((badge) => {
              const Icon = BADGE_ICONS[badge.id] ?? Award;
              const pct = Math.min(100, Math.round((badge.progress / Math.max(1, badge.target)) * 100));
              return (
                <div
                  key={badge.id}
                  className={`bg-[var(--bg-surface)] rounded-2xl border p-4 space-y-3 ${
                    badge.unlocked
                      ? 'border-[var(--brand-primary)]/60'
                      : 'border-[var(--border-subtle)] opacity-85'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          badge.unlocked
                            ? 'bg-[var(--brand-soft)] text-[var(--brand-text)]'
                            : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
                        }`}
                      >
                        <Icon className="w-5 h-5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-display text-sm font-bold text-[var(--text-primary)]">
                          {t(`community.badges.${badge.id}.title`)}
                        </p>
                        <p className="text-xs text-[var(--text-muted)] leading-snug mt-0.5">
                          {t(`community.badges.${badge.id}.desc`)}
                        </p>
                      </div>
                    </div>
                    {badge.unlocked ? (
                      <CheckCircle2 className="w-4 h-4 text-[var(--brand-text)] shrink-0" aria-hidden="true" />
                    ) : (
                      <Lock className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" aria-hidden="true" />
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-semibold tabular-nums">
                      <span
                        className={
                          badge.unlocked ? 'text-[var(--brand-text)]' : 'text-[var(--text-muted)]'
                        }
                      >
                        {badge.unlocked ? t('community.unlocked') : t('community.locked')}
                      </span>
                      <span className="font-mono text-[var(--text-secondary)]">
                        {formatNumber(badge.progress)} / {formatNumber(badge.target)}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[var(--bg-subtle)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--brand-primary)] transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Split: 3-Tab Leaderboard + Downloadable SVG Certificate */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <section className="lg:col-span-7 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {(['donors', 'volunteers', 'areas'] as LeaderboardTab[]).map((tabId) => (
              <button
                key={tabId}
                type="button"
                onClick={() => setActiveTab(tabId)}
                className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                  activeTab === tabId
                    ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]'
                    : 'bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-secondary)]'
                }`}
              >
                {t(`community.tabs.${tabId}`)}
              </button>
            ))}
          </div>

          {activeTab === 'donors' && (
            <div className="divide-y divide-[var(--border-subtle)]">
              {(data?.topDonors ?? []).map((donor, idx) => (
                <div key={donor.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 text-xs font-mono font-bold text-[var(--text-muted)] tabular-nums shrink-0">
                      #{formatNumber(idx + 1)}
                    </span>
                    <ShopAvatar name={donor.businessName} imageUrl={donor.logoUrl} size="sm" />
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-[var(--text-primary)] truncate flex items-center gap-1">
                        <span className="truncate">{donor.businessName}</span>
                        {donor.verified && (
                          <BadgeCheck className="w-3.5 h-3.5 text-[var(--brand-text)] shrink-0" />
                        )}
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)] truncate flex items-center gap-1.5">
                        <span>{formatArea(donor.area)}</span>
                        {donor.avgRating > 0 && (
                          <span className="inline-flex items-center gap-0.5 tabular-nums text-amber-600 dark:text-amber-400">
                            · <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                            {formatNumber(donor.avgRating.toFixed(1))}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-[var(--brand-text)] tabular-nums shrink-0">
                    {t('community.mealsUnit', { count: formatNumber(donor.mealsSaved) })}
                  </span>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'volunteers' && (
            <div className="divide-y divide-[var(--border-subtle)]">
              {(data?.topVolunteers ?? []).map((vol, idx) => (
                <div key={vol.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 text-xs font-mono font-bold text-[var(--text-muted)] tabular-nums shrink-0">
                      #{formatNumber(idx + 1)}
                    </span>
                    <div className="w-9 h-9 rounded-xl bg-[var(--brand-soft)] text-[var(--brand-text)] flex items-center justify-center shrink-0">
                      <Users className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-[var(--text-primary)] truncate">
                        {vol.organizationName || vol.name}
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)] truncate">
                        {formatArea(vol.area)}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-[var(--brand-text)] tabular-nums shrink-0">
                    {t('community.hoursUnit', {
                      hours: formatNumber(vol.hoursLogged),
                      events: formatNumber(vol.eventsCount),
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'areas' && (
            <div className="divide-y divide-[var(--border-subtle)]">
              {(data?.topAreas ?? []).map((areaRow, idx) => (
                <div key={areaRow.area} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 text-xs font-mono font-bold text-[var(--text-muted)] tabular-nums shrink-0">
                      #{formatNumber(idx + 1)}
                    </span>
                    <div className="w-9 h-9 rounded-xl bg-[var(--brand-soft)] text-[var(--brand-text)] flex items-center justify-center shrink-0">
                      <MapPin className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-[var(--text-primary)] truncate">
                        {formatArea(areaRow.area)}
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)] truncate tabular-nums">
                        {t('community.portionsUnit', {
                          count: formatNumber(areaRow.totalPortions),
                          listings: formatNumber(areaRow.listingsCount),
                        })}
                      </p>
                    </div>
                  </div>
                  <Store className="w-4 h-4 text-[var(--text-muted)] shrink-0" aria-hidden="true" />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Certificate Generator Card */}
        <section className="lg:col-span-5 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 sm:p-6 space-y-4">
          <div className="w-11 h-11 rounded-2xl bg-[var(--brand-soft)] text-[var(--brand-text)] flex items-center justify-center">
            <Award className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
              {t('community.certTitle')}
            </h2>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
              {t('community.certDesc')}
            </p>
          </div>

          {user && data ? (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] grid grid-cols-3 gap-2 text-center tabular-nums">
                <div>
                  <p className="text-sm font-extrabold text-[var(--brand-text)]">
                    {formatNumber(data.myStats.mealsTotal)}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)]">{t('impact.personalMeals')}</p>
                </div>
                <div>
                  <p className="text-sm font-extrabold text-[var(--brand-text)]">
                    {formatNumber(data.myStats.volunteerHours)}h
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)]">{t('impact.personalHours')}</p>
                </div>
                <div>
                  <p className="text-sm font-extrabold text-[var(--brand-text)]">
                    ৳{formatNumber(data.myStats.donationsBdt)}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)]">{t('impact.personalDonated')}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDownloadCertificate}
                className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{t('community.downloadCertBtn')}</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onLoginClick}
              className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogIn className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t('gate.loginBtn')}</span>
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
