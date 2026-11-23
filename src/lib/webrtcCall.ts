import type { CallKind } from '../types';

export type MediaAccessErrorKind =
  | 'permission_denied'
  | 'no_camera'
  | 'no_microphone'
  | 'not_supported'
  | 'unknown';

export interface MediaAcquireResult {
  stream: MediaStream | null;
  errorKind: MediaAccessErrorKind | null;
  hasVideoTrack: boolean;
  hasAudioTrack: boolean;
}

export type CallSignalType = 'offer' | 'answer' | 'ice' | 'accept' | 'decline' | 'end';

export interface CallSignalMessage {
  conversationId: string;
  callId: string;
  callType: CallKind;
  signalType: CallSignalType;
  fromUserId?: string;
  payload?: unknown;
}

/**
 * Clean signaling adapter interface so a production WebRTC signaling backend
 * (WebSocket relay, Firebase Firestore/RTDB, or PeerJS) can be swapped in directly.
 */
export interface CallSignalingAdapter {
  sendSignal: (signal: CallSignalMessage) => void;
  subscribe: (handler: (signal: CallSignalMessage) => void) => () => void;
}

export function createWebSocketSignalingAdapter(
  wsSocket: WebSocket | null
): CallSignalingAdapter {
  return {
    sendSignal(signal) {
      if (!wsSocket || wsSocket.readyState !== WebSocket.OPEN) return;
      wsSocket.send(
        JSON.stringify({
          event: 'call:signal',
          data: signal,
        })
      );
    },
    subscribe(handler) {
      if (!wsSocket) return () => {};
      const onMessage = (ev: MessageEvent) => {
        try {
          const parsed = JSON.parse(ev.data);
          if (parsed.event === 'call:signal' && parsed.data) {
            handler(parsed.data as CallSignalMessage);
          }
        } catch {
          // Ignore malformed signaling payloads
        }
      };
      wsSocket.addEventListener('message', onMessage);
      return () => wsSocket.removeEventListener('message', onMessage);
    },
  };
}

export function stopMediaStream(stream: MediaStream | null | undefined) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // Ignore already-stopped track errors
    }
  }
}

export function classifyMediaError(err: unknown, requestedVideo: boolean): MediaAccessErrorKind {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return 'not_supported';
  }
  const name = err instanceof DOMException || err instanceof Error ? err.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return 'permission_denied';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return requestedVideo ? 'no_camera' : 'no_microphone';
  }
  return 'unknown';
}

export async function requestCallMedia(options: {
  video: boolean;
  facingMode?: 'user' | 'environment';
}): Promise<MediaAcquireResult> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return { stream: null, errorKind: 'not_supported', hasVideoTrack: false, hasAudioTrack: false };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: options.video
        ? {
            facingMode: options.facingMode ?? 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }
        : false,
    });
    return {
      stream,
      errorKind: null,
      hasVideoTrack: stream.getVideoTracks().length > 0,
      hasAudioTrack: stream.getAudioTracks().length > 0,
    };
  } catch (err) {
    const errorKind = classifyMediaError(err, options.video);
    // If video call failed solely because camera was missing, try audio-only fallback gracefully
    if (options.video && errorKind === 'no_camera') {
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        return {
          stream: audioOnly,
          errorKind: 'no_camera',
          hasVideoTrack: false,
          hasAudioTrack: audioOnly.getAudioTracks().length > 0,
        };
      } catch {
        // Return original no_camera or permission error below
      }
    }
    return { stream: null, errorKind, hasVideoTrack: false, hasAudioTrack: false };
  }
}

export async function switchCameraFacing(
  currentStream: MediaStream | null,
  peerConnection: RTCPeerConnection | null,
  nextFacing: 'user' | 'environment'
): Promise<{ stream: MediaStream | null; errorKind: MediaAccessErrorKind | null }> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return { stream: currentStream, errorKind: 'not_supported' };
  }
  try {
    const newVideoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: nextFacing }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    const newVideoTrack = newVideoStream.getVideoTracks()[0];
    if (!newVideoTrack) {
      return { stream: currentStream, errorKind: 'no_camera' };
    }

    if (currentStream) {
      for (const oldTrack of currentStream.getVideoTracks()) {
        currentStream.removeTrack(oldTrack);
        oldTrack.stop();
      }
      currentStream.addTrack(newVideoTrack);
    }

    if (peerConnection) {
      const videoSender = peerConnection.getSenders().find((s) => s.track?.kind === 'video');
      if (videoSender) {
        await videoSender.replaceTrack(newVideoTrack);
      }
    }

    return {
      stream: currentStream ?? newVideoStream,
      errorKind: null,
    };
  } catch (err) {
    return { stream: currentStream, errorKind: classifyMediaError(err, true) };
  }
}

