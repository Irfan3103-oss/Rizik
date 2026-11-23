import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Lock } from 'lucide-react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import type {
  AccountType,
  AuthSession,
  DonationCause,
  DonationFrequency,
  PaymentMethodId,
  RestaurantInfo,
  User,
} from '../types';
import { api, getStoredToken, setStoredToken } from '../lib/api';
import { auth, googleProvider, isFirestoreOfflineError, reconnectFirestore } from '../firebase';
import {
  buildAppUserFromFirestore,
  checkIsFirebaseAdmin,
  subscribeMyFirebaseUser,
  syncFirebaseUserProfile,
  type FirebaseProfilePatch,
} from '../lib/firestoreService';
import { markPresenceOffline } from '../lib/presenceService';
import { useI18n } from '../i18n/I18nContext';

export interface DonateDraft {
  amountBdt: number;
  customInput: string;
  frequency: DonationFrequency;
  cause: DonationCause;
  eventId: string;
  honorOf: string;
  isAnonymous: boolean;
  paymentMethod: PaymentMethodId;
}

export interface WeddingDraft {
  eventType: string;
  venueName: string;
  address: string;
  pinLat: number;
  pinLng: number;
  contactPerson: string;
  phone: string;
  eventDate: string;
  readyTime: string;
  approxServings: number;
  foodTypes: string[];
  isHalal: boolean;
  isVeg: boolean;
  storageMethod: string;
  photoUrl: string;
  specialNotes: string;
  isUrgent: boolean;
  checkUntouched: boolean;
  checkCovered: boolean;
  checkFresh: boolean;
}

export interface FirebaseEmailSignupPayload {
  name: string;
  email: string;
  password: string;
  accountType?: AccountType;
  role: 'user' | 'restaurantOwner' | 'recipient' | 'donor';
  area: string;
  phone?: string;
  organizationName?: string;
  businessName?: string;
  address?: string;
  hours?: string;
  restaurant?: RestaurantInfo;
}

export type PendingAuthAction =
  | {
      type: 'chat';
      listingId?: string;
      donorId?: string;
      shopName?: string;
      pickupId?: string;
    }
  | { type: 'inbox' }
  | { type: 'claim'; listingId: string; quantity?: number; notes?: string }
  | { type: 'claims' }
  | { type: 'donate'; draft?: DonateDraft }
  | { type: 'volunteer'; eventId: string }
  | { type: 'reminder'; eventId: string }
  | { type: 'wedding_submit'; draft?: WeddingDraft }
  | { type: 'wedding_tracker' }
  | { type: 'partner' }
  | { type: 'post_food' }
  | { type: 'donor_hub' }
  | { type: 'report'; listingId: string }
  | { type: 'account' }
  | { type: 'shift'; shiftId?: string }
  | { type: 'review'; claimId?: string };

export interface LoginPromptState {
  open: boolean;
  action: PendingAuthAction | null;
}

interface AuthContextValue {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  firebaseAuthReady: boolean;
  isFirebaseSession: boolean;
  isFirebaseVerified: boolean;
  isAdmin: boolean;
  isLoggedIn: boolean;
  authBooting: boolean;
  pendingAction: PendingAuthAction | null;
  loginPrompt: LoginPromptState;
  sessionExpiredNotice: string | null;
  login: (session: AuthSession) => void;
  signInWithGoogle: (initialProfile?: FirebaseProfilePatch) => Promise<AuthSession>;
  signInWithEmail: (email: string, password: string) => Promise<AuthSession>;
  signUpWithEmail: (payload: FirebaseEmailSignupPayload) => Promise<AuthSession>;
  refreshFirebaseVerification: () => Promise<boolean>;
  resendFirebaseVerification: () => Promise<void>;
  logout: () => void;
  updateUser: (nextUser: User) => void;
  setPendingAction: (action: PendingAuthAction | null) => void;
  clearPendingAction: () => void;
  requireLogin: (action: PendingAuthAction, onAllowed?: () => void) => boolean;
  closeLoginPrompt: () => void;
  clearSessionExpiredNotice: () => void;
}

