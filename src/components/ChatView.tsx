import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  BadgeCheck,
  Ban,
  Bell,
  BellOff,
  Camera,
  Check,
  CheckCheck,
  CheckSquare,
  Clock,
  Copy,
  Flag,
  Forward,
  HeartHandshake,
  Image as ImageIcon,
  Languages,
  Loader2,
  MapPin,
  MessageSquare,
  MessageSquarePlus,
  Mic,
  MoreHorizontal,
  MoreVertical,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  Plus,
  QrCode,
  RefreshCw,
  Reply,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  SmilePlus,
  Square,
  Store,
  Trash2,
  Users,
  Video,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import type {
  AdminConversation,
  AdminNotificationItem,
  CallKind,
  ChatMessage,
  Claim,
  CommunityRoom,
  Conversation,
  MessageReaction,
  MessageType,
  PlatformUserSummary,
  RoomMember,
  RoomMessage,
  User,
  UserDirectoryEntry,
} from '../types';
import {
  api,
  getQueuedMessages,
  saveQueuedMessages,
  type QueuedChatMessage,
} from '../lib/api';
import type { QueuedMessengerMessage } from '../lib/messengerService';
import { AdminChatThread } from './AdminChatThread';
import { CommunityRoomView } from './CommunityRoomView';
import { DemoBadge } from './DemoBadge';
import { FindPeopleModal } from './FindPeopleModal';
import { FoodImage } from './FoodImage';
import { ShopAvatar } from './ShopAvatar';
import { ShopProfileModal } from './ShopProfileModal';
import { LocationShareModal } from './LocationShareModal';
import { LocationMessageCard } from './LocationMessageCard';
import { FileMessageCard } from './FileMessageCard';
import { ForwardModal } from './ForwardModal';
import { useI18n } from '../i18n/I18nContext';
import { convertPhoneticOnBoundary } from '../i18n/phonetic';
import { useTheme } from '../theme/ThemeContext';
import {
  BUBBLE_COLOR_PRESETS,
  CHAT_THEMES,
  QUICK_EMOJIS,
  REACTION_EMOJIS,
  getChatPrefs,
  getSentBubbleStyle,
  resetChatPrefs,
  saveChatPrefs,
} from '../theme/chatThemes';
import { CallOverlay, type ActiveCallSession } from './CallOverlay';
import { CameraCaptureModal } from './CameraCaptureModal';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';
import { PhotoLightbox } from './PhotoLightbox';
import {
  classifyMediaError,
  createWebSocketSignalingAdapter,
  stopMediaStream,
  type CallSignalMessage,
} from '../lib/webrtcCall';

export interface FirestoreSendPayload {
  text: string;
  messageType?: MessageType;
  file?: Blob;
  fileName?: string;
  fileSize?: number;
  fileMime?: string;
  mediaUrl?: string | null;
  durationSec?: number | null;
  locationLat?: number | null;
  locationLng?: number | null;
  locationLabel?: string | null;
  locationExpiresAt?: string | null;
  replyToId?: string | null;
  replyToText?: string | null;
  forwardedFrom?: string | null;
}

interface ChatViewProps {
  user: User;
  conversations: Conversation[];
  selectedConversationId: string | null;
  wsSocket: WebSocket | null;
  wsStatus?: 'connecting' | 'connected' | 'reconnecting' | 'offline';
  isOnline: boolean;
  typingByConv: Record<string, boolean>;
  isAdmin?: boolean;
  adminNotifications?: AdminNotificationItem[];
  adminConversations?: AdminConversation[];
  myAdminConversation?: AdminConversation | null;
  adminDirectoryUsers?: PlatformUserSummary[];
  directoryEntries?: UserDirectoryEntry[];
  directoryHasMore?: boolean;
  onLoadMoreDirectory?: () => void;
  blockedUids?: Set<string>;
  firestoreMessages?: ChatMessage[];
  hasMoreMessages?: boolean;
  loadingMoreMessages?: boolean;
  onLoadOlderMessages?: () => void;
  onSelectDirectoryPerson?: (entry: UserDirectoryEntry) => Promise<void>;
  onSendFirestoreMessage?: (conv: Conversation, payload: FirestoreSendPayload) => Promise<void>;
  queuedMessengerMessages?: QueuedMessengerMessage[];
  onRetryQueuedMessage?: (tempId: string) => Promise<void>;
  onTypingFirestore?: (conv: Conversation, isTyping: boolean) => void;
  onReactFirestore?: (conv: Conversation, msg: ChatMessage, emoji: string) => Promise<void>;
  onDeleteMessageFirestore?: (convId: string, msgId: string) => Promise<void>;
  onForwardFirestore?: (targetConvs: Conversation[], msgs: ChatMessage[]) => Promise<void>;
  onToggleMuteConv?: (conv: Conversation, muted: boolean) => Promise<void>;
  onToggleArchiveConv?: (conv: Conversation, archived: boolean) => Promise<void>;
  onDeleteConvForMe?: (conv: Conversation) => Promise<void>;
  onToggleBlockPeer?: (
    peerUid: string,
    peerName: string,
    peerHandle?: string | null,
    currentlyBlocked?: boolean
  ) => Promise<void>;
  onReportPeer?: (
    peerUid: string,
    peerName: string,
    convId: string,
    reason: string,
    details?: string
  ) => Promise<void>;
  onStartDirectChat?: (targetUser: PlatformUserSummary) => Promise<void>;
  communityRooms?: CommunityRoom[];
  roomMessages?: RoomMessage[];
  roomMembers?: RoomMember[];
  roomHasMore?: boolean;
  loadingMoreRoom?: boolean;
  onLoadOlderRoomMessages?: () => void;
  onSendRoomMessage?: (
    room: CommunityRoom,
    params: {
      text: string;
      file?: Blob | null;
      mediaUrlFallback?: string | null;
      replyTo?: RoomMessage | null;
    }
  ) => Promise<void>;
  onReactRoomMessage?: (roomId: string, msg: RoomMessage, emoji: string) => Promise<void>;
  onReportRoomMessage?: (roomId: string, msg: RoomMessage, reason: string) => Promise<void>;
  onAdminSetRoomMessageDeleted?: (
    roomId: string,
    msg: RoomMessage,
    deleted: boolean
  ) => Promise<void>;
  onAdminToggleMuteRoomUser?: (
    roomId: string,
    targetUid: string,
    mute: boolean
  ) => Promise<void>;
  onReviewApplication?: (ownerUid: string) => void;
  onMarkAdminNotificationRead?: (notifId: string) => void;
  onMarkAllAdminNotificationsRead?: () => void;
  onSelectConversation: (id: string | null) => void;
  onRefreshConversations: () => void;
  onOpenPickupCode: (claim: Claim, mode: 'recipient' | 'donor') => void;
}

const STATUS_TONE: Record<string, string> = {
  accepted: 'text-[var(--brand-text)]',
  picked_up: 'text-[var(--brand-text)]',
  completed: 'text-[var(--text-muted)]',
  cancelled: 'text-red-600 dark:text-red-400',
  expired: 'text-[var(--text-muted)]',
  requested: 'text-[var(--brand-accent-text)]',
};

const QUICK_REPLY_KEYS = ['onMyWay', 'runningLate', 'stillAvailable', 'thankYou'] as const;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ALLOWED_DOC_EXTS = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'csv',
  'txt',
  'zip',
  'rar',
  '7z',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
]);

