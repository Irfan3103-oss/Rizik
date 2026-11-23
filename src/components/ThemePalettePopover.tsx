import { useEffect, useRef } from 'react';
import { Check, Moon, MoonStar, Palette, RotateCcw, Sun, X } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useI18n } from '../i18n/I18nContext';

export function BackgroundSection({ compact = false }: { compact?: boolean }) {
  const { darkMode, bgId, setBgId, customBgHex, setCustomBgHex, resetBackground, bgPresets } =
    useTheme();
  const { t } = useI18n();

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="font-display text-xs sm:text-sm font-bold text-[var(--text-primary)]">
            {t('background.title')}
          </h4>
          {!compact && (
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{t('background.subtitle')}</p>
          )}
        </div>
        <button
          type="button"
          onClick={resetBackground}
          className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[11px] font-semibold text-[var(--text-secondary)] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
        >
          <RotateCcw className="w-3 h-3" aria-hidden="true" />
          {t('background.reset')}
        </button>
      </div>

      {/* 12 Preset Swatches (Solids & Soft Gradients) */}
      <div className={compact ? 'grid grid-cols-4 gap-2' : 'grid grid-cols-3 sm:grid-cols-4 gap-2'}>
        {bgPresets.map((preset) => {
          const selected = bgId === preset.id;
          const swatchBg = darkMode ? preset.darkSwatch : preset.lightSwatch;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => setBgId(preset.id)}
              aria-pressed={selected}
              title={t(`background.names.${preset.id}`)}
              className={`min-w-0 p-1.5 rounded-xl border flex flex-col items-center gap-1 transition-colors cursor-pointer ${
                selected
                  ? 'border-[var(--brand-primary)] bg-[var(--brand-soft)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              <span
                className="w-full h-7 rounded-lg border border-black/15 dark:border-white/15 flex items-center justify-center relative"
                style={{ background: swatchBg }}
              >
                {selected && (
                  <span className="w-4 h-4 rounded-full bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] flex items-center justify-center shadow-xs">
                    <Check className="w-2.5 h-2.5" aria-hidden="true" />
                  </span>
                )}
              </span>
              <span className="text-[10px] font-semibold text-[var(--text-primary)] truncate w-full text-center">
                {t(`background.names.${preset.id}`)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Custom Background Color Picker */}
      <div className="p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] flex items-center justify-between gap-3">
        <div className="min-w-0">
          <label
            htmlFor={compact ? 'custom-bg-color-popover' : 'custom-bg-color-settings'}
            className="block text-xs font-semibold text-[var(--text-primary)]"
          >
            {t('background.customLabel')}
          </label>
          <span className="text-[11px] font-mono text-[var(--text-muted)] uppercase">
            {customBgHex}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            id={compact ? 'custom-bg-color-popover' : 'custom-bg-color-settings'}
            type="color"
            value={customBgHex}
            aria-label={t('background.pickColor')}
            onChange={(e) => setCustomBgHex(e.target.value)}
            className="w-9 h-9 rounded-lg border border-[var(--border-strong)] bg-transparent cursor-pointer p-0.5"
          />
          {bgId === 'custom' && (
            <span className="text-xs font-semibold text-[var(--brand-text)]">
              {t('common.active')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function ThemePalettePanel({
  onClose,
  showBackground = true,
  compact = false,
}: {
  onClose?: () => void;
  showBackground?: boolean;
  compact?: boolean;
}) {
  const {
    darkMode,
    toggleDark,
    ramadanMode,
    toggleRamadanMode,
    paletteId,
    setPaletteId,
    customHex,
    setCustomHex,
    resetTheme,
    palettes,
  } = useTheme();
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
            {t('palette.title')}
          </h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">{t('palette.subtitle')}</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="min-h-[36px] min-w-[36px] rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Brightness Mode Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
        <span className="text-xs font-semibold text-[var(--text-secondary)]">
          {t('palette.modeLabel')}
        </span>
        <div className="flex items-center gap-1 bg-[var(--bg-surface)] p-1 rounded-lg border border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => darkMode && toggleDark()}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              !darkMode
                ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Sun className="w-3.5 h-3.5" aria-hidden="true" />
            {t('common.light')}
          </button>
          <button
            type="button"
            onClick={() => !darkMode && toggleDark()}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              darkMode
                ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Moon className="w-3.5 h-3.5" aria-hidden="true" />
            {t('common.dark')}
          </button>
        </div>
      </div>

      {/* Seasonal Ramadan / Eid Mode Row */}
      <button
        type="button"
        onClick={toggleRamadanMode}
        aria-pressed={ramadanMode}
        className={`w-full min-h-[44px] px-3 py-2.5 rounded-xl border flex items-center justify-between gap-2 text-left transition-colors cursor-pointer ${
          ramadanMode
            ? 'border-[var(--brand-primary)] bg-[var(--brand-soft)]'
            : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-surface)]'
        }`}
      >
        <span className="inline-flex items-center gap-2 min-w-0">
          <MoonStar className="w-4 h-4 text-[var(--brand-text)] shrink-0" aria-hidden="true" />
          <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
            {t('ramadan.modeLabel')}
          </span>
        </span>
        <span
          className={`w-9 h-5 rounded-full p-0.5 transition-colors shrink-0 flex items-center ${
            ramadanMode ? 'bg-[var(--brand-primary)] justify-end' : 'bg-[var(--border-strong)] justify-start'
          }`}
        >
          <span className="w-4 h-4 rounded-full bg-white shadow-xs" />
        </span>
      </button>

      {/* Ready-Made Palettes Grid */}
      <div>
        <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">
          {t('palette.presetsLabel')}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {palettes.map((preset) => {
            const selected = paletteId === preset.id;
            const swatchPrimary = darkMode ? preset.dark.primary : preset.light.primary;
            const swatchAccent = darkMode ? preset.dark.accent : preset.light.accent;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setPaletteId(preset.id)}
                className={`min-w-0 min-h-[44px] px-2.5 sm:px-3 py-2 rounded-xl border text-left flex items-center gap-2 sm:gap-2.5 transition-colors cursor-pointer ${
                  selected
                    ? 'border-[var(--brand-primary)] bg-[var(--brand-soft)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]'
                }`}
              >
                <span
                  className="w-5 h-5 rounded-full shrink-0 border border-black/15 dark:border-white/15 relative overflow-hidden"
                  style={{
                    background: `linear-gradient(135deg, ${swatchPrimary} 55%, ${swatchAccent} 55%)`,
                  }}
                  aria-hidden="true"
                />
                <span className="text-xs font-semibold text-[var(--text-primary)] truncate flex-1">
                  {t(`palette.names.${preset.id}`)}
                </span>
                {selected && (
                  <Check
                    className="w-3.5 h-3.5 text-[var(--brand-text)] shrink-0"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Color Picker */}
      <div className="p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] flex items-center justify-between gap-3">
        <div className="min-w-0">
          <label
            htmlFor={compact ? 'custom-palette-color-popover' : 'custom-palette-color-settings'}
            className="block text-xs font-semibold text-[var(--text-primary)]"
          >
            {t('palette.customLabel')}
          </label>
          <span className="text-[11px] font-mono text-[var(--text-muted)] uppercase">
            {customHex}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            id={compact ? 'custom-palette-color-popover' : 'custom-palette-color-settings'}
            type="color"
            value={customHex}
            aria-label={t('palette.pickColor')}
            onChange={(e) => setCustomHex(e.target.value)}
            className="w-9 h-9 rounded-lg border border-[var(--border-strong)] bg-transparent cursor-pointer p-0.5"
          />
          {paletteId === 'custom' && (
            <span className="text-xs font-semibold text-[var(--brand-text)]">
              {t('common.active')}
            </span>
          )}
        </div>
      </div>

      {/* Background Section */}
      {showBackground && (
        <div className="pt-3 border-t border-[var(--border-subtle)]">
          <BackgroundSection compact={compact} />
        </div>
      )}

      {/* Reset All Theme & Background */}
      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={resetTheme}
          className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-secondary)] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          {t('palette.reset')}
        </button>
      </div>
    </div>
  );
}

interface ThemePaletteButtonProps {
  open: boolean;
  onToggleOpen: () => void;
  onClose: () => void;
}

export function ThemePaletteButton({
  open,
  onToggleOpen,
  onClose,
}: ThemePaletteButtonProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (ev: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(ev.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open, onClose]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={open}
        aria-label={t('palette.buttonLabel')}
        title={t('palette.buttonLabel')}
        className={`min-h-[44px] min-w-[40px] sm:min-w-[44px] rounded-xl border flex items-center justify-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${
          open
            ? 'border-[var(--brand-primary)] bg-[var(--brand-soft)] text-[var(--brand-text)]'
            : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[var(--text-primary)]'
        }`}
      >
        <Palette className="w-[18px] h-[18px] text-[var(--brand-text)]" aria-hidden="true" />
      </button>

      {open && (
        <div className="fixed inset-x-4 top-16 sm:inset-x-auto sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:w-96 max-h-[82vh] overflow-y-auto z-50 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-4">
          <ThemePalettePanel onClose={onClose} compact />
        </div>
      )}
    </div>
  );
}
