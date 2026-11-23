import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  BadgeCheck,
  Bell,
  Calendar,
  CheckCheck,
  ChevronDown,
  ClipboardList,
  Clock,
  Compass,
  Flame,
  Handshake,
  HeartHandshake,
  Home,
  LayoutGrid,
  Leaf,
  Lock,
  LogIn,
  LogOut,
  MapPin,
  MessageCircle,
  MoonStar,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  Trash2,
  TrendingUp,
  Truck,
  UserPlus,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import type {
  AdminConversation,
  AdminNotificationItem,
  AuthSession,
  ChatMessage,
  Claim,
  Conversation,
  DonationCause,
  HomeSummary,
  Language,
  Listing,
  NotificationItem,
  PlatformUserSummary,
  RestaurantOwnerApplication,
  UserDirectoryEntry,
} from './types';
import {
  api,
  cacheFeed,
  getAuthToken,
  getCachedFeed,
} from './lib/api';
import {
  subscribeActiveFirestoreListings,
  subscribeMyDonorListings,
  subscribeMyFirestoreClaims,
  updateFirebaseUserProfile,
  updateFirestoreClaimStatus,
} from './lib/firestoreService';
import {
  ensureAdminConversationForOwner,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  subscribeAdminNotifications,
  subscribeAllAdminConversations,
  subscribeAllFirebaseUsers,
  subscribeMyAdminConversation,
  subscribeRestaurantApplications,
} from './lib/adminChatService';
import {
  blockUserInFirestore,
  deleteConversationForMe,
  deleteMessageForMe,
  forwardMessengerMessage,
  getOrCreateDirectConversation,
  markConversationDeliveredAndRead,
  markConversationUnreadAsDelivered,
  openDirectChatForListingOrShop,
  readOfflineMessageQueue,
  reportUserInFirestore,
  seedStarterDemoConversationsOnce,
  sendMessengerMessage,
  setMessengerTyping,
  subscribeConversationMessages,
  subscribeDiscoverableDirectory,
  subscribeMyBlockedUsers,
  subscribeMyFirestoreConversations,
  syncUserDirectoryProfile,
  toggleConversationArchive,
  toggleConversationMute,
  toggleMessengerReaction,
  unblockUserInFirestore,
  uploadChatMediaFile,
  writeOfflineMessageQueue,
  type QueuedMessengerMessage,
} from './lib/messengerService';
import { markPresenceOffline, startPresenceTracking } from './lib/presenceService';
import {
  deleteUserNotification,
  markAllUserNotificationsRead,
  markUserNotificationRead,
  seedStarterNotificationsOnce,
  subscribeUserNotifications,
} from './lib/notificationService';
import { compressImageFileToDataUrl } from './lib/imageCompress';
import { auth } from './firebase';
import { useI18n } from './i18n/I18nContext';
import {
  RequireAuth,
  useAuth,
  type DonateDraft,
  type PendingAuthAction,
  type WeddingDraft,
} from './auth/AuthContext';
import { OnboardingAuth, type AuthMode } from './components/OnboardingAuth';
import { LoginPromptModal } from './components/LoginPromptModal';
import { HomeView } from './components/HomeView';
import { ListingCard } from './components/ListingCard';
import { FoodImage } from './components/FoodImage';
import { StaticOsmMap } from './components/LocationMessageCard';
import { FilterSheet, type FeedFilters } from './components/FilterSheet';
import { ListingDetailModal } from './components/ListingDetailModal';
import { PickupCodeModal } from './components/PickupCodeModal';
import { ChatView, type FirestoreSendPayload } from './components/ChatView';
import { ClaimsView } from './components/ClaimsView';
import { DonorDashboard } from './components/DonorDashboard';
import { ListingFormModal } from './components/ListingFormModal';
import { ProfileSettingsView } from './components/ProfileSettingsView';
import { ClientsView } from './components/ClientsView';
import { EventsView } from './components/EventsView';
import { WeddingPickupView } from './components/WeddingPickupView';
import { DonateMoneyView } from './components/DonateMoneyView';
import { ImpactDashboardView } from './components/ImpactDashboardView';
import { VolunteerHubView } from './components/VolunteerHubView';
import { CommunityLeaderboardView } from './components/CommunityLeaderboardView';
import { ThemePaletteButton } from './components/ThemePalettePopover';
import { LanguageToggle } from './components/LanguageToggle';
import { ShopAvatar } from './components/ShopAvatar';
import { AdminApplicationsView } from './components/AdminApplicationsView';
import { PWAInstallButton } from './components/PWAInstallButton';

type TabId =
  | 'home'
  | 'discover'
  | 'events'
  | 'claims'
  | 'donor'
  | 'chat'
  | 'admin'
  | 'clients'
  | 'wedding'
  | 'donate'
  | 'impact'
  | 'volunteers'
  | 'leaderboard'
  | 'settings'
  | 'auth';

const PROTECTED_TABS = new Set<TabId>(['chat', 'claims', 'donor', 'admin']);

interface ParsedRoute {
  tab: TabId;
  convId: string | null;
  eventId: string | null;
  adminOwnerUid?: string | null;
  authMode: AuthMode;
  returnTo: string | null;
  donateCause?: DonationCause;
  donateEventId?: string | null;
}

function parseRoute(pathname: string, search = ''): ParsedRoute {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(search);
  const rawReturnTo = params.get('returnTo');
  const safeReturnTo =
    rawReturnTo && rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//')
      ? rawReturnTo
      : null;

  if (clean === '/' || clean === '/home') {
    return { tab: 'home', convId: null, eventId: null, authMode: 'login', returnTo: null };
  }
  if (clean === '/discover') {
    return { tab: 'discover', convId: null, eventId: null, authMode: 'login', returnTo: null };
  }
  if (clean === '/clients') {
    return { tab: 'clients', convId: null, eventId: null, authMode: 'login', returnTo: null };
  }
  if (clean === '/events') {
    return { tab: 'events', convId: null, eventId: null, authMode: 'login', returnTo: null };
  }
  if (clean.startsWith('/events/')) {
    const rawId = clean.slice('/events/'.length).trim();
    return {
      tab: 'events',
      convId: null,
      eventId: rawId ? decodeURIComponent(rawId) : null,
      authMode: 'login',
      returnTo: null,
    };
  }
  if (clean === '/wedding-pickup') {
    return { tab: 'wedding', convId: null, eventId: null, authMode: 'login', returnTo: null };
  }
  if (clean === '/donate') {
    const rawCause = params.get('cause');
    const cause: DonationCause =
      rawCause === 'events' ||
      rawCause === 'wedding_pickup' ||
      rawCause === 'platform' ||
      rawCause === 'iftar_packs' ||
      rawCause === 'sadaqah' ||
      rawCause === 'zakat'
        ? rawCause
        : 'general';
    return {
      tab: 'donate',
      convId: null,
      eventId: null,
      authMode: 'login',
      returnTo: null,
      donateCause: cause,
      donateEventId: params.get('eventId'),
    };
  }
  if (clean === '/impact') {
    return { tab: 'impact', convId: null, eventId: null, authMode: 'login', returnTo: null };
  }
  if (clean === '/volunteers') {
    return { tab: 'volunteers', convId: null, eventId: null, authMode: 'login', returnTo: null };
  }
  if (clean === '/leaderboard') {
    return { tab: 'leaderboard', convId: null, eventId: null, authMode: 'login', returnTo: null };
  }
  if (clean === '/claims') {
    return { tab: 'claims', convId: null, eventId: null, authMode: 'login', returnTo: null };
  }
  if (clean === '/donor') {
    return { tab: 'donor', convId: null, eventId: null, authMode: 'login', returnTo: null };
  }
  if (clean === '/settings') {
    return { tab: 'settings', convId: null, eventId: null, authMode: 'login', returnTo: null };
  }
  if (clean === '/chat' || clean === '/inbox') {
    return { tab: 'chat', convId: null, eventId: null, authMode: 'login', returnTo: null };
  }
  if (clean.startsWith('/inbox/')) {
    const rawId = clean.slice('/inbox/'.length).trim();
    return {
      tab: 'chat',
      convId: rawId ? decodeURIComponent(rawId) : null,
      eventId: null,
      authMode: 'login',
      returnTo: null,
    };
  }
  if (clean === '/admin') {
    return {
      tab: 'admin',
      convId: null,
      eventId: null,
      adminOwnerUid: null,
      authMode: 'login',
      returnTo: null,
    };
  }
  if (clean.startsWith('/admin/')) {
    const rawUid = clean.slice('/admin/'.length).trim();
    return {
      tab: 'admin',
      convId: null,
      eventId: null,
      adminOwnerUid: rawUid ? decodeURIComponent(rawUid) : null,
      authMode: 'login',
      returnTo: null,
    };
  }
  if (clean === '/login' || clean === '/auth') {
    return { tab: 'auth', convId: null, eventId: null, authMode: 'login', returnTo: safeReturnTo };
  }
  if (clean === '/signup') {
    return { tab: 'auth', convId: null, eventId: null, authMode: 'signup', returnTo: safeReturnTo };
  }
  if (clean === '/forgot-password') {
    return { tab: 'auth', convId: null, eventId: null, authMode: 'forgot', returnTo: safeReturnTo };
  }
  return { tab: 'home', convId: null, eventId: null, authMode: 'login', returnTo: null };
}

function buildPath(
  tab: TabId,
  convId?: string | null,
  authMode?: AuthMode,
  eventId?: string | null,
  returnTo?: string | null,
  adminOwnerUid?: string | null
): string {
  switch (tab) {
    case 'home':
      return '/';
    case 'discover':
      return '/discover';
    case 'clients':
      return '/clients';
    case 'events':
      return eventId ? `/events/${encodeURIComponent(eventId)}` : '/events';
    case 'wedding':
      return '/wedding-pickup';
    case 'donate':
      return '/donate';
    case 'impact':
      return '/impact';
    case 'volunteers':
      return '/volunteers';
    case 'leaderboard':
      return '/leaderboard';
    case 'claims':
      return '/claims';
    case 'donor':
      return '/donor';
    case 'admin':
      return adminOwnerUid ? `/admin/${encodeURIComponent(adminOwnerUid)}` : '/admin';
    case 'settings':
      return '/settings';
    case 'chat':
      return convId ? `/inbox/${encodeURIComponent(convId)}` : '/inbox';
    case 'auth': {
      const base =
        authMode === 'signup'
          ? '/signup'
          : authMode === 'forgot'
            ? '/forgot-password'
            : '/login';
      return returnTo ? `${base}?returnTo=${encodeURIComponent(returnTo)}` : base;
    }
  }
}

