import { useEffect, useState } from 'react';
import { Utensils } from 'lucide-react';

interface FoodImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  eager?: boolean;
}

export function FoodImage({ src, alt, className = '', eager = false }: FoodImageProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-[var(--brand-soft)] text-[var(--brand-text)] p-4 text-center ${className}`}
        role="img"
        aria-label={alt}
      >
        <Utensils className="w-7 h-7 opacity-70 mb-1.5" />
        <span className="text-xs font-medium text-[var(--text-secondary)] line-clamp-2 max-w-[160px]">
          {alt}
        </span>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {!loaded && (
        <div className="absolute inset-0 bg-[var(--bg-subtle)] animate-pulse flex items-center justify-center">
          <Utensils className="w-5 h-5 text-[var(--text-muted)] opacity-30" />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`w-full h-full object-cover dark:brightness-[0.92] transition-opacity duration-300 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
}
