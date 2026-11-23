import { Languages } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

interface LanguageToggleProps {
  onAfterToggle?: (nextLang: 'en' | 'bn') => void;
  className?: string;
}

export function LanguageToggle({ onAfterToggle, className = '' }: LanguageToggleProps) {
  const { lang, setLang } = useI18n();
  const nextLang = lang === 'en' ? 'bn' : 'en';
  const ariaLabel = lang === 'en' ? 'Switch language to Bangla (বাংলা)' : 'Switch language to English';

  const handleClick = () => {
    setLang(nextLang);
    onAfterToggle?.(nextLang);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={`min-h-[44px] px-2 sm:px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[var(--text-primary)] text-xs font-semibold inline-flex items-center gap-1 sm:gap-1.5 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${className}`}
    >
      <Languages className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--brand-text)] shrink-0" aria-hidden="true" />
      <span>{lang === 'en' ? 'বাংলা' : 'EN'}</span>
    </button>
  );
}
