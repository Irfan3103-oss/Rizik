import { useEffect, useState } from 'react';

interface ShopAvatarProps {
  name: string;
  imageUrl?: string | null;
  online?: boolean;
  showStatusDot?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const PALETTES = [
  'bg-emerald-600 text-white',
  'bg-amber-600 text-white',
  'bg-sky-600 text-white',
  'bg-rose-600 text-white',
  'bg-violet-600 text-white',
  'bg-teal-600 text-white',
  'bg-orange-600 text-white',
  'bg-indigo-600 text-white',
];

function getInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'AF';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
}

function getColorClass(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return PALETTES[hash % PALETTES.length];
}

const SIZE_CLASSES: Record<NonNullable<ShopAvatarProps['size']>, string> = {
  xs: 'w-7 h-7 text-[10px]',
  sm: 'w-9 h-9 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-16 h-16 text-lg',
};

const DOT_SIZE_CLASSES: Record<NonNullable<ShopAvatarProps['size']>, string> = {
  xs: 'w-2 h-2 right-0 bottom-0',
  sm: 'w-2.5 h-2.5 right-0 bottom-0',
  md: 'w-3 h-3 right-0 bottom-0',
  lg: 'w-4 h-4 right-0.5 bottom-0.5',
};

export function ShopAvatar({
  name,
  imageUrl,
  online = false,
  showStatusDot = false,
  size = 'md',
  className = '',
}: ShopAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [imageUrl]);

  const showImg = Boolean(imageUrl) && !imgFailed;
  const initials = getInitials(name);
  const colorClass = getColorClass(name);

  return (
    <div className={`relative inline-flex shrink-0 ${SIZE_CLASSES[size]} ${className}`}>
      {showImg ? (
        <img
          src={imageUrl!}
          alt={name}
          loading="lazy"
          onError={() => setImgFailed(true)}
          referrerPolicy="no-referrer"
          className="w-full h-full rounded-full object-cover border border-[var(--border-subtle)] bg-[var(--bg-subtle)]"
        />
      ) : (
        <div
          aria-label={name}
          className={`w-full h-full rounded-full flex items-center justify-center font-display font-bold tracking-tight select-none border border-black/10 dark:border-white/10 ${colorClass}`}
        >
          {initials}
        </div>
      )}

      {showStatusDot && (
        <span
          aria-hidden="true"
          className={`absolute rounded-full ring-2 ring-[var(--bg-surface)] ${DOT_SIZE_CLASSES[size]} ${
            online ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-600'
          }`}
        />
      )}
    </div>
  );
}
