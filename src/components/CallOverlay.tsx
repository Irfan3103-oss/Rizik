import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Mic,
  MicOff,
  Phone,
  PhoneIncoming,
  PhoneOff,
  ShieldCheck,
  SwitchCamera,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { CallKind, CallOutcome } from '../types';
import { useI18n } from '../i18n/I18nContext';
import {
  createPeerConnection,
  createSimulatedRemoteVideoStream,
  requestCallMedia,
  startRingtone,
  stopMediaStream,
  switchCameraFacing,
  type CallSignalingAdapter,
  type MediaAccessErrorKind,
} from '../lib/webrtcCall';

export type CallDirection = 'outgoing' | 'incoming';

export interface ActiveCallSession {
  callId: string;
  conversationId: string;
  callType: CallKind;
  direction: CallDirection;
  peerName: string;
  peerAvatarUrl?: string | null;
  remoteOffer?: RTCSessionDescriptionInit | null;
}

interface CallOverlayProps {
  session: ActiveCallSession | null;
  signaling: CallSignalingAdapter;
  onCallFinished: (result: {
    conversationId: string;
    callType: CallKind;
    callStatus: CallOutcome;
    durationSec: number;
  }) => void;
  onClose: () => void;
}

type CallPhase = 'permission_prompt' | 'outgoing_ringing' | 'incoming_ringing' | 'active';

