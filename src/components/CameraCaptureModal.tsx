import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Image as ImageIcon,
  RotateCcw,
  Send,
  SwitchCamera,
  X,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import {
  classifyMediaError,
  stopMediaStream,
  type MediaAccessErrorKind,
} from '../lib/webrtcCall';

interface CameraCaptureModalProps {
  open: boolean;
  onClose: () => void;
  onSendPhoto: (dataUrl: string, caption: string) => Promise<void> | void;
  onPickGalleryFallback: () => void;
}

export function CameraCaptureModal({
  open,
  onClose,
  onSendPhoto,
  onPickGalleryFallback,
}: CameraCaptureModalProps) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [errorKind, setErrorKind] = useState<MediaAccessErrorKind | null>(null);
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);

  const stopCamera = useCallback(() => {
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(
    async (mode: 'user' | 'environment') => {
      stopCamera();
      setErrorKind(null);
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setErrorKind('not_supported');
        return;
      }
      setStarting(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        setErrorKind(classifyMediaError(err, true));
      } finally {
        setStarting(false);
      }
    },
    [stopCamera]
  );

  useEffect(() => {
    if (!open) {
      stopCamera();
      setCapturedUrl(null);
      setCaption('');
      setErrorKind(null);
      return;
    }
    if (!capturedUrl) {
      startCamera(facingMode);
    }
    return () => {
      stopCamera();
    };
  }, [open, facingMode, capturedUrl, startCamera, stopCamera]);

  if (!open) return null;

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    stopCamera();
    setCapturedUrl(dataUrl);
  };

  const handleRetake = () => {
    setCapturedUrl(null);
  };

  const handleSend = async () => {
    if (!capturedUrl || sending) return;
    setSending(true);
    try {
      await onSendPhoto(capturedUrl, caption);
      stopCamera();
      onClose();
    } finally {
      setSending(false);
    }
  };

  const getErrorText = (kind: MediaAccessErrorKind) => {
    if (kind === 'permission_denied') return t('camera.permissionDenied');
    if (kind === 'no_camera') return t('camera.noCameraFound');
    if (kind === 'not_supported') return t('camera.notSupported');
    return t('camera.genericError');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('camera.title')}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="w-full max-w-lg rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-[var(--brand-text)]" />
            <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
              {t('camera.title')}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            aria-label={t('common.close')}
            className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Viewport */}
        <div className="relative bg-slate-950 aspect-[4/3] w-full flex items-center justify-center overflow-hidden">
          {capturedUrl ? (
            <img
              src={capturedUrl}
              alt={t('camera.capturedAlt')}
              className="w-full h-full object-contain"
            />
          ) : errorKind ? (
            <div className="p-6 text-center space-y-3 max-w-sm">
              <div className="w-12 h-12 rounded-2xl bg-red-500/15 text-red-400 flex items-center justify-center mx-auto">
                <Camera className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-white">{getErrorText(errorKind)}</p>
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => startCamera(facingMode)}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold cursor-pointer"
                >
                  {t('camera.retry')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    onClose();
                    onPickGalleryFallback();
                  }}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  {t('camera.chooseGallery')}
                </button>
              </div>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
              />
              {starting && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-xs text-white font-medium">
                  {t('camera.starting')}
                </div>
              )}
              <button
                type="button"
                onClick={() =>
                  setFacingMode((m) => (m === 'user' ? 'environment' : 'user'))
                }
                aria-label={t('camera.switchCamera')}
                title={t('camera.switchCamera')}
                className="absolute top-3 right-3 min-h-[42px] min-w-[42px] rounded-full bg-black/55 hover:bg-black/75 text-white flex items-center justify-center backdrop-blur-xs cursor-pointer"
              >
                <SwitchCamera className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* Footer Controls */}
        <div className="p-4 bg-[var(--bg-surface)] space-y-3">
          {capturedUrl ? (
            <>
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder={t('camera.captionPlaceholder')}
                className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
              />
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleRetake}
                  disabled={sending}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-canvas)] text-[var(--text-primary)] text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  {t('camera.retake')}
                </button>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending}
                  className="flex-1 min-h-[44px] px-5 py-2 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-60 text-[var(--brand-primary-fg)] text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  {sending ? t('camera.sending') : t('camera.send')}
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  onClose();
                  onPickGalleryFallback();
                }}
                className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ImageIcon className="w-4 h-4" />
                {t('camera.chooseGallery')}
              </button>

              <button
                type="button"
                onClick={handleCapture}
                disabled={Boolean(errorKind) || starting}
                aria-label={t('camera.capture')}
                className="min-h-[48px] px-6 py-2.5 rounded-full bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-45 text-[var(--brand-primary-fg)] text-sm font-bold inline-flex items-center gap-2 shadow-md cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                {t('camera.capture')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
