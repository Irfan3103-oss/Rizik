import type {
  AttendanceStatus,
  AuthSession,
  CallKind,
  CallOutcome,
  ChatMessage,
  Claim,
  CommunityEvent,
  Conversation,
  DonationCause,
  DonationFrequency,
  DonationRecord,
  DonationSummary,
  DonorReviewsResponse,
  EventRegistration,
  HomeSummary,
  ImpactDashboardData,
  LeaderboardData,
  Listing,
  MessageReaction,
  MessageType,
  NotificationItem,
  Partner,
  PartnerApplication,
  PartnerCategory,
  PaymentMethodId,
  PlatformUserSummary,
  Testimonial,
  User,
  VolunteerRole,
  VolunteerShift,
  WeddingPickupRequest,
  WeddingPickupStatus,
} from '../types';
import { auth } from '../firebase';

const TOKEN_KEY = 'rizik_token';
const FEED_CACHE_KEY = 'rizik_feed_cache';
const CHAT_QUEUE_KEY = 'rizik_chat_queue';

const LEGACY_TOKEN_KEY_1 = 'aharforall_token';
const LEGACY_FEED_CACHE_KEY_1 = 'aharforall_feed_cache';
const LEGACY_CHAT_QUEUE_KEY_1 = 'aharforall_chat_queue';

const LEGACY_TOKEN_KEY_2 = 'nourishloop_token';
const LEGACY_FEED_CACHE_KEY_2 = 'nourishloop_feed_cache';
const LEGACY_CHAT_QUEUE_KEY_2 = 'nourishloop_chat_queue';

export function getStoredToken(): string | null {
  return (
    localStorage.getItem(TOKEN_KEY) ||
    localStorage.getItem(LEGACY_TOKEN_KEY_1) ||
    localStorage.getItem(LEGACY_TOKEN_KEY_2)
  );
}

export function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY_1);
    localStorage.removeItem(LEGACY_TOKEN_KEY_2);
  }
}

export function cacheFeed(listings: Listing[]) {
  try {
    localStorage.setItem(FEED_CACHE_KEY, JSON.stringify({ listings, cachedAt: Date.now() }));
  } catch {
    // Ignore storage quota errors
  }
}

