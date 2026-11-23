import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  FileCheck2,
  KeyRound,
  Leaf,
  Lock,
  LogIn,
  MapPin,
  Sparkles,
  Store,
  Trash2,
  User as UserIcon,
  UserPlus,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import type { AccountType, AuthSession, RestaurantInfo, RestaurantType, User } from '../types';
import { compressImageFileToDataUrl } from '../lib/imageCompress';
import { MapPinPicker } from './MapPinPicker';
import { ThemePaletteButton } from './ThemePalettePopover';
import { LanguageToggle } from './LanguageToggle';
import { useI18n } from '../i18n/I18nContext';
import { getImageAlt, IMAGES } from '../data/images';

export type AuthMode = 'login' | 'signup' | 'forgot';

interface OnboardingAuthProps {
  mode?: AuthMode;
  onModeChange?: (mode: AuthMode) => void;
  initialRole?: 'recipient' | 'donor';
  embedded?: boolean;
  notice?: string | null;
  onBackHome?: () => void;
  onAuthenticated: (session: AuthSession) => void;
}

const SLIDE_CONFIGS = [
  {
    titleKey: 'onboarding.slide1Title',
    subtitleKey: 'onboarding.slide1Subtitle',
    asset: IMAGES.onboardingSlides[0],
  },
  {
    titleKey: 'onboarding.slide2Title',
    subtitleKey: 'onboarding.slide2Subtitle',
    asset: IMAGES.onboardingSlides[1],
  },
  {
    titleKey: 'onboarding.slide3Title',
    subtitleKey: 'onboarding.slide3Subtitle',
    asset: IMAGES.onboardingSlides[2],
  },
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

const RESTAURANT_TYPES: RestaurantType[] = [
  'restaurant',
  'bakery',
  'sweet_shop',
  'cafe',
  'catering',
  'hotel_kitchen',
  'other',
];

const AREA_COORDS: Record<string, { lat: number; lng: number }> = {
  Dhanmondi: { lat: 23.7465, lng: 90.376 },
  'Gulshan 2': { lat: 23.7925, lng: 90.4078 },
  Banani: { lat: 23.7937, lng: 90.4066 },
  Uttara: { lat: 23.8759, lng: 90.3795 },
  'Mirpur 10': { lat: 23.8069, lng: 90.3687 },
  Motijheel: { lat: 23.733, lng: 90.4172 },
  Mohammadpur: { lat: 23.7658, lng: 90.3584 },
};

export function OnboardingAuth({
  mode,
  onModeChange,
  initialRole,
  embedded = false,
  notice,
  onBackHome,
  onAuthenticated,
}: OnboardingAuthProps) {
  const { lang, t, formatNumber, formatArea } = useI18n();
  const { signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const [internalMode, setInternalMode] = useState<AuthMode>(mode ?? 'login');
  const activeMode = mode ?? internalMode;

  const switchMode = (next: AuthMode) => {
    setError(null);
    setGoogleError(null);
    setSuccessNotice(null);
    setInternalMode(next);
    onModeChange?.(next);
  };

  const [slideIdx, setSlideIdx] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Shared / Login state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Signup Account Type & Common state
  const [accountType, setAccountType] = useState<AccountType>(
    initialRole === 'donor' ? 'restaurantOwner' : 'user'
  );
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [area, setArea] = useState('Dhanmondi');
  const [organizationName, setOrganizationName] = useState('');
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);

  // Restaurant Owner Onboarding state
  const [restaurantName, setRestaurantName] = useState('');
  const [ownerFullName, setOwnerFullName] = useState('');
  const [restaurantPhone, setRestaurantPhone] = useState('');
  const [restaurantEmail, setRestaurantEmail] = useState('');
  const [restaurantAddress, setRestaurantAddress] = useState('');
  const [restaurantCity, setRestaurantCity] = useState('Dhaka');
  const [pinCoords, setPinCoords] = useState<{ lat: number; lng: number }>({
    lat: 23.7465,
    lng: 90.376,
  });
  const [restaurantType, setRestaurantType] = useState<RestaurantType>('restaurant');
  const [tradeLicenseNumber, setTradeLicenseNumber] = useState('');
  const [restaurantPhotoUrl, setRestaurantPhotoUrl] = useState<string | null>(null);
  const [licensePhotoUrl, setLicensePhotoUrl] = useState<string | null>(null);
  const [openingHours, setOpeningHours] = useState('10:00 AM - 11:00 PM');
  const [approxDailySurplus, setApproxDailySurplus] = useState('');
  const [acceptedSafetyTerms, setAcceptedSafetyTerms] = useState(false);
  const [photoBusy, setPhotoBusy] = useState<'restaurant' | 'license' | null>(null);

  // Forgot password state
  const [resetSent, setResetSent] = useState(false);
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const [demoAccounts, setDemoAccounts] = useState<
    {
      id: string;
      role: string;
      name: string;
      area: string;
      organization_name?: string | null;
      business_name?: string | null;
    }[]
  >([]);

  useEffect(() => {
    if (initialRole === 'donor') {
      setAccountType('restaurantOwner');
    } else if (initialRole === 'recipient') {
      setAccountType('user');
    }
  }, [initialRole]);

  useEffect(() => {
    if (mode && mode !== internalMode) {
      setInternalMode(mode);
      setError(null);
    }
  }, [mode, internalMode]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSlideIdx((prev) => (prev + 1) % SLIDE_CONFIGS.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    api
      .getDemoAccounts()
      .then((res) => setDemoAccounts(res.accounts))
      .catch(() => {});
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setGoogleError(null);
    setSuccessNotice(null);

    const trimmedIdentifier = identifier.trim();
    if (!trimmedIdentifier) {
      setError(t('auth.errIdentifierRequired'));
      return;
    }
    if (!password) {
      setError(t('auth.errPasswordLength'));
      return;
    }

    setLoading(true);
    try {
      if (trimmedIdentifier.includes('@')) {
        try {
          const session = await signInWithEmail(trimmedIdentifier, password);
          onAuthenticated(session);
          return;
        } catch (fbErr) {
          const code =
            typeof fbErr === 'object' && fbErr && 'code' in fbErr
              ? String((fbErr as { code?: unknown }).code)
              : '';
          if (
            code !== 'auth/user-not-found' &&
            code !== 'auth/invalid-credential' &&
            code !== 'auth/operation-not-allowed'
          ) {
            throw fbErr;
          }
        }
      }
      const session = await api.login(trimmedIdentifier, password);
      onAuthenticated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('onboarding.verifyError'));
    } finally {
      setLoading(false);
    }
  };

  const handleAreaSelect = (nextArea: string) => {
    setArea(nextArea);
    const preset = AREA_COORDS[nextArea];
    if (preset) {
      setPinCoords(preset);
    }
  };

  const handlePhotoUpload = async (
    target: 'restaurant' | 'license',
    file: File | undefined
  ) => {
    if (!file) return;
    setError(null);
    setPhotoBusy(target);
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 720, 180_000);
      if (target === 'restaurant') {
        setRestaurantPhotoUrl(dataUrl);
      } else {
        setLicensePhotoUrl(dataUrl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('restaurant.errPhotoFailed'));
    } finally {
      setPhotoBusy(null);
    }
  };

  const validateAndBuildRestaurantInfo = (): { error?: string; info?: RestaurantInfo } => {
    const resolvedOwner = (ownerFullName.trim() || name.trim());
    if (restaurantName.trim().length < 2) {
      return { error: t('restaurant.errRestaurantName') };
    }
    if (resolvedOwner.length < 2) {
      return { error: t('restaurant.errOwnerName') };
    }
    if (restaurantPhone.trim().length < 5) {
      return { error: t('restaurant.errPhone') };
    }
    if (restaurantAddress.trim().length < 3 || !restaurantCity.trim()) {
      return { error: t('restaurant.errAddress') };
    }
    if (!openingHours.trim() || openingHours.trim().length < 2) {
      return { error: t('restaurant.errOpeningHours') };
    }
    if (!acceptedSafetyTerms) {
      return { error: t('restaurant.errSafetyTerms') };
    }
    return {
      info: {
        restaurantName: restaurantName.trim(),
        ownerName: resolvedOwner,
        phone: restaurantPhone.trim(),
        email: restaurantEmail.trim() || null,
        address: restaurantAddress.trim(),
        area: area.trim() || 'Dhanmondi',
        city: restaurantCity.trim() || 'Dhaka',
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
        submittedAt: new Date().toISOString(),
      },
    };
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setGoogleError(null);
    setSuccessNotice(null);

    const trimmedIdentifier = identifier.trim();
    const resolvedName = (name.trim() || ownerFullName.trim());

    if (!resolvedName) {
      setError(t('auth.errFullNameRequired'));
      return;
    }
    if (!trimmedIdentifier) {
      setError(t('auth.errIdentifierRequired'));
      return;
    }
    if (accountType === 'restaurantOwner' && !trimmedIdentifier.includes('@')) {
      setError(t('restaurant.errEmailRequiredForOwner'));
      return;
    }
    if (password.length < 6) {
      setError(t('auth.errPasswordLength'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('auth.errPasswordMismatch'));
      return;
    }

    let restaurantInfo: RestaurantInfo | undefined;
    if (accountType === 'restaurantOwner') {
      const checked = validateAndBuildRestaurantInfo();
      if (checked.error || !checked.info) {
        setError(checked.error || t('auth.errDonorFieldsRequired'));
        return;
      }
      restaurantInfo = checked.info;
    }

    if (!agreedTerms) {
      setError(t('auth.errTermsRequired'));
      return;
    }
    if (!agreedPrivacy) {
      setError(t('auth.errPrivacyRequired'));
      return;
    }

    setLoading(true);
    try {
      if (trimmedIdentifier.includes('@')) {
        try {
          const session = await signUpWithEmail({
            name: resolvedName,
            email: trimmedIdentifier,
            password,
            accountType,
            role: accountType === 'restaurantOwner' ? 'restaurantOwner' : 'user',
            area,
            phone: restaurantInfo?.phone,
            organizationName: accountType === 'user' ? organizationName.trim() || undefined : undefined,
            businessName: restaurantInfo?.restaurantName,
            address: restaurantInfo?.address,
            hours: restaurantInfo?.openingHours,
            restaurant: restaurantInfo,
          });
          onAuthenticated(session);
          return;
        } catch (fbErr) {
          const code =
            typeof fbErr === 'object' && fbErr && 'code' in fbErr
              ? String((fbErr as { code?: unknown }).code)
              : '';
          if (code === 'auth/email-already-in-use') {
            setError(t('auth.emailAlreadyInUse'));
            return;
          }
          if (code === 'auth/weak-password') {
            setError(t('auth.weakPassword'));
            return;
          }
          if (code !== 'auth/operation-not-allowed' || accountType === 'restaurantOwner') {
            throw fbErr;
          }
        }
      }

      const session = await api.register({
        name: resolvedName,
        identifier: trimmedIdentifier,
        password,
        role: 'recipient',
        area,
        organizationName: organizationName.trim() || undefined,
        language: lang,
      });
      onAuthenticated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('onboarding.verifyError'));
    } finally {
      setLoading(false);
    }
  };

  const handleSendResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!identifier.trim()) {
      setError(t('auth.errIdentifierRequired'));
      return;
    }
    setLoading(true);
    try {
      const res = await api.forgotPassword(identifier.trim());
      setResetSent(true);
      setDevOtpHint(res.devOtpHint);
      setResetCode(res.devOtpHint);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('onboarding.sendCodeError'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!resetCode.trim()) {
      setError(t('auth.errCodeRequired'));
      return;
    }
    if (newPassword.length < 6) {
      setError(t('auth.errPasswordLength'));
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError(t('auth.errPasswordMismatch'));
      return;
    }

    setLoading(true);
    try {
      await api.resetPassword({
        identifier: identifier.trim(),
        code: resetCode.trim(),
        newPassword,
      });
      setResetSent(false);
      setDevOtpHint(null);
      setResetCode('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPassword('');
      switchMode('login');
      setSuccessNotice(t('auth.resetSuccessNotice'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('onboarding.verifyError'));
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (userId: string) => {
    setError(null);
    setSuccessNotice(null);
    setLoading(true);
    try {
      const session = await api.demoLogin(userId);
      onAuthenticated(session);
    } catch {
      // Offline / static-host fallback for instant reviewer preview
      const isDonor = userId === 'donor_1';
      const fallbackUser: User = isDonor
        ? {
            id: 'donor_1',
            role: 'donor',
            name: 'Arif Chowdhury',
            phone: '+8801711-223344',
            email: 'demo.restaurant@rizik.org',
            location: 'House 42, Road 27, Dhanmondi, Dhaka',
            area: 'Dhanmondi',
            organizationName: 'Saffron Kitchen',
            verified: true,
            language: lang,
            savedRadiusKm: 15,
            createdAt: new Date().toISOString(),
            donorProfile: {
              userId: 'donor_1',
              businessName: 'Saffron Kitchen',
              address: 'House 42, Road 27, Dhanmondi, Dhaka',
              lat: 23.7465,
              lng: 90.376,
              hours: '10:00 AM - 10:30 PM',
              verificationStatus: 'verified',
            },
            restaurant: {
              restaurantName: 'Saffron Kitchen',
              ownerName: 'Arif Chowdhury',
              phone: '+8801711-223344',
              email: 'demo.restaurant@rizik.org',
              address: 'House 42, Road 27, Dhanmondi, Dhaka',
              city: 'Dhaka',
              area: 'Dhanmondi',
              lat: 23.7465,
              lng: 90.376,
              restaurantType: 'restaurant',
              tradeLicenseNumber: 'TR-DHN-88214',
              openingHours: '10:00 AM - 10:30 PM',
              approxDailySurplus: '15-25 meals',
              restaurantPhotoUrl: '/images/haji-biriyani-boxes.jpg',
              acceptedSafetyTerms: true,
              verificationStatus: 'approved',
            },
          }
        : {
            id: 'recip_1',
            role: 'recipient',
            name: 'Nadia Rahman',
            phone: '+8801722-102030',
            email: 'demo.user@rizik.org',
            location: 'Dhanmondi, Dhaka',
            area: 'Dhanmondi',
            organizationName: null,
            verified: true,
            language: lang,
            savedRadiusKm: 10,
            createdAt: new Date().toISOString(),
          };

      const fallbackSession: AuthSession = {
        token: `demo_token_${Date.now()}`,
        user: fallbackUser,
      };
      onAuthenticated(fallbackSession);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setGoogleError(null);
    setSuccessNotice(null);

    if (activeMode === 'signup' && accountType === 'restaurantOwner') {
      const checked = validateAndBuildRestaurantInfo();
      if (checked.error || !checked.info) {
        setGoogleError(checked.error || t('restaurant.errFillBeforeGoogle'));
        return;
      }
      setGoogleLoading(true);
      try {
        const session = await signInWithGoogle({
          displayName: checked.info.ownerName,
          accountType: 'restaurantOwner',
          role: 'restaurantOwner',
          area: checked.info.area,
          phone: checked.info.phone,
          businessName: checked.info.restaurantName,
          address: checked.info.address,
          hours: checked.info.openingHours,
          restaurant: checked.info,
        });
        onAuthenticated(session);
      } catch (err) {
        setGoogleError(err instanceof Error ? err.message : t('onboarding.verifyError'));
      } finally {
        setGoogleLoading(false);
      }
      return;
    }

    setGoogleLoading(true);
    try {
      const session = await signInWithGoogle(
        activeMode === 'signup'
          ? {
              accountType: 'user',
              role: 'user',
              area,
              organizationName: organizationName.trim() || undefined,
            }
          : undefined
      );
      onAuthenticated(session);
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : t('onboarding.verifyError'));
    } finally {
      setGoogleLoading(false);
    }
  };

  const activeSlide = SLIDE_CONFIGS[slideIdx];
  const slideTitle = t(activeSlide.titleKey);
  const slideSubtitle = t(activeSlide.subtitleKey);

  return (
    <div
      className={
        embedded
          ? 'text-[var(--text-primary)]'
          : 'min-h-screen bg-transparent text-[var(--text-primary)] flex flex-col'
      }
    >
      {!embedded && (
        <header className="sticky top-0 z-30 bg-[var(--bg-header)] backdrop-blur-md border-b border-[var(--border-subtle)]">
          <div className="w-full max-w-6xl mx-auto px-2.5 sm:px-6 min-h-14 py-1.5 sm:py-0 sm:h-14 md:h-16 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 sm:gap-4">
            <button
              type="button"
              onClick={() => {
                if (onBackHome) onBackHome();
                else switchMode('login');
              }}
              className="flex items-center gap-1.5 sm:gap-2.5 cursor-pointer hover:opacity-85 transition-opacity group min-w-0"
            >
              <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-xl bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] flex items-center justify-center font-display font-bold shrink-0 transition-transform group-hover:scale-105">
                <Leaf className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <span className="font-display text-[15px] sm:text-lg font-extrabold tracking-tight truncate text-[var(--brand-text)]">
                {t('common.appName')}
              </span>
            </button>

            <div className="flex items-center flex-wrap sm:flex-nowrap justify-end gap-1.5 sm:gap-2 max-w-full">
              <ThemePaletteButton
                open={paletteOpen}
                onToggleOpen={() => setPaletteOpen((o) => !o)}
                onClose={() => setPaletteOpen(false)}
              />
              <LanguageToggle />
              {activeMode !== 'login' ? (
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="min-h-[44px] sm:min-h-[40px] px-3 sm:px-3.5 py-2 rounded-xl text-xs font-semibold text-[var(--brand-text)] hover:bg-[var(--brand-soft)] whitespace-nowrap cursor-pointer"
                >
                  {t('auth.loginLink')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className="min-h-[44px] sm:min-h-[40px] px-3 sm:px-3.5 py-2 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold whitespace-nowrap cursor-pointer"
                >
                  {t('auth.createAccountLink')}
                </button>
              )}
            </div>
          </div>
        </header>
      )}

      <main
        className={
          embedded
            ? 'grid grid-cols-1 lg:grid-cols-12 gap-8 items-start min-w-0'
            : 'flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center min-w-0'
        }
      >
        {/* Left Visual Story Column */}
        <div className="lg:col-span-6 min-w-0 space-y-4">
          {onBackHome && (
            <button
              type="button"
              onClick={onBackHome}
              className="min-h-[40px] px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              {t('gate.backToBrowsing')}
            </button>
          )}
          {notice && (
            <div className="p-3.5 rounded-2xl bg-[var(--brand-accent-soft)] border border-[var(--brand-accent)]/35 text-xs font-semibold text-[var(--brand-accent-text)] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{notice}</span>
            </div>
          )}

          <div className="relative rounded-3xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-sm aspect-[16/11]">
            <img
              src={activeSlide.asset.src}
              alt={getImageAlt(activeSlide.asset, lang)}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover dark:brightness-[0.9] transition-[filter] duration-250"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6 text-white space-y-2">
              <p className="text-xs font-medium text-white/80">
                {t('onboarding.networkTag', {
                  current: slideIdx + 1,
                  total: SLIDE_CONFIGS.length,
                })}
              </p>
              <h1 className="font-display text-xl sm:text-3xl font-bold leading-tight text-balance">
                {slideTitle}
              </h1>
              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed max-w-xl">
                {slideSubtitle}
              </p>
            </div>
          </div>

          {/* Slide indicators */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              {SLIDE_CONFIGS.map((s, idx) => (
                <button
                  key={s.titleKey}
                  type="button"
                  aria-label={t('onboarding.goToSlide', { num: idx + 1 })}
                  onClick={() => setSlideIdx(idx)}
                  className={`h-2.5 rounded-full transition-all cursor-pointer ${
                    idx === slideIdx
                      ? 'w-8 bg-[var(--brand-primary)]'
                      : 'w-2.5 bg-slate-300 dark:bg-neutral-700'
                  }`}
                />
              ))}
            </div>
            <p className="text-xs text-[var(--canvas-text-muted)] font-medium">
              {t('home.heroEyebrow')}
            </p>
          </div>
        </div>

        {/* Right Auth Form Column */}
        <div className="lg:col-span-6 min-w-0">
          <div className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border-subtle)] p-6 sm:p-8 shadow-sm space-y-5">
            {/* App Brand & Tagline Header */}
            <div className="space-y-1 pb-1">
              <span className="font-display text-xl sm:text-2xl font-extrabold tracking-tight text-[var(--brand-text)] block">
                {t('common.appName')}
              </span>
              <p
                className="font-bangla text-xs text-[var(--text-secondary)] leading-relaxed text-balance"
                style={{ fontFamily: 'var(--font-bn)' }}
              >
                {t('common.tagline')}
              </p>
            </div>

            {/* Mode Switch Pills (Login / Create Account) */}
            {activeMode !== 'forgot' && (
              <div className="flex bg-[var(--bg-subtle)] p-1 rounded-2xl border border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className={`flex-1 min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    activeMode === 'login'
                      ? 'bg-[var(--bg-surface)] text-[var(--brand-text)] shadow-xs'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <LogIn className="w-3.5 h-3.5" />
                  {t('auth.loginBtn')}
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className={`flex-1 min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    activeMode === 'signup'
                      ? 'bg-[var(--bg-surface)] text-[var(--brand-text)] shadow-xs'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  {t('auth.createAccountBtn')}
                </button>
              </div>
            )}

            {activeMode !== 'forgot' && (
              <div className="space-y-3">
                <button
                  type="button"
                  disabled={loading || googleLoading}
                  onClick={handleGoogleLogin}
                  className="w-full min-h-[46px] px-4 py-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] disabled:opacity-50 text-[var(--text-primary)] text-sm font-semibold inline-flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.3 0 6.08-1.09 8.1-2.96l-3.88-3.05c-1.09.73-2.48 1.16-4.22 1.16-3.24 0-5.98-2.19-6.96-5.14H1.05v3.14C3.05 21.13 7.21 24 12 24Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.04 14.01c-.25-.73-.39-1.51-.39-2.31s.14-1.58.39-2.31V6.25H1.05A11.98 11.98 0 0 0 0 11.7c0 1.93.46 3.76 1.05 5.45l3.99-3.14Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.65c1.8 0 3.41.62 4.68 1.83l3.51-3.51C18.07 1.09 15.3 0 12 0 7.21 0 3.05 2.87 1.05 7.05l3.99 3.14c.98-2.95 3.72-5.54 6.96-5.54Z"
                    />
                  </svg>
                  <span>
                    {googleLoading ? t('auth.googleBtnLoading') : t('auth.continueWithGoogle')}
                  </span>
                </button>

                {googleError && (
                  <p className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 px-3 py-2.5 rounded-xl flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{googleError}</span>
                  </p>
                )}

                <div className="relative flex items-center justify-center">
                  <div className="w-full border-t border-[var(--border-subtle)]" />
                  <span className="px-3 bg-[var(--bg-surface)] text-[11px] font-medium text-[var(--text-muted)] whitespace-nowrap relative">
                    {t('auth.orEmailDivider')}
                  </span>
                </div>
              </div>
            )}

            {successNotice && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successNotice}</span>
              </div>
            )}

            {/* LOGIN FORM */}
            {activeMode === 'login' && (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <h2 className="font-display text-2xl font-bold text-[var(--text-primary)]">
                    {t('auth.loginTitle')}
                  </h2>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {t('auth.loginSubtitle')}
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="login-identifier"
                    className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                  >
                    {t('auth.emailOrPhoneLabel')}
                  </label>
                  <input
                    id="login-identifier"
                    type="text"
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={t('auth.emailOrPhonePlaceholder')}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="login-password"
                      className="block text-xs font-semibold text-[var(--text-secondary)]"
                    >
                      {t('auth.passwordLabel')}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setResetSent(false);
                        setDevOtpHint(null);
                        switchMode('forgot');
                      }}
                      className="text-xs font-semibold text-[var(--brand-text)] hover:underline cursor-pointer"
                    >
                      {t('auth.forgotLink')}
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t('auth.passwordPlaceholder')}
                      className="w-full min-h-[44px] pl-3.5 pr-11 py-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <p className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 px-3 py-2.5 rounded-xl flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-50 text-[var(--brand-primary-fg)] font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <LogIn className="w-4 h-4" />
                  {loading ? t('auth.loggingIn') : t('auth.loginBtn')}
                </button>

                {/* TRY THE DEMO (REVIEWER PREVIEW) */}
                <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--brand-text)] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      {lang === 'bn' ? 'রিভিউয়ার ডেমো ট্রাই করুন' : 'Try the demo (Reviewer preview)'}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {lang === 'bn' ? '১-ক্লিক লগইন' : '1-click preview'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={loading || googleLoading}
                      onClick={() => handleDemoLogin('recip_1')}
                      className="px-3 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] hover:border-[var(--brand-primary)] text-left transition cursor-pointer group"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                          <UserIcon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[var(--text-primary)] truncate group-hover:text-[var(--brand-text)]">
                            {lang === 'bn' ? 'সাধারণ ব্যবহারকারী' : 'Demo Normal User'}
                          </p>
                          <p className="text-[10px] text-[var(--text-muted)] truncate">
                            Nadia Rahman · Dhanmondi
                          </p>
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled={loading || googleLoading}
                      onClick={() => handleDemoLogin('donor_1')}
                      className="px-3 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] hover:border-[var(--brand-primary)] text-left transition cursor-pointer group"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                          <Store className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[var(--text-primary)] truncate group-hover:text-[var(--brand-text)]">
                            {lang === 'bn' ? 'রেস্তোরাঁর মালিক' : 'Demo Restaurant Owner'}
                          </p>
                          <p className="text-[10px] text-[var(--text-muted)] truncate">
                            Saffron Kitchen · Arif
                          </p>
                        </div>
                      </div>
                    </button>
                  </div>
                  <p className="text-[10px] text-center text-[var(--text-muted)]">
                    {lang === 'bn'
                      ? 'ডেমো অ্যাকাউন্টে অ্যাডমিন এক্সেস বা অন্যদের ব্যক্তিগত তথ্যে প্রবেশাধিকার নেই।'
                      : 'Demo accounts have no admin privileges and cannot view private data.'}
                  </p>
                </div>

                <p className="text-center text-xs text-[var(--text-muted)]">
                  {t('auth.noAccountPrompt')}{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('signup')}
                    className="font-semibold text-[var(--brand-text)] hover:underline cursor-pointer"
                  >
                    {t('auth.createAccountLink')}
                  </button>
                </p>
              </form>
            )}

            {/* CREATE ACCOUNT FORM */}
            {activeMode === 'signup' && (
              <form onSubmit={handleSignupSubmit} className="space-y-4">
                <div>
                  <h2 className="font-display text-2xl font-bold text-[var(--text-primary)]">
                    {t('auth.signupTitle')}
                  </h2>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {t('auth.signupSubtitle')}
                  </p>
                </div>

                {/* Account Type Choice at the Top */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-[var(--text-secondary)]">
                    {t('auth.accountTypeHeading')}
                  </p>
                  <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setAccountType('user');
                        setError(null);
                        setGoogleError(null);
                      }}
                      className={`p-3.5 rounded-2xl border text-left transition-all flex items-start gap-3 cursor-pointer ${
                        accountType === 'user'
                          ? 'border-[var(--brand-primary)] bg-[var(--brand-soft)] ring-1 ring-[var(--brand-primary)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--border-strong)]'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-xl bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] flex items-center justify-center shrink-0">
                        <UserIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[var(--text-primary)] leading-snug">
                          {t('auth.accountTypes.normalUserTitle')}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)] leading-snug mt-0.5">
                          {t('auth.accountTypes.normalUserDesc')}
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAccountType('restaurantOwner');
                        setError(null);
                        setGoogleError(null);
                      }}
                      className={`p-3.5 rounded-2xl border text-left transition-all flex items-start gap-3 cursor-pointer ${
                        accountType === 'restaurantOwner'
                          ? 'border-[var(--brand-accent)] bg-[var(--brand-accent-soft)] ring-1 ring-[var(--brand-accent)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--border-strong)]'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-xl bg-[var(--brand-accent)] text-[var(--brand-accent-fg)] flex items-center justify-center shrink-0">
                        <Store className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[var(--text-primary)] leading-snug">
                          {t('auth.accountTypes.restaurantOwnerTitle')}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)] leading-snug mt-0.5">
                          {t('auth.accountTypes.restaurantOwnerDesc')}
                        </p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Basic Account Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="signup-name"
                      className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                    >
                      {accountType === 'restaurantOwner'
                        ? t('restaurant.ownerFullNameLabel')
                        : t('onboarding.fullNameLabel')}{' '}
                      *
                    </label>
                    <input
                      id="signup-name"
                      type="text"
                      value={accountType === 'restaurantOwner' ? ownerFullName || name : name}
                      onChange={(e) => {
                        setName(e.target.value);
                        if (accountType === 'restaurantOwner') {
                          setOwnerFullName(e.target.value);
                        }
                      }}
                      placeholder={t('onboarding.fullNamePlaceholder')}
                      className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="signup-area"
                      className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                    >
                      {t('onboarding.areaLabel')} *
                    </label>
                    <select
                      id="signup-area"
                      value={area}
                      onChange={(e) => handleAreaSelect(e.target.value)}
                      className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                    >
                      {AREAS.map((a) => (
                        <option key={a} value={a}>
                          {formatArea(a)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="signup-identifier"
                    className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                  >
                    {accountType === 'restaurantOwner'
                      ? t('restaurant.accountEmailLabel')
                      : t('auth.emailOrPhoneLabel')}{' '}
                    *
                  </label>
                  <input
                    id="signup-identifier"
                    type={accountType === 'restaurantOwner' ? 'email' : 'text'}
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={
                      accountType === 'restaurantOwner'
                        ? t('restaurant.accountEmailPlaceholder')
                        : t('auth.emailOrPhonePlaceholder')
                    }
                    className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="signup-password"
                      className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                    >
                      {t('auth.passwordLabel')} *
                    </label>
                    <div className="relative">
                      <input
                        id="signup-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={t('auth.passwordPlaceholder')}
                        className="w-full min-h-[42px] pl-3.5 pr-10 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[34px] min-w-[34px] flex items-center justify-center text-[var(--text-muted)] cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="signup-confirm"
                      className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                    >
                      {t('auth.confirmPasswordLabel')} *
                    </label>
                    <div className="relative">
                      <input
                        id="signup-confirm"
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder={t('auth.confirmPasswordPlaceholder')}
                        className="w-full min-h-[42px] pl-3.5 pr-10 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        aria-label={
                          showConfirmPassword ? t('auth.hidePassword') : t('auth.showPassword')
                        }
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[34px] min-w-[34px] flex items-center justify-center text-[var(--text-muted)] cursor-pointer"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {accountType === 'user' ? (
                  <div>
                    <label
                      htmlFor="signup-org"
                      className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                    >
                      {t('onboarding.orgLabel')}
                    </label>
                    <input
                      id="signup-org"
                      type="text"
                      value={organizationName}
                      onChange={(e) => setOrganizationName(e.target.value)}
                      placeholder={t('onboarding.orgPlaceholder')}
                      className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                    />
                  </div>
                ) : (
                  /* RESTAURANT INFORMATION SECTION */
                  <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-subtle)]/55 p-4 space-y-3.5 min-w-0">
                    <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-subtle)]">
                      <Building2 className="w-4 h-4 text-[var(--brand-text)] shrink-0" />
                      <div>
                        <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
                          {t('restaurant.sectionTitle')}
                        </h3>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          {t('restaurant.sectionSubtitle')}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="rest-name"
                          className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                        >
                          {t('restaurant.restaurantNameLabel')} *
                        </label>
                        <input
                          id="rest-name"
                          type="text"
                          value={restaurantName}
                          onChange={(e) => setRestaurantName(e.target.value)}
                          placeholder={t('restaurant.restaurantNamePlaceholder')}
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="rest-type"
                          className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                        >
                          {t('restaurant.typeLabel')} *
                        </label>
                        <select
                          id="rest-type"
                          value={restaurantType}
                          onChange={(e) => setRestaurantType(e.target.value as RestaurantType)}
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                        >
                          {RESTAURANT_TYPES.map((rt) => (
                            <option key={rt} value={rt}>
                              {t(`restaurant.types.${rt}`)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="rest-phone"
                          className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                        >
                          {t('restaurant.phoneLabel')} *
                        </label>
                        <input
                          id="rest-phone"
                          type="tel"
                          value={restaurantPhone}
                          onChange={(e) => setRestaurantPhone(e.target.value)}
                          placeholder={t('restaurant.phonePlaceholder')}
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="rest-email"
                          className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                        >
                          {t('restaurant.emailOptionalLabel')}
                        </label>
                        <input
                          id="rest-email"
                          type="email"
                          value={restaurantEmail}
                          onChange={(e) => setRestaurantEmail(e.target.value)}
                          placeholder={t('restaurant.emailOptionalPlaceholder')}
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label
                          htmlFor="rest-address"
                          className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                        >
                          {t('restaurant.fullAddressLabel')} *
                        </label>
                        <input
                          id="rest-address"
                          type="text"
                          value={restaurantAddress}
                          onChange={(e) => setRestaurantAddress(e.target.value)}
                          placeholder={t('restaurant.fullAddressPlaceholder')}
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="rest-city"
                          className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                        >
                          {t('restaurant.cityLabel')} *
                        </label>
                        <input
                          id="rest-city"
                          type="text"
                          value={restaurantCity}
                          onChange={(e) => setRestaurantCity(e.target.value)}
                          placeholder={t('restaurant.cityPlaceholder')}
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                        />
                      </div>
                    </div>

                    {/* Map Pin Picker */}
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-[var(--text-secondary)] inline-flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-[var(--brand-text)]" />
                        {t('restaurant.mapPinLabel')} *
                      </p>
                      <MapPinPicker
                        lat={pinCoords.lat}
                        lng={pinCoords.lng}
                        onChange={setPinCoords}
                        heightClass="h-44"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="rest-hours"
                          className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                        >
                          {t('restaurant.openingHoursLabel')} *
                        </label>
                        <input
                          id="rest-hours"
                          type="text"
                          value={openingHours}
                          onChange={(e) => setOpeningHours(e.target.value)}
                          placeholder={t('onboarding.hoursPlaceholder')}
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="rest-surplus"
                          className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                        >
                          {t('restaurant.dailySurplusLabel')}
                        </label>
                        <input
                          id="rest-surplus"
                          type="text"
                          value={approxDailySurplus}
                          onChange={(e) => setApproxDailySurplus(e.target.value)}
                          placeholder={t('restaurant.dailySurplusPlaceholder')}
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="rest-license"
                        className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                      >
                        {t('restaurant.tradeLicenseLabel')}
                      </label>
                      <input
                        id="rest-license"
                        type="text"
                        value={tradeLicenseNumber}
                        onChange={(e) => setTradeLicenseNumber(e.target.value)}
                        placeholder={t('restaurant.tradeLicensePlaceholder')}
                        className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                      />
                    </div>

                    {/* Photo Uploads: Restaurant Photo + Optional Trade License Photo */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-canvas)] space-y-2">
                        <p className="text-xs font-semibold text-[var(--text-secondary)]">
                          {t('restaurant.restaurantPhotoLabel')}
                        </p>
                        {restaurantPhotoUrl ? (
                          <div className="relative rounded-xl overflow-hidden border border-[var(--border-subtle)] h-24">
                            <img
                              src={restaurantPhotoUrl}
                              alt={restaurantName || 'Restaurant'}
                              className="w-full h-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => setRestaurantPhotoUrl(null)}
                              aria-label={t('common.delete')}
                              className="absolute top-1.5 right-1.5 min-h-[28px] min-w-[28px] rounded-lg bg-black/65 text-white flex items-center justify-center cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <label className="min-h-[42px] px-3 py-2 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--brand-soft)] text-xs font-semibold text-[var(--text-primary)] flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
                            <Camera className="w-4 h-4 text-[var(--brand-text)] shrink-0" />
                            <span>
                              {photoBusy === 'restaurant'
                                ? t('restaurant.processingPhoto')
                                : t('restaurant.uploadPhotoBtn')}
                            </span>
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

                      <div className="p-3 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-canvas)] space-y-2">
                        <p className="text-xs font-semibold text-[var(--text-secondary)]">
                          {t('restaurant.licensePhotoLabel')}
                        </p>
                        {licensePhotoUrl ? (
                          <div className="relative rounded-xl overflow-hidden border border-[var(--border-subtle)] h-24">
                            <img
                              src={licensePhotoUrl}
                              alt="Trade license"
                              className="w-full h-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => setLicensePhotoUrl(null)}
                              aria-label={t('common.delete')}
                              className="absolute top-1.5 right-1.5 min-h-[28px] min-w-[28px] rounded-lg bg-black/65 text-white flex items-center justify-center cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <label className="min-h-[42px] px-3 py-2 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--brand-soft)] text-xs font-semibold text-[var(--text-primary)] flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
                            <FileCheck2 className="w-4 h-4 text-[var(--brand-text)] shrink-0" />
                            <span>
                              {photoBusy === 'license'
                                ? t('restaurant.processingPhoto')
                                : t('restaurant.uploadLicenseBtn')}
                            </span>
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

                    <label className="flex items-start gap-2.5 text-xs font-medium text-[var(--text-primary)] cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={acceptedSafetyTerms}
                        onChange={(e) => setAcceptedSafetyTerms(e.target.checked)}
                        className="mt-0.5 w-4 h-4 accent-[var(--brand-primary)] rounded cursor-pointer shrink-0"
                      />
                      <span>{t('restaurant.safetyTermsCheckbox')} *</span>
                    </label>
                  </div>
                )}

                {/* Terms & Privacy Checkboxes */}
                <div className="space-y-2 pt-1">
                  <label className="flex items-start gap-2.5 text-xs text-[var(--text-secondary)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agreedTerms}
                      onChange={(e) => setAgreedTerms(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-[var(--brand-primary)] rounded cursor-pointer shrink-0"
                    />
                    <span>{t('auth.termsLabel')}</span>
                  </label>
                  <label className="flex items-start gap-2.5 text-xs text-[var(--text-secondary)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agreedPrivacy}
                      onChange={(e) => setAgreedPrivacy(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-[var(--brand-primary)] rounded cursor-pointer shrink-0"
                    />
                    <span>{t('auth.privacyLabel')}</span>
                  </label>
                </div>

                {error && (
                  <p className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 px-3 py-2.5 rounded-xl flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-50 text-[var(--brand-primary-fg)] font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  {loading ? t('auth.creatingAccount') : t('auth.createAccountBtn')}
                </button>

                <p className="text-center text-xs text-[var(--text-muted)]">
                  {t('auth.alreadyAccountPrompt')}{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="font-semibold text-[var(--brand-text)] hover:underline cursor-pointer"
                  >
                    {t('auth.loginLink')}
                  </button>
                </p>
              </form>
            )}

            {/* FORGOT PASSWORD FLOW */}
            {activeMode === 'forgot' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-[var(--brand-soft)] text-[var(--brand-text)] flex items-center justify-center">
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
                        {t('auth.forgotTitle')}
                      </h2>
                      <p className="text-xs text-[var(--text-muted)]">{t('auth.forgotSubtitle')}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="text-xs font-semibold text-[var(--brand-text)] hover:underline shrink-0 cursor-pointer"
                  >
                    {t('common.back')}
                  </button>
                </div>

                {!resetSent ? (
                  <form onSubmit={handleSendResetCode} className="space-y-4">
                    <div>
                      <label
                        htmlFor="forgot-identifier"
                        className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                      >
                        {t('auth.emailOrPhoneLabel')}
                      </label>
                      <input
                        id="forgot-identifier"
                        type="text"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder={t('auth.emailOrPhonePlaceholder')}
                        className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                      />
                    </div>

                    {error && (
                      <p className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 px-3 py-2.5 rounded-xl">
                        {error}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-50 text-[var(--brand-primary-fg)] font-semibold text-sm cursor-pointer"
                    >
                      {loading ? t('auth.sendingCode') : t('auth.sendResetCode')}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleResetPasswordSubmit} className="space-y-3.5">
                    <div className="p-3 rounded-xl bg-[var(--brand-soft)] border border-[var(--border-subtle)] text-xs text-[var(--brand-text)] flex items-center justify-between gap-2 flex-wrap">
                      <span>{t('onboarding.codeSentTo', { identifier })}</span>
                      {devOtpHint && (
                        <span className="font-mono font-bold tabular-nums">
                          {t('onboarding.demoOtpHint', { code: formatNumber(devOtpHint) })}
                        </span>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="reset-code"
                        className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                      >
                        {t('auth.verificationCodeLabel')}
                      </label>
                      <input
                        id="reset-code"
                        type="text"
                        value={resetCode}
                        onChange={(e) => setResetCode(e.target.value)}
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-center text-lg font-mono font-bold tracking-[0.25em] tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="reset-new-pw"
                          className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                        >
                          {t('auth.newPasswordLabel')}
                        </label>
                        <div className="relative">
                          <input
                            id="reset-new-pw"
                            type={showNewPassword ? 'text' : 'password'}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder={t('auth.passwordPlaceholder')}
                            className="w-full min-h-[42px] pl-3.5 pr-10 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword((v) => !v)}
                            aria-label={
                              showNewPassword ? t('auth.hidePassword') : t('auth.showPassword')
                            }
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[34px] min-w-[34px] flex items-center justify-center text-[var(--text-muted)] cursor-pointer"
                          >
                            {showNewPassword ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label
                          htmlFor="reset-confirm-pw"
                          className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                        >
                          {t('auth.confirmPasswordLabel')}
                        </label>
                        <input
                          id="reset-confirm-pw"
                          type={showNewPassword ? 'text' : 'password'}
                          value={confirmNewPassword}
                          onChange={(e) => setConfirmNewPassword(e.target.value)}
                          placeholder={t('auth.confirmPasswordPlaceholder')}
                          className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                        />
                      </div>
                    </div>

                    {error && (
                      <p className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 px-3 py-2 rounded-xl">
                        {error}
                      </p>
                    )}

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setResetSent(false)}
                        className="min-h-[44px] px-4 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                      >
                        {t('onboarding.changeBtn')}
                      </button>
                      <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 min-h-[44px] px-4 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-50 text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        {loading ? t('auth.resettingPassword') : t('auth.resetPasswordBtn')}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* Quick Demo Login Helper (compact, never obscures login/signup) */}
            {demoAccounts.length > 0 && activeMode === 'login' && (
              <div className="pt-4 border-t border-[var(--border-subtle)] space-y-2.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-muted)]">
                  <Sparkles className="w-3.5 h-3.5 text-[var(--brand-accent-text)] shrink-0" />
                  <span>{t('auth.demoDivider')}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {demoAccounts.map((acc) => {
                    const roleLabel =
                      acc.role === 'donor' || acc.role === 'recipient' || acc.role === 'admin'
                        ? t(`settings.roles.${acc.role}`)
                        : acc.role;
                    const areaLabel = formatArea(acc.area);
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        disabled={loading}
                        onClick={() => handleDemoLogin(acc.id)}
                        className="min-h-[42px] px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:bg-[var(--brand-soft)] hover:border-[var(--brand-primary)] text-left transition-colors cursor-pointer"
                      >
                        <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          {acc.business_name || acc.organization_name || acc.name}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)] truncate">
                          {roleLabel} · {areaLabel}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