const PENDING_PROFILE_PREFIX = 'ahar_fb_pending_profile_';

function savePendingProfile(uid: string, patch: FirebaseProfilePatch) {
  try {
    localStorage.setItem(`${PENDING_PROFILE_PREFIX}${uid}`, JSON.stringify(patch));
  } catch {
    // Ignore storage quota errors
  }
}

function readPendingProfile(uid: string): FirebaseProfilePatch | undefined {
  try {
    const raw =
      localStorage.getItem(`${PENDING_PROFILE_PREFIX}${uid}`) ||
      sessionStorage.getItem(`${PENDING_PROFILE_PREFIX}${uid}`);
    if (!raw) return undefined;
    return JSON.parse(raw) as FirebaseProfilePatch;
  } catch {
    return undefined;
  }
}

function clearPendingProfile(uid: string) {
  try {
    localStorage.removeItem(`${PENDING_PROFILE_PREFIX}${uid}`);
    sessionStorage.removeItem(`${PENDING_PROFILE_PREFIX}${uid}`);
  } catch {
    // Ignore
  }
}

function buildUnverifiedAppUser(
  fbUser: FirebaseUser,
  lang: 'en' | 'bn',
  pending?: FirebaseProfilePatch
): User {
  return buildAppUserFromFirestore(
    fbUser,
    {
      uid: fbUser.uid,
      name: pending?.displayName || fbUser.displayName || undefined,
      displayName: pending?.displayName || fbUser.displayName || undefined,
      email: fbUser.email || '',
      role: pending?.role || (pending?.accountType === 'restaurantOwner' ? 'restaurantOwner' : 'user'),
      area: pending?.restaurant?.area || pending?.area || 'Dhanmondi',
      organizationName: pending?.organizationName,
      businessName: pending?.restaurant?.restaurantName || pending?.businessName,
      hours: pending?.restaurant?.openingHours || pending?.hours,
      verified: false,
      language: lang,
      savedRadiusKm: 10,
      restaurant: pending?.restaurant,
    },
    {
      uid: fbUser.uid,
      email: fbUser.email || '',
      phone: pending?.restaurant?.phone || pending?.phone,
      address: pending?.restaurant?.address || pending?.address,
    },
    false
  );
}

