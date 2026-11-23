import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

interface PhotoLightboxProps {
  src: string | null;
  caption?: string | null;
  onClose: () => void;
}

export function PhotoLightbox({ src, caption, onClose }: PhotoLightboxProps) {
  const { t } = useI18n();

  useEffect(() => {
    if (!src) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [src, onClose]);

  if (!src) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('chat.photoPreviewTitle')}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/88 backdrop-blur-sm flex flex-col items-center justify-center p-4"
    >
      <div className="w-full max-w-4xl flex items-center justify-end mb-3">
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="min-h-[44px] min-w-[44px] rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-4xl max-h-[82vh] flex flex-col items-center gap-3"
      >
        <img
          src={src}
          alt={caption || t('chat.sharedAttachmentAlt')}
          referrerPolicy="no-referrer"
          className="max-h-[75vh] max-w-full rounded-2xl object-contain shadow-2xl"
        />
        {caption && (
          <p className="text-sm text-white/90 text-center max-w-xl px-4">{caption}</p>
        )}
      </div>
    </div>
  );
}
