import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Check,
  ChevronUp,
  Flag,
  HeartHandshake,
  Image as ImageIcon,
  Info,
  Languages,
  Loader2,
  MessageCircle,
  PanelLeftOpen,
  Reply,
  Send,
  ShieldAlert,
  ShieldCheck,
  SmilePlus,
  Store,
  Trash2,
  Users,
  VolumeX,
  X,
} from 'lucide-react';
import type {
  CommunityRoom,
  RoomMember,
  RoomMessage,
  User,
  UserDirectoryEntry,
} from '../types';
import { ALL_DEMO_PERSONAS_MAP, personaToDirectoryEntry } from '../data/demoPersonas';
import { useI18n } from '../i18n/I18nContext';
import { convertPhoneticOnBoundary } from '../i18n/phonetic';
import { DemoBadge } from './DemoBadge';
import { PhotoLightbox } from './PhotoLightbox';
import { ShopAvatar } from './ShopAvatar';
import { getRoleMeta, RoleIcon, UserProfileModal } from './UserProfileModal';

const ROOM_REACTIONS = ['👍', '❤️', '🙏', '🔥', '🎉'] as const;
const MAX_ROOM_TEXT = 2000;

interface CommunityRoomViewProps {
  room: CommunityRoom;
  user: User;
  isAdmin: boolean;
  isOnline: boolean;
  messages: RoomMessage[];
  members: RoomMember[];
  hasMoreMessages: boolean;
  loadingMoreMessages: boolean;
  blockedUids?: Set<string>;
  directoryEntries?: UserDirectoryEntry[];
  sidebarOpenOnDesktop: boolean;
  onShowSidebarDesktop: () => void;
  onBackMobile: () => void;
  onLoadOlderMessages: () => void;
  onSendMessage: (params: {
    text: string;
    file?: Blob | null;
    mediaUrlFallback?: string | null;
    replyTo?: RoomMessage | null;
  }) => Promise<void>;
  onReactMessage: (msg: RoomMessage, emoji: string) => Promise<void>;
  onReportMessage: (msg: RoomMessage, reason: string) => Promise<void>;
  onAdminSetDeleted: (msg: RoomMessage, deleted: boolean) => Promise<void>;
  onAdminToggleMute: (targetUid: string, mute: boolean) => Promise<void>;
  onStartDirectChat: (entry: UserDirectoryEntry) => Promise<void>;
  onToggleBlock?: (entry: UserDirectoryEntry) => Promise<void>;
  onReportUser?: (entry: UserDirectoryEntry) => Promise<void>;
}

