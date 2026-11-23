import { useCallback, useEffect, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Lock,
  MapPin,
  Plus,
  Users,
  X,
} from 'lucide-react';
import type { ShiftSignup, User, VolunteerRole, VolunteerShift } from '../types';
import { useAuth, type PendingAuthAction } from '../auth/AuthContext';
import { api } from '../lib/api';
import {
  createFirestoreShiftSignup,
  subscribeMyFirestoreShiftSignups,
  updateFirestoreShiftSignupStatus,
} from '../lib/firestoreService';
import { useI18n } from '../i18n/I18nContext';

interface VolunteerHubViewProps {
  user: User | null;
  onRequireLogin: (action: PendingAuthAction, onAllowed?: () => void) => boolean;
}

const DHAKA_AREAS = [
  'Dhanmondi',
  'Gulshan 2',
  'Banani',
  'Uttara',
  'Mirpur 10',
  'Motijheel',
  'Mohammadpur',
  'Karwan Bazar',
];

const ROLES: VolunteerRole[] = ['cooking', 'packing', 'distribution', 'transport'];

export function VolunteerHubView({ user, onRequireLogin }: VolunteerHubViewProps) {
  const { lang, t, formatNumber, formatArea, formatAddress } = useI18n();
  const { firebaseUser, firebaseAuthReady, isFirebaseSession, isFirebaseVerified } = useAuth();
  const [shifts, setShifts] = useState<VolunteerShift[]>([]);
  const [fsSignupsByShift, setFsSignupsByShift] = useState<Record<string, ShiftSignup>>({});
  const [fsTotalHours, setFsTotalHours] = useState(0);
  const [myTotalHours, setMyTotalHours] = useState(0);
  const [loading, setLoading] = useState(true);
  const [areaFilter, setAreaFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [busyShiftId, setBusyShiftId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Create Shift Modal (for donor/admin)
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [titleBn, setTitleBn] = useState('');
  const [area, setArea] = useState(user?.area || 'Dhanmondi');
  const [locationName, setLocationName] = useState('');
  const [role, setRole] = useState<VolunteerRole>('packing');
  const [shiftDate, setShiftDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('16:30');
  const [endTime, setEndTime] = useState('19:00');
  const [slotsTotal, setSlotsTotal] = useState(6);
  const [creating, setCreating] = useState(false);

  const canPostShift = user?.role === 'donor' || user?.role === 'admin';

  const loadShifts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getVolunteerShifts({
        area: areaFilter,
        role: roleFilter,
      });
      setShifts(res.shifts);
      if (!isFirebaseSession) {
        setMyTotalHours(res.myTotalHours);
      }
    } catch {
      // Ignore transient errors
    } finally {
      setLoading(false);
    }
  }, [areaFilter, roleFilter, isFirebaseSession]);

  useEffect(() => {
    loadShifts();
  }, [loadShifts, user?.id]);

  useEffect(() => {
    if (!(isFirebaseVerified && firebaseAuthReady && firebaseUser)) {
      setFsSignupsByShift({});
      setFsTotalHours(0);
      return;
    }
    const unsub = subscribeMyFirestoreShiftSignups(firebaseUser.uid, (byShift, totalHrs) => {
      setFsSignupsByShift(byShift);
      setFsTotalHours(totalHrs);
    });
    return () => unsub();
  }, [isFirebaseVerified, firebaseAuthReady, firebaseUser]);

  const handleSignUp = async (shiftId: string) => {
    setErrorMsg(null);
    if (!onRequireLogin({ type: 'shift', shiftId })) return;
    if (!user) return;
    setBusyShiftId(shiftId);
    try {
      if (isFirebaseSession) {
        if (!isFirebaseVerified || !firebaseUser) {
          setErrorMsg(t('settings.unverifiedBanner'));
          return;
        }
        await createFirestoreShiftSignup(user, shiftId);
      } else {
        await api.signupVolunteerShift(shiftId);
        await loadShifts();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not reserve shift');
    } finally {
      setBusyShiftId(null);
    }
  };

  const handleStatusChange = async (
    shiftId: string,
    status: 'checked_in' | 'completed' | 'cancelled'
  ) => {
    setErrorMsg(null);
    setBusyShiftId(shiftId);
    try {
      if (isFirebaseSession) {
        if (!isFirebaseVerified || !firebaseUser) {
          setErrorMsg(t('settings.unverifiedBanner'));
          return;
        }
        const existingSignup = fsSignupsByShift[shiftId];
        if (existingSignup) {
          await updateFirestoreShiftSignupStatus(existingSignup.id, status, 2.5);
        }
      } else {
        await api.updateVolunteerShiftStatus(shiftId, status);
        await loadShifts();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not update shift status');
    } finally {
      setBusyShiftId(null);
    }
  };

  const handleCreateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !locationName.trim()) return;
    setCreating(true);
    setErrorMsg(null);
    try {
      await api.createVolunteerShift({
        title: title.trim(),
        titleBn: titleBn.trim() || title.trim(),
        area,
        locationName: locationName.trim(),
        role,
        shiftDate,
        startTime,
        endTime,
        slotsTotal,
      });
      setCreateOpen(false);
      setTitle('');
      setTitleBn('');
      setLocationName('');
      await loadShifts();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not create shift');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <section className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border-subtle)] p-5 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-[var(--brand-text)]">
            <Users className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{t('nav.volunteerHub')}</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
            {t('volunteers.title')}
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
            {t('volunteers.subtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="px-4 py-2.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-left">
            <p className="text-[11px] font-medium text-[var(--text-muted)]">
              {t('volunteers.myHoursLabel')}
            </p>
            <p className="font-display text-xl font-extrabold text-[var(--brand-text)] tabular-nums">
              {formatNumber(isFirebaseSession ? fsTotalHours : myTotalHours)} {t('common.hoursUnit')}
            </p>
          </div>
          {canPostShift && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t('volunteers.postShiftBtn')}</span>
            </button>
          )}
        </div>
      </section>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2.5">
        <select
          value={areaFilter}
          onChange={(e) => setAreaFilter(e.target.value)}
          aria-label={t('volunteers.allAreas')}
          className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text-primary)]"
        >
          <option value="all">{t('volunteers.allAreas')}</option>
          {DHAKA_AREAS.map((a) => (
            <option key={a} value={a}>
              {formatArea(a)}
            </option>
          ))}
        </select>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          aria-label={t('volunteers.allRoles')}
          className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text-primary)]"
        >
          <option value="all">{t('volunteers.allRoles')}</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`events.roles.${r}`)}
            </option>
          ))}
        </select>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="p-3.5 rounded-xl border border-red-400/50 bg-red-50 dark:bg-red-950/35 text-xs font-semibold text-red-700 dark:text-red-300"
        >
          {errorMsg}
        </div>
      )}

      {/* Shifts Grid */}
      {loading && shifts.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-52 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] animate-pulse"
            />
          ))}
        </div>
      ) : shifts.length === 0 ? (
        <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-10 text-center">
          <p className="text-sm font-semibold text-[var(--text-secondary)]">
            {t('volunteers.noShifts')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {shifts.map((shift) => {
            const isFull = shift.slotsFilled >= shift.slotsTotal;
            const mySignup = isFirebaseSession
              ? fsSignupsByShift[shift.id] ?? null
              : shift.mySignup;
            const busy = busyShiftId === shift.id;

            return (
              <article
                key={shift.id}
                className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-semibold">
                    <span className="text-[var(--brand-text)]">
                      {t(`events.roles.${shift.role}`)}
                    </span>
                    <span className="text-[var(--text-muted)] tabular-nums">
                      {t('volunteers.slotsRatio', {
                        filled: formatNumber(shift.slotsFilled),
                        total: formatNumber(shift.slotsTotal),
                      })}
                    </span>
                  </div>

                  <h2 className="font-display text-base font-bold text-[var(--text-primary)] leading-snug">
                    {lang === 'bn' ? shift.titleBn : shift.title}
                  </h2>

                  <div className="space-y-1 text-xs text-[var(--text-secondary)]">
                    <p className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[var(--brand-text)] shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        {formatAddress(shift.locationName, shift.locationNameBn)} ·{' '}
                        {formatArea(shift.area)}
                      </span>
                    </p>
                    <p className="flex items-center gap-1.5 tabular-nums">
                      <Calendar className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" aria-hidden="true" />
                      <span>{shift.shiftDate}</span>
                    </p>
                    <p className="flex items-center gap-1.5 tabular-nums">
                      <Clock className="w-3.5 h-3.5 text-[var(--brand-accent-text)] shrink-0" aria-hidden="true" />
                      <span>
                        {shift.startTime} – {shift.endTime}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
                  {mySignup && mySignup.status !== 'cancelled' ? (
                    <>
                      <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 tabular-nums">
                        <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span>
                          {mySignup.status === 'completed'
                            ? t('volunteers.status.completed', {
                                hours: formatNumber(mySignup.hoursLogged),
                              })
                            : t(`volunteers.status.${mySignup.status}`)}
                        </span>
                      </p>

                      {mySignup.status !== 'completed' && (
                        <div className="flex flex-wrap gap-2">
                          {mySignup.status === 'signed_up' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleStatusChange(shift.id, 'checked_in')}
                              className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold cursor-pointer disabled:opacity-50"
                            >
                              {t('volunteers.checkInBtn')}
                            </button>
                          )}
                          {mySignup.status === 'checked_in' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleStatusChange(shift.id, 'completed')}
                              className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                            >
                              {t('volunteers.completeShiftBtn')}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleStatusChange(shift.id, 'cancelled')}
                            className="min-h-[40px] px-3 py-2 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-secondary)] cursor-pointer disabled:opacity-50"
                          >
                            {t('volunteers.cancelShiftBtn')}
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={busy || isFull}
                      onClick={() => handleSignUp(shift.id)}
                      className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-45 text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {!user && <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                      <span>
                        {busy
                          ? t('volunteers.signingUp')
                          : isFull
                            ? t('volunteers.shiftFull')
                            : t('volunteers.signUpBtn')}
                      </span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Post Shift Modal (Donor / Admin) */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t('volunteers.createModalTitle')}
          onClick={() => setCreateOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreateShift}
            className="w-full sm:max-w-lg bg-[var(--bg-surface)] rounded-t-3xl sm:rounded-2xl border border-[var(--border-subtle)] p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-[var(--border-subtle)]">
              <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
                {t('volunteers.createModalTitle')}
              </h2>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                aria-label={t('common.close')}
                className="min-h-[38px] min-w-[38px] rounded-xl hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {t('volunteers.shiftTitleLabel')}
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {t('settings.area')}
                </label>
                <select
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
                >
                  {DHAKA_AREAS.map((a) => (
                    <option key={a} value={a}>
                      {formatArea(a)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {t('volunteers.roleLabel')}
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as VolunteerRole)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {t(`events.roles.${r}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {t('volunteers.locationLabel')}
              </label>
              <input
                type="text"
                required
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {t('volunteers.dateLabel')}
                </label>
                <input
                  type="date"
                  required
                  value={shiftDate}
                  onChange={(e) => setShiftDate(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {t('volunteers.startTimeLabel')}
                </label>
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {t('volunteers.endTimeLabel')}
                </label>
                <input
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {t('volunteers.slotsLabel')}
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  required
                  value={slotsTotal}
                  onChange={(e) => setSlotsTotal(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={creating}
              className="w-full min-h-[46px] px-5 py-2.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-sm font-semibold cursor-pointer disabled:opacity-50"
            >
              {t('volunteers.createBtn')}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