export function ChatView({
  user,
  conversations,
  selectedConversationId,
  wsSocket,
  wsStatus = 'connected',
  isOnline,
  typingByConv,
  isAdmin = false,
  adminNotifications = [],
  adminConversations = [],
  myAdminConversation = null,
  adminDirectoryUsers = [],
  directoryEntries,
  directoryHasMore = false,
  onLoadMoreDirectory,
  blockedUids,
  firestoreMessages,
  hasMoreMessages = false,
  loadingMoreMessages = false,
  onLoadOlderMessages,
  onSelectDirectoryPerson,
  onSendFirestoreMessage,
  queuedMessengerMessages = [],
  onRetryQueuedMessage,
  onTypingFirestore,
  onReactFirestore,
  onDeleteMessageFirestore,
  onForwardFirestore,
  onToggleMuteConv,
  onToggleArchiveConv,
  onDeleteConvForMe,
  onToggleBlockPeer,
  onReportPeer,
  onStartDirectChat,
  communityRooms = [],
  roomMessages = [],
  roomMembers = [],
  roomHasMore = false,
  loadingMoreRoom = false,
  onLoadOlderRoomMessages,
  onSendRoomMessage,
  onReactRoomMessage,
  onReportRoomMessage,
  onAdminSetRoomMessageDeleted,
  onAdminToggleMuteRoomUser,
  onReviewApplication,
  onMarkAdminNotificationRead,
  onMarkAllAdminNotificationsRead,
  onSelectConversation,
  onRefreshConversations,
  onOpenPickupCode,
}: ChatViewProps) {
  const { lang, t, formatNumber, formatTime, formatWindow } = useI18n();
  const { darkMode } = useTheme();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [queued, setQueued] = useState<QueuedChatMessage[]>(() => getQueuedMessages());

  // Popups & Drawers (never inside overflow-hidden containers)
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatSettingsOpen, setChatSettingsOpen] = useState(false);
  const [shopProfileOpen, setShopProfileOpen] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [quickRepliesOpen, setQuickRepliesOpen] = useState(false);
  const [inboxHiddenOnDesktop, setInboxHiddenOnDesktop] = useState(false);
  const [findPeopleOpen, setFindPeopleOpen] = useState(false);
  const [startingUserId, setStartingUserId] = useState<string | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportReasonKey, setReportReasonKey] = useState<'r1' | 'r2' | 'r3' | 'r4'>('r1');
  const [reportDetails, setReportDetails] = useState('');
  const [deleteConvConfirmOpen, setDeleteConvConfirmOpen] = useState(false);

  // Message actions, reply, forward, multi-select
  const [actionMenuMsg, setActionMenuMsg] = useState<ChatMessage | null>(null);
  const [replyToMsg, setReplyToMsg] = useState<ChatMessage | null>(null);
  const [forwardTargets, setForwardTargets] = useState<ChatMessage[] | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState<string[]>([]);

  // Per-chat customization & search
  const [prefsVersion, setPrefsVersion] = useState(0);
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [reactMenuMsgId, setReactMenuMsgId] = useState<string | null>(null);
  const [inboxSearch, setInboxSearch] = useState('');
  const [inboxFilter, setInboxFilter] = useState<'all' | 'unread' | 'archived'>('all');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [avroEnabled, setAvroEnabled] = useState(false);
  const [translations, setTranslations] = useState<
    Record<string, { text: string; targetLang: 'en' | 'bn'; showTranslated: boolean }>
  >({});
  const [translatingIds, setTranslatingIds] = useState<Record<string, boolean>>({});
  const [fileUploadState, setFileUploadState] = useState<{ name: string; pct: number } | null>(null);

  // Rich media overlays
  const [cameraOpen, setCameraOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; caption?: string | null } | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCallSession | null>(null);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);

  // Refs for scroll preservation & media & stable WS listeners
  const bottomRef = useRef<HTMLDivElement>(null);
  const feedScrollRef = useRef<HTMLDivElement>(null);
  const prevConvIdRef = useRef<string | null>(null);
  const prevLastMsgIdRef = useRef<string | null>(null);
  const prevFirstMsgIdRef = useRef<string | null>(null);
  const prevScrollHeightRef = useRef<number>(0);
  const loadingOlderThrottleRef = useRef<number>(0);
  const inboxScrollRef = useRef<HTMLDivElement>(null);
  const inboxScrollPosRef = useRef<number>(0);
  const typingTimerRef = useRef<number | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const pointerHeldRef = useRef(false);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const recordStartRef = useRef<number>(0);
  const recordDiscardRef = useRef(false);

  // Keep latest callbacks/conversations in refs so incoming WS events don't tear down listeners or menus
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const onRefreshRef = useRef(onRefreshConversations);
  onRefreshRef.current = onRefreshConversations;
  const onSelectConvRef = useRef(onSelectConversation);
  onSelectConvRef.current = onSelectConversation;
  const activeCallRef = useRef(activeCall);
  activeCallRef.current = activeCall;
  const userRef = useRef(user);
  userRef.current = user;

  const signaling = useMemo(() => createWebSocketSignalingAdapter(wsSocket), [wsSocket]);

  const isAdminConvSelected = Boolean(selectedConversationId?.startsWith('admin_'));
  const activeRoom = useMemo(
    () =>
      selectedConversationId?.startsWith('room_')
        ? communityRooms.find((r) => r.id === selectedConversationId) ?? null
        : null,
    [selectedConversationId, communityRooms]
  );
  const activeConv =
    isAdminConvSelected || activeRoom
      ? null
      : (conversations.find((c) => c.id === selectedConversationId) ?? null);

  const pinnedOwnerConv = useMemo<AdminConversation | null>(() => {
    if (isAdmin) return null;
    if (myAdminConversation) return myAdminConversation;
    if (user.accountType !== 'restaurantOwner') return null;
    const r = user.restaurant;
    return {
      id: `admin_${user.id}`,
      ownerUid: user.id,
      ownerName: r?.ownerName || user.name,
      restaurantName: r?.restaurantName || user.donorProfile?.businessName || user.name,
      restaurantLogoUrl: r?.restaurantPhotoUrl ?? user.donorProfile?.logoUrl ?? null,
      verificationStatus: r?.verificationStatus ?? 'pending',
      lastMessage: '',
      lastMessageAt: user.createdAt || new Date().toISOString(),
      lastMessageType: 'text',
      lastSenderRole: 'system',
      adminUnreadCount: 0,
      ownerUnreadCount: 0,
      adminTyping: false,
      ownerTyping: false,
      createdAt: user.createdAt || new Date().toISOString(),
      updatedAt: user.createdAt || new Date().toISOString(),
    };
  }, [isAdmin, user, myAdminConversation]);

  const activeAdminConv = useMemo<AdminConversation | null>(() => {
    if (!isAdminConvSelected || !selectedConversationId) return null;
    if (isAdmin) {
      return adminConversations.find((c) => c.id === selectedConversationId) ?? null;
    }
    if (pinnedOwnerConv && pinnedOwnerConv.id === selectedConversationId) {
      return pinnedOwnerConv;
    }
    return null;
  }, [
    isAdminConvSelected,
    selectedConversationId,
    isAdmin,
    adminConversations,
    pinnedOwnerConv,
  ]);

  const normalUserUidSet = useMemo(
    () => new Set(adminDirectoryUsers.filter((u) => u.accountType === 'user').map((u) => u.id)),
    [adminDirectoryUsers]
  );

  const isNormalUserConv = useCallback(
    (conv: AdminConversation) => {
      if (normalUserUidSet.has(conv.ownerUid)) return true;
      const isKnownRest = adminDirectoryUsers.some(
        (u) => u.id === conv.ownerUid && u.accountType === 'restaurantOwner'
      );
      return !isKnownRest && conv.restaurantName === conv.ownerName && conv.verificationStatus === 'approved';
    },
    [normalUserUidSet, adminDirectoryUsers]
  );

  const zeroPiiDirectory = useMemo<UserDirectoryEntry[]>(() => {
    if (directoryEntries && directoryEntries.length > 0) {
      return directoryEntries.filter((e) => e.uid !== user.id);
    }
    return adminDirectoryUsers
      .filter((u) => u.id !== user.id && u.discoverable !== false)
      .map((u) => {
        const slug = u.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 14);
        const suffix = u.id.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toLowerCase().padEnd(4, '0');
        return {
          uid: u.id,
          displayName: u.name,
          handle: u.handle || `@${slug || 'member'}_${suffix}`,
          photoURL: u.logoUrl ?? null,
          role:
            u.role === 'admin'
              ? 'admin'
              : u.accountType === 'restaurantOwner'
                ? 'restaurantOwner'
                : u.role === 'donor'
                  ? 'donor'
                  : 'user',
          restaurantName: u.businessName ?? null,
          area: u.area || 'Dhaka',
          verified: Boolean(u.verified),
          discoverable: true,
          online: Boolean(u.wsOnline || u.isOnline),
          lastSeen: u.lastSeen || u.lastActiveAt || new Date().toISOString(),
        };
      });
  }, [directoryEntries, adminDirectoryUsers, user.id]);

  const onlineDirectoryCount = useMemo(
    () => zeroPiiDirectory.filter((u) => u.online).length,
    [zeroPiiDirectory]
  );

  const handleOpenPerson = useCallback(
    async (entry: UserDirectoryEntry) => {
      setStartingUserId(entry.uid);
      try {
        if (onSelectDirectoryPerson) {
          await onSelectDirectoryPerson(entry);
        } else if (onStartDirectChat) {
          await onStartDirectChat({
            id: entry.uid,
            name: entry.displayName,
            handle: entry.handle,
            role: entry.role === 'admin' ? 'admin' : entry.role === 'restaurantOwner' || entry.role === 'donor' ? 'donor' : 'recipient',
            accountType: entry.role === 'restaurantOwner' ? 'restaurantOwner' : 'user',
            area: entry.area,
            businessName: entry.restaurantName,
            logoUrl: entry.photoURL,
            source: 'express',
            verified: entry.verified,
            isOnline: entry.online,
          });
        }
        setFindPeopleOpen(false);
      } finally {
        setStartingUserId(null);
      }
    },
    [onSelectDirectoryPerson, onStartDirectChat]
  );

  const hasSelectedThread = Boolean(activeConv || activeAdminConv || activeRoom);

  const activePrefs = useMemo(
    () => (activeConv ? getChatPrefs(activeConv.id) : getChatPrefs('__default__')),
    [activeConv?.id, prefsVersion]
  );

  const getPeerDisplayName = useCallback(
    (conv: Conversation) => {
      const prefs = getChatPrefs(conv.id);
      if (prefs.nickname.trim()) return prefs.nickname.trim();
      const isDonorMe = user.id === conv.donorId;
      const isRecipientMe = user.id === conv.recipientId;
      if (!isDonorMe && !isRecipientMe && !conv.isFirestoreBacked) {
        const recLabel = conv.recipientOrg
          ? `${conv.recipientName} (${conv.recipientOrg})`
          : conv.recipientName;
        return `${conv.donorName} ↔ ${recLabel}`;
      }
      return isDonorMe
        ? conv.recipientOrg
          ? `${conv.recipientName} (${conv.recipientOrg})`
          : conv.recipientName
        : conv.donorName;
    },
    [user.id, prefsVersion]
  );

  const getPeerAvatarUrl = useCallback(
    (conv: Conversation) => {
      const isDonorMe = user.id === conv.donorId;
      if (conv.isDirect || conv.isFirestoreBacked) {
        return !isDonorMe ? (conv.donorLogoUrl ?? null) : (conv.recipientLogoUrl ?? null);
      }
      return !isDonorMe ? conv.donorLogoUrl : conv.listingPhoto;
    },
    [user.id]
  );

  const getPeerUid = useCallback(
    (conv: Conversation) => {
      if (conv.peerUid) return conv.peerUid;
      return user.id === conv.donorId ? conv.recipientId : conv.donorId;
    },
    [user.id]
  );

  const formatLastSeenLine = useCallback(
    (conv: Conversation) => {
      if (conv.peerTyping || typingByConv[conv.id]) return t('chat.typing');
      if (conv.peerOnline) return t('chat.online');
      const refTime = conv.peerLastSeen || conv.lastMessageAt;
      if (!refTime) return t('chat.offline');
      const diffMin = Math.max(0, Math.round((Date.now() - new Date(refTime).getTime()) / 60_000));
      if (diffMin < 2) return t('chat.lastSeenJustNow');
      if (diffMin < 60) return t('chat.lastSeenMinutes', { count: diffMin });
      const hrs = Math.floor(diffMin / 60);
      if (hrs < 24) return t('chat.lastSeenHours', { count: hrs });
      return t('chat.offline');
    },
    [t, typingByConv]
  );

  const cleanupRecorder = useCallback((discard = true) => {
    pointerHeldRef.current = false;
    recordDiscardRef.current = discard;
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {
        // Ignore
      }
    }
    stopMediaStream(recordStreamRef.current);
    recordStreamRef.current = null;
    setRecordingVoice(false);
    setRecordingSec(0);
  }, []);

  useEffect(() => {
    return () => {
      cleanupRecorder(true);
      if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    };
  }, [cleanupRecorder]);

  // Restore Inbox scroll position whenever returning to Inbox list
  useLayoutEffect(() => {
    if (!hasSelectedThread && inboxScrollRef.current) {
      inboxScrollRef.current.scrollTop = inboxScrollPosRef.current;
    }
  }, [hasSelectedThread]);

  // Sync nickname & reset conversation-scoped menus ONLY when switching selectedConversationId
  useEffect(() => {
    setMenuOpen(false);
    setChatSettingsOpen(false);
    setShopProfileOpen(false);
    setAttachMenuOpen(false);
    setActionMenuMsg(null);
    setReactMenuMsgId(null);
    setReplyToMsg(null);
    setSelectionMode(false);
    setSelectedMsgIds([]);
    setQuickRepliesOpen(false);
    setCameraOpen(false);
    cleanupRecorder(true);
    if (selectedConversationId) {
      setNicknameDraft(getChatPrefs(selectedConversationId).nickname);
    } else {
      setNicknameDraft('');
    }
  }, [selectedConversationId, cleanupRecorder]);

  const nonArchivedConvs = useMemo(
    () => conversations.filter((c) => !c.isArchived),
    [conversations]
  );
  const archivedConvs = useMemo(
    () => conversations.filter((c) => Boolean(c.isArchived)),
    [conversations]
  );

  const unreadThreadsCount = useMemo(() => {
    const claimUnread = nonArchivedConvs.filter((c) => c.unreadCount > 0).length;
    if (isAdmin) {
      const adminUnread = adminConversations.filter((c) => c.adminUnreadCount > 0).length;
      return claimUnread + adminUnread;
    }
    const ownerUnread = (pinnedOwnerConv?.ownerUnreadCount ?? 0) > 0 ? 1 : 0;
    return claimUnread + ownerUnread;
  }, [nonArchivedConvs, isAdmin, adminConversations, pinnedOwnerConv]);

  const totalThreadsCount = useMemo(() => {
    return (
      nonArchivedConvs.length +
      (isAdmin ? adminConversations.length : pinnedOwnerConv ? 1 : 0)
    );
  }, [nonArchivedConvs.length, isAdmin, adminConversations.length, pinnedOwnerConv]);

  const filteredAdminNotifications = useMemo(() => {
    if (!isAdmin || inboxFilter === 'archived') return [];
    const q = inboxSearch.trim().toLowerCase();
    return adminNotifications.filter((n) => {
      if (inboxFilter === 'unread' && n.read) return false;
      if (!q) return true;
      return (
        n.restaurantName.toLowerCase().includes(q) ||
        n.ownerName.toLowerCase().includes(q) ||
        (n.messagePreview ?? '').toLowerCase().includes(q)
      );
    });
  }, [isAdmin, adminNotifications, inboxFilter, inboxSearch]);

  const unreadAdminNotifCount = useMemo(
    () => (isAdmin ? adminNotifications.filter((n) => !n.read).length : 0),
    [isAdmin, adminNotifications]
  );

  const filteredAdminConvs = useMemo(() => {
    if (!isAdmin || inboxFilter === 'archived') return [];
    const q = inboxSearch.trim().toLowerCase();
    return adminConversations.filter((c) => {
      if (inboxFilter === 'unread' && c.adminUnreadCount <= 0) return false;
      if (!q) return true;
      return (
        c.restaurantName.toLowerCase().includes(q) ||
        c.ownerName.toLowerCase().includes(q) ||
        (c.lastMessage ?? '').toLowerCase().includes(q)
      );
    });
  }, [isAdmin, adminConversations, inboxFilter, inboxSearch]);

  const showPinnedOwnerConv = useMemo(() => {
    if (!pinnedOwnerConv || inboxFilter === 'archived') return false;
    if (inboxFilter === 'unread' && pinnedOwnerConv.ownerUnreadCount <= 0) return false;
    const q = inboxSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      t('adminChat.teamName').toLowerCase().includes(q) ||
      pinnedOwnerConv.restaurantName.toLowerCase().includes(q) ||
      (pinnedOwnerConv.lastMessage ?? '').toLowerCase().includes(q)
    );
  }, [pinnedOwnerConv, inboxFilter, inboxSearch, t]);

  const filteredConversations = useMemo(() => {
    const q = inboxSearch.trim().toLowerCase();
    return conversations.filter((c) => {
      if (inboxFilter === 'archived') {
        if (!c.isArchived) return false;
      } else {
        if (c.isArchived) return false;
        if (inboxFilter === 'unread' && c.unreadCount <= 0) return false;
      }
      if (!q) return true;
      const customNick = getChatPrefs(c.id).nickname.toLowerCase();
      const basePeer = `${c.donorName} ${c.recipientName} ${c.recipientOrg ?? ''} ${c.peerHandle ?? ''} ${c.peerArea ?? ''}`.toLowerCase();
      return (
        customNick.includes(q) ||
        basePeer.includes(q) ||
        c.listingTitle.toLowerCase().includes(q) ||
        (c.lastMessage ?? '').toLowerCase().includes(q)
      );
    });
  }, [conversations, inboxFilter, inboxSearch, prefsVersion]);

  const filteredRooms = useMemo(() => {
    if (inboxFilter !== 'all') return [];
    const q = inboxSearch.trim().toLowerCase();
    if (!q) return communityRooms;
    return communityRooms.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.nameBn.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.lastMessage.toLowerCase().includes(q)
    );
  }, [communityRooms, inboxFilter, inboxSearch]);

  const directRealConvs = filteredConversations.filter((c) => !c.isDemo && c.isDirect);
  const activeConvs = filteredConversations.filter(
    (c) => !c.isDemo && !c.isDirect && ['requested', 'accepted', 'picked_up'].includes(c.claimStatus)
  );
  const closedConvs = filteredConversations.filter(
    (c) => !c.isDemo && !c.isDirect && !['requested', 'accepted', 'picked_up'].includes(c.claimStatus)
  );
  const demoConvs = filteredConversations.filter((c) => c.isDemo);

  // Fetch messages when selected Express claim conversation changes (never for admin_, room_, or Firestore threads)
  useEffect(() => {
    if (
      !selectedConversationId ||
      selectedConversationId.startsWith('admin_') ||
      selectedConversationId.startsWith('room_') ||
      activeConv?.isFirestoreBacked
    ) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoadingMsgs(true);
    api
      .getMessages(selectedConversationId)
      .then((res) => {
        if (!cancelled) {
          setMessages(res.messages);
          onRefreshRef.current();
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingMsgs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedConversationId, activeConv?.isFirestoreBacked]);

  // Listen to WebSocket events cleanly without disrupting active menus/popups
  useEffect(() => {
    if (!wsSocket) return;
    const handleMessage = (ev: MessageEvent) => {
      try {
        const parsed = JSON.parse(ev.data);
        if (parsed.event === 'chat:message') {
          const incoming = parsed.data as ChatMessage;
          if (incoming.conversationId === selectedConversationId) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === incoming.id)) return prev;
              if (incoming.clientTempId) {
                const idx = prev.findIndex((m) => m.id === incoming.clientTempId);
                if (idx >= 0) {
                  const next = [...prev];
                  next[idx] = incoming;
                  return next;
                }
              }
              return [...prev, incoming];
            });
            if (incoming.senderId !== userRef.current.id) {
              api.markConversationRead(incoming.conversationId).catch(() => {});
            }
          }
          onRefreshRef.current();
        } else if (parsed.event === 'chat:read') {
          const { conversationId, readAt } = parsed.data as {
            conversationId: string;
            readAt: string;
          };
          if (conversationId === selectedConversationId) {
            setMessages((prev) =>
              prev.map((m) => (m.senderId === userRef.current.id && !m.readAt ? { ...m, readAt } : m))
            );
          }
        } else if (parsed.event === 'chat:reaction') {
          const { conversationId, messageId, reactions } = parsed.data as {
            conversationId: string;
            messageId: string;
            reactions: MessageReaction[];
          };
          if (conversationId === selectedConversationId) {
            setMessages((prev) =>
              prev.map((m) => (m.id === messageId ? { ...m, reactions } : m))
            );
          }
        } else if (parsed.event === 'call:signal') {
          const sig = parsed.data as CallSignalMessage;
          if (sig.signalType === 'offer' && !activeCallRef.current) {
            const targetConv = conversationsRef.current.find((c) => c.id === sig.conversationId);
            if (targetConv) {
              const peerName = getPeerDisplayName(targetConv);
              const peerAvatarUrl = getPeerAvatarUrl(targetConv);
              onSelectConvRef.current(targetConv.id);
              setActiveCall({
                callId: sig.callId,
                conversationId: sig.conversationId,
                callType: sig.callType,
                direction: 'incoming',
                peerName,
                peerAvatarUrl,
                remoteOffer: (sig.payload as RTCSessionDescriptionInit | undefined) ?? null,
              });
            }
          }
        }
      } catch {
        // Ignore
      }
    };
    wsSocket.addEventListener('message', handleMessage);
    return () => wsSocket.removeEventListener('message', handleMessage);
  }, [wsSocket, selectedConversationId, getPeerDisplayName, getPeerAvatarUrl]);

  // Flush offline queue automatically when back online
  useEffect(() => {
    if (!isOnline || queued.length === 0) return;
    let cancelled = false;
    (async () => {
      const remaining: QueuedChatMessage[] = [];
      for (const item of queued) {
        try {
          await api.sendMessage(item.conversationId, {
            text: item.text,
            imageUrl: item.imageUrl,
            clientTempId: item.clientTempId,
          });
        } catch {
          remaining.push(item);
        }
      }
      if (!cancelled) {
        setQueued(remaining);
        saveQueuedMessages(remaining);
        if (selectedConversationId) {
          api
            .getMessages(selectedConversationId)
            .then((res) => setMessages(res.messages))
            .catch(() => {});
        }
        onRefreshRef.current();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOnline]);

  // Compute displayed messages (Firestore live stream + queued offline OR Express messages)
  const displayedMessages = useMemo(() => {
    if (!activeConv?.isFirestoreBacked) return messages;
    const base = firestoreMessages ?? [];
    const matchingQueued: ChatMessage[] = queuedMessengerMessages
      .filter((q) => q.conversationId === activeConv.id)
      .map((q) => ({
        id: q.tempId,
        conversationId: q.conversationId,
        senderId: q.senderId,
        senderName: q.senderName,
        text: q.text,
        messageType: q.messageType,
        imageUrl: q.messageType === 'image' ? q.mediaUrl : null,
        audioUrl: q.messageType === 'voice' ? q.mediaUrl : null,
        fileUrl: q.messageType === 'file' ? q.mediaUrl : null,
        fileName: q.fileName,
        fileSize: q.fileSize,
        fileMime: q.fileMime,
        durationSec: q.durationSec,
        locationLat: q.locationLat,
        locationLng: q.locationLng,
        locationLabel: q.locationLabel,
        locationExpiresAt: q.locationExpiresAt,
        replyToId: q.replyToId,
        replyToText: q.replyToText,
        forwardedFrom: q.forwardedFrom,
        sentAt: new Date().toISOString(),
        pending: true,
        failed: !isOnline,
        status: 'sending',
      }));
    return [...base, ...matchingQueued];
  }, [activeConv?.isFirestoreBacked, activeConv?.id, firestoreMessages, queuedMessengerMessages, messages, isOnline]);

  // Preserve scroll offset when older messages prepend; auto-scroll only on thread switch or new bottom message
  useLayoutEffect(() => {
    const convId = activeConv?.id ?? null;
    const firstId = displayedMessages[0]?.id ?? null;
    const lastId = displayedMessages[displayedMessages.length - 1]?.id ?? null;

    if (convId !== prevConvIdRef.current) {
      prevConvIdRef.current = convId;
      prevFirstMsgIdRef.current = firstId;
      prevLastMsgIdRef.current = lastId;
      if (convId) {
        bottomRef.current?.scrollIntoView({ behavior: 'auto' });
      }
      if (feedScrollRef.current) {
        prevScrollHeightRef.current = feedScrollRef.current.scrollHeight;
      }
      return;
    }

    const feedEl = feedScrollRef.current;
    if (
      firstId &&
      prevFirstMsgIdRef.current &&
      firstId !== prevFirstMsgIdRef.current &&
      lastId === prevLastMsgIdRef.current &&
      feedEl
    ) {
      const delta = feedEl.scrollHeight - prevScrollHeightRef.current;
      if (delta > 0) {
        feedEl.scrollTop += delta;
      }
    } else if (lastId && lastId !== prevLastMsgIdRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }

    prevFirstMsgIdRef.current = firstId;
    prevLastMsgIdRef.current = lastId;
    if (feedEl) {
      prevScrollHeightRef.current = feedEl.scrollHeight;
    }
  }, [activeConv?.id, displayedMessages]);

  const emitTyping = (isTyping: boolean) => {
    if (activeConv?.isFirestoreBacked) {
      onTypingFirestore?.(activeConv, isTyping);
      return;
    }
    if (!wsSocket || wsSocket.readyState !== WebSocket.OPEN || !selectedConversationId) return;
    wsSocket.send(
      JSON.stringify({
        event: 'chat:typing',
        data: { conversationId: selectedConversationId, isTyping },
      })
    );
  };

  const handleDraftChange = (rawValue: string) => {
    const nextValue = avroEnabled ? convertPhoneticOnBoundary(rawValue) : rawValue;
    setDraft(nextValue);
    emitTyping(true);
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => emitTyping(false), 1200);
  };

  const getMessageSnippet = (msg: ChatMessage): string => {
    if (msg.text) return msg.text;
    if (msg.messageType === 'location') return msg.locationLabel || t('chat.sharedLocationLabel');
    if (msg.messageType === 'file') return msg.fileName || t('chat.sentFileLabel');
    if (msg.messageType === 'voice') return t('chat.voiceMessageLabel');
    if (msg.imageUrl) return t('chat.sentPhoto');
    return '';
  };

  const sendChatText = async (textToSend: string, imageUrl?: string | null) => {
    if (!activeConv || (!textToSend.trim() && !imageUrl)) return;
    const cleanText = textToSend.trim();
    const currentReply = replyToMsg;

    emitTyping(false);
    setDraft('');
    setReplyToMsg(null);
    setQuickRepliesOpen(false);

    if (activeConv.isFirestoreBacked && onSendFirestoreMessage) {
      setSending(true);
      try {
        await onSendFirestoreMessage(activeConv, {
          text: cleanText,
          messageType: imageUrl ? 'image' : 'text',
          mediaUrl: imageUrl ?? null,
          replyToId: currentReply?.id ?? null,
          replyToText: currentReply ? getMessageSnippet(currentReply) : null,
        });
      } catch (err) {
        setFeedback(err instanceof Error ? err.message : t('chat.queueError'));
      } finally {
        setSending(false);
      }
      return;
    }

    const clientTempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const sentAt = new Date().toISOString();

    const optimistic: ChatMessage = {
      id: clientTempId,
      conversationId: activeConv.id,
      senderId: user.id,
      text: cleanText,
      messageType: imageUrl ? 'image' : 'text',
      imageUrl: imageUrl ?? null,
      replyToId: currentReply?.id ?? null,
      replyToText: currentReply ? getMessageSnippet(currentReply) : null,
      replyToSenderId: currentReply?.senderId ?? null,
      sentAt,
      readAt: null,
      reactions: [],
      pending: !isOnline,
    };
    setMessages((prev) => [...prev, optimistic]);

    if (!isOnline) {
      const nextQ = [
        ...queued,
        {
          clientTempId,
          conversationId: activeConv.id,
          senderId: user.id,
          text: cleanText,
          imageUrl: imageUrl ?? null,
          sentAt,
        },
      ];
      setQueued(nextQ);
      saveQueuedMessages(nextQ);
      return;
    }

    setSending(true);
    try {
      const res = await api.sendMessage(activeConv.id, {
        text: cleanText,
        imageUrl: imageUrl ?? null,
        messageType: imageUrl ? 'image' : 'text',
        replyToId: currentReply?.id ?? null,
        replyToText: currentReply ? getMessageSnippet(currentReply) : null,
        replyToSenderId: currentReply?.senderId ?? null,
        clientTempId,
      });
      setMessages((prev) => prev.map((m) => (m.id === clientTempId ? res.message : m)));
      onRefreshConversations();
    } catch (err) {
      const nextQ = [
        ...queued,
        {
          clientTempId,
          conversationId: activeConv.id,
          senderId: user.id,
          text: cleanText,
          imageUrl: imageUrl ?? null,
          sentAt,
        },
      ];
      setQueued(nextQ);
      saveQueuedMessages(nextQ);
      setFeedback(err instanceof Error ? err.message : t('chat.queueError'));
    } finally {
      setSending(false);
    }
  };

  const handleSendLocation = async (payload: {
    lat: number;
    lng: number;
    label: string;
    liveMinutes: 0 | 15 | 60;
  }) => {
    if (!activeConv) return;
    const expiresAt =
      payload.liveMinutes > 0
        ? new Date(Date.now() + payload.liveMinutes * 60_000).toISOString()
        : null;

    if (activeConv.isFirestoreBacked && onSendFirestoreMessage) {
      try {
        await onSendFirestoreMessage(activeConv, {
          text: payload.label,
          messageType: 'location',
          locationLat: payload.lat,
          locationLng: payload.lng,
          locationLabel: payload.label,
          locationExpiresAt: expiresAt,
        });
      } catch (err) {
        setFeedback(err instanceof Error ? err.message : t('chat.queueError'));
      }
      return;
    }

    try {
      const res = await api.sendMessage(activeConv.id, {
        text: payload.label,
        messageType: 'location',
        locationLat: payload.lat,
        locationLng: payload.lng,
        locationLabel: payload.label,
        locationExpiresAt: expiresAt,
      });
      setMessages((prev) =>
        prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]
      );
      onRefreshConversations();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : t('chat.queueError'));
    }
  };

  const handleFileShare = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeConv) return;

    if (file.size > MAX_FILE_BYTES) {
      const sizeMb = `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
      setFeedback(t('file.tooLarge', { size: sizeMb }));
      return;
    }

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const isImageMime = file.type.startsWith('image/');
    if (!isImageMime && !ALLOWED_DOC_EXTS.has(ext)) {
      setFeedback(t('file.unsupported'));
      return;
    }

    if (activeConv.isFirestoreBacked && onSendFirestoreMessage) {
      setFileUploadState({ name: file.name, pct: 35 });
      try {
        await onSendFirestoreMessage(activeConv, {
          text: isImageMime ? draft || t('chat.sharedPhotoFallback') : file.name,
          messageType: isImageMime ? 'image' : 'file',
          file,
          fileName: file.name,
          fileSize: file.size,
          fileMime: file.type || 'application/octet-stream',
        });
        if (isImageMime) setDraft('');
      } catch (err) {
        setFeedback(err instanceof Error ? err.message : t('file.uploadFailed'));
      } finally {
        setFileUploadState(null);
      }
      return;
    }

    setFileUploadState({ name: file.name, pct: 5 });
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const uploaded = await api.uploadFile(
        {
          dataUrl,
          fileName: file.name,
          fileSize: file.size,
          fileMime: file.type || 'application/octet-stream',
        },
        (pct) => setFileUploadState({ name: file.name, pct })
      );

      if (isImageMime) {
        await sendChatText(draft || t('chat.sharedPhotoFallback'), uploaded.url);
      } else {
        const res = await api.sendMessage(activeConv.id, {
          text: uploaded.fileName,
          messageType: 'file',
          fileUrl: uploaded.url,
          fileName: uploaded.fileName,
          fileSize: uploaded.fileSize,
          fileMime: uploaded.fileMime,
        });
        setMessages((prev) =>
          prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]
        );
        onRefreshConversations();
      }
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : t('file.uploadFailed'));
    } finally {
      setFileUploadState(null);
    }
  };

  const handlePhotoShare = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeConv) return;
    if (file.size > MAX_FILE_BYTES) {
      const sizeMb = `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
      setFeedback(t('file.tooLarge', { size: sizeMb }));
      return;
    }
    if (activeConv.isFirestoreBacked && onSendFirestoreMessage) {
      setFileUploadState({ name: file.name, pct: 40 });
      try {
        await onSendFirestoreMessage(activeConv, {
          text: draft || t('chat.sharedPhotoFallback'),
          messageType: 'image',
          file,
          fileName: file.name,
          fileSize: file.size,
          fileMime: file.type || 'image/jpeg',
        });
        setDraft('');
      } catch {
        setFeedback(t('chat.uploadPhotoError'));
      } finally {
        setFileUploadState(null);
      }
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await api.uploadImage(dataUrl);
      await sendChatText(draft || t('chat.sharedPhotoFallback'), res.url);
    } catch {
      setFeedback(t('chat.uploadPhotoError'));
    }
  };

  const handleCameraPhotoSend = async (dataUrl: string, caption: string) => {
    if (!activeConv) return;
    if (activeConv.isFirestoreBacked && onSendFirestoreMessage) {
      try {
        const blob = await (await fetch(dataUrl)).blob();
        await onSendFirestoreMessage(activeConv, {
          text: caption.trim() || t('chat.sharedPhotoFallback'),
          messageType: 'image',
          file: blob,
          fileName: `camera_${Date.now()}.jpg`,
          fileSize: blob.size,
          fileMime: blob.type || 'image/jpeg',
          mediaUrl: dataUrl,
        });
      } catch {
        setFeedback(t('chat.uploadPhotoError'));
      }
      return;
    }
    try {
      const res = await api.uploadImage(dataUrl);
      await sendChatText(caption.trim() || t('chat.sharedPhotoFallback'), res.url);
    } catch {
      setFeedback(t('chat.uploadPhotoError'));
    }
  };

  const handleReactMessage = async (msg: ChatMessage, emoji: string) => {
    if (msg.pending || msg.id.startsWith('temp_')) return;
    setReactMenuMsgId(null);
    setActionMenuMsg(null);

    if (activeConv?.isFirestoreBacked && onReactFirestore) {
      await onReactFirestore(activeConv, msg, emoji).catch(() => {});
      return;
    }

    const existing = msg.reactions ?? [];
    const hasAlready = existing.some((r) => r.userId === user.id && r.emoji === emoji);
    const optimisticReactions = hasAlready
      ? existing.filter((r) => !(r.userId === user.id && r.emoji === emoji))
      : [...existing.filter((r) => r.userId !== user.id), { emoji, userId: user.id }];

    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, reactions: optimisticReactions } : m))
    );

    try {
      const res = await api.reactToMessage(msg.id, emoji);
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, reactions: res.reactions } : m))
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, reactions: existing } : m))
      );
    }
  };

  const handleCopyMessage = async (msg: ChatMessage) => {
    const text =
      msg.text || msg.locationLabel || msg.fileName || msg.imageUrl || '';
    if (text && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text).catch(() => {});
    }
    setActionMenuMsg(null);
    setFeedback(t('msgActions.copiedToast'));
  };

  const handleDeleteForMe = async (msgIds: string[]) => {
    if (msgIds.length === 0) return;
    setActionMenuMsg(null);
    setSelectionMode(false);
    setSelectedMsgIds([]);

    if (activeConv?.isFirestoreBacked && onDeleteMessageFirestore) {
      try {
        await Promise.all(msgIds.map((id) => onDeleteMessageFirestore(activeConv.id, id)));
        setFeedback(t('msgActions.deletedToast'));
      } catch {
        // Non-fatal
      }
      return;
    }

    setMessages((prev) => prev.filter((m) => !msgIds.includes(m.id)));
    try {
      await Promise.all(msgIds.map((id) => api.deleteMessage(id)));
      setFeedback(t('msgActions.deletedToast'));
      onRefreshConversations();
    } catch {
      if (selectedConversationId) {
        api
          .getMessages(selectedConversationId)
          .then((res) => setMessages(res.messages))
          .catch(() => {});
      }
    }
  };

  const handleConfirmForward = async (targetConvIds: string[]) => {
    if (!forwardTargets || forwardTargets.length === 0 || targetConvIds.length === 0) return;
    const fsTargets: Conversation[] = [];
    const expressTargetIds: string[] = [];
    targetConvIds.forEach((id) => {
      const c = conversations.find((conv) => conv.id === id);
      if (c?.isFirestoreBacked) fsTargets.push(c);
      else expressTargetIds.push(id);
    });

    if (fsTargets.length > 0 && onForwardFirestore) {
      await onForwardFirestore(fsTargets, forwardTargets);
    }

    for (const targetConvId of expressTargetIds) {
      for (const msg of forwardTargets) {
        await api.sendMessage(targetConvId, {
          text: msg.text,
          messageType: msg.messageType ?? (msg.imageUrl ? 'image' : 'text'),
          imageUrl: msg.imageUrl ?? null,
          audioUrl: msg.audioUrl ?? null,
          durationSec: msg.durationSec ?? null,
          fileUrl: msg.fileUrl ?? null,
          fileName: msg.fileName ?? null,
          fileSize: msg.fileSize ?? null,
          fileMime: msg.fileMime ?? null,
          locationLat: msg.locationLat ?? null,
          locationLng: msg.locationLng ?? null,
          locationLabel: msg.locationLabel ?? null,
          isForwarded: true,
        });
      }
    }
    setSelectionMode(false);
    setSelectedMsgIds([]);
    setForwardTargets(null);
    onRefreshConversations();
    if (expressTargetIds.length > 0 && selectedConversationId && expressTargetIds.includes(selectedConversationId)) {
      api
        .getMessages(selectedConversationId)
        .then((res) => setMessages(res.messages))
        .catch(() => {});
    }
    setFeedback(t('msgActions.forwardedToast', { count: targetConvIds.length }));
  };

  const handleStartCall = (callType: CallKind, direction: 'outgoing' | 'incoming' = 'outgoing') => {
    if (!activeConv || activeConv.isBlocked) return;
    setMenuOpen(false);
    setChatSettingsOpen(false);
    setShopProfileOpen(false);
    setActiveCall({
      callId: `call_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      conversationId: activeConv.id,
      callType,
      direction,
      peerName: getPeerDisplayName(activeConv),
      peerAvatarUrl: getPeerAvatarUrl(activeConv),
    });
  };

  const formatCallDurationShort = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const rem = String(sec % 60).padStart(2, '0');
    return `${formatNumber(mins)}:${formatNumber(rem)}`;
  };

  const handleCallFinished = async (result: {
    conversationId: string;
    callType: CallKind;
    callStatus: 'completed' | 'missed' | 'declined' | 'cancelled';
    durationSec: number;
  }) => {
    const typeLabel =
      result.callType === 'video' ? t('chat.callTypeVideo') : t('chat.callTypeVoice');
    const summaryText =
      result.callStatus === 'completed'
        ? result.callType === 'video'
          ? t('chat.callHistoryVideo', { duration: formatCallDurationShort(result.durationSec) })
          : t('chat.callHistoryVoice', { duration: formatCallDurationShort(result.durationSec) })
        : result.callStatus === 'declined'
          ? t('chat.callHistoryDeclined', { type: typeLabel })
          : result.callStatus === 'cancelled'
            ? t('chat.callHistoryCancelled', { type: typeLabel })
            : t('chat.callHistoryMissed', { type: typeLabel });

    if (activeConv?.isFirestoreBacked && activeConv.id === result.conversationId && onSendFirestoreMessage) {
      await onSendFirestoreMessage(activeConv, {
        text: summaryText,
        messageType: 'call',
        durationSec: result.durationSec,
      }).catch(() => {});
      return;
    }

    try {
      const res = await api.sendMessage(result.conversationId, {
        text: summaryText,
        messageType: 'call',
        callType: result.callType,
        callStatus: result.callStatus,
        durationSec: result.durationSec,
      });
      if (result.conversationId === selectedConversationId) {
        setMessages((prev) =>
          prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]
        );
      }
      onRefreshConversations();
    } catch {
      // Ignore if offline
    }
  };

  const startVoiceCapture = async (pointerCaptureEl?: HTMLButtonElement | null, pointerId?: number) => {
    if (!activeConv || activeConv.isBlocked || sending || recordingVoice) return;
    if (pointerCaptureEl && pointerId !== undefined) {
      try {
        pointerCaptureEl.setPointerCapture(pointerId);
      } catch {
        // Ignore
      }
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setFeedback(t('chat.voiceUnsupported'));
      return;
    }

    pointerHeldRef.current = true;
    recordDiscardRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!pointerHeldRef.current) {
        stopMediaStream(stream);
        setFeedback(t('chat.recordingTooShort'));
        return;
      }

      recordStreamRef.current = stream;
      recordChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          recordChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        stopMediaStream(recordStreamRef.current);
        recordStreamRef.current = null;
        if (recordTimerRef.current) {
          window.clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        const elapsedMs = Date.now() - recordStartRef.current;
        const durationSec = Math.max(1, Math.round(elapsedMs / 1000));
        const shouldDiscard = recordDiscardRef.current || elapsedMs < 450;

        setRecordingVoice(false);
        setRecordingSec(0);

        if (shouldDiscard) {
          if (!recordDiscardRef.current && elapsedMs < 450) {
            setFeedback(t('chat.recordingTooShort'));
          }
          return;
        }

        const blob = new Blob(recordChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        if (blob.size === 0) return;

        if (activeConv.isFirestoreBacked && onSendFirestoreMessage) {
          try {
            await onSendFirestoreMessage(activeConv, {
              text: t('chat.voiceMessageLabel'),
              messageType: 'voice',
              file: blob,
              fileName: `voice_${Date.now()}.webm`,
              fileSize: blob.size,
              fileMime: blob.type || 'audio/webm',
              durationSec,
            });
          } catch {
            setFeedback(t('chat.voiceUploadError'));
          }
          return;
        }

        try {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          const uploaded = await api.uploadAudio(dataUrl);
          const res = await api.sendMessage(activeConv.id, {
            text: '',
            messageType: 'voice',
            audioUrl: uploaded.url,
            durationSec,
          });
          setMessages((prev) =>
            prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]
          );
          onRefreshConversations();
        } catch {
          setFeedback(t('chat.voiceUploadError'));
        }
      };

      recordStartRef.current = Date.now();
      setRecordingSec(0);
      setRecordingVoice(true);
      recorder.start(200);
      recordTimerRef.current = window.setInterval(() => {
        setRecordingSec(Math.floor((Date.now() - recordStartRef.current) / 1000));
      }, 250);
    } catch (err) {
      pointerHeldRef.current = false;
      const errKind = classifyMediaError(err, false);
      setFeedback(
        errKind === 'not_supported' ? t('chat.voiceUnsupported') : t('chat.micDenied')
      );
    }
  };

  const handleVoicePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    void startVoiceCapture(e.currentTarget, e.pointerId);
  };

  const handleVoicePointerUpOrCancel = (cancel = false) => {
    pointerHeldRef.current = false;
    if (cancel) {
      recordDiscardRef.current = true;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {
        cleanupRecorder(true);
      }
    }
  };

  const handleQuickAccept = async () => {
    if (!activeConv) return;
    try {
      await api.updateClaimStatus(activeConv.claimId, { status: 'accepted' });
      onRefreshConversations();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : t('chat.acceptError'));
    }
  };

  const handleOpenVerificationModal = async () => {
    if (!activeConv) return;
    const scope = user.id === activeConv.donorId ? 'donor' : 'recipient';
    const res = await api.getClaims(scope);
    const matched = res.claims.find((c) => c.id === activeConv.claimId);
    if (matched) {
      onOpenPickupCode(matched, scope);
    }
  };

  const handleOpenReportModal = () => {
    if (!activeConv) return;
    setMenuOpen(false);
    setShopProfileOpen(false);
    setReportReasonKey('r1');
    setReportDetails('');
    setReportModalOpen(true);
  };

  const handleSubmitReport = async () => {
    if (!activeConv) return;
    const peerUid = getPeerUid(activeConv);
    const peerName = getPeerDisplayName(activeConv);
    const reasonText = t(`chat.reportReasons.${reportReasonKey}`);
    if (activeConv.isFirestoreBacked && onReportPeer) {
      await onReportPeer(peerUid, peerName, activeConv.id, reasonText, reportDetails);
    } else {
      await api.submitReport({
        targetType: 'user',
        targetId: peerUid,
        reason: reportDetails ? `${reasonText}: ${reportDetails}` : reasonText,
      });
    }
    setReportModalOpen(false);
    setFeedback(t('chat.reportSubmitted'));
  };

  const handleToggleBlock = async () => {
    if (!activeConv || activeConv.isDemo) return;
    const peerUid = getPeerUid(activeConv);
    const peerName = getPeerDisplayName(activeConv);
    const currentlyBlocked = Boolean(activeConv.blockedByMe || activeConv.isBlocked);
    setMenuOpen(false);
    setShopProfileOpen(false);
    if (activeConv.isFirestoreBacked && onToggleBlockPeer) {
      await onToggleBlockPeer(peerUid, peerName, activeConv.peerHandle, currentlyBlocked);
      setFeedback(
        currentlyBlocked
          ? t('chat.unblockedNotice', { name: peerName })
          : t('chat.blockedConfirm', { name: peerName })
      );
      return;
    }
    await api.toggleBlock(peerUid, currentlyBlocked);
    onRefreshConversations();
  };

  const handleToggleTranslate = async (m: ChatMessage) => {
    if (!m.text) return;
    const existing = translations[m.id];
    if (existing && existing.targetLang === lang) {
      setTranslations((prev) => ({
        ...prev,
        [m.id]: { ...existing, showTranslated: !existing.showTranslated },
      }));
      return;
    }

    setTranslatingIds((prev) => ({ ...prev, [m.id]: true }));
    try {
      const res = await api.translateMessage(m.text, lang);
      setTranslations((prev) => ({
        ...prev,
        [m.id]: { text: res.translated, targetLang: lang, showTranslated: true },
      }));
    } catch {
      setFeedback(t('chat.translationError'));
    } finally {
      setTranslatingIds((prev) => ({ ...prev, [m.id]: false }));
    }
  };

  const updateActivePrefs = (partial: Parameters<typeof saveChatPrefs>[1]) => {
    if (!activeConv) return;
    saveChatPrefs(activeConv.id, partial);
    setPrefsVersion((v) => v + 1);
  };

  const handleResetActivePrefs = () => {
    if (!activeConv) return;
    resetChatPrefs(activeConv.id);
    setNicknameDraft('');
    setPrefsVersion((v) => v + 1);
  };

  const getStatusDisplay = (status: string) => {
    const tone = STATUS_TONE[status] ?? STATUS_TONE.requested;
    const text = t(`chat.statuses.${status}`);
    return { text, tone };
  };

  const startLongPress = (m: ChatMessage, e: React.PointerEvent<HTMLDivElement>) => {
    if (selectionMode || m.messageType === 'call' || m.pending || m.id.startsWith('temp_')) return;
    longPressOriginRef.current = { x: e.clientX, y: e.clientY };
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = window.setTimeout(() => {
      setActionMenuMsg(m);
    }, 460);
  };

  const moveLongPress = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!longPressOriginRef.current || !longPressTimerRef.current) return;
    const dx = Math.abs(e.clientX - longPressOriginRef.current.x);
    const dy = Math.abs(e.clientY - longPressOriginRef.current.y);
    if (dx > 10 || dy > 10) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const cancelLongPress = () => {
    longPressOriginRef.current = null;
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const toggleSelectedMsg = (id: string) => {
    setSelectedMsgIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const formatDateSeparator = useCallback(
    (iso: string) => {
      const d = new Date(iso);
      const now = new Date();
      const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
      const yd = new Date(now.getTime() - 86_400_000);
      const yestKey = `${yd.getFullYear()}-${yd.getMonth()}-${yd.getDate()}`;
      const dKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (dKey === todayKey) return t('chat.dateToday');
      if (dKey === yestKey) return t('chat.dateYesterday');
      return new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-US', {
        month: 'short',
        day: 'numeric',
        year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      }).format(d);
    },
    [lang, t]
  );

  const renderConvRow = (conv: Conversation) => {
    const isDonorMe = user.id === conv.donorId;
    const peerName = getPeerDisplayName(conv);
    const peerAvatar = getPeerAvatarUrl(conv);
    const selected = conv.id === selectedConversationId;
    const status = getStatusDisplay(conv.claimStatus);
    const isMuted = Boolean(conv.isMuted || getChatPrefs(conv.id).muted);
    const isVerifiedPeer = Boolean(conv.peerVerified || (!isDonorMe && conv.donorVerified));
    const subline = conv.isDemo
      ? conv.listingTitle || t('chat.starterDemoBadge')
      : conv.isDirect
        ? conv.peerHandle || conv.peerArea || t('chat.directPeerBadge')
        : conv.listingTitle;

    const previewText =
      conv.lastMessageType === 'voice'
        ? t('chat.voiceMessageLabel')
        : conv.lastMessageType === 'location'
          ? t('chat.sharedLocationLabel')
          : conv.lastMessageType === 'file'
            ? conv.lastMessage || t('chat.sentFileLabel')
            : conv.lastMessageType === 'image' && conv.lastMessage === 'Sent a photo'
              ? t('chat.sentPhoto')
              : conv.lastMessage || status.text;

    return (
      <button
        key={conv.id}
        type="button"
        onClick={() => onSelectConversation(conv.id)}
        className={`w-full p-3.5 flex items-center gap-3 text-left border-b border-[var(--border-subtle)] transition-colors cursor-pointer ${
          selected ? 'bg-[var(--brand-soft)]' : 'hover:bg-[var(--bg-subtle)]'
        }`}
      >
        <ShopAvatar
          name={peerName}
          imageUrl={peerAvatar}
          online={Boolean(conv.peerOnline)}
          showStatusDot
          size="md"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 min-w-0">
              <p className="text-sm font-bold text-[var(--text-primary)] truncate">{peerName}</p>
              {isVerifiedPeer && (
                <BadgeCheck className="w-3.5 h-3.5 text-[var(--brand-text)] shrink-0" />
              )}
              {conv.isOfficial && (
                <span className="px-1.5 py-0.5 rounded-md bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] text-[9px] font-bold shrink-0">
                  {t('adminChat.officialBadge')}
                </span>
              )}
              {conv.isDemo && <DemoBadge compact />}
              {isMuted && (
                <BellOff
                  className="w-3 h-3 text-[var(--text-muted)] shrink-0"
                  aria-label={t('chat.mutedBadge')}
                />
              )}
            </div>
            {conv.lastMessageAt && (
              <span className="text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">
                {formatTime(conv.lastMessageAt)}
              </span>
            )}
          </div>
          <p className="text-xs font-medium text-[var(--text-secondary)] truncate">
            {subline}
          </p>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <p className="text-xs text-[var(--text-muted)] truncate">
              {conv.peerTyping ? (
                <span className="text-[var(--brand-text)] font-semibold">{t('chat.typing')}</span>
              ) : (
                previewText
              )}
            </p>
            {conv.unreadCount > 0 && (
              <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] text-[11px] font-bold flex items-center justify-center tabular-nums shrink-0">
                {formatNumber(conv.unreadCount)}
              </span>
            )}
          </div>
        </div>
      </button>
    );
  };

  const activeConvQueued = activeConv
    ? queued.filter((q) => q.conversationId === activeConv.id)
    : [];

  const activeTheme = CHAT_THEMES.find((th) => th.id === activePrefs.themeId) ?? CHAT_THEMES[0];
  const feedBackground =
    activeTheme.id === 'default'
      ? 'var(--bg-chat-feed)'
      : darkMode
        ? activeTheme.darkBg
        : activeTheme.lightBg;
  const sentBubbleStyle = getSentBubbleStyle(activePrefs.bubbleColor);
  const showQuickRepliesBar = Boolean(activeConv && (displayedMessages.length === 0 || quickRepliesOpen));

  const activePeerName = activeConv ? getPeerDisplayName(activeConv) : '';
  const activePeerAvatar = activeConv ? getPeerAvatarUrl(activeConv) : null;
  const activeStatusLine = activeConv ? formatLastSeenLine(activeConv) : '';
  const activeIsMuted = Boolean(activeConv?.isMuted || activePrefs.muted);

  const renderVerificationChip = (status: AdminConversation['verificationStatus']) => {
    if (status === 'approved') {
      return (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold shrink-0">
          {t('restaurant.statuses.approved')}
        </span>
      );
    }
    if (status === 'rejected') {
      return (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-[10px] font-bold shrink-0">
          {t('restaurant.statuses.rejected')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 text-[10px] font-bold shrink-0">
        {t('restaurant.statuses.pending')}
      </span>
    );
  };

  return (
    <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-xs grid grid-cols-1 lg:grid-cols-12 h-full min-h-[480px] w-full overflow-hidden">
      {/* Inbox Conversation List */}
      <div
        className={`min-w-0 ${
          inboxHiddenOnDesktop ? 'lg:hidden' : 'lg:col-span-4 lg:flex'
        } border-r border-[var(--border-subtle)] flex-col min-h-0 overflow-hidden ${
          hasSelectedThread ? 'hidden' : 'flex'
        }`}
      >
        <div className="px-4 pt-3.5 pb-3 border-b border-[var(--border-subtle)] space-y-2.5 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
              {t('chat.inboxTitle')}
            </h2>
            <div className="flex items-center gap-2">
              {isOnline && wsStatus === 'reconnecting' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[var(--brand-accent-soft)] text-[var(--brand-accent-text)] text-[11px] font-semibold">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  {t('chat.reconnecting')}
                </span>
              )}
              <span className="text-xs text-[var(--text-muted)] tabular-nums">
                {t('chat.threadsCount', { count: totalThreadsCount })}
              </span>
              {(onSelectDirectoryPerson || onStartDirectChat || zeroPiiDirectory.length > 0) && (
                <button
                  type="button"
                  onClick={() => setFindPeopleOpen(true)}
                  className="min-h-[32px] px-2.5 py-1 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <MessageSquarePlus className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('chat.newChatBtn')}</span>
                </button>
              )}
            </div>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={inboxSearch}
              onChange={(e) => setInboxSearch(e.target.value)}
              placeholder={t('chat.searchPlaceholder')}
              className="w-full min-h-[38px] pl-8 pr-8 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-xs focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
            />
            {inboxSearch && (
              <button
                type="button"
                onClick={() => setInboxSearch('')}
                aria-label={t('common.close')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setInboxFilter('all')}
              className={`flex-1 min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                inboxFilter === 'all'
                  ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]'
                  : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {t('chat.filterAll')} ({formatNumber(totalThreadsCount)})
            </button>
            <button
              type="button"
              onClick={() => setInboxFilter('unread')}
              className={`flex-1 min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                inboxFilter === 'unread'
                  ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]'
                  : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {t('chat.filterUnread')} ({formatNumber(unreadThreadsCount)})
            </button>
            <button
              type="button"
              onClick={() => setInboxFilter('archived')}
              className={`flex-1 min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                inboxFilter === 'archived'
                  ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]'
                  : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {t('chat.filterArchived')} ({formatNumber(archivedConvs.length)})
            </button>
          </div>
        </div>

        <div
          ref={inboxScrollRef}
          onScroll={(e) => {
            inboxScrollPosRef.current = e.currentTarget.scrollTop;
          }}
          className="flex-1 min-h-0 overflow-y-auto"
        >
          {/* Zero-PII Messenger People Strip */}
          {zeroPiiDirectory.length > 0 && (
            <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              <div className="px-3.5 pt-2.5 pb-1 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--text-primary)] min-w-0 truncate">
                  <Users className="w-3.5 h-3.5 text-[var(--brand-text)] shrink-0" />
                  <span className="truncate">
                    {t('chat.peopleStripTitle', {
                      loggedIn: formatNumber(onlineDirectoryCount),
                      total: formatNumber(zeroPiiDirectory.length),
                    })}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setFindPeopleOpen(true)}
                  className="text-[11px] font-semibold text-[var(--brand-text)] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {t('chat.viewAllPeople', { count: formatNumber(zeroPiiDirectory.length) })}
                </button>
              </div>
              <div className="flex items-stretch gap-2 overflow-x-auto px-3 pb-2.5 pt-1 no-scrollbar">
                {zeroPiiDirectory.slice(0, 20).map((entry) => {
                  const displayName = entry.restaurantName || entry.displayName;
                  const statusLabel = entry.online ? t('findPeople.onlineNow') : t('findPeople.offline');
                  return (
                    <button
                      key={`strip_${entry.uid}`}
                      type="button"
                      disabled={Boolean(startingUserId)}
                      onClick={() => handleOpenPerson(entry)}
                      title={`${displayName} (${entry.handle}) · ${entry.area}`}
                      className="w-[84px] shrink-0 p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/60 hover:bg-[var(--brand-soft)] hover:border-[var(--brand-primary)]/40 transition-colors flex flex-col items-center gap-1 text-center cursor-pointer disabled:opacity-60"
                    >
                      <ShopAvatar
                        name={displayName}
                        imageUrl={entry.photoURL ?? null}
                        online={entry.online}
                        showStatusDot
                        size="sm"
                      />
                      <span className="w-full text-[11px] font-semibold text-[var(--text-primary)] truncate leading-tight">
                        {displayName}
                      </span>
                      <span className="w-full text-[9px] text-[var(--text-muted)] truncate leading-tight">
                        {entry.handle}
                      </span>
                      <span
                        className={`w-full text-[9px] font-semibold truncate leading-tight ${
                          entry.online
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-[var(--text-muted)]'
                        }`}
                      >
                        {statusLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Admin Real-Time Notifications Section */}
          {isAdmin && (
            <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)]/50">
              <div className="px-4 py-2 flex items-center justify-between gap-2 bg-[var(--bg-subtle)]">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--text-primary)]">
                  <Bell className="w-3.5 h-3.5 text-[var(--brand-text)]" />
                  <span>{t('admin.notificationsTitle')}</span>
                  {unreadAdminNotifCount > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--brand-accent)] text-[var(--brand-accent-fg)] text-[10px] font-bold inline-flex items-center justify-center tabular-nums">
                      {formatNumber(unreadAdminNotifCount)}
                    </span>
                  )}
                </span>
                {unreadAdminNotifCount > 0 && onMarkAllAdminNotificationsRead && (
                  <button
                    type="button"
                    onClick={onMarkAllAdminNotificationsRead}
                    className="text-[11px] font-semibold text-[var(--brand-text)] hover:underline cursor-pointer"
                  >
                    {t('admin.markAllReadBtn')}
                  </button>
                )}
              </div>

              {filteredAdminNotifications.length === 0 ? (
                <p className="px-4 py-3 text-[11px] text-[var(--text-muted)]">
                  {t('admin.notificationsEmpty')}
                </p>
              ) : (
                <div className="divide-y divide-[var(--border-subtle)] max-h-64 overflow-y-auto">
                  {filteredAdminNotifications.map((n) => {
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
                        key={n.id}
                        className={`px-3.5 py-2.5 flex items-start gap-2.5 text-xs ${
                          !n.read ? 'bg-[var(--brand-soft)]/50' : ''
                        }`}
                      >
                        <span
                          className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                            !n.read ? 'bg-[var(--brand-accent)]' : 'bg-transparent'
                          }`}
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="font-semibold text-[var(--text-primary)] leading-snug">
                            {notifTitle}
                          </p>
                          {n.messagePreview && (
                            <p className="text-[11px] text-[var(--text-muted)] truncate">
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
                                    onMarkAdminNotificationRead?.(n.id);
                                    onSelectConversation(`admin_${n.ownerUid}`);
                                  }}
                                  className="px-2 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[11px] font-semibold text-[var(--text-primary)] cursor-pointer"
                                >
                                  {t('nav.chat')}
                                </button>
                              )}
                              {onReviewApplication && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onMarkAdminNotificationRead?.(n.id);
                                    onReviewApplication(n.ownerUid);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-[11px] font-semibold cursor-pointer"
                                >
                                  {t('admin.reviewBtn')}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Pinned Official Team Conversation for Restaurant Owners */}
          {showPinnedOwnerConv && pinnedOwnerConv && (
            <button
              type="button"
              onClick={() => onSelectConversation(pinnedOwnerConv.id)}
              className={`w-full p-3.5 flex items-center gap-3 text-left border-b border-[var(--border-subtle)] transition-colors cursor-pointer ${
                selectedConversationId === pinnedOwnerConv.id
                  ? 'bg-[var(--brand-soft)]'
                  : 'bg-[var(--brand-soft)]/35 hover:bg-[var(--brand-soft)]/70'
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                      {t('adminChat.teamName')}
                    </p>
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] text-[10px] font-bold shrink-0">
                      <BadgeCheck className="w-2.5 h-2.5" />
                      {t('adminChat.officialBadge')}
                    </span>
                  </div>
                  {pinnedOwnerConv.lastMessageAt && (
                    <span className="text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">
                      {formatTime(pinnedOwnerConv.lastMessageAt)}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className="text-xs text-[var(--text-secondary)] truncate">
                    {pinnedOwnerConv.lastMessage ||
                      (user.accountType === 'restaurantOwner'
                        ? t('adminChat.pinnedTeamDesc')
                        : t('adminChat.pinnedUserDesc'))}
                  </p>
                  {pinnedOwnerConv.ownerUnreadCount > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] text-[11px] font-bold flex items-center justify-center tabular-nums shrink-0">
                      {formatNumber(pinnedOwnerConv.ownerUnreadCount)}
                    </span>
                  )}
                </div>
              </div>
            </button>
          )}

          {/* Admin User & Restaurant Owner Conversations List */}
          {isAdmin && filteredAdminConvs.length > 0 && (
            <div>
              <p className="px-4 py-2 text-[11px] font-semibold text-[var(--text-muted)] bg-[var(--bg-subtle)]">
                {t('adminChat.userThreadsHeading', { count: filteredAdminConvs.length })}
              </p>
              {filteredAdminConvs.map((conv) => {
                const selected = conv.id === selectedConversationId;
                const isNormalUser = isNormalUserConv(conv);
                const convTitle = isNormalUser ? conv.ownerName : conv.restaurantName;
                const convSubtitle = isNormalUser
                  ? t('adminChat.directUserSubtitle')
                  : conv.ownerName;
                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => onSelectConversation(conv.id)}
                    className={`w-full p-3.5 flex items-center gap-3 text-left border-b border-[var(--border-subtle)] transition-colors cursor-pointer ${
                      selected ? 'bg-[var(--brand-soft)]' : 'hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    <ShopAvatar
                      name={convTitle}
                      imageUrl={conv.restaurantLogoUrl}
                      size="md"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                            {convTitle}
                          </p>
                          {isNormalUser ? (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-[var(--brand-soft)] text-[var(--brand-text)] text-[10px] font-bold shrink-0">
                              {t('chat.roleMember')}
                            </span>
                          ) : (
                            renderVerificationChip(conv.verificationStatus)
                          )}
                        </div>
                        {conv.lastMessageAt && (
                          <span className="text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">
                            {formatTime(conv.lastMessageAt)}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] truncate">
                        {convSubtitle}
                      </p>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-xs text-[var(--text-muted)] truncate">
                          {conv.lastMessage || t('adminChat.emptyThreadTitle')}
                        </p>
                        {conv.adminUnreadCount > 0 && (
                          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] text-[11px] font-bold flex items-center justify-center tabular-nums shrink-0">
                            {formatNumber(conv.adminUnreadCount)}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Pinned Rizik Community Rooms */}
          {filteredRooms.length > 0 && (
            <div className="border-b border-[var(--border-subtle)]">
              <p className="px-4 py-2 text-[11px] font-bold text-[var(--brand-text)] bg-[var(--brand-soft)]/45 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  {t('rooms.pinnedHeading')}
                </span>
                <span className="text-[10px] font-semibold text-[var(--text-muted)] tabular-nums">
                  {formatNumber(filteredRooms.length)}
                </span>
              </p>
              {filteredRooms.map((room) => {
                const selected = room.id === selectedConversationId;
                const roomName = lang === 'bn' ? room.nameBn || room.name : room.name;
                return (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => onSelectConversation(room.id)}
                    className={`w-full p-3.5 flex items-center gap-3 text-left border-b border-[var(--border-subtle)] last:border-b-0 transition-colors cursor-pointer ${
                      selected ? 'bg-[var(--brand-soft)]' : 'hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    <div className="w-11 h-11 rounded-2xl bg-[var(--brand-soft)] text-[var(--brand-text)] border border-[var(--brand-primary)]/20 flex items-center justify-center shrink-0">
                      {room.iconKey === 'restaurant' ? (
                        <Store className="w-5 h-5" />
                      ) : room.iconKey === 'volunteer' ? (
                        <HeartHandshake className="w-5 h-5" />
                      ) : (
                        <Users className="w-5 h-5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                            {roomName}
                          </p>
                          <span className="px-1.5 py-0.5 rounded-md bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[9px] font-bold text-[var(--text-secondary)] tabular-nums shrink-0">
                            {formatNumber(room.memberCount)}
                          </span>
                        </div>
                        {room.lastMessageAt && (
                          <span className="text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">
                            {formatTime(room.lastMessageAt)}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {formatNumber(room.onlineCount)} {t('rooms.onlineLabel')}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                        {room.lastMessageSenderName ? `${room.lastMessageSenderName}: ` : ''}
                        {room.lastMessage}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {totalThreadsCount === 0 &&
          archivedConvs.length === 0 &&
          filteredAdminNotifications.length === 0 &&
          filteredRooms.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <MessageSquare className="w-8 h-8 text-[var(--text-muted)] opacity-50 mx-auto" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {t('chat.emptyInboxTitle')}
              </p>
              <p className="text-xs text-[var(--text-muted)]">{t('chat.emptyInboxSubtitle')}</p>
            </div>
          ) : filteredConversations.length === 0 &&
            filteredAdminConvs.length === 0 &&
            !showPinnedOwnerConv &&
            filteredAdminNotifications.length === 0 &&
            filteredRooms.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <Search className="w-7 h-7 text-[var(--text-muted)] opacity-50 mx-auto" />
              <p className="text-xs font-semibold text-[var(--text-secondary)]">
                {t('chat.noMatchingShops')}
              </p>
            </div>
          ) : (
            <>
              {directRealConvs.length > 0 && (
                <div>
                  <p className="px-4 py-2 text-[11px] font-semibold text-[var(--text-muted)] bg-[var(--bg-subtle)]">
                    {t('chat.directPeerBadge')} ({formatNumber(directRealConvs.length)})
                  </p>
                  {directRealConvs.map(renderConvRow)}
                </div>
              )}
              {activeConvs.length > 0 && (
                <div>
                  <p className="px-4 py-2 text-[11px] font-semibold text-[var(--text-muted)] bg-[var(--bg-subtle)]">
                    {t('chat.activePickups', { count: activeConvs.length })}
                  </p>
                  {activeConvs.map(renderConvRow)}
                </div>
              )}
              {demoConvs.length > 0 && (
                <div>
                  <p className="px-4 py-2 text-[11px] font-semibold text-[var(--text-muted)] bg-[var(--bg-subtle)]">
                    {t('chat.starterDemoBadge')} ({formatNumber(demoConvs.length)})
                  </p>
                  {demoConvs.map(renderConvRow)}
                </div>
              )}
              {closedConvs.length > 0 && (
                <div>
                  <p className="px-4 py-2 text-[11px] font-semibold text-[var(--text-muted)] bg-[var(--bg-subtle)]">
                    {t('chat.completedClosed', { count: closedConvs.length })}
                  </p>
                  {closedConvs.map(renderConvRow)}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Active Conversation Thread */}
      <div
        className={`min-w-0 ${
          inboxHiddenOnDesktop ? 'lg:col-span-12' : 'lg:col-span-8'
        } flex-col min-h-0 ${hasSelectedThread ? 'flex' : 'hidden lg:flex'}`}
      >
        {activeAdminConv ? (
          <AdminChatThread
            conversation={activeAdminConv}
            currentUser={user}
            isAdminView={Boolean(isAdmin)}
            isNormalUserThread={
              isAdmin ? isNormalUserConv(activeAdminConv) : user.accountType !== 'restaurantOwner'
            }
            onBack={() => {
              setInboxHiddenOnDesktop(false);
              onSelectConversation(null);
            }}
            onReviewApplication={isAdmin ? onReviewApplication : undefined}
          />
        ) : activeRoom ? (
          <CommunityRoomView
            room={activeRoom}
            user={user}
            isAdmin={Boolean(isAdmin)}
            isOnline={isOnline}
            messages={roomMessages}
            members={roomMembers}
            hasMoreMessages={roomHasMore}
            loadingMoreMessages={loadingMoreRoom}
            blockedUids={blockedUids}
            directoryEntries={zeroPiiDirectory}
            sidebarOpenOnDesktop={!inboxHiddenOnDesktop}
            onShowSidebarDesktop={() => setInboxHiddenOnDesktop(false)}
            onBackMobile={() => {
              setInboxHiddenOnDesktop(false);
              onSelectConversation(null);
            }}
            onLoadOlderMessages={() => onLoadOlderRoomMessages?.()}
            onSendMessage={async (payload) => {
              if (onSendRoomMessage) {
                await onSendRoomMessage(activeRoom, payload);
              }
            }}
            onReactMessage={async (msg, emoji) => {
              if (onReactRoomMessage) {
                await onReactRoomMessage(activeRoom.id, msg, emoji);
              }
            }}
            onReportMessage={async (msg, reason) => {
              if (onReportRoomMessage) {
                await onReportRoomMessage(activeRoom.id, msg, reason);
              }
            }}
            onAdminSetDeleted={async (msg, deleted) => {
              if (onAdminSetRoomMessageDeleted) {
                await onAdminSetRoomMessageDeleted(activeRoom.id, msg, deleted);
              }
            }}
            onAdminToggleMute={async (targetUid, mute) => {
              if (onAdminToggleMuteRoomUser) {
                await onAdminToggleMuteRoomUser(activeRoom.id, targetUid, mute);
              }
            }}
            onStartDirectChat={handleOpenPerson}
            onToggleBlock={
              onToggleBlockPeer
                ? async (entry) => {
                    const currentlyBlocked = blockedUids?.has(entry.uid) ?? false;
                    await onToggleBlockPeer(
                      entry.uid,
                      entry.displayName,
                      entry.handle,
                      currentlyBlocked
                    );
                  }
                : undefined
            }
            onReportUser={
              onReportPeer
                ? async (entry) => {
                    await onReportPeer(
                      entry.uid,
                      entry.displayName,
                      activeRoom.id,
                      'Reported from community room'
                    );
                  }
                : undefined
            }
          />
        ) : !activeConv ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-2 text-[var(--text-muted)]">
            <MessageSquare className="w-10 h-10 opacity-40" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {t('chat.selectConvTitle')}
            </p>
            <p className="text-xs max-w-xs">{t('chat.selectConvSubtitle')}</p>
          </div>
        ) : (
          <>
            {/* Fixed, Always-Visible Chat Header (never obscured by outer navbar) */}
            <div className="sticky top-0 z-20 shrink-0 px-2 sm:px-4 py-2.5 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] flex items-center justify-between gap-1 sm:gap-2">
              <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1">
                {/* Back button: always visible on mobile, and visible on desktop whenever Inbox list is hidden */}
                <button
                  type="button"
                  onClick={() => {
                    setInboxHiddenOnDesktop(false);
                    onSelectConversation(null);
                  }}
                  aria-label={t('chat.backToInbox')}
                  title={t('chat.backToInbox')}
                  className={`${
                    inboxHiddenOnDesktop ? 'flex' : 'flex lg:hidden'
                  } min-h-[42px] min-w-[38px] sm:min-w-[42px] items-center justify-center rounded-xl hover:bg-[var(--bg-subtle)] text-[var(--text-primary)] shrink-0 cursor-pointer`}
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                {/* Tapping avatar or shop name opens Shop Profile */}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setAttachMenuOpen(false);
                    setShopProfileOpen(true);
                  }}
                  title={t('shopProfile.title')}
                  className="flex items-center gap-2.5 min-w-0 flex-1 text-left rounded-xl px-1.5 py-1 hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer group"
                >
                  <ShopAvatar
                    name={activePeerName}
                    imageUrl={activePeerAvatar}
                    online={Boolean(activeConv.peerOnline)}
                    showStatusDot
                    size="md"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <h3 className="font-display text-sm font-bold text-[var(--text-primary)] truncate">
                        {activePeerName}
                      </h3>
                      {(activeConv.peerVerified ||
                        (user.id !== activeConv.donorId && activeConv.donorVerified)) && (
                        <BadgeCheck
                          className="w-4 h-4 text-[var(--brand-text)] shrink-0"
                          aria-label={t('common.verifiedDonor')}
                        />
                      )}
                      {activeConv.isOfficial && (
                        <span className="px-1.5 py-0.5 rounded-md bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] text-[10px] font-bold shrink-0">
                          {t('adminChat.officialBadge')}
                        </span>
                      )}
                      {activeConv.isDemo && <DemoBadge compact />}
                      {activeIsMuted && (
                        <BellOff
                          className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0"
                          aria-label={t('chat.mutedBadge')}
                        />
                      )}
                    </div>
                    <p
                      className={`text-xs truncate ${
                        activeConv.peerTyping || typingByConv[activeConv.id]
                          ? 'text-[var(--brand-text)] font-semibold'
                          : activeConv.peerOnline
                            ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                            : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {activeStatusLine}
                      {activeConv.peerHandle ? ` · ${activeConv.peerHandle}` : ''}
                    </p>
                  </div>
                </button>
              </div>

              <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                {isOnline && wsStatus === 'reconnecting' && (
                  <span className="hidden md:inline-flex items-center gap-1 px-2 py-1 rounded-xl bg-[var(--brand-accent-soft)] text-[var(--brand-accent-text)] text-[11px] font-semibold">
                    <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
                    {t('chat.reconnecting')}
                  </span>
                )}

                {/* Desktop toggle to collapse/show inbox beside chat */}
                <button
                  type="button"
                  onClick={() => setInboxHiddenOnDesktop((v) => !v)}
                  aria-label={inboxHiddenOnDesktop ? t('chat.showInbox') : t('chat.hideInbox')}
                  title={inboxHiddenOnDesktop ? t('chat.showInbox') : t('chat.hideInbox')}
                  className="hidden lg:flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  {inboxHiddenOnDesktop ? (
                    <PanelLeftOpen className="w-4 h-4" />
                  ) : (
                    <PanelLeftClose className="w-4 h-4" />
                  )}
                </button>

                <button
                  type="button"
                  disabled={activeConv.isBlocked}
                  onClick={() => handleStartCall('voice', 'outgoing')}
                  aria-label={t('chat.voiceCallBtn')}
                  title={t('chat.voiceCallBtn')}
                  className="min-h-[40px] min-w-[36px] sm:min-h-[42px] sm:min-w-[42px] flex items-center justify-center rounded-xl hover:bg-[var(--bg-subtle)] text-[var(--brand-text)] disabled:opacity-40 transition-colors cursor-pointer"
                >
                  <Phone className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  disabled={activeConv.isBlocked}
                  onClick={() => handleStartCall('video', 'outgoing')}
                  aria-label={t('chat.videoCallBtn')}
                  title={t('chat.videoCallBtn')}
                  className="min-h-[40px] min-w-[36px] sm:min-h-[42px] sm:min-w-[42px] flex items-center justify-center rounded-xl hover:bg-[var(--bg-subtle)] text-[var(--brand-text)] disabled:opacity-40 transition-colors cursor-pointer"
                >
                  <Video className="w-4 h-4" />
                </button>

                {/* ⋮ Menu with backdrop click-outside protection (never vanishes unexpectedly) */}
                <div className="relative">
                  <button
                    type="button"
                    aria-label={t('chat.safetyMenu')}
                    aria-expanded={menuOpen}
                    onClick={(e) => {
                      e.stopPropagation();
                      setAttachMenuOpen(false);
                      setMenuOpen((o) => !o);
                    }}
                    className="min-h-[40px] min-w-[36px] sm:min-h-[42px] sm:min-w-[42px] flex items-center justify-center rounded-xl hover:bg-[var(--bg-subtle)] cursor-pointer"
                  >
                    <MoreVertical className="w-5 h-5 text-[var(--text-muted)]" />
                  </button>
                  {menuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setMenuOpen(false)}
                      />
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 mt-1.5 w-60 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-2xl py-1.5 z-40"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            setShopProfileOpen(true);
                          }}
                          className="w-full px-4 py-2.5 text-left text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] flex items-center gap-2.5 cursor-pointer"
                        >
                          <Store className="w-4 h-4 text-[var(--brand-text)] shrink-0" />
                          {t('chat.viewShopProfile')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            setChatSettingsOpen(true);
                          }}
                          className="w-full px-4 py-2.5 text-left text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] flex items-center gap-2.5 cursor-pointer"
                        >
                          <Palette className="w-4 h-4 text-[var(--brand-text)] shrink-0" />
                          {t('chat.chatSettings')}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const nextMuted = !activeIsMuted;
                            updateActivePrefs({ muted: nextMuted });
                            if (activeConv.isFirestoreBacked && onToggleMuteConv) {
                              await onToggleMuteConv(activeConv, nextMuted).catch(() => {});
                            }
                            setMenuOpen(false);
                          }}
                          className="w-full px-4 py-2.5 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] flex items-center gap-2.5 cursor-pointer"
                        >
                          {activeIsMuted ? (
                            <Bell className="w-4 h-4 text-[var(--brand-text)] shrink-0" />
                          ) : (
                            <BellOff className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                          )}
                          {activeIsMuted ? t('chat.unmuteChat') : t('chat.muteChat')}
                        </button>
                        {activeConv.isFirestoreBacked && onToggleArchiveConv && (
                          <button
                            type="button"
                            onClick={async () => {
                              setMenuOpen(false);
                              await onToggleArchiveConv(activeConv, !activeConv.isArchived).catch(
                                () => {}
                              );
                            }}
                            className="w-full px-4 py-2.5 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] flex items-center gap-2.5 cursor-pointer"
                          >
                            <Archive className="w-4 h-4 text-[var(--brand-text)] shrink-0" />
                            {activeConv.isArchived ? t('chat.unarchiveChat') : t('chat.archiveChat')}
                          </button>
                        )}
                        {activeConv.isFirestoreBacked && onDeleteConvForMe && (
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpen(false);
                              setDeleteConvConfirmOpen(true);
                            }}
                            className="w-full px-4 py-2.5 text-left text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/35 flex items-center gap-2.5 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4 shrink-0" />
                            {t('chat.deleteChatForMe')}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={activeConv.isBlocked}
                          onClick={() => handleStartCall('video', 'incoming')}
                          className="w-full px-4 py-2.5 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-45 flex items-center gap-2.5 cursor-pointer"
                        >
                          <PhoneIncoming className="w-4 h-4 text-[var(--brand-text)] shrink-0" />
                          {t('chat.simulateIncomingCall')}
                        </button>
                        {!activeConv.isDemo && (
                          <>
                            <div className="my-1 border-t border-[var(--border-subtle)]" />
                            <button
                              type="button"
                              onClick={handleOpenReportModal}
                              className="w-full px-4 py-2.5 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] flex items-center gap-2.5 cursor-pointer"
                            >
                              <Flag className="w-4 h-4 text-[var(--brand-accent-text)] shrink-0" />
                              {t('chat.reportUser')}
                            </button>
                            <button
                              type="button"
                              onClick={handleToggleBlock}
                              className="w-full px-4 py-2.5 text-left text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/35 flex items-center gap-2.5 cursor-pointer"
                            >
                              <Ban className="w-4 h-4 shrink-0" />
                              {activeConv.isBlocked ? t('chat.unblockUser') : t('chat.blockUser')}
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Messenger-style Chat Settings Drawer */}
            {chatSettingsOpen && (
              <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 max-h-80 overflow-y-auto space-y-4 shrink-0">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="font-display text-sm font-bold text-[var(--text-primary)]">
                      {t('chat.chatSettings')}
                    </h4>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {t('chat.chatSettingsHint')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleResetActivePrefs}
                      className="min-h-[34px] px-2.5 py-1 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[11px] font-semibold text-[var(--text-secondary)] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      {t('chat.resetChatSettings')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setChatSettingsOpen(false)}
                      aria-label={t('common.close')}
                      className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-xl hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Chat Themes */}
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    {t('chat.chatThemeLabel')}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {CHAT_THEMES.map((theme) => {
                      const active = activePrefs.themeId === theme.id;
                      return (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() => updateActivePrefs({ themeId: theme.id })}
                          className={`p-2 rounded-xl border text-left transition-all flex items-center gap-2 cursor-pointer ${
                            active
                              ? 'border-[var(--brand-primary)] bg-[var(--brand-soft)] ring-1 ring-[var(--brand-primary)]'
                              : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--border-strong)]'
                          }`}
                        >
                          <span
                            className="w-6 h-6 rounded-lg border border-black/10 dark:border-white/15 shrink-0 flex items-center justify-center"
                            style={{ background: theme.swatch }}
                          >
                            {active && <Check className="w-3.5 h-3.5 text-slate-900" />}
                          </span>
                          <span className="text-[11px] font-semibold text-[var(--text-primary)] truncate">
                            {t(`chat.themes.${theme.id}`)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Sent Bubble Color */}
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    {t('chat.bubbleColorLabel')}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {BUBBLE_COLOR_PRESETS.map((preset) => {
                      const active = activePrefs.bubbleColor.toLowerCase() === preset.hex.toLowerCase();
                      const swatchBg =
                        preset.hex === 'theme'
                          ? 'linear-gradient(135deg, var(--brand-primary), var(--brand-accent))'
                          : preset.hex;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => updateActivePrefs({ bubbleColor: preset.hex })}
                          title={preset.id === 'theme' ? t('chat.defaultBubble') : preset.id}
                          className={`h-8 px-2.5 rounded-xl border inline-flex items-center gap-1.5 text-[11px] font-semibold transition-all cursor-pointer ${
                            active
                              ? 'border-[var(--brand-primary)] ring-2 ring-[var(--brand-primary)] bg-[var(--brand-soft)] text-[var(--text-primary)]'
                              : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                          }`}
                        >
                          <span
                            className="w-4 h-4 rounded-full border border-black/15 shrink-0"
                            style={{ background: swatchBg }}
                          />
                          {preset.id === 'theme' && <span>{t('chat.defaultBubble')}</span>}
                        </button>
                      );
                    })}

                    <label className="h-8 px-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)] cursor-pointer">
                      <input
                        type="color"
                        value={
                          activePrefs.bubbleColor === 'theme' ? '#15803d' : activePrefs.bubbleColor
                        }
                        onChange={(e) => updateActivePrefs({ bubbleColor: e.target.value })}
                        aria-label={t('chat.pickBubbleColor')}
                        className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0"
                      />
                      <span>{t('palette.names.custom')}</span>
                    </label>
                  </div>
                </div>

                {/* Quick Reaction Emoji & Nickname */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      {t('chat.quickEmojiLabel')}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_EMOJIS.map((emoji) => {
                        const active = activePrefs.quickEmoji === emoji;
                        return (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => updateActivePrefs({ quickEmoji: emoji })}
                            className={`w-9 h-9 rounded-xl border text-base flex items-center justify-center transition-all cursor-pointer ${
                              active
                                ? 'border-[var(--brand-primary)] bg-[var(--brand-soft)] ring-1 ring-[var(--brand-primary)] scale-105'
                                : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--border-strong)]'
                            }`}
                          >
                            {emoji}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      {t('chat.nicknameLabel')}
                    </p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        updateActivePrefs({ nickname: nicknameDraft.trim() });
                      }}
                      className="flex items-center gap-2"
                    >
                      <input
                        type="text"
                        value={nicknameDraft}
                        onChange={(e) => setNicknameDraft(e.target.value)}
                        placeholder={t('chat.nicknamePlaceholder')}
                        maxLength={40}
                        className="flex-1 min-w-0 min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-xs focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                      />
                      <button
                        type="submit"
                        className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold cursor-pointer"
                      >
                        {t('chat.saveNickname')}
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )}

            {/* Pinned Listing Card or Direct Support / Peer Banner */}
            {activeConv.isDirect ? (
              <div className="px-3 sm:px-4 py-2 bg-[var(--bg-subtle)] border-b border-[var(--border-subtle)] flex items-center justify-between gap-2.5 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] flex items-center justify-center shrink-0">
                    {activeConv.isOfficial ||
                    activeConv.donorRole === 'admin' ||
                    activeConv.recipientRole === 'admin' ? (
                      <ShieldCheck className="w-4 h-4" />
                    ) : (
                      <MessageSquare className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-xs font-bold text-[var(--text-primary)] truncate">
                        {activeConv.isDemo
                          ? t('chat.starterDemoBadge')
                          : activeConv.isOfficial ||
                              activeConv.donorRole === 'admin' ||
                              activeConv.recipientRole === 'admin'
                            ? t('chat.directChatBadge')
                            : t('chat.directPeerBadge')}
                      </p>
                      {activeConv.peerHandle && (
                        <span className="text-[10px] font-medium text-[var(--brand-text)] truncate">
                          {activeConv.peerHandle}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">
                      {activeConv.isDemo
                        ? t('chat.starterSeedDesc')
                        : activeConv.donorRole === 'admin' || activeConv.recipientRole === 'admin'
                          ? t('adminChat.directUserSubtitle')
                          : t('chat.directPeerSubtitle')}
                    </p>
                  </div>
                </div>
                {activeConv.isArchived && (
                  <span className="px-2 py-0.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[10px] font-semibold text-[var(--text-muted)] shrink-0">
                    {t('chat.filterArchived')}
                  </span>
                )}
              </div>
            ) : (
              <div className="px-3 sm:px-4 py-2 bg-[var(--bg-subtle)] border-b border-[var(--border-subtle)] flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 sm:gap-3 shrink-0">
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                  <FoodImage
                    src={activeConv.listingPhoto}
                    alt={activeConv.listingTitle}
                    className="w-10 h-10 rounded-xl shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[var(--text-primary)] truncate">
                      {activeConv.listingTitle}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--text-muted)] tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3 shrink-0" />
                        {formatWindow(activeConv.pickupStart, activeConv.pickupEnd)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className={`font-semibold ${getStatusDisplay(activeConv.claimStatus).tone}`}>
                        {getStatusDisplay(activeConv.claimStatus).text}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {user.id === activeConv.donorId && activeConv.claimStatus === 'requested' && (
                    <button
                      type="button"
                      onClick={handleQuickAccept}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold whitespace-nowrap cursor-pointer"
                    >
                      {t('chat.acceptBtn')}
                    </button>
                  )}
                  {activeConv.claimStatus === 'accepted' && (
                    <button
                      type="button"
                      onClick={handleOpenVerificationModal}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--brand-accent)] hover:bg-[var(--brand-accent-hover)] text-[var(--brand-accent-fg)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      {user.id === activeConv.donorId ? (
                        <>
                          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                          {t('chat.verifyCodeBtn')}
                        </>
                      ) : (
                        <>
                          <QrCode className="w-3.5 h-3.5 shrink-0" />
                          {t('chat.codeBadge', { code: activeConv.pickupCode ?? '' })}
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}

            {feedback && (
              <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between gap-2 shrink-0">
                <span>{feedback}</span>
                <button
                  type="button"
                  onClick={() => setFeedback(null)}
                  className="font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {t('common.dismiss')}
                </button>
              </div>
            )}

            {/* Message Feed with Per-Chat Theme */}
            <div
              ref={feedScrollRef}
              onScroll={(e) => {
                if (
                  activeConv.isFirestoreBacked &&
                  hasMoreMessages &&
                  !loadingMoreMessages &&
                  onLoadOlderMessages &&
                  e.currentTarget.scrollTop < 36
                ) {
                  const now = Date.now();
                  if (now - loadingOlderThrottleRef.current > 800) {
                    loadingOlderThrottleRef.current = now;
                    prevScrollHeightRef.current = e.currentTarget.scrollHeight;
                    onLoadOlderMessages();
                  }
                }
              }}
              className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3 transition-colors duration-300"
              style={{
                background: feedBackground,
                backgroundSize: activeTheme.id === 'botanical-dots' ? '18px 18px' : undefined,
              }}
            >
              {activeConv.isFirestoreBacked && hasMoreMessages && onLoadOlderMessages && (
                <div className="flex justify-center pb-1">
                  <button
                    type="button"
                    disabled={loadingMoreMessages}
                    onClick={() => {
                      if (feedScrollRef.current) {
                        prevScrollHeightRef.current = feedScrollRef.current.scrollHeight;
                      }
                      onLoadOlderMessages();
                    }}
                    className="px-3 py-1 rounded-xl bg-[var(--bg-surface)]/90 border border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--brand-text)] hover:bg-[var(--bg-subtle)] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {loadingMoreMessages && <Loader2 className="w-3 h-3 animate-spin" />}
                    <span>
                      {loadingMoreMessages
                        ? t('chat.loadingOlderMessages')
                        : t('chat.loadOlderMessages')}
                    </span>
                  </button>
                </div>
              )}

              {loadingMsgs && !activeConv.isFirestoreBacked ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-12 w-2/3 bg-slate-200 dark:bg-[#2a2a2a] rounded-2xl" />
                  <div className="h-12 w-1/2 bg-slate-200 dark:bg-[#2a2a2a] rounded-2xl ml-auto" />
                </div>
              ) : (
                displayedMessages.map((m, msgIndex) => {
                  const isMine = m.senderId === user.id;
                  const isQueued = activeConvQueued.some((q) => q.clientTempId === m.id) || m.pending;
                  const trState = translations[m.id];
                  const showingTranslation =
                    trState && trState.targetLang === lang && trState.showTranslated;
                  const isTranslating = Boolean(translatingIds[m.id]);
                  const isSelected = selectedMsgIds.includes(m.id);

                  const curDate = new Date(m.sentAt);
                  const curDayKey = `${curDate.getFullYear()}-${curDate.getMonth()}-${curDate.getDate()}`;
                  const prevDate = msgIndex > 0 ? new Date(displayedMessages[msgIndex - 1].sentAt) : null;
                  const prevDayKey = prevDate
                    ? `${prevDate.getFullYear()}-${prevDate.getMonth()}-${prevDate.getDate()}`
                    : null;
                  const showDateDivider = msgIndex === 0 || curDayKey !== prevDayKey;

                  const reactionSummary = (m.reactions ?? []).reduce<
                    Record<string, { count: number; mine: boolean }>
                  >((acc, r) => {
                    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, mine: false };
                    acc[r.emoji].count += 1;
                    if (r.userId === user.id) acc[r.emoji].mine = true;
                    return acc;
                  }, {});
                  const reactionEntries = Object.entries(reactionSummary);

                  // Call history pill entry
                  if (m.messageType === 'call') {
                    const isMissedOrDeclined =
                      m.callStatus === 'missed' ||
                      m.callStatus === 'declined' ||
                      m.callStatus === 'cancelled';
                    const CallIcon = isMissedOrDeclined
                      ? PhoneMissed
                      : m.callType === 'video'
                        ? Video
                        : Phone;
                    const callTypeWord =
                      m.callType === 'video' ? t('chat.callTypeVideo') : t('chat.callTypeVoice');
                    const callLabel =
                      m.callStatus === 'completed'
                        ? m.callType === 'video'
                          ? t('chat.callHistoryVideo', {
                              duration: formatCallDurationShort(m.durationSec ?? 0),
                            })
                          : t('chat.callHistoryVoice', {
                              duration: formatCallDurationShort(m.durationSec ?? 0),
                            })
                        : m.callStatus === 'declined'
                          ? t('chat.callHistoryDeclined', { type: callTypeWord })
                          : m.callStatus === 'cancelled'
                            ? t('chat.callHistoryCancelled', { type: callTypeWord })
                            : t('chat.callHistoryMissed', { type: callTypeWord });

                    return (
                      <div key={m.id} className="space-y-2">
                        {showDateDivider && (
                          <div className="flex justify-center py-1">
                            <span className="px-3 py-0.5 rounded-xl bg-[var(--bg-surface)]/88 border border-[var(--border-subtle)] text-[10px] font-semibold text-[var(--text-muted)]">
                              {formatDateSeparator(m.sentAt)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-center py-1">
                          <div className="px-3.5 py-1.5 rounded-full bg-[var(--bg-surface)]/92 border border-[var(--border-subtle)] shadow-xs inline-flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                            <CallIcon
                              className={`w-3.5 h-3.5 shrink-0 ${
                                isMissedOrDeclined
                                  ? 'text-red-500 dark:text-red-400'
                                  : 'text-[var(--brand-text)]'
                              }`}
                            />
                            <span className="font-semibold text-[var(--text-primary)]">
                              {callLabel}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                              {formatTime(m.sentAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={m.id}
                      onClick={() => {
                        if (selectionMode) toggleSelectedMsg(m.id);
                      }}
                      className={`group flex flex-col ${isMine ? 'items-end' : 'items-start'} ${
                        selectionMode ? 'cursor-pointer' : ''
                      }`}
                    >
                      {showDateDivider && (
                        <div className="self-center flex justify-center py-1.5 mb-1">
                          <span className="px-3 py-0.5 rounded-xl bg-[var(--bg-surface)]/88 border border-[var(--border-subtle)] text-[10px] font-semibold text-[var(--text-muted)]">
                            {formatDateSeparator(m.sentAt)}
                          </span>
                        </div>
                      )}
                      <div
                        className={`flex items-end gap-1.5 max-w-[92%] sm:max-w-[78%] min-w-0 ${
                          isMine ? 'flex-row-reverse' : 'flex-row'
                        }`}
                      >
                        {selectionMode && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSelectedMsg(m.id);
                            }}
                            aria-label={t('msgActions.selectMultiple')}
                            className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mb-1 cursor-pointer ${
                              isSelected
                                ? 'bg-[var(--brand-primary)] border-[var(--brand-primary)] text-[var(--brand-primary-fg)]'
                                : 'border-[var(--border-strong)] bg-[var(--bg-surface)]'
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5" />}
                          </button>
                        )}

                        {/* Shop avatar beside every received message */}
                        {!isMine && (
                          <ShopAvatar
                            name={activePeerName}
                            imageUrl={activePeerAvatar}
                            size="xs"
                            className="mb-0.5"
                          />
                        )}

                        {/* Bubble with long-press support */}
                        <div
                          onPointerDown={(e) => startLongPress(m, e)}
                          onPointerMove={moveLongPress}
                          onPointerUp={cancelLongPress}
                          onPointerCancel={cancelLongPress}
                          className={`min-w-0 max-w-full rounded-2xl px-3 sm:px-3.5 py-2.5 text-sm space-y-2 break-words shadow-xs select-text ${
                            isMine
                              ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] rounded-br-sm'
                              : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-bl-sm'
                          } ${isSelected ? 'ring-2 ring-[var(--brand-accent)]' : ''}`}
                          style={isMine ? sentBubbleStyle : undefined}
                        >
                          {(m.isForwarded || m.forwardedFrom) && (
                            <p
                              className={`text-[10px] font-semibold inline-flex items-center gap-1 ${
                                isMine ? 'opacity-85' : 'text-[var(--text-muted)]'
                              }`}
                            >
                              <Forward className="w-3 h-3" />
                              {m.forwardedFrom
                                ? t('msgActions.forwardedFrom', { name: m.forwardedFrom })
                                : t('msgActions.forwardedLabel')}
                            </p>
                          )}
                          {m.isDemoAutoReply && (
                            <p className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100/90 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 inline-block">
                              {t('chat.autoReplyTag')}
                            </p>
                          )}

                          {m.replyToText && (
                            <div
                              className={`px-2.5 py-1.5 rounded-xl border-l-2 text-xs ${
                                isMine
                                  ? 'bg-black/15 border-white/70 text-white/90'
                                  : 'bg-[var(--bg-subtle)] border-[var(--brand-primary)] text-[var(--text-secondary)]'
                              }`}
                            >
                              <p className="line-clamp-2">{m.replyToText}</p>
                            </div>
                          )}

                          {m.messageType === 'location' &&
                          m.locationLat != null &&
                          m.locationLng != null ? (
                            <LocationMessageCard
                              lat={m.locationLat}
                              lng={m.locationLng}
                              label={m.locationLabel || m.text}
                              expiresAt={m.locationExpiresAt}
                              isMine={isMine}
                            />
                          ) : m.messageType === 'file' && m.fileUrl ? (
                            <FileMessageCard
                              fileUrl={m.fileUrl}
                              fileName={m.fileName || m.text || 'document'}
                              fileSize={m.fileSize}
                              fileMime={m.fileMime}
                              isMine={isMine}
                            />
                          ) : (
                            <>
                              {m.imageUrl && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLightbox({ src: m.imageUrl!, caption: m.text || null });
                                  }}
                                  aria-label={t('chat.photoPreviewTitle')}
                                  className="block w-full rounded-xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-white/60 cursor-zoom-in group/img"
                                >
                                  <img
                                    src={m.imageUrl}
                                    alt={t('chat.sharedAttachmentAlt')}
                                    referrerPolicy="no-referrer"
                                    className="rounded-xl max-h-52 object-cover w-full dark:brightness-[0.92] transition-transform duration-200 group-hover/img:scale-[1.02]"
                                  />
                                </button>
                              )}
                              {m.audioUrl && (
                                <VoiceMessagePlayer
                                  src={m.audioUrl}
                                  durationSec={m.durationSec}
                                  seedKey={m.id}
                                  isMine={isMine}
                                />
                              )}
                              {m.text && (
                                <p className="leading-relaxed whitespace-pre-wrap">
                                  {showingTranslation ? trState.text : m.text}
                                </p>
                              )}
                              {showingTranslation && (
                                <p
                                  className={`text-[10px] font-medium ${
                                    isMine ? 'opacity-85' : 'text-[var(--text-muted)]'
                                  }`}
                                >
                                  {t('chat.translatedBadge')}
                                </p>
                              )}
                            </>
                          )}
                        </div>

                        {/* Quick Hover Action Buttons ("⋯" + Emoji React) */}
                        {!selectionMode && !isQueued && !m.id.startsWith('temp_') && (
                          <div className="flex items-center gap-1 opacity-75 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setReactMenuMsgId((cur) => (cur === m.id ? null : m.id));
                              }}
                              aria-label={t('chat.reactAria')}
                              className="w-7 h-7 rounded-full bg-[var(--bg-surface)]/90 border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center justify-center cursor-pointer"
                            >
                              <SmilePlus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setReactMenuMsgId(null);
                                setActionMenuMsg(m);
                              }}
                              aria-label={t('msgActions.moreAria')}
                              className="w-7 h-7 rounded-full bg-[var(--bg-surface)]/90 border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center justify-center cursor-pointer"
                            >
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Inline Reaction Picker Bar */}
                      {reactMenuMsgId === m.id && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1.5 px-2 py-1 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-md flex items-center gap-1"
                        >
                          {REACTION_EMOJIS.map((emoji) => {
                            const selectedByMe = Boolean(reactionSummary[emoji]?.mine);
                            return (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => handleReactMessage(m, emoji)}
                                className={`w-7 h-7 rounded-xl text-sm flex items-center justify-center transition-transform hover:scale-110 cursor-pointer ${
                                  selectedByMe ? 'bg-[var(--brand-soft)]' : 'hover:bg-[var(--bg-subtle)]'
                                }`}
                              >
                                {emoji}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Active Reaction Pills */}
                      {reactionEntries.length > 0 && (
                        <div
                          className={`flex flex-wrap items-center gap-1 mt-1 ${
                            !isMine ? 'pl-9' : 'px-1'
                          }`}
                        >
                          {reactionEntries.map(([emoji, info]) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReactMessage(m, emoji);
                              }}
                              className={`h-6 px-2 rounded-full border text-[11px] inline-flex items-center gap-1 tabular-nums transition-colors cursor-pointer ${
                                info.mine
                                  ? 'bg-[var(--brand-soft)] border-[var(--brand-primary)] text-[var(--text-primary)] font-semibold'
                                  : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                              }`}
                            >
                              <span>{emoji}</span>
                              {info.count > 1 && <span>{formatNumber(info.count)}</span>}
                            </button>
                          ))}
                        </div>
                      )}

                      <div
                        className={`flex items-center gap-2 mt-1 text-[10px] text-[var(--text-muted)] tabular-nums ${
                          !isMine ? 'pl-9' : 'px-1'
                        }`}
                      >
                        <span>
                          {m.failed
                            ? t('chat.statusFailed')
                            : isQueued
                              ? t('chat.queuedOffline')
                              : formatTime(m.sentAt)}
                        </span>
                        {m.failed && onRetryQueuedMessage && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void onRetryQueuedMessage(m.id);
                            }}
                            className="px-2 py-0.5 rounded-lg bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 font-semibold hover:underline cursor-pointer"
                          >
                            {t('chat.retrySend')}
                          </button>
                        )}
                        {isMine && !isQueued && !m.failed && (
                          <span className="inline-flex items-center gap-0.5">
                            {m.status === 'read' || Boolean(m.readAt) ? (
                              <>
                                <CheckCheck
                                  className="w-3.5 h-3.5 text-[var(--brand-text)]"
                                  aria-label={t('chat.read')}
                                />
                                <span>{t('chat.read')}</span>
                              </>
                            ) : m.status === 'delivered' ? (
                              <>
                                <CheckCheck
                                  className="w-3.5 h-3.5 text-[var(--text-muted)]"
                                  aria-label={t('chat.statusDelivered')}
                                />
                                <span>{t('chat.statusDelivered')}</span>
                              </>
                            ) : m.status === 'sending' ? (
                              <>
                                <Clock
                                  className="w-3 h-3 text-[var(--text-muted)]"
                                  aria-label={t('chat.statusSending')}
                                />
                                <span>{t('chat.statusSending')}</span>
                              </>
                            ) : (
                              <>
                                <Check
                                  className="w-3.5 h-3.5 text-[var(--text-muted)]"
                                  aria-label={t('chat.sent')}
                                />
                                <span>{t('chat.sent')}</span>
                              </>
                            )}
                          </span>
                        )}
                        {m.text && m.messageType !== 'location' && m.messageType !== 'file' && (
                          <button
                            type="button"
                            disabled={isTranslating}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleTranslate(m);
                            }}
                            className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] font-medium transition-colors cursor-pointer"
                          >
                            <Languages className="w-3 h-3" aria-hidden="true" />
                            <span>
                              {isTranslating
                                ? t('chat.translating')
                                : showingTranslation
                                  ? t('chat.showOriginal')
                                  : t('chat.translateBtn')}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              {(activeConv.peerTyping || typingByConv[activeConv.id]) && (
                <div className="flex justify-start">
                  <div className="px-3.5 py-2 rounded-2xl rounded-bl-sm bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-muted)] inline-flex items-center gap-1.5 shadow-2xs">
                    <span className="flex items-center gap-0.5" aria-hidden="true">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-primary)] animate-bounce" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-primary)] animate-bounce [animation-delay:120ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-primary)] animate-bounce [animation-delay:240ms]" />
                    </span>
                    <span>{t('chat.typing')}</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Multi-select Bulk Toolbar OR Composer */}
            {selectionMode ? (
              <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 flex items-center justify-between gap-3 shrink-0">
                <span className="text-xs font-bold text-[var(--text-primary)] tabular-nums">
                  {t('msgActions.selectedCount', { count: selectedMsgIds.length })}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={selectedMsgIds.length === 0}
                    onClick={() => {
                      const chosen = displayedMessages.filter((m) => selectedMsgIds.includes(m.id));
                      setForwardTargets(chosen);
                    }}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-45 text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Forward className="w-3.5 h-3.5" />
                    {t('msgActions.forwardSelected')}
                  </button>
                  <button
                    type="button"
                    disabled={selectedMsgIds.length === 0}
                    onClick={() => handleDeleteForMe(selectedMsgIds)}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-45 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {t('msgActions.deleteSelected')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectionMode(false);
                      setSelectedMsgIds([]);
                    }}
                    className="min-h-[40px] px-3 py-2 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            ) : activeConv.isBlocked ? (
              <div className="p-4 text-center text-xs text-red-600 dark:text-red-400 border-t border-[var(--border-subtle)] shrink-0">
                {t('chat.blockedNotice')}
              </div>
            ) : (
              <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5 sm:p-3 space-y-2 shrink-0">
                {!isOnline && (
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--brand-accent-text)] px-1">
                    <WifiOff className="w-3.5 h-3.5 shrink-0" />
                    <span>{t('chat.offlineQueue')}</span>
                  </div>
                )}

                {isOnline && wsStatus === 'reconnecting' && (
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--brand-accent-text)] px-1">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span>{t('chat.reconnecting')}</span>
                  </div>
                )}

                {/* File upload progress banner */}
                {fileUploadState && (
                  <div className="px-3 py-2 rounded-xl bg-[var(--brand-soft)] border border-[var(--border-subtle)] space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--brand-text)]">
                      <span className="truncate">
                        {t('chat.uploadingFile', {
                          name: fileUploadState.name,
                          pct: formatNumber(fileUploadState.pct),
                        })}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-[var(--brand-primary)] transition-all duration-150"
                        style={{ width: `${fileUploadState.pct}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Reply preview bar */}
                {replyToMsg && (
                  <div className="px-3 py-2 rounded-xl bg-[var(--bg-subtle)] border-l-2 border-[var(--brand-primary)] flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-[var(--brand-text)]">
                        {t('chat.replyingTo', {
                          name: replyToMsg.senderId === user.id ? t('call.youLabel') : activePeerName,
                        })}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)] truncate">
                        {getMessageSnippet(replyToMsg)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplyToMsg(null)}
                      aria-label={t('chat.cancelReply')}
                      className="min-h-[32px] min-w-[32px] rounded-lg hover:bg-[var(--bg-surface)] text-[var(--text-muted)] flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Quick Reply Chips — shown ONLY when chat is empty OR user toggles ⚡ */}
                {showQuickRepliesBar && (
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                    {QUICK_REPLY_KEYS.map((key) => {
                      const label = t(`chat.quickReplies.${key}`);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => sendChatText(label)}
                          className="min-h-[34px] px-3 py-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--brand-primary)] text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {avroEnabled && (
                  <p className="text-[11px] text-[var(--brand-text)] px-1">{t('chat.avroHint')}</p>
                )}

                {recordingVoice && (
                  <div className="px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-red-700 dark:text-red-300 tabular-nums">
                          {t('chat.recordingLabel')} ({formatCallDurationShort(recordingSec)})
                        </p>
                        <p className="text-[11px] text-red-600/80 dark:text-red-300/80">
                          {t('chat.recordingReleaseHint')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleVoicePointerUpOrCancel(false)}
                        className="min-h-[32px] px-2.5 rounded-lg bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Square className="w-3 h-3" />
                        {t('chat.sendBtn')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleVoicePointerUpOrCancel(true)}
                        className="min-h-[32px] px-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold cursor-pointer"
                      >
                        {t('chat.recordingCancel')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Messenger-Style 4-Slot Input Row: [＋ attach] [Camera] [Input + ⚡ + অভ্র] [Mic / Send] */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendChatText(draft);
                  }}
                  className="flex items-center gap-1 sm:gap-2 min-w-0"
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      setAttachMenuOpen((o) => !o);
                    }}
                    aria-label={t('chat.attachMenuAria')}
                    title={t('chat.attachMenuAria')}
                    aria-expanded={attachMenuOpen}
                    className={`min-h-[44px] min-w-[38px] sm:min-w-[44px] rounded-xl border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                      attachMenuOpen
                        ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] border-[var(--brand-primary)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:border-[var(--brand-primary)] hover:text-[var(--brand-text)]'
                    }`}
                  >
                    <Plus className={`w-5 h-5 transition-transform ${attachMenuOpen ? 'rotate-45' : ''}`} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setCameraOpen(true)}
                    aria-label={t('chat.takePhoto')}
                    title={t('chat.takePhoto')}
                    className="min-h-[44px] min-w-[38px] sm:min-w-[44px] flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:border-[var(--brand-primary)] hover:text-[var(--brand-text)] cursor-pointer shrink-0 transition-colors"
                  >
                    <Camera className="w-5 h-5" />
                  </button>

                  {/* Text Input Wrapper with Quick Replies (⚡) & Avro (অভ্র) toggles inside */}
                  <div className="flex-1 min-w-0 min-h-[44px] px-2 sm:px-3 rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] flex items-center gap-1 sm:gap-1.5 focus-within:ring-2 focus-within:ring-[var(--brand-primary)]">
                    <input
                      type="text"
                      value={draft}
                      onChange={(e) => handleDraftChange(e.target.value)}
                      placeholder={t('chat.typeMessage')}
                      className="flex-1 min-w-0 py-2 bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setQuickRepliesOpen((v) => !v)}
                      aria-label={t('chat.quickRepliesToggle')}
                      title={t('chat.quickRepliesToggle')}
                      aria-pressed={quickRepliesOpen}
                      className={`min-h-[32px] min-w-[30px] sm:min-w-[32px] rounded-xl flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                        quickRepliesOpen
                          ? 'bg-[var(--brand-soft)] text-[var(--brand-text)]'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <Zap className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setAvroEnabled((v) => !v)}
                      aria-pressed={avroEnabled}
                      title={t('chat.avroHint')}
                      className={`min-h-[30px] px-1.5 sm:px-2 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        avroEnabled
                          ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]'
                          : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {t('chat.avroToggle')}
                    </button>
                  </div>

                  {/* Send (when typing) OR Hold-to-record Mic (when input is empty) */}
                  {draft.trim().length > 0 ? (
                    <button
                      type="submit"
                      disabled={sending}
                      aria-label={t('chat.sendAria')}
                      className="min-h-[44px] min-w-[40px] px-3 sm:px-3.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-45 text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Send className="w-4 h-4 shrink-0" />
                      <span className="hidden sm:inline">{t('chat.sendBtn')}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onPointerDown={handleVoicePointerDown}
                      onPointerUp={() => handleVoicePointerUpOrCancel(false)}
                      onPointerCancel={() => handleVoicePointerUpOrCancel(true)}
                      aria-label={t('chat.recordVoice')}
                      title={t('chat.recordVoice')}
                      style={{ touchAction: 'none' }}
                      className={`min-h-[44px] min-w-[40px] sm:min-w-[44px] rounded-xl border flex items-center justify-center shrink-0 transition-all select-none cursor-pointer ${
                        recordingVoice
                          ? 'bg-red-600 border-red-600 text-white scale-105 shadow-md'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:border-[var(--brand-primary)] hover:text-[var(--brand-text)]'
                      }`}
                    >
                      <Mic className="w-5 h-5" />
                    </button>
                  )}
                </form>
              </div>
            )}
          </>
        )}
      </div>

      {/* Hidden File & Gallery Inputs (used by + Attach Menu & Camera fallback) */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={handlePhotoShare}
        className="sr-only"
      />
      <input
        ref={docInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,.rar,.7z,image/*"
        onChange={handleFileShare}
        className="sr-only"
      />

      {/* ＋ Attach Bottom Sheet / Popup (Rendered outside overflow-hidden with backdrop tap-to-dismiss) */}
      {attachMenuOpen && activeConv && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-xs p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t('attach.title')}
          onClick={() => setAttachMenuOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-sm bg-[var(--bg-surface)] rounded-t-3xl sm:rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-4 sm:p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
                {t('attach.title')}
              </h3>
              <button
                type="button"
                onClick={() => setAttachMenuOpen(false)}
                aria-label={t('common.close')}
                className="min-h-[34px] min-w-[34px] rounded-xl hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => {
                  setAttachMenuOpen(false);
                  setLocationModalOpen(true);
                }}
                className="w-full p-3 rounded-2xl hover:bg-[var(--bg-subtle)] flex items-center gap-3 text-left transition-colors cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[var(--text-primary)]">
                    {t('attach.location')}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)]">{t('attach.locationDesc')}</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAttachMenuOpen(false);
                  docInputRef.current?.click();
                }}
                className="w-full p-3 rounded-2xl hover:bg-[var(--bg-subtle)] flex items-center gap-3 text-left transition-colors cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0">
                  <Paperclip className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[var(--text-primary)]">{t('attach.file')}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">{t('attach.fileDesc')}</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAttachMenuOpen(false);
                  galleryInputRef.current?.click();
                }}
                className="w-full p-3 rounded-2xl hover:bg-[var(--bg-subtle)] flex items-center gap-3 text-left transition-colors cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 flex items-center justify-center shrink-0">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[var(--text-primary)]">{t('attach.photo')}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">{t('attach.photoDesc')}</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAttachMenuOpen(false);
                  setCameraOpen(true);
                }}
                className="w-full p-3 rounded-2xl hover:bg-[var(--bg-subtle)] flex items-center gap-3 text-left transition-colors cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                  <Camera className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[var(--text-primary)]">
                    {t('attach.camera')}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)]">{t('attach.cameraDesc')}</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAttachMenuOpen(false);
                  void startVoiceCapture();
                }}
                className="w-full p-3 rounded-2xl hover:bg-[var(--bg-subtle)] flex items-center gap-3 text-left transition-colors cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 flex items-center justify-center shrink-0">
                  <Mic className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[var(--text-primary)]">{t('attach.voice')}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">{t('attach.voiceDesc')}</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Long-Press / "⋯" Message Action Sheet */}
      {actionMenuMsg && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t('msgActions.title')}
          onClick={() => setActionMenuMsg(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-xs bg-[var(--bg-surface)] rounded-t-3xl sm:rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-4 space-y-3"
          >
            {/* Quick Emoji Reaction Row */}
            <div className="flex items-center justify-between gap-1 px-1 py-1.5 rounded-2xl bg-[var(--bg-subtle)]">
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleReactMessage(actionMenuMsg, emoji)}
                  className="w-9 h-9 rounded-xl hover:bg-[var(--bg-surface)] text-lg flex items-center justify-center transition-transform hover:scale-110 cursor-pointer"
                >
                  {emoji}
                </button>
              ))}
            </div>

            <div className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  setReplyToMsg(actionMenuMsg);
                  setActionMenuMsg(null);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl hover:bg-[var(--bg-subtle)] text-left text-xs font-semibold text-[var(--text-primary)] flex items-center gap-2.5 cursor-pointer"
              >
                <Reply className="w-4 h-4 text-[var(--brand-text)]" />
                {t('msgActions.reply')}
              </button>

              <button
                type="button"
                onClick={() => {
                  const target = actionMenuMsg;
                  setActionMenuMsg(null);
                  setForwardTargets([target]);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl hover:bg-[var(--bg-subtle)] text-left text-xs font-semibold text-[var(--text-primary)] flex items-center gap-2.5 cursor-pointer"
              >
                <Forward className="w-4 h-4 text-[var(--brand-text)]" />
                {t('msgActions.forward')}
              </button>

              {(actionMenuMsg.text ||
                actionMenuMsg.locationLabel ||
                actionMenuMsg.fileName) && (
                <button
                  type="button"
                  onClick={() => handleCopyMessage(actionMenuMsg)}
                  className="w-full px-3.5 py-2.5 rounded-xl hover:bg-[var(--bg-subtle)] text-left text-xs font-semibold text-[var(--text-primary)] flex items-center gap-2.5 cursor-pointer"
                >
                  <Copy className="w-4 h-4 text-[var(--brand-text)]" />
                  {t('msgActions.copy')}
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  const id = actionMenuMsg.id;
                  setActionMenuMsg(null);
                  setSelectionMode(true);
                  setSelectedMsgIds([id]);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl hover:bg-[var(--bg-subtle)] text-left text-xs font-semibold text-[var(--text-primary)] flex items-center gap-2.5 cursor-pointer"
              >
                <CheckSquare className="w-4 h-4 text-[var(--brand-text)]" />
                {t('msgActions.selectMultiple')}
              </button>

              <button
                type="button"
                onClick={() => handleDeleteForMe([actionMenuMsg.id])}
                className="w-full px-3.5 py-2.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/35 text-left text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-2.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                {t('msgActions.deleteForMe')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shop Profile Modal */}
      <ShopProfileModal
        conversation={shopProfileOpen ? activeConv : null}
        peerName={activePeerName}
        peerAvatarUrl={activePeerAvatar}
        statusLine={activeStatusLine}
        isDonorPeer={activeConv ? user.id !== activeConv.donorId : true}
        onClose={() => setShopProfileOpen(false)}
        onVoiceCall={() => handleStartCall('voice', 'outgoing')}
        onVideoCall={() => handleStartCall('video', 'outgoing')}
        onOpenChatSettings={() => setChatSettingsOpen(true)}
        onToggleBlock={
          activeConv && !activeConv.isDemo ? () => void handleToggleBlock() : undefined
        }
        onReportUser={activeConv && !activeConv.isDemo ? handleOpenReportModal : undefined}
      />

      {/* Location Share Modal */}
      <LocationShareModal
        open={locationModalOpen}
        onClose={() => setLocationModalOpen(false)}
        onSendLocation={handleSendLocation}
      />

      {/* Forward Message Modal */}
      <ForwardModal
        open={Boolean(forwardTargets && forwardTargets.length > 0)}
        conversations={conversations}
        currentUserId={user.id}
        onClose={() => setForwardTargets(null)}
        onConfirmForward={handleConfirmForward}
      />

      {/* In-App Camera Modal */}
      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onSendPhoto={handleCameraPhotoSend}
        onPickGalleryFallback={() => galleryInputRef.current?.click()}
      />

      {/* Full-Screen Photo Lightbox */}
      <PhotoLightbox
        src={lightbox?.src ?? null}
        caption={lightbox?.caption}
        onClose={() => setLightbox(null)}
      />

      {/* Voice / Video Call Screen Overlay */}
      <CallOverlay
        session={activeCall}
        signaling={signaling}
        onCallFinished={handleCallFinished}
        onClose={() => setActiveCall(null)}
      />

      {/* Zero-PII Find People Directory Modal */}
      <FindPeopleModal
        open={findPeopleOpen}
        onClose={() => setFindPeopleOpen(false)}
        entries={zeroPiiDirectory}
        hasMore={directoryHasMore}
        onLoadMore={onLoadMoreDirectory}
        blockedUids={blockedUids}
        onSelectPerson={handleOpenPerson}
      />

      {/* Report User Modal */}
      {reportModalOpen && activeConv && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          onClick={() => setReportModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-2xl p-5 space-y-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
                  {t('chat.reportUserTitle')}
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {t('chat.reportUserSubtitle')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReportModalOpen(false)}
                aria-label={t('common.close')}
                className="min-h-[32px] min-w-[32px] rounded-xl hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              {(['r1', 'r2', 'r3', 'r4'] as const).map((key) => (
                <label
                  key={key}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                    reportReasonKey === key
                      ? 'border-[var(--brand-primary)] bg-[var(--brand-soft)] font-semibold text-[var(--text-primary)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="reportReason"
                    checked={reportReasonKey === key}
                    onChange={() => setReportReasonKey(key)}
                    className="accent-[var(--brand-primary)]"
                  />
                  <span>{t(`chat.reportReasons.${key}`)}</span>
                </label>
              ))}
            </div>

            <textarea
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              placeholder={t('chat.reportDetailsPlaceholder')}
              rows={2}
              maxLength={400}
              className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportModalOpen(false)}
                className="min-h-[38px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void handleSubmitReport()}
                className="min-h-[38px] px-4 py-2 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold cursor-pointer"
              >
                {t('chat.submitReportBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Chat For Me Confirmation Modal */}
      {deleteConvConfirmOpen && activeConv && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          onClick={() => setDeleteConvConfirmOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-2xl p-5 space-y-4"
          >
            <div className="space-y-1">
              <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
                {t('chat.deleteChatForMe')}
              </h3>
              <p className="text-xs text-[var(--text-muted)]">{t('chat.deleteChatConfirm')}</p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConvConfirmOpen(false)}
                className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = activeConv;
                  setDeleteConvConfirmOpen(false);
                  onSelectConversation(null);
                  await onDeleteConvForMe?.(target).catch(() => {});
                }}
                className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold cursor-pointer"
              >
                {t('msgActions.deleteSelected')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
