import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ExternalLink, MapPin, Navigation } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

export function StaticOsmMap({
  lat,
  lng,
  label,
  address,
  heightClass = 'h-36',
}: {
  lat: number;
  lng: number;
  label?: string | null;
  address?: string | null;
  heightClass?: string;
}) {
  const { t, formatNumber } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const loadedTilesRef = useRef(0);
  const failedTilesRef = useRef(0);

  const coordsValid = isValidCoordinate(lat, lng);
  const [mapUnavailable, setMapUnavailable] = useState(!coordsValid);

  const safeLat = coordsValid ? lat : 23.7465;
  const safeLng = coordsValid ? lng : 90.376;
  const googleMapsHref = `https://www.google.com/maps?q=${safeLat},${safeLng}`;

  useEffect(() => {
    if (!coordsValid) {
      setMapUnavailable(true);
      return;
    }
    const el = containerRef.current;
    if (!el) return;

    setMapUnavailable(false);
    loadedTilesRef.current = 0;
    failedTilesRef.current = 0;

    let map: L.Map | null = null;
    let resizeObserver: ResizeObserver | null = null;

    try {
      map = L.map(el, {
        center: [safeLat, safeLng],
        zoom: 15,
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: false,
      });

      const tileLayer = L.tileLayer('/api/tiles/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      });

      tileLayer.on('tileload', () => {
        loadedTilesRef.current += 1;
        setMapUnavailable(false);
      });

      tileLayer.on('tileerror', () => {
        failedTilesRef.current += 1;
        if (loadedTilesRef.current === 0 && failedTilesRef.current >= 4) {
          setMapUnavailable(true);
        }
      });

      tileLayer.addTo(map);

      const pinIcon = L.divIcon({
        className: 'ahar-map-pin',
        html: `<div style="width:30px;height:30px;border-radius:9999px;background:#dc2626;color:#ffffff;display:flex;align-items:center;justify-content:center;border:2.5px solid #ffffff;box-shadow:0 4px 12px rgba(0,0,0,0.35);"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 30],
        popupAnchor: [0, -28],
      });

      const marker = L.marker([safeLat, safeLng], { icon: pinIcon }).addTo(map);
      mapRef.current = map;
      markerRef.current = marker;

      const scheduleInvalidate = () => {
        if (!map) return;
        map.invalidateSize({ animate: false });
      };

      const rafId = window.requestAnimationFrame(scheduleInvalidate);
      const timer1 = window.setTimeout(scheduleInvalidate, 150);
      const timer2 = window.setTimeout(scheduleInvalidate, 400);

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          scheduleInvalidate();
        });
        resizeObserver.observe(el);
      }

      return () => {
        window.cancelAnimationFrame(rafId);
        window.clearTimeout(timer1);
        window.clearTimeout(timer2);
        resizeObserver?.disconnect();
        map?.remove();
        mapRef.current = null;
        markerRef.current = null;
      };
    } catch {
      setMapUnavailable(true);
      return;
    }
  }, [coordsValid]);

  useEffect(() => {
    if (!coordsValid) return;
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;

    map.setView([safeLat, safeLng], map.getZoom() || 15, { animate: false });
    marker.setLatLng([safeLat, safeLng]);

    const popupEl = document.createElement('div');
    popupEl.className = 'text-xs leading-snug space-y-0.5 max-w-[210px]';
    if (label) {
      const titleEl = document.createElement('p');
      titleEl.className = 'font-bold text-[var(--text-primary)]';
      titleEl.textContent = label;
      popupEl.appendChild(titleEl);
    }
    if (address && address !== label) {
      const addrEl = document.createElement('p');
      addrEl.className = 'text-[11px] text-[var(--text-secondary)]';
      addrEl.textContent = address;
      popupEl.appendChild(addrEl);
    }
    if (!label && !address) {
      const coordEl = document.createElement('p');
      coordEl.className = 'font-mono text-[11px]';
      coordEl.textContent = `${safeLat.toFixed(4)}, ${safeLng.toFixed(4)}`;
      popupEl.appendChild(coordEl);
    }
    marker.bindPopup(popupEl);

    window.requestAnimationFrame(() => {
      map.invalidateSize({ animate: false });
    });
  }, [coordsValid, safeLat, safeLng, label, address]);

  return (
    <div
      className={`relative w-full ${heightClass} min-w-0 rounded-xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-subtle)] select-none`}
    >
      {coordsValid && (
        <div
          ref={containerRef}
          className={`w-full h-full ${mapUnavailable ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
          aria-label={label || address || t('events.meetingPointTitle')}
        />
      )}

      {mapUnavailable && (
        <div className="absolute inset-0 p-4 flex flex-col items-center justify-center text-center gap-2.5 bg-[var(--bg-subtle)]">
          <div className="w-10 h-10 rounded-xl bg-[var(--brand-soft)] text-[var(--brand-text)] flex items-center justify-center shrink-0">
            <MapPin className="w-5 h-5" />
          </div>
          <div className="space-y-0.5 min-w-0 max-w-full">
            {(address || label) && (
              <p className="text-xs font-bold text-[var(--text-primary)] truncate max-w-[260px]">
                {address || label}
              </p>
            )}
            <p className="text-[11px] font-mono text-[var(--text-muted)] tabular-nums">
              {formatNumber(safeLat.toFixed(4))}, {formatNumber(safeLng.toFixed(4))}
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">{t('location.mapFallbackHint')}</p>
          </div>
          <a
            href={googleMapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)] text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Navigation className="w-3.5 h-3.5 shrink-0" />
            <span>{t('events.openGoogleMaps')}</span>
            <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
        </div>
      )}
    </div>
  );
}

interface LocationMessageCardProps {
  lat: number;
  lng: number;
  label?: string | null;
  expiresAt?: string | null;
  isMine: boolean;
}

export function LocationMessageCard({
  lat,
  lng,
  label,
  expiresAt,
  isMine,
}: LocationMessageCardProps) {
  const { t, formatTime } = useI18n();
  const isLive = Boolean(expiresAt && new Date(expiresAt).getTime() > Date.now());
  const googleMapsHref = `https://www.google.com/maps?q=${lat},${lng}`;
  const osmHref = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;

  return (
    <div className="w-full max-w-[240px] sm:w-64 space-y-2">
      <StaticOsmMap lat={lat} lng={lng} label={label} heightClass="h-32" />

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold leading-snug truncate">
            {label || `${lat.toFixed(5)}, ${lng.toFixed(5)}`}
          </p>
          {isLive && (
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold shrink-0 inline-flex items-center gap-1 ${
                isMine
                  ? 'bg-white/20 text-white'
                  : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              {t('location.liveBadge')}
            </span>
          )}
        </div>
        <p
          className={`text-[11px] font-mono tabular-nums ${
            isMine ? 'opacity-85' : 'text-[var(--text-muted)]'
          }`}
        >
          {lat.toFixed(5)}, {lng.toFixed(5)}
          {expiresAt ? ` · ${formatTime(expiresAt)}` : ''}
        </p>
      </div>

      <div className="flex items-center gap-1.5 pt-0.5">
        <a
          href={googleMapsHref}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex-1 min-h-[34px] px-2.5 py-1.5 rounded-xl text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${
            isMine
              ? 'bg-white/20 hover:bg-white/30 text-white'
              : 'bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-[var(--brand-primary-fg)]'
          }`}
        >
          <Navigation className="w-3.5 h-3.5 shrink-0" />
          <span>{t('location.openInMaps')}</span>
          <ExternalLink className="w-3 h-3 shrink-0 opacity-80" />
        </a>
        <a
          href={osmHref}
          target="_blank"
          rel="noopener noreferrer"
          title={t('location.openOsm')}
          className={`min-h-[34px] px-2.5 py-1.5 rounded-xl text-[11px] font-semibold inline-flex items-center justify-center transition-colors ${
            isMine
              ? 'bg-white/15 hover:bg-white/25 text-white'
              : 'border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-surface)] text-[var(--text-primary)]'
          }`}
        >
          OSM
        </a>
      </div>
    </div>
  );
}
