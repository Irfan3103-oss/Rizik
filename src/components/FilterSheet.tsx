import { X, SlidersHorizontal } from 'lucide-react';
import type { FoodCategory } from '../types';
import { useI18n } from '../i18n/I18nContext';

export interface FeedFilters {
  radiusKm: number;
  category: 'all' | FoodCategory;
  dietary: string[];
  pickupWithinMin: number | null;
  flashOnly?: boolean;
  ramadanOnly?: boolean;
}

interface FilterSheetProps {
  open: boolean;
  filters: FeedFilters;
  onChange: (next: FeedFilters) => void;
  onClose: () => void;
}

const DIETARY_OPTIONS = ['Halal', 'Veg', 'Vegan', 'Gluten-Free', 'Nut-Free', 'Dairy-Free'];

export function FilterSheet({ open, filters, onChange, onClose }: FilterSheetProps) {
  const { t, formatNumber, formatDietary } = useI18n();
  if (!open) return null;

  const toggleDietary = (tag: string) => {
    const exists = filters.dietary.includes(tag);
    onChange({
      ...filters,
      dietary: exists ? filters.dietary.filter((d) => d !== tag) : [...filters.dietary, tag],
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('filters.title')}
    >
      <div className="w-full md:max-w-lg bg-[var(--bg-surface)] rounded-t-3xl md:rounded-2xl border border-[var(--border-subtle)] shadow-2xl max-h-[85vh] flex flex-col">
        <div className="md:hidden w-10 h-1.5 bg-[var(--border-strong)] rounded-full mx-auto mt-3" />

        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-[var(--brand-text)]" />
            <h2 className="text-base font-bold text-[var(--text-primary)]">{t('filters.title')}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-6 overflow-y-auto">
          {/* Distance Radius */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="radius-slider" className="text-sm font-semibold text-[var(--text-primary)]">
                {t('filters.maxDistance')}
              </label>
              <span className="text-sm font-mono tabular-nums font-semibold text-[var(--brand-text)]">
                {formatNumber(filters.radiusKm)} {t('feed.km')}
              </span>
            </div>
            <input
              id="radius-slider"
              type="range"
              min={1}
              max={25}
              value={filters.radiusKm}
              onChange={(e) => onChange({ ...filters, radiusKm: Number(e.target.value) })}
              className="w-full accent-[var(--brand-primary)] h-2 bg-[var(--bg-subtle)] rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-xs text-[var(--text-muted)] mt-1 tabular-nums">
              <span>{formatNumber(1)} {t('feed.km')}</span>
              <span>{formatNumber(10)} {t('feed.km')}</span>
              <span>{formatNumber(25)} {t('feed.km')}</span>
            </div>
          </div>

          {/* Food Category */}
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)] mb-2.5">{t('filters.category')}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(['all', 'cooked', 'bakery', 'produce', 'packaged'] as const).map((catId) => {
                const active = filters.category === catId;
                return (
                  <button
                    key={catId}
                    type="button"
                    onClick={() => onChange({ ...filters, category: catId })}
                    className={`min-h-[44px] px-3 py-2 rounded-xl text-sm font-medium border transition-colors text-left cursor-pointer ${
                      active
                        ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] border-[var(--brand-primary)]'
                        : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    {t(`feed.categories.${catId}`)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dietary Preferences */}
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)] mb-2.5">
              {t('filters.dietary')}
            </p>
            <div className="flex flex-wrap gap-2">
              {DIETARY_OPTIONS.map((tag) => {
                const active = filters.dietary.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleDietary(tag)}
                    className={`min-h-[44px] px-3.5 py-2 rounded-xl text-sm font-medium border transition-colors cursor-pointer ${
                      active
                        ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] border-[var(--brand-primary)]'
                        : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    {formatDietary(tag)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pickup Window */}
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)] mb-2.5">
              {t('filters.pickupEndsWithin')}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: t('filters.anytime'), value: null },
                { label: t('filters.hours1'), value: 60 },
                { label: t('filters.hours2'), value: 120 },
                { label: t('filters.hours4'), value: 240 },
              ].map((opt) => {
                const active = filters.pickupWithinMin === opt.value;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => onChange({ ...filters, pickupWithinMin: opt.value })}
                    className={`min-h-[44px] px-3 py-2 rounded-xl text-sm font-medium border transition-colors cursor-pointer ${
                      active
                        ? 'bg-[var(--brand-accent)] text-[var(--brand-accent-fg)] border-[var(--brand-accent)]'
                        : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Flash Rescue & Seasonal Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => onChange({ ...filters, flashOnly: !filters.flashOnly })}
              aria-pressed={Boolean(filters.flashOnly)}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors text-left cursor-pointer ${
                filters.flashOnly
                  ? 'bg-[var(--brand-accent)] text-[var(--brand-accent-fg)] border-[var(--brand-accent)]'
                  : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
              }`}
            >
              {t('flash.filterToggle')}
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...filters, ramadanOnly: !filters.ramadanOnly })}
              aria-pressed={Boolean(filters.ramadanOnly)}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors text-left cursor-pointer ${
                filters.ramadanOnly
                  ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] border-[var(--brand-primary)]'
                  : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
              }`}
            >
              {t('ramadan.filterToggle')}
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-[var(--border-subtle)] flex items-center gap-3">
          <button
            type="button"
            onClick={() =>
              onChange({
                radiusKm: 15,
                category: 'all',
                dietary: [],
                pickupWithinMin: null,
                flashOnly: false,
                ramadanOnly: false,
              })
            }
            className="min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
          >
            {t('filters.resetFilters')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-sm font-semibold transition-colors cursor-pointer"
          >
            {t('filters.applyFilters')}
          </button>
        </div>
      </div>
    </div>
  );
}
