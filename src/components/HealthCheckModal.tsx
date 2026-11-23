import React, { useEffect, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  HeartPulse,
  Loader2,
  RefreshCw,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { ensureAccount, type EnsureAccountReport } from '../lib/ensureAccountService';
import {
  type HealthCheckReport,
  runHealthCheck,
} from '../lib/healthCheckService';
import type { User } from '../types';

interface HealthCheckModalProps {
  open: boolean;
  onClose: () => void;
  mode?: 'user' | 'admin';
  fbUser: FirebaseUser | null;
  user: User | null;
  onAccountRepaired?: (updatedUser: User) => void;
}

export const HealthCheckModal: React.FC<HealthCheckModalProps> = ({
  open,
  onClose,
  mode = 'user',
  fbUser,
  user,
  onAccountRepaired,
}) => {
  const { lang, t } = useI18n();
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<HealthCheckReport | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [repairReport, setRepairReport] = useState<EnsureAccountReport | null>(null);

  const executeCheck = async () => {
    setRunning(true);
    try {
      const next = await runHealthCheck({ mode, fbUser, user });
      setReport(next);
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (open) {
      setRepairReport(null);
      void executeCheck();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, fbUser?.uid, fbUser?.emailVerified]);

  const handleRepairAccount = async () => {
    if (!fbUser || !user) return;
    setRepairing(true);
    try {
      const res = await ensureAccount(fbUser, user, { force: true });
      setRepairReport(res);
      if (res.refreshedUser && onAccountRepaired) {
        onAccountRepaired(res.refreshedUser);
      }
      await executeCheck();
    } finally {
      setRepairing(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <HeartPulse className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900">
                {t('healthCheck.title')}
              </h2>
              <p className="text-xs text-stone-500">
                {mode === 'admin'
                  ? t('healthCheck.adminSubtitle')
                  : t('healthCheck.userSubtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="rounded-xl p-2 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Summary bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 bg-stone-50/70 px-5 py-3">
          {report ? (
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {report.summary.pass} {t('healthCheck.passed')}
              </span>
              {report.summary.warn > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {report.summary.warn} {t('healthCheck.warnings')}
                </span>
              )}
              {report.summary.fail > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-rose-800">
                  <XCircle className="h-3.5 w-3.5" />
                  {report.summary.fail} {t('healthCheck.failed')}
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-stone-500">{t('healthCheck.running')}</span>
          )}

          <div className="flex items-center gap-2">
            {fbUser && user && fbUser.emailVerified && (
              <button
                type="button"
                onClick={handleRepairAccount}
                disabled={repairing || running}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
              >
                {repairing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wrench className="h-3.5 w-3.5" />
                )}
                {t('account.repairAccountBtn')}
              </button>
            )}
            <button
              type="button"
              onClick={executeCheck}
              disabled={running}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${running ? 'animate-spin' : ''}`} />
              {t('healthCheck.rerun')}
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-2.5 overflow-y-auto p-5">
          {repairReport && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900">
              <div className="font-semibold">
                {t('account.repairSummary', {
                  fixed: repairReport.fixedCount,
                  errors: repairReport.errorCount,
                })}
              </div>
              <div className="mt-1 space-y-0.5 text-[11px] text-emerald-800">
                {repairReport.steps.map((s) => (
                  <div key={s.id}>
                    • {lang === 'bn' ? s.labelBn : s.label}: {lang === 'bn' ? s.detailBn : s.detail}
                  </div>
                ))}
              </div>
            </div>
          )}

          {running && !report && (
            <div className="flex flex-col items-center justify-center py-12 text-center text-stone-500">
              <Loader2 className="mb-2 h-6 w-6 animate-spin text-emerald-600" />
              <p className="text-sm font-medium">{t('healthCheck.running')}</p>
            </div>
          )}

          {report?.items.map((item) => {
            const isPass = item.status === 'pass';
            const isWarn = item.status === 'warn';
            return (
              <div
                key={item.id}
                className={`rounded-2xl border p-3.5 ${
                  isPass
                    ? 'border-emerald-200/80 bg-emerald-50/40'
                    : isWarn
                      ? 'border-amber-200 bg-amber-50/50'
                      : 'border-rose-200 bg-rose-50/60'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {isPass ? (
                    <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-emerald-600" />
                  ) : isWarn ? (
                    <AlertTriangle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-amber-600" />
                  ) : (
                    <XCircle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-rose-600" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-bold text-stone-900">
                        {lang === 'bn' ? item.titleBn : item.title}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          isPass
                            ? 'bg-emerald-100 text-emerald-800'
                            : isWarn
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-1 break-words text-xs text-stone-700">
                      {lang === 'bn' ? item.detailBn : item.detail}
                    </p>
                    <p className="mt-1.5 text-[11px] font-medium text-stone-600">
                      <span className="font-semibold text-stone-800">
                        {t('healthCheck.fixHintLabel')}:{' '}
                      </span>
                      {lang === 'bn' ? item.fixHintBn : item.fixHint}
                    </p>
                    {item.indexUrl && (
                      <a
                        href={item.indexUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700 shadow-xs ring-1 ring-emerald-200 hover:bg-emerald-50"
                      >
                        {t('healthCheck.createIndexLink')}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