export default function App() {
  const { lang, t, formatNumber, formatUnit, formatTime, formatTimeLeft, formatArea, formatAddress } = useI18n();
  const {
    user,
    firebaseUser,
    firebaseAuthReady,
    isFirebaseSession,
    isFirebaseVerified,
    isAdmin,
    isLoggedIn,
    authBooting,
    pendingAction,
    loginPrompt,
    sessionExpiredNotice,
    login,
    logout,
    updateUser,
    clearPendingAction,
    requireLogin,
    closeLoginPrompt,
    clearSessionExpiredNotice,
  } = useAuth();

  const initialRoute = useMemo<ParsedRoute>(
    () =>
      typeof window !== 'undefined'
        ? parseRoute(window.location.pathname, window.location.search)
        : { tab: 'home', convId: null, eventId: null, authMode: 'login', returnTo: null },
    []
  );

  const [activeTab, setActiveTab] = useState<TabId>(initialRoute.tab);
  const [authMode, setAuthMode] = useState<AuthMode>(initialRoute.authMode);
  const [authInitialRole, setAuthInitialRole] = useState<'recipient' | 'donor'>('recipient');
  const [returnToUrl, setReturnToUrl] = useState<string | null>(initialRoute.returnTo);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(initialRoute.convId);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialRoute.eventId);
  const [donateContext, setDonateContext] = useState<{
    cause: DonationCause;
    eventId: string | null;
  }>({
    cause: initialRoute.donateCause ?? 'general',
    eventId: initialRoute.donateEventId ?? null,
  });
  const [weddingRefreshTick, setWeddingRefreshTick] = useState(0);

  // Restored progress / drafts across guest -> login flow
  const [listingDetailDraft, setListingDetailDraft] = useState<{
    quantity?: number;
    notes?: string;
    openReport?: boolean;
  } | null>(null);
  const [restoredDonateDraft, setRestoredDonateDraft] = useState<DonateDraft | null>(null);
  const [restoredWeddingDraft, setRestoredWeddingDraft] = useState<WeddingDraft | null>(null);
  const [autoOpenPartnerModal, setAutoOpenPartnerModal] = useState(false);
  const [autoRegisterEventId, setAutoRegisterEventId] = useState<string | null>(null);

  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: 23.765,
    lng: 90.391,
  });

  // Data state
  const [homeSummary, setHomeSummary] = useState<HomeSummary | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [firestoreListings, setFirestoreListings] = useState<Listing[]>([]);
  const [donorListings, setDonorListings] = useState<Listing[]>([]);
  const [loadingListings, setLoadingListings] = useState(false);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [donorClaims, setDonorClaims] = useState<Claim[]>([]);
  const [quota, setQuota] = useState({ usedToday: 0, dailyLimit: 3 });
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [firestoreConversations, setFirestoreConversations] = useState<Conversation[]>([]);
  const [directoryEntries, setDirectoryEntries] = useState<UserDirectoryEntry[]>([]);
  const [directoryLimit, setDirectoryLimit] = useState(30);
  const [directoryHasMore, setDirectoryHasMore] = useState(false);
  const [blockedUids, setBlockedUids] = useState<Set<string>>(() => new Set());
  const [blockedList, setBlockedList] = useState<{ uid: string; name: string; handle?: string }[]>([]);
  const [firestoreMessages, setFirestoreMessages] = useState<ChatMessage[]>([]);
  const [msgPageSize, setMsgPageSize] = useState(30);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const [queuedMessengerMessages, setQueuedMessengerMessages] = useState<QueuedMessengerMessage[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [firestoreNotifications, setFirestoreNotifications] = useState<NotificationItem[]>([]);
  const [adminNotifications, setAdminNotifications] = useState<AdminNotificationItem[]>([]);
  const [adminConversations, setAdminConversations] = useState<AdminConversation[]>([]);
  const [restaurantApplications, setRestaurantApplications] = useState<RestaurantOwnerApplication[]>([]);
  const [myAdminConversation, setMyAdminConversation] = useState<AdminConversation | null>(null);
  const [firebasePlatformUsers, setFirebasePlatformUsers] = useState<PlatformUserSummary[]>([]);
  const [expressPlatformUsers, setExpressPlatformUsers] = useState<PlatformUserSummary[]>([]);
  const [selectedAdminOwnerUid, setSelectedAdminOwnerUid] = useState<string | null>(
    initialRoute.adminOwnerUid ?? null
  );
  const directoryMapRef = useRef<Map<string, UserDirectoryEntry>>(new Map());
  const blockedSetRef = useRef<Set<string>>(new Set());
  const seenNotifIdsRef = useRef<Set<string>>(new Set());
  const notifsInitializedRef = useRef(false);
  const langRef = useRef(lang);
  langRef.current = lang;

  // Search, Filter & Discover Feed/Map mode state
  const [searchQuery, setSearchQuery] = useState('');
  const [discoverMode, setDiscoverMode] = useState<'feed' | 'map'>('feed');
  const [mapFocusListingId, setMapFocusListingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FeedFilters>({
    radiusKm: 15,
    category: 'all',
    dietary: [],
    pickupWithinMin: null,
  });
  const [filterOpen, setFilterOpen] = useState(false);

  // Modals & Drawers
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [listingFormOpen, setListingFormOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [pickupModalState, setPickupModalState] = useState<{
    claim: Claim;
    mode: 'recipient' | 'donor';
  } | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null);
  const [previewBannerDismissed, setPreviewBannerDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('rizik_dismiss_preview_banner') === '1';
    } catch {
      return false;
    }
  });

  const dismissPreviewBanner = useCallback(() => {
    setPreviewBannerDismissed(true);
    try {
      sessionStorage.setItem('rizik_dismiss_preview_banner', '1');
    } catch {
      // Ignore
    }
  }, []);

  // Realtime & Network state
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [wsSocket, setWsSocket] = useState<WebSocket | null>(null);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'offline'>(
    () => (navigator.onLine ? 'connecting' : 'offline')
  );
  const [typingByConv, setTypingByConv] = useState<Record<string, boolean>>({});
  const reconnectTimerRef = useRef<number | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const hadConnectedOnceRef = useRef(false);

  const closeOverlays = useCallback(() => {
    setSelectedListing(null);
    setListingFormOpen(false);
    setEditingListing(null);
    setPickupModalState(null);
    setFilterOpen(false);
    setNotifOpen(false);
    setPaletteOpen(false);
    setProfileMenuOpen(false);
    setMoreMenuOpen(false);
  }, []);

  const syncUrl = useCallback(
    (
      tab: TabId,
      convId?: string | null,
      nextAuthMode?: AuthMode,
      replace = false,
      eventId?: string | null,
      nextReturnTo?: string | null
    ) => {
      if (typeof window === 'undefined') return;
      const nextFull = buildPath(
        tab,
        convId,
        nextAuthMode ?? authMode,
        eventId,
        nextReturnTo
      );
      const currentFull = `${window.location.pathname.replace(/\/+$/, '') || '/'}${window.location.search}`;
      if (currentFull !== nextFull) {
        const statePayload = {
          tab,
          convId: convId ?? null,
          eventId: eventId ?? null,
        };
        if (replace) {
          window.history.replaceState(statePayload, '', nextFull);
        } else {
          window.history.pushState(statePayload, '', nextFull);
        }
      }
    },
    [authMode]
  );

  const getCurrentPublicOrFullReturnPath = useCallback(() => {
    if (typeof window === 'undefined') return '/';
    const p = `${window.location.pathname.replace(/\/+$/, '') || '/'}${window.location.search}`;
    if (p.startsWith('/login') || p.startsWith('/signup') || p.startsWith('/forgot-password')) {
      return returnToUrl || '/';
    }
    return p;
  }, [returnToUrl]);

  const navigateTo = useCallback(
    (
      tab: TabId,
      options?: {
        convId?: string | null;
        eventId?: string | null;
        donateCause?: DonationCause;
        donateEventId?: string | null;
        authMode?: AuthMode;
        authRole?: 'recipient' | 'donor';
        returnTo?: string | null;
        replace?: boolean;
      }
    ) => {
      closeOverlays();

      let targetTab = tab;
      let targetConv =
        options?.convId !== undefined ? options.convId : tab === 'chat' ? selectedConvId : null;
      let targetEvent =
        options?.eventId !== undefined
          ? options.eventId
          : tab === 'events'
            ? selectedEventId
            : null;
      const targetAuthMode = options?.authMode ?? authMode;
      let nextReturnTo = options?.returnTo !== undefined ? options.returnTo : returnToUrl;

      // Protect private routes if guest
      if (!isLoggedIn && PROTECTED_TABS.has(targetTab)) {
        const attemptedPath = buildPath(targetTab, targetConv, targetAuthMode, targetEvent);
        nextReturnTo = attemptedPath;
        setReturnToUrl(attemptedPath);
        targetTab = 'auth';
        targetConv = null;
        targetEvent = null;
      } else if (targetTab === 'auth' && options?.returnTo === undefined && !nextReturnTo) {
        const current = getCurrentPublicOrFullReturnPath();
        nextReturnTo = current;
        setReturnToUrl(current);
      } else if (options?.returnTo !== undefined) {
        setReturnToUrl(options.returnTo);
      }

      if (options?.authRole) {
        setAuthInitialRole(options.authRole);
      }
      if (options?.authMode) {
        setAuthMode(options.authMode);
      }
      if (targetTab === 'chat' && options?.convId !== undefined) {
        setSelectedConvId(options.convId);
      }
      if (targetTab === 'events' && options?.eventId !== undefined) {
        setSelectedEventId(options.eventId);
      }
      if (targetTab === 'donate') {
        setDonateContext({
          cause: options?.donateCause ?? 'general',
          eventId: options?.donateEventId ?? null,
        });
      }

      setActiveTab(targetTab);
      syncUrl(
        targetTab,
        targetConv,
        targetAuthMode,
        options?.replace,
        targetEvent,
        targetTab === 'auth' ? nextReturnTo : null
      );
      if (targetTab !== 'chat') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [
      closeOverlays,
      isLoggedIn,
      selectedConvId,
      selectedEventId,
      authMode,
      returnToUrl,
      getCurrentPublicOrFullReturnPath,
      syncUrl,
    ]
  );

  // Enforce protected routes on initial boot and on mid-session expiry
  useEffect(() => {
    if (authBooting) return;

    const current = parseRoute(window.location.pathname, window.location.search);
    if (!isLoggedIn) {
      if (PROTECTED_TABS.has(current.tab) || PROTECTED_TABS.has(activeTab)) {
        const returnPath = PROTECTED_TABS.has(current.tab)
          ? `${window.location.pathname}${window.location.search}`
          : buildPath(activeTab, selectedConvId, authMode, selectedEventId);
        setReturnToUrl(returnPath);
        setActiveTab('auth');
        setAuthMode('login');
        syncUrl('auth', null, 'login', true, null, returnPath);
      }
    } else if (current.tab === 'auth') {
      const dest = current.returnTo ? parseRoute(current.returnTo) : null;
      if (dest && dest.tab !== 'auth') {
        setActiveTab(dest.tab);
        setSelectedConvId(dest.convId);
        setSelectedEventId(dest.eventId);
        syncUrl(dest.tab, dest.convId, 'login', true, dest.eventId);
      } else {
        setActiveTab('home');
        syncUrl('home', null, 'login', true, null);
      }
    }
  }, [authBooting, isLoggedIn, activeTab, selectedConvId, selectedEventId, authMode, syncUrl]);

  // Clear private data automatically whenever user becomes null (logout or 401 expiry)
  useEffect(() => {
    if (isLoggedIn) return;
    setSelectedConvId(null);
    setConversations([]);
    setNotifications([]);
    setAdminNotifications([]);
    setAdminConversations([]);
    setRestaurantApplications([]);
    setMyAdminConversation(null);
    setFirebasePlatformUsers([]);
    setExpressPlatformUsers([]);
    setSelectedAdminOwnerUid(null);
    setClaims([]);
    setDonorClaims([]);
    setDonorListings([]);
    setTypingByConv({});
    setQuota({ usedToday: 0, dailyLimit: 3 });
  }, [isLoggedIn]);

  const handleSelectConversation = useCallback(
    (convId: string | null) => {
      if (!requireLogin({ type: 'inbox' })) return;
      setSelectedConvId(convId);
      setActiveTab('chat');
      syncUrl('chat', convId, authMode, false, null);
    },
    [requireLogin, syncUrl, authMode]
  );

  const handleSelectEventId = useCallback(
    (eventId: string | null) => {
      setSelectedEventId(eventId);
      setActiveTab('events');
      syncUrl('events', null, authMode, false, eventId);
    },
    [syncUrl, authMode]
  );

  // Sync with browser Back / Forward buttons cleanly across guest & authenticated states
  useEffect(() => {
    const handlePopState = () => {
      closeOverlays();
      const parsed = parseRoute(window.location.pathname, window.location.search);

      if (!isLoggedIn) {
        if (PROTECTED_TABS.has(parsed.tab)) {
          const returnPath = `${window.location.pathname}${window.location.search}`;
          setReturnToUrl(returnPath);
          setActiveTab('auth');
          setAuthMode('login');
          setSelectedConvId(null);
          setSelectedEventId(null);
          syncUrl('auth', null, 'login', true, null, returnPath);
          return;
        }
        setActiveTab(parsed.tab);
        setAuthMode(parsed.authMode);
        setReturnToUrl(parsed.returnTo);
        setSelectedEventId(parsed.tab === 'events' ? parsed.eventId : null);
        if (parsed.tab === 'donate' && parsed.donateCause) {
          setDonateContext({
            cause: parsed.donateCause,
            eventId: parsed.donateEventId ?? null,
          });
        }
        return;
      }

      if (parsed.tab === 'auth') {
        setActiveTab('home');
        setSelectedConvId(null);
        setSelectedEventId(null);
        syncUrl('home', null, authMode, true, null);
      } else {
        setActiveTab(parsed.tab);
        if (parsed.tab === 'chat') {
          setSelectedConvId(parsed.convId);
        }
        if (parsed.tab === 'admin') {
          setSelectedAdminOwnerUid(parsed.adminOwnerUid ?? null);
        }
        if (parsed.tab === 'events') {
          setSelectedEventId(parsed.eventId);
        }
        if (parsed.tab === 'donate' && parsed.donateCause) {
          setDonateContext({
            cause: parsed.donateCause,
            eventId: parsed.donateEventId ?? null,
          });
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [closeOverlays, isLoggedIn, syncUrl, authMode]);

  const handleLanguageSynced = (nextLang: Language) => {
    if (!user) return;
    if (isFirebaseSession) {
      if (isFirebaseVerified && firebaseUser) {
        updateFirebaseUserProfile(firebaseUser, { language: nextLang })
          .then((updated) => updateUser(updated))
          .catch(() => {});
      }
      return;
    }
    api
      .updateProfile({ language: nextLang })
      .then((res) => updateUser(res.user))
      .catch(() => {});
  };

  // Network listeners
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Geolocation for distance sorting
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {},
      { timeout: 5000 }
    );
  }, []);

  // Enrich Firestore conversations with live directory presence and block state
  const enrichedFirestoreConversations = useMemo(() => {
    const dirMap = new Map(directoryEntries.map((e) => [e.uid, e]));
    return firestoreConversations.map((c) => {
      const peer = c.peerUid ? dirMap.get(c.peerUid) : undefined;
      const blockedByMe = Boolean(!c.isDemo && c.peerUid && blockedUids.has(c.peerUid));
      return {
        ...c,
        peerOnline: c.isDemo ? true : peer ? peer.online : c.peerOnline,
        peerLastSeen: c.isDemo ? null : peer ? peer.lastSeen : c.peerLastSeen,
        peerVerified: c.isDemo ? true : peer ? peer.verified : c.peerVerified,
        peerHandle: c.isDemo ? c.peerHandle : peer ? peer.handle : c.peerHandle,
        peerArea: c.isDemo ? c.peerArea : peer ? peer.area : c.peerArea,
        peerRestaurantName: peer?.restaurantName ?? c.peerRestaurantName,
        blockedByMe,
        isBlocked: blockedByMe || c.isBlocked,
      };
    });
  }, [firestoreConversations, directoryEntries, blockedUids]);

  const mergedConversations = useMemo(() => {
    const map = new Map<string, Conversation>();
    for (const c of enrichedFirestoreConversations) {
      map.set(c.id, c);
    }
    for (const c of conversations) {
      if (!map.has(c.id)) {
        map.set(c.id, c);
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      (b.lastMessageAt || b.updatedAt).localeCompare(a.lastMessageAt || a.updatedAt)
    );
  }, [enrichedFirestoreConversations, conversations]);

  const mergedNotifications = useMemo(() => {
    if (isFirebaseSession && isFirebaseVerified) {
      return firestoreNotifications;
    }
    return notifications;
  }, [isFirebaseSession, isFirebaseVerified, firestoreNotifications, notifications]);

  // Resolve `/inbox/:shopId` param against admin_, conversation ID, peerUid, or donorId once conversations load
  const resolvedSelectedConvId = useMemo(() => {
    if (!selectedConvId) return null;
    if (selectedConvId.startsWith('admin_')) return selectedConvId;
    const direct = mergedConversations.find((c) => c.id === selectedConvId);
    if (direct) return direct.id;
    const byPeerOrDonor = mergedConversations.find(
      (c) => c.peerUid === selectedConvId || c.donorId === selectedConvId
    );
    return byPeerOrDonor ? byPeerOrDonor.id : selectedConvId;
  }, [mergedConversations, selectedConvId]);

  const loadHomeSummary = useCallback(async () => {
    try {
      const res = await api.getHomeSummary();
      setHomeSummary(res);
    } catch {
      // Offline resilient
    }
  }, []);

  const loadFeed = useCallback(async () => {
    setLoadingListings(true);
    try {
      const res = await api.getListings({
        lat: coords.lat,
        lng: coords.lng,
        radiusKm: filters.radiusKm,
        category: filters.category,
        dietary: filters.dietary,
        pickupWithinMin: filters.pickupWithinMin,
        search: searchQuery,
        flashOnly: filters.flashOnly,
        ramadanOnly: filters.ramadanOnly,
      });
      setListings(res.listings);
      cacheFeed(res.listings);
    } catch {
      const cached = getCachedFeed();
      if (cached) setListings(cached.listings);
    } finally {
      setLoadingListings(false);
    }
  }, [coords.lat, coords.lng, filters, searchQuery]);

  const loadUserWorkspaceData = useCallback(async () => {
    if (!user) return;
    if (isFirebaseSession && !isFirebaseVerified) return;
    try {
      const [convRes, notifRes] = await Promise.all([
        api.getConversations(),
        api.getNotifications(),
      ]);
      setConversations(convRes.conversations);
      setNotifications(notifRes.notifications);

      api
        .getUsers()
        .then((res) => setExpressPlatformUsers(res.users))
        .catch(() => {});

      if (!isFirebaseSession) {
        if (user.role === 'donor') {
          const [dListRes, dClaimRes] = await Promise.all([
            api.getListings({ donorId: user.id, includeAll: true, lat: coords.lat, lng: coords.lng }),
            api.getClaims('donor'),
          ]);
          setDonorListings(dListRes.listings);
          setDonorClaims(dClaimRes.claims);
        } else {
          const rClaimRes = await api.getClaims('recipient');
          setClaims(rClaimRes.claims);
          setQuota(rClaimRes.quota);
        }
      }
    } catch {
      // Offline resilient
    }
  }, [user, isFirebaseSession, isFirebaseVerified, coords.lat, coords.lng]);

  // Keep latest loaders in refs so WebSocket effect never reconnects on callback identity changes
  const loadFeedRef = useRef(loadFeed);
  loadFeedRef.current = loadFeed;
  const loadHomeRef = useRef(loadHomeSummary);
  loadHomeRef.current = loadHomeSummary;
  const loadWorkspaceRef = useRef(loadUserWorkspaceData);
  loadWorkspaceRef.current = loadUserWorkspaceData;

  // Load public home summary & public listings for everyone (guests & authenticated)
  useEffect(() => {
    loadHomeSummary();
    loadFeed();
  }, [loadHomeSummary, loadFeed, user?.id]);

  // Load private workspace data for authenticated Express & verified Firebase sessions
  useEffect(() => {
    if (!user) return;
    if (isFirebaseSession && !isFirebaseVerified) return;
    loadUserWorkspaceData();
  }, [user, isFirebaseSession, isFirebaseVerified, loadUserWorkspaceData]);

  // Attach Firestore real-time listeners ONLY when Firebase auth is ready and a user is signed in
  useEffect(() => {
    if (!(firebaseAuthReady && firebaseUser)) {
      setFirestoreListings([]);
      setFirestoreConversations([]);
      setDirectoryEntries([]);
      setBlockedUids(new Set());
      setBlockedList([]);
      setFirestoreMessages([]);
      setFirestoreNotifications([]);
      setQueuedMessengerMessages([]);
      setAdminNotifications([]);
      setAdminConversations([]);
      setRestaurantApplications([]);
      setFirebasePlatformUsers([]);
      setMyAdminConversation(null);
      directoryMapRef.current = new Map();
      blockedSetRef.current = new Set();
      seenNotifIdsRef.current = new Set();
      notifsInitializedRef.current = false;
      return;
    }

    const unsubs: (() => void)[] = [];
    unsubs.push(subscribeActiveFirestoreListings(setFirestoreListings));

    if (isFirebaseVerified && user?.id === firebaseUser.uid) {
      setQueuedMessengerMessages(readOfflineMessageQueue(firebaseUser.uid));

      // Public directory sync, presence tracking, and once-per-user starter seeding
      void syncUserDirectoryProfile(firebaseUser, user, true);
      unsubs.push(startPresenceTracking(firebaseUser.uid));
      void seedStarterDemoConversationsOnce(firebaseUser, user);
      void seedStarterNotificationsOnce(firebaseUser, user);

      unsubs.push(
        subscribeMyBlockedUsers(firebaseUser.uid, (uids, list) => {
          blockedSetRef.current = uids;
          setBlockedUids(uids);
          setBlockedList(list);
        })
      );

      unsubs.push(
        subscribeMyFirestoreConversations(
          firebaseUser.uid,
          () => blockedSetRef.current,
          () => directoryMapRef.current,
          setFirestoreConversations
        )
      );

      unsubs.push(
        subscribeUserNotifications(firebaseUser.uid, (items) => {
          setFirestoreNotifications(items);
          if (!notifsInitializedRef.current) {
            items.forEach((it) => seenNotifIdsRef.current.add(it.id));
            notifsInitializedRef.current = true;
            return;
          }
          const newestUnread = items.find(
            (it) => !it.read && !it.isStarter && !seenNotifIdsRef.current.has(it.id)
          );
          items.forEach((it) => seenNotifIdsRef.current.add(it.id));
          if (newestUnread) {
            const toastTitle = langRef.current === 'bn' ? newestUnread.titleBn || newestUnread.title : newestUnread.title;
            const toastBody = langRef.current === 'bn' ? newestUnread.bodyBn || newestUnread.body : newestUnread.body;
            setToast({ title: toastTitle, body: toastBody });
            window.setTimeout(() => setToast(null), 5000);
          }
        })
      );

      if (user.role === 'donor') {
        unsubs.push(subscribeMyDonorListings(firebaseUser.uid, setDonorListings));
        unsubs.push(subscribeMyFirestoreClaims(firebaseUser.uid, 'donor', setDonorClaims));
      } else {
        unsubs.push(subscribeMyFirestoreClaims(firebaseUser.uid, 'recipient', setClaims));
      }

      if (isAdmin) {
        unsubs.push(subscribeAdminNotifications(setAdminNotifications));
        unsubs.push(subscribeAllAdminConversations(setAdminConversations));
        unsubs.push(subscribeRestaurantApplications(setRestaurantApplications));
        unsubs.push(subscribeAllFirebaseUsers(setFirebasePlatformUsers));
      } else {
        setAdminNotifications([]);
        setAdminConversations([]);
        setRestaurantApplications([]);
        setFirebasePlatformUsers([]);
        unsubs.push(subscribeMyAdminConversation(firebaseUser.uid, setMyAdminConversation));
      }
    }

    return () => {
      for (const unsub of unsubs) {
        unsub();
      }
    };
  }, [firebaseAuthReady, firebaseUser, isFirebaseVerified, isAdmin, user?.id, user?.role]);

  // Paginated Zero-PII People Directory subscription
  useEffect(() => {
    if (!(firebaseAuthReady && firebaseUser && isFirebaseVerified)) {
      setDirectoryEntries([]);
      setDirectoryHasMore(false);
      return;
    }
    return subscribeDiscoverableDirectory(
      firebaseUser.uid,
      directoryLimit,
      (entries, hasMore) => {
        directoryMapRef.current = new Map(entries.map((e) => [e.uid, e]));
        setDirectoryEntries(entries);
        setDirectoryHasMore(hasMore);
      }
    );
  }, [firebaseAuthReady, firebaseUser, isFirebaseVerified, directoryLimit]);

  // Reset message page size when switching active thread
  useEffect(() => {
    setMsgPageSize(30);
    setLoadingMoreMessages(false);
  }, [resolvedSelectedConvId]);

  const activeFirestoreConv = useMemo(
    () =>
      mergedConversations.find(
        (c) => c.id === resolvedSelectedConvId && Boolean(c.isFirestoreBacked)
      ) ?? null,
    [mergedConversations, resolvedSelectedConvId]
  );

  // Real-time paginated messages listener + delivered/read receipt syncing
  useEffect(() => {
    if (!(firebaseAuthReady && firebaseUser && isFirebaseVerified && activeFirestoreConv)) {
      setFirestoreMessages([]);
      setHasMoreMessages(false);
      setLoadingMoreMessages(false);
      return;
    }
    return subscribeConversationMessages(
      activeFirestoreConv.id,
      firebaseUser.uid,
      activeFirestoreConv.peerUid,
      msgPageSize,
      (msgs, hasMore) => {
        setFirestoreMessages(msgs);
        setHasMoreMessages(hasMore);
        setLoadingMoreMessages(false);
        void markConversationDeliveredAndRead(
          activeFirestoreConv,
          firebaseUser.uid,
          msgs,
          activeTab === 'chat'
        );
      }
    );
  }, [
    firebaseAuthReady,
    firebaseUser,
    isFirebaseVerified,
    activeFirestoreConv?.id,
    activeFirestoreConv?.peerUid,
    msgPageSize,
    activeTab,
  ]);

  // Mark unread incoming Firestore messages as delivered whenever user is online
  useEffect(() => {
    if (!(firebaseAuthReady && firebaseUser && isFirebaseVerified && isOnline)) return;
    const unreadConvs = firestoreConversations.filter(
      (c) =>
        !c.isDemo &&
        c.unreadCount > 0 &&
        c.lastMessageSenderId !== firebaseUser.uid &&
        c.id !== activeFirestoreConv?.id
    );
    if (unreadConvs.length === 0) return;
    unreadConvs.slice(0, 6).forEach((conv) => {
      void markConversationUnreadAsDelivered(conv.id, firebaseUser.uid);
    });
  }, [
    firebaseAuthReady,
    firebaseUser,
    isFirebaseVerified,
    isOnline,
    firestoreConversations,
    activeFirestoreConv?.id,
  ]);

  const mergedListings = useMemo(() => {
    if (firestoreListings.length === 0) return listings;
    const seen = new Set(listings.map((l) => l.id));
    const q = searchQuery.trim().toLowerCase();
    const filteredFs = firestoreListings.filter((item) => {
      if (seen.has(item.id)) return false;
      if (filters.category !== 'all' && item.category !== filters.category) return false;
      if (filters.flashOnly && !item.isFlashRescue) return false;
      if (filters.ramadanOnly && !item.isRamadanSpecial) return false;
      if (
        filters.dietary.length > 0 &&
        !filters.dietary.every((tag) => item.dietaryTags.includes(tag))
      ) {
        return false;
      }
      if (
        q &&
        !item.title.toLowerCase().includes(q) &&
        !item.donorName.toLowerCase().includes(q) &&
        !item.donorArea.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
    return [...filteredFs, ...listings];
  }, [firestoreListings, listings, filters, searchQuery]);

  // Stabilized WebSocket Lifecycle (supports both Express and verified Firebase sessions)
  useEffect(() => {
    if (!user?.id || (isFirebaseSession && !isFirebaseVerified)) {
      setWsSocket(null);
      setWsStatus(isOnline ? 'connecting' : 'offline');
      return;
    }
    if (!isOnline) {
      setWsSocket(null);
      setWsStatus('offline');
      return;
    }

    let active = true;
    let ws: WebSocket | null = null;

    const clearTimers = () => {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (pingTimerRef.current) {
        window.clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
    };

    const connect = async () => {
      if (!active || !navigator.onLine) return;
      const { token } = await getAuthToken(reconnectAttemptRef.current > 0);
      if (!active || !token) return;
      clearTimers();
      setWsStatus(reconnectAttemptRef.current > 0 ? 'reconnecting' : 'connecting');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`);

      ws.onopen = () => {
        if (!active) return;
        const isReconnect = hadConnectedOnceRef.current;
        hadConnectedOnceRef.current = true;
        reconnectAttemptRef.current = 0;
        setWsSocket(ws);
        setWsStatus('connected');

        if (isReconnect) {
          loadWorkspaceRef.current();
        }

        pingTimerRef.current = window.setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ event: 'ping' }));
          }
        }, 25000);
      };

      ws.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(ev.data);
          if (parsed.event === 'pong') return;
          if (parsed.event === 'chat:typing') {
            const { conversationId, isTyping } = parsed.data as {
              conversationId: string;
              isTyping: boolean;
            };
            setTypingByConv((prev) => ({ ...prev, [conversationId]: isTyping }));
          } else if (
            parsed.event === 'claim:updated' ||
            parsed.event === 'listing:expired' ||
            parsed.event === 'listing:created'
          ) {
            loadFeedRef.current();
            loadHomeRef.current();
            loadWorkspaceRef.current();
          } else if (parsed.event === 'wedding:updated') {
            setWeddingRefreshTick((n) => n + 1);
            loadHomeRef.current();
          } else if (parsed.event === 'notification:new') {
            const notif = parsed.data as NotificationItem;
            setNotifications((prev) => [notif, ...prev]);
            setToast({ title: notif.title, body: notif.body });
            window.setTimeout(() => setToast(null), 5000);
          } else if (parsed.event === 'chat:message') {
            api
              .getConversations()
              .then((res) => setConversations(res.conversations))
              .catch(() => {});
          } else if (parsed.event === 'presence:update') {
            const { userId: peerUserId, isOnline: peerWsOnline, hasLoggedIn } = parsed.data as {
              userId: string;
              isOnline: boolean;
              hasLoggedIn?: boolean;
            };
            const nowIso = new Date().toISOString();
            setConversations((prev) =>
              prev.map((c) =>
                c.donorId === peerUserId || c.recipientId === peerUserId
                  ? { ...c, peerOnline: peerWsOnline }
                  : c
              )
            );
            setExpressPlatformUsers((prev) => {
              const found = prev.some((u) => u.id === peerUserId);
              if (!found) {
                api
                  .getUsers()
                  .then((res) => setExpressPlatformUsers(res.users))
                  .catch(() => {});
                return prev;
              }
              return prev.map((u) =>
                u.id === peerUserId
                  ? {
                      ...u,
                      wsOnline: peerWsOnline,
                      isOnline: peerWsOnline || Boolean(hasLoggedIn ?? u.hasLoggedIn),
                      hasLoggedIn: Boolean(hasLoggedIn ?? u.hasLoggedIn ?? peerWsOnline),
                      lastActiveAt: nowIso,
                    }
                  : u
              );
            });
          }
        } catch {
          // Ignore malformed WS payloads
        }
      };

      ws.onerror = () => {
        // Handled cleanly by onclose
      };

      ws.onclose = () => {
        clearTimers();
        setWsSocket(null);
        if (!active) return;
        if (!navigator.onLine) {
          setWsStatus('offline');
          return;
        }
        setWsStatus('reconnecting');
        const delay = Math.min(8000, 1000 * Math.pow(2, reconnectAttemptRef.current));
        reconnectAttemptRef.current += 1;
        reconnectTimerRef.current = window.setTimeout(() => {
          void connect();
        }, delay);
      };
    };

    void connect();

    return () => {
      active = false;
      clearTimers();
      ws?.close();
    };
  }, [user?.id, isOnline, isFirebaseSession, isFirebaseVerified]);

  const openAuthPage = useCallback(
    (mode: AuthMode, explicitAction?: PendingAuthAction, initialRole?: 'recipient' | 'donor') => {
      closeLoginPrompt();
      const targetReturn = getCurrentPublicOrFullReturnPath();
      if (initialRole) setAuthInitialRole(initialRole);
      if (explicitAction?.type === 'post_food' && !initialRole) {
        setAuthInitialRole('donor');
      }
      navigateTo('auth', {
        authMode: mode,
        returnTo: targetReturn,
      });
    },
    [closeLoginPrompt, getCurrentPublicOrFullReturnPath, navigateTo]
  );

  const handleBackToBrowsing = useCallback(() => {
    clearSessionExpiredNotice();
    clearPendingAction();
    const target = returnToUrl ? parseRoute(returnToUrl) : null;
    if (target && !PROTECTED_TABS.has(target.tab) && target.tab !== 'auth') {
      setReturnToUrl(null);
      setActiveTab(target.tab);
      setSelectedEventId(target.eventId);
      if (target.donateCause) {
        setDonateContext({
          cause: target.donateCause,
          eventId: target.donateEventId ?? null,
        });
      }
      syncUrl(target.tab, null, 'login', false, target.eventId);
    } else {
      setReturnToUrl(null);
      setActiveTab('home');
      syncUrl('home', null, 'login', false, null);
    }
  }, [clearSessionExpiredNotice, clearPendingAction, returnToUrl, syncUrl]);

  const handleAuthenticated = async (session: AuthSession) => {
    login(session);
    clearSessionExpiredNotice();
    closeOverlays();

    const action = pendingAction;
    clearPendingAction();
    const fallbackReturn = returnToUrl;
    setReturnToUrl(null);

    // Fetch fresh feed immediately so listing lookups & addresses reflect authenticated user
    let freshListings = listings;
    try {
      const feedRes = await api.getListings({
        lat: coords.lat,
        lng: coords.lng,
        radiusKm: Math.max(filters.radiusKm, 25),
      });
      freshListings = feedRes.listings;
      setListings(freshListings);
    } catch {
      // Fallback to existing listings
    }

    if (action) {
      switch (action.type) {
        case 'chat': {
          if (action.donorId) {
            try {
              if (session.token === '__firebase__') {
                if (auth.currentUser?.emailVerified) {
                  const match = freshListings.find((l) => l.id === action.listingId) ?? null;
                  const convId = await openDirectChatForListingOrShop(
                    session.user,
                    action.donorId,
                    action.shopName || match?.donorName || 'Partner Kitchen',
                    match?.donorArea || 'Dhaka',
                    null,
                    Boolean(match?.donorVerified),
                    match
                  );
                  setSelectedConvId(convId);
                  setActiveTab('chat');
                  syncUrl('chat', convId, 'login', true, null);
                  return;
                }
              } else {
                const res = await api.openShopConversation(action.donorId, action.listingId);
                setSelectedConvId(res.conversationId);
                setActiveTab('chat');
                syncUrl('chat', res.conversationId, 'login', true, null);
                return;
              }
            } catch {
              // Fallback to inbox
            }
          } else if (action.pickupId) {
            try {
              const res = await api.openWeddingChat(action.pickupId);
              setSelectedConvId(res.conversationId);
              setActiveTab('chat');
              syncUrl('chat', res.conversationId, 'login', true, null);
              return;
            } catch {
              // Fallback to inbox
            }
          }
          setActiveTab('chat');
          syncUrl('chat', null, 'login', true, null);
          return;
        }
        case 'inbox': {
          setActiveTab('chat');
          syncUrl('chat', null, 'login', true, null);
          return;
        }
        case 'claim': {
          const match = freshListings.find((l) => l.id === action.listingId) ?? null;
          setActiveTab('discover');
          syncUrl('discover', null, 'login', true, null);
          if (match) {
            setListingDetailDraft({ quantity: action.quantity, notes: action.notes });
            setSelectedListing(match);
          }
          return;
        }
        case 'report': {
          const match = freshListings.find((l) => l.id === action.listingId) ?? null;
          setActiveTab('discover');
          syncUrl('discover', null, 'login', true, null);
          if (match) {
            setListingDetailDraft({ openReport: true });
            setSelectedListing(match);
          }
          return;
        }
        case 'claims': {
          const tabForRole: TabId = session.user.role === 'donor' ? 'donor' : 'claims';
          setActiveTab(tabForRole);
          syncUrl(tabForRole, null, 'login', true, null);
          return;
        }
        case 'donor_hub': {
          const tabForRole: TabId = session.user.role === 'donor' ? 'donor' : 'settings';
          setActiveTab(tabForRole);
          syncUrl(tabForRole, null, 'login', true, null);
          return;
        }
        case 'donate': {
          if (action.draft) {
            setRestoredDonateDraft(action.draft);
            setDonateContext({
              cause: action.draft.cause,
              eventId: action.draft.eventId || null,
            });
          }
          setActiveTab('donate');
          syncUrl('donate', null, 'login', true, null);
          return;
        }
        case 'volunteer': {
          setSelectedEventId(action.eventId);
          setAutoRegisterEventId(action.eventId);
          setActiveTab('events');
          syncUrl('events', null, 'login', true, action.eventId);
          return;
        }
        case 'reminder': {
          api.remindEvent(action.eventId).catch(() => {});
          setSelectedEventId(null);
          setActiveTab('events');
          syncUrl('events', null, 'login', true, null);
          return;
        }
        case 'wedding_submit': {
          if (action.draft) {
            setRestoredWeddingDraft(action.draft);
          }
          setActiveTab('wedding');
          syncUrl('wedding', null, 'login', true, null);
          return;
        }
        case 'wedding_tracker': {
          setActiveTab('wedding');
          syncUrl('wedding', null, 'login', true, null);
          return;
        }
        case 'partner': {
          setAutoOpenPartnerModal(true);
          setActiveTab('clients');
          syncUrl('clients', null, 'login', true, null);
          return;
        }
        case 'post_food': {
          const isUnapprovedOwner =
            session.user.accountType === 'restaurantOwner' &&
            session.user.restaurant?.verificationStatus !== 'approved';
          if (session.user.role === 'donor') {
            setActiveTab('donor');
            syncUrl('donor', null, 'login', true, null);
            if (!isUnapprovedOwner) {
              setEditingListing(null);
              setListingFormOpen(true);
            }
          } else {
            setActiveTab('settings');
            syncUrl('settings', null, 'login', true, null);
          }
          return;
        }
        case 'shift': {
          setActiveTab('volunteers');
          syncUrl('volunteers', null, 'login', true, null);
          return;
        }
        case 'review': {
          setActiveTab('claims');
          syncUrl('claims', null, 'login', true, null);
          return;
        }
        case 'account': {
          setActiveTab('settings');
          syncUrl('settings', null, 'login', true, null);
          return;
        }
      }
    }

    if (fallbackReturn) {
      const target = parseRoute(fallbackReturn);
      if (target.tab !== 'auth') {
        setActiveTab(target.tab);
        setSelectedConvId(target.convId);
        setSelectedEventId(target.eventId);
        if (target.donateCause) {
          setDonateContext({
            cause: target.donateCause,
            eventId: target.donateEventId ?? null,
          });
        }
        syncUrl(target.tab, target.convId, 'login', true, target.eventId);
        return;
      }
    }

    setSelectedConvId(null);
    setSelectedEventId(null);
    setActiveTab('home');
    syncUrl('home', null, 'login', true, null);
  };

  const handleSignOut = () => {
    if (firebaseUser?.uid) {
      void markPresenceOffline(firebaseUser.uid);
    }
    logout();
    closeOverlays();
    setReturnToUrl(null);
    setSelectedEventId(null);
    setActiveTab('home');
    syncUrl('home', null, 'login', false, null);
  };

  const handleAuthModeChange = (nextMode: AuthMode) => {
    setAuthMode(nextMode);
    syncUrl('auth', null, nextMode, false, null, returnToUrl);
  };

  const handleClaimCreated = async (conversationId: string) => {
    setSelectedListing(null);
    setListingDetailDraft(null);
    await Promise.all([loadFeed(), loadHomeSummary(), loadUserWorkspaceData()]);
    if (conversationId) {
      navigateTo('chat', { convId: conversationId });
    } else {
      navigateTo('claims');
    }
  };

  const handleOpenShopChat = async (conversationId: string) => {
    setSelectedListing(null);
    setListingDetailDraft(null);
    await loadUserWorkspaceData();
    navigateTo('chat', { convId: conversationId });
  };

  const handleCancelClaim = async (claimId: string) => {
    if (isFirebaseSession) {
      if (isFirebaseVerified) {
        await updateFirestoreClaimStatus(claimId, 'cancelled');
      }
    } else {
      await api.updateClaimStatus(claimId, { status: 'cancelled' });
    }
    await Promise.all([loadFeed(), loadHomeSummary(), loadUserWorkspaceData()]);
  };

  const handleVerifyPickupCode = async (
    claimId: string,
    code: string,
    method: 'qr' | 'manual' = 'manual'
  ) => {
    if (isFirebaseSession) {
      if (isFirebaseVerified) {
        await updateFirestoreClaimStatus(claimId, 'completed', method);
      }
    } else {
      await api.updateClaimStatus(claimId, {
        status: 'completed',
        pickupCode: code,
        handoverMethod: method,
      });
    }
    await Promise.all([loadFeed(), loadHomeSummary(), loadUserWorkspaceData()]);
  };

  const handleOpenNotifications = async () => {
    if (!requireLogin({ type: 'account' })) return;
    setProfileMenuOpen(false);
    setPaletteOpen(false);
    setNotifOpen((o) => !o);
  };

  const isUnapprovedRestaurantOwner =
    user?.accountType === 'restaurantOwner' &&
    user?.restaurant?.verificationStatus !== 'approved';

  const handleDonateFoodAction = () => {
    if (!requireLogin({ type: 'post_food' })) return;
    if (user?.role === 'donor') {
      if (isUnapprovedRestaurantOwner) {
        navigateTo('donor');
        return;
      }
      setEditingListing(null);
      setListingFormOpen(true);
    } else {
      navigateTo('settings');
    }
  };

  const directoryUsers = useMemo(() => {
    if (!user) return [];
    const byId = new Map<string, PlatformUserSummary>();
    for (const u of expressPlatformUsers) {
      if (u.id !== user.id) byId.set(u.id, u);
    }
    if (isAdmin) {
      for (const u of firebasePlatformUsers) {
        if (u.id !== user.id && !byId.has(u.id)) {
          byId.set(u.id, u);
        }
      }
    }
    return Array.from(byId.values()).sort((a, b) => {
      const aWs = a.wsOnline ? 1 : 0;
      const bWs = b.wsOnline ? 1 : 0;
      if (aWs !== bWs) return bWs - aWs;
      const aLogin = a.hasLoggedIn || a.isOnline ? 1 : 0;
      const bLogin = b.hasLoggedIn || b.isOnline ? 1 : 0;
      if (aLogin !== bLogin) return bLogin - aLogin;
      return (a.businessName || a.name).localeCompare(b.businessName || b.name);
    });
  }, [user, isAdmin, expressPlatformUsers, firebasePlatformUsers]);

  const handleSelectDirectoryPerson = useCallback(
    async (entry: UserDirectoryEntry) => {
      if (!user) return;
      if (isFirebaseSession && isFirebaseVerified) {
        try {
          const convId = await getOrCreateDirectConversation(user, entry);
          navigateTo('chat', { convId });
        } catch (err) {
          const raw = err instanceof Error ? err.message : '';
          setToast({
            title: t('chat.inboxTitle'),
            body:
              raw.includes('permission-denied') ||
              raw.includes('PERMISSION_DENIED') ||
              raw.includes('blocked')
                ? t('chat.blockedNotice')
                : raw || t('chat.queueError'),
          });
          window.setTimeout(() => setToast(null), 5000);
        }
        return;
      }
      const res = await api.openDirectConversation(entry.uid);
      await loadUserWorkspaceData();
      navigateTo('chat', { convId: res.conversationId });
    },
    [user, isFirebaseSession, isFirebaseVerified, navigateTo, loadUserWorkspaceData, t]
  );

  const enqueueMessengerItem = useCallback(
    (item: QueuedMessengerMessage) => {
      if (!user?.id) return;
      setQueuedMessengerMessages((prev) => {
        const next = [...prev.filter((q) => q.tempId !== item.tempId), item];
        writeOfflineMessageQueue(user.id, next);
        return next;
      });
    },
    [user?.id]
  );

  const sendOrResolvePayloadMedia = useCallback(
    async (conv: Conversation, payload: FirestoreSendPayload): Promise<string | null> => {
      if (!user) return null;
      let resolvedMedia = payload.mediaUrl ?? null;
      if (payload.file) {
        const uploadedUrl = await uploadChatMediaFile(
          conv.id,
          user.id,
          payload.file,
          payload.fileName || 'attachment'
        );
        if (uploadedUrl) {
          resolvedMedia = uploadedUrl;
        } else if (resolvedMedia && resolvedMedia.length <= 440_000) {
          return resolvedMedia;
        } else if (payload.messageType === 'image' && payload.file instanceof File) {
          resolvedMedia = await compressImageFileToDataUrl(payload.file, 880, 420_000);
        } else if (payload.file.size <= 310_000) {
          resolvedMedia = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(payload.file!);
          });
        } else {
          throw new Error(t('file.uploadFailed'));
        }
      }
      return resolvedMedia;
    },
    [user, t]
  );

  const handleSendFirestoreMessage = useCallback(
    async (conv: Conversation, payload: FirestoreSendPayload) => {
      if (!user) return;
      const resolvedMediaUrl = await sendOrResolvePayloadMedia(conv, payload);
      const tempItem: QueuedMessengerMessage = {
        tempId: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        conversationId: conv.id,
        senderId: user.id,
        senderName:
          user.accountType === 'restaurantOwner'
            ? user.restaurant?.restaurantName || user.donorProfile?.businessName || user.name
            : user.name,
        text: payload.text,
        messageType: payload.messageType ?? 'text',
        mediaUrl: resolvedMediaUrl,
        fileName: payload.fileName ?? null,
        fileSize: payload.fileSize ?? null,
        fileMime: payload.fileMime ?? null,
        durationSec: payload.durationSec ?? null,
        locationLat: payload.locationLat ?? null,
        locationLng: payload.locationLng ?? null,
        locationLabel: payload.locationLabel ?? null,
        locationExpiresAt: payload.locationExpiresAt ?? null,
        replyToId: payload.replyToId ?? null,
        replyToText: payload.replyToText ?? null,
        forwardedFrom: payload.forwardedFrom ?? null,
      };

      if (!isOnline) {
        enqueueMessengerItem(tempItem);
        return;
      }

      try {
        await sendMessengerMessage({
          conversation: conv,
          senderId: tempItem.senderId,
          senderName: tempItem.senderName,
          text: tempItem.text,
          messageType: tempItem.messageType,
          mediaUrl: tempItem.mediaUrl,
          fileName: tempItem.fileName,
          fileSize: tempItem.fileSize,
          fileMime: tempItem.fileMime,
          durationSec: tempItem.durationSec,
          locationLat: tempItem.locationLat,
          locationLng: tempItem.locationLng,
          locationLabel: tempItem.locationLabel,
          locationExpiresAt: tempItem.locationExpiresAt,
          replyToId: tempItem.replyToId,
          replyToText: tempItem.replyToText,
          forwardedFrom: tempItem.forwardedFrom,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('permission-denied') || msg.includes('PERMISSION_DENIED')) {
          throw new Error(t('chat.blockedNotice'));
        }
        enqueueMessengerItem(tempItem);
        throw err;
      }
    },
    [user, isOnline, sendOrResolvePayloadMedia, enqueueMessengerItem, t]
  );

  const handleRetryQueuedMessage = useCallback(
    async (tempId: string) => {
      if (!user || !isOnline) return;
      const item = queuedMessengerMessages.find((q) => q.tempId === tempId);
      const conv = item ? mergedConversations.find((c) => c.id === item.conversationId) : null;
      if (!item || !conv) return;
      try {
        await sendMessengerMessage({
          conversation: conv,
          senderId: item.senderId,
          senderName: item.senderName,
          text: item.text,
          messageType: item.messageType,
          mediaUrl: item.mediaUrl,
          fileName: item.fileName,
          fileSize: item.fileSize,
          fileMime: item.fileMime,
          durationSec: item.durationSec,
          locationLat: item.locationLat,
          locationLng: item.locationLng,
          locationLabel: item.locationLabel,
          locationExpiresAt: item.locationExpiresAt,
          replyToId: item.replyToId,
          replyToText: item.replyToText,
          forwardedFrom: item.forwardedFrom,
        });
        setQueuedMessengerMessages((prev) => {
          const next = prev.filter((q) => q.tempId !== tempId);
          writeOfflineMessageQueue(user.id, next);
          return next;
        });
      } catch {
        // Keep in queue for manual or next reconnect retry
      }
    },
    [user, isOnline, queuedMessengerMessages, mergedConversations]
  );

  // Auto-flush queued Firestore messages when back online
  useEffect(() => {
    if (!isOnline || !isFirebaseVerified || !user?.id || queuedMessengerMessages.length === 0) return;
    let cancelled = false;
    void (async () => {
      const remaining: QueuedMessengerMessage[] = [];
      for (const item of queuedMessengerMessages) {
        const conv = mergedConversations.find((c) => c.id === item.conversationId);
        if (!conv) {
          remaining.push(item);
          continue;
        }
        try {
          await sendMessengerMessage({
            conversation: conv,
            senderId: item.senderId,
            senderName: item.senderName,
            text: item.text,
            messageType: item.messageType,
            mediaUrl: item.mediaUrl,
            fileName: item.fileName,
            fileSize: item.fileSize,
            fileMime: item.fileMime,
            durationSec: item.durationSec,
            locationLat: item.locationLat,
            locationLng: item.locationLng,
            locationLabel: item.locationLabel,
            locationExpiresAt: item.locationExpiresAt,
            replyToId: item.replyToId,
            replyToText: item.replyToText,
            forwardedFrom: item.forwardedFrom,
          });
        } catch {
          remaining.push(item);
        }
      }
      if (!cancelled && remaining.length !== queuedMessengerMessages.length) {
        setQueuedMessengerMessages(remaining);
        writeOfflineMessageQueue(user.id, remaining);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOnline, isFirebaseVerified, user?.id, queuedMessengerMessages.length, mergedConversations]);

  const handleStartDirectChat = useCallback(
    async (targetUser: PlatformUserSummary) => {
      if (!user) return;
      if (isFirebaseSession && isFirebaseVerified) {
        await handleSelectDirectoryPerson({
          uid: targetUser.id,
          displayName: targetUser.name,
          handle: targetUser.handle || `@${targetUser.id.slice(0, 8)}`,
          photoURL: targetUser.logoUrl ?? null,
          role:
            targetUser.role === 'admin'
              ? 'admin'
              : targetUser.accountType === 'restaurantOwner'
                ? 'restaurantOwner'
                : 'user',
          restaurantName: targetUser.businessName ?? null,
          area: targetUser.area || 'Dhaka',
          verified: Boolean(targetUser.verified),
          discoverable: targetUser.discoverable ?? true,
          online: Boolean(targetUser.isOnline || targetUser.wsOnline),
          lastSeen: targetUser.lastSeen || targetUser.lastActiveAt || new Date().toISOString(),
        });
        return;
      }
      if (isAdmin && targetUser.source === 'firebase') {
        await ensureAdminConversationForOwner({
          ownerUid: targetUser.id,
          ownerName: targetUser.name,
          restaurantName: targetUser.businessName || targetUser.name,
          restaurantLogoUrl: targetUser.logoUrl ?? null,
          verificationStatus:
            targetUser.accountType === 'restaurantOwner' ? 'pending' : 'approved',
          welcomeMessage: t('chat.directChatWelcome'),
        });
        navigateTo('chat', { convId: `admin_${targetUser.id}` });
      } else {
        const res = await api.openDirectConversation(targetUser.id);
        await loadUserWorkspaceData();
        navigateTo('chat', { convId: res.conversationId });
      }
    },
    [user, isAdmin, isFirebaseSession, isFirebaseVerified, handleSelectDirectoryPerson, loadUserWorkspaceData, navigateTo, t]
  );

  if (authBooting) {
    return (
      <div className="min-h-screen bg-transparent flex flex-col items-center justify-center gap-3 p-4 text-center">
        <div className="w-10 h-10 rounded-2xl border-4 border-[var(--brand-primary)] border-t-transparent animate-spin" />
        <span className="font-display font-extrabold text-xl text-[var(--brand-text)] block">
          {t('common.appName')}
        </span>
        <p
          className="font-bangla text-xs text-[var(--text-secondary)] max-w-sm px-4 leading-relaxed text-balance"
          style={{ fontFamily: 'var(--font-bn)' }}
        >
          {t('common.tagline')}
        </p>
      </div>
    );
  }

  // Dedicated Auth Screen when explicitly navigating to /login, /signup, or /forgot-password (or redirected from protected route)
  if (activeTab === 'auth' && !user) {
    return (
      <OnboardingAuth
        mode={authMode}
        onModeChange={handleAuthModeChange}
        initialRole={authInitialRole}
        notice={sessionExpiredNotice}
        onBackHome={handleBackToBrowsing}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  const unreadAdminNotifCount =
    user && isAdmin ? adminNotifications.filter((n) => !n.read).length : 0;
  const unreadAdminChatCount = user
    ? isAdmin
      ? adminConversations.reduce((sum, c) => sum + (c.adminUnreadCount || 0), 0)
      : (myAdminConversation?.ownerUnreadCount ?? 0)
    : 0;
  const pendingAdminAppsCount =
    user && isAdmin
      ? restaurantApplications.filter((a) => a.restaurant.verificationStatus === 'pending').length
      : 0;

  const unreadChatCount =
    (user
      ? mergedConversations
          .filter((c) => !c.isArchived)
          .reduce((sum, c) => sum + c.unreadCount, 0)
      : 0) +
    unreadAdminChatCount +
    unreadAdminNotifCount;
  const unreadNotifCount =
    (user ? mergedNotifications.filter((n) => !n.read).length : 0) + unreadAdminNotifCount;
  const activeChatShortcutId =
    user ? resolvedSelectedConvId || mergedConversations[0]?.id || null : null;

  const isDonor = user?.role === 'donor';
  const claimsOrHubTab: TabId = isDonor ? 'donor' : 'claims';

  const desktopPrimaryNavItems: {
    id: TabId;
    label: string;
    icon: typeof Home;
    badge?: number;
    locked?: boolean;
  }[] = [
    { id: 'home', label: t('nav.home'), icon: Home },
    { id: 'discover', label: t('nav.discover'), icon: Compass },
    { id: 'events', label: t('nav.events'), icon: Calendar },
    {
      id: 'chat',
      label: t('nav.chat'),
      icon: MessageCircle,
      badge: unreadChatCount,
      locked: !isLoggedIn,
    },
    {
      id: claimsOrHubTab,
      label: isDonor ? t('nav.donorHub') : t('nav.claims'),
      icon: isDonor ? Store : ClipboardList,
      locked: !isLoggedIn,
    },
    ...(isAdmin
      ? [
          {
            id: 'admin' as TabId,
            label: t('nav.admin'),
            icon: ShieldCheck,
            badge: pendingAdminAppsCount,
          },
        ]
      : []),
  ];

  const mobilePrimaryNavItems: {
    id: TabId;
    label: string;
    icon: typeof Home;
    badge?: number;
    locked?: boolean;
  }[] = [
    { id: 'home', label: t('nav.home'), icon: Home },
    { id: 'discover', label: t('nav.discover'), icon: Compass },
    { id: 'events', label: t('nav.events'), icon: Calendar },
    {
      id: 'chat',
      label: t('nav.chat'),
      icon: MessageCircle,
      badge: unreadChatCount,
      locked: !isLoggedIn,
    },
  ];

  const secondaryDesktopNavItems: { id: TabId; label: string; icon: typeof Home }[] = [
    { id: 'impact', label: t('nav.impactDashboard'), icon: TrendingUp },
    { id: 'volunteers', label: t('nav.volunteerHub'), icon: Users },
    { id: 'leaderboard', label: t('nav.leaderboard'), icon: Award },
    { id: 'clients', label: t('nav.clients'), icon: Handshake },
    { id: 'wedding', label: t('nav.weddingPickup'), icon: Truck },
    { id: 'donate', label: t('nav.donateMoney'), icon: HeartHandshake },
    { id: 'settings', label: t('nav.settings'), icon: Settings },
  ];

  const mobileMoreNavItems: {
    id: TabId;
    label: string;
    icon: typeof Home;
    locked?: boolean;
  }[] = [
    {
      id: claimsOrHubTab,
      label: isDonor ? t('nav.donorHub') : t('nav.claims'),
      icon: isDonor ? Store : ClipboardList,
      locked: !isLoggedIn,
    },
    ...(isAdmin
      ? [
          {
            id: 'admin' as TabId,
            label: t('nav.admin'),
            icon: ShieldCheck,
          },
        ]
      : []),
    ...secondaryDesktopNavItems,
  ];

  const isDesktopMoreActive = secondaryDesktopNavItems.some((item) => item.id === activeTab);
  const isMobileMoreActive = mobileMoreNavItems.some((item) => item.id === activeTab);

  const handleNavClick = (id: TabId) => {
    if (id === 'chat') {
      if (!requireLogin({ type: 'inbox' })) return;
      navigateTo('chat', { convId: null });
      return;
    }
    if (id === 'claims') {
      if (!requireLogin({ type: 'claims' })) return;
      navigateTo('claims');
      return;
    }
    if (id === 'donor') {
      if (!requireLogin({ type: 'donor_hub' })) return;
      navigateTo('donor');
      return;
    }
    if (id === 'events') {
      navigateTo('events', { eventId: null });
      return;
    }
    if (id === 'admin') {
      setSelectedAdminOwnerUid(null);
      navigateTo('admin');
      return;
    }
    navigateTo(id);
  };

  const focusedMapListing =
    mergedListings.find((l) => l.id === mapFocusListingId) ?? mergedListings[0] ?? null;

  const profileAvatarName = user ? user.donorProfile?.businessName || user.name : '';
  const profileAvatarUrl = user?.donorProfile?.logoUrl;

  return (
    <div
      className={`min-h-screen bg-transparent text-[var(--text-primary)] ${
        activeTab === 'chat' ? 'pb-16 md:pb-2' : 'pb-24 md:pb-10'
      }`}
    >
      {/* Reviewer Preview Version Banner (Dismissible) */}
      {!previewBannerDismissed && (
        <div className="bg-[var(--brand-soft)] border-b border-[var(--brand-primary)]/20 px-3 py-1.5 text-xs text-[var(--brand-text)] flex items-center justify-between gap-2 z-40 relative">
          <div className="flex items-center gap-2 min-w-0 mx-auto text-center font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-primary)] animate-pulse shrink-0 hidden sm:inline-block" />
            <span className="truncate">
              {lang === 'bn'
                ? 'প্রিভিউ সংস্করণ: ডেটা যে কোনো সময় রিসেট হতে পারে'
                : 'Preview version: data may be reset'}
            </span>
          </div>
          <button
            type="button"
            onClick={dismissPreviewBanner}
            aria-label={t('common.dismiss')}
            className="text-[var(--brand-text)] hover:opacity-75 p-1 rounded-lg cursor-pointer shrink-0 transition-opacity"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Desktop & Mobile Top Navigation Header — Clickable Brand Logo returns Home from every screen */}
      <header className="sticky top-0 z-30 bg-[var(--bg-header)] backdrop-blur-md border-b border-[var(--border-subtle)]">
        <div className="max-w-6xl mx-auto px-2.5 sm:px-6 min-h-14 py-1.5 sm:py-0 sm:h-14 md:h-16 flex flex-wrap sm:flex-nowrap items-center justify-between gap-x-1.5 gap-y-1.5 sm:gap-4">
          {/* Zone 1: Clickable Brand Logo + Wordmark returning Home from every screen */}
          <button
            type="button"
            onClick={() => navigateTo('home')}
            aria-label={`${t('common.appName')} — ${t('nav.home')}`}
            className="flex items-center gap-1.5 sm:gap-2.5 cursor-pointer hover:opacity-85 transition-opacity group min-w-0 shrink sm:shrink-0"
          >
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] flex items-center justify-center shrink-0 transition-transform group-hover:scale-105">
              <Leaf className="w-4 h-4" aria-hidden="true" />
            </span>
            <span className="font-display text-[15px] sm:text-lg font-extrabold tracking-tight text-[var(--brand-text)] truncate">
              {t('common.appName')}
            </span>
          </button>

          {/* Zone 2: Desktop Navigation with Home, Discover, Events, Inbox, My Claims + More Menu */}
          <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-4 lg:gap-5 text-sm font-medium">
            {desktopPrimaryNavItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={`py-1.5 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors border-b-2 cursor-pointer ${
                    active
                      ? 'border-[var(--brand-primary)] text-[var(--brand-text)] font-semibold'
                      : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>
                    {item.label}
                    {item.badge ? ` (${formatNumber(item.badge)})` : ''}
                  </span>
                  {item.locked && (
                    <Lock className="w-3 h-3 opacity-60 shrink-0" aria-hidden="true" />
                  )}
                </button>
              );
            })}

            {/* More Dropdown on Desktop */}
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setNotifOpen(false);
                  setPaletteOpen(false);
                  setProfileMenuOpen(false);
                  setMoreMenuOpen((o) => !o);
                }}
                aria-expanded={moreMenuOpen}
                className={`py-1.5 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors border-b-2 cursor-pointer ${
                  isDesktopMoreActive
                    ? 'border-[var(--brand-primary)] text-[var(--brand-text)] font-semibold'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <MoreHorizontal className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{t('nav.more')}</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-70 shrink-0" aria-hidden="true" />
              </button>

              {moreMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setMoreMenuOpen(false)}
                  />
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute left-0 mt-2 w-64 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-2xl py-2 z-40"
                  >
                    {secondaryDesktopNavItems.map((item) => {
                      const Icon = item.icon;
                      const active = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleNavClick(item.id)}
                          className={`w-full px-4 py-2.5 text-left text-xs font-semibold flex items-center gap-2.5 cursor-pointer transition-colors ${
                            active
                              ? 'bg-[var(--brand-soft)] text-[var(--brand-text)]'
                              : 'text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
                          }`}
                        >
                          <Icon className="w-4 h-4 text-[var(--brand-text)] shrink-0" aria-hidden="true" />
                          <span className="truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </nav>

          {/* Zone 3: PWA Install + Theme Palette + Language Toggle + Auth Buttons (Guests) or Alerts/Profile Menu (Users) */}
          <div className="flex items-center flex-wrap sm:flex-nowrap justify-end gap-1 sm:gap-2 min-w-0 max-w-full shrink-0">
            <PWAInstallButton variant="header" />
            <ThemePaletteButton
              open={paletteOpen}
              onToggleOpen={() => {
                setNotifOpen(false);
                setProfileMenuOpen(false);
                setMoreMenuOpen(false);
                setPaletteOpen((o) => !o);
              }}
              onClose={() => setPaletteOpen(false)}
            />
            <LanguageToggle onAfterToggle={handleLanguageSynced} />

            {!user ? (
              <div className="flex items-center gap-1 sm:gap-1.5">
                <button
                  type="button"
                  onClick={() => openAuthPage('login')}
                  className="min-h-[44px] sm:min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[var(--text-primary)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5 text-[var(--brand-text)] shrink-0 hidden sm:inline" aria-hidden="true" />
                  <span>{t('gate.loginBtn')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => openAuthPage('signup')}
                  className="min-h-[44px] sm:min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5 shrink-0 hidden sm:inline" aria-hidden="true" />
                  <span>{t('auth.signupTab')}</span>
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleOpenNotifications}
                  aria-label={t('notifications.title')}
                  className="min-h-[44px] min-w-[40px] sm:min-h-[40px] sm:px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[var(--text-primary)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 relative cursor-pointer"
                >
                  <Bell className="w-4 h-4 text-[var(--brand-text)] shrink-0" />
                  {unreadNotifCount > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--brand-accent)] text-[var(--brand-accent-fg)] text-[10px] font-bold flex items-center justify-center tabular-nums">
                      {formatNumber(unreadNotifCount)}
                    </span>
                  )}
                </button>

                {user.role === 'donor' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (isUnapprovedRestaurantOwner) {
                        navigateTo('donor');
                        return;
                      }
                      setEditingListing(null);
                      setListingFormOpen(true);
                    }}
                    aria-label={t('nav.postFood')}
                    className="min-h-[44px] min-w-[40px] sm:min-h-[40px] sm:px-3.5 px-2.5 py-2 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="w-4 h-4 shrink-0" />
                    <span className="hidden sm:inline">{t('nav.postFood')}</span>
                  </button>
                )}

                {/* User Profile Menu with Avatar, Name & Logout */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setNotifOpen(false);
                      setPaletteOpen(false);
                      setMoreMenuOpen(false);
                      setProfileMenuOpen((o) => !o);
                    }}
                    aria-label={t('nav.profileMenu')}
                    aria-expanded={profileMenuOpen}
                    className="min-h-[44px] sm:min-h-[40px] px-1.5 sm:pl-1.5 sm:pr-2 py-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] flex items-center gap-1 sm:gap-2 transition-colors cursor-pointer"
                  >
                    <ShopAvatar
                      name={profileAvatarName}
                      imageUrl={profileAvatarUrl}
                      size="xs"
                    />
                    <span className="hidden sm:inline text-xs font-semibold text-[var(--text-primary)] max-w-[96px] truncate">
                      {user.name}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0 hidden min-[375px]:block sm:block" />
                  </button>

                  {profileMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setProfileMenuOpen(false)}
                      />
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 mt-1.5 w-60 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-2xl py-2 z-40"
                      >
                        <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] flex items-center gap-2.5">
                          <ShopAvatar
                            name={profileAvatarName}
                            imageUrl={profileAvatarUrl}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-[var(--text-primary)] truncate">
                              {profileAvatarName}
                            </p>
                            <p className="text-[11px] text-[var(--text-muted)] truncate">
                              {t(`settings.roles.${user.role}`)} · {user.email || user.phone}
                            </p>
                          </div>
                        </div>

                        <div className="py-1">
                          <button
                            type="button"
                            onClick={() => navigateTo('home')}
                            className="w-full px-4 py-2 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] flex items-center gap-2.5 cursor-pointer"
                          >
                            <Home className="w-3.5 h-3.5 text-[var(--brand-text)]" />
                            {t('nav.home')}
                          </button>
                          <button
                            type="button"
                            onClick={() => navigateTo('events', { eventId: null })}
                            className="w-full px-4 py-2 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] flex items-center gap-2.5 cursor-pointer"
                          >
                            <Calendar className="w-3.5 h-3.5 text-[var(--brand-text)]" />
                            {t('nav.events')}
                          </button>
                          <button
                            type="button"
                            onClick={() => navigateTo('clients')}
                            className="w-full px-4 py-2 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] flex items-center gap-2.5 cursor-pointer"
                          >
                            <Handshake className="w-3.5 h-3.5 text-[var(--brand-text)]" />
                            {t('nav.clients')}
                          </button>
                          <button
                            type="button"
                            onClick={() => navigateTo('wedding')}
                            className="w-full px-4 py-2 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] flex items-center gap-2.5 cursor-pointer"
                          >
                            <Truck className="w-3.5 h-3.5 text-[var(--brand-text)]" />
                            {t('nav.weddingPickup')}
                          </button>
                          <button
                            type="button"
                            onClick={() => navigateTo('donate')}
                            className="w-full px-4 py-2 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] flex items-center gap-2.5 cursor-pointer"
                          >
                            <HeartHandshake className="w-3.5 h-3.5 text-[var(--brand-text)]" />
                            {t('nav.donateMoney')}
                          </button>
                          <button
                            type="button"
                            onClick={() => navigateTo('chat')}
                            className="w-full px-4 py-2 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] flex items-center gap-2.5 cursor-pointer"
                          >
                            <MessageCircle className="w-3.5 h-3.5 text-[var(--brand-text)]" />
                            {t('nav.chat')}
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => navigateTo('admin')}
                              className="w-full px-4 py-2 text-left text-xs font-semibold text-[var(--brand-text)] hover:bg-[var(--bg-subtle)] flex items-center gap-2.5 cursor-pointer"
                            >
                              <ShieldCheck className="w-3.5 h-3.5 text-[var(--brand-text)]" />
                              {t('nav.admin')}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => navigateTo('settings')}
                            className="w-full px-4 py-2 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] flex items-center gap-2.5 cursor-pointer"
                          >
                            <Settings className="w-3.5 h-3.5 text-[var(--brand-text)]" />
                            {t('nav.settings')}
                          </button>
                        </div>

                        <div className="pt-1 border-t border-[var(--border-subtle)]">
                          <button
                            type="button"
                            onClick={handleSignOut}
                            className="w-full px-4 py-2 text-left text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/35 flex items-center gap-2.5 cursor-pointer"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            {t('nav.logout')}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Offline Banner */}
      {!isOnline && (
        <div className="bg-[var(--brand-accent-soft)] border-b border-[var(--border-subtle)] px-4 py-2 text-xs text-[var(--brand-accent-text)] flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>{t('common.offlineBanner')}</span>
        </div>
      )}

      {/* Live Notification Toast */}
      {toast && user && (
        <div className="fixed top-16 inset-x-4 sm:inset-x-auto sm:right-4 z-50 sm:w-full sm:max-w-sm bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl shadow-xl p-4 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-[var(--text-primary)]">{toast.title}</p>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-2">
              {toast.body}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label={t('common.dismiss')}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Notifications Popover Drawer (Authenticated only) */}
      {notifOpen && user && (
        <div className="fixed inset-x-4 top-16 md:left-auto md:right-6 md:w-96 z-40 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              {t('notifications.title')}
            </h3>
            <div className="flex items-center gap-3">
              {isFirebaseSession && isFirebaseVerified ? (
                mergedNotifications.some((n) => !n.read) && (
                  <button
                    type="button"
                    onClick={() => void markAllUserNotificationsRead(user.id)}
                    className="text-xs font-semibold text-[var(--brand-text)] hover:underline cursor-pointer"
                  >
                    {t('notifications.markAllRead')}
                  </button>
                )
              ) : (
                mergedNotifications.some((n) => !n.read) && (
                  <button
                    type="button"
                    onClick={async () => {
                      await api.markAllNotificationsRead().catch(() => {});
                      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
                    }}
                    className="text-xs font-semibold text-[var(--brand-text)] hover:underline cursor-pointer"
                  >
                    {t('notifications.markAllRead')}
                  </button>
                )
              )}
              {isAdmin && unreadAdminNotifCount > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllAdminNotificationsRead(adminNotifications)}
                  className="text-xs font-semibold text-[var(--brand-text)] hover:underline cursor-pointer"
                >
                  {t('admin.markAllReadBtn')}
                </button>
              )}
              <button
                type="button"
                onClick={() => setNotifOpen(false)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                {t('notifications.close')}
              </button>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-[var(--border-subtle)]">
            {isAdmin &&
              adminNotifications.map((n) => {
                const notifTitle =
                  n.type === 'newRestaurantOwner'
                    ? t('admin.notifNewOwner', {
                        restaurant: n.restaurantName,
                        owner: n.ownerName,
                      })
                    : n.type === 'resubmittedRestaurantOwner'
                      ? t('admin.notifResubmitted', { restaurant: n.restaurantName })
                      : t('admin.notifNewMessage', { restaurant: n.restaurantName });

                return (
                  <div
                    key={`admin_${n.id}`}
                    className={`p-3.5 text-xs space-y-1.5 ${
                      !n.read ? 'bg-[var(--brand-soft)]/50' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.read && (
                        <span className="mt-1.5 w-2 h-2 rounded-full bg-[var(--brand-accent)] shrink-0" />
                      )}
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="font-semibold text-[var(--text-primary)] leading-snug">
                          {notifTitle}
                        </p>
                        {n.messagePreview && (
                          <p className="text-[11px] text-[var(--text-secondary)] truncate">
                            {n.messagePreview}
                          </p>
                        )}
                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
                            {formatTime(n.createdAt)}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {n.type === 'newOwnerMessage' && (
                              <button
                                type="button"
                                onClick={() => {
                                  void markAdminNotificationRead(n.id);
                                  setNotifOpen(false);
                                  navigateTo('chat', { convId: `admin_${n.ownerUid}` });
                                }}
                                className="px-2 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[11px] font-semibold text-[var(--text-primary)] cursor-pointer"
                              >
                                {t('nav.chat')}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                void markAdminNotificationRead(n.id);
                                setNotifOpen(false);
                                setSelectedAdminOwnerUid(n.ownerUid);
                                navigateTo('admin');
                              }}
                              className="px-2.5 py-1 rounded-lg bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-[11px] font-semibold cursor-pointer"
                            >
                              {t('admin.reviewBtn')}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

            {mergedNotifications.map((n) => {
              const targetConvId =
                n.conversationId ||
                (typeof n.payload?.conversationId === 'string' && n.payload.conversationId
                  ? n.payload.conversationId
                  : null);
              const linkTab =
                n.linkTab ||
                (typeof n.payload?.linkTab === 'string' && n.payload.linkTab
                  ? n.payload.linkTab
                  : null);
              const displayTitle = lang === 'bn' ? n.titleBn || n.title : n.title;
              const displayBody = lang === 'bn' ? n.bodyBn || n.body : n.body;

              const handleOpenNotification = () => {
                if (isFirebaseSession && isFirebaseVerified && !n.read) {
                  void markUserNotificationRead(user.id, n.id);
                }
                setNotifOpen(false);
                if (targetConvId) {
                  navigateTo('chat', { convId: targetConvId });
                  return;
                }
                switch (linkTab) {
                  case 'discover':
                    navigateTo('discover');
                    break;
                  case 'events':
                    navigateTo('events');
                    break;
                  case 'claims':
                    navigateTo('claims');
                    break;
                  case 'donate':
                    navigateTo('donate');
                    break;
                  case 'inbox':
                    navigateTo('chat');
                    break;
                  case 'donor':
                  case 'post':
                    navigateTo(user.role === 'donor' ? 'donor' : 'settings');
                    break;
                  case 'admin':
                    navigateTo(isAdmin ? 'admin' : 'home');
                    break;
                  case 'account':
                    navigateTo('settings');
                    break;
                  default:
                    break;
                }
              };

              return (
                <div
                  key={n.id}
                  onClick={handleOpenNotification}
                  className={`p-3.5 text-xs flex items-start gap-2.5 cursor-pointer hover:bg-[var(--bg-subtle)]/70 transition-colors ${
                    !n.read ? 'bg-[var(--brand-soft)]/45' : ''
                  }`}
                >
                  <span
                    className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                      !n.read ? 'bg-[var(--brand-accent)]' : 'bg-transparent'
                    }`}
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-[var(--text-primary)] leading-snug">
                        {displayTitle}
                      </p>
                      {n.isStarter && (
                        <span className="px-1.5 py-0.5 rounded-md bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[10px] font-semibold text-[var(--text-muted)] shrink-0">
                          {t('notifications.starterTag')}
                        </span>
                      )}
                    </div>
                    <p className="text-[var(--text-secondary)] leading-snug">{displayBody}</p>
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
                        {formatTime(n.createdAt)}
                      </span>
                      <div
                        className="flex items-center gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {isFirebaseSession && isFirebaseVerified && !n.read && (
                          <button
                            type="button"
                            onClick={() => void markUserNotificationRead(user.id, n.id)}
                            aria-label={t('notifications.markRead')}
                            className="px-2 py-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[10px] font-semibold text-[var(--text-secondary)] inline-flex items-center gap-1 cursor-pointer"
                          >
                            <CheckCheck className="w-3 h-3" />
                            <span>{t('notifications.markRead')}</span>
                          </button>
                        )}
                        {targetConvId && (
                          <button
                            type="button"
                            onClick={() => {
                              if (isFirebaseSession && isFirebaseVerified && !n.read) {
                                void markUserNotificationRead(user.id, n.id);
                              }
                              setNotifOpen(false);
                              navigateTo('chat', { convId: targetConvId });
                            }}
                            className="px-2 py-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[11px] font-semibold text-[var(--brand-text)] cursor-pointer"
                          >
                            {t('nav.chat')}
                          </button>
                        )}
                        {isFirebaseSession && isFirebaseVerified && (
                          <button
                            type="button"
                            onClick={() => void deleteUserNotification(user.id, n.id)}
                            aria-label={t('notifications.delete')}
                            title={t('notifications.delete')}
                            className="p-1 rounded-lg text-[var(--text-muted)] hover:text-red-600 dark:hover:text-red-400 hover:bg-[var(--bg-subtle)] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {mergedNotifications.length === 0 && (!isAdmin || adminNotifications.length === 0) && (
              <p className="p-6 text-center text-xs text-[var(--text-muted)]">
                {t('notifications.empty')}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Main Content Container */}
      <main
        className={
          activeTab === 'chat'
            ? 'max-w-6xl mx-auto px-2 sm:px-6 pt-3 pb-2 h-[calc(100dvh-7.5rem)] md:h-[calc(100dvh-4.75rem)] overflow-hidden min-w-0'
            : 'max-w-6xl mx-auto px-4 sm:px-6 pt-5 space-y-6 min-w-0'
        }
      >
        {activeTab === 'home' && (
          <HomeView
            listings={mergedListings}
            loadingListings={loadingListings}
            summary={homeSummary}
            activeConvId={activeChatShortcutId}
            onBackToActiveChat={
              activeChatShortcutId
                ? () => navigateTo('chat', { convId: activeChatShortcutId })
                : undefined
            }
            onFindFood={() => navigateTo('discover')}
            onFindFlash={() => {
              setFilters((f) => ({ ...f, flashOnly: true }));
              navigateTo('discover');
            }}
            onFindIftar={() => {
              setFilters((f) => ({ ...f, ramadanOnly: true }));
              navigateTo('discover');
            }}
            onDonateFood={handleDonateFoodAction}
            onSelectListing={(l) => {
              setListingDetailDraft(null);
              setSelectedListing(l);
            }}
            onSelectDonorFeed={(donorName) => {
              setSearchQuery(donorName);
              navigateTo('discover');
            }}
            onNavigateClients={() => navigateTo('clients')}
            onNavigateEvents={() => navigateTo('events', { eventId: null })}
            onOpenEventDetail={(eventId) => navigateTo('events', { eventId })}
            onNavigateWedding={() => navigateTo('wedding')}
            onNavigateDonate={() => navigateTo('donate', { donateCause: 'general', donateEventId: null })}
            onNavigateSadaqah={() =>
              navigateTo('donate', { donateCause: 'sadaqah', donateEventId: null })
            }
            onNavigateImpact={() => navigateTo('impact')}
            onNavigateVolunteers={() => navigateTo('volunteers')}
            onNavigateLeaderboard={() => navigateTo('leaderboard')}
          />
        )}

        {activeTab === 'impact' && (
          <ImpactDashboardView
            user={user}
            onNavigateVolunteers={() => navigateTo('volunteers')}
            onNavigateLeaderboard={() => navigateTo('leaderboard')}
            onNavigateDonate={() => navigateTo('donate', { donateCause: 'general', donateEventId: null })}
            onLoginClick={() => openAuthPage('login')}
          />
        )}

        {activeTab === 'volunteers' && (
          <VolunteerHubView user={user} onRequireLogin={requireLogin} />
        )}

        {activeTab === 'leaderboard' && (
          <CommunityLeaderboardView
            user={user}
            onLoginClick={() => openAuthPage('login')}
          />
        )}

        {activeTab === 'clients' && (
          <ClientsView
            user={user}
            onRequireLogin={requireLogin}
            autoOpenPartnerModal={autoOpenPartnerModal}
            onConsumeAutoAction={() => setAutoOpenPartnerModal(false)}
          />
        )}

        {activeTab === 'events' && (
          <EventsView
            user={user}
            initialEventId={selectedEventId}
            autoRegisterEventId={autoRegisterEventId}
            onConsumeAutoAction={() => setAutoRegisterEventId(null)}
            onSelectEventId={handleSelectEventId}
            onDonateToEvent={(eventId) =>
              navigateTo('donate', { donateCause: 'events', donateEventId: eventId })
            }
            onRequireLogin={requireLogin}
          />
        )}

        {activeTab === 'wedding' && (
          <WeddingPickupView
            user={user}
            coords={coords}
            refreshTrigger={weddingRefreshTick}
            restoredDraft={restoredWeddingDraft}
            onConsumeDraft={() => setRestoredWeddingDraft(null)}
            onOpenChat={(convId) => navigateTo('chat', { convId })}
            onRequireLogin={requireLogin}
            onLoginClick={() => openAuthPage('login')}
            onSignupClick={() => openAuthPage('signup')}
          />
        )}

        {activeTab === 'donate' && (
          <DonateMoneyView
            user={user}
            preselectedCause={donateContext.cause}
            preselectedEventId={donateContext.eventId}
            restoredDraft={restoredDonateDraft}
            onConsumeDraft={() => setRestoredDonateDraft(null)}
            onNavigateEvents={() => navigateTo('events', { eventId: null })}
            onNavigateWedding={() => navigateTo('wedding')}
            onNavigateClients={() => navigateTo('clients')}
            onRequireLogin={requireLogin}
            onLoginClick={() => openAuthPage('login')}
          />
        )}

        {activeTab === 'discover' && (
          <div className="space-y-5">
            {/* Search + Feed/Map Toggle + Filter Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <div className="relative flex-1 min-w-0 max-w-xl">
                <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('feed.searchPlaceholder')}
                  className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {user?.role === 'donor' && (
                  <button
                    type="button"
                    onClick={handleOpenNotifications}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Bell className="w-4 h-4 text-[var(--brand-text)] shrink-0" />
                    {t('nav.alerts')} {unreadNotifCount > 0 ? `(${formatNumber(unreadNotifCount)})` : ''}
                  </button>
                )}

                {/* Feed / Map Switcher */}
                <div className="inline-flex rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1">
                  <button
                    type="button"
                    onClick={() => setDiscoverMode('feed')}
                    className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                      discoverMode === 'feed'
                        ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{t('feed.feedView')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscoverMode('map')}
                    className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                      discoverMode === 'map'
                        ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{t('feed.mapView')}</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setFilterOpen(true)}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[var(--text-primary)] text-sm font-semibold inline-flex items-center gap-2 shrink-0 whitespace-nowrap cursor-pointer"
                >
                  <SlidersHorizontal className="w-4 h-4 text-[var(--brand-text)] shrink-0" />
                  <span>{t('feed.filters')}</span>
                  {(filters.dietary.length > 0 ||
                    filters.pickupWithinMin !== null ||
                    filters.flashOnly ||
                    filters.ramadanOnly) && (
                    <span className="text-xs font-mono text-[var(--brand-accent-text)]">
                      ·{' '}
                      {formatNumber(
                        filters.dietary.length +
                          (filters.pickupWithinMin ? 1 : 0) +
                          (filters.flashOnly ? 1 : 0) +
                          (filters.ramadanOnly ? 1 : 0)
                      )}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Category Segmented Tabs + Quick Flash/Ramadan Toggles */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {(['all', 'cooked', 'bakery', 'produce', 'packaged'] as const).map((catId) => {
                const active = filters.category === catId;
                return (
                  <button
                    key={catId}
                    type="button"
                    onClick={() => setFilters((f) => ({ ...f, category: catId }))}
                    className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      active
                        ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]'
                        : 'bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    {t(`feed.categories.${catId}`)}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setFilters((f) => ({ ...f, flashOnly: !f.flashOnly }))}
                className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  filters.flashOnly
                    ? 'bg-amber-600 text-white'
                    : 'bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                }`}
              >
                <Flame className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{t('flash.filterToggle')}</span>
              </button>
              <button
                type="button"
                onClick={() => setFilters((f) => ({ ...f, ramadanOnly: !f.ramadanOnly }))}
                className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  filters.ramadanOnly
                    ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]'
                    : 'bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                }`}
              >
                <MoonStar className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{t('ramadan.filterToggle')}</span>
              </button>
              <span className="ml-auto text-xs text-[var(--canvas-text-muted)] whitespace-nowrap pl-3 tabular-nums">
                {t('feed.nearbyCount', { count: mergedListings.length, radius: filters.radiusKm })}
              </span>
            </div>

            {/* Listings Feed or Map View */}
            {loadingListings && mergedListings.length === 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div
                    key={n}
                    className="h-80 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] animate-pulse"
                  />
                ))}
              </div>
            ) : mergedListings.length === 0 ? (
              <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-12 text-center space-y-3">
                <p className="text-base font-bold text-[var(--text-primary)]">
                  {t('feed.noListings')}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setFilters({
                      radiusKm: 20,
                      category: 'all',
                      dietary: [],
                      pickupWithinMin: null,
                      flashOnly: false,
                      ramadanOnly: false,
                    });
                  }}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-sm font-semibold cursor-pointer"
                >
                  {t('feed.resetFilters')}
                </button>
              </div>
            ) : discoverMode === 'map' && focusedMapListing ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                <div className="lg:col-span-7 min-w-0 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] p-4 sm:p-5 space-y-3">
                  {!user && (
                    <div className="px-3.5 py-2 rounded-xl bg-[var(--brand-soft)] border border-[var(--border-subtle)] text-xs text-[var(--brand-text)] font-medium flex items-center gap-2">
                      <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{t('feed.guestMapNote')}</span>
                    </div>
                  )}

                  <StaticOsmMap
                    lat={focusedMapListing.lat}
                    lng={focusedMapListing.lng}
                    label={`${focusedMapListing.donorName} · ${formatArea(focusedMapListing.donorArea)}`}
                    address={
                      user
                        ? formatAddress(focusedMapListing.pickupAddress, focusedMapListing.pickupAddressBn)
                        : formatArea(focusedMapListing.donorArea)
                    }
                    heightClass="h-72 sm:h-96"
                  />

                  <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <FoodImage
                        src={focusedMapListing.photoUrls[0]}
                        alt={focusedMapListing.title}
                        className="w-16 h-16 rounded-xl shrink-0"
                      />
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                          <span className="truncate font-semibold text-[var(--text-secondary)]">
                            {focusedMapListing.donorName}
                          </span>
                          {focusedMapListing.donorVerified && (
                            <BadgeCheck className="w-3.5 h-3.5 text-[var(--brand-text)] shrink-0" />
                          )}
                          <span>· {formatArea(focusedMapListing.donorArea)}</span>
                        </div>
                        <p className="font-display text-sm sm:text-base font-bold text-[var(--text-primary)] truncate">
                          {focusedMapListing.title}
                        </p>
                        <p className="text-xs text-[var(--brand-accent-text)] font-medium inline-flex items-center gap-1.5 tabular-nums">
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {formatTimeLeft(focusedMapListing.pickupEnd)} ·{' '}
                            {formatNumber(focusedMapListing.remainingQuantity)}{' '}
                            {formatUnit(focusedMapListing.unit)} {t('feed.left')}
                          </span>
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setListingDetailDraft(null);
                        setSelectedListing(focusedMapListing);
                      }}
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {t('events.viewDetails')}
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-5 min-w-0 space-y-2.5 max-h-[540px] overflow-y-auto pr-1">
                  {mergedListings.map((item) => {
                    const isFocused = item.id === focusedMapListing.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setMapFocusListingId(item.id)}
                        className={`w-full p-3.5 rounded-2xl border text-left flex items-center gap-3 transition-colors cursor-pointer ${
                          isFocused
                            ? 'bg-[var(--brand-soft)] border-[var(--brand-primary)]'
                            : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:border-[var(--brand-primary)]/50'
                        }`}
                      >
                        <FoodImage
                          src={item.photoUrls[0]}
                          alt={item.title}
                          className="w-14 h-14 rounded-xl shrink-0"
                        />
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                            {item.title}
                          </p>
                          <p className="text-xs text-[var(--text-muted)] truncate">
                            {item.donorName} · {formatArea(item.donorArea)}
                            {item.distanceKm !== undefined ? ` · ${formatNumber(item.distanceKm)} ${t('feed.km')}` : ''}
                          </p>
                          <p className="text-[11px] font-semibold text-[var(--brand-text)] tabular-nums">
                            {formatNumber(item.remainingQuantity)} {formatUnit(item.unit)} {t('feed.left')}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {mergedListings.map((listing) => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    onSelect={(l) => {
                      setListingDetailDraft(null);
                      setSelectedListing(l);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'claims' && (
          <RequireAuth
            action={{ type: 'claims' }}
            onLoginClick={() => openAuthPage('login')}
            onSignupClick={() => openAuthPage('signup')}
            onContinueBrowsing={() => navigateTo('home')}
          >
            <ClaimsView
              claims={claims}
              quota={quota}
              onOpenChat={(convId) => navigateTo('chat', { convId })}
              onShowPickupCode={(claim) => setPickupModalState({ claim, mode: 'recipient' })}
              onCancelClaim={handleCancelClaim}
              onBrowseFeed={() => navigateTo('discover')}
              onReviewSubmitted={() => {
                loadFeed();
                loadUserWorkspaceData();
              }}
            />
          </RequireAuth>
        )}

        {activeTab === 'donor' && (
          <RequireAuth
            action={{ type: 'donor_hub' }}
            onLoginClick={() => openAuthPage('login')}
            onSignupClick={() => openAuthPage('signup', undefined, 'donor')}
            onContinueBrowsing={() => navigateTo('home')}
          >
            <DonorDashboard
              listings={donorListings}
              incomingClaims={donorClaims}
              onCreateListing={() => {
                if (isUnapprovedRestaurantOwner) return;
                setEditingListing(null);
                setListingFormOpen(true);
              }}
              onEditListing={(l) => {
                setEditingListing(l);
                setListingFormOpen(true);
              }}
              onOpenChat={(convId) => navigateTo('chat', { convId })}
              onVerifyPickup={(claim) => setPickupModalState({ claim, mode: 'donor' })}
              onRefresh={() => {
                loadFeed();
                loadHomeSummary();
                loadUserWorkspaceData();
              }}
            />
          </RequireAuth>
        )}

        {activeTab === 'chat' && (
          <RequireAuth
            action={{ type: 'inbox' }}
            onLoginClick={() => openAuthPage('login')}
            onSignupClick={() => openAuthPage('signup')}
            onContinueBrowsing={() => navigateTo('home')}
          >
            {user && (
              <ChatView
                user={user}
                conversations={mergedConversations}
                selectedConversationId={resolvedSelectedConvId}
                wsSocket={wsSocket}
                wsStatus={wsStatus}
                isOnline={isOnline}
                typingByConv={typingByConv}
                isAdmin={isAdmin}
                adminNotifications={adminNotifications}
                adminConversations={adminConversations}
                myAdminConversation={myAdminConversation}
                adminDirectoryUsers={directoryUsers}
                directoryEntries={directoryEntries}
                directoryHasMore={directoryHasMore}
                onLoadMoreDirectory={() => setDirectoryLimit((n) => n + 30)}
                blockedUids={blockedUids}
                firestoreMessages={firestoreMessages}
                hasMoreMessages={hasMoreMessages}
                loadingMoreMessages={loadingMoreMessages}
                onLoadOlderMessages={() => {
                  if (loadingMoreMessages) return;
                  setLoadingMoreMessages(true);
                  setMsgPageSize((n) => n + 30);
                }}
                onSelectDirectoryPerson={handleSelectDirectoryPerson}
                onSendFirestoreMessage={handleSendFirestoreMessage}
                queuedMessengerMessages={queuedMessengerMessages}
                onRetryQueuedMessage={handleRetryQueuedMessage}
                onTypingFirestore={(conv, isTyping) => {
                  if (user.id && !conv.isDemo) {
                    void setMessengerTyping(conv.id, user.id, isTyping);
                  }
                }}
                onReactFirestore={(conv, msg, emoji) =>
                  toggleMessengerReaction(conv.id, msg, user.id, emoji)
                }
                onDeleteMessageFirestore={(convId, msgId) =>
                  deleteMessageForMe(convId, msgId, user.id)
                }
                onForwardFirestore={(targetConvs, msgs) => {
                  const senderName =
                    user.accountType === 'restaurantOwner'
                      ? user.restaurant?.restaurantName || user.donorProfile?.businessName || user.name
                      : user.name;
                  return Promise.all(
                    msgs.map((msg) =>
                      forwardMessengerMessage({
                        targets: targetConvs,
                        sourceMessage: msg,
                        senderId: user.id,
                        senderName,
                        forwardedFromLabel: msg.senderName || senderName,
                      })
                    )
                  ).then(() => undefined);
                }}
                onToggleMuteConv={(conv, muted) =>
                  toggleConversationMute(conv.id, user.id, muted)
                }
                onToggleArchiveConv={(conv, archived) =>
                  toggleConversationArchive(conv.id, user.id, archived)
                }
                onDeleteConvForMe={(conv) => deleteConversationForMe(conv, user.id)}
                onToggleBlockPeer={(peerUid, peerName, peerHandle, currentlyBlocked) =>
                  currentlyBlocked
                    ? unblockUserInFirestore(user.id, peerUid)
                    : blockUserInFirestore(user.id, peerUid, peerName, peerHandle)
                }
                onReportPeer={(peerUid, peerName, convId, reason, details) =>
                  reportUserInFirestore({
                    reporterId: user.id,
                    targetUserId: peerUid,
                    targetName: peerName,
                    conversationId: convId,
                    reason,
                    details,
                  })
                }
                onStartDirectChat={user ? handleStartDirectChat : undefined}
                onReviewApplication={(ownerUid) => {
                  setSelectedAdminOwnerUid(ownerUid);
                  navigateTo('admin');
                }}
                onMarkAdminNotificationRead={(id) => {
                  void markAdminNotificationRead(id);
                }}
                onMarkAllAdminNotificationsRead={() => {
                  void markAllAdminNotificationsRead(adminNotifications);
                }}
                onSelectConversation={handleSelectConversation}
                onRefreshConversations={loadUserWorkspaceData}
                onOpenPickupCode={(claim, mode) => setPickupModalState({ claim, mode })}
              />
            )}
          </RequireAuth>
        )}

        {activeTab === 'admin' && (
          <RequireAuth
            action={{ type: 'account' }}
            onLoginClick={() => openAuthPage('login')}
            onSignupClick={() => openAuthPage('signup')}
            onContinueBrowsing={() => navigateTo('home')}
          >
            <AdminApplicationsView
              applications={restaurantApplications}
              selectedOwnerUid={selectedAdminOwnerUid}
              onSelectOwnerUid={setSelectedAdminOwnerUid}
              onMessageOwner={(conversationId) =>
                navigateTo('chat', { convId: conversationId })
              }
              onGoBackHome={() => navigateTo('home')}
            />
          </RequireAuth>
        )}

        {activeTab === 'settings' && (
          <ProfileSettingsView
            user={user}
            onUserUpdated={updateUser}
            onSwitchSession={handleAuthenticated}
            onSignOut={handleSignOut}
            blockedList={blockedList}
            onUnblockUser={
              user && isFirebaseSession && isFirebaseVerified
                ? (targetUid) => unblockUserInFirestore(user.id, targetUid)
                : undefined
            }
            onNavigateDonate={() => navigateTo('donate', { donateCause: 'general', donateEventId: null })}
            onNavigateImpact={() => navigateTo('impact')}
            onNavigateVolunteers={() => navigateTo('volunteers')}
            onNavigateLeaderboard={() => navigateTo('leaderboard')}
            onNavigateAdmin={isAdmin ? () => navigateTo('admin') : undefined}
            onOpenAdminChat={
              !isAdmin && (user?.accountType === 'restaurantOwner' || Boolean(myAdminConversation))
                ? () => navigateTo('chat', { convId: `admin_${user!.id}` })
                : undefined
            }
            onLoginClick={() => openAuthPage('login')}
            onSignupClick={() => openAuthPage('signup')}
          />
        )}
      </main>

      {/* Mobile "More" Drawer Sheet */}
      {moreMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-xs"
          onClick={() => setMoreMenuOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-[var(--bg-surface)] rounded-t-3xl border-t border-[var(--border-subtle)] p-5 pb-24 max-h-[85vh] overflow-y-auto space-y-2 shadow-2xl"
          >
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <span className="font-display text-base font-bold text-[var(--text-primary)]">
                {t('nav.more')}
              </span>
              <button
                type="button"
                onClick={() => setMoreMenuOpen(false)}
                aria-label={t('common.close')}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[var(--text-muted)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-1.5 pt-1">
              {mobileMoreNavItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full min-h-[48px] px-4 py-2.5 rounded-xl flex items-center justify-between gap-3 text-sm font-semibold transition-colors cursor-pointer ${
                      active
                        ? 'bg-[var(--brand-soft)] text-[var(--brand-text)]'
                        : 'text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    <span className="inline-flex items-center gap-3">
                      <Icon className="w-4 h-4 text-[var(--brand-text)] shrink-0" aria-hidden="true" />
                      <span>{item.label}</span>
                    </span>
                    {item.locked && (
                      <Lock className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" aria-hidden="true" />
                    )}
                  </button>
                );
              })}

              <div className="pt-2">
                <PWAInstallButton variant="button" className="w-full justify-center min-h-[46px] rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors shadow-xs" />
              </div>

              {!user && (
                <div className="pt-2 mt-2 border-t border-[var(--border-subtle)] grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => openAuthPage('login')}
                    className="min-h-[44px] px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-primary)] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <LogIn className="w-4 h-4 text-[var(--brand-text)]" aria-hidden="true" />
                    {t('gate.loginBtn')}
                  </button>
                  <button
                    type="button"
                    onClick={() => openAuthPage('signup')}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" aria-hidden="true" />
                    {t('gate.signupBtn')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Fixed Bottom Tab Bar: Home, Discover, Events, Inbox, More */}
      <nav
        aria-label="Primary mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--bg-header)] backdrop-blur-md border-t border-[var(--border-subtle)] grid grid-cols-5 min-h-16 pt-1 pb-safe"
      >
        {mobilePrimaryNavItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              className={`min-w-0 px-0.5 flex flex-col items-center justify-center relative transition-colors cursor-pointer ${
                active ? 'text-[var(--brand-text)]' : 'text-[var(--text-muted)]'
              }`}
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 inset-x-3 h-0.5 rounded-full bg-[var(--brand-primary)]"
                />
              )}
              <div className="relative">
                <Icon className="w-5 h-5" />
                {item.badge && item.badge > 0 ? (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-[var(--brand-accent)] text-[var(--brand-accent-fg)] text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {formatNumber(item.badge)}
                  </span>
                ) : item.locked ? (
                  <Lock className="w-2.5 h-2.5 absolute -top-1 -right-2 text-[var(--text-muted)]" aria-hidden="true" />
                ) : null}
              </div>
              <span className="text-[10px] font-semibold mt-1 truncate max-w-full px-0.5">
                {item.label}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setMoreMenuOpen((o) => !o)}
          className={`min-w-0 px-0.5 flex flex-col items-center justify-center relative transition-colors cursor-pointer ${
            isMobileMoreActive || moreMenuOpen ? 'text-[var(--brand-text)]' : 'text-[var(--text-muted)]'
          }`}
        >
          {isMobileMoreActive && (
            <span
              aria-hidden="true"
              className="absolute top-0 inset-x-3 h-0.5 rounded-full bg-[var(--brand-primary)]"
            />
          )}
          <MoreHorizontal className="w-5 h-5" />
          <span className="text-[10px] font-semibold mt-1 truncate max-w-full px-0.5">
            {t('nav.more')}
          </span>
        </button>
      </nav>

      {/* Modals & Sheets */}
      <FilterSheet
        open={filterOpen}
        filters={filters}
        onChange={setFilters}
        onClose={() => setFilterOpen(false)}
      />

      <ListingDetailModal
        listing={selectedListing}
        user={user}
        quota={quota}
        initialDraft={listingDetailDraft}
        onClose={() => {
          setSelectedListing(null);
          setListingDetailDraft(null);
        }}
        onClaimCreated={handleClaimCreated}
        onOpenShopChat={handleOpenShopChat}
        onRequireLogin={(action) => {
          setSelectedListing(null);
          requireLogin(action);
        }}
      />

      {user && (
        <ListingFormModal
          key={editingListing?.id ?? (listingFormOpen ? 'new' : 'closed')}
          open={listingFormOpen}
          editingListing={editingListing}
          user={user}
          onClose={() => {
            setListingFormOpen(false);
            setEditingListing(null);
          }}
          onRequestWeddingPickup={() => navigateTo('wedding')}
          onSaved={() => {
            loadFeed();
            loadHomeSummary();
            loadUserWorkspaceData();
          }}
        />
      )}

      <PickupCodeModal
        claim={pickupModalState?.claim ?? null}
        mode={pickupModalState?.mode ?? 'recipient'}
        onClose={() => setPickupModalState(null)}
        onConfirmCode={handleVerifyPickupCode}
      />

      <LoginPromptModal
        open={loginPrompt.open}
        action={loginPrompt.action}
        onLogin={() => openAuthPage('login', loginPrompt.action ?? undefined)}
        onSignup={() => openAuthPage('signup', loginPrompt.action ?? undefined)}
        onClose={() => {
          clearPendingAction();
          closeLoginPrompt();
        }}
      />
    </div>
  );
}
