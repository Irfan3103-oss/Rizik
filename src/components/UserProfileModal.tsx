import { useState } from 'react';
import {
  BadgeCheck,
  Ban,
  Building2,
  Clock,
  Flag,
  HeartHandshake,
  Loader2,
  MapPin,
  Megaphone,
  MessageCircle,
  ShieldCheck,
  Star,
  Store,
  User as UserIcon,
  X,
} from 'lucide-react';
import type { DirectoryRole, UserDirectoryEntry } from '../types';
import { DemoBadge } from './DemoBadge';
import { ShopAvatar } from './ShopAvatar';
import { useI18n } from '../i18n/I18nContext';

interface UserProfileModalProps {
  entry: UserDirectoryEntry | null;
  myUid: string;
  isBlocked?: boolean;
  onClose: () => void;
  onMessage: (entry: UserDirectoryEntry) => Promise<void> | void;
  onToggleBlock?: (entry: UserDirectoryEntry) => Promise<void> | void;
  onReport?: (entry: UserDirectoryEntry) => Promise<void> | void;
}

export function getRoleMeta(
  role: DirectoryRole,
  t: (key: string) => string
): { label: string; className: string } {
  switch (role) {
    case 'admin':
      return {
        label: t('findPeople.roleAdmin'),
        className: 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]',
      };
    case 'restaurantOwner':
    case 'donor':
      return {
        label: t('findPeople.roleRestaurant'),
        className: 'bg-[var(--brand-accent-soft)] text-[var(--brand-accent-text)]',
      };
    case 'volunteer':
      return {
        label: t('findPeople.roleVolunteer'),
        className:
          'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
      };
    case 'ngo':
      return {
        label: t('findPeople.roleNgo'),
        className: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300',
      };
    case 'organizer':
      return {
        label: t('findPeople.roleOrganizer'),
        className:
          'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300',
      };
    default:
      return {
        label: t('findPeople.roleUser'),
        className: 'bg-[var(--brand-soft)] text-[var(--brand-text)]',
      };
  }
}

export function RoleIcon({ role, className = 'w-2.5 h-2.5 shrink-0' }: { role: DirectoryRole; className?: string }) {
  switch (role) {
    case 'admin':
      return <ShieldCheck className={className} />;
    case 'restaurantOwner':
    case 'donor':
      return <Store className={className} />;
    case 'volunteer':
      return <HeartHandshake className={className} />;
    case 'ngo':
      return <Building2 className={className} />;
    case 'organizer':
      return <Megaphone className={className} />;
    default:
      return <UserIcon className={className} />;
  }
}

export function UserProfileModal({
  entry,
  myUid,
  isBlocked = false,
  onClose,
  onMessage,
  onToggleBlock,
  onReport,
}: UserProfileModalProps) {
  const { lang, t, formatArea, formatHours, formatNumber } = useI18n();
  const [busy, setBusy] = useState(false);

  if (!entry) return null;

  const isSelf = entry.uid === myUid;
  const isDemo = Boolean(entry.isDemo || entry.uid.startsWith('demo_'));
  const title =
    (entry.role === 'restaurantOwner' || entry.role === 'donor') && entry.restaurantName
      ? entry.restaurantName
      : entry.displayName;
  const roleMeta = getRoleMeta(entry.role, t);
  const bioText = lang === 'bn' && entry.bioBn ? entry.bioBn : entry.bio;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-[var(--bg-surface)] rounded-t-3xl sm:rounded-2xl border border-[var(--border-subtle)] shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-[var(--text-primary)] truncate">
            {t('rooms.memberProfileTitle')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="min-h-[36px] min-w-[36px] rounded-xl hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="flex flex-col items-center text-center space-y-2">
            <ShopAvatar
              name={title}
              imageUrl={entry.photoURL ?? null}
              online={entry.online}
              showStatusDot
              size="lg"
            />
            <div className="space-y-1 max-w-full">
              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                <h4 className="font-display text-lg font-extrabold text-[var(--text-primary)] break-words">
                  {title}
                </h4>
                {entry.verified && (
                  <BadgeCheck className="w-4 h-4 text-[var(--brand-text)] shrink-0" />
                )}
                {isDemo && <DemoBadge />}
              </div>

              {entry.handle && (
                <p className="text-xs font-mono text-[var(--brand-text)]">{entry.handle}</p>
              )}

              <div className="flex items-center justify-center gap-1.5 flex-wrap pt-0.5">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${roleMeta.className}`}
                >
                  <RoleIcon role={entry.role} />
                  {roleMeta.label}
                </span>

                <span
                  className={`text-[11px] font-semibold ${
                    entry.online
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-[var(--text-muted)]'
                  }`}
                >
                  · {entry.online ? t('findPeople.onlineNow') : t('findPeople.offline')}
                </span>
              </div>

              {typeof entry.rating === 'number' && entry.rating > 0 && (
                <p className="text-xs font-semibold text-[var(--text-secondary)] inline-flex items-center justify-center gap-1 tabular-nums">
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
                  <span>{formatNumber(entry.rating.toFixed(1))}</span>
                  {typeof entry.reviewCount === 'number' && entry.reviewCount > 0 && (
                    <span className="text-[var(--text-muted)]">
                      ({formatNumber(entry.reviewCount)})
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>

          {bioText && (
            <div className="p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] leading-relaxed">
              {bioText}
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-[var(--bg-subtle)]/70 border border-[var(--border-subtle)] flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[var(--brand-text)] shrink-0" />
              <span className="font-medium text-[var(--text-primary)]">
                {formatArea(entry.area || 'Dhaka')}
              </span>
            </div>

            {entry.openingHours && (
              <div className="p-2.5 rounded-xl bg-[var(--bg-subtle)]/70 border border-[var(--border-subtle)] flex items-center gap-2">
                <Clock className="w-4 h-4 text-[var(--brand-accent-text)] shrink-0" />
                <span className="font-medium text-[var(--text-primary)]">
                  {formatHours(entry.openingHours)}
                </span>
              </div>
            )}
          </div>

          {!isSelf && (
            <div className="space-y-2 pt-1">
              <button
                type="button"
                disabled={busy || isBlocked}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onMessage(entry);
                    onClose();
                  } finally {
                    setBusy(false);
                  }
                }}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-55 text-[var(--brand-primary-fg)] text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                {busy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <MessageCircle className="w-4 h-4" />
                )}
                <span>{t('rooms.messageUserBtn')}</span>
              </button>

              {!isDemo && (onToggleBlock || onReport) && (
                <div className="flex items-center gap-2">
                  {onReport && (
                    <button
                      type="button"
                      onClick={() => {
                        onReport(entry);
                        onClose();
                      }}
                      className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-canvas)] text-xs font-semibold text-[var(--text-primary)] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Flag className="w-3.5 h-3.5 text-[var(--brand-accent-text)]" />
                      <span>{t('shopProfile.reportBtn')}</span>
                    </button>
                  )}
                  {onToggleBlock && (
                    <button
                      type="button"
                      onClick={() => {
                        onToggleBlock(entry);
                        onClose();
                      }}
                      className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/70 dark:bg-red-950/30 text-xs font-semibold text-red-700 dark:text-red-300 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>
                        {isBlocked ? t('shopProfile.unblockBtn') : t('shopProfile.blockBtn')}
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
