import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  Check,
  CheckCheck,
  Clock,
  ImagePlus,
  Loader2,
  Paperclip,
  Send,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import type { AdminChatMessage, AdminConversation, User } from '../types';
import {
  markAdminConversationRead,
  sendAdminChatMessage,
  setAdminChatTyping,
  subscribeAdminChatMessages,
} from '../lib/adminChatService';
import { compressImageFileToDataUrl, readFileAsBoundedDataUrl } from '../lib/imageCompress';
import { FileMessageCard } from './FileMessageCard';
import { PhotoLightbox } from './PhotoLightbox';
import { ShopAvatar } from './ShopAvatar';
import { useI18n } from '../i18n/I18nContext';

interface AdminChatThreadProps {
  conversation: AdminConversation;
  currentUser: User;
  isAdminView: boolean;
  isNormalUserThread?: boolean;
  onBack: () => void;
  onReviewApplication?: (ownerUid: string) => void;
}

const OFFLINE_QUEUE_PREFIX = 'ahar_admin_chat_queue_';

function readOfflineQueue(convId: string): AdminChatMessage[] {
  try {
    const raw = localStorage.getItem(`${OFFLINE_QUEUE_PREFIX}${convId}`);
    if (!raw) return [];
    return JSON.parse(raw) as AdminChatMessage[];
  } catch {
    return [];
  }
}

