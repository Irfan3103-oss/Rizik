import { useEffect, useState } from 'react';
import {
  Award,
  BadgeCheck,
  Ban,
  CheckCircle2,
  Clock,
  Eye,
  Globe,
  HeartHandshake,
  HeartPulse,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  MessageCircle,
  MoonStar,
  Paintbrush,
  Palette,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
  Wrench,
  XCircle,
} from 'lucide-react';
import type { AuthSession, DonationRecord, User } from '../types';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { ensureAccount, type EnsureAccountReport } from '../lib/ensureAccountService';
import {
  subscribeMyFirestoreDonations,
  updateFirebaseUserProfile,
} from '../lib/firestoreService';
import { updateMyDiscoverableSetting } from '../lib/messengerService';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeContext';
import { RestaurantResubmitModal } from './RestaurantResubmitModal';
import { BackgroundSection, ThemePalettePanel } from './ThemePalettePopover';

interface ProfileSettingsViewProps {
  user: User | null;
  onUserUpdated: (user: User) => void;
  onSwitchSession: (session: AuthSession) => void;
  onSignOut: () => void;
  blockedList?: { uid: string; name: string; handle?: string }[];
  onUnblockUser?: (uid: string, name: string) => Promise<void> | void;
  onNavigateDonate?: () => void;
  onNavigateImpact?: () => void;
  onNavigateVolunteers?: () => void;
  onNavigateLeaderboard?: () => void;
  onNavigateAdmin?: () => void;
  onOpenAdminChat?: () => void;
  onRunHealthCheck?: () => void;
  onLoginClick?: () => void;
  onSignupClick?: () => void;
}

const KNOWN_AREAS = [
  'Dhanmondi',
  'Gulshan 2',
  'Banani',
  'Uttara',
  'Mirpur 10',
  'Motijheel',
  'Mohammadpur',
];