export function createPeerConnection(
  localStream: MediaStream | null,
  onIceCandidate: (candidate: RTCIceCandidateInit) => void,
  onRemoteTrack: (stream: MediaStream) => void
): RTCPeerConnection | null {
  if (typeof RTCPeerConnection === 'undefined') return null;
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  });

  if (localStream) {
    for (const track of localStream.getTracks()) {
      pc.addTrack(track, localStream);
    }
  }

  pc.onicecandidate = (ev) => {
    if (ev.candidate) {
      onIceCandidate(ev.candidate.toJSON());
    }
  };

  pc.ontrack = (ev) => {
    if (ev.streams[0]) {
      onRemoteTrack(ev.streams[0]);
    }
  };

  return pc;
}

/**
 * Generates a realistic simulated remote video stream on an HTML5 canvas
 * when no remote WebRTC peer answers (prototype fallback).
 */
export function createSimulatedRemoteVideoStream(
  shopName: string,
  subtitle: string
): { stream: MediaStream | null; stop: () => void } {
  if (typeof document === 'undefined') return { stream: null, stop: () => {} };
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof canvas.captureStream !== 'function') {
    return { stream: null, stop: () => {} };
  }

  let frame = 0;
  const initials = shopName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase() || 'NL';

  const draw = () => {
    frame += 1;
    const t = frame * 0.03;

    // Warm animated kitchen backdrop
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, '#0f291e');
    grad.addColorStop(0.55, '#133a2a');
    grad.addColorStop(1, '#1b4332');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle ambient glow
    const glowX = 320 + Math.sin(t * 0.8) * 55;
    const glowY = 200 + Math.cos(t * 0.6) * 28;
    const radial = ctx.createRadialGradient(glowX, glowY, 15, glowX, glowY, 240);
    radial.addColorStop(0, 'rgba(34, 197, 94, 0.25)');
    radial.addColorStop(1, 'rgba(34, 197, 94, 0)');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Animated speaking ripple rings
    for (let i = 0; i < 3; i++) {
      const pulse = ((t * 0.9 + i * 0.33) % 1);
      ctx.beginPath();
      ctx.arc(320, 210, 62 + pulse * 55, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(134, 239, 172, ${(1 - pulse) * 0.45})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // Center shop avatar circle
    ctx.beginPath();
    ctx.arc(320, 210, 58, 0, Math.PI * 2);
    ctx.fillStyle = '#15803d';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, 320, 212);

    // Shop title & live audio wave bars
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText(shopName, 320, 305);

    ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(subtitle, 320, 334);

    // Subtle simulated audio equalizer bars at bottom
    const barCount = 18;
    const startX = 320 - (barCount * 10) / 2;
    for (let b = 0; b < barCount; b++) {
      const h = 6 + Math.abs(Math.sin(t * 2.5 + b * 0.65)) * 18;
      ctx.fillStyle = 'rgba(134, 239, 172, 0.78)';
      ctx.fillRect(startX + b * 10, 378 - h / 2, 5, h);
    }
  };

  draw();
  const timer = window.setInterval(draw, 66);
  const stream = canvas.captureStream(15);

  return {
    stream,
    stop: () => {
      window.clearInterval(timer);
      stopMediaStream(stream);
    },
  };
}

/**
 * Gentle synthesized ringtone using Web Audio API (no external audio assets).
 */
export function startRingtone(kind: 'outgoing' | 'incoming'): () => void {
  if (typeof window === 'undefined') return () => {};
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return () => {};

  let ctx: AudioContext | null = null;
  try {
    ctx = new AudioCtx();
  } catch {
    return () => {};
  }

  const playBurst = () => {
    if (!ctx || ctx.state === 'closed') return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(kind === 'incoming' ? 523.25 : 440, now);
    if (kind === 'incoming') {
      osc.frequency.setValueAtTime(659.25, now + 0.16);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.45);
  };

  playBurst();
  const interval = window.setInterval(playBurst, kind === 'incoming' ? 1800 : 2200);

  return () => {
    window.clearInterval(interval);
    if (ctx && ctx.state !== 'closed') {
      ctx.close().catch(() => {});
    }
  };
}
