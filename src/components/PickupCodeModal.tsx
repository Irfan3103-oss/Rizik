import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { QRCodeSVG } from 'qrcode.react';
import {
  Camera,
  CheckCircle2,
  Clock,
  KeyRound,
  MapPin,
  QrCode,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import type { Claim } from '../types';
import { useI18n } from '../i18n/I18nContext';

interface PickupCodeModalProps {
  claim: Claim | null;
  mode: 'recipient' | 'donor';
  onClose: () => void;
  onConfirmCode?: (
    claimId: string,
    code: string,
    method?: 'qr' | 'manual'
  ) => Promise<void>;
}

export function PickupCodeModal({
  claim,
  mode,
  onClose,
  onConfirmCode,
}: PickupCodeModalProps) {
  const { t, formatNumber, formatWindow, formatAddress } = useI18n();
  const [donorTab, setDonorTab] = useState<'scan' | 'manual'>('scan');
  const [enteredCode, setEnteredCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningLockRef = useRef(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const processQrPayload = useCallback(
    async (raw: string) => {
      if (!claim || !onConfirmCode || scanningLockRef.current) return;
      let parsedCode = raw.trim().toUpperCase();
      try {
        const obj = JSON.parse(raw) as { claimId?: string; code?: string };
        if (obj.claimId && obj.claimId !== claim.id) {
          setError(t('pickup.qrWrongClaim'));
          return;
        }
        if (obj.code) {
          parsedCode = String(obj.code).trim().toUpperCase();
        }
      } catch {
        // Allow plain 6-char pickup code in QR payload
      }
      if (parsedCode.length < 4) return;
      scanningLockRef.current = true;
      setError(null);
      setScanStatus(t('pickup.qrDetected', { code: parsedCode }));
      setSubmitting(true);
      try {
        await onConfirmCode(claim.id, parsedCode, 'qr');
        stopCamera();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('pickup.invalidCode'));
        setScanStatus(null);
        scanningLockRef.current = false;
      } finally {
        setSubmitting(false);
      }
    },
    [claim, onConfirmCode, onClose, stopCamera, t]
  );

  useEffect(() => {
    setError(null);
    setCameraError(null);
    setScanStatus(null);
    setEnteredCode('');
    scanningLockRef.current = false;
  }, [claim?.id, mode]);

  useEffect(() => {
    if (!claim || mode !== 'donor' || donorTab !== 'scan') {
      stopCamera();
      return;
    }

    let cancelled = false;
    let timerId: number | null = null;

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(t('pickup.qrCameraError'));
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCameraError(null);

        timerId = window.setInterval(() => {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (!video || !canvas || video.readyState < 2 || scanningLockRef.current) return;
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (!w || !h) return;
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.drawImage(video, 0, 0, w, h);
          const imgData = ctx.getImageData(0, 0, w, h);
          const decoded = jsQR(imgData.data, w, h);
          if (decoded?.data) {
            processQrPayload(decoded.data);
          }
        }, 220);
      } catch {
        if (!cancelled) {
          setCameraError(t('pickup.qrCameraError'));
        }
      }
    };

    startCamera();
    return () => {
      cancelled = true;
      if (timerId !== null) window.clearInterval(timerId);
      stopCamera();
    };
  }, [claim, mode, donorTab, processQrPayload, stopCamera, t]);

  if (!claim) return null;

  const handleSubmitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onConfirmCode) return;
    setError(null);
    setSubmitting(true);
    try {
      await onConfirmCode(claim.id, enteredCode.trim().toUpperCase(), 'manual');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('pickup.invalidCode'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUploadQrImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const decoded = jsQR(imgData.data, canvas.width, canvas.height);
        if (decoded?.data) {
          processQrPayload(decoded.data);
        } else {
          setError(t('pickup.qrInvalidImage'));
        }
      };
      img.onerror = () => setError(t('pickup.qrInvalidImage'));
      img.src = dataUrl;
    } catch {
      setError(t('pickup.qrInvalidImage'));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'recipient' ? t('pickup.recipientTitle') : t('pickup.donorTitle')}
    >
      <div className="w-full md:max-w-md bg-[var(--bg-surface)] rounded-t-3xl md:rounded-2xl border border-[var(--border-subtle)] shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="md:hidden w-10 h-1.5 bg-[var(--border-strong)] rounded-full mx-auto mt-3 shrink-0" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)] shrink-0">
          <h2 className="text-base font-bold text-[var(--text-primary)]">
            {mode === 'recipient' ? t('pickup.recipientTitle') : t('pickup.donorTitle')}
          </h2>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            aria-label={t('common.close')}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto">
          {mode === 'recipient' ? (
            <>
              <div className="text-center space-y-2">
                <p className="text-sm text-[var(--text-secondary)]">{t('pickup.showToDonor')}</p>
                <div className="inline-flex items-center justify-center p-4 bg-white rounded-2xl border border-[var(--border-subtle)] shadow-sm my-2">
                  <QRCodeSVG
                    value={JSON.stringify({ claimId: claim.id, code: claim.pickupCode })}
                    size={168}
                    level="M"
                  />
                </div>
                <div className="pt-1">
                  <span className="text-xs font-medium text-[var(--text-muted)] block mb-1">
                    {t('pickup.manualCode')}
                  </span>
                  <div className="text-3xl font-mono font-bold tracking-[0.22em] text-[var(--brand-text)] tabular-nums select-all">
                    {claim.pickupCode}
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-[var(--bg-subtle)] p-4 space-y-2 text-sm border border-[var(--border-subtle)]">
                <p className="font-semibold text-[var(--text-primary)]">{claim.listingTitle}</p>
                <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                  <ShieldCheck className="w-4 h-4 text-[var(--brand-text)] shrink-0" />
                  <span>
                    {claim.donorBusinessName} · {formatNumber(claim.quantityClaimed)}{' '}
                    {t('common.portions')}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                  <MapPin className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                  <span>{formatAddress(claim.donorAddress, claim.donorAddressBn)}</span>
                </div>
                <div className="flex items-center gap-2 text-[var(--text-secondary)] tabular-nums">
                  <Clock className="w-4 h-4 text-[var(--brand-accent-text)] shrink-0" />
                  <span>{formatWindow(claim.pickupStart, claim.pickupEnd)}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl bg-[var(--bg-subtle)] p-4 text-sm space-y-1 border border-[var(--border-subtle)]">
                <p className="font-semibold text-[var(--text-primary)]">{claim.listingTitle}</p>
                <p className="text-[var(--text-secondary)]">
                  {t('pickup.recipientLabel', {
                    name: claim.recipientOrg
                      ? `${claim.recipientName} (${claim.recipientOrg})`
                      : claim.recipientName,
                  })}
                </p>
                <p className="text-[var(--text-muted)] tabular-nums">
                  {t('pickup.quantityLabel', { count: claim.quantityClaimed })}
                </p>
              </div>

              {/* Segmented Tabs: Scan QR vs Manual 6-Char Code */}
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setDonorTab('scan')}
                  className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    donorTab === 'scan'
                      ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]'
                      : 'text-[var(--text-secondary)]'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{t('pickup.scanTab')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDonorTab('manual')}
                  className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    donorTab === 'manual'
                      ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]'
                      : 'text-[var(--text-secondary)]'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{t('pickup.manualTab')}</span>
                </button>
              </div>

              {donorTab === 'scan' ? (
                <div className="space-y-3">
                  <p className="text-xs text-[var(--text-secondary)]">{t('pickup.scanHint')}</p>

                  {!cameraError ? (
                    <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden bg-black border border-[var(--border-subtle)]">
                      <video
                        ref={videoRef}
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                      />
                      <div className="pointer-events-none absolute inset-6 border-2 border-emerald-400/80 rounded-2xl" />
                      <div className="absolute bottom-2.5 inset-x-3 text-center text-[11px] font-semibold text-white bg-black/65 px-2.5 py-1 rounded-lg inline-flex items-center justify-center gap-1.5 mx-auto">
                        <Camera className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                        <span>{scanStatus || t('pickup.scanningActive')}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] leading-relaxed">
                      {cameraError}
                    </div>
                  )}

                  <canvas ref={canvasRef} className="hidden" />

                  <label className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[var(--text-primary)] text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer">
                    <Upload className="w-4 h-4 text-[var(--brand-text)] shrink-0" />
                    <span>{t('pickup.uploadQrBtn')}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleUploadQrImage}
                      className="sr-only"
                    />
                  </label>

                  {error && (
                    <p className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 px-3 py-2 rounded-lg">
                      {error}
                    </p>
                  )}
                </div>
              ) : (
                <form onSubmit={handleSubmitManual} className="space-y-4">
                  <div>
                    <label
                      htmlFor="pickup-code-input"
                      className="block text-sm font-semibold text-[var(--text-primary)] mb-1.5"
                    >
                      {t('pickup.enterCodeLabel')}
                    </label>
                    <input
                      id="pickup-code-input"
                      type="text"
                      maxLength={8}
                      required
                      value={enteredCode}
                      onChange={(e) => setEnteredCode(e.target.value.toUpperCase())}
                      placeholder={t('pickup.codePlaceholder')}
                      className="w-full min-h-[48px] px-4 py-3 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-center text-xl font-mono font-bold tracking-[0.2em] uppercase text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                    />
                  </div>

                  {error && (
                    <p className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 px-3 py-2 rounded-lg">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || enteredCode.trim().length < 4}
                    className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-50 text-[var(--brand-primary-fg)] font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {submitting ? t('pickup.confirming') : t('pickup.confirmHandover')}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
