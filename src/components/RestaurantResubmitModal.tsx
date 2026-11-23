import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Camera,
  FileCheck2,
  MapPin,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { compressImageFileToDataUrl } from '../lib/imageCompress';
import { submitRestaurantOwnerResubmission } from '../lib/firestoreService';
import type { RestaurantInfo, RestaurantType, User } from '../types';
import { MapPinPicker } from './MapPinPicker';
import { useI18n } from '../i18n/I18nContext';

interface RestaurantResubmitModalProps {
  open: boolean;
  restaurant: RestaurantInfo;
  onClose: () => void;
  onResubmitted: (updatedUser: User) => void;
}

const RESTAURANT_TYPES: RestaurantType[] = [
  'restaurant',
  'bakery',
  'sweet_shop',
  'cafe',
  'catering',
  'hotel_kitchen',
  'other',
];

const AREAS = [
  'Dhanmondi',
  'Gulshan 2',
  'Banani',
  'Uttara',
  'Mirpur 10',
  'Motijheel',
  'Mohammadpur',
];

export function RestaurantResubmitModal({
  open,
  restaurant,
  onClose,
  onResubmitted,
}: RestaurantResubmitModalProps) {
  const { t, formatArea } = useI18n();
  const { firebaseUser } = useAuth();

  const [restaurantName, setRestaurantName] = useState(restaurant.restaurantName);
  const [ownerName, setOwnerName] = useState(restaurant.ownerName);
  const [phone, setPhone] = useState(restaurant.phone);
  const [email, setEmail] = useState(restaurant.email ?? '');
  const [address, setAddress] = useState(restaurant.address);
  const [area, setArea] = useState(restaurant.area || 'Dhanmondi');
  const [city, setCity] = useState(restaurant.city || 'Dhaka');
  const [pinCoords, setPinCoords] = useState({ lat: restaurant.lat, lng: restaurant.lng });
  const [restaurantType, setRestaurantType] = useState<RestaurantType>(restaurant.restaurantType);
  const [tradeLicenseNumber, setTradeLicenseNumber] = useState(restaurant.tradeLicenseNumber ?? '');
  const [restaurantPhotoUrl, setRestaurantPhotoUrl] = useState<string | null>(
    restaurant.restaurantPhotoUrl ?? null
  );
  const [licensePhotoUrl, setLicensePhotoUrl] = useState<string | null>(
    restaurant.licensePhotoUrl ?? null
  );
  const [openingHours, setOpeningHours] = useState(restaurant.openingHours);
  const [approxDailySurplus, setApproxDailySurplus] = useState(
    restaurant.approxDailySurplus ?? ''
  );
  const [photoBusy, setPhotoBusy] = useState<'restaurant' | 'license' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRestaurantName(restaurant.restaurantName);
    setOwnerName(restaurant.ownerName);
    setPhone(restaurant.phone);
    setEmail(restaurant.email ?? '');
    setAddress(restaurant.address);
    setArea(restaurant.area || 'Dhanmondi');
    setCity(restaurant.city || 'Dhaka');
    setPinCoords({ lat: restaurant.lat, lng: restaurant.lng });
    setRestaurantType(restaurant.restaurantType);
    setTradeLicenseNumber(restaurant.tradeLicenseNumber ?? '');
    setRestaurantPhotoUrl(restaurant.restaurantPhotoUrl ?? null);
    setLicensePhotoUrl(restaurant.licensePhotoUrl ?? null);
    setOpeningHours(restaurant.openingHours);
    setApproxDailySurplus(restaurant.approxDailySurplus ?? '');
    setError(null);
  }, [open, restaurant]);

  if (!open) return null;

  const handlePhotoUpload = async (target: 'restaurant' | 'license', file: File | undefined) => {
    if (!file) return;
    setError(null);
    setPhotoBusy(target);
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 720, 180_000);
      if (target === 'restaurant') setRestaurantPhotoUrl(dataUrl);
      else setLicensePhotoUrl(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('restaurant.errPhotoFailed'));
    } finally {
      setPhotoBusy(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!firebaseUser) {
      setError(t('settings.unverifiedBanner'));
      return;
    }
    if (restaurantName.trim().length < 2) {
      setError(t('restaurant.errRestaurantName'));
      return;
    }
    if (ownerName.trim().length < 2) {
      setError(t('restaurant.errOwnerName'));
      return;
    }
    if (phone.trim().length < 5) {
      setError(t('restaurant.errPhone'));
      return;
    }
    if (address.trim().length < 3 || !city.trim()) {
      setError(t('restaurant.errAddress'));
      return;
    }
    if (openingHours.trim().length < 2) {
      setError(t('restaurant.errOpeningHours'));
      return;
    }

    setSubmitting(true);
    try {
      const updatedUser = await submitRestaurantOwnerResubmission(
        firebaseUser,
        {
          restaurantName: restaurantName.trim(),
          ownerName: ownerName.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
          address: address.trim(),
          area: area.trim() || 'Dhanmondi',
          city: city.trim() || 'Dhaka',
          lat: pinCoords.lat,
          lng: pinCoords.lng,
          restaurantType,
          tradeLicenseNumber: tradeLicenseNumber.trim() || null,
          restaurantPhotoUrl,
          licensePhotoUrl,
          openingHours: openingHours.trim(),
          approxDailySurplus: approxDailySurplus.trim() || null,
          acceptedSafetyTerms: true,
          verificationStatus: 'pending',
          rejectionReason: null,
        },
        t('restaurant.resubmittedSystemChatNote', { restaurantName: restaurantName.trim() })
      );
      onResubmitted(updatedUser);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('onboarding.verifyError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('restaurant.resubmitModalTitle')}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-xl max-h-[90vh] flex flex-col bg-[var(--bg-surface)] rounded-t-3xl sm:rounded-2xl border border-[var(--border-subtle)] shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <h2 className="font-display text-base sm:text-lg font-bold text-[var(--text-primary)] truncate">
              {t('restaurant.resubmitModalTitle')}
            </h2>
            <p className="text-xs text-[var(--text-muted)] truncate">
              {t('restaurant.resubmitModalSubtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="min-h-[40px] min-w-[40px] rounded-xl hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {restaurant.rejectionReason && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300 space-y-1">
              <p className="font-bold">{t('restaurant.rejectionReasonHeading')}</p>
              <p>{restaurant.rejectionReason}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {t('restaurant.restaurantNameLabel')} *
              </label>
              <input
                type="text"
                value={restaurantName}
                onChange={(e) => setRestaurantName(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {t('restaurant.ownerFullNameLabel')} *
              </label>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {t('restaurant.phoneLabel')} *
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {t('restaurant.typeLabel')} *
              </label>
              <select
                value={restaurantType}
                onChange={(e) => setRestaurantType(e.target.value as RestaurantType)}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm"
              >
                {RESTAURANT_TYPES.map((rt) => (
                  <option key={rt} value={rt}>
                    {t(`restaurant.types.${rt}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {t('restaurant.fullAddressLabel')} *
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {t('onboarding.areaLabel')} *
              </label>
              <select
                value={area}
                onChange={(e) => setArea(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm"
              >
                {AREAS.map((a) => (
                  <option key={a} value={a}>
                    {formatArea(a)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {t('restaurant.cityLabel')} *
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {t('restaurant.emailOptionalLabel')}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm"
              />
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-semibold text-[var(--text-secondary)] inline-flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-[var(--brand-text)]" />
              {t('restaurant.mapPinLabel')} *
            </p>
            <MapPinPicker lat={pinCoords.lat} lng={pinCoords.lng} onChange={setPinCoords} heightClass="h-40" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {t('restaurant.openingHoursLabel')} *
              </label>
              <input
                type="text"
                value={openingHours}
                onChange={(e) => setOpeningHours(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {t('restaurant.dailySurplusLabel')}
              </label>
              <input
                type="text"
                value={approxDailySurplus}
                onChange={(e) => setApproxDailySurplus(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
              {t('restaurant.tradeLicenseLabel')}
            </label>
            <input
              type="text"
              value={tradeLicenseNumber}
              onChange={(e) => setTradeLicenseNumber(e.target.value)}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl border border-dashed border-[var(--border-strong)] space-y-2">
              <p className="text-xs font-semibold text-[var(--text-secondary)]">
                {t('restaurant.restaurantPhotoLabel')}
              </p>
              {restaurantPhotoUrl ? (
                <div className="relative rounded-xl overflow-hidden h-24">
                  <img src={restaurantPhotoUrl} alt={restaurantName} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setRestaurantPhotoUrl(null)}
                    className="absolute top-1.5 right-1.5 min-h-[28px] min-w-[28px] rounded-lg bg-black/65 text-white flex items-center justify-center cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className="min-h-[40px] px-3 py-2 rounded-xl bg-[var(--bg-subtle)] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer">
                  <Camera className="w-4 h-4 text-[var(--brand-text)]" />
                  <span>{photoBusy === 'restaurant' ? t('restaurant.processingPhoto') : t('restaurant.uploadPhotoBtn')}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      void handlePhotoUpload('restaurant', e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </div>

            <div className="p-3 rounded-xl border border-dashed border-[var(--border-strong)] space-y-2">
              <p className="text-xs font-semibold text-[var(--text-secondary)]">
                {t('restaurant.licensePhotoLabel')}
              </p>
              {licensePhotoUrl ? (
                <div className="relative rounded-xl overflow-hidden h-24">
                  <img src={licensePhotoUrl} alt="License" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setLicensePhotoUrl(null)}
                    className="absolute top-1.5 right-1.5 min-h-[28px] min-w-[28px] rounded-lg bg-black/65 text-white flex items-center justify-center cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className="min-h-[40px] px-3 py-2 rounded-xl bg-[var(--bg-subtle)] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer">
                  <FileCheck2 className="w-4 h-4 text-[var(--brand-text)]" />
                  <span>{photoBusy === 'license' ? t('restaurant.processingPhoto') : t('restaurant.uploadLicenseBtn')}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      void handlePhotoUpload('license', e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/45 border border-red-200 dark:border-red-900/60 px-3 py-2 rounded-xl flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </p>
          )}

          <div className="flex items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[44px] px-4 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 min-h-[44px] px-4 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-50 text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              {submitting ? t('common.loading') : t('restaurant.resubmitBtn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
