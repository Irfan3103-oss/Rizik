import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  BG_PRESETS,
  PALETTE_PRESETS,
  normalizeHex,
  resolveAppBackground,
  resolvePaletteTokens,
  type BgPreset,
  type BgPresetId,
  type PaletteId,
  type PalettePreset,
} from './palettes';

const THEME_STORAGE_KEY = 'rizik_theme';
const PALETTE_STORAGE_KEY = 'rizik_palette';
const CUSTOM_COLOR_STORAGE_KEY = 'rizik_custom_color';
const BG_STORAGE_KEY = 'rizik_bg_id';
const CUSTOM_BG_STORAGE_KEY = 'rizik_bg_custom';
const RAMADAN_MODE_KEY = 'rizik_ramadan_mode';

const LEGACY_THEME_STORAGE_KEY_1 = 'aharforall_theme';
const LEGACY_PALETTE_STORAGE_KEY_1 = 'aharforall_palette';
const LEGACY_CUSTOM_COLOR_STORAGE_KEY_1 = 'aharforall_custom_color';
const LEGACY_BG_STORAGE_KEY_1 = 'aharforall_bg_id';
const LEGACY_CUSTOM_BG_STORAGE_KEY_1 = 'aharforall_bg_custom';
const LEGACY_RAMADAN_MODE_KEY_1 = 'aharforall_ramadan_mode';

const LEGACY_THEME_STORAGE_KEY_2 = 'nourishloop_theme';
const LEGACY_PALETTE_STORAGE_KEY_2 = 'nourishloop_palette';
const LEGACY_CUSTOM_COLOR_STORAGE_KEY_2 = 'nourishloop_custom_color';
const LEGACY_BG_STORAGE_KEY_2 = 'nourishloop_bg_id';
const LEGACY_CUSTOM_BG_STORAGE_KEY_2 = 'nourishloop_bg_custom';

const DEFAULT_PALETTE: PaletteId = 'fresh-green';
const DEFAULT_CUSTOM_HEX = '#15803d';
const DEFAULT_BG: BgPresetId = 'palette-default';
const DEFAULT_CUSTOM_BG_HEX = '#f7f9f7';

const VALID_PALETTES = new Set<PaletteId>([
  'fresh-green',
  'ocean-blue',
  'sunset-orange',
  'royal-purple',
  'rose-pink',
  'teal-mint',
  'midnight',
  'warm-sand',
  'custom',
]);

const VALID_BGS = new Set<BgPresetId>([
  'palette-default',
  'crisp-white',
  'warm-linen',
  'sage-mist',
  'sky-breeze',
  'lavender-cloud',
  'meadow-glow',
  'sunrise-peach',
  'ocean-horizon',
  'rose-quartz',
  'mint-breeze',
  'aurora-silk',
  'custom',
]);

function getInitialDarkMode(): boolean {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
    return true;
  }
  try {
    const saved =
      localStorage.getItem(THEME_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_THEME_STORAGE_KEY_1) ||
      localStorage.getItem(LEGACY_THEME_STORAGE_KEY_2);
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  } catch {
    return false;
  }
}

function getInitialPalette(): PaletteId {
  try {
    const saved = (localStorage.getItem(PALETTE_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_PALETTE_STORAGE_KEY_1) ||
      localStorage.getItem(LEGACY_PALETTE_STORAGE_KEY_2)) as PaletteId | null;
    if (saved && VALID_PALETTES.has(saved)) return saved;
  } catch {
    // Ignore storage errors
  }
  return DEFAULT_PALETTE;
}

function getInitialCustomHex(): string {
  try {
    const saved =
      localStorage.getItem(CUSTOM_COLOR_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_CUSTOM_COLOR_STORAGE_KEY_1) ||
      localStorage.getItem(LEGACY_CUSTOM_COLOR_STORAGE_KEY_2);
    if (saved) return normalizeHex(saved);
  } catch {
    // Ignore
  }
  return DEFAULT_CUSTOM_HEX;
}

function getInitialBgId(): BgPresetId {
  try {
    const saved = (localStorage.getItem(BG_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_BG_STORAGE_KEY_1) ||
      localStorage.getItem(LEGACY_BG_STORAGE_KEY_2)) as BgPresetId | null;
    if (saved && VALID_BGS.has(saved)) return saved;
  } catch {
    // Ignore
  }
  return DEFAULT_BG;
}

function getInitialCustomBgHex(): string {
  try {
    const saved =
      localStorage.getItem(CUSTOM_BG_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_CUSTOM_BG_STORAGE_KEY_1) ||
      localStorage.getItem(LEGACY_CUSTOM_BG_STORAGE_KEY_2);
    if (saved) return normalizeHex(saved);
  } catch {
    // Ignore
  }
  return DEFAULT_CUSTOM_BG_HEX;
}

function getInitialRamadanMode(): boolean {
  try {
    return (localStorage.getItem(RAMADAN_MODE_KEY) || localStorage.getItem(LEGACY_RAMADAN_MODE_KEY_1)) === '1';
  } catch {
    return false;
  }
}