export function getCachedFeed(): { listings: Listing[]; cachedAt: number } | null {
  try {
    const raw =
      localStorage.getItem(FEED_CACHE_KEY) ||
      localStorage.getItem(LEGACY_FEED_CACHE_KEY_1) ||
      localStorage.getItem(LEGACY_FEED_CACHE_KEY_2);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export interface QueuedChatMessage {
  clientTempId: string;
  conversationId: string;
  senderId: string;
  text: string;
  imageUrl?: string | null;
  sentAt: string;
}

export function getQueuedMessages(): QueuedChatMessage[] {
  try {
    const raw =
      localStorage.getItem(CHAT_QUEUE_KEY) ||
      localStorage.getItem(LEGACY_CHAT_QUEUE_KEY_1) ||
      localStorage.getItem(LEGACY_CHAT_QUEUE_KEY_2);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveQueuedMessages(queue: QueuedChatMessage[]) {
  try {
    localStorage.setItem(CHAT_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Ignore
  }
}

export async function getAuthToken(forceRefresh = false): Promise<{ token: string | null; isFirebase: boolean }> {
  const stored = getStoredToken();
  if (stored) {
    return { token: stored, isFirebase: false };
  }
  const fbUser = auth.currentUser;
  if (fbUser) {
    try {
      const idToken = await fbUser.getIdToken(forceRefresh);
      return { token: `fb:${idToken}`, isFirebase: true };
    } catch {
      return { token: null, isFirebase: true };
    }
  }
  return { token: null, isFirebase: false };
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const { token, isFirebase } = await getAuthToken(false);
  const makeHeaders = (t: string | null): Record<string, string> => {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    };
    if (t) h['Authorization'] = `Bearer ${t}`;
    return h;
  };

  let res = await fetch(url, { ...options, headers: makeHeaders(token) });
  if (res.status === 401 && isFirebase) {
    const refreshed = await getAuthToken(true);
    if (refreshed.token) {
      res = await fetch(url, { ...options, headers: makeHeaders(refreshed.token) });
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token && !isFirebase && url !== '/api/auth/me') {
      window.dispatchEvent(new CustomEvent('rizik:unauthorized'));
      window.dispatchEvent(new CustomEvent('aharforall:unauthorized'));
    }
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  login: (identifier: string, password: string) =>
    request<AuthSession>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    }),

  register: (payload: {
    name: string;
    identifier: string;
    password: string;
    role: 'donor' | 'recipient';
    area: string;
    organizationName?: string;
    businessName?: string;
    address?: string;
    hours?: string;
    language?: 'en' | 'bn';
  }) =>
    request<AuthSession>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  forgotPassword: (identifier: string) =>
    request<{ message: string; devOtpHint: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ identifier }),
    }),

  resetPassword: (payload: { identifier: string; code: string; newPassword: string }) =>
    request<{ ok: boolean }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  requestOtp: (identifier: string) =>
    request<{ message: string; devOtpHint: string }>('/api/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ identifier }),
    }),

  verifyOtp: (payload: {
    identifier: string;
    code: string;
    role: 'donor' | 'recipient';
    name?: string;
    area?: string;
    organizationName?: string;
    businessName?: string;
    address?: string;
    hours?: string;
  }) =>
    request<AuthSession>('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getDemoAccounts: () =>
    request<{
      accounts: {
        id: string;
        role: string;
        name: string;
        area: string;
        organization_name?: string | null;
        business_name?: string | null;
        verification_status?: string | null;
      }[];
    }>('/api/auth/demo-accounts'),

  demoLogin: (userId: string) =>
    request<AuthSession>('/api/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),

  getMe: () => request<{ user: User }>('/api/auth/me'),

  updateProfile: (payload: Partial<User> & { businessName?: string; address?: string; hours?: string }) =>
    request<{ user: User }>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  uploadImage: (dataUrl: string) =>
    request<{ url: string }>('/api/upload', {
      method: 'POST',
      body: JSON.stringify({ dataUrl }),
    }),

  uploadAudio: (dataUrl: string) =>
    request<{ url: string }>('/api/upload-audio', {
      method: 'POST',
      body: JSON.stringify({ dataUrl }),
    }),

  uploadFile: async (
    payload: { dataUrl: string; fileName: string; fileSize: number; fileMime: string },
    onProgress?: (pct: number) => void
  ) => {
    const { token } = await getAuthToken(false);
    return new Promise<{ url: string; fileName: string; fileSize: number; fileMime: string }>(
      (resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload-file');
        xhr.setRequestHeader('Content-Type', 'application/json');
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable && onProgress) {
            onProgress(Math.min(99, Math.round((ev.loaded / ev.total) * 100)));
          }
        };
        xhr.onload = () => {
          onProgress?.(100);
          try {
            const parsed = JSON.parse(xhr.responseText || '{}');
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(parsed);
            } else {
              reject(new Error(parsed.error || `Upload failed (${xhr.status})`));
            }
          } catch {
            reject(new Error('Upload failed'));
          }
        };
        xhr.onerror = () => reject(new Error('Network error during file upload'));
        xhr.send(JSON.stringify(payload));
      }
    );
  },

  getListings: (params: {
    lat?: number;
    lng?: number;
    radiusKm?: number;
    category?: string;
    dietary?: string[];
    pickupWithinMin?: number | null;
    search?: string;
    donorId?: string;
    includeAll?: boolean;
    flashOnly?: boolean;
    ramadanOnly?: boolean;
  }) => {
    const qs = new URLSearchParams();
    if (params.lat !== undefined) qs.set('lat', String(params.lat));
    if (params.lng !== undefined) qs.set('lng', String(params.lng));
    if (params.radiusKm !== undefined) qs.set('radiusKm', String(params.radiusKm));
    if (params.category && params.category !== 'all') qs.set('category', params.category);
    if (params.dietary && params.dietary.length > 0) qs.set('dietary', params.dietary.join(','));
    if (params.pickupWithinMin) qs.set('pickupWithinMin', String(params.pickupWithinMin));
    if (params.search) qs.set('search', params.search);
    if (params.donorId) qs.set('donorId', params.donorId);
    if (params.includeAll) qs.set('includeAll', 'true');
    if (params.flashOnly) qs.set('flashOnly', 'true');
    if (params.ramadanOnly) qs.set('ramadanOnly', 'true');
    return request<{ listings: Listing[] }>(`/api/listings?${qs.toString()}`);
  },

  createListing: (payload: Record<string, unknown>) =>
    request<{ id: string }>('/api/listings', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateListing: (id: string, payload: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/api/listings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteListing: (id: string) =>
    request<{ ok: boolean }>(`/api/listings/${id}`, {
      method: 'DELETE',
    }),

  getClaims: (scope: 'recipient' | 'donor') =>
    request<{ claims: Claim[]; quota: { usedToday: number; dailyLimit: number } }>(
      `/api/claims?scope=${scope}`
    ),

  createClaim: (listingId: string, quantityClaimed: number, notes?: string) =>
    request<{ claimId: string; conversationId: string; pickupCode: string }>('/api/claims', {
      method: 'POST',
      body: JSON.stringify({ listingId, quantityClaimed, notes }),
    }),

  updateClaimStatus: (
    claimId: string,
    payload: { status: string; pickupCode?: string; cancelReason?: string; handoverMethod?: 'qr' | 'manual' }
  ) =>
    request<{ ok: boolean; status: string }>(`/api/claims/${claimId}/status`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  getConversations: () => request<{ conversations: Conversation[] }>('/api/conversations'),

  getUsers: () => request<{ users: PlatformUserSummary[] }>('/api/users'),

  getAdminUsers: () => request<{ users: PlatformUserSummary[] }>('/api/admin/users'),

  openDirectConversation: (targetUserId: string) =>
    request<{ conversationId: string }>('/api/conversations/direct', {
      method: 'POST',
      body: JSON.stringify({ targetUserId }),
    }),

  openShopConversation: (donorId: string, listingId?: string) =>
    request<{ conversationId: string }>('/api/conversations/with-donor', {
      method: 'POST',
      body: JSON.stringify({ donorId, listingId }),
    }),

  getMessages: (conversationId: string) =>
    request<{ messages: ChatMessage[] }>(`/api/conversations/${conversationId}/messages`),

  markConversationRead: (conversationId: string) =>
    request<{ ok: boolean }>(`/api/conversations/${conversationId}/read`, { method: 'POST' }),

  sendMessage: (
    conversationId: string,
    payload: {
      text?: string;
      imageUrl?: string | null;
      audioUrl?: string | null;
      messageType?: MessageType;
      durationSec?: number | null;
      callType?: CallKind | null;
      callStatus?: CallOutcome | null;
      fileUrl?: string | null;
      fileName?: string | null;
      fileSize?: number | null;
      fileMime?: string | null;
      locationLat?: number | null;
      locationLng?: number | null;
      locationLabel?: string | null;
      locationExpiresAt?: string | null;
      isForwarded?: boolean;
      replyToId?: string | null;
      replyToText?: string | null;
      replyToSenderId?: string | null;
      clientTempId?: string;
    }
  ) =>
    request<{ message: ChatMessage }>(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteMessage: (messageId: string) =>
    request<{ ok: boolean }>(`/api/messages/${messageId}`, { method: 'DELETE' }),

  reactToMessage: (messageId: string, emoji: string) =>
    request<{ messageId: string; reactions: MessageReaction[] }>(
      `/api/messages/${messageId}/react`,
      {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }
    ),

  submitReport: (payload: {
    targetType: 'listing' | 'user';
    targetId: string;
    reason: string;
    details?: string;
  }) =>
    request<{ id: string; message: string }>('/api/reports', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  toggleBlock: (targetUserId: string, unblock = false) =>
    request<{ ok: boolean; blocked: boolean }>('/api/blocks', {
      method: 'POST',
      body: JSON.stringify({ targetUserId, unblock }),
    }),

  getNotifications: () => request<{ notifications: NotificationItem[] }>('/api/notifications'),

  markAllNotificationsRead: () =>
    request<{ ok: boolean }>('/api/notifications/read-all', { method: 'POST' }),

  translateMessage: (text: string, targetLang: 'en' | 'bn') =>
    request<{ translated: string }>('/api/translate', {
      method: 'POST',
      body: JSON.stringify({ text, targetLang }),
    }),

  getHomeSummary: () => request<HomeSummary>('/api/home-summary'),

  // --- Partners & Testimonials ---
  getPartners: () =>
    request<{
      partners: Partner[];
      testimonials: Testimonial[];
      stats: {
        partnersJoined: number;
        mealsDelivered: number;
        familiesHelped: number;
        eventsHeld: number;
      };
    }>('/api/partners'),

  applyPartner: (payload: {
    organizationName: string;
    category: PartnerCategory;
    contactPerson: string;
    contactInfo: string;
    area: string;
    message?: string;
  }) =>
    request<{ application: PartnerApplication }>('/api/partners/apply', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // --- Food Distribution Events ---
  getEvents: (params?: { status?: string; area?: string; date?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status && params.status !== 'all') qs.set('status', params.status);
    if (params?.area && params.area !== 'all') qs.set('area', params.area);
    if (params?.date) qs.set('date', params.date);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<{ events: CommunityEvent[] }>(`/api/events${suffix}`);
  },

  getEventDetail: (eventId: string) =>
    request<{ event: CommunityEvent; registrations: EventRegistration[] }>(`/api/events/${eventId}`),

  createEvent: (payload: Record<string, unknown>) =>
    request<{ event: CommunityEvent }>('/api/events', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateEvent: (eventId: string, payload: Record<string, unknown>) =>
    request<{ event: CommunityEvent }>(`/api/events/${eventId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  registerEventVolunteer: (
    eventId: string,
    payload: { name: string; phone: string; availability: string; preferredRole: VolunteerRole }
  ) =>
    request<{ registration: EventRegistration }>(`/api/events/${eventId}/register`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  remindEvent: (eventId: string) =>
    request<{ ok: boolean; reminded: boolean }>(`/api/events/${eventId}/remind`, {
      method: 'POST',
    }),

  updateEventAttendance: (eventId: string, regId: string, attendanceStatus: AttendanceStatus) =>
    request<{ ok: boolean; attendanceStatus: AttendanceStatus }>(
      `/api/events/${eventId}/registrations/${regId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ attendanceStatus }),
      }
    ),

  // --- Wedding & Buffet Leftover Collection ---
  getWeddingPickups: (lat?: number, lng?: number) => {
    const qs = new URLSearchParams();
    if (lat !== undefined) qs.set('lat', String(lat));
    if (lng !== undefined) qs.set('lng', String(lng));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<{ pickups: WeddingPickupRequest[] }>(`/api/wedding-pickups${suffix}`);
  },

  createWeddingPickup: (payload: Record<string, unknown>) =>
    request<{ pickup: WeddingPickupRequest }>('/api/wedding-pickups', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateWeddingPickupStatus: (
    pickupId: string,
    payload: {
      status: WeddingPickupStatus;
      deliveryPhotoUrl?: string;
      deliveredMeals?: number;
      deliveryNote?: string;
    }
  ) =>
    request<{ pickup: WeddingPickupRequest }>(`/api/wedding-pickups/${pickupId}/status`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  claimWeddingNgo: (pickupId: string, ngoName?: string) =>
    request<{ pickup: WeddingPickupRequest }>(`/api/wedding-pickups/${pickupId}/claim-ngo`, {
      method: 'POST',
      body: JSON.stringify({ ngoName }),
    }),

  openWeddingChat: (pickupId: string) =>
    request<{ conversationId: string }>(`/api/wedding-pickups/${pickupId}/open-chat`, {
      method: 'POST',
    }),

  // --- Donate Money / Support Us ---
  getDonationSummary: () => request<DonationSummary>('/api/donations/summary'),

  getMyDonations: () => request<{ donations: DonationRecord[] }>('/api/donations/mine'),

  submitDonation: (payload: {
    amountBdt: number;
    frequency: DonationFrequency;
    cause: DonationCause;
    eventId?: string | null;
    paymentMethod: PaymentMethodId;
    isAnonymous: boolean;
    honorOf?: string | null;
    donorName?: string;
  }) =>
    request<{ donation: DonationRecord }>('/api/donations', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // --- Donor Ratings & Reviews ---
  getDonorReviews: (donorId: string) =>
    request<DonorReviewsResponse>(`/api/donors/${donorId}/reviews`),

  submitClaimReview: (
    claimId: string,
    payload: { rating: number; hygieneOk: boolean; comment?: string }
  ) =>
    request<{ id: string; rating: number; hygieneOk: boolean; comment?: string | null; createdAt: string }>(
      `/api/claims/${claimId}/review`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  // --- Impact Dashboard ---
  getImpactDashboard: () => request<ImpactDashboardData>('/api/impact-dashboard'),

  // --- Volunteer Shifts Hub ---
  getVolunteerShifts: (params?: { area?: string; role?: string }) => {
    const qs = new URLSearchParams();
    if (params?.area && params.area !== 'all') qs.set('area', params.area);
    if (params?.role && params.role !== 'all') qs.set('role', params.role);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<{ shifts: VolunteerShift[]; myTotalHours: number }>(
      `/api/volunteer-shifts${suffix}`
    );
  },

  createVolunteerShift: (payload: {
    title: string;
    titleBn?: string;
    area: string;
    locationName: string;
    role: VolunteerRole;
    shiftDate: string;
    startTime: string;
    endTime: string;
    slotsTotal: number;
  }) =>
    request<{ id: string }>('/api/volunteer-shifts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  signupVolunteerShift: (shiftId: string) =>
    request<{ ok: boolean }>(`/api/volunteer-shifts/${shiftId}/signup`, {
      method: 'POST',
    }),

  updateVolunteerShiftStatus: (
    shiftId: string,
    status: 'checked_in' | 'completed' | 'cancelled'
  ) =>
    request<{ ok: boolean; status: string; hoursLogged: number }>(
      `/api/volunteer-shifts/${shiftId}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }
    ),

  // --- Badges & Leaderboard ---
  getLeaderboard: () => request<LeaderboardData>('/api/community/leaderboard'),
};

export function formatTimeRemaining(isoEnd: string): string {
  const diffMin = Math.round((new Date(isoEnd).getTime() - Date.now()) / 60_000);
  if (diffMin <= 0) return 'Expired';
  if (diffMin < 60) return `${diffMin}m`;
  const hrs = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

export function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatPickupWindow(startIso: string, endIso: string): string {
  return `${formatClockTime(startIso)} – ${formatClockTime(endIso)}`;
}
