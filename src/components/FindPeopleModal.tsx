import { useMemo, useState } from 'react';
import {
  BadgeCheck,
  Ban,
  Loader2,
  MapPin,
  MessageCircle,
  Search,
  ShieldCheck,
  Store,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react';
import type { UserDirectoryEntry } from '../types';
import { ShopAvatar } from './ShopAvatar';
import { useI18n } from '../i18n/I18nContext';

type DirectoryTab = 'all' | 'restaurants' | 'people' | 'online';

interface FindPeopleModalProps {
  open: boolean;
  onClose: () => void;
  entries: UserDirectoryEntry[];
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  blockedUids?: Set<string>;
  onSelectPerson: (entry: UserDirectoryEntry) => Promise<void> | void;
}

export function FindPeopleModal({
  open,
  onClose,
  entries,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  blockedUids,
  onSelectPerson,
}: FindPeopleModalProps) {
  const { t, formatNumber, formatArea } = useI18n();
  const [tab, setTab] = useState<DirectoryTab>('all');
  const [search, setSearch] = useState('');
  const [openingUid, setOpeningUid] = useState<string | null>(null);

  const counts = useMemo(() => {
    const restaurants = entries.filter(
      (e) => e.role === 'restaurantOwner' || e.role === 'donor'
    ).length;
    const people = entries.filter(
      (e) => e.role === 'user' || e.role === 'recipient' || e.role === 'admin'
    ).length;
    const online = entries.filter((e) => e.online).length;
    return {
      all: entries.length,
      restaurants,
      people,
      online,
    };
  }, [entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (tab === 'restaurants' && e.role !== 'restaurantOwner' && e.role !== 'donor') {
        return false;
      }
      if (tab === 'people' && e.role !== 'user' && e.role !== 'recipient' && e.role !== 'admin') {
        return false;
      }
      if (tab === 'online' && !e.online) {
        return false;
      }
      if (!q) return true;
      return (
        e.displayName.toLowerCase().includes(q) ||
        e.handle.toLowerCase().includes(q) ||
        (e.restaurantName ?? '').toLowerCase().includes(q) ||
        e.area.toLowerCase().includes(q)
      );
    });
  }, [entries, tab, search]);

  if (!open) return null;

  const formatLastSeen = (entry: UserDirectoryEntry) => {
    if (entry.online) return t('findPeople.onlineNow');
    if (!entry.lastSeen) return t('findPeople.offline');
    const diffMin = Math.max(0, Math.round((Date.now() - new Date(entry.lastSeen).getTime()) / 60_000));
    if (diffMin < 2) return t('findPeople.lastSeenJustNow');
    if (diffMin < 60) return t('findPeople.lastSeenMinutes', { count: formatNumber(diffMin) });
    const hrs = Math.floor(diffMin / 60);
    if (hrs < 24) return t('findPeople.lastSeenHours', { count: formatNumber(hrs) });
    return t('findPeople.offline');
  };

  const getRoleChip = (role: UserDirectoryEntry['role']) => {
    if (role === 'admin') {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] text-[10px] font-bold shrink-0">
          <ShieldCheck className="w-2.5 h-2.5 shrink-0" />
          {t('findPeople.roleAdmin')}
        </span>
      );
    }
    if (role === 'restaurantOwner' || role === 'donor') {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[var(--brand-accent-soft)] text-[var(--brand-accent-text)] text-[10px] font-bold shrink-0">
          <Store className="w-2.5 h-2.5 shrink-0" />
          {t('findPeople.roleRestaurant')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[var(--brand-soft)] text-[var(--brand-text)] text-[10px] font-bold shrink-0">
        <UserIcon className="w-2.5 h-2.5 shrink-0" />
        {t('findPeople.roleUser')}
      </span>
    );
  };

  const tabs: { id: DirectoryTab; label: string; count: number }[] = [
    { id: 'all', label: t('findPeople.tabs.all'), count: counts.all },
    { id: 'restaurants', label: t('findPeople.tabs.restaurants'), count: counts.restaurants },
    { id: 'people', label: t('findPeople.tabs.people'), count: counts.people },
    { id: 'online', label: t('findPeople.tabs.online'), count: counts.online },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('findPeople.title')}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg bg-[var(--bg-surface)] rounded-t-3xl sm:rounded-2xl border border-[var(--border-subtle)] shadow-2xl flex flex-col max-h-[86vh] overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--brand-soft)] text-[var(--brand-text)] flex items-center justify-center shrink-0 mt-0.5">
              <Users className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-base font-bold text-[var(--text-primary)] truncate">
                {t('findPeople.title')}
              </h3>
              <p className="text-[11px] text-[var(--text-muted)] leading-snug mt-0.5">
                {t('findPeople.subtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="min-h-[36px] min-w-[36px] rounded-xl hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Tabs */}
        <div className="p-3 sm:px-4 border-b border-[var(--border-subtle)] space-y-2.5 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('findPeople.searchPlaceholder')}
              className="w-full min-h-[40px] pl-9 pr-8 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label={t('common.close')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {tabs.map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`min-h-[34px] px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active
                      ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]'
                      : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {item.label} ({formatNumber(item.count)})
                </button>
              );
            })}
          </div>
        </div>

        {/* People List */}
        <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-[var(--border-subtle)]">
          {filtered.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <Users className="w-8 h-8 text-[var(--text-muted)] opacity-45 mx-auto" />
              <p className="text-xs font-medium text-[var(--text-muted)]">
                {t('findPeople.empty')}
              </p>
            </div>
          ) : (
            filtered.map((entry) => {
              const isBlocked = blockedUids?.has(entry.uid) ?? false;
              const isRestaurant =
                entry.role === 'restaurantOwner' || entry.role === 'donor';
              const title = isRestaurant && entry.restaurantName ? entry.restaurantName : entry.displayName;
              const busy = openingUid === entry.uid;

              return (
                <button
                  key={entry.uid}
                  type="button"
                  disabled={Boolean(openingUid) || isBlocked}
                  onClick={async () => {
                    setOpeningUid(entry.uid);
                    try {
                      await onSelectPerson(entry);
                      onClose();
                    } finally {
                      setOpeningUid(null);
                    }
                  }}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-[var(--bg-subtle)] disabled:opacity-65 transition-colors cursor-pointer"
                >
                  <ShopAvatar
                    name={title}
                    imageUrl={entry.photoURL ?? null}
                    online={entry.online}
                    showStatusDot
                    size="md"
                  />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                      <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                        {title}
                      </p>
                      {entry.verified && (
                        <BadgeCheck
                          className="w-3.5 h-3.5 text-[var(--brand-text)] shrink-0"
                          aria-label={t('common.verifiedDonor')}
                        />
                      )}
                      {getRoleChip(entry.role)}
                      {isBlocked && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-[10px] font-bold shrink-0">
                          <Ban className="w-2.5 h-2.5" />
                          {t('chat.blockUser')}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] truncate">
                      <span className="font-mono text-[var(--brand-text)] truncate">
                        {entry.handle}
                      </span>
                      {isRestaurant && entry.restaurantName && entry.displayName !== entry.restaurantName && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{entry.displayName}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-0.5 truncate text-[var(--text-muted)]">
                        <MapPin className="w-3 h-3 shrink-0" />
                        {formatArea(entry.area)}
                      </span>
                    </div>

                    <p
                      className={`text-[10px] font-semibold ${
                        entry.online
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {formatLastSeen(entry)}
                    </p>
                  </div>

                  <span className="min-h-[34px] px-2.5 py-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] font-semibold text-[var(--brand-text)] inline-flex items-center gap-1 whitespace-nowrap shrink-0">
                    {busy ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>{t('findPeople.opening')}</span>
                      </>
                    ) : (
                      <>
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>{t('findPeople.startChat')}</span>
                      </>
                    )}
                  </span>
                </button>
              );
            })
          )}

          {hasMore && onLoadMore && (
            <div className="p-3 text-center">
              <button
                type="button"
                disabled={loadingMore}
                onClick={onLoadMore}
                className="min-h-[38px] px-4 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:bg-[var(--brand-soft)] text-xs font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{t('findPeople.loadMore')}</span>
              </button>
            </div>
          )}
        </div>

        {/* Privacy Notice Footer */}
        <div className="px-4 py-2.5 border-t border-[var(--border-subtle)] bg-[var(--bg-subtle)]/70 text-[11px] text-[var(--text-muted)] text-center shrink-0">
          {t('findPeople.privacyNote')}
        </div>
      </div>
    </div>
  );
}
