import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock,
  Database,
  ExternalLink,
  FileCheck2,
  HeartPulse,
  Loader2,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Store,
  Trash2,
  User as UserIcon,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import {
  ensureAdminConversationForOwner,
  reviewRestaurantApplication,
} from '../lib/adminChatService';
import {
  removeAllDemoData,
  seedAllDemoData,
  type DemoSeedProgress,
  type DemoSeedSummary,
} from '../lib/communityRoomsService';
import { runHealthCheck, type HealthCheckReport } from '../lib/healthCheckService';
import type {
  RestaurantOwnerApplication,
  RestaurantVerificationStatus,
} from '../types';
import { StaticOsmMap } from './LocationMessageCard';
import { PhotoLightbox } from './PhotoLightbox';
import { ShopAvatar } from './ShopAvatar';
import { useI18n } from '../i18n/I18nContext';

interface AdminApplicationsViewProps {
  applications: RestaurantOwnerApplication[];
  selectedOwnerUid?: string | null;
  onSelectOwnerUid?: (uid: string | null) => void;
  demoProfilesCount?: number;
  communityRoomsCount?: number;
  onMessageOwner: (conversationId: string) => void;
  onGoBackHome: () => void;
}

type StatusFilter = 'all' | RestaurantVerificationStatus;

