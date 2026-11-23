import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  LocateFixed,
  Lock,
  LogIn,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Truck,
  UserPlus,
  Utensils,
  X,
} from 'lucide-react';
import type { User, WeddingPickupRequest, WeddingPickupStatus } from '../types';
import type { PendingAuthAction, WeddingDraft } from '../auth/AuthContext';
import { api } from '../lib/api';
import { useI18n } from '../i18n/I18nContext';
import { FoodImage } from './FoodImage';
import { StaticOsmMap } from './LocationMessageCard';
import { getImageAlt, IMAGES } from '../data/images';

interface WeddingPickupViewProps {
  user: User | null;
  coords: { lat: number; lng: number };
  refreshTrigger?: number;
  restoredDraft?: WeddingDraft | null;
  onConsumeDraft?: () => void;
  onOpenChat: (conversationId: string) => void;
  onRequireLogin: (action: PendingAuthAction, onAllowed?: () => void) => boolean;
  onLoginClick: () => void;
  onSignupClick: () => void;
}

const EVENT_TYPES = ['wedding', 'reception', 'corporate', 'buffet', 'birthday', 'religious', 'other'];
const FOOD_TYPES = ['rice', 'curry', 'meat', 'sweets', 'bread', 'drinks', 'snacks'];
const STORAGE_OPTIONS = ['covered_hot', 'covered_chilled', 'sealed_containers', 'room_temp'];
const STATUS_STEPS: WeddingPickupStatus[] = [
  'submitted',
  'volunteer_assigned',
  'on_the_way',
  'collected',
  'delivered',
];