interface ThemeContextValue {
  darkMode: boolean;
  setDarkMode: (next: boolean) => void;
  toggleDark: () => void;
  ramadanMode: boolean;
  setRamadanMode: (next: boolean) => void;
  toggleRamadanMode: () => void;
  paletteId: PaletteId;
  setPaletteId: (next: PaletteId) => void;
  customHex: string;
  setCustomHex: (nextHex: string) => void;
  bgId: BgPresetId;
  setBgId: (next: BgPresetId) => void;
  customBgHex: string;
  setCustomBgHex: (nextHex: string) => void;
  resetBackground: () => void;
  resetTheme: () => void;
  palettes: PalettePreset[];
  bgPresets: BgPreset[];
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [darkMode, setDarkMode] = useState<boolean>(getInitialDarkMode);
  const [ramadanMode, setRamadanMode] = useState<boolean>(getInitialRamadanMode);
  const [paletteId, setPaletteId] = useState<PaletteId>(getInitialPalette);
  const [customHex, setCustomHexState] = useState<string>(getInitialCustomHex);
  const [bgId, setBgId] = useState<BgPresetId>(getInitialBgId);
  const [customBgHex, setCustomBgHexState] = useState<string>(getInitialCustomBgHex);

  const setCustomHex = useCallback((nextHex: string) => {
    setCustomHexState(normalizeHex(nextHex));
    setPaletteId('custom');
  }, []);

  const setCustomBgHex = useCallback((nextHex: string) => {
    setCustomBgHexState(normalizeHex(nextHex));
    setBgId('custom');
  }, []);

  const toggleDark = useCallback(() => {
    setDarkMode((prev) => !prev);
  }, []);

  const toggleRamadanMode = useCallback(() => {
    setRamadanMode((prev) => !prev);
  }, []);

  const resetBackground = useCallback(() => {
    setBgId(DEFAULT_BG);
    setCustomBgHexState(DEFAULT_CUSTOM_BG_HEX);
  }, []);

  const resetTheme = useCallback(() => {
    setPaletteId(DEFAULT_PALETTE);
    setCustomHexState(DEFAULT_CUSTOM_HEX);
    setBgId(DEFAULT_BG);
    setCustomBgHexState(DEFAULT_CUSTOM_BG_HEX);
    const prefersDark =
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
    setDarkMode(prefersDark);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', darkMode);
    root.style.colorScheme = darkMode ? 'dark' : 'light';

    const tokens = resolvePaletteTokens(paletteId, customHex, darkMode);
    const bgResolved = resolveAppBackground(bgId, customBgHex, tokens, darkMode);

    root.style.setProperty('--brand-primary', tokens.primary);
    root.style.setProperty('--brand-primary-hover', tokens.primaryHover);
    root.style.setProperty('--brand-primary-fg', tokens.primaryFg);
    root.style.setProperty('--brand-soft', tokens.soft);
    root.style.setProperty('--brand-text', tokens.textOnSurface);

    root.style.setProperty('--brand-accent', tokens.accent);
    root.style.setProperty('--brand-accent-hover', tokens.accentHover);
    root.style.setProperty('--brand-accent-fg', tokens.accentFg);
    root.style.setProperty('--brand-accent-soft', tokens.accentSoft);
    root.style.setProperty('--brand-accent-text', tokens.accentTextOnSurface);

    // Keep legacy aliases synced automatically
    root.style.setProperty('--brand-green', tokens.primary);
    root.style.setProperty('--brand-green-hover', tokens.primaryHover);
    root.style.setProperty('--brand-orange', tokens.accent);

    root.style.setProperty('--app-background', bgResolved.backgroundCss);
    root.style.setProperty('--canvas-text-primary', bgResolved.canvasTextPrimary);
    root.style.setProperty('--canvas-text-secondary', bgResolved.canvasTextSecondary);
    root.style.setProperty('--canvas-text-muted', bgResolved.canvasTextMuted);
    root.style.setProperty('--canvas-brand-text', bgResolved.canvasBrandText);

    root.style.setProperty('--bg-canvas', tokens.bgCanvas);
    root.style.setProperty('--bg-surface', tokens.bgSurface);
    root.style.setProperty('--bg-subtle', tokens.bgSubtle);
    root.style.setProperty('--bg-chat-feed', tokens.bgChatFeed);
    root.style.setProperty('--bg-header', tokens.bgHeader);
    root.style.setProperty('--border-subtle', tokens.borderSubtle);
    root.style.setProperty('--border-strong', tokens.borderStrong);
    root.style.setProperty('--text-primary', tokens.textPrimary);
    root.style.setProperty('--text-secondary', tokens.textSecondary);
    root.style.setProperty('--text-muted', tokens.textMuted);

    try {
      localStorage.setItem(THEME_STORAGE_KEY, darkMode ? 'dark' : 'light');
      localStorage.setItem(RAMADAN_MODE_KEY, ramadanMode ? '1' : '0');
      localStorage.setItem(PALETTE_STORAGE_KEY, paletteId);
      localStorage.setItem(CUSTOM_COLOR_STORAGE_KEY, customHex);
      localStorage.setItem(BG_STORAGE_KEY, bgId);
      localStorage.setItem(CUSTOM_BG_STORAGE_KEY, customBgHex);
    } catch {
      // Ignore storage errors
    }
  }, [darkMode, ramadanMode, paletteId, customHex, bgId, customBgHex]);

  return (
    <ThemeContext.Provider
      value={{
        darkMode,
        setDarkMode,
        toggleDark,
        ramadanMode,
        setRamadanMode,
        toggleRamadanMode,
        paletteId,
        setPaletteId,
        customHex,
        setCustomHex,
        bgId,
        setBgId,
        customBgHex,
        setCustomBgHex,
        resetBackground,
        resetTheme,
        palettes: PALETTE_PRESETS,
        bgPresets: BG_PRESETS,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