export function CallOverlay({
  session,
  signaling,
  onCallFinished,
  onClose,
}: CallOverlayProps) {
  const { t, formatNumber } = useI18n();
  const [phase, setPhase] = useState<CallPhase>('permission_prompt');
  const [micMuted, setMicMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [cameraOff, setCameraOff] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [mediaError, setMediaError] = useState<MediaAccessErrorKind | null>(null);
  const [isSimulatedPeer, setIsSimulatedPeer] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [hasLocalVideo, setHasLocalVideo] = useState(false);

  // Draggable PiP window position (offset from top-right corner)
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pipPos, setPipPos] = useState<{ x: number; y: number }>({ x: 16, y: 76 });
  const dragStateRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({ dragging: false, startX: 0, startY: 0, origX: 16, origY: 76 });

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const simStopRef = useRef<(() => void) | null>(null);
  const ringtoneStopRef = useRef<(() => void) | null>(null);
  const simConnectTimerRef = useRef<number | null>(null);
  const ringTimeoutRef = useRef<number | null>(null);
  const finalizedRef = useRef(false);
  const elapsedRef = useRef(0);

  useEffect(() => {
    elapsedRef.current = elapsedSec;
  }, [elapsedSec]);

  const cleanupAllMedia = useCallback(() => {
    if (simConnectTimerRef.current) {
      window.clearTimeout(simConnectTimerRef.current);
      simConnectTimerRef.current = null;
    }
    if (ringTimeoutRef.current) {
      window.clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
    ringtoneStopRef.current?.();
    ringtoneStopRef.current = null;

    simStopRef.current?.();
    simStopRef.current = null;

    stopMediaStream(localStreamRef.current);
    localStreamRef.current = null;

    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {
        // Ignore
      }
      pcRef.current = null;
    }

    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  }, []);

  const finishCall = useCallback(
    (outcome: CallOutcome, sendEndSignal = true) => {
      if (!session || finalizedRef.current) return;
      finalizedRef.current = true;
      const finalDuration = outcome === 'completed' ? elapsedRef.current : 0;
      if (sendEndSignal) {
        signaling.sendSignal({
          conversationId: session.conversationId,
          callId: session.callId,
          callType: session.callType,
          signalType: outcome === 'declined' ? 'decline' : 'end',
        });
      }
      cleanupAllMedia();
      onCallFinished({
        conversationId: session.conversationId,
        callType: session.callType,
        callStatus: outcome,
        durationSec: finalDuration,
      });
      onClose();
    },
    [session, signaling, cleanupAllMedia, onCallFinished, onClose]
  );

  // Initialize state whenever a new call session opens
  useEffect(() => {
    if (!session) {
      cleanupAllMedia();
      return;
    }
    finalizedRef.current = false;
    setMicMuted(false);
    setSpeakerOn(true);
    setCameraOff(false);
    setFacingMode('user');
    setMediaError(null);
    setIsSimulatedPeer(false);
    setElapsedSec(0);
    setHasLocalVideo(false);
    setPipPos({ x: 16, y: 76 });

    if (session.direction === 'incoming') {
      setPhase('incoming_ringing');
      ringtoneStopRef.current = startRingtone('incoming');
    } else {
      setPhase('permission_prompt');
    }

    return () => {
      cleanupAllMedia();
    };
  }, [session?.callId, cleanupAllMedia]);

  // Attach local stream whenever video element mounts
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
      localVideoRef.current.play().catch(() => {});
    }
  }, [phase, hasLocalVideo, cameraOff]);

  // Active call duration timer
  useEffect(() => {
    if (phase !== 'active') return;
    const id = window.setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  // Setup simulated remote stream if active & simulated peer
  useEffect(() => {
    if (!session || phase !== 'active' || !isSimulatedPeer) return;
    if (session.callType === 'video') {
      const sim = createSimulatedRemoteVideoStream(
        session.peerName,
        t('call.simulatedRemoteSubtitle')
      );
      simStopRef.current = sim.stop;
      if (remoteVideoRef.current && sim.stream) {
        remoteVideoRef.current.srcObject = sim.stream;
        remoteVideoRef.current.play().catch(() => {});
      }
      return () => {
        sim.stop();
        simStopRef.current = null;
      };
    }
    return undefined;
  }, [phase, isSimulatedPeer, session?.callId, session?.callType, session?.peerName, t]);

  // Subscribe to WebRTC signaling messages for real peer-to-peer handshakes
  useEffect(() => {
    if (!session) return;
    const unsubscribe = signaling.subscribe(async (sig) => {
      if (sig.callId !== session.callId || sig.conversationId !== session.conversationId) return;

      if (sig.signalType === 'decline') {
        finishCall('declined', false);
        return;
      }
      if (sig.signalType === 'end') {
        finishCall(phase === 'active' ? 'completed' : 'missed', false);
        return;
      }
      if (sig.signalType === 'accept') {
        if (simConnectTimerRef.current) {
          window.clearTimeout(simConnectTimerRef.current);
          simConnectTimerRef.current = null;
        }
        ringtoneStopRef.current?.();
        ringtoneStopRef.current = null;
        setIsSimulatedPeer(false);
        setPhase('active');
        return;
      }
      if (sig.signalType === 'answer' && pcRef.current && sig.payload) {
        if (simConnectTimerRef.current) {
          window.clearTimeout(simConnectTimerRef.current);
          simConnectTimerRef.current = null;
        }
        ringtoneStopRef.current?.();
        ringtoneStopRef.current = null;
        setIsSimulatedPeer(false);
        setPhase('active');
        try {
          await pcRef.current.setRemoteDescription(
            new RTCSessionDescription(sig.payload as RTCSessionDescriptionInit)
          );
        } catch {
          // Ignore SDP mismatch
        }
      }
      if (sig.signalType === 'ice' && pcRef.current && sig.payload) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(sig.payload as RTCIceCandidateInit));
        } catch {
          // Ignore stale ICE
        }
      }
    });

    return unsubscribe;
  }, [session, signaling, phase, finishCall]);

  // Start outgoing call after user confirms friendly media permission prompt
  const handleStartOutgoingWithMedia = async () => {
    if (!session) return;
    const wantsVideo = session.callType === 'video';
    const media = await requestCallMedia({ video: wantsVideo, facingMode });

    if (media.stream) {
      localStreamRef.current = media.stream;
      setHasLocalVideo(media.hasVideoTrack);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = media.stream;
        localVideoRef.current.play().catch(() => {});
      }
    }
    if (media.errorKind) {
      setMediaError(media.errorKind);
    }

    setPhase('outgoing_ringing');
    ringtoneStopRef.current = startRingtone('outgoing');

    const pc = createPeerConnection(
      media.stream,
      (candidate) => {
        signaling.sendSignal({
          conversationId: session.conversationId,
          callId: session.callId,
          callType: session.callType,
          signalType: 'ice',
          payload: candidate,
        });
      },
      (remoteStream) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          remoteVideoRef.current.play().catch(() => {});
        }
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;
          remoteAudioRef.current.play().catch(() => {});
        }
      }
    );
    pcRef.current = pc;

    // Create WebRTC offer and send over signaling transport
    if (pc) {
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: wantsVideo,
        });
        await pc.setLocalDescription(offer);
        signaling.sendSignal({
          conversationId: session.conversationId,
          callId: session.callId,
          callType: session.callType,
          signalType: 'offer',
          payload: offer,
        });
      } catch {
        signaling.sendSignal({
          conversationId: session.conversationId,
          callId: session.callId,
          callType: session.callType,
          signalType: 'offer',
        });
      }
    } else {
      signaling.sendSignal({
        conversationId: session.conversationId,
        callId: session.callId,
        callType: session.callType,
        signalType: 'offer',
      });
    }

    // Prototype fallback: if no remote peer accepts over WebSocket within 2.6s, connect simulated peer
    simConnectTimerRef.current = window.setTimeout(() => {
      ringtoneStopRef.current?.();
      ringtoneStopRef.current = null;
      setIsSimulatedPeer(true);
      setPhase('active');
    }, 2600);
  };

  // Accept incoming call
  const handleAcceptIncoming = async () => {
    if (!session) return;
    ringtoneStopRef.current?.();
    ringtoneStopRef.current = null;

    const wantsVideo = session.callType === 'video';
    const media = await requestCallMedia({ video: wantsVideo, facingMode });
    if (media.stream) {
      localStreamRef.current = media.stream;
      setHasLocalVideo(media.hasVideoTrack);
    }
    if (media.errorKind) {
      setMediaError(media.errorKind);
    }

    const pc = createPeerConnection(
      media.stream,
      (candidate) => {
        signaling.sendSignal({
          conversationId: session.conversationId,
          callId: session.callId,
          callType: session.callType,
          signalType: 'ice',
          payload: candidate,
        });
      },
      (remoteStream) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          remoteVideoRef.current.play().catch(() => {});
        }
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;
          remoteAudioRef.current.play().catch(() => {});
        }
      }
    );
    pcRef.current = pc;

    if (pc && session.remoteOffer) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(session.remoteOffer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signaling.sendSignal({
          conversationId: session.conversationId,
          callId: session.callId,
          callType: session.callType,
          signalType: 'answer',
          payload: answer,
        });
      } catch {
        signaling.sendSignal({
          conversationId: session.conversationId,
          callId: session.callId,
          callType: session.callType,
          signalType: 'accept',
        });
      }
    } else {
      // Simulated incoming call or offerless signal
      setIsSimulatedPeer(!session.remoteOffer);
      signaling.sendSignal({
        conversationId: session.conversationId,
        callId: session.callId,
        callType: session.callType,
        signalType: 'accept',
      });
    }

    setPhase('active');
  };

  const handleToggleMic = () => {
    const next = !micMuted;
    setMicMuted(next);
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getAudioTracks()) {
        track.enabled = !next;
      }
    }
  };

  const handleToggleSpeaker = () => {
    const next = !speakerOn;
    setSpeakerOn(next);
    if (remoteAudioRef.current) {
      remoteAudioRef.current.volume = next ? 1 : 0.25;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.volume = next ? 1 : 0.25;
    }
  };

  const handleToggleCamera = () => {
    const nextOff = !cameraOff;
    setCameraOff(nextOff);
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getVideoTracks()) {
        track.enabled = !nextOff;
      }
    }
  };

  const handleSwitchCamera = async () => {
    const nextFacing = facingMode === 'user' ? 'environment' : 'user';
    const res = await switchCameraFacing(localStreamRef.current, pcRef.current, nextFacing);
    if (res.errorKind) {
      setMediaError(res.errorKind);
      return;
    }
    setFacingMode(nextFacing);
    if (localVideoRef.current && res.stream) {
      localVideoRef.current.srcObject = res.stream;
      localVideoRef.current.play().catch(() => {});
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = String(sec % 60).padStart(2, '0');
    return `${formatNumber(m)}:${formatNumber(s)}`;
  };

  const getMediaErrorBanner = (kind: MediaAccessErrorKind) => {
    if (kind === 'permission_denied') return t('call.permissionDeniedBanner');
    if (kind === 'no_camera') return t('call.noCameraBanner');
    if (kind === 'no_microphone') return t('call.noMicBanner');
    if (kind === 'not_supported') return t('call.notSupportedBanner');
    return t('call.genericMediaBanner');
  };

  // Draggable PiP pointer handlers
  const handlePipPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: pipPos.x,
      origY: pipPos.y,
    };
  };

  const handlePipPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.dragging) return;
    const dx = e.clientX - dragStateRef.current.startX;
    const dy = e.clientY - dragStateRef.current.startY;
    const rect = containerRef.current?.getBoundingClientRect();
    const maxX = rect ? Math.max(16, rect.width - 132) : 240;
    const maxY = rect ? Math.max(76, rect.height - 230) : 360;
    // x is right-offset so dragging right decreases x, dragging left increases x
    const nextX = Math.max(12, Math.min(maxX, dragStateRef.current.origX - dx));
    const nextY = Math.max(12, Math.min(maxY, dragStateRef.current.origY + dy));
    setPipPos({ x: nextX, y: nextY });
  };

  const handlePipPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current.dragging) {
      dragStateRef.current.dragging = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
    }
  };

  if (!session) return null;

  const isVideo = session.callType === 'video';
  const initials =
    session.peerName
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] ?? '')
      .join('')
      .toUpperCase() || 'NL';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isVideo ? t('call.videoCallTitle') : t('call.voiceCallTitle')}
      className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-0 sm:p-4"
    >
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Friendly Permission Prompt Step */}
      {phase === 'permission_prompt' ? (
        <div className="w-full max-w-md mx-4 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-6 shadow-2xl space-y-5 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[var(--brand-soft)] text-[var(--brand-text)] flex items-center justify-center mx-auto">
            {isVideo ? <Video className="w-7 h-7" /> : <Phone className="w-7 h-7" />}
          </div>
          <div className="space-y-1.5">
            <h3 className="font-display text-lg font-bold text-[var(--text-primary)]">
              {isVideo ? t('call.permissionVideoTitle') : t('call.permissionVoiceTitle')}
            </h3>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
              {isVideo ? t('call.permissionVideoDesc') : t('call.permissionVoiceDesc')}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex items-center gap-2.5 text-left text-xs text-[var(--text-secondary)]">
            <ShieldCheck className="w-4 h-4 text-[var(--brand-text)] shrink-0" />
            <span>{t('call.permissionPrivacyNote')}</span>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                cleanupAllMedia();
                onClose();
              }}
              className="flex-1 min-h-[46px] px-4 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-canvas)] text-sm font-semibold text-[var(--text-primary)] cursor-pointer"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleStartOutgoingWithMedia}
              className="flex-1 min-h-[46px] px-4 py-2.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-sm font-semibold cursor-pointer"
            >
              {t('call.allowAndCall')}
            </button>
          </div>
        </div>
      ) : (
        /* Main Call Viewport (Ringing, Incoming, Active Voice or Active Video) */
        <div
          ref={containerRef}
          className="relative w-full h-full sm:max-w-2xl sm:h-[640px] sm:max-h-[90vh] sm:rounded-3xl overflow-hidden bg-gradient-to-br from-slate-900 via-[#10251b] to-slate-950 text-white shadow-2xl border border-white/10 flex flex-col justify-between"
        >
          {/* Remote Video Layer (Active Video Call) */}
          {isVideo && phase === 'active' && (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}

          {/* Top Bar: Shop Name, Status / Timer, Error Banner */}
          <div className="relative z-20 p-4 sm:p-5 bg-gradient-to-b from-black/70 via-black/35 to-transparent space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {session.peerAvatarUrl ? (
                  <img
                    src={session.peerAvatarUrl}
                    alt={session.peerName}
                    className="w-10 h-10 rounded-xl object-cover border border-white/25 shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white font-bold text-sm flex items-center justify-center shrink-0">
                    {initials}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-display text-sm sm:text-base font-bold truncate">
                    {session.peerName}
                  </p>
                  <p className="text-xs text-emerald-300 font-medium tabular-nums">
                    {phase === 'outgoing_ringing'
                      ? t('call.callingState')
                      : phase === 'incoming_ringing'
                        ? isVideo
                          ? t('call.incomingVideoLabel')
                          : t('call.incomingVoiceLabel')
                        : `${isVideo ? t('call.videoCallTitle') : t('call.voiceCallTitle')} · ${formatTimer(elapsedSec)}`}
                  </p>
                </div>
              </div>

              {phase === 'active' && isSimulatedPeer && (
                <span className="px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-xs text-[11px] font-semibold text-white/90 shrink-0">
                  {t('call.previewModeBadge')}
                </span>
              )}
            </div>

            {mediaError && (
              <div className="px-3 py-2 rounded-xl bg-amber-500/20 border border-amber-400/35 text-amber-100 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
                <span>{getMediaErrorBanner(mediaError)}</span>
              </div>
            )}
          </div>

          {/* Center Visuals (Voice Call / Outgoing Ringing / Incoming Ringing) */}
          {(!isVideo || phase !== 'active') && (
            <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center space-y-5">
              <div className="relative flex items-center justify-center">
                {(phase === 'outgoing_ringing' || phase === 'incoming_ringing') && (
                  <>
                    <span className="absolute w-40 h-40 rounded-full border border-emerald-400/30 animate-ping" />
                    <span className="absolute w-32 h-32 rounded-full border border-emerald-400/45 animate-pulse" />
                  </>
                )}
                {session.peerAvatarUrl ? (
                  <img
                    src={session.peerAvatarUrl}
                    alt={session.peerName}
                    className="w-28 h-28 rounded-3xl object-cover border-2 border-white/40 shadow-2xl relative z-10"
                  />
                ) : (
                  <div className="w-28 h-28 rounded-3xl bg-emerald-700 text-white font-display font-extrabold text-3xl flex items-center justify-center border-2 border-white/40 shadow-2xl relative z-10">
                    {initials}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <h3 className="font-display text-2xl font-bold tracking-tight">
                  {session.peerName}
                </h3>
                <p className="text-sm text-white/75 tabular-nums">
                  {phase === 'outgoing_ringing'
                    ? t('call.ringingState')
                    : phase === 'incoming_ringing'
                      ? isVideo
                        ? t('call.incomingVideoLabel')
                        : t('call.incomingVoiceLabel')
                      : formatTimer(elapsedSec)}
                </p>
              </div>
            </div>
          )}

          {/* Small Draggable Local Camera Preview (Video Call) */}
          {isVideo && (phase === 'active' || phase === 'outgoing_ringing') && (
            <div
              onPointerDown={handlePipPointerDown}
              onPointerMove={handlePipPointerMove}
              onPointerUp={handlePipPointerUp}
              style={{ right: `${pipPos.x}px`, top: `${pipPos.y}px`, touchAction: 'none' }}
              title={t('call.dragPreviewHint')}
              className="absolute z-30 w-28 sm:w-32 aspect-[3/4] rounded-2xl overflow-hidden bg-slate-900 border-2 border-white/40 shadow-2xl cursor-grab active:cursor-grabbing select-none"
            >
              {hasLocalVideo && !cameraOff ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${
                    facingMode === 'user' ? 'scale-x-[-1]' : ''
                  }`}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-white/70 p-2 text-center">
                  <VideoOff className="w-5 h-5" />
                  <span className="text-[10px] font-medium">
                    {cameraOff ? t('call.cameraOffLabel') : t('call.noCameraLabel')}
                  </span>
                </div>
              )}
              <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/60 text-[10px] font-semibold">
                {t('call.youLabel')}
              </span>
            </div>
          )}

          {/* Bottom Call Controls */}
          <div className="relative z-20 p-5 sm:p-6 bg-gradient-to-t from-black/80 via-black/45 to-transparent">
            {phase === 'incoming_ringing' ? (
              <div className="flex items-center justify-center gap-8">
                <button
                  type="button"
                  onClick={() => finishCall('declined', true)}
                  aria-label={t('call.declineBtn')}
                  className="flex flex-col items-center gap-2 cursor-pointer group"
                >
                  <span className="w-16 h-16 rounded-full bg-red-600 group-hover:bg-red-500 text-white flex items-center justify-center shadow-lg transition-transform group-active:scale-95">
                    <PhoneOff className="w-7 h-7" />
                  </span>
                  <span className="text-xs font-semibold text-white/90">{t('call.declineBtn')}</span>
                </button>

                <button
                  type="button"
                  onClick={handleAcceptIncoming}
                  aria-label={t('call.acceptBtn')}
                  className="flex flex-col items-center gap-2 cursor-pointer group"
                >
                  <span className="w-16 h-16 rounded-full bg-emerald-600 group-hover:bg-emerald-500 text-white flex items-center justify-center shadow-lg animate-pulse transition-transform group-active:scale-95">
                    <PhoneIncoming className="w-7 h-7" />
                  </span>
                  <span className="text-xs font-semibold text-white/90">{t('call.acceptBtn')}</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-3 sm:gap-4 flex-wrap">
                {/* Mute Mic */}
                <button
                  type="button"
                  onClick={handleToggleMic}
                  aria-label={micMuted ? t('call.unmuteBtn') : t('call.muteBtn')}
                  title={micMuted ? t('call.unmuteBtn') : t('call.muteBtn')}
                  className={`flex flex-col items-center gap-1.5 min-w-[60px] cursor-pointer ${
                    micMuted ? 'text-amber-300' : 'text-white'
                  }`}
                >
                  <span
                    className={`w-12 h-12 sm:w-13 sm:h-13 rounded-full flex items-center justify-center transition-colors ${
                      micMuted ? 'bg-white text-slate-900' : 'bg-white/18 hover:bg-white/28'
                    }`}
                  >
                    {micMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </span>
                  <span className="text-[11px] font-medium">
                    {micMuted ? t('call.unmuteBtn') : t('call.muteBtn')}
                  </span>
                </button>

                {/* Voice Call: Speaker toggle | Video Call: Camera On/Off & Switch Camera */}
                {!isVideo ? (
                  <button
                    type="button"
                    onClick={handleToggleSpeaker}
                    aria-label={t('call.speakerBtn')}
                    title={t('call.speakerBtn')}
                    className="flex flex-col items-center gap-1.5 min-w-[60px] text-white cursor-pointer"
                  >
                    <span
                      className={`w-12 h-12 sm:w-13 sm:h-13 rounded-full flex items-center justify-center transition-colors ${
                        speakerOn ? 'bg-white text-slate-900' : 'bg-white/18 hover:bg-white/28'
                      }`}
                    >
                      {speakerOn ? (
                        <Volume2 className="w-5 h-5" />
                      ) : (
                        <VolumeX className="w-5 h-5" />
                      )}
                    </span>
                    <span className="text-[11px] font-medium">{t('call.speakerBtn')}</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleToggleCamera}
                      aria-label={cameraOff ? t('call.cameraOnBtn') : t('call.cameraOffBtn')}
                      title={cameraOff ? t('call.cameraOnBtn') : t('call.cameraOffBtn')}
                      className="flex flex-col items-center gap-1.5 min-w-[60px] text-white cursor-pointer"
                    >
                      <span
                        className={`w-12 h-12 sm:w-13 sm:h-13 rounded-full flex items-center justify-center transition-colors ${
                          cameraOff ? 'bg-white text-slate-900' : 'bg-white/18 hover:bg-white/28'
                        }`}
                      >
                        {cameraOff ? (
                          <VideoOff className="w-5 h-5" />
                        ) : (
                          <Video className="w-5 h-5" />
                        )}
                      </span>
                      <span className="text-[11px] font-medium">
                        {cameraOff ? t('call.cameraOnBtn') : t('call.cameraOffBtn')}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSwitchCamera}
                      disabled={!hasLocalVideo || cameraOff}
                      aria-label={t('call.switchCameraBtn')}
                      title={t('call.switchCameraBtn')}
                      className="flex flex-col items-center gap-1.5 min-w-[60px] text-white disabled:opacity-45 cursor-pointer"
                    >
                      <span className="w-12 h-12 sm:w-13 sm:h-13 rounded-full bg-white/18 hover:bg-white/28 flex items-center justify-center transition-colors">
                        <SwitchCamera className="w-5 h-5" />
                      </span>
                      <span className="text-[11px] font-medium">{t('call.switchCameraBtn')}</span>
                    </button>
                  </>
                )}

                {/* End Call */}
                <button
                  type="button"
                  onClick={() =>
                    finishCall(phase === 'active' ? 'completed' : 'cancelled', true)
                  }
                  aria-label={t('call.endBtn')}
                  title={t('call.endBtn')}
                  className="flex flex-col items-center gap-1.5 min-w-[60px] text-white cursor-pointer"
                >
                  <span className="w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center shadow-lg transition-transform active:scale-95">
                    <PhoneOff className="w-6 h-6" />
                  </span>
                  <span className="text-[11px] font-semibold text-red-200">
                    {t('call.endBtn')}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
