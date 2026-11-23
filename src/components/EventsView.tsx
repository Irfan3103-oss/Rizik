import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BellRing,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  HeartHandshake,
  List,
  Lock,
  MapPin,
  Plus,
  Share2,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import type {
  AttendanceStatus,
  CommunityEvent,
  EventRegistration,
  EventStatus,
  User,
  VolunteerRole,
} from '../types';
import type { PendingAuthAction } from '../auth/AuthContext';
import { api } from '../lib/api';
import { useI18n } from '../i18n/I18nContext';
import { FoodImage } from './FoodImage';
import { StaticOsmMap } from './LocationMessageCard';

interface EventsViewProps {
  user: User | null;
  initialEventId?: string | null;
  autoRegisterEventId?: string | null;
  onConsumeAutoAction?: () => void;
  onSelectEventId?: (eventId: string | null) => void;
  onDonateToEvent: (eventId: string) => void;
  onRequireLogin: (action: PendingAuthAction, onAllowed?: () => void) => boolean;
}

const KNOWN_AREAS = ['Dhanmondi', 'Gulshan 2', 'Banani', 'Uttara', 'Mirpur 10', 'Motijheel', 'Mohammadpur'];

export function EventsView({
  user,
  initialEventId,
  autoRegisterEventId,
  onConsumeAutoAction,
  onSelectEventId,
  onDonateToEvent,
  onRequireLogin,
}: EventsViewProps) {
  const { lang, t, formatNumber, formatArea, formatAddress } = useI18n();
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState<'list' | 'calendar' | 'organizer'>('list');
  const [statusFilter, setStatusFilter] = useState<'all' | EventStatus>('all');
  const [areaFilter, setAreaFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');

  // Calendar state
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedCalDate, setSelectedCalDate] = useState<string>(
    () => new Date().toISOString().slice(0, 10)
  );

  // Detail modal + roster
  const [detailEvent, setDetailEvent] = useState<CommunityEvent | null>(null);
  const [detailRoster, setDetailRoster] = useState<EventRegistration[]>([]);

  // Volunteer registration modal
  const [regModalEvent, setRegModalEvent] = useState<CommunityEvent | null>(null);
  const [volName, setVolName] = useState(user?.name ?? '');
  const [volPhone, setVolPhone] = useState(user?.phone ?? '');
  const [volAvail, setVolAvail] = useState('');
  const [volRole, setVolRole] = useState<VolunteerRole>('distribution');
  const [regSubmitting, setRegSubmitting] = useState(false);
  const [regConfirmed, setRegConfirmed] = useState(false);

  // Reminders & Share toast
  const [remindedIds, setRemindedIds] = useState<Record<string, boolean>>({});
  const [shareToast, setShareToast] = useState<string | null>(null);

  // Organizer Create Event form
  const [newTitle, setNewTitle] = useState('');
  const [newTitleBn, setNewTitleBn] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newArea, setNewArea] = useState(user?.area || 'Dhanmondi');
  const [newLoc, setNewLoc] = useState('');
  const [newDate, setNewDate] = useState(() => {
    const d = new Date(Date.now() + 3 * 86_400_000);
    return d.toISOString().slice(0, 10);
  });
  const [newStart, setNewStart] = useState('16:00');
  const [newEnd, setNewEnd] = useState('19:00');
  const [newMeals, setNewMeals] = useState(250);
  const [newVols, setNewVols] = useState(12);
  const [creatingEvent, setCreatingEvent] = useState(false);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getEvents({
        status: statusFilter,
        area: areaFilter,
        date: dateFilter || undefined,
      });
      setEvents(res.events);
    } catch {
      // Ignore offline
    } finally {
      setLoading(false);
    }
  }, [statusFilter, areaFilter, dateFilter]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const openDetailModal = useCallback(
    async (ev: CommunityEvent) => {
      setDetailEvent(ev);
      onSelectEventId?.(ev.id);
      try {
        const res = await api.getEventDetail(ev.id);
        setDetailEvent(res.event);
        setDetailRoster(res.registrations);
      } catch {
        setDetailRoster([]);
      }
    },
    [onSelectEventId]
  );

  useEffect(() => {
    if (initialEventId && events.length > 0 && !detailEvent) {
      const match = events.find((e) => e.id === initialEventId);
      if (match) {
        openDetailModal(match);
      }
    }
  }, [initialEventId, events, detailEvent, openDetailModal]);

  const closeDetailModal = () => {
    setDetailEvent(null);
    setDetailRoster([]);
    onSelectEventId?.(null);
  };

  const openRegisterModalDirectly = useCallback(
    (ev: CommunityEvent) => {
      setRegModalEvent(ev);
      setVolName(user?.name ?? '');
      setVolPhone(user?.phone ?? '');
      setVolAvail(`${ev.startTime} - ${ev.endTime}`);
      setVolRole('distribution');
      setRegConfirmed(false);
    },
    [user]
  );

  useEffect(() => {
    if (autoRegisterEventId && user && events.length > 0) {
      const match = events.find((e) => e.id === autoRegisterEventId);
      if (match) {
        openRegisterModalDirectly(match);
        onConsumeAutoAction?.();
      }
    }
  }, [autoRegisterEventId, user, events, openRegisterModalDirectly, onConsumeAutoAction]);

  const openRegisterModal = (ev: CommunityEvent) => {
    onRequireLogin({ type: 'volunteer', eventId: ev.id }, () => openRegisterModalDirectly(ev));
  };

  const handleVolunteerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regModalEvent) return;
    setRegSubmitting(true);
    try {
      await api.registerEventVolunteer(regModalEvent.id, {
        name: volName,
        phone: volPhone,
        availability: volAvail,
        preferredRole: volRole,
      });
      setRegConfirmed(true);
      await loadEvents();
      if (detailEvent?.id === regModalEvent.id) {
        const refreshed = await api.getEventDetail(regModalEvent.id);
        setDetailEvent(refreshed.event);
        setDetailRoster(refreshed.registrations);
      }
    } finally {
      setRegSubmitting(false);
    }
  };

  const handleReminder = async (ev: CommunityEvent) => {
    const allowed = onRequireLogin({ type: 'reminder', eventId: ev.id });
    if (!allowed) return;
    try {
      await api.remindEvent(ev.id);
      setRemindedIds((prev) => ({ ...prev, [ev.id]: true }));
    } catch {
      // Ignore
    }
  };

  const handleShare = async (ev: CommunityEvent) => {
    const url = `${window.location.origin}/events/${ev.id}`;
    const title = lang === 'bn' ? ev.titleBn : ev.title;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${title} — ${url}`);
      }
      setShareToast(t('events.sharedToast'));
      window.setTimeout(() => setShareToast(null), 3000);
    } catch {
      // Ignore user cancel
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingEvent(true);
    try {
      await api.createEvent({
        title: newTitle,
        titleBn: newTitleBn || newTitle,
        description: newDesc,
        descriptionBn: newDesc,
        area: newArea,
        locationName: newLoc || `${newArea}, Dhaka`,
        eventDate: newDate,
        startTime: newStart,
        endTime: newEnd,
        expectedMeals: newMeals,
        volunteersNeeded: newVols,
      });
      setNewTitle('');
      setNewTitleBn('');
      setNewDesc('');
      setNewLoc('');
      await loadEvents();
      setViewMode('list');
    } finally {
      setCreatingEvent(false);
    }
  };

  const handleEventStatusChange = async (evId: string, nextStatus: EventStatus) => {
    await api.updateEvent(evId, {
      status: nextStatus,
      ...(nextStatus === 'past' ? { actualMealsServed: 320, peopleHelped: 295 } : {}),
    });
    await loadEvents();
    if (detailEvent?.id === evId) {
      const refreshed = await api.getEventDetail(evId);
      setDetailEvent(refreshed.event);
    }
  };

  const handleAttendanceToggle = async (
    eventId: string,
    regId: string,
    attendanceStatus: AttendanceStatus
  ) => {
    await api.updateEventAttendance(eventId, regId, attendanceStatus);
    setDetailRoster((prev) =>
      prev.map((r) => (r.id === regId ? { ...r, attendanceStatus } : r))
    );
  };

  // Build calendar cells
  const calendarDays = useMemo(() => {
    const first = new Date(calendarMonth.year, calendarMonth.month, 1);
    const startOffset = first.getDay();
    const daysInMonth = new Date(calendarMonth.year, calendarMonth.month + 1, 0).getDate();
    const cells: { dateStr: string | null; dayNum: number | null }[] = [];
    for (let i = 0; i < startOffset; i++) cells.push({ dateStr: null, dayNum: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const m = String(calendarMonth.month + 1).padStart(2, '0');
      const day = String(d).padStart(2, '0');
      cells.push({ dateStr: `${calendarMonth.year}-${m}-${day}`, dayNum: d });
    }
    return cells;
  }, [calendarMonth]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CommunityEvent[]>();
    for (const ev of events) {
      const arr = map.get(ev.eventDate) ?? [];
      arr.push(ev);
      map.set(ev.eventDate, arr);
    }
    return map;
  }, [events]);

  const canOrganize = Boolean(user && (user.role === 'admin' || user.role === 'donor'));

  const statusTone = (status: EventStatus) => {
    switch (status) {
      case 'ongoing':
        return 'bg-[var(--brand-accent-soft)] text-[var(--brand-accent-text)]';
      case 'upcoming':
        return 'bg-[var(--brand-soft)] text-[var(--brand-text)]';
      case 'past':
        return 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]';
      case 'cancelled':
        return 'bg-red-500/10 text-red-600 dark:text-red-400';
    }
  };

  return (
    <div className="space-y-6 pb-6">
      {shareToast && (
        <div className="fixed top-20 inset-x-4 sm:inset-x-auto sm:right-4 sm:max-w-sm z-50 px-4 py-2.5 rounded-xl bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] text-xs font-semibold shadow-lg">
          {shareToast}
        </div>
      )}

      {/* Header + View Switcher */}
      <section className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border-subtle)] p-5 sm:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
            {t('events.title')}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] max-w-2xl">{t('events.subtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
              viewMode === 'list'
                ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]'
                : 'bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)]'
            }`}
          >
            <List className="w-4 h-4 shrink-0" />
            {t('events.listView')}
          </button>
          <button
            type="button"
            onClick={() => setViewMode('calendar')}
            className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
              viewMode === 'calendar'
                ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]'
                : 'bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)]'
            }`}
          >
            <CalendarIcon className="w-4 h-4 shrink-0" />
            {t('events.calendarView')}
          </button>
          {canOrganize && (
            <button
              type="button"
              onClick={() => setViewMode('organizer')}
              className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                viewMode === 'organizer'
                  ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]'
                  : 'bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)]'
              }`}
            >
              <ShieldCheck className="w-4 h-4 shrink-0" />
              {t('events.organizerPanel')}
            </button>
          )}
        </div>
      </section>

      {/* Filter Strip (for List & Calendar views) */}
      {viewMode !== 'organizer' && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {(['all', 'upcoming', 'ongoing', 'past'] as const).map((st) => {
              const active = statusFilter === st;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    active
                      ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]'
                      : 'bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                  }`}
                >
                  {t(`events.statuses.${st}`)}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label={t('events.filterAreaAll')}
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              className="min-h-[40px] px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-primary)]"
            >
              <option value="all">{t('events.filterAreaAll')}</option>
              {KNOWN_AREAS.map((a) => (
                <option key={a} value={a}>
                  {formatArea(a)}
                </option>
              ))}
            </select>

            <input
              type="date"
              aria-label={t('events.filterDateLabel')}
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="min-h-[40px] max-w-full min-w-0 px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-primary)]"
            />
            {dateFilter && (
              <button
                type="button"
                onClick={() => setDateFilter('')}
                className="min-h-[40px] px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-semibold text-[var(--brand-text)] cursor-pointer"
              >
                {t('events.clearDate')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* LIST VIEW */}
      {viewMode === 'list' && (
        loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="h-96 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] animate-pulse"
              />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-12 text-center text-sm text-[var(--text-muted)]">
            {t('events.noEvents')}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {events.map((ev) => {
              const title = lang === 'bn' ? ev.titleBn : ev.title;
              const desc = lang === 'bn' ? ev.descriptionBn : ev.description;
              const isPast = ev.status === 'past' || ev.status === 'cancelled';
              const isReminded = remindedIds[ev.id] || Boolean(ev.myRegistration?.reminderEnabled);

              return (
                <article
                  key={ev.id}
                  className="min-w-0 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    <button
                      type="button"
                      onClick={() => openDetailModal(ev)}
                      className="block w-full relative aspect-[16/9] overflow-hidden cursor-pointer group"
                    >
                      <FoodImage
                        src={ev.bannerUrl}
                        alt={title}
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                      />
                    </button>

                    <div className="p-5 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className={`px-2.5 py-1 rounded-lg font-semibold ${statusTone(ev.status)}`}>
                          {t(`events.statuses.${ev.status}`)}
                        </span>
                        <span className="font-mono text-[var(--text-muted)] tabular-nums">
                          {ev.eventDate} · {ev.startTime}–{ev.endTime}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => openDetailModal(ev)}
                        className="text-left block w-full cursor-pointer"
                      >
                        <h2 className="font-display text-lg font-bold text-[var(--text-primary)] hover:text-[var(--brand-text)] transition-colors leading-snug">
                          {title}
                        </h2>
                      </button>

                      <p className="text-xs sm:text-sm text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                        {desc}
                      </p>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
                        <a
                          href={`https://www.google.com/maps?q=${ev.lat},${ev.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[var(--brand-text)] hover:underline font-medium"
                        >
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate max-w-[230px]">
                            {formatAddress(ev.locationName, ev.locationNameBn)}
                          </span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>

                        <span className="inline-flex items-center gap-1 font-semibold text-[var(--text-primary)] tabular-nums">
                          <Users className="w-3.5 h-3.5 text-[var(--brand-text)] shrink-0" />
                          {t('events.volunteersRatio', {
                            registered: formatNumber(ev.registeredCount),
                            needed: formatNumber(ev.volunteersNeeded),
                          })}
                        </span>
                      </div>

                      <div className="text-xs font-semibold text-[var(--brand-text)] tabular-nums">
                        {ev.actualMealsServed
                          ? `${t('events.actualMeals', { count: formatNumber(ev.actualMealsServed) })} · ${t('events.peopleHelped', { count: formatNumber(ev.peopleHelped ?? ev.actualMealsServed) })}`
                          : t('events.expectedMeals', { count: formatNumber(ev.expectedMeals) })}
                      </div>
                    </div>
                  </div>

                  <div className="px-5 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-subtle)]/50 flex flex-wrap items-center gap-2">
                    {!isPast && (
                      <button
                        type="button"
                        onClick={() => openRegisterModal(ev)}
                        className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer sm:whitespace-nowrap text-left max-w-full"
                      >
                        <span>
                          {ev.myRegistration
                            ? t('events.registeredBadge', {
                                role: t(`events.roles.${ev.myRegistration.preferredRole}`),
                              })
                            : t('events.registerVolunteer')}
                        </span>
                        {!user && <Lock className="w-3 h-3 opacity-90 shrink-0" aria-hidden="true" />}
                      </button>
                    )}

                    {!isPast && (
                      <button
                        type="button"
                        onClick={() => handleReminder(ev)}
                        className="min-h-[40px] px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        {isReminded ? (
                          <BellRing className="w-3.5 h-3.5 text-[var(--brand-text)]" />
                        ) : (
                          <Bell className="w-3.5 h-3.5 text-[var(--brand-text)]" />
                        )}
                        <span>{isReminded ? t('events.reminderSet') : t('events.getReminder')}</span>
                        {!user && <Lock className="w-3 h-3 text-[var(--text-muted)] shrink-0" aria-hidden="true" />}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleShare(ev)}
                      aria-label={t('events.shareEvent')}
                      className="min-h-[40px] px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Share2 className="w-3.5 h-3.5 text-[var(--brand-text)]" />
                      <span className="hidden sm:inline">{t('events.shareEvent')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onDonateToEvent(ev.id)}
                      className="min-h-[40px] px-3 py-2 rounded-xl border border-[var(--brand-accent)]/40 bg-[var(--brand-accent-soft)] text-[var(--brand-accent-text)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ml-auto"
                    >
                      <HeartHandshake className="w-3.5 h-3.5" />
                      {t('events.donateToEvent')}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )
      )}

      {/* CALENDAR VIEW */}
      {viewMode === 'calendar' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 min-w-0 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                {new Date(calendarMonth.year, calendarMonth.month, 1).toLocaleDateString(
                  lang === 'bn' ? 'bn-BD' : 'en-US',
                  { month: 'long', year: 'numeric' }
                )}
              </h2>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setCalendarMonth((m) =>
                      m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 }
                    )
                  }
                  className="min-h-[38px] min-w-[38px] rounded-xl border border-[var(--border-subtle)] flex items-center justify-center cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCalendarMonth((m) =>
                      m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 }
                    )
                  }
                  className="min-h-[38px] min-w-[38px] rounded-xl border border-[var(--border-subtle)] flex items-center justify-center cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-[var(--text-muted)]">
              {(lang === 'bn'
                ? ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহ', 'শুক্র', 'শনি']
                : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
              ).map((d) => (
                <div key={d} className="py-1.5">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {calendarDays.map((cell, idx) => {
                if (!cell.dateStr || !cell.dayNum) {
                  return <div key={`empty-${idx}`} className="h-12 sm:h-14" />;
                }
                const dayEvents = eventsByDate.get(cell.dateStr) ?? [];
                const isSelected = selectedCalDate === cell.dateStr;
                return (
                  <button
                    key={cell.dateStr}
                    type="button"
                    onClick={() => setSelectedCalDate(cell.dateStr!)}
                    className={`h-12 sm:h-14 min-w-0 rounded-xl border p-1 sm:p-1.5 flex flex-col items-center justify-between text-xs font-semibold tabular-nums transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-[var(--brand-primary)] bg-[var(--brand-soft)] text-[var(--brand-text)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 text-[var(--text-primary)] hover:border-[var(--brand-primary)]/50'
                    }`}
                  >
                    <span>{formatNumber(cell.dayNum)}</span>
                    {dayEvents.length > 0 && (
                      <span className="text-[10px] font-bold text-[var(--brand-text)]">
                        {formatNumber(dayEvents.length)}●
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-5 min-w-0 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 space-y-4">
            <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
              {t('events.calendarSelectedDay', { date: selectedCalDate })}
            </h3>
            {(eventsByDate.get(selectedCalDate) ?? []).length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] py-6 text-center">
                {t('events.calendarNoEvents')}
              </p>
            ) : (
              <div className="space-y-3">
                {(eventsByDate.get(selectedCalDate) ?? []).map((ev) => (
                  <div
                    key={ev.id}
                    className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] space-y-2"
                  >
                    <p className="text-sm font-bold text-[var(--text-primary)]">
                      {lang === 'bn' ? ev.titleBn : ev.title}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] tabular-nums">
                      {ev.startTime}–{ev.endTime} · {formatAddress(ev.locationName, ev.locationNameBn)}
                    </p>
                    <button
                      type="button"
                      onClick={() => openDetailModal(ev)}
                      className="text-xs font-semibold text-[var(--brand-text)] hover:underline cursor-pointer"
                    >
                      {t('events.viewDetails')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ORGANIZER / ADMIN PANEL */}
      {viewMode === 'organizer' && canOrganize && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleCreateEvent}
            className="lg:col-span-5 min-w-0 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 sm:p-6 space-y-4 h-fit"
          >
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-[var(--brand-text)]" />
              <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                {t('events.createEventTitle')}
              </h2>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {t('events.eventTitleLabel')}
              </label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {t('events.eventTitleBnLabel')}
              </label>
              <input
                type="text"
                value={newTitleBn}
                onChange={(e) => setNewTitleBn(e.target.value)}
                className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {t('clients.areaLabel')}
                </label>
                <select
                  value={newArea}
                  onChange={(e) => setNewArea(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
                >
                  {KNOWN_AREAS.map((a) => (
                    <option key={a} value={a}>
                      {formatArea(a)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {t('events.eventDateLabel')}
                </label>
                <input
                  type="date"
                  required
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {t('events.locationLabel')}
              </label>
              <input
                type="text"
                required
                value={newLoc}
                onChange={(e) => setNewLoc(e.target.value)}
                className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {t('events.startTimeLabel')}
                </label>
                <input
                  type="time"
                  value={newStart}
                  onChange={(e) => setNewStart(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {t('events.endTimeLabel')}
                </label>
                <input
                  type="time"
                  value={newEnd}
                  onChange={(e) => setNewEnd(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {t('events.expectedMealsLabel')}
                </label>
                <input
                  type="number"
                  min={20}
                  value={newMeals}
                  onChange={(e) => setNewMeals(Number(e.target.value))}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {t('events.volunteersNeededLabel')}
                </label>
                <input
                  type="number"
                  min={1}
                  value={newVols}
                  onChange={(e) => setNewVols(Number(e.target.value))}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {t('form.descLabel')}
              </label>
              <textarea
                rows={3}
                required
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
              />
            </div>

            <button
              type="submit"
              disabled={creatingEvent}
              className="w-full min-h-[46px] px-5 py-2.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-sm font-semibold cursor-pointer"
            >
              {creatingEvent ? t('events.creatingEvent') : t('events.createEventBtn')}
            </button>
          </form>

          <div className="lg:col-span-7 min-w-0 space-y-4">
            {events.map((ev) => (
              <div
                key={ev.id}
                className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
                      {lang === 'bn' ? ev.titleBn : ev.title}
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] tabular-nums">
                      {ev.eventDate} · {formatArea(ev.area)} ·{' '}
                      {t('events.volunteersRatio', {
                        registered: formatNumber(ev.registeredCount),
                        needed: formatNumber(ev.volunteersNeeded),
                      })}
                    </p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${statusTone(ev.status)}`}>
                    {t(`events.statuses.${ev.status}`)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => openDetailModal(ev)}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer"
                  >
                    {t('events.rosterTitle')}
                  </button>
                  {user && (user.role === 'admin' || ev.createdBy === user.id) &&
                    ev.status !== 'past' &&
                    ev.status !== 'cancelled' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleEventStatusChange(ev.id, 'past')}
                          className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[var(--brand-soft)] text-[var(--brand-text)] text-xs font-semibold cursor-pointer"
                        >
                          {t('events.markPastBtn')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEventStatusChange(ev.id, 'cancelled')}
                          className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-semibold cursor-pointer"
                        >
                          {t('events.cancelEventBtn')}
                        </button>
                      </>
                    )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* EVENT DETAIL MODAL */}
      {detailEvent && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-2xl rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
          >
            <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="font-display text-lg font-bold text-[var(--text-primary)] truncate">
                  {lang === 'bn' ? detailEvent.titleBn : detailEvent.title}
                </h2>
                <p className="text-xs text-[var(--text-muted)] tabular-nums">
                  {detailEvent.eventDate} · {detailEvent.startTime}–{detailEvent.endTime} ·{' '}
                  {formatArea(detailEvent.area)}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDetailModal}
                aria-label={t('common.close')}
                className="min-h-[40px] min-w-[40px] rounded-xl hover:bg-[var(--bg-subtle)] flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              <div className="aspect-[16/9] rounded-2xl overflow-hidden border border-[var(--border-subtle)]">
                <FoodImage
                  src={detailEvent.bannerUrl}
                  alt={detailEvent.title}
                  className="w-full h-full object-cover"
                />
              </div>

              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                {lang === 'bn' ? detailEvent.descriptionBn : detailEvent.description}
              </p>

              {/* Results for past events */}
              {detailEvent.status === 'past' && detailEvent.actualMealsServed && (
                <div className="p-4 rounded-2xl bg-[var(--brand-soft)] border border-[var(--brand-primary)]/30 space-y-1">
                  <p className="text-xs font-bold text-[var(--brand-text)]">
                    {t('events.resultsTitle')}
                  </p>
                  <p className="text-sm font-bold text-[var(--text-primary)] tabular-nums">
                    {t('events.actualMeals', { count: formatNumber(detailEvent.actualMealsServed) })} ·{' '}
                    {t('events.peopleHelped', {
                      count: formatNumber(detailEvent.peopleHelped ?? detailEvent.actualMealsServed),
                    })}
                  </p>
                </div>
              )}

              {/* Organizers & How to Help */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-1">
                  <p className="text-xs font-bold text-[var(--text-primary)]">
                    {t('events.organizersTitle')}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {lang === 'bn' ? detailEvent.organizerBn : detailEvent.organizer}
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-1">
                  <p className="text-xs font-bold text-[var(--text-primary)]">
                    {t('events.howToHelpTitle')}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {lang === 'bn' ? detailEvent.howToHelpBn : detailEvent.howToHelp}
                  </p>
                </div>
              </div>

              {/* Schedule */}
              {detailEvent.schedule.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-[var(--text-primary)]">
                    {t('events.scheduleTitle')}
                  </h3>
                  <div className="divide-y divide-[var(--border-subtle)] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40">
                    {detailEvent.schedule.map((slot, i) => (
                      <div key={i} className="px-4 py-2.5 flex items-center gap-3 text-xs">
                        <span className="font-mono font-bold text-[var(--brand-text)] shrink-0 inline-flex items-center gap-1 tabular-nums">
                          <Clock className="w-3.5 h-3.5" />
                          {slot.time}
                        </span>
                        <span className="text-[var(--text-primary)]">
                          {lang === 'bn' ? slot.activityBn : slot.activity}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Meeting point map */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold text-[var(--text-primary)]">
                      {t('events.meetingPointTitle')}
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                      {formatAddress(detailEvent.locationName, detailEvent.locationNameBn)}
                    </p>
                  </div>
                  <a
                    href={`https://www.google.com/maps?q=${detailEvent.lat},${detailEvent.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[34px] px-3 py-1.5 rounded-xl bg-[var(--brand-soft)] text-xs font-semibold text-[var(--brand-text)] hover:underline inline-flex items-center gap-1.5 shrink-0"
                  >
                    <span>{t('events.openGoogleMaps')}</span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  </a>
                </div>
                <StaticOsmMap
                  lat={detailEvent.lat}
                  lng={detailEvent.lng}
                  label={lang === 'bn' ? detailEvent.titleBn : detailEvent.title}
                  address={formatAddress(detailEvent.locationName, detailEvent.locationNameBn)}
                  heightClass="h-64"
                />
              </div>

              {/* Gallery for Past Events */}
              {detailEvent.galleryUrls.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-[var(--text-primary)]">
                    {t('events.galleryTitle')}
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {detailEvent.galleryUrls.map((url, idx) => (
                      <div key={idx} className="aspect-[4/3] rounded-xl overflow-hidden border border-[var(--border-subtle)]">
                        <FoodImage src={url} alt={`${detailEvent.title} ${idx + 1}`} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Volunteer Roster & Attendance for Admins/Organizers */}
              {canOrganize && (
                <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
                  <h3 className="text-xs font-bold text-[var(--text-primary)]">
                    {t('events.rosterTitle')} ({formatNumber(detailRoster.length)})
                  </h3>
                  {detailRoster.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)]">{t('events.noRosterYet')}</p>
                  ) : (
                    <div className="space-y-2">
                      {detailRoster.map((reg) => (
                        <div
                          key={reg.id}
                          className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/50 flex flex-wrap items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <p className="font-bold text-[var(--text-primary)]">{reg.name}</p>
                            <p className="text-[var(--text-muted)]">
                              {reg.phone} · {t(`events.roles.${reg.preferredRole}`)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {(['registered', 'present', 'absent'] as AttendanceStatus[]).map((att) => (
                              <button
                                key={att}
                                type="button"
                                onClick={() => handleAttendanceToggle(detailEvent.id, reg.id, att)}
                                className={`min-h-[32px] px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                                  reg.attendanceStatus === att
                                    ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]'
                                    : 'bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)]'
                                }`}
                              >
                                {t(`events.attendance.${att}`)}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                {detailEvent.status !== 'past' && detailEvent.status !== 'cancelled' && (
                  <button
                    type="button"
                    onClick={() => openRegisterModal(detailEvent)}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>{t('events.registerVolunteer')}</span>
                    {!user && <Lock className="w-3.5 h-3.5 opacity-90 shrink-0" aria-hidden="true" />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleShare(detailEvent)}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Share2 className="w-4 h-4" />
                  {t('events.shareEvent')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const id = detailEvent.id;
                    closeDetailModal();
                    onDonateToEvent(id);
                  }}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[var(--brand-accent-soft)] text-[var(--brand-accent-text)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ml-auto"
                >
                  <HeartHandshake className="w-4 h-4" />
                  {t('events.donateToEvent')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VOLUNTEER REGISTRATION MODAL */}
      {regModalEvent && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                {t('events.volunteerModalTitle')}
              </h2>
              <button
                type="button"
                onClick={() => setRegModalEvent(null)}
                aria-label={t('common.close')}
                className="min-h-[38px] min-w-[38px] rounded-xl hover:bg-[var(--bg-subtle)] flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {regConfirmed ? (
                <div className="text-center space-y-4 py-4">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-[var(--brand-soft)] text-[var(--brand-text)] flex items-center justify-center">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <h3 className="font-display text-lg font-bold text-[var(--text-primary)]">
                    {t('events.confirmationTitle')}
                  </h3>
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
                    {t('events.confirmationDesc', {
                      event: lang === 'bn' ? regModalEvent.titleBn : regModalEvent.title,
                    })}
                  </p>
                  <button
                    type="button"
                    onClick={() => setRegModalEvent(null)}
                    className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] text-sm font-semibold cursor-pointer"
                  >
                    {t('common.close')}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleVolunteerSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      {t('events.volunteerName')}
                    </label>
                    <input
                      type="text"
                      required
                      value={volName}
                      onChange={(e) => setVolName(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      {t('events.volunteerPhone')}
                    </label>
                    <input
                      type="text"
                      required
                      value={volPhone}
                      onChange={(e) => setVolPhone(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      {t('events.volunteerAvailability')}
                    </label>
                    <input
                      type="text"
                      required
                      value={volAvail}
                      onChange={(e) => setVolAvail(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      {t('events.preferredRole')}
                    </label>
                    <select
                      value={volRole}
                      onChange={(e) => setVolRole(e.target.value as VolunteerRole)}
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
                    >
                      {(['cooking', 'packing', 'distribution', 'transport'] as VolunteerRole[]).map(
                        (r) => (
                          <option key={r} value={r}>
                            {t(`events.roles.${r}`)}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={regSubmitting}
                    className="w-full min-h-[46px] px-5 py-2.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-sm font-semibold cursor-pointer"
                  >
                    {regSubmitting ? t('events.registering') : t('events.confirmRegistration')}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
