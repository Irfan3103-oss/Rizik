import { normalizeHex, pickForeground, relativeLuminance } from './palettes';

export interface ChatThemePreset {
  id: string;
  swatch: string;
  lightBg: string;
  darkBg: string;
  isLightInLightMode: boolean;
  isLightInDarkMode: boolean;
}

export const CHAT_THEMES: ChatThemePreset[] = [
  {
    id: 'default',
    swatch: '#f3f6f4',
    lightBg: 'var(--bg-chat-feed)',
    darkBg: 'var(--bg-chat-feed)',
    isLightInLightMode: true,
    isLightInDarkMode: false,
  },
  {
    id: 'soft-mint',
    swatch: '#dcfce7',
    lightBg: '#eaf7ef',
    darkBg: '#112219',
    isLightInLightMode: true,
    isLightInDarkMode: false,
  },
  {
    id: 'sky-mist',
    swatch: '#dbeafe',
    lightBg: '#ebf4ff',
    darkBg: '#101b2a',
    isLightInLightMode: true,
    isLightInDarkMode: false,
  },
  {
    id: 'warm-cream',
    swatch: '#fef3c7',
    lightBg: '#fdf7ea',
    darkBg: '#201a12',
    isLightInLightMode: true,
    isLightInDarkMode: false,
  },
  {
    id: 'sunset-glow',
    swatch: 'linear-gradient(135deg, #ffedd5 0%, #fecdd3 100%)',
    lightBg: 'linear-gradient(145deg, #fff4eb 0%, #ffe8ec 55%, #fff7ed 100%)',
    darkBg: 'linear-gradient(145deg, #241612 0%, #26151c 55%, #1d1413 100%)',
    isLightInLightMode: true,
    isLightInDarkMode: false,
  },
  {
    id: 'ocean-wave',
    swatch: 'linear-gradient(135deg, #cffafe 0%, #bfdbfe 100%)',
    lightBg: 'linear-gradient(145deg, #ecfeff 0%, #e0f2fe 55%, #eef2ff 100%)',
    darkBg: 'linear-gradient(145deg, #0e1e24 0%, #111c2b 55%, #141728 100%)',
    isLightInLightMode: true,
    isLightInDarkMode: false,
  },
  {
    id: 'berry-blush',
    swatch: 'linear-gradient(135deg, #fce7f3 0%, #ede9fe 100%)',
    lightBg: 'linear-gradient(145deg, #fdf2f8 0%, #f5f3ff 100%)',
    darkBg: 'linear-gradient(145deg, #261421 0%, #1d1629 100%)',
    isLightInLightMode: true,
    isLightInDarkMode: false,
  },
  {
    id: 'twilight-indigo',
    swatch: 'linear-gradient(135deg, #c7d2fe 0%, #a5f3fc 100%)',
    lightBg: 'linear-gradient(145deg, #eef2ff 0%, #e0f2fe 100%)',
    darkBg: 'linear-gradient(145deg, #16182c 0%, #11222b 100%)',
    isLightInLightMode: true,
    isLightInDarkMode: false,
  },
  {
    id: 'botanical-dots',
    swatch: 'radial-gradient(circle, #86efac 2px, #f0fdf4 2px)',
    lightBg:
      'radial-gradient(rgba(21, 128, 61, 0.14) 1.25px, transparent 1.25px), #f3faf5',
    darkBg:
      'radial-gradient(rgba(74, 222, 128, 0.12) 1.25px, transparent 1.25px), #121b15',
    isLightInLightMode: true,
    isLightInDarkMode: false,
  },
  {
    id: 'woven-grid',
    swatch: 'repeating-linear-gradient(45deg, #e2e8f0 0 2px, #f8fafc 2px 8px)',
    lightBg:
      'repeating-linear-gradient(45deg, rgba(15, 23, 42, 0.03) 0 1px, transparent 1px 14px), repeating-linear-gradient(-45deg, rgba(15, 23, 42, 0.03) 0 1px, transparent 1px 14px), #f7f8fa',
    darkBg:
      'repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.035) 0 1px, transparent 1px 14px), repeating-linear-gradient(-45deg, rgba(255, 255, 255, 0.035) 0 1px, transparent 1px 14px), #14161a',
    isLightInLightMode: true,
    isLightInDarkMode: false,
  },
];

export interface BubbleColorPreset {
  id: string;
  hex: string; // 'theme' means follow app --brand-primary
}

export const BUBBLE_COLOR_PRESETS: BubbleColorPreset[] = [
  { id: 'theme', hex: 'theme' },
  { id: 'emerald', hex: '#15803d' },
  { id: 'messenger-blue', hex: '#0084ff' },
  { id: 'royal-violet', hex: '#6d28d9' },
  { id: 'rose-crimson', hex: '#e11d48' },
  { id: 'sunset-coral', hex: '#ea580c' },
  { id: 'teal-deep', hex: '#0f766e' },
  { id: 'indigo-slate', hex: '#4338ca' },
  { id: 'amber-gold', hex: '#b45309' },
  { id: 'graphite', hex: '#334155' },
];

export const QUICK_EMOJIS = ['👍', '❤️', '🙏', '😊', '🍽️', '🔥', '🎉', '✅'];
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '🙏', '🍽️'];

export interface ConversationChatPrefs {
  themeId: string;
  bubbleColor: string; // 'theme' or hex
  quickEmoji: string;
  nickname: string;
  muted: boolean;
}

const DEFAULT_CHAT_PREFS: ConversationChatPrefs = {
  themeId: 'default',
  bubbleColor: 'theme',
  quickEmoji: '👍',
  nickname: '',
  muted: false,
};

const STORAGE_KEY = 'rizik_chat_prefs_v1';
const LEGACY_STORAGE_KEY_1 = 'aharforall_chat_prefs_v1';
const LEGACY_STORAGE_KEY_2 = 'nourishloop_chat_prefs_v1';

function readAllPrefs(): Record<string, Partial<ConversationChatPrefs>> {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ||
      localStorage.getItem(LEGACY_STORAGE_KEY_1) ||
      localStorage.getItem(LEGACY_STORAGE_KEY_2);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getChatPrefs(conversationId: string): ConversationChatPrefs {
  const all = readAllPrefs();
  return { ...DEFAULT_CHAT_PREFS, ...(all[conversationId] ?? {}) };
}

export function saveChatPrefs(
  conversationId: string,
  next: Partial<ConversationChatPrefs>
): ConversationChatPrefs {
  const all = readAllPrefs();
  const merged = { ...DEFAULT_CHAT_PREFS, ...(all[conversationId] ?? {}), ...next };
  all[conversationId] = merged;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Ignore storage quota errors
  }
  return merged;
}

export function resetChatPrefs(conversationId: string): ConversationChatPrefs {
  const all = readAllPrefs();
  delete all[conversationId];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Ignore
  }
  return { ...DEFAULT_CHAT_PREFS };
}

export function getSentBubbleStyle(bubbleColor: string): {
  backgroundColor?: string;
  color?: string;
} {
  if (!bubbleColor || bubbleColor === 'theme') {
    return {};
  }
  const hex = normalizeHex(bubbleColor);
  const fg = pickForeground(hex);
  // Boost contrast slightly if mid-tone
  const lum = relativeLuminance(hex);
  return {
    backgroundColor: hex,
    color: lum > 0.36 ? '#0f172a' : fg,
  };
}
