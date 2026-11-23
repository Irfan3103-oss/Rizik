import { useEffect, useState } from 'react';
import { AlertCircle, Clock, LocateFixed, MapPin, RefreshCw, Send, X } from 'lucide-react';
import { StaticOsmMap } from './LocationMessageCard';
import { useI18n } from '../i18n/I18nContext';

interface LocationShareModalProps {
  open: boolean;
  onClose: () => void;
  onSendLocation: (payload: {
    lat: number;
    lng: number;
    label: string;
    liveMinutes: 0 | 15 | 60;
  }) => Promise<void> | void;
}

type LocStep = 'permission' | 'loading' | 'preview' | 'error';

export function LocationShareModal({
  open,
  onClose,
  onSendLocation,
}: LocationShareModalProps) {
  const { t } = useI18n();
  const [step, setStep] = useState<LocStep>('permission');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [label, setLabel] = useState('');
  const [liveMinutes, setLiveMinutes] = useState<0 | 15 | 60>(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep('permission');
      setCoords(null);
      setLabel('');
      setLiveMinutes(0);
      setErrorMsg('');
      setSending(false);
    }
  }, [open]);

  if (!open) return null;

  const requestLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setErrorMsg(t('location.unsupported'));
      setStep('error');
      return;
    }

    setStep('loading');
    setErrorMsg('');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setCoords({ lat, lng });
        setLabel(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        setStep('preview');

        // Best-effort reverse lookup with OpenStreetMap Nominatim (never blocks preview)
        fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
          { headers: { Accept: 'application/json' } }
        )
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data?.display_name) {
              const parts = String(data.display_name).split(',').slice(0, 3).join(', ').trim();
              if (parts) setLabel(parts);
            }
          })
          .catch(() => {});
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setErrorMsg(t('location.denied'));
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setErrorMsg(t('location.unavailable'));
        } else if (err.code === err.TIMEOUT) {
          setErrorMsg(t('location.timeout'));
        } else {
          setErrorMsg(t('location.unavailable'));
        }
        setStep('error');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  const handleConfirmSend = async () => {
    if (!coords) return;
    setSending(true);
    try {
      await onSendLocation({
        lat: coords.lat,
        lng: coords.lng,
        label: label.trim() || `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`,
        liveMinutes,
      });
      onClose();
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('location.title')}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-[var(--bg-surface)] rounded-t-3xl sm:rounded-2xl border border-[var(--border-subtle)] shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[var(--brand-text)]" />
            <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
              {t('location.title')}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="min-h-[38px] min-w-[38px] rounded-xl hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {step === 'permission' && (
            <div className="space-y-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-[var(--brand-soft)] text-[var(--brand-text)] mx-auto flex items-center justify-center">
                <LocateFixed className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <h4 className="font-display text-base font-bold text-[var(--text-primary)]">
                  {t('location.permissionTitle')}
                </h4>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {t('location.permissionDesc')}
                </p>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 min-h-[44px] px-4 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={requestLocation}
                  className="flex-1 min-h-[44px] px-4 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LocateFixed className="w-4 h-4" />
                  {t('location.allowBtn')}
                </button>
              </div>
            </div>
          )}

          {step === 'loading' && (
            <div className="py-10 text-center space-y-3">
              <RefreshCw className="w-7 h-7 text-[var(--brand-text)] animate-spin mx-auto" />
              <p className="text-xs font-medium text-[var(--text-secondary)]">
                {t('location.locating')}
              </p>
            </div>
          )}

          {step === 'error' && (
            <div className="space-y-4 text-center py-2">
              <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-300 mx-auto flex items-center justify-center">
                <AlertCircle className="w-6 h-6" />
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed px-2">
                {errorMsg}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 min-h-[44px] px-4 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={requestLocation}
                  className="flex-1 min-h-[44px] px-4 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold cursor-pointer"
                >
                  {t('location.retry')}
                </button>
              </div>
            </div>
          )}

          {step === 'preview' && coords && (
            <div className="space-y-4">
              <StaticOsmMap lat={coords.lat} lng={coords.lng} label={label} heightClass="h-44" />

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-[var(--text-muted)]">
                  {t('location.coordinates')}:{' '}
                  <span className="font-mono text-[var(--text-primary)] tabular-nums">
                    {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                  </span>
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={t('location.labelPlaceholder')}
                  className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-xs focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                />
              </div>

              {/* Live location duration choices */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-[var(--text-muted)] inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {t('location.liveDurationLabel')}
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { mins: 0, labelKey: 'location.oneTime' },
                      { mins: 15, labelKey: 'location.live15m' },
                      { mins: 60, labelKey: 'location.live1h' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.mins}
                      type="button"
                      onClick={() => setLiveMinutes(opt.mins)}
                      className={`min-h-[36px] px-2 py-1 rounded-xl border text-[11px] font-semibold transition-colors cursor-pointer ${
                        liveMinutes === opt.mins
                          ? 'border-[var(--brand-primary)] bg-[var(--brand-soft)] text-[var(--brand-text)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                      }`}
                    >
                      {t(opt.labelKey)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 min-h-[44px] px-4 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  disabled={sending}
                  onClick={handleConfirmSend}
                  className="flex-1 min-h-[44px] px-4 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-50 text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  {t('location.sendBtn')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
