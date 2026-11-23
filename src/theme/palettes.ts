export type PaletteId =
  | 'fresh-green'
  | 'ocean-blue'
  | 'sunset-orange'
  | 'royal-purple'
  | 'rose-pink'
  | 'teal-mint'
  | 'midnight'
  | 'warm-sand'
  | 'custom';

export interface PaletteTokens {
  primary: string;
  primaryHover: string;
  primaryFg: string;
  soft: string;
  textOnSurface: string;
  accent: string;
  accentHover: string;
  accentFg: string;
  accentSoft: string;
  accentTextOnSurface: string;
  bgCanvas: string;
  bgSurface: string;
  bgSubtle: string;
  bgChatFeed: string;
  bgHeader: string;
  borderSubtle: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
}

export interface PalettePreset {
  id: Exclude<PaletteId, 'custom'>;
  swatch: string;
  accentSwatch: string;
  light: PaletteTokens;
  dark: PaletteTokens;
}

// --- WCAG Contrast & Color Derivation Utilities ---

export function normalizeHex(hex: string): string {
  const clean = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    return (
      '#' +
      clean
        .split('')
        .map((c) => c + c)
        .join('')
        .toLowerCase()
    );
  }
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return '#' + clean.toLowerCase();
  }
  return '#15803d';
}

function hexToRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex).slice(1);
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('')
  );
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  const hNorm = ((h % 360) + 360) % 360;
  const sNorm = Math.max(0, Math.min(100, s)) / 100;
  const lNorm = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((hNorm / 60) % 2) - 1));
  const m = lNorm - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (hNorm < 60) [r, g, b] = [c, x, 0];
  else if (hNorm < 120) [r, g, b] = [x, c, 0];
  else if (hNorm < 180) [r, g, b] = [0, c, x];
  else if (hNorm < 240) [r, g, b] = [0, x, c];
  else if (hNorm < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const srgb = v / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

export function pickForeground(bgHex: string): string {
  const whiteContrast = contrastRatio(bgHex, '#ffffff');
  const darkContrast = contrastRatio(bgHex, '#0f172a');
  return whiteContrast >= darkContrast ? '#ffffff' : '#0f172a';
}

function ensureTextContrastOnBg(fgHex: string, bgHex: string, isDarkBg: boolean): string {
  const [h, s] = rgbToHsl(...hexToRgb(fgHex));
  let [, , l] = rgbToHsl(...hexToRgb(fgHex));
  let candidate = fgHex;
  for (let step = 0; step < 30; step++) {
    if (contrastRatio(candidate, bgHex) >= 4.7) return candidate;
    l = isDarkBg ? Math.min(88, l + 3) : Math.max(18, l - 3);
    candidate = hslToHex(h, Math.min(s, isDarkBg ? 75 : 85), l);
  }
  return isDarkBg ? '#e2e8f0' : '#0f172a';
}

export function buildCustomTokens(customHex: string, darkMode: boolean): PaletteTokens {
  const norm = normalizeHex(customHex);
  const [h, s, l] = rgbToHsl(...hexToRgb(norm));
  const safeSat = Math.max(25, Math.min(82, s));
  const accentHue = (h + 34) % 360;

  if (!darkMode) {
    // Keep primary dark enough for crisp white text when possible, or auto-pick fg
    const primary = hslToHex(h, safeSat, Math.min(46, Math.max(26, l)));
    const primaryHover = hslToHex(h, safeSat, Math.max(20, Math.min(38, l - 6)));
    const bgCanvas = hslToHex(h, Math.min(18, safeSat * 0.25), 97.5);
    const bgSurface = '#ffffff';
    const bgSubtle = hslToHex(h, Math.min(16, safeSat * 0.22), 95.5);
    const bgChatFeed = hslToHex(h, Math.min(14, safeSat * 0.2), 96.5);
    const soft = hslToHex(h, Math.min(55, safeSat * 0.7), 94);
    const textOnSurface = ensureTextContrastOnBg(primary, bgSurface, false);

    const accent = hslToHex(accentHue, 74, 42);
    const accentHover = hslToHex(accentHue, 74, 35);
    const accentSoft = hslToHex(accentHue, 65, 94);
    const accentTextOnSurface = ensureTextContrastOnBg(accent, bgSurface, false);

    return {
      primary,
      primaryHover,
      primaryFg: pickForeground(primary),
      soft,
      textOnSurface,
      accent,
      accentHover,
      accentFg: pickForeground(accent),
      accentSoft,
      accentTextOnSurface,
      bgCanvas,
      bgSurface,
      bgSubtle,
      bgChatFeed,
      bgHeader: 'rgba(255, 255, 255, 0.92)',
      borderSubtle: hslToHex(h, 12, 89),
      borderStrong: hslToHex(h, 14, 80),
      textPrimary: '#0f172a',
      textSecondary: '#475569',
      textMuted: '#64748b',
    };
  }

  // Dark mode derivation with deep charcoal tinted subtly by hue (< 10% sat)
  const primary = hslToHex(h, Math.min(68, safeSat), 36);
  const primaryHover = hslToHex(h, Math.min(68, safeSat), 30);
  const bgCanvas = hslToHex(h, 8, 7.5);
  const bgSurface = hslToHex(h, 8, 12);
  const bgSubtle = hslToHex(h, 8, 16);
  const bgChatFeed = hslToHex(h, 7, 9);
  const soft = hslToHex(h, Math.min(45, safeSat * 0.6), 18);
  const textOnSurface = ensureTextContrastOnBg(hslToHex(h, Math.min(72, safeSat), 68), bgSurface, true);

  const accent = hslToHex(accentHue, 70, 44);
  const accentHover = hslToHex(accentHue, 70, 38);
  const accentSoft = hslToHex(accentHue, 40, 18);
  const accentTextOnSurface = ensureTextContrastOnBg(hslToHex(accentHue, 78, 68), bgSurface, true);

  return {
    primary,
    primaryHover,
    primaryFg: pickForeground(primary),
    soft,
    textOnSurface,
    accent,
    accentHover,
    accentFg: pickForeground(accent),
    accentSoft,
    accentTextOnSurface,
    bgCanvas,
    bgSurface,
    bgSubtle,
    bgChatFeed,
    bgHeader: `rgba(${hexToRgb(bgSurface).join(', ')}, 0.92)`,
    borderSubtle: hslToHex(h, 8, 20),
    borderStrong: hslToHex(h, 9, 27),
    textPrimary: '#f3f4f6',
    textSecondary: '#d4d4d8',
    textMuted: '#a1a1aa',
  };
}

export const PALETTE_PRESETS: PalettePreset[] = [
  {
    id: 'fresh-green',
    swatch: '#15803d',
    accentSwatch: '#ea580c',
    light: {
      primary: '#15803d',
      primaryHover: '#166534',
      primaryFg: '#ffffff',
      soft: '#ecfdf5',
      textOnSurface: '#15803d',
      accent: '#c2410c',
      accentHover: '#9a3412',
      accentFg: '#ffffff',
      accentSoft: '#fff7ed',
      accentTextOnSurface: '#c2410c',
      bgCanvas: '#f7f9f7',
      bgSurface: '#ffffff',
      bgSubtle: '#f3f6f4',
      bgChatFeed: '#f6f8f6',
      bgHeader: 'rgba(255, 255, 255, 0.92)',
      borderSubtle: '#e2e8f0',
      borderStrong: '#cbd5e1',
      textPrimary: '#0f172a',
      textSecondary: '#475569',
      textMuted: '#64748b',
    },
    dark: {
      primary: '#1b7a43',
      primaryHover: '#166534',
      primaryFg: '#ffffff',
      soft: '#14291e',
      textOnSurface: '#4ade80',
      accent: '#c24d12',
      accentHover: '#9a3412',
      accentFg: '#ffffff',
      accentSoft: '#2b1b12',
      accentTextOnSurface: '#fb923c',
      bgCanvas: '#121412',
      bgSurface: '#1c1f1d',
      bgSubtle: '#252926',
      bgChatFeed: '#151816',
      bgHeader: 'rgba(28, 31, 29, 0.92)',
      borderSubtle: '#2d322e',
      borderStrong: '#3d443f',
      textPrimary: '#f3f4f6',
      textSecondary: '#d4d4d8',
      textMuted: '#a1a1aa',
    },
  },
  {
    id: 'ocean-blue',
    swatch: '#1d4ed8',
    accentSwatch: '#0284c7',
    light: {
      primary: '#1d4ed8',
      primaryHover: '#1e40af',
      primaryFg: '#ffffff',
      soft: '#eff6ff',
      textOnSurface: '#1d4ed8',
      accent: '#0369a1',
      accentHover: '#075985',
      accentFg: '#ffffff',
      accentSoft: '#f0f9ff',
      accentTextOnSurface: '#0369a1',
      bgCanvas: '#f5f8fc',
      bgSurface: '#ffffff',
      bgSubtle: '#f0f4fa',
      bgChatFeed: '#f4f7fb',
      bgHeader: 'rgba(255, 255, 255, 0.92)',
      borderSubtle: '#dde5f0',
      borderStrong: '#c5d2e3',
      textPrimary: '#0f172a',
      textSecondary: '#475569',
      textMuted: '#64748b',
    },
    dark: {
      primary: '#2563eb',
      primaryHover: '#1d4ed8',
      primaryFg: '#ffffff',
      soft: '#162238',
      textOnSurface: '#60a5fa',
      accent: '#0284c7',
      accentHover: '#0369a1',
      accentFg: '#ffffff',
      accentSoft: '#122634',
      accentTextOnSurface: '#38bdf8',
      bgCanvas: '#111419',
      bgSurface: '#1a1f27',
      bgSubtle: '#232934',
      bgChatFeed: '#141820',
      bgHeader: 'rgba(26, 31, 39, 0.92)',
      borderSubtle: '#2c3340',
      borderStrong: '#3c4657',
      textPrimary: '#f3f4f6',
      textSecondary: '#d4d4d8',
      textMuted: '#a1a1aa',
    },
  },
  {
    id: 'sunset-orange',
    swatch: '#c2410c',
    accentSwatch: '#b45309',
    light: {
      primary: '#c2410c',
      primaryHover: '#9a3412',
      primaryFg: '#ffffff',
      soft: '#fff7ed',
      textOnSurface: '#c2410c',
      accent: '#b45309',
      accentHover: '#92400e',
      accentFg: '#ffffff',
      accentSoft: '#fefce8',
      accentTextOnSurface: '#b45309',
      bgCanvas: '#fbf8f5',
      bgSurface: '#ffffff',
      bgSubtle: '#f7f2ec',
      bgChatFeed: '#faf6f2',
      bgHeader: 'rgba(255, 255, 255, 0.92)',
      borderSubtle: '#ede3d8',
      borderStrong: '#ddd0c1',
      textPrimary: '#1c1917',
      textSecondary: '#57534e',
      textMuted: '#78716c',
    },
    dark: {
      primary: '#c2410c',
      primaryHover: '#9a3412',
      primaryFg: '#ffffff',
      soft: '#2d1a12',
      textOnSurface: '#fb923c',
      accent: '#b45309',
      accentHover: '#92400e',
      accentFg: '#ffffff',
      accentSoft: '#292011',
      accentTextOnSurface: '#fbbf24',
      bgCanvas: '#161311',
      bgSurface: '#201b18',
      bgSubtle: '#2a2320',
      bgChatFeed: '#191513',
      bgHeader: 'rgba(32, 27, 24, 0.92)',
      borderSubtle: '#352c28',
      borderStrong: '#473b35',
      textPrimary: '#f5f5f4',
      textSecondary: '#d6d3d1',
      textMuted: '#a8a29e',
    },
  },
  {
    id: 'royal-purple',
    swatch: '#6d28d9',
    accentSwatch: '#be185d',
    light: {
      primary: '#6d28d9',
      primaryHover: '#5b21b6',
      primaryFg: '#ffffff',
      soft: '#f5f3ff',
      textOnSurface: '#6d28d9',
      accent: '#be185d',
      accentHover: '#9d174d',
      accentFg: '#ffffff',
      accentSoft: '#fdf2f8',
      accentTextOnSurface: '#be185d',
      bgCanvas: '#f8f6fc',
      bgSurface: '#ffffff',
      bgSubtle: '#f3f0fa',
      bgChatFeed: '#f6f4fb',
      bgHeader: 'rgba(255, 255, 255, 0.92)',
      borderSubtle: '#e5e0f0',
      borderStrong: '#cfc6e3',
      textPrimary: '#171525',
      textSecondary: '#4b4661',
      textMuted: '#6b6682',
    },
    dark: {
      primary: '#7c3aed',
      primaryHover: '#6d28d9',
      primaryFg: '#ffffff',
      soft: '#221738',
      textOnSurface: '#c084fc',
      accent: '#db2777',
      accentHover: '#be185d',
      accentFg: '#ffffff',
      accentSoft: '#301524',
      accentTextOnSurface: '#f472b6',
      bgCanvas: '#131118',
      bgSurface: '#1d1a24',
      bgSubtle: '#262230',
      bgChatFeed: '#17141d',
      bgHeader: 'rgba(29, 26, 36, 0.92)',
      borderSubtle: '#312b3d',
      borderStrong: '#433b54',
      textPrimary: '#f3f4f6',
      textSecondary: '#d4d4d8',
      textMuted: '#a1a1aa',
    },
  },
  {
    id: 'rose-pink',
    swatch: '#be123c',
    accentSwatch: '#c2410c',
    light: {
      primary: '#be123c',
      primaryHover: '#9f1239',
      primaryFg: '#ffffff',
      soft: '#fff1f2',
      textOnSurface: '#be123c',
      accent: '#c2410c',
      accentHover: '#9a3412',
      accentFg: '#ffffff',
      accentSoft: '#fff7ed',
      accentTextOnSurface: '#c2410c',
      bgCanvas: '#fcf6f8',
      bgSurface: '#ffffff',
      bgSubtle: '#f9eff2',
      bgChatFeed: '#faf3f5',
      bgHeader: 'rgba(255, 255, 255, 0.92)',
      borderSubtle: '#f0dce2',
      borderStrong: '#dec2cb',
      textPrimary: '#1f1216',
      textSecondary: '#594249',
      textMuted: '#785e66',
    },
    dark: {
      primary: '#be123c',
      primaryHover: '#9f1239',
      primaryFg: '#ffffff',
      soft: '#2e141c',
      textOnSurface: '#fb7185',
      accent: '#c2410c',
      accentHover: '#9a3412',
      accentFg: '#ffffff',
      accentSoft: '#2b1a13',
      accentTextOnSurface: '#fb923c',
      bgCanvas: '#171113',
      bgSurface: '#21191c',
      bgSubtle: '#2b2125',
      bgChatFeed: '#1a1316',
      bgHeader: 'rgba(33, 25, 28, 0.92)',
      borderSubtle: '#382a2f',
      borderStrong: '#4a383f',
      textPrimary: '#f5f3f4',
      textSecondary: '#d6cfd1',
      textMuted: '#a89ca0',
    },
  },
  {
    id: 'teal-mint',
    swatch: '#0f766e',
    accentSwatch: '#0369a1',
    light: {
      primary: '#0f766e',
      primaryHover: '#115e59',
      primaryFg: '#ffffff',
      soft: '#f0fdfa',
      textOnSurface: '#0f766e',
      accent: '#0369a1',
      accentHover: '#075985',
      accentFg: '#ffffff',
      accentSoft: '#f0f9ff',
      accentTextOnSurface: '#0369a1',
      bgCanvas: '#f4faf9',
      bgSurface: '#ffffff',
      bgSubtle: '#edf6f5',
      bgChatFeed: '#f2f8f7',
      bgHeader: 'rgba(255, 255, 255, 0.92)',
      borderSubtle: '#d8eae7',
      borderStrong: '#bcd8d3',
      textPrimary: '#0f1f1d',
      textSecondary: '#415956',
      textMuted: '#5f7774',
    },
    dark: {
      primary: '#0f766e',
      primaryHover: '#115e59',
      primaryFg: '#ffffff',
      soft: '#122927',
      textOnSurface: '#2dd4bf',
      accent: '#0284c7',
      accentHover: '#0369a1',
      accentFg: '#ffffff',
      accentSoft: '#132433',
      accentTextOnSurface: '#38bdf8',
      bgCanvas: '#101615',
      bgSurface: '#182120',
      bgSubtle: '#212c2a',
      bgChatFeed: '#131b1a',
      bgHeader: 'rgba(24, 33, 32, 0.92)',
      borderSubtle: '#293836',
      borderStrong: '#384c49',
      textPrimary: '#f1f5f4',
      textSecondary: '#cedad8',
      textMuted: '#99aba8',
    },
  },
  {
    id: 'midnight',
    swatch: '#334155',
    accentSwatch: '#2563eb',
    light: {
      primary: '#1e293b',
      primaryHover: '#0f172a',
      primaryFg: '#ffffff',
      soft: '#f1f5f9',
      textOnSurface: '#1e293b',
      accent: '#1d4ed8',
      accentHover: '#1e40af',
      accentFg: '#ffffff',
      accentSoft: '#eff6ff',
      accentTextOnSurface: '#1d4ed8',
      bgCanvas: '#f6f7f9',
      bgSurface: '#ffffff',
      bgSubtle: '#eff2f6',
      bgChatFeed: '#f3f5f8',
      bgHeader: 'rgba(255, 255, 255, 0.92)',
      borderSubtle: '#e2e8f0',
      borderStrong: '#cbd5e1',
      textPrimary: '#0f172a',
      textSecondary: '#475569',
      textMuted: '#64748b',
    },
    dark: {
      primary: '#334155',
      primaryHover: '#475569',
      primaryFg: '#ffffff',
      soft: '#1e293b',
      textOnSurface: '#93c5fd',
      accent: '#2563eb',
      accentHover: '#1d4ed8',
      accentFg: '#ffffff',
      accentSoft: '#172554',
      accentTextOnSurface: '#60a5fa',
      bgCanvas: '#0f1116',
      bgSurface: '#171b22',
      bgSubtle: '#212731',
      bgChatFeed: '#12151c',
      bgHeader: 'rgba(23, 27, 34, 0.92)',
      borderSubtle: '#28303d',
      borderStrong: '#374254',
      textPrimary: '#f8fafc',
      textSecondary: '#cbd5e1',
      textMuted: '#94a3b8',
    },
  },
  {
    id: 'warm-sand',
    swatch: '#92400e',
    accentSwatch: '#15803d',
    light: {
      primary: '#92400e',
      primaryHover: '#78350f',
      primaryFg: '#ffffff',
      soft: '#fef3c7',
      textOnSurface: '#92400e',
      accent: '#15803d',
      accentHover: '#166534',
      accentFg: '#ffffff',
      accentSoft: '#ecfdf5',
      accentTextOnSurface: '#15803d',
      bgCanvas: '#faf8f4',
      bgSurface: '#ffffff',
      bgSubtle: '#f5f1e8',
      bgChatFeed: '#f8f5ee',
      bgHeader: 'rgba(255, 255, 255, 0.92)',
      borderSubtle: '#e8e0d2',
      borderStrong: '#d6cab6',
      textPrimary: '#1c1917',
      textSecondary: '#57534e',
      textMuted: '#78716c',
    },
    dark: {
      primary: '#92400e',
      primaryHover: '#78350f',
      primaryFg: '#ffffff',
      soft: '#2b1e12',
      textOnSurface: '#fbbf24',
      accent: '#1b7a43',
      accentHover: '#166534',
      accentFg: '#ffffff',
      accentSoft: '#14291e',
      accentTextOnSurface: '#4ade80',
      bgCanvas: '#161411',
      bgSurface: '#201c17',
      bgSubtle: '#2a251e',
      bgChatFeed: '#191612',
      bgHeader: 'rgba(32, 28, 23, 0.92)',
      borderSubtle: '#342d24',
      borderStrong: '#473e31',
      textPrimary: '#f5f5f4',
      textSecondary: '#d6d3d1',
      textMuted: '#a8a29e',
    },
  },
];

export function resolvePaletteTokens(
  paletteId: PaletteId,
  customHex: string,
  darkMode: boolean
): PaletteTokens {
  if (paletteId === 'custom') {
    return buildCustomTokens(customHex, darkMode);
  }
  const preset = PALETTE_PRESETS.find((p) => p.id === paletteId) ?? PALETTE_PRESETS[0];
  return darkMode ? preset.dark : preset.light;
}

// --- App Background Presets (Solids & Soft Gradients) ---

export type BgPresetId =
  | 'palette-default'
  | 'crisp-white'
  | 'warm-linen'
  | 'sage-mist'
  | 'sky-breeze'
  | 'lavender-cloud'
  | 'meadow-glow'
  | 'sunrise-peach'
  | 'ocean-horizon'
  | 'rose-quartz'
  | 'mint-breeze'
  | 'aurora-silk'
  | 'custom';

export interface BgPreset {
  id: Exclude<BgPresetId, 'custom'>;
  kind: 'default' | 'solid' | 'gradient';
  lightCss: string;
  darkCss: string;
  lightSwatch: string;
  darkSwatch: string;
}

export const BG_PRESETS: BgPreset[] = [
  {
    id: 'palette-default',
    kind: 'default',
    lightCss: '',
    darkCss: '',
    lightSwatch: '#f7f9f7',
    darkSwatch: '#121412',
  },
  {
    id: 'crisp-white',
    kind: 'solid',
    lightCss: '#ffffff',
    darkCss: '#121212',
    lightSwatch: '#ffffff',
    darkSwatch: '#121212',
  },
  {
    id: 'warm-linen',
    kind: 'solid',
    lightCss: '#faf6ee',
    darkCss: '#191612',
    lightSwatch: '#faf6ee',
    darkSwatch: '#191612',
  },
  {
    id: 'sage-mist',
    kind: 'solid',
    lightCss: '#eef5f0',
    darkCss: '#101813',
    lightSwatch: '#eef5f0',
    darkSwatch: '#101813',
  },
  {
    id: 'sky-breeze',
    kind: 'solid',
    lightCss: '#eef5fc',
    darkCss: '#10161f',
    lightSwatch: '#eef5fc',
    darkSwatch: '#10161f',
  },
  {
    id: 'lavender-cloud',
    kind: 'solid',
    lightCss: '#f4f1fb',
    darkCss: '#15121e',
    lightSwatch: '#f4f1fb',
    darkSwatch: '#15121e',
  },
  {
    id: 'meadow-glow',
    kind: 'gradient',
    lightCss: 'linear-gradient(135deg, #f3faf4 0%, #e5f5ea 55%, #f7faf2 100%)',
    darkCss: 'linear-gradient(135deg, #0f1712 0%, #14221a 55%, #111612 100%)',
    lightSwatch: 'linear-gradient(135deg, #dcfce7 0%, #fef9c3 100%)',
    darkSwatch: 'linear-gradient(135deg, #143322 0%, #1d2618 100%)',
  },
  {
    id: 'sunrise-peach',
    kind: 'gradient',
    lightCss: 'linear-gradient(135deg, #fff8f1 0%, #ffedd5 55%, #fef2f2 100%)',
    darkCss: 'linear-gradient(135deg, #191310 0%, #241813 55%, #1a1214 100%)',
    lightSwatch: 'linear-gradient(135deg, #fed7aa 0%, #fecdd3 100%)',
    darkSwatch: 'linear-gradient(135deg, #331e14 0%, #2e171b 100%)',
  },
  {
    id: 'ocean-horizon',
    kind: 'gradient',
    lightCss: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #eef2ff 100%)',
    darkCss: 'linear-gradient(135deg, #0e161e 0%, #12202d 50%, #141726 100%)',
    lightSwatch: 'linear-gradient(135deg, #bae6fd 0%, #c7d2fe 100%)',
    darkSwatch: 'linear-gradient(135deg, #12283a 0%, #1b2038 100%)',
  },
  {
    id: 'rose-quartz',
    kind: 'gradient',
    lightCss: 'linear-gradient(135deg, #fff1f2 0%, #fce7f3 50%, #faf5ff 100%)',
    darkCss: 'linear-gradient(135deg, #1b1114 0%, #25141c 50%, #1a1321 100%)',
    lightSwatch: 'linear-gradient(135deg, #fecdd3 0%, #e9d5ff 100%)',
    darkSwatch: 'linear-gradient(135deg, #33171e 0%, #271836 100%)',
  },
  {
    id: 'mint-breeze',
    kind: 'gradient',
    lightCss: 'linear-gradient(135deg, #f0fdfa 0%, #d1fae5 50%, #ecfeff 100%)',
    darkCss: 'linear-gradient(135deg, #0f1817 0%, #122422 50%, #101b20 100%)',
    lightSwatch: 'linear-gradient(135deg, #99f6e4 0%, #bae6fd 100%)',
    darkSwatch: 'linear-gradient(135deg, #13302d 0%, #132833 100%)',
  },
  {
    id: 'aurora-silk',
    kind: 'gradient',
    lightCss: 'linear-gradient(135deg, #f5f3ff 0%, #e0f2fe 50%, #ecfdf5 100%)',
    darkCss: 'linear-gradient(135deg, #161321 0%, #121c27 50%, #111d17 100%)',
    lightSwatch: 'linear-gradient(135deg, #ddd6fe 0%, #bbf7d0 100%)',
    darkSwatch: 'linear-gradient(135deg, #211a36 0%, #142c20 100%)',
  },
];

export interface ResolvedAppBackground {
  backgroundCss: string;
  canvasTextPrimary: string;
  canvasTextSecondary: string;
  canvasTextMuted: string;
  canvasBrandText: string;
}

export function resolveAppBackground(
  bgId: BgPresetId,
  customBgHex: string,
  paletteTokens: PaletteTokens,
  darkMode: boolean
): ResolvedAppBackground {
  if (bgId === 'custom') {
    const hex = normalizeHex(customBgHex);
    const isLightCanvas = relativeLuminance(hex) > 0.36;
    return {
      backgroundCss: hex,
      canvasTextPrimary: isLightCanvas ? '#0f172a' : '#f3f4f6',
      canvasTextSecondary: isLightCanvas ? '#334155' : '#d4d4d8',
      canvasTextMuted: isLightCanvas ? '#475569' : '#a1a1aa',
      canvasBrandText: ensureTextContrastOnBg(paletteTokens.primary, hex, !isLightCanvas),
    };
  }

  const preset = BG_PRESETS.find((b) => b.id === bgId);
  const css =
    preset && preset.id !== 'palette-default'
      ? darkMode
        ? preset.darkCss
        : preset.lightCss
      : paletteTokens.bgCanvas;

  return {
    backgroundCss: css,
    canvasTextPrimary: paletteTokens.textPrimary,
    canvasTextSecondary: paletteTokens.textSecondary,
    canvasTextMuted: paletteTokens.textMuted,
    canvasBrandText: paletteTokens.textOnSurface,
  };
}
