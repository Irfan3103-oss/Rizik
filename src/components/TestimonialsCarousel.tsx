import { useState } from 'react';
import { ChevronLeft, ChevronRight, Quote } from 'lucide-react';
import type { Testimonial } from '../types';
import { useI18n } from '../i18n/I18nContext';
import { ShopAvatar } from './ShopAvatar';

interface TestimonialsCarouselProps {
  testimonials: Testimonial[];
  title?: string;
  subtitle?: string;
}

export function TestimonialsCarousel({
  testimonials,
  title,
  subtitle,
}: TestimonialsCarouselProps) {
  const { lang, t } = useI18n();
  const [index, setIndex] = useState(0);

  if (testimonials.length === 0) return null;
  const safeIndex = index % testimonials.length;
  const current = testimonials[safeIndex];

  const handlePrev = () => {
    setIndex((i) => (i - 1 + testimonials.length) % testimonials.length);
  };
  const handleNext = () => {
    setIndex((i) => (i + 1) % testimonials.length);
  };

  return (
    <section className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 sm:p-7 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg sm:text-xl font-bold text-[var(--text-primary)]">
            {title || t('clients.testimonialsTitle')}
          </h2>
          {subtitle && (
            <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-0.5">{subtitle}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handlePrev}
            aria-label={t('clients.prevTestimonial')}
            className="min-h-[40px] min-w-[40px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--brand-primary)] text-[var(--text-primary)] flex items-center justify-center cursor-pointer transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleNext}
            aria-label={t('clients.nextTestimonial')}
            className="min-h-[40px] min-w-[40px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--brand-primary)] text-[var(--text-primary)] flex items-center justify-center cursor-pointer transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] p-5 sm:p-6 space-y-4">
        <Quote className="w-6 h-6 text-[var(--brand-text)] opacity-80" aria-hidden="true" />
        <blockquote className="text-sm sm:text-base text-[var(--text-primary)] leading-relaxed font-medium">
          “{lang === 'bn' ? current.quoteBn : current.quote}”
        </blockquote>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)]">
          <div className="flex items-center gap-3 min-w-0">
            <ShopAvatar
              name={lang === 'bn' ? current.authorNameBn : current.authorName}
              imageUrl={current.avatarUrl}
              size="md"
            />
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                {lang === 'bn' ? current.authorNameBn : current.authorName}
              </p>
              <p className="text-xs text-[var(--text-muted)] truncate">
                {lang === 'bn' ? current.roleLabelBn : current.roleLabel} · {current.orgName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Testimonials">
            {testimonials.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={idx === safeIndex}
                aria-label={`${idx + 1}`}
                onClick={() => setIndex(idx)}
                className={`h-2 rounded-full transition-all cursor-pointer ${
                  idx === safeIndex
                    ? 'w-6 bg-[var(--brand-primary)]'
                    : 'w-2 bg-[var(--border-strong)] hover:bg-[var(--brand-primary)]/50'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
