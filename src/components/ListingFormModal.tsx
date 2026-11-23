import { useState } from 'react';
import { ArrowRight, MoonStar, Truck, Upload, X, Zap } from 'lucide-react';
import type { FoodCategory, Listing, StorageMethod, User } from '../types';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import {
  createFirestoreListing,
  updateFirestoreListing,
} from '../lib/firestoreService';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeContext';
import { FOOD_CATEGORY_IMAGES } from '../data/images';

interface ListingFormModalProps {
  open: boolean;
  editingListing?: Listing | null;
  user: User;
  onClose: () => void;
  onSaved: () => void;
  onRequestWeddingPickup?: () => void;
}

const PRESET_PHOTOS: Record<FoodCategory, string> = FOOD_CATEGORY_IMAGES;

const DIET_PREFERENCE_TAGS = ['Halal', 'Veg', 'Vegan', 'Gluten-Free', 'Nut-Free', 'Dairy-Free'];
const ALLERGEN_WARNING_TAGS = ['Contains Nuts', 'Contains Dairy', 'Contains Gluten'];
const UNIT_OPTIONS = ['boxes', 'servings', 'bags', 'packs', 'crates'];
const STORAGE_OPTIONS: StorageMethod[] = [
  'covered_hot',
  'covered_chilled',
  'sealed_dry',
  'room_temp',
];

