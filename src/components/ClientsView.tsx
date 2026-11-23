import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, Handshake, Lock, MapPin, Plus, X } from 'lucide-react';
import type { Partner, PartnerCategory, Testimonial, User } from '../types';
import type { PendingAuthAction } from '../auth/AuthContext';
import { api } from '../lib/api';
import { useI18n } from '../i18n/I18nContext';
import { ShopAvatar } from './ShopAvatar';
import { TestimonialsCarousel } from './TestimonialsCarousel';

const PARTNER_CATEGORIES: PartnerCategory[] = [
  'restaurants_cafes',
  'wedding_venues',
  'hotels_catering',
  'ngos_charities',
  'orphanages_shelters',
  'community_groups',
  'individual_families',
];

interface ClientsViewProps {
  user: User | null;
  onRequireLogin: (action: PendingAuthAction, onAllowed?: () => void) => boolean;
  autoOpenPartnerModal?: boolean;
  onConsumeAutoAction?: () => void;
}

export function ClientsView({
  user,
  onRequireLogin,
  autoOpenPartnerModal = false,
  onConsumeAutoAction,
}: ClientsViewProps) {
  const { lang, t, formatNumber, formatArea } = useI18n();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [stats, setStats] = useState({
    partnersJoined: 14,
    mealsDelivered: 45280,
    familiesHelped: 19017,
    eventsHeld: 27,
  });
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<'all' | PartnerCategory>('all');

  // Partner application modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState<PartnerCategory>('restaurants_cafes');
  const [contactPerson, setContactPerson] = useState(user?.name ?? '');
  const [contactInfo, setContactInfo] = useState(user?.phone || user?.email || '');
  const [area, setArea] = useState(user?.area || 'Dhanmondi');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedOrg, setSubmittedOrg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .getPartners()
      .then((res) => {
        setPartners(res.partners);
        setTestimonials(res.testimonials);
        setStats(res.stats);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filteredPartners = useMemo(() => {
    if (selectedCategory === 'all') return partners;
    return partners.filter((p) => p.category === selectedCategory);
  }, [partners, selectedCategory]);

  const openModalDirectly = useCallback(() => {
    setSubmittedOrg(null);
    setErrorMsg(null);
    setOrgName('');
    setMessage('');
    setContactPerson(user?.name ?? '');
    setContactInfo(user?.phone || user?.email || '');
    setArea(user?.area || 'Dhanmondi');
    setModalOpen(true);
  }, [user]);

  useEffect(() => {
    if (autoOpenPartnerModal && user) {
      openModalDirectly();
      onConsumeAutoAction?.();
    }
  }, [autoOpenPartnerModal, user, openModalDirectly, onConsumeAutoAction]);

  const handleOpenModal = () => {
    onRequireLogin({ type: 'partner' }, openModalDirectly);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const res = await api.applyPartner({
        organizationName: orgName,
        category: orgType,
        contactPerson,
        contactInfo,
        area,
        message,
      });
      setSubmittedOrg(res.application.organizationName);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to submit application');
    } finally {
      setSubmitting(false);
    }
  };

  const statItems = [
    { label: t('clients.stats.partnersJoined'), value: formatNumber(stats.partnersJoined) },
    { label: t('clients.stats.mealsDelivered'), value: formatNumber(stats.mealsDelivered) },
    { label: t('clients.stats.familiesHelped'), value: formatNumber(stats.familiesHelped) },
    { label: t('clients.stats.eventsHeld'), value: formatNumber(stats.eventsHeld) },
  ];

  return (
    <div className="space-y-8 pb-6">
      {/* Header Banner */}
      <section className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border-subtle)] p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-2 max-w-2xl min-w-0">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--brand-text)]">
            <Handshake className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{t('nav.clients')}</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
            {t('clients.title')}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            {t('clients.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenModal}
          className="min-h-[48px] px-6 py-3 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-sm font-semibold inline-flex items-center justify-center gap-2 sm:whitespace-nowrap text-center shrink-0 cursor-pointer transition-colors"
        >
          <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{t('clients.becomePartner')}</span>
          {!user && <Lock className="w-3.5 h-3.5 opacity-90 shrink-0" aria-hidden="true" />}
        </button>
      </section>

      {/* Stats Banner */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statItems.map((s) => (
          <div
            key={s.label}
            className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-4 sm:p-5 space-y-1"
          >
            <p className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--brand-text)] tabular-nums">
              {s.value}
            </p>
            <p className="text-xs sm:text-sm font-medium text-[var(--text-secondary)]">{s.label}</p>
          </div>
        ))}
      </section>

      {/* Category Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        <button
          type="button"
          onClick={() => setSelectedCategory('all')}
          className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
            selectedCategory === 'all'
              ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]'
              : 'bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
          }`}
        >
          {t('clients.allCategories')} ({formatNumber(partners.length)})
        </button>
        {PARTNER_CATEGORIES.map((cat) => {
          const active = selectedCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                active
                  ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]'
                  : 'bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              {t(`clients.categories.${cat}`)}
            </button>
          );
        })}
      </div>

      {/* Partners Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="h-44 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPartners.map((partner) => (
            <article
              key={partner.id}
              className="min-w-0 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 flex flex-col justify-between gap-4 hover:border-[var(--brand-primary)]/60 transition-colors"
            >
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <ShopAvatar
                    name={lang === 'bn' ? partner.nameBn : partner.name}
                    imageUrl={partner.logoUrl}
                    size="md"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <h2 className="font-display text-base font-bold text-[var(--text-primary)] leading-snug">
                      {lang === 'bn' ? partner.nameBn : partner.name}
                    </h2>
                    <p className="text-xs font-medium text-[var(--brand-text)]">
                      {t(`clients.categories.${partner.category}`)}
                    </p>
                  </div>
                </div>
                <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                  {lang === 'bn' ? partner.descriptionBn : partner.description}
                </p>
              </div>

              <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2 text-xs text-[var(--text-muted)] tabular-nums">
                <span className="inline-flex items-center gap-1 min-w-0">
                  <MapPin className="w-3.5 h-3.5 shrink-0 text-[var(--brand-text)]" aria-hidden="true" />
                  <span className="truncate">{formatArea(partner.area)}</span>
                </span>
                <span className="font-semibold text-[var(--text-primary)] whitespace-nowrap">
                  {t('clients.sinceLabel', { year: formatNumber(partner.sinceYear) })}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Testimonials Carousel */}
      <TestimonialsCarousel testimonials={testimonials} />

      {/* Become a Partner Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="partner-modal-title"
            className="w-full max-w-lg rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
          >
            <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[var(--brand-text)]" aria-hidden="true" />
                <h2 id="partner-modal-title" className="font-display text-lg font-bold text-[var(--text-primary)]">
                  {t('clients.modalTitle')}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label={t('common.close')}
                className="min-h-[40px] min-w-[40px] rounded-xl hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {submittedOrg ? (
                <div className="py-6 text-center space-y-4">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-[var(--brand-soft)] text-[var(--brand-text)] flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h3 className="font-display text-xl font-bold text-[var(--text-primary)]">
                    {t('clients.applicationSentTitle')}
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {t('clients.applicationSentDesc', { org: submittedOrg })}
                  </p>
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] text-sm font-semibold cursor-pointer"
                  >
                    {t('common.close')}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
                    {t('clients.modalSubtitle')}
                  </p>

                  {errorMsg && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs font-medium text-red-600 dark:text-red-400">
                      {errorMsg}
                    </div>
                  )}

                  <div>
                    <label htmlFor="partner-org" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      {t('clients.orgNameLabel')}
                    </label>
                    <input
                      id="partner-org"
                      type="text"
                      required
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder={t('clients.orgNamePlaceholder')}
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                    />
                  </div>

                  <div>
                    <label htmlFor="partner-cat" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      {t('clients.orgTypeLabel')}
                    </label>
                    <select
                      id="partner-cat"
                      value={orgType}
                      onChange={(e) => setOrgType(e.target.value as PartnerCategory)}
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                    >
                      {PARTNER_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {t(`clients.categories.${c}`)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="partner-person" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                        {t('clients.contactPersonLabel')}
                      </label>
                      <input
                        id="partner-person"
                        type="text"
                        required
                        value={contactPerson}
                        onChange={(e) => setContactPerson(e.target.value)}
                        placeholder={t('clients.contactPersonPlaceholder')}
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                      />
                    </div>
                    <div>
                      <label htmlFor="partner-area" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                        {t('clients.areaLabel')}
                      </label>
                      <input
                        id="partner-area"
                        type="text"
                        required
                        value={area}
                        onChange={(e) => setArea(e.target.value)}
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="partner-contact" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      {t('clients.contactInfoLabel')}
                    </label>
                    <input
                      id="partner-contact"
                      type="text"
                      required
                      value={contactInfo}
                      onChange={(e) => setContactInfo(e.target.value)}
                      placeholder={t('clients.contactInfoPlaceholder')}
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                    />
                  </div>

                  <div>
                    <label htmlFor="partner-msg" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      {t('clients.messageLabel')}
                    </label>
                    <textarea
                      id="partner-msg"
                      rows={3}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={t('clients.messagePlaceholder')}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-sm font-semibold cursor-pointer transition-colors"
                  >
                    {submitting ? t('clients.submittingApplication') : t('clients.submitApplication')}
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