async function compressRoomImage(file: File): Promise<{ blob: Blob; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Image read failed'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image'));
      img.onload = () => {
        const maxDim = 960;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas unsupported'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Compression failed'));
              return;
            }
            resolve({ blob, dataUrl });
          },
          'image/jpeg',
          0.72
        );
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export function CommunityRoomView({
  room,
  user,
  isAdmin,
  isOnline,
  messages,
  members,
  hasMoreMessages,
  loadingMoreMessages,
  blockedUids,
  directoryEntries = [],
  sidebarOpenOnDesktop,
  onShowSidebarDesktop,
  onBackMobile,
  onLoadOlderMessages,
  onSendMessage,
  onReactMessage,
  onReportMessage,
  onAdminSetDeleted,
  onAdminToggleMute,
  onStartDirectChat,
  onToggleBlock,
  onReportUser,
}: CommunityRoomViewProps) {
  const { lang, t, formatNumber, formatTime, formatArea } = useI18n();
  const guidelinesKey = `rizik_room_guidelines_dismissed_${user.id}_${room.id}`;

  const [guidelinesDismissed, setGuidelinesDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(guidelinesKey) === '1';
    } catch {
      return false;
    }
  });
  const [showMembersDrawer, setShowMembersDrawer] = useState(false);
  const [profileEntry, setProfileEntry] = useState<UserDirectoryEntry | null>(null);
  const [lightbox, setLightbox] = useState<{ src: string; caption?: string } | null>(null);

  const [draft, setDraft] = useState('');
  const [phoneticEnabled, setPhoneticEnabled] = useState(() => lang === 'bn');
  const [replyTo, setReplyTo] = useState<RoomMessage | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<{ blob: Blob; dataUrl: string } | null>(null);
  const [showEmojiStrip, setShowEmojiStrip] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [openPickerMsgId, setOpenPickerMsgId] = useState<string | null>(null);
  const [reportedToast, setReportedToast] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastMsgIdRef = useRef<string | null>(null);
  const lastSendTsRef = useRef<number>(0);

  useEffect(() => {
    try {
      setGuidelinesDismissed(localStorage.getItem(guidelinesKey) === '1');
    } catch {
      setGuidelinesDismissed(false);
    }
    setReplyTo(null);
    setPendingPhoto(null);
    setSendError(null);
    setOpenPickerMsgId(null);
    lastMsgIdRef.current = null;
  }, [room.id, guidelinesKey]);

  const dismissGuidelines = () => {
    setGuidelinesDismissed(true);
    try {
      localStorage.setItem(guidelinesKey, '1');
    } catch {
      // Ignore
    }
  };

  const directoryByUid = useMemo(() => {
    const map = new Map<string, UserDirectoryEntry>();
    directoryEntries.forEach((d) => map.set(d.uid, d));
    return map;
  }, [directoryEntries]);

  const visibleMessages = useMemo(() => {
    return messages.filter((m) => !(blockedUids?.has(m.senderId) ?? false));
  }, [messages, blockedUids]);

  // Auto-scroll to newest message on room enter or new message arrival
  useEffect(() => {
    const latest = visibleMessages[visibleMessages.length - 1]?.id ?? null;
    if (!latest) return;
    const isInitial = lastMsgIdRef.current === null;
    if (isInitial || latest !== lastMsgIdRef.current) {
      lastMsgIdRef.current = latest;
      window.requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [visibleMessages]);

  const isMuted = room.mutedUids.includes(user.id);
  const roomTitle = lang === 'bn' ? room.nameBn || room.name : room.name;
  const roomDesc = lang === 'bn' ? room.descriptionBn || room.description : room.description;

  const displayedMemberCount = Math.max(room.memberCount, members.length);
  const liveOnlineCount =
    members.length > 0 ? members.filter((m) => m.online).length : room.onlineCount;

  const resolveUserEntry = (msgOrMember: {
    uid: string;
    displayName: string;
    handle?: string | null;
    photoURL?: string | null;
    role: RoomMember['role'];
    area?: string | null;
    verified?: boolean;
    isDemo?: boolean;
    online?: boolean;
  }): UserDirectoryEntry => {
    const persona = ALL_DEMO_PERSONAS_MAP.get(msgOrMember.uid);
    if (persona) return personaToDirectoryEntry(persona);

    const live = directoryByUid.get(msgOrMember.uid);
    if (live) return live;

    return {
      uid: msgOrMember.uid,
      displayName: msgOrMember.displayName,
      handle: msgOrMember.handle || `@${msgOrMember.uid.slice(0, 8)}`,
      photoURL: msgOrMember.photoURL ?? null,
      role: msgOrMember.role,
      area: msgOrMember.area || 'Dhaka',
      verified: Boolean(msgOrMember.verified),
      discoverable: true,
      online: Boolean(msgOrMember.online),
      lastSeen: new Date().toISOString(),
      isDemo: Boolean(msgOrMember.isDemo),
    };
  };

  const handlePhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setSendError(t('rooms.errInvalidImage'));
      return;
    }
    try {
      const compressed = await compressRoomImage(file);
      setPendingPhoto(compressed);
      setSendError(null);
    } catch {
      setSendError(t('rooms.errInvalidImage'));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending || isMuted) return;
    const text = draft.trim();
    if (!text && !pendingPhoto) return;
    if (text.length > MAX_ROOM_TEXT) {
      setSendError(t('rooms.errTooLong'));
      return;
    }

    const now = Date.now();
    if (now - lastSendTsRef.current < 950) {
      setSendError(t('rooms.rateLimitHint'));
      return;
    }

    setSending(true);
    setSendError(null);
    try {
      lastSendTsRef.current = now;
      await onSendMessage({
        text,
        file: pendingPhoto?.blob ?? null,
        mediaUrlFallback: pendingPhoto?.dataUrl ?? null,
        replyTo,
      });
      setDraft('');
      setPendingPhoto(null);
      setReplyTo(null);
      setShowEmojiStrip(false);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : t('rooms.sendFailed'));
    } finally {
      setSending(false);
    }
  };

  const formatDateHeader = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return t('chat.today');
    if (d.toDateString() === yesterday.toDateString()) return t('chat.yesterday');
    return d.toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const renderRoomIcon = () => {
    if (room.iconKey === 'restaurant') return <Store className="w-4 h-4 shrink-0" />;
    if (room.iconKey === 'volunteer') return <HeartHandshake className="w-4 h-4 shrink-0" />;
    return <Users className="w-4 h-4 shrink-0" />;
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--bg-surface)] relative">
      <PhotoLightbox
        src={lightbox?.src ?? null}
        caption={lightbox?.caption}
        onClose={() => setLightbox(null)}
      />

      <UserProfileModal
        entry={profileEntry}
        myUid={user.id}
        isBlocked={profileEntry ? blockedUids?.has(profileEntry.uid) : false}
        onClose={() => setProfileEntry(null)}
        onMessage={onStartDirectChat}
        onToggleBlock={onToggleBlock}
        onReport={onReportUser}
      />

      {/* Room Header */}
      <div className="px-3 sm:px-4 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={onBackMobile}
            aria-label={t('common.back')}
            className="md:hidden min-h-[36px] min-w-[36px] rounded-xl hover:bg-[var(--bg-subtle)] text-[var(--text-primary)] flex items-center justify-center shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {!sidebarOpenOnDesktop && (
            <button
              type="button"
              onClick={onShowSidebarDesktop}
              aria-label={t('chat.showConversations')}
              className="hidden md:flex min-h-[34px] min-w-[34px] rounded-xl hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] items-center justify-center shrink-0 cursor-pointer"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          )}

          <div className="w-9 h-9 rounded-xl bg-[var(--brand-soft)] text-[var(--brand-text)] flex items-center justify-center shrink-0">
            {renderRoomIcon()}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <h2 className="font-display text-sm sm:text-base font-extrabold text-[var(--text-primary)] truncate">
                {roomTitle}
              </h2>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] truncate">{roomDesc}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowMembersDrawer((v) => !v)}
            className="min-h-[34px] px-2.5 py-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:bg-[var(--brand-soft)] text-[11px] font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Users className="w-3.5 h-3.5 text-[var(--brand-text)] shrink-0" />
            <span className="tabular-nums">{formatNumber(displayedMemberCount)}</span>
            <span className="hidden sm:inline text-emerald-600 dark:text-emerald-400 tabular-nums">
              · {formatNumber(liveOnlineCount)} {t('rooms.onlineLabel')}
            </span>
          </button>

          {guidelinesDismissed && (
            <button
              type="button"
              onClick={() => setGuidelinesDismissed(false)}
              title={t('rooms.guidelinesTitle')}
              aria-label={t('rooms.guidelinesTitle')}
              className="min-h-[34px] min-w-[34px] rounded-xl hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] flex items-center justify-center cursor-pointer"
            >
              <Info className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Dismissible Community Guidelines Banner */}
      {!guidelinesDismissed && (
        <div className="px-3 sm:px-4 py-2 bg-[var(--brand-soft)]/70 border-b border-[var(--border-subtle)] flex items-start justify-between gap-2.5 text-xs shrink-0">
          <div className="flex items-start gap-2 min-w-0">
            <ShieldCheck className="w-4 h-4 text-[var(--brand-text)] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-bold text-[var(--text-primary)]">{t('rooms.guidelinesTitle')}</p>
              <p className="text-[11px] text-[var(--text-secondary)] leading-snug">
                {t('rooms.guidelinesBody')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={dismissGuidelines}
            aria-label={t('common.close')}
            className="min-h-[28px] min-w-[28px] rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-[var(--text-muted)] flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Reported Toast */}
      {reportedToast && (
        <div className="px-4 py-1.5 bg-emerald-50 dark:bg-emerald-950/50 border-b border-emerald-200 dark:border-emerald-900/50 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 flex items-center justify-between gap-2 shrink-0">
          <span className="inline-flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" />
            {reportedToast}
          </span>
          <button
            type="button"
            onClick={() => setReportedToast(null)}
            className="text-emerald-700 dark:text-emerald-300 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Members Drawer Modal */}
      {showMembersDrawer && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowMembersDrawer(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md bg-[var(--bg-surface)] rounded-t-3xl sm:rounded-2xl border border-[var(--border-subtle)] shadow-2xl max-h-[80vh] flex flex-col overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
                {t('rooms.membersTitle', { count: formatNumber(displayedMemberCount) })}
              </h3>
              <button
                type="button"
                onClick={() => setShowMembersDrawer(false)}
                className="min-h-[34px] min-w-[34px] rounded-xl hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)]">
              {members.map((m) => {
                const entry = resolveUserEntry({
                  uid: m.uid,
                  displayName: m.displayName,
                  handle: m.handle,
                  photoURL: m.photoURL,
                  role: m.role,
                  area: m.area,
                  isDemo: m.isDemo,
                  online: m.online,
                });
                const roleMeta = getRoleMeta(m.role, t);
                const isSelfMember = m.uid === user.id;
                const memberMuted = room.mutedUids.includes(m.uid);

                return (
                  <div
                    key={m.uid}
                    className="px-4 py-2.5 flex items-center gap-3 hover:bg-[var(--bg-subtle)]/70"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setShowMembersDrawer(false);
                        setProfileEntry(entry);
                      }}
                      className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <ShopAvatar
                        name={m.displayName}
                        imageUrl={m.photoURL ?? null}
                        online={m.online}
                        showStatusDot
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-xs font-bold text-[var(--text-primary)] truncate">
                            {m.displayName}
                          </span>
                          {(m.isDemo || m.uid.startsWith('demo_')) && <DemoBadge compact />}
                          {memberMuted && (
                            <span className="px-1.5 py-0.2 rounded bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-[9px] font-bold">
                              {t('rooms.mutedBadge')}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                          <span className={`px-1.5 py-0 rounded font-semibold ${roleMeta.className}`}>
                            {roleMeta.label}
                          </span>
                          {m.area && <span className="truncate">· {formatArea(m.area)}</span>}
                        </div>
                      </div>
                    </button>

                    {!isSelfMember && (
                      <div className="flex items-center gap-1 shrink-0">
                        {isAdmin && !m.isDemo && (
                          <button
                            type="button"
                            onClick={() => onAdminToggleMute(m.uid, !memberMuted)}
                            title={memberMuted ? t('rooms.unmuteUser') : t('rooms.muteUser')}
                            className="min-h-[30px] px-2 rounded-lg border border-[var(--border-subtle)] text-[10px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-canvas)] cursor-pointer"
                          >
                            {memberMuted ? t('rooms.unmuteUser') : t('rooms.muteUser')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            setShowMembersDrawer(false);
                            await onStartDirectChat(entry);
                          }}
                          className="min-h-[30px] px-2.5 rounded-lg bg-[var(--brand-soft)] text-[var(--brand-text)] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <MessageCircle className="w-3 h-3" />
                          <span>{t('rooms.messageShort')}</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Messages Feed */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-5 py-3 space-y-2.5 bg-[var(--bg-canvas)]/55"
      >
        {hasMoreMessages && (
          <div className="flex justify-center pb-2">
            <button
              type="button"
              disabled={loadingMoreMessages}
              onClick={onLoadOlderMessages}
              className="min-h-[34px] px-3.5 py-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {loadingMoreMessages ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5" />
              )}
              <span>{t('chat.loadOlder')}</span>
            </button>
          </div>
        )}

        {visibleMessages.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <Users className="w-9 h-9 mx-auto text-[var(--text-muted)] opacity-40" />
            <p className="text-xs font-medium text-[var(--text-muted)]">
              {t('rooms.emptyMessages')}
            </p>
          </div>
        ) : (
          visibleMessages.map((msg, idx) => {
            const prev = idx > 0 ? visibleMessages[idx - 1] : null;
            const showDateSep =
              !prev ||
              new Date(prev.createdAt).toDateString() !== new Date(msg.createdAt).toDateString();

            const isMine = msg.senderId === user.id && !msg.senderIsDemo;
            const roleMeta = getRoleMeta(msg.senderRole, t);
            const isSenderMuted = room.mutedUids.includes(msg.senderId);

            const senderEntry = resolveUserEntry({
              uid: msg.senderId,
              displayName: msg.senderName,
              handle: msg.senderHandle,
              photoURL: msg.senderAvatar,
              role: msg.senderRole,
              area: msg.senderArea,
              verified: msg.senderVerified,
              isDemo: msg.senderIsDemo,
              online: true,
            });

            const reactionEntries = Object.entries(msg.reactions || {}).filter(
              ([, users]) => Array.isArray(users) && users.length > 0
            );

            return (
              <div key={msg.id} className="space-y-2">
                {showDateSep && (
                  <div className="flex justify-center py-1">
                    <span className="px-3 py-0.5 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[10px] font-bold text-[var(--text-muted)]">
                      {formatDateHeader(msg.createdAt)}
                    </span>
                  </div>
                )}

                <div className="group flex items-start gap-2.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => setProfileEntry(senderEntry)}
                    aria-label={msg.senderName}
                    className="shrink-0 mt-0.5 cursor-pointer rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                  >
                    <ShopAvatar
                      name={msg.senderName}
                      imageUrl={msg.senderAvatar ?? null}
                      size="sm"
                    />
                  </button>

                  <div className="min-w-0 flex-1 space-y-1">
                    {/* Sender metadata line */}
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <button
                        type="button"
                        onClick={() => setProfileEntry(senderEntry)}
                        className="text-xs font-extrabold text-[var(--text-primary)] hover:underline truncate max-w-[180px] sm:max-w-[260px] cursor-pointer"
                      >
                        {msg.senderName}
                      </button>

                      {msg.senderVerified && (
                        <BadgeCheck className="w-3.5 h-3.5 text-[var(--brand-text)] shrink-0" />
                      )}

                      <span
                        className={`inline-flex items-center gap-0.5 px-1.5 py-0 rounded text-[9px] font-bold shrink-0 ${roleMeta.className}`}
                      >
                        <RoleIcon role={msg.senderRole} className="w-2.5 h-2.5 shrink-0" />
                        {roleMeta.label}
                      </span>

                      {msg.senderIsDemo && <DemoBadge compact />}

                      {msg.senderArea && (
                        <span className="text-[10px] text-[var(--text-muted)] truncate">
                          · {formatArea(msg.senderArea)}
                        </span>
                      )}

                      <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
                        · {formatTime(msg.createdAt)}
                      </span>
                    </div>

                    {/* Message Bubble */}
                    <div
                      className={`inline-block max-w-full sm:max-w-[85%] rounded-2xl px-3.5 py-2 border text-xs sm:text-[13px] leading-relaxed break-words ${
                        msg.deleted
                          ? 'bg-[var(--bg-subtle)] border-dashed border-[var(--border-subtle)] text-[var(--text-muted)] italic'
                          : isMine
                            ? 'bg-[var(--brand-soft)]/80 border-[var(--brand-primary)]/25 text-[var(--text-primary)]'
                            : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-primary)] shadow-2xs'
                      }`}
                    >
                      {msg.deleted ? (
                        <p>{t('rooms.removedByModerator')}</p>
                      ) : (
                        <>
                          {msg.replyToId && msg.replyToText && (
                            <div className="mb-1.5 pl-2.5 py-1 border-l-2 border-[var(--brand-primary)] bg-[var(--bg-subtle)]/70 rounded-r-lg text-[11px] text-[var(--text-secondary)]">
                              {msg.replyToSenderName && (
                                <p className="font-bold text-[var(--brand-text)] truncate">
                                  {msg.replyToSenderName}
                                </p>
                              )}
                              <p className="line-clamp-2">{msg.replyToText}</p>
                            </div>
                          )}

                          {msg.mediaUrl && (
                            <button
                              type="button"
                              onClick={() =>
                                setLightbox({ src: msg.mediaUrl!, caption: msg.senderName })
                              }
                              className="block mb-1.5 rounded-xl overflow-hidden border border-[var(--border-subtle)] max-w-[260px] cursor-pointer"
                            >
                              <img
                                src={msg.mediaUrl}
                                alt={msg.senderName}
                                className="max-h-56 w-auto object-cover"
                              />
                            </button>
                          )}

                          <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                        </>
                      )}
                    </div>

                    {/* Reactions & Inline Actions */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                      {reactionEntries.map(([emoji, users]) => {
                        const mineReacted = users.includes(user.id);
                        return (
                          <button
                            key={emoji}
                            type="button"
                            disabled={isMuted}
                            onClick={() => onReactMessage(msg, emoji)}
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold inline-flex items-center gap-1 border cursor-pointer ${
                              mineReacted
                                ? 'bg-[var(--brand-soft)] border-[var(--brand-primary)]/40 text-[var(--brand-text)]'
                                : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                            }`}
                          >
                            <span>{emoji}</span>
                            <span className="tabular-nums">{formatNumber(users.length)}</span>
                          </button>
                        );
                      })}

                      {!msg.deleted && (
                        <div className="relative inline-flex items-center gap-1 opacity-85 sm:opacity-60 sm:group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() =>
                              setOpenPickerMsgId((curr) => (curr === msg.id ? null : msg.id))
                            }
                            aria-label={t('chat.react')}
                            className="p-1 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                          >
                            <SmilePlus className="w-3.5 h-3.5" />
                          </button>

                          {openPickerMsgId === msg.id && (
                            <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-md">
                              {ROOM_REACTIONS.map((em) => (
                                <button
                                  key={em}
                                  type="button"
                                  onClick={() => {
                                    setOpenPickerMsgId(null);
                                    void onReactMessage(msg, em);
                                  }}
                                  className="w-6 h-6 rounded-full hover:bg-[var(--bg-subtle)] text-xs flex items-center justify-center cursor-pointer"
                                >
                                  {em}
                                </button>
                              ))}
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => setReplyTo(msg)}
                            aria-label={t('chat.reply')}
                            title={t('chat.reply')}
                            className="p-1 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                          >
                            <Reply className="w-3.5 h-3.5" />
                          </button>

                          {!isMine && (
                            <button
                              type="button"
                              onClick={async () => {
                                await onReportMessage(msg, 'Inappropriate room message');
                                setReportedToast(t('rooms.reportedToast'));
                              }}
                              aria-label={t('rooms.reportMessage')}
                              title={t('rooms.reportMessage')}
                              className="p-1 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-red-500 cursor-pointer"
                            >
                              <Flag className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {isAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => onAdminSetDeleted(msg, !msg.deleted)}
                                aria-label={t('rooms.deleteMessage')}
                                title={t('rooms.deleteMessage')}
                                className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              {!isMine && !msg.senderIsDemo && (
                                <button
                                  type="button"
                                  onClick={() => onAdminToggleMute(msg.senderId, !isSenderMuted)}
                                  aria-label={
                                    isSenderMuted ? t('rooms.unmuteUser') : t('rooms.muteUser')
                                  }
                                  title={
                                    isSenderMuted ? t('rooms.unmuteUser') : t('rooms.muteUser')
                                  }
                                  className="p-1 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-600 dark:text-amber-400 cursor-pointer"
                                >
                                  {isSenderMuted ? (
                                    <ShieldAlert className="w-3.5 h-3.5" />
                                  ) : (
                                    <Ban className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {isAdmin && msg.deleted && (
                        <button
                          type="button"
                          onClick={() => onAdminSetDeleted(msg, false)}
                          className="text-[10px] font-semibold text-[var(--brand-text)] hover:underline cursor-pointer"
                        >
                          {t('rooms.restoreMessage')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Composer */}
      {isMuted ? (
        <div className="p-3 border-t border-[var(--border-subtle)] bg-red-50/70 dark:bg-red-950/30 text-xs font-semibold text-red-700 dark:text-red-300 flex items-center justify-center gap-2 shrink-0">
          <VolumeX className="w-4 h-4 shrink-0" />
          <span>{t('rooms.youAreMuted')}</span>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="p-2.5 sm:p-3 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2 shrink-0"
        >
          {replyTo && (
            <div className="px-3 py-1.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0">
                <p className="font-bold text-[var(--brand-text)] truncate">
                  {t('rooms.replyingTo', { name: replyTo.senderName })}
                </p>
                <p className="text-[11px] text-[var(--text-muted)] truncate">{replyTo.text}</p>
              </div>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {pendingPhoto && (
            <div className="relative inline-block">
              <img
                src={pendingPhoto.dataUrl}
                alt="Preview"
                className="h-20 w-auto rounded-xl border border-[var(--border-subtle)] object-cover"
              />
              <button
                type="button"
                onClick={() => setPendingPhoto(null)}
                aria-label={t('common.close')}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/80 text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {showEmojiStrip && (
            <div className="flex items-center gap-1 flex-wrap px-1">
              {['👍', '❤️', '🙏', '🔥', '🎉', '🍛', '🥐', '🤝', '✅'].map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setDraft((prev) => `${prev}${em}`)}
                  className="w-8 h-8 rounded-lg hover:bg-[var(--bg-subtle)] text-base flex items-center justify-center cursor-pointer"
                >
                  {em}
                </button>
              ))}
            </div>
          )}

          {sendError && (
            <p className="text-[11px] font-semibold text-red-600 dark:text-red-400 px-1">
              {sendError}
            </p>
          )}

          <div className="flex items-center gap-1.5 min-w-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label={t('chat.attachImage')}
              className="min-h-[40px] min-w-[38px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:bg-[var(--brand-soft)] text-[var(--text-secondary)] flex items-center justify-center shrink-0 cursor-pointer"
            >
              <ImageIcon className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setShowEmojiStrip((v) => !v)}
              aria-label={t('chat.emojiPicker')}
              className={`min-h-[40px] min-w-[38px] rounded-xl border border-[var(--border-subtle)] flex items-center justify-center shrink-0 cursor-pointer ${
                showEmojiStrip
                  ? 'bg-[var(--brand-soft)] text-[var(--brand-text)]'
                  : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
              }`}
            >
              <SmilePlus className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setPhoneticEnabled((v) => !v)}
              title={t('chat.phoneticToggle')}
              aria-label={t('chat.phoneticToggle')}
              className={`min-h-[40px] px-2 rounded-xl border text-[11px] font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer ${
                phoneticEnabled
                  ? 'border-[var(--brand-primary)] bg-[var(--brand-soft)] text-[var(--brand-text)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-muted)]'
              }`}
            >
              <Languages className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">অ</span>
            </button>

            <div className="relative flex-1 min-w-0">
              <input
                type="text"
                value={draft}
                maxLength={MAX_ROOM_TEXT}
                onChange={(e) => {
                  const val = e.target.value;
                  setDraft(phoneticEnabled ? convertPhoneticOnBoundary(val) : val);
                }}
                placeholder={
                  isOnline
                    ? t('rooms.composerPlaceholder', { room: roomTitle })
                    : t('chat.offlinePlaceholder')
                }
                className="w-full min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs sm:text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
              />
              {draft.length > 1600 && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-[var(--text-muted)]">
                  {draft.length}/{MAX_ROOM_TEXT}
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={sending || (!draft.trim() && !pendingPhoto)}
              aria-label={t('chat.send')}
              className="min-h-[40px] px-3.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-45 text-[var(--brand-primary-fg)] text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">{t('chat.send')}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
