import React, { useState } from 'react';
import { Download, Share2, PlusSquare, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useI18n } from '../i18n/I18nContext';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'header' | 'button' | 'badge';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  className = '',
  variant = 'header',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const { lang } = useI18n();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  const isBn = lang === 'bn';
  const installText = isBn ? 'অ্যাপ ইনস্টল করুন' : 'Install App';
  const iosText = isBn ? 'iPhone-এ ইনস্টল' : 'Install App';

  return (
    <>
      {/* Chromium / Android / Desktop flow */}
      {isInstallable && (
        <button
          type="button"
          onClick={install}
          title={installText}
          aria-label={installText}
          className={
            className ||
            (variant === 'header'
              ? 'min-h-[36px] sm:min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--brand-text)] inline-flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors'
              : 'min-h-[44px] px-4 py-2 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors')
          }
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">{installText}</span>
          <span className="sm:hidden">{isBn ? 'ইনস্টল' : 'Install'}</span>
        </button>
      )}

      {/* iOS Safari flow */}
      {!isInstallable && isIOS && (
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          title={iosText}
          aria-label={iosText}
          className={
            className ||
            'min-h-[36px] sm:min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--brand-text)] inline-flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors'
          }
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">{iosText}</span>
          <span className="sm:hidden">{isBn ? 'ইনস্টল' : 'Install'}</span>
        </button>
      )}

      {/* iOS Instruction Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-6 shadow-2xl relative text-[var(--text-primary)]">
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="absolute top-4 right-4 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] flex items-center justify-center font-bold shrink-0">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  {isBn ? 'iPhone / iPad-এ ইনস্টল করুন' : 'Install on iPhone / iPad'}
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  {isBn ? 'হোম স্ক্রিনে Rizik যোগ করার নিয়ম' : 'Add Rizik directly to your home screen'}
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-[var(--text-secondary)] bg-[var(--bg-subtle)] p-3.5 rounded-xl border border-[var(--border-subtle)]">
              <div className="flex items-start gap-2.5">
                <Share2 className="w-4 h-4 text-[var(--brand-text)] shrink-0 mt-0.5" />
                <span>
                  {isBn
                    ? '১. Safari ব্রাউজারের নিচের টুলবারে থাকা "Share" (শেয়ার) বোতামে চাপ দিন।'
                    : '1. Tap the "Share" button in Safari toolbar at the bottom.'}
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <PlusSquare className="w-4 h-4 text-[var(--brand-text)] shrink-0 mt-0.5" />
                <span>
                  {isBn
                    ? '২. মেনুটি নিচে স্ক্রোল করে "Add to Home Screen" (হোম স্ক্রিনে যোগ করুন) সিলেক্ট করুন।'
                    : '2. Scroll down and tap "Add to Home Screen".'}
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-4 h-4 rounded-full bg-[var(--brand-soft)] text-[var(--brand-text)] flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                  ✓
                </span>
                <span>
                  {isBn
                    ? '৩. উপরে ডানপাশে "Add" চাপলেই Rizik অ্যাপ হিসেবে প্রস্তুত!'
                    : '3. Tap "Add" in the top right corner to enjoy the app!'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="mt-5 w-full min-h-[42px] rounded-xl bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] text-xs font-semibold hover:bg-[var(--brand-primary-hover)] transition-colors cursor-pointer"
            >
              {isBn ? 'বুঝেছি' : 'Got it'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