async function ensureFreshIdToken(fbUser: FirebaseUser): Promise<boolean> {
  if (!fbUser.emailVerified) {
    try {
      await fbUser.reload();
    } catch {
      // Ignore offline/transient reload errors
    }
  }
  if (!fbUser.emailVerified) {
    return false;
  }
  try {
    const tokenResult = await fbUser.getIdTokenResult();
    if (tokenResult.claims?.email_verified !== true) {
      await fbUser.getIdToken(true);
    }
  } catch {
    await fbUser.getIdToken(true).catch(() => {});
  }
  return true;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { lang, t } = useI18n();
  const langRef = useRef(lang);
  langRef.current = lang;

  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [firebaseAuthReady, setFirebaseAuthReady] = useState(false);
  const [expressBootDone, setExpressBootDone] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAuthAction | null>(null);
  const [loginPrompt, setLoginPrompt] = useState<LoginPromptState>({
    open: false,
    action: null,
  });
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState<string | null>(null);

  // Restore Express session silently on mount if token is present
  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setExpressBootDone(true);
      return;
    }
    api
      .getMe()
      .then((res) => {
        setUser(res.user);
      })
      .catch(() => {
        setStoredToken(null);
        if (!auth.currentUser) {
          setUser(null);
        }
      })
      .finally(() => {
        setExpressBootDone(true);
      });
  }, []);

  // Observe Firebase Authentication state & attach live /users/{uid} subscription only when signed in & verified
  useEffect(() => {
    let profileUnsub: (() => void) | null = null;
    let active = true;

    const authUnsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!active) return;

      if (profileUnsub) {
        profileUnsub();
        profileUnsub = null;
      }

      if (fbUser && !getStoredToken()) {
        const pending = readPendingProfile(fbUser.uid);
        const verifiedReady = await ensureFreshIdToken(fbUser);
        if (!active) return;
        setFirebaseUser(fbUser);

        if (verifiedReady) {
          let adminFlag = false;
          try {
            adminFlag = await checkIsFirebaseAdmin(fbUser);
            const syncedUser = await syncFirebaseUserProfile(
              fbUser,
              langRef.current,
              pending,
              adminFlag
            );
            clearPendingProfile(fbUser.uid);
            if (!active) return;
            setUser(syncedUser);
          } catch (err) {
            console.error('Failed to sync Firebase user profile:', err);
            if (isFirestoreOfflineError(err) && active) {
              void reconnectFirestore();
              setUser(
                buildAppUserFromFirestore(
                  fbUser,
                  {
                    uid: fbUser.uid,
                    name: pending?.displayName || fbUser.displayName || undefined,
                    displayName: pending?.displayName || fbUser.displayName || undefined,
                    email: fbUser.email || '',
                    role:
                      pending?.role ||
                      (pending?.accountType === 'restaurantOwner' ? 'restaurantOwner' : 'user'),
                    area: pending?.restaurant?.area || pending?.area || 'Dhanmondi',
                    verified: fbUser.emailVerified,
                    discoverable: true,
                    language: langRef.current,
                    savedRadiusKm: 10,
                    restaurant: pending?.restaurant,
                  },
                  {
                    uid: fbUser.uid,
                    email: fbUser.email || '',
                    phone: pending?.restaurant?.phone || pending?.phone,
                    address: pending?.restaurant?.address || pending?.address,
                  },
                  adminFlag
                )
              );
            }
          }
          if (active) {
            profileUnsub = subscribeMyFirebaseUser(
              fbUser,
              (liveUser) => {
                if (active && !getStoredToken()) {
                  setUser(liveUser);
                }
              },
              adminFlag
            );
          }
        } else {
          setUser(buildUnverifiedAppUser(fbUser, langRef.current, pending));
        }
      } else {
        setFirebaseUser(fbUser);
      }

      if (active) {
        setFirebaseAuthReady(true);
      }
    });

    return () => {
      active = false;
      authUnsub();
      if (profileUnsub) {
        profileUnsub();
      }
    };
  }, []);

  // Listen for mid-session 401 expiry events (only for Express token sessions)
  useEffect(() => {
    const onUnauthorized = () => {
      setStoredToken(null);
      if (!auth.currentUser) {
        setUser(null);
        setSessionExpiredNotice(t('gate.sessionExpired'));
      }
    };
    window.addEventListener('rizik:unauthorized', onUnauthorized);
    window.addEventListener('aharforall:unauthorized', onUnauthorized);
    return () => {
      window.removeEventListener('rizik:unauthorized', onUnauthorized);
      window.removeEventListener('aharforall:unauthorized', onUnauthorized);
    };
  }, [t]);

  const login = useCallback((session: AuthSession) => {
    if (session.token === '__firebase__') {
      setStoredToken(null);
    } else {
      setStoredToken(session.token);
      if (auth.currentUser) {
        void signOut(auth).catch(() => {});
      }
    }
    setUser(session.user);
    setSessionExpiredNotice(null);
    setLoginPrompt({ open: false, action: null });
  }, []);

  const signInWithGoogle = useCallback(
    async (initialProfile?: FirebaseProfilePatch): Promise<AuthSession> => {
      const cred = await signInWithPopup(auth, googleProvider);
      if (!cred.user.emailVerified) {
        await signOut(auth).catch(() => {});
        throw new Error(t('auth.googleEmailUnverified'));
      }
      setStoredToken(null);
      const pending = initialProfile || readPendingProfile(cred.user.uid);
      const adminFlag = await checkIsFirebaseAdmin(cred.user);
      const syncedUser = await syncFirebaseUserProfile(
        cred.user,
        langRef.current,
        pending,
        adminFlag
      );
      clearPendingProfile(cred.user.uid);
      setFirebaseUser(cred.user);
      setUser(syncedUser);
      setSessionExpiredNotice(null);
      setLoginPrompt({ open: false, action: null });
      return { token: '__firebase__', user: syncedUser };
    },
    [t]
  );

  const signInWithEmail = useCallback(
    async (email: string, password: string): Promise<AuthSession> => {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      setStoredToken(null);
      const pending = readPendingProfile(cred.user.uid);
      const verifiedReady = await ensureFreshIdToken(cred.user);
      let appUser: User;
      if (verifiedReady) {
        const adminFlag = await checkIsFirebaseAdmin(cred.user, true);
        appUser = await syncFirebaseUserProfile(cred.user, langRef.current, pending, adminFlag);
        clearPendingProfile(cred.user.uid);
      } else {
        appUser = buildUnverifiedAppUser(cred.user, langRef.current, pending);
      }
      setFirebaseUser(cred.user);
      setUser(appUser);
      setSessionExpiredNotice(null);
      setLoginPrompt({ open: false, action: null });
      return { token: '__firebase__', user: appUser };
    },
    []
  );

  const signUpWithEmail = useCallback(
    async (payload: FirebaseEmailSignupPayload): Promise<AuthSession> => {
      const cred = await createUserWithEmailAndPassword(
        auth,
        payload.email,
        payload.password
      );
      await updateProfile(cred.user, { displayName: payload.name }).catch(() => {});
      await sendEmailVerification(cred.user).catch(() => {});

      const profilePatch: FirebaseProfilePatch = {
        displayName: payload.name,
        accountType: payload.accountType ?? (payload.role === 'restaurantOwner' ? 'restaurantOwner' : 'user'),
        role: payload.role,
        area: payload.restaurant?.area || payload.area,
        phone: payload.restaurant?.phone || payload.phone,
        organizationName: payload.organizationName,
        businessName: payload.restaurant?.restaurantName || payload.businessName,
        address: payload.restaurant?.address || payload.address,
        hours: payload.restaurant?.openingHours || payload.hours,
        language: langRef.current,
        restaurant: payload.restaurant,
      };
      savePendingProfile(cred.user.uid, profilePatch);
      setStoredToken(null);
      setFirebaseUser(cred.user);
      const appUser = buildUnverifiedAppUser(cred.user, langRef.current, profilePatch);
      setUser(appUser);
      setSessionExpiredNotice(null);
      setLoginPrompt({ open: false, action: null });
      return { token: '__firebase__', user: appUser };
    },
    []
  );

  const refreshFirebaseVerification = useCallback(async (): Promise<boolean> => {
    const current = auth.currentUser;
    if (!current) return false;
    await current.reload();
    const refreshed = auth.currentUser;
    if (!refreshed) return false;
    if (refreshed.emailVerified) {
      await refreshed.getIdToken(true);
      const pending = readPendingProfile(refreshed.uid);
      const adminFlag = await checkIsFirebaseAdmin(refreshed, true);
      const synced = await syncFirebaseUserProfile(refreshed, langRef.current, pending, adminFlag);
      clearPendingProfile(refreshed.uid);
      setFirebaseUser(refreshed);
      setUser(synced);
      return true;
    }
    setFirebaseUser(refreshed);
    return false;
  }, []);

  const resendFirebaseVerification = useCallback(async (): Promise<void> => {
    const current = auth.currentUser;
    if (!current || current.emailVerified) return;
    await sendEmailVerification(current);
  }, []);

  const logout = useCallback(() => {
    const uidToMarkOffline = auth.currentUser?.uid;
    if (uidToMarkOffline) {
      void markPresenceOffline(uidToMarkOffline);
    }
    api.logout().catch(() => {});
    if (auth.currentUser) {
      void signOut(auth).catch(() => {});
    }
    setStoredToken(null);
    setFirebaseUser(null);
    setUser(null);
    setPendingAction(null);
    setSessionExpiredNotice(null);
    setLoginPrompt({ open: false, action: null });
  }, []);

  const updateUser = useCallback((nextUser: User) => {
    setUser(nextUser);
  }, []);

  const clearPendingAction = useCallback(() => {
    setPendingAction(null);
  }, []);

  const requireLogin = useCallback(
    (action: PendingAuthAction, onAllowed?: () => void): boolean => {
      if (user) {
        onAllowed?.();
        return true;
      }
      setPendingAction(action);
      setLoginPrompt({ open: true, action });
      return false;
    },
    [user]
  );

  const closeLoginPrompt = useCallback(() => {
    setLoginPrompt({ open: false, action: null });
  }, []);

  const clearSessionExpiredNotice = useCallback(() => {
    setSessionExpiredNotice(null);
  }, []);

  const authBooting = !(expressBootDone && firebaseAuthReady);
  const isFirebaseSession = Boolean(firebaseUser && !getStoredToken());
  const isFirebaseVerified = Boolean(isFirebaseSession && firebaseUser?.emailVerified);
  const isAdmin = Boolean(user?.isAdmin && isFirebaseVerified);

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        firebaseAuthReady,
        isFirebaseSession,
        isFirebaseVerified,
        isAdmin,
        isLoggedIn: Boolean(user),
        authBooting,
        pendingAction,
        loginPrompt,
        sessionExpiredNotice,
        login,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        refreshFirebaseVerification,
        resendFirebaseVerification,
        logout,
        updateUser,
        setPendingAction,
        clearPendingAction,
        requireLogin,
        closeLoginPrompt,
        clearSessionExpiredNotice,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}