export function WeddingPickupView({
  user,
  coords,
  refreshTrigger = 0,
  restoredDraft,
  onConsumeDraft,
  onOpenChat,
  onRequireLogin,
  onLoginClick,
  onSignupClick,
}: WeddingPickupViewProps) {
  const { t, lang, formatNumber, formatAddress } = useI18n();
  const [tab, setTab] = useState<'request' | 'tracker' | 'volunteers'>('request');
  const [pickups, setPickups] = useState<WeddingPickupRequest[]>([]);
  const [loading, setLoading] = useState(Boolean(user));

  // Request Form state
  const [eventType, setEventType] = useState('wedding');
  const [venueName, setVenueName] = useState(user?.donorProfile?.businessName ?? '');
  const [address, setAddress] = useState(user?.donorProfile?.address ?? '');
  const [pinLat, setPinLat] = useState(coords.lat);
  const [pinLng, setPinLng] = useState(coords.lng);
  const [contactPerson, setContactPerson] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [readyTime, setReadyTime] = useState('21:30');
  const [approxServings, setApproxServings] = useState(150);
  const [foodTypes, setFoodTypes] = useState<string[]>(['rice', 'curry', 'meat']);
  const [isHalal, setIsHalal] = useState(true);
  const [isVeg, setIsVeg] = useState(false);
  const [storageMethod, setStorageMethod] = useState('covered_hot');
  const [photoUrl, setPhotoUrl] = useState<string>(IMAGES.weddingBanner.src);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [specialNotes, setSpecialNotes] = useState('');
  const [isUrgent, setIsUrgent] = useState(true);

  // Mandatory 3-box food safety checklist
  const [checkUntouched, setCheckUntouched] = useState(false);
  const [checkCovered, setCheckCovered] = useState(false);
  const [checkFresh, setCheckFresh] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Delivery Confirmation Modal
  const [deliverTarget, setDeliverTarget] = useState<WeddingPickupRequest | null>(null);
  const [delMeals, setDelMeals] = useState(150);
  const [delNote, setDelNote] = useState('');
  const [delPhoto, setDelPhoto] = useState<string>(IMAGES.weddingDelivery.src);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    if (!restoredDraft) return;
    setEventType(restoredDraft.eventType);
    setVenueName(restoredDraft.venueName);
    setAddress(restoredDraft.address);
    setPinLat(restoredDraft.pinLat);
    setPinLng(restoredDraft.pinLng);
    setContactPerson(restoredDraft.contactPerson);
    setPhone(restoredDraft.phone);
    setEventDate(restoredDraft.eventDate);
    setReadyTime(restoredDraft.readyTime);
    setApproxServings(restoredDraft.approxServings);
    setFoodTypes(restoredDraft.foodTypes);
    setIsHalal(restoredDraft.isHalal);
    setIsVeg(restoredDraft.isVeg);
    setStorageMethod(restoredDraft.storageMethod);
    setPhotoUrl(restoredDraft.photoUrl);
    setSpecialNotes(restoredDraft.specialNotes);
    setIsUrgent(restoredDraft.isUrgent);
    setCheckUntouched(restoredDraft.checkUntouched);
    setCheckCovered(restoredDraft.checkCovered);
    setCheckFresh(restoredDraft.checkFresh);
    setTab('request');
    onConsumeDraft?.();
  }, [restoredDraft, onConsumeDraft]);

  const loadPickups = useCallback(async () => {
    if (!user) {
      setPickups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.getWeddingPickups(coords.lat, coords.lng);
      setPickups(res.pickups);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, [user, coords.lat, coords.lng]);

  useEffect(() => {
    loadPickups();
  }, [loadPickups, refreshTrigger]);

  const handlePinCurrentGps = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPinLat(pos.coords.latitude);
        setPinLng(pos.coords.longitude);
      },
      () => {},
      { timeout: 5000 }
    );
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, forDelivery = false) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      if (!user) {
        if (forDelivery) setDelPhoto(dataUrl);
        else setPhotoUrl(dataUrl);
        return;
      }
      const res = await api.uploadImage(dataUrl);
      if (forDelivery) setDelPhoto(res.url);
      else setPhotoUrl(res.url);
    } catch {
      // Fallback kept
    } finally {
      setUploadingPhoto(false);
    }
  };

  const toggleFoodType = (ft: string) => {
    setFoodTypes((prev) => (prev.includes(ft) ? prev.filter((x) => x !== ft) : [...prev, ft]));
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    if (!checkUntouched || !checkCovered || !checkFresh) {
      setFormErr(t('wedding.checklistRequiredErr'));
      return;
    }

    const draft: WeddingDraft = {
      eventType,
      venueName,
      address,
      pinLat,
      pinLng,
      contactPerson,
      phone,
      eventDate,
      readyTime,
      approxServings,
      foodTypes,
      isHalal,
      isVeg,
      storageMethod,
      photoUrl,
      specialNotes,
      isUrgent,
      checkUntouched,
      checkCovered,
      checkFresh,
    };

    if (!onRequireLogin({ type: 'wedding_submit', draft })) {
      return;
    }

    setSubmitting(true);
    try {
      await api.createWeddingPickup({
        eventType,
        venueName,
        address,
        lat: pinLat,
        lng: pinLng,
        contactPerson,
        phone,
        eventDate,
        readyTime,
        approxServings,
        foodTypes: foodTypes.length > 0 ? foodTypes : ['rice', 'curry'],
        isHalal,
        isVeg,
        storageMethod,
        photoUrls: [photoUrl],
        specialNotes,
        isUrgent,
        checklistUntouched: checkUntouched,
        checklistCovered: checkCovered,
        checklistFresh: checkFresh,
      });
      await loadPickups();
      setTab('tracker');
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : 'Unable to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdvanceStatus = async (pickupId: string, nextStatus: WeddingPickupStatus) => {
    setUpdatingId(pickupId);
    try {
      await api.updateWeddingPickupStatus(pickupId, { status: nextStatus });
      await loadPickups();
    } finally {
      setUpdatingId(null);
    }
  };

  const handleClaimNgo = async (pickupId: string) => {
    if (!user) return;
    setUpdatingId(pickupId);
    try {
      await api.claimWeddingNgo(
        pickupId,
        user.organizationName || `${user.name} Shelter Aid`
      );
      await loadPickups();
    } finally {
      setUpdatingId(null);
    }
  };

  const handleOpenChat = async (pickupId: string) => {
    setUpdatingId(pickupId);
    try {
      const res = await api.openWeddingChat(pickupId);
      onOpenChat(res.conversationId);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleConfirmDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deliverTarget) return;
    setUpdatingId(deliverTarget.id);
    try {
      await api.updateWeddingPickupStatus(deliverTarget.id, {
        status: 'delivered',
        deliveredMeals: delMeals,
        deliveryNote: delNote,
        deliveryPhotoUrl: delPhoto,
      });
      setDeliverTarget(null);
      await loadPickups();
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDownloadCertificate = (item: WeddingPickupRequest) => {
    const safeVenue = item.venueName.replace(/[<>&]/g, '');
    const safeContact = item.contactPerson.replace(/[<>&]/g, '');
    const safeNgo = (item.ngoName || 'Local Community Shelters').replace(/[<>&]/g, '');
    const meals = item.deliveredMeals ?? item.approxServings;
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="620" viewBox="0 0 900 620">
  <rect width="900" height="620" fill="#fafaf7"/>
  <rect x="28" y="28" width="844" height="564" rx="22" fill="#ffffff" stroke="#15803d" stroke-width="4"/>
  <rect x="44" y="44" width="812" height="532" rx="16" fill="none" stroke="#d1fae5" stroke-width="2"/>
  <text x="450" y="108" text-anchor="middle" font-family="system-ui,sans-serif" font-size="16" font-weight="700" fill="#15803d" letter-spacing="3">RIZIK FOOD RESCUE</text>
  <text x="450" y="168" text-anchor="middle" font-family="Georgia,serif" font-size="40" font-weight="700" fill="#0f172a">${t('wedding.certTitle')}</text>
  <text x="450" y="206" text-anchor="middle" font-family="system-ui,sans-serif" font-size="16" fill="#475569">${t('wedding.certSubtitle')}</text>
  <line x1="250" y1="234" x2="650" y2="234" stroke="#cbd5e1" stroke-width="1.5"/>
  <text x="450" y="294" text-anchor="middle" font-family="Georgia,serif" font-size="26" font-weight="700" fill="#15803d">${safeVenue}</text>
  <text x="450" y="330" text-anchor="middle" font-family="system-ui,sans-serif" font-size="16" fill="#334155">${t('wedding.certHonoree', { venue: safeVenue, contact: safeContact })}</text>
  <text x="450" y="390" text-anchor="middle" font-family="system-ui,sans-serif" font-size="15" fill="#475569">${t('wedding.certBody', { meals: String(meals), date: item.eventDate, ngo: safeNgo })}</text>
  <rect x="330" y="438" width="240" height="54" rx="12" fill="#ecfdf5" stroke="#10b981"/>
  <text x="450" y="471" text-anchor="middle" font-family="system-ui,sans-serif" font-size="18" font-weight="800" fill="#047857">${meals} Meals Rescued</text>
  <text x="450" y="544" text-anchor="middle" font-family="monospace" font-size="12" fill="#64748b">Verification ID: ${item.id} · Dhaka Zero-Waste Network</text>
</svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Rizik-ThankYou-${item.id}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 pb-6">
      {/* Header */}
      <section className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border-subtle)] p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <div className="lg:col-span-7 min-w-0 space-y-3">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--brand-text)]">
            <Clock className="w-4 h-4 shrink-0" />
            <span>{t('wedding.twoHourBadge')}</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
            {t('wedding.title')}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{t('wedding.subtitle')}</p>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            {(['request', 'tracker', 'volunteers'] as const).map((tabKey) => (
              <button
                key={tabKey}
                type="button"
                onClick={() => setTab(tabKey)}
                className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                  tab === tabKey
                    ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]'
                    : 'bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)]'
                }`}
              >
                <span>{t(`wedding.tabs.${tabKey}`)}</span>
                {!user && tabKey !== 'request' && (
                  <Lock className="w-3 h-3 opacity-75 shrink-0" aria-hidden="true" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 min-w-0 aspect-[16/9] rounded-2xl overflow-hidden border border-[var(--border-subtle)]">
          <FoodImage
            src={IMAGES.weddingCelebration.src}
            alt={getImageAlt(IMAGES.weddingCelebration, lang)}
            className="w-full h-full object-cover"
          />
        </div>
      </section>

      {/* TAB 1: REQUEST FORM + SAFETY GUIDE */}
      {tab === 'request' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleSubmitRequest}
            className="lg:col-span-8 min-w-0 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 sm:p-6 space-y-5"
          >
            {formErr && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs font-semibold text-red-600 dark:text-red-400">
                {formErr}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {t('wedding.eventTypeLabel')}
                </label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
                >
                  {EVENT_TYPES.map((et) => (
                    <option key={et} value={et}>
                      {t(`wedding.eventTypes.${et}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {t('wedding.venueLabel')}
                </label>
                <input
                  type="text"
                  required
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  placeholder={t('wedding.venuePlaceholder')}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                  {t('wedding.addressLabel')}
                </label>
                <button
                  type="button"
                  onClick={handlePinCurrentGps}
                  className="text-xs font-semibold text-[var(--brand-text)] inline-flex items-center gap-1 cursor-pointer hover:underline"
                >
                  <LocateFixed className="w-3.5 h-3.5" />
                  {t('wedding.pinLocationBtn')}
                </button>
              </div>
              <input
                type="text"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={t('wedding.addressPlaceholder')}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
              />
              <StaticOsmMap lat={pinLat} lng={pinLng} label={venueName || address} heightClass="h-32" />
              <p className="text-[11px] font-mono text-[var(--text-muted)] tabular-nums">
                {t('wedding.pinnedCoords', { lat: pinLat.toFixed(4), lng: pinLng.toFixed(4) })}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {t('wedding.contactPersonLabel')}
                </label>
                <input
                  type="text"
                  required
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {t('wedding.phoneLabel')}
                </label>
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {t('wedding.eventDateLabel')}
                </label>
                <input
                  type="date"
                  required
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {t('wedding.readyTimeLabel')}
                </label>
                <input
                  type="time"
                  required
                  value={readyTime}
                  onChange={(e) => setReadyTime(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {t('wedding.servingsLabel')}
                </label>
                <input
                  type="number"
                  min={10}
                  max={5000}
                  required
                  value={approxServings}
                  onChange={(e) => setApproxServings(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
                />
              </div>
            </div>

            {/* Food types multi-select */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                {t('wedding.foodTypesLabel')}
              </label>
              <div className="flex flex-wrap gap-2">
                {FOOD_TYPES.map((ft) => {
                  const active = foodTypes.includes(ft);
                  return (
                    <button
                      key={ft}
                      type="button"
                      onClick={() => toggleFoodType(ft)}
                      className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                        active
                          ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]'
                          : 'bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-secondary)]'
                      }`}
                    >
                      {t(`wedding.foodTypes.${ft}`)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Storage, Dietary & Photo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {t('wedding.storageLabel')}
                </label>
                <select
                  value={storageMethod}
                  onChange={(e) => setStorageMethod(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
                >
                  {STORAGE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {t(`wedding.storageOptions.${opt}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {t('wedding.photoLabel')}
                </label>
                <label className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-xs font-semibold text-[var(--brand-text)] inline-flex items-center gap-2 cursor-pointer w-full">
                  <Camera className="w-4 h-4 shrink-0" />
                  <span>{uploadingPhoto ? t('form.uploading') : t('wedding.uploadPhoto')}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handlePhotoUpload(e, false)}
                  />
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-5">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={isHalal}
                  onChange={(e) => setIsHalal(e.target.checked)}
                  style={{ accentColor: 'var(--brand-primary)' }}
                  className="w-4 h-4"
                />
                {t('wedding.halalFlag')}
              </label>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={isVeg}
                  onChange={(e) => setIsVeg(e.target.checked)}
                  style={{ accentColor: 'var(--brand-primary)' }}
                  className="w-4 h-4"
                />
                {t('wedding.vegFlag')}
              </label>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--brand-accent-text)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={isUrgent}
                  onChange={(e) => setIsUrgent(e.target.checked)}
                  style={{ accentColor: 'var(--brand-accent)' }}
                  className="w-4 h-4"
                />
                {t('wedding.urgentToggleLabel')}
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                {t('wedding.specialNotesLabel')}
              </label>
              <textarea
                rows={2}
                value={specialNotes}
                onChange={(e) => setSpecialNotes(e.target.value)}
                placeholder={t('wedding.specialNotesPlaceholder')}
                className="w-full px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
              />
            </div>

            {/* Mandatory 3-box Safety Checklist */}
            <div className="p-4 rounded-2xl bg-[var(--brand-soft)]/70 border border-[var(--brand-primary)]/30 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--brand-text)]">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>{t('wedding.checklistTitle')}</span>
              </div>
              {[
                { checked: checkUntouched, set: setCheckUntouched, text: t('wedding.checklist1') },
                { checked: checkCovered, set: setCheckCovered, text: t('wedding.checklist2') },
                { checked: checkFresh, set: setCheckFresh, text: t('wedding.checklist3') },
              ].map((item, i) => (
                <label key={i} className="flex items-start gap-2.5 text-xs text-[var(--text-primary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(e) => item.set(e.target.checked)}
                    style={{ accentColor: 'var(--brand-primary)' }}
                    className="w-4 h-4 mt-0.5 shrink-0"
                  />
                  <span>{item.text}</span>
                </label>
              ))}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[48px] px-6 py-3 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              {!user && <Lock className="w-4 h-4 shrink-0" aria-hidden="true" />}
              <span>{submitting ? t('wedding.submittingPickup') : t('wedding.submitPickupBtn')}</span>
            </button>
          </form>

          {/* Short Safety Guide Sidebar */}
          <aside className="lg:col-span-4 min-w-0 space-y-4">
            <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--brand-text)]">
                <Utensils className="w-4 h-4 shrink-0" />
                <h2>{t('wedding.safetyGuideTitle')}</h2>
              </div>
              <ul className="space-y-3 text-xs sm:text-sm text-[var(--text-secondary)]">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-[var(--brand-text)] mt-0.5 shrink-0" />
                  <span>{t('wedding.safetyGuideItem1')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-[var(--brand-text)] mt-0.5 shrink-0" />
                  <span>{t('wedding.safetyGuideItem2')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-[var(--brand-text)] mt-0.5 shrink-0" />
                  <span>{t('wedding.safetyGuideItem3')}</span>
                </li>
              </ul>
            </div>

            <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-4 space-y-2">
              <p className="text-xs font-semibold text-[var(--text-muted)]">{t('wedding.photoLabel')}</p>
              <div className="aspect-[16/10] rounded-xl overflow-hidden border border-[var(--border-subtle)]">
                <FoodImage src={photoUrl} alt={venueName || 'Buffet preview'} className="w-full h-full object-cover" />
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* TAB 2 & 3: TRACKER + VOLUNTEER/NGO QUEUE (Locked for guests to protect venue contacts & addresses) */}
      {(tab === 'tracker' || tab === 'volunteers') && (
        !user ? (
          <div className="max-w-lg mx-auto bg-[var(--bg-surface)] rounded-3xl border border-[var(--border-subtle)] p-6 sm:p-8 text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-[var(--brand-soft)] text-[var(--brand-text)] flex items-center justify-center">
              <Lock className="w-6 h-6" aria-hidden="true" />
            </div>
            <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
              {t('gate.lockedTitle')}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              {t('gate.guestTrackerLocked')}
            </p>
            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  onRequireLogin({ type: 'wedding_tracker' });
                  onLoginClick();
                }}
                className="flex-1 min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <LogIn className="w-4 h-4 shrink-0" aria-hidden="true" />
                {t('gate.loginBtn')}
              </button>
              <button
                type="button"
                onClick={onSignupClick}
                className="flex-1 min-h-[44px] px-5 py-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] hover:bg-[var(--brand-soft)] text-[var(--text-primary)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <UserPlus className="w-4 h-4 text-[var(--brand-text)] shrink-0" aria-hidden="true" />
                {t('gate.signupBtn')}
              </button>
            </div>
          </div>
        ) : loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-48 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {pickups.map((item) => {
              const currentStepIdx = STATUS_STEPS.indexOf(item.status);
              return (
                <article
                  key={item.id}
                  className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-5 sm:p-6 space-y-4"
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                      <FoodImage
                        src={item.photoUrls[0] || IMAGES.weddingBanner.src}
                        alt={item.venueName}
                        className="w-20 h-20 rounded-xl shrink-0"
                      />
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
                            {item.venueName}
                          </h2>
                          {item.isUrgent && item.status !== 'delivered' && (
                            <span className="px-2 py-0.5 rounded-lg bg-[var(--brand-accent-soft)] text-[var(--brand-accent-text)] text-[11px] font-bold inline-flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              {t('wedding.urgentBadge')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--text-secondary)]">
                          {t(`wedding.eventTypes.${item.eventType}`)} · {t('wedding.servingsCount', { count: formatNumber(item.approxServings) })} · {t('wedding.readyAt', { time: item.readyTime })}
                        </p>
                        <p className="text-xs text-[var(--text-muted)] inline-flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-[var(--brand-text)] shrink-0" />
                          <span>{formatAddress(item.address, item.addressBn)}</span>
                          {item.distanceKm !== undefined && (
                            <span className="font-mono text-[var(--brand-text)] font-semibold tabular-nums">
                              · {t('wedding.distanceKm', { km: formatNumber(item.distanceKm) })}
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          {item.foodTypes.map((ft) => t(`wedding.foodTypes.${ft}`)).join(' · ')}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:items-end gap-1 text-xs">
                      <span className="font-bold text-[var(--brand-text)]">
                        {t(`wedding.statuses.${item.status}`)}
                      </span>
                      {item.volunteerName && (
                        <span className="text-[var(--text-secondary)]">
                          {t('wedding.assignedTo', { name: item.volunteerName })}
                        </span>
                      )}
                      {item.ngoName && (
                        <span className="text-[var(--text-secondary)]">
                          {t('wedding.claimedByNgo', { ngo: item.ngoName })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 5-Step Progress Stepper */}
                  <div className="grid grid-cols-5 gap-1.5 pt-1">
                    {STATUS_STEPS.map((step, sIdx) => {
                      const done = sIdx <= currentStepIdx;
                      return (
                        <div key={step} className="space-y-1 min-w-0">
                          <div
                            className={`h-2 rounded-full transition-colors ${
                              done ? 'bg-[var(--brand-primary)]' : 'bg-[var(--border-subtle)]'
                            }`}
                          />
                          <p
                            className={`text-[10px] sm:text-[11px] leading-tight font-semibold truncate ${
                              done ? 'text-[var(--brand-text)]' : 'text-[var(--text-muted)]'
                            }`}
                          >
                            {t(`wedding.statuses.${step}`)}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Delivered Outcome + Thank You Certificate */}
                  {item.status === 'delivered' && (
                    <div className="p-4 rounded-2xl bg-[var(--brand-soft)] border border-[var(--brand-primary)]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        {item.deliveryPhotoUrl && (
                          <FoodImage
                            src={item.deliveryPhotoUrl}
                            alt={item.venueName}
                            className="w-16 h-16 rounded-xl shrink-0"
                          />
                        )}
                        <div className="space-y-0.5">
                          <p className="text-xs font-bold text-[var(--brand-text)] inline-flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4" />
                            {t('wedding.deliveredBannerTitle')} ·{' '}
                            {t('wedding.deliveredMealsCount', {
                              count: formatNumber(item.deliveredMeals ?? item.approxServings),
                            })}
                          </p>
                          {item.deliveryNote && (
                            <p className="text-xs text-[var(--text-primary)]">{item.deliveryNote}</p>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDownloadCertificate(item)}
                        className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 sm:whitespace-nowrap text-center shrink-0 cursor-pointer"
                      >
                        <Award className="w-4 h-4" />
                        {t('wedding.downloadCertBtn')}
                      </button>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
                    {item.status === 'submitted' && (
                      <button
                        type="button"
                        disabled={updatingId === item.id}
                        onClick={() => handleAdvanceStatus(item.id, 'volunteer_assigned')}
                        className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Truck className="w-3.5 h-3.5" />
                        {t('wedding.acceptPickupBtn')}
                      </button>
                    )}

                    {item.status === 'volunteer_assigned' && (
                      <button
                        type="button"
                        disabled={updatingId === item.id}
                        onClick={() => handleAdvanceStatus(item.id, 'on_the_way')}
                        className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Truck className="w-3.5 h-3.5" />
                        {t('wedding.markOnWayBtn')}
                      </button>
                    )}

                    {item.status === 'on_the_way' && (
                      <button
                        type="button"
                        disabled={updatingId === item.id}
                        onClick={() => handleAdvanceStatus(item.id, 'collected')}
                        className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        {t('wedding.markCollectedBtn')}
                      </button>
                    )}

                    {item.status === 'collected' && (
                      <button
                        type="button"
                        disabled={updatingId === item.id}
                        onClick={() => {
                          setDeliverTarget(item);
                          setDelMeals(item.approxServings);
                          setDelNote('');
                        }}
                        className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {t('wedding.markDeliveredBtn')}
                      </button>
                    )}

                    {!item.ngoName && item.status !== 'delivered' && (
                      <button
                        type="button"
                        disabled={updatingId === item.id}
                        onClick={() => handleClaimNgo(item.id)}
                        className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer"
                      >
                        {t('wedding.claimNgoBtn')}
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={updatingId === item.id}
                      onClick={() => handleOpenChat(item.id)}
                      className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--brand-primary)]/40 bg-[var(--brand-soft)] text-xs font-semibold text-[var(--brand-text)] inline-flex items-center gap-1.5 cursor-pointer ml-auto"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      {t('wedding.openChatBtn')}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )
      )}

      {/* DELIVERY CONFIRMATION MODAL */}
      {deliverTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                {t('wedding.deliverModalTitle')}
              </h2>
              <button
                type="button"
                onClick={() => setDeliverTarget(null)}
                className="min-h-[38px] min-w-[38px] rounded-xl hover:bg-[var(--bg-subtle)] flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleConfirmDelivery} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {t('wedding.deliveredMealsLabel')}
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={delMeals}
                  onChange={(e) => setDelMeals(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {t('wedding.deliveryPhotoLabel')}
                </label>
                <label className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-xs font-semibold text-[var(--brand-text)] inline-flex items-center gap-2 cursor-pointer w-full">
                  <Camera className="w-4 h-4" />
                  <span>{t('wedding.uploadPhoto')}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handlePhotoUpload(e, true)}
                  />
                </label>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {t('wedding.deliveryNoteLabel')}
                </label>
                <textarea
                  rows={3}
                  required
                  value={delNote}
                  onChange={(e) => setDelNote(e.target.value)}
                  placeholder={t('wedding.deliveryNotePlaceholder')}
                  className="w-full px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)]"
                />
              </div>
              <button
                type="submit"
                className="w-full min-h-[46px] px-5 py-2.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-sm font-semibold cursor-pointer"
              >
                {t('wedding.confirmDeliveryBtn')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