export function AdminApplicationsView({
  applications,
  selectedOwnerUid,
  onSelectOwnerUid,
  demoProfilesCount = 0,
  communityRoomsCount = 0,
  onMessageOwner,
  onGoBackHome,
}: AdminApplicationsViewProps) {
  const { lang, t, formatArea, formatNumber } = useI18n();
  const { isAdmin, firebaseUser, user: appUser } = useAuth();

  const [demoBusy, setDemoBusy] = useState<'seed' | 'remove' | null>(null);
  const [confirmRemoveDemo, setConfirmRemoveDemo] = useState(false);
  const [demoProgress, setDemoProgress] = useState<DemoSeedProgress | null>(null);
  const [demoSummary, setDemoSummary] = useState<DemoSeedSummary | null>(null);
  const [demoToast, setDemoToast] = useState<string | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);

  const [healthBusy, setHealthBusy] = useState(false);
  const [healthReport, setHealthReport] = useState<HealthCheckReport | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [internalSelectedUid, setInternalSelectedUid] = useState<string | null>(
    selectedOwnerUid ?? null
  );
  const activeUid = selectedOwnerUid !== undefined ? selectedOwnerUid : internalSelectedUid;
  const setActiveUid = (uid: string | null) => {
    setInternalSelectedUid(uid);
    onSelectOwnerUid?.(uid);
  };

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<{ src: string; caption?: string } | null>(null);

  // Sync external selectedOwnerUid (e.g. clicking "Review" from Inbox notifications)
  useEffect(() => {
    if (selectedOwnerUid) {
      setInternalSelectedUid(selectedOwnerUid);
      const match = applications.find((a) => a.uid === selectedOwnerUid);
      if (match) {
        setStatusFilter('all');
      }
      setRejectOpen(false);
      setRejectReason('');
      setActionMsg(null);
      setActionErr(null);
    }
  }, [selectedOwnerUid, applications]);

  const counts = useMemo(() => {
    return {
      all: applications.length,
      pending: applications.filter((a) => a.restaurant.verificationStatus === 'pending').length,
      approved: applications.filter((a) => a.restaurant.verificationStatus === 'approved').length,
      rejected: applications.filter((a) => a.restaurant.verificationStatus === 'rejected').length,
    };
  }, [applications]);

  const filteredApps = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return applications.filter((app) => {
      if (statusFilter !== 'all' && app.restaurant.verificationStatus !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        app.restaurant.restaurantName.toLowerCase().includes(q) ||
        app.restaurant.ownerName.toLowerCase().includes(q) ||
        app.restaurant.area.toLowerCase().includes(q) ||
        app.restaurant.phone.toLowerCase().includes(q) ||
        app.email.toLowerCase().includes(q)
      );
    });
  }, [applications, statusFilter, searchTerm]);

  const selectedApp = useMemo(
    () => applications.find((a) => a.uid === activeUid) ?? null,
    [applications, activeUid]
  );

  // Strict non-admin access guard
  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto my-8 bg-[var(--bg-surface)] rounded-3xl border border-[var(--border-subtle)] p-6 sm:p-8 text-center space-y-4 shadow-sm">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center">
          <Lock className="w-7 h-7" />
        </div>
        <h2 className="font-display text-xl font-extrabold text-[var(--text-primary)]">
          {t('admin.accessDeniedTitle')}
        </h2>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          {t('admin.accessDeniedDesc')}
        </p>
        <button
          type="button"
          onClick={onGoBackHome}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-sm font-semibold cursor-pointer"
        >
          {t('admin.backHomeBtn')}
        </button>
      </div>
    );
  }

  const handleDecision = async (decision: 'approved' | 'rejected') => {
    if (!selectedApp || !firebaseUser) return;
    if (decision === 'rejected' && rejectReason.trim().length < 3) {
      setActionErr(t('admin.errRejectReasonRequired'));
      return;
    }

    setActionBusy(true);
    setActionErr(null);
    setActionMsg(null);
    try {
      const systemMessageText =
        decision === 'approved'
          ? t('adminChat.systemApprovedMsg')
          : t('adminChat.systemRejectedMsg', { reason: rejectReason.trim() });

      await reviewRestaurantApplication({
        ownerUid: selectedApp.uid,
        adminUid: firebaseUser.uid,
        decision,
        rejectionReason: decision === 'rejected' ? rejectReason.trim() : undefined,
        restaurantName: selectedApp.restaurant.restaurantName,
        ownerName: selectedApp.restaurant.ownerName,
        restaurantLogoUrl: selectedApp.restaurant.restaurantPhotoUrl,
        systemMessageText,
      });

      setRejectOpen(false);
      setRejectReason('');
      setActionMsg(
        decision === 'approved' ? t('admin.approvedToast') : t('admin.rejectedToast')
      );
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : t('donor.unableToUpdate'));
    } finally {
      setActionBusy(false);
    }
  };

  const handleMessageOwner = async (app: RestaurantOwnerApplication) => {
    setActionBusy(true);
    setActionErr(null);
    try {
      const conv = await ensureAdminConversationForOwner({
        ownerUid: app.uid,
        ownerName: app.restaurant.ownerName,
        restaurantName: app.restaurant.restaurantName,
        restaurantLogoUrl: app.restaurant.restaurantPhotoUrl,
        verificationStatus: app.restaurant.verificationStatus,
      });
      onMessageOwner(conv.id);
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : t('donor.unableToUpdate'));
    } finally {
      setActionBusy(false);
    }
  };

  const getStatusBadge = (status: RestaurantVerificationStatus) => {
    if (status === 'approved') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
          <CheckCircle2 className="w-3 h-3" />
          {t('restaurant.statuses.approved')}
        </span>
      );
    }
    if (status === 'rejected') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300">
          <XCircle className="w-3 h-3" />
          {t('restaurant.statuses.rejected')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
        <Clock className="w-3 h-3" />
        {t('restaurant.statuses.pending')}
      </span>
    );
  };

  const handleSeedDemoData = async () => {
    if (!firebaseUser || demoBusy) return;
    setDemoBusy('seed');
    setConfirmRemoveDemo(false);
    setDemoSummary(null);
    setDemoToast(null);
    setDemoError(null);
    setDemoProgress({ step: t('admin.demoSeedingStart'), current: 0, total: 1 });
    try {
      const summary = await seedAllDemoData(firebaseUser.uid, (p) => setDemoProgress(p));
      setDemoSummary(summary);
      setDemoToast(
        t('admin.demoSeedSuccess', {
          personas: formatNumber(summary.verifiedPersonasCount || summary.personasCount),
          rooms: formatNumber(summary.verifiedRoomsCount || summary.roomsCount),
          messages: formatNumber(summary.messagesCreated),
        })
      );
      if (summary.errors.length > 0) {
        setDemoError(
          summary.errors.map((e) => `${e.step} (${e.code}): ${e.message}`).join(' · ')
        );
      }
    } catch (err) {
      setDemoError(err instanceof Error ? err.message : t('donor.unableToUpdate'));
    } finally {
      setDemoBusy(null);
      setDemoProgress(null);
    }
  };

  const handleRemoveDemoData = async () => {
    if (!firebaseUser || demoBusy) return;
    setDemoBusy('remove');
    setConfirmRemoveDemo(false);
    setDemoSummary(null);
    setDemoToast(null);
    setDemoError(null);
    setDemoProgress({ step: t('admin.demoRemovingStart'), current: 0, total: 4 });
    try {
      const summary = await removeAllDemoData((p) => setDemoProgress(p));
      setDemoToast(
        t('admin.demoRemoveSuccess', {
          personas: formatNumber(summary.deletedPersonas),
          messages: formatNumber(summary.deletedMessages),
        })
      );
    } catch (err) {
      setDemoError(err instanceof Error ? err.message : t('donor.unableToUpdate'));
    } finally {
      setDemoBusy(null);
      setDemoProgress(null);
    }
  };

  const handleRunAdminHealthCheck = async () => {
    if (healthBusy) return;
    setHealthBusy(true);
    try {
      const report = await runHealthCheck({
        mode: 'admin',
        fbUser: firebaseUser ?? null,
        user: appUser ?? null,
      });
      setHealthReport(report);
    } finally {
      setHealthBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PhotoLightbox
        src={lightboxSrc?.src ?? null}
        caption={lightboxSrc?.caption}
        onClose={() => setLightboxSrc(null)}
      />

      {/* Admin Demo Personas & Community Rooms Seeding Card */}
      <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-4 sm:p-5 space-y-3 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-100/80 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display text-base sm:text-lg font-extrabold text-[var(--text-primary)]">
                  {t('admin.demoCardTitle')}
                </h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-secondary)] tabular-nums">
                  <Database className="w-3 h-3 text-[var(--brand-text)]" />
                  {t('admin.demoStatusCounts', {
                    personas: formatNumber(demoProfilesCount),
                    rooms: formatNumber(communityRoomsCount),
                  })}
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
                {t('admin.demoCardDesc')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={Boolean(demoBusy)}
              onClick={handleSeedDemoData}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-55 text-[var(--brand-primary-fg)] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              {demoBusy === 'seed' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>{t('admin.seedDemoBtn')}</span>
            </button>

            {!confirmRemoveDemo ? (
              <button
                type="button"
                disabled={Boolean(demoBusy)}
                onClick={() => setConfirmRemoveDemo(true)}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/35 disabled:opacity-55 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>{t('admin.removeDemoBtn')}</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-950/40 px-2.5 py-1 rounded-xl border border-red-200 dark:border-red-900/60">
                <button
                  type="button"
                  disabled={Boolean(demoBusy)}
                  onClick={handleRemoveDemoData}
                  className="min-h-[30px] px-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold cursor-pointer"
                >
                  {t('admin.confirmRemoveDemoBtn')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRemoveDemo(false)}
                  className="min-h-[30px] px-2 rounded-lg text-[11px] font-semibold text-[var(--text-secondary)] hover:bg-black/5 cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
              </div>
            )}
          </div>
        </div>

        {demoProgress && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-secondary)]">
              <span>{demoProgress.step}</span>
              <span className="tabular-nums">
                {formatNumber(demoProgress.current)} / {formatNumber(demoProgress.total)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
              <div
                className="h-full bg-[var(--brand-primary)] transition-all duration-200"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((demoProgress.current / Math.max(1, demoProgress.total)) * 100)
                  )}%`,
                }}
              />
            </div>
          </div>
        )}

        {demoToast && (
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 px-3 py-2 rounded-xl">
            {demoToast}
          </p>
        )}

        {demoSummary && (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/70 p-3 space-y-2 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="rounded-lg bg-[var(--bg-surface)] p-2 border border-[var(--border-subtle)]">
                <p className="text-[10px] text-[var(--text-muted)] font-semibold">
                  {t('admin.seedDetailPersonas')}
                </p>
                <p className="font-bold text-[var(--text-primary)] tabular-nums mt-0.5">
                  +{formatNumber(demoSummary.personasCreated)} / ↻{formatNumber(demoSummary.personasUpdated)} · Verified: {formatNumber(demoSummary.verifiedPersonasCount)}
                </p>
              </div>
              <div className="rounded-lg bg-[var(--bg-surface)] p-2 border border-[var(--border-subtle)]">
                <p className="text-[10px] text-[var(--text-muted)] font-semibold">
                  {t('admin.seedDetailRooms')}
                </p>
                <p className="font-bold text-[var(--text-primary)] tabular-nums mt-0.5">
                  +{formatNumber(demoSummary.roomsCreated)} / ↻{formatNumber(demoSummary.roomsUpdated)} · Verified: {formatNumber(demoSummary.verifiedRoomsCount)}
                </p>
              </div>
              <div className="rounded-lg bg-[var(--bg-surface)] p-2 border border-[var(--border-subtle)] col-span-2 sm:col-span-1">
                <p className="text-[10px] text-[var(--text-muted)] font-semibold">
                  {t('admin.seedDetailMessages')}
                </p>
                <p className="font-bold text-[var(--text-primary)] tabular-nums mt-0.5">
                  +{formatNumber(demoSummary.messagesCreated)} new · {formatNumber(demoSummary.messagesAlreadyExisted)} existed · Verified: {formatNumber(demoSummary.verifiedMessagesCount)}
                </p>
              </div>
            </div>
          </div>
        )}

        {demoError && (
          <p className="text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 px-3 py-2 rounded-xl break-words">
            {demoError}
          </p>
        )}
      </div>

      {/* Admin Chat & Data Health Check Screen */}
      <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-4 sm:p-5 space-y-3 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-100/80 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
              <HeartPulse className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-base sm:text-lg font-extrabold text-[var(--text-primary)]">
                {t('healthCheck.adminCardTitle')}
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
                {t('healthCheck.adminSubtitle')}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={healthBusy}
            onClick={handleRunAdminHealthCheck}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-55 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${healthBusy ? 'animate-spin' : ''}`} />
            <span>{healthBusy ? t('healthCheck.running') : t('healthCheck.runAdminBtn')}</span>
          </button>
        </div>

        {healthReport && (
          <div className="space-y-2.5 pt-1">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-1 text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {formatNumber(healthReport.summary.pass)} {t('healthCheck.passed')}
              </span>
              {healthReport.summary.warn > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950/60 px-2.5 py-1 text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {formatNumber(healthReport.summary.warn)} {t('healthCheck.warnings')}
                </span>
              )}
              {healthReport.summary.fail > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 dark:bg-rose-950/60 px-2.5 py-1 text-rose-800 dark:text-rose-300">
                  <XCircle className="h-3.5 w-3.5" />
                  {formatNumber(healthReport.summary.fail)} {t('healthCheck.failed')}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {healthReport.items.map((item) => {
                const isPass = item.status === 'pass';
                const isWarn = item.status === 'warn';
                return (
                  <div
                    key={item.id}
                    className={`rounded-xl border p-3 ${
                      isPass
                        ? 'border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20'
                        : isWarn
                          ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20'
                          : 'border-rose-200 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/25'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {isPass ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : isWarn ? (
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-[var(--text-primary)]">
                            {lang === 'bn' ? item.titleBn : item.title}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase shrink-0 ${
                              isPass
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                                : isWarn
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300'
                            }`}
                          >
                            {item.status}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-[var(--text-secondary)] break-words">
                          {lang === 'bn' ? item.detailBn : item.detail}
                        </p>
                        <p className="mt-1 text-[11px] text-[var(--text-muted)] leading-snug">
                          <strong>{t('healthCheck.fixHintLabel')}:</strong>{' '}
                          {lang === 'bn' ? item.fixHintBn : item.fixHint}
                        </p>
                        {item.indexUrl && (
                          <a
                            href={item.indexUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-[var(--bg-surface)] px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50"
                          >
                            {t('healthCheck.createIndexLink')}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Header + Filter Bar */}
      <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-4 sm:p-5 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[var(--brand-soft)] text-[var(--brand-text)] flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-lg sm:text-xl font-extrabold text-[var(--text-primary)] truncate">
                {t('admin.applicationsTitle')}
              </h1>
              <p className="text-xs text-[var(--text-muted)] truncate">
                {t('admin.applicationsSubtitle')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 bg-[var(--bg-subtle)] p-1 rounded-xl border border-[var(--border-subtle)]">
            {(['pending', 'approved', 'rejected', 'all'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  statusFilter === tab
                    ? 'bg-[var(--bg-surface)] text-[var(--brand-text)] shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {t(`admin.filters.${tab}`)} ({formatNumber(counts[tab])})
              </button>
            ))}
          </div>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('admin.searchApplicationsPlaceholder')}
            className="w-full min-h-[40px] pl-10 pr-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
          />
        </div>
      </div>

      {/* Master-Detail Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left List */}
        <div
          className={`lg:col-span-5 min-w-0 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] overflow-hidden shadow-xs ${
            selectedApp ? 'hidden lg:block' : 'block'
          }`}
        >
          {filteredApps.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <Store className="w-8 h-8 mx-auto text-[var(--text-muted)] opacity-60" />
              <p className="text-sm font-bold text-[var(--text-primary)]">
                {t('admin.noApplicationsTitle')}
              </p>
              <p className="text-xs text-[var(--text-muted)]">{t('admin.noApplicationsSubtitle')}</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)] max-h-[680px] overflow-y-auto">
              {filteredApps.map((app) => {
                const isSelected = app.uid === activeUid;
                return (
                  <button
                    key={app.uid}
                    type="button"
                    onClick={() => {
                      setActiveUid(app.uid);
                      setRejectOpen(false);
                      setActionMsg(null);
                      setActionErr(null);
                    }}
                    className={`w-full p-3.5 text-left transition-colors flex items-start gap-3 cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--brand-soft)]/60'
                        : 'hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    <ShopAvatar
                      name={app.restaurant.restaurantName}
                      imageUrl={app.restaurant.restaurantPhotoUrl}
                      size="md"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-display text-sm font-bold text-[var(--text-primary)] truncate">
                          {app.restaurant.restaurantName}
                        </p>
                        {getStatusBadge(app.restaurant.verificationStatus)}
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] truncate">
                        {app.restaurant.ownerName} · {t(`restaurant.types.${app.restaurant.restaurantType}`)}
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)] truncate">
                        {formatArea(app.restaurant.area)}, {app.restaurant.city} ·{' '}
                        {new Date(app.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Detail Panel */}
        <div
          className={`lg:col-span-7 min-w-0 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] overflow-hidden shadow-xs ${
            selectedApp ? 'block' : 'hidden lg:block'
          }`}
        >
          {!selectedApp ? (
            <div className="p-10 text-center space-y-2">
              <Building2 className="w-9 h-9 mx-auto text-[var(--brand-text)] opacity-60" />
              <p className="text-sm font-bold text-[var(--text-primary)]">
                {t('admin.selectApplicationPrompt')}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                {t('admin.selectApplicationDesc')}
              </p>
            </div>
          ) : (
            <div className="p-4 sm:p-6 space-y-5">
              <div className="flex items-start justify-between gap-3 pb-4 border-b border-[var(--border-subtle)]">
                <div className="flex items-start gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => setActiveUid(null)}
                    aria-label={t('common.back')}
                    className="lg:hidden min-h-[38px] min-w-[38px] rounded-xl border border-[var(--border-subtle)] flex items-center justify-center shrink-0 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <ShopAvatar
                    name={selectedApp.restaurant.restaurantName}
                    imageUrl={selectedApp.restaurant.restaurantPhotoUrl}
                    size="lg"
                  />
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-lg font-extrabold text-[var(--text-primary)] truncate">
                        {selectedApp.restaurant.restaurantName}
                      </h2>
                      {selectedApp.restaurant.verificationStatus === 'approved' && (
                        <BadgeCheck className="w-4 h-4 text-[var(--brand-text)] shrink-0" />
                      )}
                      {getStatusBadge(selectedApp.restaurant.verificationStatus)}
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {t(`restaurant.types.${selectedApp.restaurant.restaurantType}`)} ·{' '}
                      {formatArea(selectedApp.restaurant.area)}, {selectedApp.restaurant.city}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {t('admin.submittedAtLabel')}:{' '}
                      {new Date(selectedApp.restaurant.submittedAt || selectedApp.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {selectedApp.restaurant.verificationStatus === 'rejected' &&
                selectedApp.restaurant.rejectionReason && (
                  <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300 space-y-1">
                    <p className="font-bold">{t('restaurant.rejectionReasonHeading')}</p>
                    <p>{selectedApp.restaurant.rejectionReason}</p>
                  </div>
                )}

              {/* Action Buttons Bar */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={actionBusy || selectedApp.restaurant.verificationStatus === 'approved'}
                  onClick={() => handleDecision('approved')}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-50 text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  {t('admin.approveBtn')}
                </button>

                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => setRejectOpen((v) => !v)}
                  className="min-h-[42px] px-4 py-2 rounded-xl border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/35 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <XCircle className="w-4 h-4 shrink-0" />
                  {t('admin.rejectBtn')}
                </button>

                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => handleMessageOwner(selectedApp)}
                  className="min-h-[42px] px-4 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] hover:bg-[var(--brand-soft)] text-[var(--text-primary)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ml-auto"
                >
                  <MessageCircle className="w-4 h-4 text-[var(--brand-text)] shrink-0" />
                  {t('admin.messageOwnerBtn')}
                </button>
              </div>

              {rejectOpen && (
                <div className="p-4 rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/25 space-y-3">
                  <label className="block text-xs font-bold text-red-800 dark:text-red-300">
                    {t('admin.rejectReasonLabel')} *
                  </label>
                  <textarea
                    rows={2}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder={t('admin.rejectReasonPlaceholder')}
                    className="w-full px-3 py-2 rounded-xl border border-red-200 dark:border-red-900 bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] focus:outline-none"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setRejectOpen(false)}
                      className="min-h-[36px] px-3 rounded-lg text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => handleDecision('rejected')}
                      className="min-h-[36px] px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                    >
                      {t('admin.confirmRejectBtn')}
                    </button>
                  </div>
                </div>
              )}

              {actionMsg && (
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 px-3 py-2 rounded-xl">
                  {actionMsg}
                </p>
              )}
              {actionErr && (
                <p className="text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 px-3 py-2 rounded-xl">
                  {actionErr}
                </p>
              )}

              {/* Owner & Restaurant Metadata Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-[var(--bg-subtle)]/70 border border-[var(--border-subtle)] space-y-1">
                  <p className="text-[11px] font-semibold text-[var(--text-muted)] inline-flex items-center gap-1">
                    <UserIcon className="w-3.5 h-3.5" />
                    {t('restaurant.ownerFullNameLabel')}
                  </p>
                  <p className="font-bold text-[var(--text-primary)]">{selectedApp.restaurant.ownerName}</p>
                </div>

                <div className="p-3 rounded-xl bg-[var(--bg-subtle)]/70 border border-[var(--border-subtle)] space-y-1">
                  <p className="text-[11px] font-semibold text-[var(--text-muted)] inline-flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5" />
                    {t('restaurant.phoneLabel')}
                  </p>
                  <p className="font-bold text-[var(--text-primary)] font-mono">
                    {selectedApp.restaurant.phone}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-[var(--bg-subtle)]/70 border border-[var(--border-subtle)] space-y-1">
                  <p className="text-[11px] font-semibold text-[var(--text-muted)] inline-flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5" />
                    {t('admin.contactEmailLabel')}
                  </p>
                  <p className="font-bold text-[var(--text-primary)] truncate">
                    {selectedApp.restaurant.email || selectedApp.email || '—'}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-[var(--bg-subtle)]/70 border border-[var(--border-subtle)] space-y-1">
                  <p className="text-[11px] font-semibold text-[var(--text-muted)] inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {t('restaurant.openingHoursLabel')}
                  </p>
                  <p className="font-bold text-[var(--text-primary)]">
                    {selectedApp.restaurant.openingHours}
                  </p>
                </div>

                <div className="sm:col-span-2 p-3 rounded-xl bg-[var(--bg-subtle)]/70 border border-[var(--border-subtle)] space-y-1">
                  <p className="text-[11px] font-semibold text-[var(--text-muted)] inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {t('restaurant.fullAddressLabel')}
                  </p>
                  <p className="font-bold text-[var(--text-primary)]">
                    {selectedApp.restaurant.address} ({formatArea(selectedApp.restaurant.area)},{' '}
                    {selectedApp.restaurant.city})
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-[var(--bg-subtle)]/70 border border-[var(--border-subtle)] space-y-1">
                  <p className="text-[11px] font-semibold text-[var(--text-muted)] inline-flex items-center gap-1">
                    <FileCheck2 className="w-3.5 h-3.5" />
                    {t('restaurant.tradeLicenseLabel')}
                  </p>
                  <p className="font-bold text-[var(--text-primary)] font-mono">
                    {selectedApp.restaurant.tradeLicenseNumber || t('admin.notProvided')}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-[var(--bg-subtle)]/70 border border-[var(--border-subtle)] space-y-1">
                  <p className="text-[11px] font-semibold text-[var(--text-muted)]">
                    {t('restaurant.dailySurplusLabel')}
                  </p>
                  <p className="font-bold text-[var(--text-primary)]">
                    {selectedApp.restaurant.approxDailySurplus || t('admin.notProvided')}
                  </p>
                </div>
              </div>

              {/* Submitted Location Map */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-[var(--text-secondary)]">
                  {t('restaurant.mapPinLabel')}
                </p>
                <StaticOsmMap
                  lat={selectedApp.restaurant.lat}
                  lng={selectedApp.restaurant.lng}
                  label={selectedApp.restaurant.restaurantName}
                  address={selectedApp.restaurant.address}
                  heightClass="h-44"
                />
              </div>

              {/* Submitted Photos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-[var(--text-secondary)]">
                    {t('restaurant.restaurantPhotoLabel')}
                  </p>
                  {selectedApp.restaurant.restaurantPhotoUrl ? (
                    <button
                      type="button"
                      onClick={() =>
                        setLightboxSrc({
                          src: selectedApp.restaurant.restaurantPhotoUrl!,
                          caption: selectedApp.restaurant.restaurantName,
                        })
                      }
                      className="w-full h-36 rounded-xl overflow-hidden border border-[var(--border-subtle)] cursor-pointer hover:opacity-90 transition-opacity"
                    >
                      <img
                        src={selectedApp.restaurant.restaurantPhotoUrl}
                        alt={selectedApp.restaurant.restaurantName}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ) : (
                    <div className="h-36 rounded-xl border border-dashed border-[var(--border-subtle)] flex items-center justify-center text-xs text-[var(--text-muted)]">
                      {t('admin.noPhotoUploaded')}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-[var(--text-secondary)]">
                    {t('restaurant.licensePhotoLabel')}
                  </p>
                  {selectedApp.restaurant.licensePhotoUrl ? (
                    <button
                      type="button"
                      onClick={() =>
                        setLightboxSrc({
                          src: selectedApp.restaurant.licensePhotoUrl!,
                          caption: `${selectedApp.restaurant.restaurantName} — ${t('restaurant.tradeLicenseLabel')}`,
                        })
                      }
                      className="w-full h-36 rounded-xl overflow-hidden border border-[var(--border-subtle)] cursor-pointer hover:opacity-90 transition-opacity"
                    >
                      <img
                        src={selectedApp.restaurant.licensePhotoUrl}
                        alt="Trade license"
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ) : (
                    <div className="h-36 rounded-xl border border-dashed border-[var(--border-subtle)] flex items-center justify-center text-xs text-[var(--text-muted)]">
                      {t('admin.noPhotoUploaded')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
