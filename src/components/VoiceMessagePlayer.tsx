import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

interface VoiceMessagePlayerProps {
  src: string;
  durationSec?: number | null;
  seedKey: string;
  isMine: boolean;
}

function buildWaveformBars(seedKey: string, count = 24): number[] {
  let hash = 0;
  for (let i = 0; i < seedKey.length; i++) {
    hash = (hash * 31 + seedKey.charCodeAt(i)) >>> 0;
  }
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    hash = (hash * 1664525 + 1013904223) >>> 0;
    const norm = (hash % 100) / 100;
    // Envelope higher near middle for natural speech shape
    const centerBias = 1 - Math.abs(i / (count - 1) - 0.5) * 0.45;
    bars.push(Math.max(22, Math.min(100, Math.round((28 + norm * 72) * centerBias))));
  }
  return bars;
}

export function VoiceMessagePlayer({
  src,
  durationSec,
  seedKey,
  isMine,
}: VoiceMessagePlayerProps) {
  const { t, formatNumber } = useI18n();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [resolvedDuration, setResolvedDuration] = useState<number>(durationSec ?? 0);

  const bars = useMemo(() => buildWaveformBars(seedKey), [seedKey]);

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;

    const onLoaded = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setResolvedDuration(audio.duration);
      }
    };
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };
    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audioRef.current = null;
    };
  }, [src]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio
        .play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    }
  };

  const totalSec = resolvedDuration > 0 ? resolvedDuration : durationSec ?? 0;
  const progress = totalSec > 0 ? Math.min(1, currentTime / totalSec) : 0;

  const formatMmSs = (secRaw: number) => {
    const s = Math.max(0, Math.round(secRaw));
    const m = Math.floor(s / 60);
    const rem = String(s % 60).padStart(2, '0');
    return `${formatNumber(m)}:${formatNumber(rem)}`;
  };

  const handleSeek = (barIdx: number) => {
    const audio = audioRef.current;
    if (!audio || totalSec <= 0) return;
    const ratio = (barIdx + 0.5) / bars.length;
    audio.currentTime = ratio * totalSec;
    setCurrentTime(audio.currentTime);
  };

  return (
    <div className="flex items-center gap-2.5 w-full min-w-[160px] max-w-[235px] sm:min-w-[235px] py-0.5">
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? t('chat.pauseVoice') : t('chat.playVoice')}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer ${
          isMine
            ? 'bg-white/20 hover:bg-white/30 text-current'
            : 'bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)]'
        }`}
      >
        {playing ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current ml-0.5" />
        )}
      </button>

      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <div
          className="h-7 flex items-center gap-[2.5px]"
          role="slider"
          aria-label={t('chat.voiceMessageLabel')}
          aria-valuemin={0}
          aria-valuemax={Math.round(totalSec)}
          aria-valuenow={Math.round(currentTime)}
        >
          {bars.map((heightPct, idx) => {
            const active = (idx + 1) / bars.length <= progress;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleSeek(idx)}
                className="flex-1 h-full flex items-center justify-center cursor-pointer"
                tabIndex={-1}
                aria-hidden="true"
              >
                <span
                  className={`w-[3px] rounded-full transition-colors ${
                    isMine
                      ? active
                        ? 'bg-current opacity-100'
                        : 'bg-current opacity-40'
                      : active
                        ? 'bg-[var(--brand-primary)]'
                        : 'bg-[var(--text-muted)]/40'
                  }`}
                  style={{ height: `${heightPct}%` }}
                />
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between text-[10px] tabular-nums opacity-85 leading-none">
          <span>{playing ? formatMmSs(currentTime) : formatMmSs(totalSec)}</span>
          <span>{t('chat.voiceMessageLabel')}</span>
        </div>
      </div>
    </div>
  );
}
