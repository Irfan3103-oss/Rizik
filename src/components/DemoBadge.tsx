import { useState } from 'react';
import { Info } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

interface DemoBadgeProps {
  compact?: boolean;
  className?: string;
}

export function DemoBadge({ compact = false, className = '' }: DemoBadgeProps) {
  const { t } = useI18n();
  const [showTip, setShowTip] = useState(false);
  const tooltipText = t('demo.tooltip');

  return (
    <span className={`relative inline-flex items-center shrink-0 ${className}`}>
      <span
        role="note"
        title={tooltipText}
        aria-label={`${t('demo.badge')}: ${tooltipText}`}
        onClick={(e) => {
          e.stopPropagation();
          setShowTip((prev) => !prev);
        }}
        onMouseLeave={() => setShowTip(false)}
        className={`inline-flex items-center gap-0.5 rounded-md font-bold bg-amber-100/90 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 border border-amber-300/60 dark:border-amber-700/50 cursor-help select-none ${
          compact ? 'px-1.5 py-0 text-[9px] leading-4' : 'px-1.5 py-0.5 text-[10px]'
        }`}
      >
        <span>{t('demo.badge')}</span>
        <Info className={compact ? 'w-2.5 h-2.5 shrink-0' : 'w-3 h-3 shrink-0'} aria-hidden="true" />
      </span>

      {showTip && (
        <span
          role="tooltip"
          onClick={(e) => {
            e.stopPropagation();
            setShowTip(false);
          }}
          className="absolute left-0 top-full mt-1 z-40 w-52 px-2.5 py-1.5 rounded-xl bg-slate-900 text-white dark:bg-slate-800 text-[11px] font-medium leading-snug shadow-lg border border-white/10 pointer-events-auto"
        >
          {tooltipText}
        </span>
      )}
    </span>
  );
}