export function ListingFormModal({
  open,
  editingListing,
  user,
  onClose,
  onSaved,
  onRequestWeddingPickup,
}: ListingFormModalProps) {
  const { lang, t, formatUnit, formatDietary, formatAddress } = useI18n();
  const { ramadanMode } = useTheme();
  const { isFirebaseSession, isFirebaseVerified } = useAuth();
  const [title, setTitle] = useState(editingListing?.title ?? '');
  const [description, setDescription] = useState(editingListing?.description ?? '');
  const [category, setCategory] = useState<FoodCategory>(editingListing?.category ?? 'cooked');
  const [quantity, setQuantity] = useState(editingListing?.quantity ?? 6);
  const [unit, setUnit] = useState(editingListing?.unit ?? 'boxes');
  const [dietaryTags, setDietaryTags] = useState<string[]>(editingListing?.dietaryTags ?? ['Halal']);
  const [photoUrl, setPhotoUrl] = useState(
    editingListing?.photoUrls[0] ?? PRESET_PHOTOS[editingListing?.category ?? 'cooked']
  );
  const [pickupHoursAhead, setPickupHoursAhead] = useState(
    editingListing?.isFlashRescue ? 1 : 3
  );
  const [isFlashRescue, setIsFlashRescue] = useState(Boolean(editingListing?.isFlashRescue));
  const [isRamadanSpecial, setIsRamadanSpecial] = useState(
    editingListing ? Boolean(editingListing.isRamadanSpecial) : ramadanMode
  );
  const [storageMethod, setStorageMethod] = useState<StorageMethod>(
    editingListing?.storageMethod ?? 'covered_hot'
  );
  const [pickupAddress, setPickupAddress] = useState(
    editingListing
      ? formatAddress(editingListing.pickupAddress, editingListing.pickupAddressBn)
      : user.donorProfile
        ? formatAddress(user.donorProfile.address, user.donorProfile.addressBn)
        : lang === 'bn'
          ? 'ধানমন্ডি, ঢাকা'
          : 'Dhanmondi, Dhaka'
  );
  const [consumeWithinHours, setConsumeWithinHours] = useState(
    editingListing?.consumeWithinHours ?? 4
  );
  const [safetyNote, setSafetyNote] = useState(
    editingListing?.safetyNote ?? t('form.defaultSafetyNote')
  );
  const [pledgeAccepted, setPledgeAccepted] = useState(Boolean(editingListing));
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const modalTitle = editingListing ? t('form.editTitle') : t('form.createTitle');

  const handleCategoryChange = (nextCat: FoodCategory) => {
    setCategory(nextCat);
    if (Object.values(PRESET_PHOTOS).includes(photoUrl)) {
      setPhotoUrl(PRESET_PHOTOS[nextCat]);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await api.uploadImage(dataUrl);
      setPhotoUrl(res.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('form.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const toggleTag = (tag: string) => {
    setDietaryTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]
    );
  };

  const handleFlashToggle = (checked: boolean) => {
    setIsFlashRescue(checked);
    if (checked && pickupHoursAhead > 1) {
      setPickupHoursAhead(1);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const pickupStart = editingListing?.pickupStart ?? new Date().toISOString();
      const pickupEnd = new Date(Date.now() + pickupHoursAhead * 3600_000).toISOString();

      const payload = {
        title,
        description,
        category,
        quantity,
        unit,
        dietaryTags,
        photoUrls: [photoUrl],
        pickupStart,
        pickupEnd,
        pickupAddress,
        consumeWithinHours,
        safetyNote,
        isFlashRescue,
        storageMethod,
        isRamadanSpecial,
      };

      if (isFirebaseSession) {
        if (!isFirebaseVerified) {
          setError(t('settings.unverifiedBanner'));
          return;
        }
        if (editingListing) {
          await updateFirestoreListing(editingListing.id, {
            title,
            description,
            remainingQuantity: editingListing.remainingQuantity,
            safetyNote,
            pickupEnd,
            storageMethod,
            isFlashRescue,
            isRamadanSpecial,
          });
        } else {
          await createFirestoreListing(user, {
            title,
            description,
            category,
            quantity,
            unit,
            dietaryTags,
            pickupStart,
            pickupEnd,
            pickupAddress,
            consumeWithinHours,
            safetyNote,
            isFlashRescue,
            storageMethod,
            isRamadanSpecial,
          });
        }
      } else {
        if (editingListing) {
          await api.updateListing(editingListing.id, payload);
        } else {
          await api.createListing(payload);
        }
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('form.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={modalTitle}
    >
      <div className="w-full md:max-w-2xl bg-[var(--bg-surface)] rounded-t-3xl md:rounded-2xl border border-[var(--border-subtle)] shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
          <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
            {modalTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {!editingListing && onRequestWeddingPickup && (
            <div className="rounded-2xl border border-[var(--brand-accent)]/40 bg-[var(--brand-accent-soft)] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <Truck className="w-4 h-4 text-[var(--brand-accent-text)] shrink-0 mt-0.5" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[var(--brand-accent-text)]">
                    {t('home.weddingBannerTitle')}
                  </p>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    {t('wedding.twoHourBadge')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRequestWeddingPickup();
                }}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 sm:whitespace-nowrap text-center shrink-0 cursor-pointer"
              >
                <span>{t('home.donateWeddingCta')}</span>
                <ArrowRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              </button>
            </div>
          )}

          {/* Photo preview + upload */}
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <img
              src={photoUrl}
              alt={t('form.previewAlt')}
              referrerPolicy="no-referrer"
              className="w-full sm:w-40 aspect-[4/3] rounded-2xl object-cover border border-[var(--border-subtle)] dark:brightness-[0.92]"
            />
            <div className="flex-1 space-y-2">
              <p className="text-xs font-semibold text-[var(--text-secondary)]">
                {t('form.photoLabel')}
              </p>
              <label className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] text-xs font-semibold cursor-pointer hover:bg-[var(--bg-subtle)]">
                <Upload className="w-4 h-4 text-[var(--brand-text)]" />
                {uploading ? t('form.uploading') : t('form.uploadPhoto')}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileUpload}
                  className="sr-only"
                />
              </label>
              <p className="text-[11px] text-[var(--text-muted)]">{t('form.photoHint')}</p>
            </div>
          </div>

          <div>
            <label htmlFor="list-title" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
              {t('form.titleLabel')}
            </label>
            <input
              id="list-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('form.titlePlaceholder')}
              className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
            />
          </div>

          <div>
            <label htmlFor="list-desc" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
              {t('form.descLabel')}
            </label>
            <textarea
              id="list-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('form.descPlaceholder')}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="col-span-2">
              <label htmlFor="list-cat" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {t('form.categoryLabel')}
              </label>
              <select
                id="list-cat"
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value as FoodCategory)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-sm"
              >
                <option value="cooked">{t('feed.categories.cooked')}</option>
                <option value="bakery">{t('feed.categories.bakery')}</option>
                <option value="produce">{t('feed.categories.produce')}</option>
                <option value="packaged">{t('feed.categories.packaged')}</option>
              </select>
            </div>

            <div>
              <label htmlFor="list-qty" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {t('form.quantityLabel')}
              </label>
              <input
                id="list-qty"
                type="number"
                min={1}
                max={200}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-sm tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="list-unit" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {t('form.unitLabel')}
              </label>
              <select
                id="list-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-sm"
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u}>
                    {formatUnit(u)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Dietary Preferences */}
          <div className="space-y-2.5">
            <div>
              <p className="text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                {t('safety.dietTagsTitle')}
              </p>
              <div className="flex flex-wrap gap-2">
                {DIET_PREFERENCE_TAGS.map((tag) => {
                  const active = dietaryTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                        active
                          ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] border-[var(--brand-primary)]'
                          : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                      }`}
                    >
                      {formatDietary(tag)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Allergen Warnings */}
            <div>
              <p className="text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                {t('safety.allergenTitle')}
              </p>
              <div className="flex flex-wrap gap-2">
                {ALLERGEN_WARNING_TAGS.map((tag) => {
                  const active = dietaryTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                        active
                          ? 'bg-[var(--brand-accent)] text-[var(--brand-accent-fg)] border-[var(--brand-accent)]'
                          : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                      }`}
                    >
                      {formatDietary(tag)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Flash Rescue & Ramadan / Eid Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] cursor-pointer">
              <input
                type="checkbox"
                checked={isFlashRescue}
                onChange={(e) => handleFlashToggle(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[var(--brand-accent)] cursor-pointer shrink-0"
              />
              <span className="text-xs leading-snug">
                <span className="font-bold text-[var(--brand-accent-text)] inline-flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  {t('flash.formToggleLabel')}
                </span>
                <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">
                  {t('flash.formToggleHint')}
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] cursor-pointer">
              <input
                type="checkbox"
                checked={isRamadanSpecial}
                onChange={(e) => setIsRamadanSpecial(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[var(--brand-primary)] cursor-pointer shrink-0"
              />
              <span className="text-xs leading-snug">
                <span className="font-bold text-[var(--brand-text)] inline-flex items-center gap-1">
                  <MoonStar className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  {t('ramadan.formToggleLabel')}
                </span>
              </span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="list-win" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {t('form.durationLabel')}
              </label>
              <select
                id="list-win"
                value={pickupHoursAhead}
                onChange={(e) => setPickupHoursAhead(Number(e.target.value))}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-sm"
              >
                <option value={1}>{t('form.duration1')}</option>
                <option value={2}>{t('form.duration2')}</option>
                <option value={3}>{t('form.duration3')}</option>
                <option value={5}>{t('form.duration5')}</option>
                <option value={8}>{t('form.duration8')}</option>
              </select>
            </div>

            <div>
              <label htmlFor="list-consume" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {t('form.consumeWithinLabel')}
              </label>
              <input
                id="list-consume"
                type="number"
                min={1}
                max={72}
                value={consumeWithinHours}
                onChange={(e) => setConsumeWithinHours(Number(e.target.value))}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-sm tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="list-storage" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {t('safety.storageLabel')}
              </label>
              <select
                id="list-storage"
                value={storageMethod}
                onChange={(e) => setStorageMethod(e.target.value as StorageMethod)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-sm"
              >
                {STORAGE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {t(`safety.storage.${opt}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="list-addr" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
              {t('form.addressLabel')}
            </label>
            <input
              id="list-addr"
              type="text"
              required
              value={pickupAddress}
              onChange={(e) => setPickupAddress(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-sm"
            />
          </div>

          <div>
            <label htmlFor="list-safety" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
              {t('form.safetyNoteLabel')}
            </label>
            <input
              id="list-safety"
              type="text"
              required
              value={safetyNote}
              onChange={(e) => setSafetyNote(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-sm"
            />
          </div>

          <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-[var(--brand-soft)] border border-[var(--border-subtle)] cursor-pointer">
            <input
              type="checkbox"
              checked={pledgeAccepted}
              onChange={(e) => setPledgeAccepted(e.target.checked)}
              className="mt-0.5 w-5 h-5 accent-[var(--brand-primary)] rounded cursor-pointer shrink-0"
            />
            <span className="text-xs text-[var(--text-primary)] leading-relaxed">
              {t('form.pledgeText')}
            </span>
          </label>

          {error && (
            <p className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[48px] px-5 rounded-xl border border-[var(--border-subtle)] text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={!pledgeAccepted || saving}
              className="flex-1 min-h-[48px] px-5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-45 text-[var(--brand-primary-fg)] text-sm font-semibold transition-colors cursor-pointer"
            >
              {saving
                ? t('form.publishing')
                : editingListing
                  ? t('form.saveBtn')
                  : t('form.publishBtn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