interface RequireAuthProps {
  action?: PendingAuthAction;
  onLoginClick: () => void;
  onSignupClick: () => void;
  onContinueBrowsing: () => void;
  children: ReactNode;
}

export function RequireAuth({
  action,
  onLoginClick,
  onSignupClick,
  onContinueBrowsing,
  children,
}: RequireAuthProps) {
  const { isLoggedIn } = useAuth();
  const { t } = useI18n();

  if (isLoggedIn) {
    return <>{children}</>;
  }

  const getMessage = () => {
    switch (action?.type) {
      case 'inbox':
      case 'chat':
        return t('gate.actions.inbox');
      case 'claims':
      case 'claim':
        return t('gate.actions.claims');
      case 'donor_hub':
        return t('gate.actions.donorHub');
      case 'donate':
        return t('gate.actions.donateDefault');
      default:
        return t('gate.actions.account');
    }
  };

  return (
    <div className="max-w-lg mx-auto my-8 bg-[var(--bg-surface)] rounded-3xl border border-[var(--border-subtle)] p-6 sm:p-8 text-center space-y-5 shadow-sm">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-[var(--brand-soft)] text-[var(--brand-text)] flex items-center justify-center">
        <Lock className="w-7 h-7" aria-hidden="true" />
      </div>
      <div className="space-y-2">
        <h2 className="font-display text-xl font-extrabold text-[var(--text-primary)]">
          {t('gate.lockedTitle')}
        </h2>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{getMessage()}</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
        <button
          type="button"
          onClick={onLoginClick}
          className="flex-1 min-h-[46px] px-5 py-2.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-sm font-semibold cursor-pointer transition-colors"
        >
          {t('gate.loginBtn')}
        </button>
        <button
          type="button"
          onClick={onSignupClick}
          className="flex-1 min-h-[46px] px-5 py-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] hover:bg-[var(--brand-soft)] text-[var(--text-primary)] text-sm font-semibold cursor-pointer transition-colors"
        >
          {t('gate.signupBtn')}
        </button>
      </div>
      <button
        type="button"
        onClick={onContinueBrowsing}
        className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer transition-colors"
      >
        {t('gate.continueBrowsing')}
      </button>
    </div>
  );
}
