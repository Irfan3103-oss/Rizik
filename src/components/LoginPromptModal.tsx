import {
  Bell,
  CalendarHeart,
  ChefHat,
  ClipboardList,
  Flag,
  Handshake,
  HeartHandshake,
  Lock,
  LogIn,
  MessageCircle,
  Truck,
  UserPlus,
  Utensils,
  X,
} from 'lucide-react';
import type { PendingAuthAction } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';

interface LoginPromptModalProps {
  open: boolean;
  action: PendingAuthAction | null;
  onLogin: () => void;
  onSignup: () => void;
  onClose: () => void;
}

export function LoginPromptModal({
  open,
  action,
  onLogin,
  onSignup,
  onClose,
}: LoginPromptModalProps) {
  const { t, formatNumber } = useI18n();

  if (!open) return null;

  const getIcon = () => {
    switch (action?.type) {
      case 'chat':
      case 'inbox':
        return MessageCircle;
      case 'donate':
        return HeartHandshake;
      case 'claim':
        return Utensils;
      case 'claims':
        return ClipboardList;
      case 'volunteer':
        return CalendarHeart;
      case 'reminder':
        return Bell;
      case 'wedding_submit':
      case 'wedding_tracker':
        return Truck;
      case 'partner':
        return Handshake;
      case 'post_food':
      case 'donor_hub':
        return ChefHat;
      case 'report':
        return Flag;
      case 'shift':
        return CalendarHeart;
      default:
        return Lock;
    }
  };

  const getMessage = () => {
    switch (action?.type) {
      case 'chat':
        return t('gate.actions.chat');
      case 'inbox':
        return t('gate.actions.inbox');
      case 'claim':
        return t('gate.actions.claim');
      case 'claims':
        return t('gate.actions.claims');
      case 'donate':
        return action.draft?.amountBdt
          ? t('gate.actions.donate', { amount: formatNumber(action.draft.amountBdt) })
          : t('gate.actions.donateDefault');
      case 'volunteer':
        return t('gate.actions.volunteer');
      case 'reminder':
        return t('gate.actions.reminder');
      case 'wedding_submit':
      case 'wedding_tracker':
        return t('gate.actions.wedding');
      case 'partner':
        return t('gate.actions.partner');
      case 'post_food':
        return t('gate.actions.postFood');
      case 'donor_hub':
        return t('gate.actions.donorHub');
      case 'report':
        return t('gate.actions.report');
      case 'shift':
        return t('gate.actions.shift');
      case 'review':
        return t('gate.actions.review');
      case 'account':
      default:
        return t('gate.actions.account');
    }
  };

  const ActionIcon = getIcon();

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-xs p-0 md:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-prompt-title"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-md bg-[var(--bg-surface)] rounded-t-3xl md:rounded-3xl border border-[var(--border-subtle)] shadow-2xl p-6 sm:p-7 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-200"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[var(--brand-soft)] text-[var(--brand-text)] flex items-center justify-center shrink-0">
            <ActionIcon className="w-6 h-6" aria-hidden="true" />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="min-h-[40px] min-w-[40px] rounded-xl hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2">
          <h2
            id="login-prompt-title"
            className="font-display text-xl font-extrabold text-[var(--text-primary)] tracking-tight"
          >
            {t('gate.title')}
          </h2>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{getMessage()}</p>
        </div>

        <div className="space-y-2.5 pt-1">
          <button
            type="button"
            onClick={onLogin}
            className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <LogIn className="w-4 h-4 shrink-0" aria-hidden="true" />
            {t('gate.loginBtn')}
          </button>
          <button
            type="button"
            onClick={onSignup}
            className="w-full min-h-[48px] px-5 py-3 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] hover:bg-[var(--brand-soft)] text-[var(--text-primary)] text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <UserPlus className="w-4 h-4 text-[var(--brand-text)] shrink-0" aria-hidden="true" />
            {t('gate.signupBtn')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer transition-colors"
          >
            {t('gate.continueBrowsing')}
          </button>
        </div>
      </div>
    </div>
  );
}
