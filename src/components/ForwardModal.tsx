import { useEffect, useMemo, useState } from 'react';
import { Check, Forward, Search, Send, X } from 'lucide-react';
import type { Conversation } from '../types';
import { ShopAvatar } from './ShopAvatar';
import { useI18n } from '../i18n/I18nContext';

interface ForwardModalProps {
  open: boolean;
  conversations: Conversation[];
  currentUserId: string;
  onClose: () => void;
  onConfirmForward: (targetConversationIds: string[]) => Promise<void> | void;
}

export function ForwardModal({
  open,
  conversations,
  currentUserId,
  onClose,
  onConfirmForward,
}: ForwardModalProps) {
  const { t, formatNumber } = useI18n();
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setSelectedIds([]);
      setSending(false);
    }
  }, [open]);

  const getConvPeerName = (c: Conversation) => {
    if (c.isFirestoreBacked) {
      return (
        c.peerRestaurantName ||
        (currentUserId === c.donorId
          ? c.recipientOrg
            ? `${c.recipientName} (${c.recipientOrg})`
            : c.recipientName
          : c.donorName)
      );
    }
    return currentUserId === c.donorId
      ? c.recipientOrg
        ? `${c.recipientName} (${c.recipientOrg})`
        : c.recipientName
      : c.donorName;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (c.isBlocked) return false;
      const peerName = getConvPeerName(c);
      if (!q) return true;
      return (
        peerName.toLowerCase().includes(q) ||
        (c.peerHandle ?? '').toLowerCase().includes(q) ||
        c.listingTitle.toLowerCase().includes(q)
      );
    });
  }, [conversations, search, currentUserId]);

  if (!open) return null;

  const toggleId = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSend = async () => {
    if (selectedIds.length === 0) return;
    setSending(true);
    try {
      await onConfirmForward(selectedIds);
      onClose();
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('msgActions.forwardTitle')}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-[var(--bg-surface)] rounded-t-3xl sm:rounded-2xl border border-[var(--border-subtle)] shadow-2xl flex flex-col max-h-[82vh] overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Forward className="w-4 h-4 text-[var(--brand-text)]" />
            <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
              {t('msgActions.forwardTitle')}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="min-h-[38px] min-w-[38px] rounded-xl hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3.5 border-b border-[var(--border-subtle)]">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('msgActions.forwardSearch')}
              className="w-full min-h-[40px] pl-9 pr-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-xs focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)]">
          {filtered.length === 0 ? (
            <p className="p-8 text-center text-xs text-[var(--text-muted)]">
              {t('msgActions.forwardNoResults')}
            </p>
          ) : (
            filtered.map((c) => {
              const isDonorMe = currentUserId === c.donorId;
              const peerName = getConvPeerName(c);
              const avatarUrl =
                c.isFirestoreBacked || c.isDirect
                  ? !isDonorMe
                    ? c.donorLogoUrl || c.listingPhoto
                    : c.recipientLogoUrl || c.listingPhoto
                  : !isDonorMe
                    ? c.donorLogoUrl
                    : c.listingPhoto;
              const subtitleText = c.isDemo
                ? t('chat.demoTag')
                : c.isDirect
                  ? c.peerHandle || t('chat.directPeerBadge')
                  : c.listingTitle;
              const checked = selectedIds.includes(c.id);

              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleId(c.id)}
                  className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors cursor-pointer ${
                    checked ? 'bg-[var(--brand-soft)]' : 'hover:bg-[var(--bg-subtle)]'
                  }`}
                >
                  <ShopAvatar
                    name={peerName}
                    imageUrl={avatarUrl}
                    online={Boolean(c.peerOnline)}
                    showStatusDot
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-[var(--text-primary)] truncate">
                      {peerName}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">
                      {subtitleText}
                    </p>
                  </div>
                  <span
                    aria-hidden="true"
                    className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors shrink-0 ${
                      checked
                        ? 'bg-[var(--brand-primary)] border-[var(--brand-primary)] text-[var(--brand-primary-fg)]'
                        : 'border-[var(--border-strong)] bg-[var(--bg-canvas)]'
                    }`}
                  >
                    {checked && <Check className="w-3.5 h-3.5" />}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={selectedIds.length === 0 || sending}
            onClick={handleSend}
            className="flex-1 min-h-[44px] px-4 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-45 text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            {sending
              ? t('msgActions.forwardSending')
              : t('msgActions.forwardSendBtn', { count: formatNumber(selectedIds.length) })}
          </button>
        </div>
      </div>
    </div>
  );
}
