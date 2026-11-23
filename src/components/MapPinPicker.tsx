import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, MapPin, RefreshCw } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

interface MapPinPickerProps {
  lat: number;
  lng: number;
  onChange: (coords: { lat: number; lng: number }) => void;
  heightClass?: string;
}

export function MapPinPicker({
  lat,
  lng,
  onChange,
  heightClass = 'h-48',
}: MapPinPickerProps) {
  const { t, formatNumber } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const loadedTilesRef = useRef(0);
  const failedTilesRef = useRef(0);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const safeLat = Number.isFinite(lat) ? lat : 23.7465;
  const safeLng = Number.isFinite(lng) ? lng : 90.376;

  useEffect(() => {
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
        className: 'ahar-map-pin-draggable',
        html: `<div style="width:32px;height:32px;border-radius:9999px;background:#059669;color:#ffffff;display:flex;align-items:center;justify-content:center;border:2.5px solid #ffffff;box-shadow:0 4px 12px rgba(0,0,0,0.35);cursor:grab;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      });

      const marker = L.marker([safeLat, safeLng], {
        icon: pinIcon,
        draggable: true,
      }).addTo(map);

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        onChangeRef.current({
          lat: Number(pos.lat.toFixed(6)),
          lng: Number(pos.lng.toFixed(6)),
        });
      });

      map.on('click', (ev: L.LeafletMouseEvent) => {
        const nextLat = Number(ev.latlng.lat.toFixed(6));
        const nextLng = Number(ev.latlng.lng.toFixed(6));
        marker.setLatLng([nextLat, nextLng]);
        onChangeRef.current({ lat: nextLat, lng: nextLng });
      });

      mapRef.current = map;
      markerRef.current = marker;

      const scheduleInvalidate = () => {
        map?.invalidateSize({ animate: false });
      };

      const rafId = window.requestAnimationFrame(scheduleInvalidate);
      const t1 = window.setTimeout(scheduleInvalidate, 160);
      const t2 = window.setTimeout(scheduleInvalidate, 420);

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(scheduleInvalidate);
        resizeObserver.observe(el);
      }

      return () => {
        window.cancelAnimationFrame(rafId);
        window.clearTimeout(t1);
        window.clearTimeout(t2);
        resizeObserver?.disconnect();
        map?.remove();
        mapRef.current = null;
        markerRef.current = null;
      };
    } catch {
      setMapUnavailable(true);
      return;
    }
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    marker.setLatLng([safeLat, safeLng]);
    map.panTo([safeLat, safeLng], { animate: false });
  }, [safeLat, safeLng]);

  const handleLocateMe = () => {
    setGeoError(null);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError(t('location.unsupported'));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nextLat = Number(pos.coords.latitude.toFixed(6));
        const nextLng = Number(pos.coords.longitude.toFixed(6));
        onChange({ lat: nextLat, lng: nextLng });
        setLocating(false);
      },
      () => {
        setGeoError(t('location.denied'));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  return (
    <div className="space-y-2 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-[var(--text-muted)]">
          {t('restaurant.mapPinHint')}
        </span>
        <button
          type="button"
          disabled={locating}
          onClick={handleLocateMe}
          className="min-h-[34px] px-3 py-1 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-[11px] font-semibold text-[var(--brand-text)] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          {locating ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
          ) : (
            <LocateFixed className="w-3.5 h-3.5 shrink-0" />
          )}
          <span>{t('restaurant.useCurrentLocation')}</span>
        </button>
      </div>

      <div
        className={`relative w-full ${heightClass} min-w-0 rounded-xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-subtle)] select-none`}
      >
        <div
          ref={containerRef}
          className={`w-full h-full ${mapUnavailable ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
          aria-label={t('restaurant.mapPinLabel')}
        />

        {mapUnavailable && (
          <div className="absolute inset-0 p-4 flex flex-col items-center justify-center text-center gap-2 bg-[var(--bg-subtle)]">
            <MapPin className="w-6 h-6 text-[var(--brand-text)]" />
            <p className="text-xs font-semibold text-[var(--text-primary)]">
              {t('restaurant.mapFallbackTitle')}
            </p>
            <div className="flex items-center gap-2 max-w-full">
              <label className="text-[11px] text-[var(--text-muted)]">
                Lat
                <input
                  type="number"
                  step="0.0001"
                  value={safeLat}
                  onChange={(e) =>
                    onChange({
                      lat: Number(e.target.value) || 23.7465,
                      lng: safeLng,
                    })
                  }
                  className="ml-1 w-24 px-2 py-1 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-xs font-mono"
                />
              </label>
              <label className="text-[11px] text-[var(--text-muted)]">
                Lng
                <input
                  type="number"
                  step="0.0001"
                  value={safeLng}
                  onChange={(e) =>
                    onChange({
                      lat: safeLat,
                      lng: Number(e.target.value) || 90.376,
                    })
                  }
                  className="ml-1 w-24 px-2 py-1 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-xs font-mono"
                />
              </label>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
        <span className="font-mono tabular-nums">
          {t('restaurant.pinnedCoords')}: {formatNumber(safeLat.toFixed(5))},{' '}
          {formatNumber(safeLng.toFixed(5))}
        </span>
        {geoError && <span className="text-red-600 dark:text-red-400">{geoError}</span>}
      </div>
    </div>
  );
}