function saveOfflineQueue(convId: string, items: AdminChatMessage[]) {
  try {
    if (items.length === 0) {
      localStorage.removeItem(`${OFFLINE_QUEUE_PREFIX}${convId}`);
    } else {
      localStorage.setItem(`${OFFLINE_QUEUE_PREFIX}${convId}`, JSON.stringify(items));
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function AdminChatThread({
  conversation,
  currentUser,
  isAdminView,
  isNormalUserThread = false,
  onBack,
  onReviewApplication,
}: AdminChatThreadProps) {
  const { t, formatTime } = useI18n();
  const [messages, setMessages] = useState<AdminChatMessage[]>([]);
  const [optimisticMsgs, setOptimisticMsgs] = useState<AdminChatMessage[]>(() =>
    readOfflineQueue(conversation.id)
  );
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [lightboxSrc, setLightboxSrc] = useState<{ src: string; caption?: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const viewerRole = isAdminView ? 'admin' : 'owner';
  const myUnread = isAdminView ? conversation.adminUnreadCount : conversation.ownerUnreadCount;
  const peerIsTyping = isAdminView ? conversation.ownerTyping : conversation.adminTyping;

  // Online / offline listeners
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load offline queue when switching threads
  useEffect(() => {
    setOptimisticMsgs(readOfflineQueue(conversation.id));
    setError(null);
  }, [conversation.id]);

  // Real-time messages listener
  useEffect(() => {
    const unsub = subscribeAdminChatMessages(conversation.id, conversation.ownerUid, (items) => {
      setMessages(items);
    });
    return () => unsub();
  }, [conversation.id, conversation.ownerUid]);

  // Auto-mark incoming messages as read while viewing
  useEffect(() => {
    const hasUnreadMessages = messages.some(
      (m) => m.status === 'sent' && m.senderId !== currentUser.id
    );
    if (myUnread > 0 || hasUnreadMessages) {
      void markAdminConversationRead({
        conversationId: conversation.id,
        viewerUid: currentUser.id,
        viewerRole,
        messages,
        unreadCount: myUnread,
      });
    }
  }, [conversation.id, currentUser.id, viewerRole, messages, myUnread]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, optimisticMsgs.length, peerIsTyping]);

  // Flush queued messages when back online
  useEffect(() => {
    if (!isOnline) return;
    const queued = readOfflineQueue(conversation.id);
    if (queued.length === 0) return;

    let cancelled = false;
    (async () => {
      const remaining: AdminChatMessage[] = [];
      for (const item of queued) {
        if (cancelled) {
          remaining.push(item);
          continue;
        }
        try {
          await sendAdminChatMessage({
            conversationId: conversation.id,
            ownerUid: conversation.ownerUid,
            senderId: currentUser.id,
            senderRole: viewerRole,
            senderName: isAdminView
              ? t('adminChat.teamName')
              : conversation.restaurantName || currentUser.name,
            restaurantName: conversation.restaurantName,
            ownerName: conversation.ownerName,
            restaurantLogoUrl: conversation.restaurantLogoUrl,
            verificationStatus: conversation.verificationStatus,
            text: item.text,
            messageType:
              item.messageType === 'image' || item.messageType === 'file'
                ? item.messageType
                : 'text',
            mediaUrl: item.mediaUrl,
            fileName: item.fileName,
            fileSize: item.fileSize,
            fileMime: item.fileMime,
          });
        } catch {
          remaining.push(item);
        }
      }
      if (!cancelled) {
        saveOfflineQueue(conversation.id, remaining);
        setOptimisticMsgs(remaining);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isOnline,
    conversation.id,
    conversation.ownerUid,
    conversation.restaurantName,
    conversation.ownerName,
    conversation.restaurantLogoUrl,
    conversation.verificationStatus,
    currentUser.id,
    currentUser.name,
    viewerRole,
    isAdminView,
    t,
  ]);

  const handleDraftChange = (val: string) => {
    setDraft(val);
    if (!isOnline) return;
    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
    } else {
      void setAdminChatTyping({ conversationId: conversation.id, viewerRole, isTyping: true });
    }
    typingTimerRef.current = window.setTimeout(() => {
      typingTimerRef.current = null;
      void setAdminChatTyping({ conversationId: conversation.id, viewerRole, isTyping: false });
    }, 1800);
  };

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) {
        window.clearTimeout(typingTimerRef.current);
      }
      void setAdminChatTyping({ conversationId: conversation.id, viewerRole, isTyping: false });
    };
  }, [conversation.id, viewerRole]);

  const dispatchMessage = async (payload: {
    text: string;
    messageType: 'text' | 'image' | 'file';
    mediaUrl?: string | null;
    fileName?: string | null;
    fileSize?: number | null;
    fileMime?: string | null;
  }) => {
    setError(null);
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const senderLabel = isAdminView
      ? t('adminChat.teamName')
      : conversation.ownerName || currentUser.name;

    const optimistic: AdminChatMessage = {
      id: tempId,
      clientTempId: tempId,
      conversationId: conversation.id,
      ownerUid: conversation.ownerUid,
      senderId: currentUser.id,
      senderRole: viewerRole,
      senderName: senderLabel,
      text: payload.text,
      messageType: payload.messageType,
      mediaUrl: payload.mediaUrl ?? null,
      fileName: payload.fileName ?? null,
      fileSize: payload.fileSize ?? null,
      fileMime: payload.fileMime ?? null,
      status: 'sending',
      createdAt: new Date().toISOString(),
    };

    if (!isOnline) {
      const nextQueue = [...readOfflineQueue(conversation.id), optimistic];
      saveOfflineQueue(conversation.id, nextQueue);
      setOptimisticMsgs(nextQueue);
      return;
    }

    setOptimisticMsgs((prev) => [...prev, optimistic]);
    setSending(true);
    try {
      await sendAdminChatMessage({
        conversationId: conversation.id,
        ownerUid: conversation.ownerUid,
        senderId: currentUser.id,
        senderRole: viewerRole,
        senderName: senderLabel,
        restaurantName: conversation.restaurantName,
        ownerName: conversation.ownerName,
        restaurantLogoUrl: conversation.restaurantLogoUrl,
        verificationStatus: conversation.verificationStatus,
        text: payload.text,
        messageType: payload.messageType,
        mediaUrl: payload.mediaUrl,
        fileName: payload.fileName,
        fileSize: payload.fileSize,
        fileMime: payload.fileMime,
      });
      setOptimisticMsgs((prev) => prev.filter((m) => m.clientTempId !== tempId));
    } catch (err) {
      setOptimisticMsgs((prev) => prev.filter((m) => m.clientTempId !== tempId));
      setError(err instanceof Error ? err.message : t('chat.sendFailed'));
    } finally {
      setSending(false);
    }
  };

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = draft.trim();
    if (!clean || sending) return;
    setDraft('');
    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    await dispatchMessage({ text: clean, messageType: 'text' });
  };

  const handlePickImage = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setSending(true);
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 880, 260_000);
      await dispatchMessage({
        text: t('adminChat.photoSharedCaption'),
        messageType: 'image',
        mediaUrl: dataUrl,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('restaurant.errPhotoFailed'));
    } finally {
      setSending(false);
    }
  };

  const handlePickFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setSending(true);
    try {
      const read = await readFileAsBoundedDataUrl(file, 260_000);
      await dispatchMessage({
        text: read.fileName,
        messageType: 'file',
        mediaUrl: read.dataUrl,
        fileName: read.fileName,
        fileSize: read.fileSize,
        fileMime: read.fileMime,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('chat.sendFailed'));
    } finally {
      setSending(false);
    }
  };

  const adminQuickReplies = isNormalUserThread
    ? [
        t('adminChat.directAdminQuickReplies.helloHowHelp'),
        t('adminChat.directAdminQuickReplies.pickupConfirm'),
      ]
    : [
        t('adminChat.quickReplies.tradeLicense'),
        t('adminChat.quickReplies.approved'),
        t('adminChat.quickReplies.pickupHours'),
        t('adminChat.quickReplies.clearerPhoto'),
      ];

  const ownerQuickReplies = isNormalUserThread
    ? [
        t('adminChat.userQuickReplies.helloTeam'),
        t('adminChat.userQuickReplies.thankYou'),
      ]
    : [
        t('adminChat.ownerQuickReplies.sentLicense'),
        t('adminChat.ownerQuickReplies.whenApproved'),
      ];

  const allMessages = [...messages, ...optimisticMsgs];

  return (
    <div className="flex flex-col h-full min-h-0">
      <PhotoLightbox
        src={lightboxSrc?.src ?? null}
        caption={lightboxSrc?.caption}
        onClose={() => setLightboxSrc(null)}
      />

      {/* Header */}
      <div className="px-3.5 sm:px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onBack}
            aria-label={t('common.back')}
            className="md:hidden min-h-[38px] min-w-[38px] rounded-xl hover:bg-[var(--bg-subtle)] text-[var(--text-primary)] flex items-center justify-center shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {isAdminView ? (
            <ShopAvatar
              name={conversation.restaurantName}
              imageUrl={conversation.restaurantLogoUrl}
              size="md"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="font-display text-sm font-bold text-[var(--text-primary)] truncate">
                {isAdminView
                  ? isNormalUserThread
                    ? conversation.ownerName
                    : conversation.restaurantName
                  : t('adminChat.teamName')}
              </p>
              {!isAdminView ? (
                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-[var(--brand-soft)] text-[var(--brand-text)] text-[10px] font-bold shrink-0">
                  <BadgeCheck className="w-3 h-3" />
                  {t('adminChat.officialBadge')}
                </span>
              ) : isNormalUserThread ? (
                <span className="px-2 py-0.5 rounded-full bg-[var(--brand-soft)] text-[var(--brand-text)] text-[10px] font-bold shrink-0">
                  {t('chat.roleMember')}
                </span>
              ) : (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                    conversation.verificationStatus === 'approved'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : conversation.verificationStatus === 'rejected'
                        ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                  }`}
                >
                  {t(`restaurant.statuses.${conversation.verificationStatus}`)}
                </span>
              )}
            </div>

            <p className="text-[11px] text-[var(--text-muted)] truncate">
              {peerIsTyping
                ? t('adminChat.typingIndicator')
                : isAdminView
                  ? isNormalUserThread
                    ? t('adminChat.directUserSubtitle')
                    : conversation.ownerName
                  : isNormalUserThread
                    ? t('adminChat.directUserSubtitle')
                    : t('adminChat.teamSubtitle')}
            </p>
          </div>
        </div>

        {isAdminView && !isNormalUserThread && onReviewApplication && (
          <button
            type="button"
            onClick={() => onReviewApplication(conversation.ownerUid)}
            className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] hover:bg-[var(--brand-soft)] text-xs font-semibold text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
          >
            {t('admin.reviewBtn')}
          </button>
        )}
      </div>

      {!isOnline && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/50 border-b border-amber-200 dark:border-amber-900/60 text-xs font-medium text-amber-800 dark:text-amber-200 flex items-center gap-2 shrink-0">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>{t('adminChat.offlineNotice')}</span>
        </div>
      )}

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3 bg-[var(--bg-canvas)]/50">
        {allMessages.length === 0 ? (
          <div className="py-10 text-center space-y-1.5">
            <p className="text-sm font-bold text-[var(--text-primary)]">
              {t('adminChat.emptyThreadTitle')}
            </p>
            <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">
              {t('adminChat.emptyThreadDesc')}
            </p>
          </div>
        ) : (
          allMessages.map((msg) => {
            if (msg.messageType === 'system' || msg.senderRole === 'system') {
              return (
                <div key={msg.id} className="flex justify-center my-2">
                  <div className="max-w-md px-3.5 py-2 rounded-2xl bg-[var(--brand-soft)] border border-[var(--border-subtle)] text-center text-xs font-semibold text-[var(--text-primary)] space-y-0.5 shadow-2xs">
                    <p>{msg.text}</p>
                    <p className="text-[10px] text-[var(--text-muted)] font-normal">
                      {formatTime(msg.createdAt)}
                    </p>
                  </div>
                </div>
              );
            }

            const isMine = msg.senderRole === viewerRole;
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm shadow-2xs space-y-1.5 ${
                    isMine
                      ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] rounded-br-md'
                      : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-bl-md'
                  }`}
                >
                  {msg.messageType === 'image' && msg.mediaUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        setLightboxSrc({
                          src: msg.mediaUrl!,
                          caption: msg.text || conversation.restaurantName,
                        })
                      }
                      className="block rounded-xl overflow-hidden cursor-pointer"
                    >
                      <img
                        src={msg.mediaUrl}
                        alt={msg.text || 'Attachment'}
                        className="max-h-56 w-auto rounded-xl object-cover"
                      />
                    </button>
                  )}

                  {msg.messageType === 'file' && msg.mediaUrl && (
                    <FileMessageCard
                      fileUrl={msg.mediaUrl}
                      fileName={msg.fileName || msg.text || 'document'}
                      fileSize={msg.fileSize}
                      fileMime={msg.fileMime}
                      isMine={isMine}
                    />
                  )}

                  {msg.messageType !== 'file' && msg.text && (
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                      {msg.text}
                    </p>
                  )}

                  <div
                    className={`flex items-center justify-end gap-1 text-[10px] tabular-nums ${
                      isMine ? 'opacity-85' : 'text-[var(--text-muted)]'
                    }`}
                  >
                    <span>{formatTime(msg.createdAt)}</span>
                    {isMine && (
                      <span className="inline-flex items-center gap-0.5">
                        {msg.status === 'sending' ? (
                          <>
                            <Clock className="w-3 h-3" />
                            <span>{t('adminChat.statusSending')}</span>
                          </>
                        ) : msg.status === 'read' ? (
                          <>
                            <CheckCheck className="w-3.5 h-3.5" />
                            <span>{t('adminChat.statusRead')}</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-3 h-3" />
                            <span>{t('adminChat.statusSent')}</span>
                          </>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {peerIsTyping && (
          <div className="flex items-start">
            <div className="px-3.5 py-2 rounded-2xl rounded-bl-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs text-[var(--text-muted)] italic">
              {t('adminChat.typingIndicator')}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Replies Bar */}
      <div className="px-3.5 py-2 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
        {(isAdminView ? adminQuickReplies : ownerQuickReplies).map((qr) => (
          <button
            key={qr}
            type="button"
            disabled={sending}
            onClick={() => dispatchMessage({ text: qr, messageType: 'text' })}
            className="px-3 py-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:bg-[var(--brand-soft)] hover:border-[var(--brand-primary)] text-[11px] font-semibold text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            {qr}
          </button>
        ))}
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-950/45 border-t border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300 flex items-center gap-2 shrink-0">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={handleSendText}
        className="p-3 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center gap-2 shrink-0"
      >
        <label
          title={t('chat.attachPhoto')}
          className="min-h-[40px] min-w-[40px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:bg-[var(--brand-soft)] text-[var(--text-primary)] flex items-center justify-center shrink-0 cursor-pointer"
        >
          <ImagePlus className="w-4 h-4 text-[var(--brand-text)]" />
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={sending}
            onChange={(e) => {
              void handlePickImage(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>

        <label
          title={t('chat.attachFile')}
          className="min-h-[40px] min-w-[40px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:bg-[var(--brand-soft)] text-[var(--text-primary)] flex items-center justify-center shrink-0 cursor-pointer"
        >
          <Paperclip className="w-4 h-4 text-[var(--text-secondary)]" />
          <input
            type="file"
            accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
            className="sr-only"
            disabled={sending}
            onChange={(e) => {
              void handlePickFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>

        <input
          type="text"
          value={draft}
          onChange={(e) => handleDraftChange(e.target.value)}
          placeholder={t('adminChat.composerPlaceholder')}
          className="flex-1 min-w-0 min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
        />

        <button
          type="submit"
          disabled={!draft.trim() || sending}
          aria-label={t('chat.sendBtn')}
          className="min-h-[42px] min-w-[42px] px-3.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-50 text-[var(--brand-primary-fg)] flex items-center justify-center shrink-0 cursor-pointer"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
}