export function ProfileSettingsView({
  user,
  onUserUpdated,
  onSwitchSession,
  onSignOut,
  blockedList = [],
  onUnblockUser,
  onNavigateDonate,
  onNavigateImpact,
  onNavigateVolunteers,
  onNavigateLeaderboard,
  onNavigateAdmin,
  onOpenAdminChat,
  onRunHealthCheck,
  onLoginClick,
  onSignupClick,
}: ProfileSettingsViewProps) {
  const { lang, setLang, t, formatNumber, formatArea } = useI18n();
  const { ramadanMode, toggleRamadanMode } = useTheme();
  const {
    firebaseUser,
    firebaseAuthReady,
    isFirebaseSession,
    isFirebaseVerified,
    isAdmin,
    refreshFirebaseVerification,
    resendFirebaseVerification,
  } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [area, setArea] = useState(user?.area ?? 'Dhanmondi');
  const [savedRadiusKm, setSavedRadiusKm] = useState(user?.savedRadiusKm ?? 10);
  const [businessName, setBusinessName] = useState(user?.donorProfile?.businessName ?? '');
  const [hours, setHours] = useState(user?.donorProfile?.hours ?? '');
  const [discoverable, setDiscoverable] = useState(user?.discoverable ?? true);
  const [discoverableBusy, setDiscoverableBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const [repairBusy, setRepairBusy] = useState(false);
  const [repairReport, setRepairReport] = useState<EnsureAccountReport | null>(null);
  const [resubmitOpen, setResubmitOpen] = useState(false);
  const [myDonations, setMyDonations] = useState<DonationRecord[]>([]);
  const [demoAccounts, setDemoAccounts] = useState<
    {
      id: string;
      role: string;
      name: string;
      area: string;
      organization_name?: string | null;
      business_name?: string | null;
    }[]
  >([]);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setArea(user.area);
    setSavedRadiusKm(user.savedRadiusKm);
    setBusinessName(user.donorProfile?.businessName ?? '');
    setHours(user.donorProfile?.hours ?? '');
    setDiscoverable(user.discoverable ?? true);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setMyDonations([]);
      setDemoAccounts([]);
      return;
    }
    api
      .getDemoAccounts()
      .then((res) => setDemoAccounts(res.accounts))
      .catch(() => {});

    if (isFirebaseVerified && firebaseAuthReady && firebaseUser) {
      const unsub = subscribeMyFirestoreDonations(firebaseUser.uid, (items) => {
        setMyDonations(items);
      });
      return () => unsub();
    }

    if (!isFirebaseSession) {
      api
        .getMyDonations()
        .then((res) => setMyDonations(res.donations))
        .catch(() => {});
    }
  }, [user?.id, isFirebaseSession, isFirebaseVerified, firebaseAuthReady, firebaseUser]);

  const handleLanguageSwitch = () => {
    const nextLang = lang === 'en' ? 'bn' : 'en';
    setLang(nextLang);
    if (user) {
      if (isFirebaseSession) {
        if (isFirebaseVerified && firebaseUser) {
          updateFirebaseUserProfile(firebaseUser, { language: nextLang })
            .then((updated) => onUserUpdated(updated))
            .catch(() => {});
        }
      } else {
        api
          .updateProfile({ language: nextLang })
          .then((res) => onUserUpdated(res.user))
          .catch(() => {});
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setSavedMsg(null);
    try {
      if (isFirebaseSession) {
        if (!isFirebaseVerified || !firebaseUser) {
          setSavedMsg(t('settings.unverifiedBanner'));
          return;
        }
        const updated = await updateFirebaseUserProfile(firebaseUser, {
          displayName: name,
          area,
          savedRadiusKm,
          language: lang,
          discoverable,
          businessName: user.role === 'donor' ? businessName || name : undefined,
          hours: user.role === 'donor' ? hours : undefined,
        });
        onUserUpdated(updated);
      } else {
        const res = await api.updateProfile({
          name,
          area,
          savedRadiusKm,
          language: lang,
          businessName: user.role === 'donor' ? businessName : undefined,
          hours: user.role === 'donor' ? hours : undefined,
        });
        onUserUpdated(res.user);
      }
      setSavedMsg(t('settings.savedPreferences'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleDiscoverable = async () => {
    if (!user || discoverableBusy) return;
    const nextVal = !discoverable;
    setDiscoverable(nextVal);
    if (isFirebaseSession && isFirebaseVerified && firebaseUser) {
      setDiscoverableBusy(true);
      try {
        await updateMyDiscoverableSetting(firebaseUser.uid, nextVal);
        onUserUpdated({ ...user, discoverable: nextVal });
      } catch {
        setDiscoverable(!nextVal);
      } finally {
        setDiscoverableBusy(false);
      }
    } else {
      onUserUpdated({ ...user, discoverable: nextVal });
    }
  };

  const handleCheckVerification = async () => {
    setVerifyBusy(true);
    setVerifyMsg(null);
    try {
      const ok = await refreshFirebaseVerification();
      setVerifyMsg(ok ? t('settings.verifiedSuccessNotice') : t('settings.stillUnverifiedNotice'));
    } catch {
      setVerifyMsg(t('settings.stillUnverifiedNotice'));
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleResendVerification = async () => {
    setVerifyBusy(true);
    setVerifyMsg(null);
    try {
      await resendFirebaseVerification();
      setVerifyMsg(t('settings.verificationSentNotice'));
    } catch {
      setVerifyMsg(t('settings.stillUnverifiedNotice'));
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleRepairAccount = async () => {
    if (!firebaseUser || !user || repairBusy) return;
    setRepairBusy(true);
    setRepairReport(null);
    try {
      const report = await ensureAccount(firebaseUser, user, { force: true });
      setRepairReport(report);
      if (report.refreshedUser) {
        onUserUpdated(report.refreshedUser);
      }
    } finally {
      setRepairBusy(false);
    }
  };

  const handleQuickSwitch = async (userId: string) => {
    const session = await api.demoLogin(userId);
    onSwitchSession(session);
  };

  const userRoleLabel =
    user?.accountType === 'restaurantOwner'
      ? t('auth.accountTypes.restaurantOwnerTitle')
      : user && (user.role === 'donor' || user.role === 'recipient' || user.role === 'admin')
        ? t(`settings.roles.${user.role}`)
        : user?.role ?? '';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {user?.accountType === 'restaurantOwner' && user.restaurant && (
        <RestaurantResubmitModal
          open={resubmitOpen}
          restaurant={user.restaurant}
          onClose={() => setResubmitOpen(false)}
          onResubmitted={(updated) => onUserUpdated(updated)}
        />
      )}
      {/* Left: Language / Profile + Theme & Appearance + Background */}
      <div className="lg:col-span-7 min-w-0 space-y-6">
        {user ? (
          <form
            onSubmit={handleSave}
            className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 sm:p-6 space-y-5 shadow-xs"
          >
            <div className="flex flex-wrap sm:flex-nowrap items-start justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
                    {user.donorProfile?.businessName || user.name}
                  </h2>
                  {user.verified && (
                    <BadgeCheck
                      className="w-4 h-4 text-[var(--brand-text)]"
                      aria-label={t('common.verifiedDonor')}
                    />
                  )}
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {userRoleLabel} · {user.email} {user.phone ? `· ${user.phone}` : ''}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {user.handle && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--brand-text)]">
                      {user.handle}
                    </span>
                  )}
                  {isFirebaseSession && (
                    <span className="text-[11px] font-semibold text-[var(--brand-text)]">
                      {t('settings.firebaseAccountBadge')}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                className="min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/35 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                {t('settings.signOut')}
              </button>
            </div>

            {isFirebaseSession && !isFirebaseVerified && (
              <div className="p-3.5 rounded-xl bg-[var(--brand-accent-soft)] border border-[var(--brand-accent)]/40 space-y-2.5">
                <p className="text-xs font-medium text-[var(--text-primary)] leading-relaxed">
                  {t('settings.unverifiedBanner')}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={verifyBusy}
                    onClick={handleCheckVerification}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {t('settings.checkVerificationBtn')}
                  </button>
                  <button
                    type="button"
                    disabled={verifyBusy}
                    onClick={handleResendVerification}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {t('settings.resendVerificationBtn')}
                  </button>
                </div>
                {verifyMsg && (
                  <p className="text-[11px] font-semibold text-[var(--brand-text)]">{verifyMsg}</p>
                )}
              </div>
            )}

            {isAdmin && onNavigateAdmin && (
              <div className="p-3.5 rounded-xl bg-[var(--brand-soft)] border border-[var(--brand-primary)]/30 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[var(--brand-text)]">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{t('admin.adminAccountBadge')}</span>
                </div>
                <button
                  type="button"
                  onClick={onNavigateAdmin}
                  className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold cursor-pointer"
                >
                  {t('admin.openAdminAreaBtn')}
                </button>
              </div>
            )}

            {user.accountType === 'restaurantOwner' && user.restaurant && (
              <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold text-[var(--text-primary)]">
                    {user.restaurant.restaurantName}
                  </p>
                  {user.restaurant.verificationStatus === 'approved' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                      <BadgeCheck className="w-3.5 h-3.5" />
                      {t('restaurant.statuses.approved')}
                    </span>
                  ) : user.restaurant.verificationStatus === 'rejected' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300">
                      <XCircle className="w-3.5 h-3.5" />
                      {t('restaurant.statuses.rejected')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                      <Clock className="w-3.5 h-3.5" />
                      {t('restaurant.statuses.pending')}
                    </span>
                  )}
                </div>

                {user.restaurant.verificationStatus === 'pending' && (
                  <p className="text-xs text-[var(--text-secondary)]">
                    {t('restaurant.pendingBannerBody')}
                  </p>
                )}
                {user.restaurant.verificationStatus === 'rejected' &&
                  user.restaurant.rejectionReason && (
                    <p className="text-xs text-red-700 dark:text-red-300">
                      <strong>{t('restaurant.rejectionReasonHeading')}:</strong>{' '}
                      {user.restaurant.rejectionReason}
                    </p>
                  )}

                <div className="flex flex-wrap gap-2 pt-0.5">
                  {user.restaurant.verificationStatus === 'rejected' && (
                    <button
                      type="button"
                      onClick={() => setResubmitOpen(true)}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] text-xs font-semibold cursor-pointer"
                    >
                      {t('restaurant.updateAndResubmitBtn')}
                    </button>
                  )}
                  {onOpenAdminChat && (
                    <button
                      type="button"
                      onClick={onOpenAdminChat}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-[var(--brand-text)]" />
                      {t('restaurant.messageTeamBtn')}
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="prof-name" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {t('settings.fullName')}
                </label>
                <input
                  id="prof-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                />
              </div>
              <div>
                <label htmlFor="prof-area" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {t('settings.area')}
                </label>
                <input
                  id="prof-area"
                  type="text"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                />
              </div>
            </div>

            {user.role === 'donor' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="prof-biz" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    {t('settings.businessName')}
                  </label>
                  <input
                    id="prof-biz"
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                  />
                </div>
                <div>
                  <label htmlFor="prof-hours" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    {t('settings.hours')}
                  </label>
                  <input
                    id="prof-hours"
                    type="text"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                  />
                </div>
              </div>
            )}

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1.5 text-[var(--text-secondary)]">
                <label htmlFor="prof-radius">{t('settings.radiusLabel')}</label>
                <span className="font-mono tabular-nums text-[var(--brand-text)]">
                  {formatNumber(savedRadiusKm)} {t('feed.km')}
                </span>
              </div>
              <input
                id="prof-radius"
                type="range"
                min={2}
                max={25}
                value={savedRadiusKm}
                onChange={(e) => setSavedRadiusKm(Number(e.target.value))}
                style={{ accentColor: 'var(--brand-primary)' }}
                className="w-full"
              />
            </div>

            {/* Language Switcher */}
            <div className="pt-2 space-y-3">
              <button
                type="button"
                onClick={handleLanguageSwitch}
                className="w-full min-h-[48px] min-w-0 px-4 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                <span className="inline-flex items-center gap-2">
                  <Globe className="w-4 h-4 text-[var(--brand-text)] shrink-0" />
                  {t('settings.language')}
                </span>
                <span className="font-semibold text-[var(--brand-text)] whitespace-nowrap">
                  {lang === 'en' ? t('common.english') : t('common.bangla')}
                </span>
              </button>

              {isFirebaseSession && isFirebaseVerified && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={discoverable}
                  disabled={discoverableBusy}
                  onClick={handleToggleDiscoverable}
                  className="w-full min-h-[52px] px-4 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/50 flex items-center justify-between gap-4 text-left cursor-pointer disabled:opacity-60"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Eye className="w-4 h-4 text-[var(--brand-text)] shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-[var(--text-primary)]">
                        {t('settings.discoverableLabel')}
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-snug">
                        {t('settings.discoverableDesc')}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors ${
                      discoverable
                        ? 'bg-[var(--brand-primary)] border-[var(--brand-primary)]'
                        : 'bg-[var(--bg-surface)] border-[var(--border-strong)]'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-white shadow-xs transition-transform ${
                        discoverable ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </span>
                </button>
              )}
            </div>

            {savedMsg && (
              <p className="text-xs font-medium text-[var(--brand-text)]">{savedMsg}</p>
            )}

            {isFirebaseSession && firebaseUser && (
              <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/55 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">
                      {t('account.repairSectionTitle')}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-snug">
                      {t('account.repairSectionDesc')}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {isFirebaseVerified && (
                      <button
                        type="button"
                        disabled={repairBusy}
                        onClick={handleRepairAccount}
                        className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--brand-soft)] hover:bg-[var(--brand-primary)] hover:text-[var(--brand-primary-fg)] text-[var(--brand-text)] text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
                      >
                        {repairBusy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Wrench className="w-3.5 h-3.5" />
                        )}
                        <span>{t('account.repairAccountBtn')}</span>
                      </button>
                    )}
                    {onRunHealthCheck && (
                      <button
                        type="button"
                        onClick={onRunHealthCheck}
                        className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-[var(--bg-subtle)] cursor-pointer"
                      >
                        <HeartPulse className="w-3.5 h-3.5 text-[var(--brand-text)]" />
                        <span>{t('healthCheck.runBtn')}</span>
                      </button>
                    )}
                  </div>
                </div>

                {repairReport && (
                  <div className="rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 bg-[var(--bg-surface)] p-3 space-y-1.5 text-xs">
                    <div className="font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>
                        {t('account.repairSummary', {
                          fixed: formatNumber(repairReport.fixedCount),
                          errors: formatNumber(repairReport.errorCount),
                        })}
                      </span>
                    </div>
                    <ul className="space-y-1 text-[11px] text-[var(--text-secondary)]">
                      {repairReport.steps.map((step) => (
                        <li key={step.id} className="flex items-start gap-1.5">
                          <span
                            className={`mt-0.5 font-bold ${
                              step.status === 'error'
                                ? 'text-rose-600'
                                : step.status === 'fixed'
                                  ? 'text-emerald-600'
                                  : 'text-[var(--text-muted)]'
                            }`}
                          >
                            {step.status === 'error'
                              ? '✕'
                              : step.status === 'fixed'
                                ? '✓ Fixed'
                                : '✓'}
                          </span>
                          <span>
                            <strong>{lang === 'bn' ? step.labelBn : step.label}:</strong>{' '}
                            {lang === 'bn' ? step.detailBn : step.detail}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="min-h-[48px] px-6 py-2.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-sm font-semibold cursor-pointer"
            >
              {saving ? t('settings.savingPreferences') : t('settings.savePreferences')}
            </button>
          </form>
        ) : (
          <section className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 sm:p-6 space-y-4 shadow-xs">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-[var(--brand-text)] shrink-0" aria-hidden="true" />
              <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                {t('settings.language')}
              </h2>
            </div>
            <button
              type="button"
              onClick={handleLanguageSwitch}
              className="w-full min-h-[48px] min-w-0 px-4 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/50 flex items-center justify-between gap-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            >
              <span className="inline-flex items-center gap-2">
                <Globe className="w-4 h-4 text-[var(--brand-text)] shrink-0" />
                {t('settings.language')}
              </span>
              <span className="font-semibold text-[var(--brand-text)] whitespace-nowrap">
                {lang === 'en' ? t('common.english') : t('common.bangla')}
              </span>
            </button>
          </section>
        )}

        {/* Ramadan / Eid Seasonal Mode Toggle (available to everyone) */}
        <section className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 sm:p-6 shadow-xs">
          <button
            type="button"
            role="switch"
            aria-checked={ramadanMode}
            onClick={toggleRamadanMode}
            className="w-full min-h-[48px] flex items-center justify-between gap-4 text-left cursor-pointer"
          >
            <div className="flex items-start gap-3 min-w-0">
              <MoonStar className="w-5 h-5 text-[var(--brand-text)] shrink-0 mt-0.5" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-display text-sm sm:text-base font-bold text-[var(--text-primary)]">
                  {t('ramadan.modeLabel')}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {t('ramadan.modeDesc')}
                </p>
              </div>
            </div>
            <span
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors ${
                ramadanMode
                  ? 'bg-[var(--brand-primary)] border-[var(--brand-primary)]'
                  : 'bg-[var(--bg-subtle)] border-[var(--border-strong)]'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow-xs transition-transform ${
                  ramadanMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </span>
          </button>
        </section>

        {/* Theme & Appearance Section */}
        <section className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 sm:p-6 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-[var(--brand-text)] shrink-0" aria-hidden="true" />
            <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
              {t('palette.sectionTitle')}
            </h3>
          </div>
          <ThemePalettePanel showBackground={false} />
        </section>

        {/* Background Section */}
        <section className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 sm:p-6 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <Paintbrush className="w-4 h-4 text-[var(--brand-text)] shrink-0" aria-hidden="true" />
            <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
              {t('background.title')}
            </h3>
          </div>
          <BackgroundSection />
        </section>
      </div>

      {/* Right: Account Card (Guests) OR Role Switcher + My Donations (Logged-in) */}
      <div className="lg:col-span-5 min-w-0 space-y-5">
        {!user ? (
          <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-6 space-y-4 shadow-xs">
            <div className="w-11 h-11 rounded-2xl bg-[var(--brand-soft)] text-[var(--brand-text)] flex items-center justify-center">
              <Lock className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
                {t('settings.guestAccountTitle')}
              </h3>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                {t('settings.guestAccountDesc')}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              {onLoginClick && (
                <button
                  type="button"
                  onClick={onLoginClick}
                  className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogIn className="w-4 h-4 shrink-0" aria-hidden="true" />
                  {t('gate.loginBtn')}
                </button>
              )}
              {onSignupClick && (
                <button
                  type="button"
                  onClick={onSignupClick}
                  className="flex-1 min-h-[44px] px-4 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] hover:bg-[var(--brand-soft)] text-[var(--text-primary)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4 text-[var(--brand-text)] shrink-0" aria-hidden="true" />
                  {t('gate.signupBtn')}
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 space-y-3 shadow-xs">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-[var(--brand-text)] shrink-0" />
                <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
                  {t('settings.switchDemoTitle')}
                </h3>
              </div>
              <p className="text-xs text-[var(--text-muted)]">{t('settings.switchDemoSubtitle')}</p>
              <div className="space-y-2">
                {demoAccounts.map((acc) => {
                  const isCurrent = acc.id === user.id;
                  const accRoleLabel =
                    acc.role === 'donor' || acc.role === 'recipient' || acc.role === 'admin'
                      ? t(`settings.roles.${acc.role}`)
                      : acc.role;
                  const accAreaLabel = formatArea(acc.area);
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      disabled={isCurrent}
                      onClick={() => handleQuickSwitch(acc.id)}
                      className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border text-left transition-colors flex items-center justify-between gap-2 ${
                        isCurrent
                          ? 'border-[var(--brand-primary)] bg-[var(--brand-soft)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] cursor-pointer'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[var(--text-primary)] truncate">
                          {acc.business_name || acc.organization_name || acc.name}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)] truncate">
                          {accRoleLabel} · {accAreaLabel}
                        </p>
                      </div>
                      <span className="text-[11px] font-semibold text-[var(--brand-text)] shrink-0 whitespace-nowrap">
                        {isCurrent ? t('settings.activeBadge') : t('settings.switchBtn')}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* My Donations History */}
            <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 space-y-3 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <HeartHandshake className="w-4 h-4 text-[var(--brand-text)] shrink-0" aria-hidden="true" />
                  <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
                    {t('settings.myDonationsTitle')}
                  </h3>
                </div>
                {onNavigateDonate && (
                  <button
                    type="button"
                    onClick={onNavigateDonate}
                    className="text-xs font-semibold text-[var(--brand-text)] hover:underline cursor-pointer whitespace-nowrap"
                  >
                    {t('settings.donateNowLink')}
                  </button>
                )}
              </div>
              <p className="text-xs text-[var(--text-muted)]">{t('settings.myDonationsSubtitle')}</p>

              {myDonations.length === 0 ? (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-4 text-center space-y-2">
                  <p className="text-xs text-[var(--text-secondary)]">{t('settings.noDonationsYet')}</p>
                  {onNavigateDonate && (
                    <button
                      type="button"
                      onClick={onNavigateDonate}
                      className="min-h-[38px] px-4 py-1.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold cursor-pointer"
                    >
                      {t('settings.donateNowLink')}
                    </button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-[var(--border-subtle)]">
                  {myDonations.map((d) => (
                    <div key={d.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[var(--text-primary)] truncate">
                          {t(`donate.causes.${d.cause}`)}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)] truncate font-mono">
                          {d.receiptCode} · {t(`donate.methods.${d.paymentMethod}`)} ·{' '}
                          {new Date(d.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="text-xs font-extrabold text-[var(--brand-text)] tabular-nums shrink-0">
                        ৳{formatNumber(d.amountBdt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {isFirebaseSession && isFirebaseVerified && (
              <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 space-y-3 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Ban className="w-4 h-4 text-[var(--brand-accent-text)] shrink-0" aria-hidden="true" />
                    <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
                      {t('settings.blockedUsersLabel')}
                    </h3>
                  </div>
                  <span className="text-[11px] font-semibold text-[var(--text-muted)] tabular-nums">
                    {formatNumber(blockedList.length)}
                  </span>
                </div>

                {blockedList.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">{t('settings.noBlockedUsers')}</p>
                ) : (
                  <div className="divide-y divide-[var(--border-subtle)]">
                    {blockedList.map((entry) => (
                      <div
                        key={entry.uid}
                        className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[var(--text-primary)] truncate">
                            {entry.name}
                          </p>
                          {entry.handle && (
                            <p className="text-[11px] text-[var(--text-muted)] truncate">
                              {entry.handle}
                            </p>
                          )}
                        </div>
                        {onUnblockUser && (
                          <button
                            type="button"
                            onClick={() => void onUnblockUser(entry.uid, entry.name)}
                            className="min-h-[32px] px-3 py-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:bg-[var(--brand-soft)] text-[11px] font-semibold text-[var(--text-primary)] shrink-0 cursor-pointer"
                          >
                            {t('settings.unblockBtn')}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {(onNavigateImpact || onNavigateVolunteers || onNavigateLeaderboard) && (
          <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 space-y-2.5 shadow-xs">
            <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
              {t('nav.more')}
            </h3>
            <div className="space-y-1.5">
              {onNavigateImpact && (
                <button
                  type="button"
                  onClick={onNavigateImpact}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--brand-primary)] text-xs font-semibold text-[var(--text-primary)] flex items-center gap-2.5 cursor-pointer"
                >
                  <TrendingUp className="w-4 h-4 text-[var(--brand-text)] shrink-0" aria-hidden="true" />
                  <span>{t('nav.impactDashboard')}</span>
                </button>
              )}
              {onNavigateVolunteers && (
                <button
                  type="button"
                  onClick={onNavigateVolunteers}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--brand-primary)] text-xs font-semibold text-[var(--text-primary)] flex items-center gap-2.5 cursor-pointer"
                >
                  <Users className="w-4 h-4 text-[var(--brand-text)] shrink-0" aria-hidden="true" />
                  <span>{t('nav.volunteerHub')}</span>
                </button>
              )}
              {onNavigateLeaderboard && (
                <button
                  type="button"
                  onClick={onNavigateLeaderboard}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--brand-primary)] text-xs font-semibold text-[var(--text-primary)] flex items-center gap-2.5 cursor-pointer"
                >
                  <Award className="w-4 h-4 text-[var(--brand-accent-text)] shrink-0" aria-hidden="true" />
                  <span>{t('nav.leaderboard')}</span>
                </button>
              )}
            </div>
          </div>
        )}

        <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
            <Sparkles className="w-4 h-4 text-[var(--brand-accent-text)] shrink-0" />
            <span>{t('settings.phase2Title')}</span>
          </div>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            {t('settings.phase2Desc')}
          </p>
        </div>
      </div>
    </div>
  );
}
