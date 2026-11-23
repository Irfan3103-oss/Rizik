import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import enDict from './en.json';
import bnDict from './bn.json';
import type { Language } from '../types';

const LANG_STORAGE_KEY = 'rizik_lang';
const LEGACY_LANG_STORAGE_KEY_1 = 'aharforall_lang';
const LEGACY_LANG_STORAGE_KEY_2 = 'nourishloop_lang';
const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

type DictNode = string | { [key: string]: DictNode };

const DICTS: Record<Language, DictNode> = {
  en: enDict as DictNode,
  bn: bnDict as DictNode,
};

function getInitialLanguage(): Language {
  try {
    const saved =
      localStorage.getItem(LANG_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_LANG_STORAGE_KEY_1) ||
      localStorage.getItem(LEGACY_LANG_STORAGE_KEY_2);
    if (saved === 'bn' || saved === 'en') return saved;
  } catch {
    // Ignore storage errors
  }
  return 'en';
}

function resolveKey(dict: DictNode, path: string): string | null {
  const parts = path.split('.');
  let current: DictNode | undefined = dict;
  for (const part of parts) {
    if (!current || typeof current === 'string') return null;
    current = current[part];
  }
  return typeof current === 'string' ? current : null;
}

export function toBanglaDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => BN_DIGITS[Number(d)] ?? d);
}

const BLOCK_LETTER_BN: Record<string, string> = {
  A: 'এ',
  B: 'বি',
  C: 'সি',
  D: 'ডি',
  E: 'ই',
  F: 'এফ',
  G: 'জি',
  H: 'এইচ',
};

const DHAKA_ADDRESS_REPLACEMENTS: [RegExp, string][] = [
  [/\bDhanmondi\b/gi, 'ধানমন্ডি'],
  [/\bGulshan\s*1\b/gi, 'গুলশান ১'],
  [/\bGulshan\s*2\b/gi, 'গুলশান ২'],
  [/\bGulshan\b/gi, 'গুলশান'],
  [/\bBanani\b/gi, 'বানানী'],
  [/\bUttara\b/gi, 'উত্তরা'],
  [/\bMirpur\s*10\b/gi, 'মিরপুর ১০'],
  [/\bMirpur\b/gi, 'মিরপুর'],
  [/\bMotijheel\b/gi, 'মতিঝিল'],
  [/\bMohammadpur\b/gi, 'মোহাম্মদপুর'],
  [/\bKarwan Bazar\b/gi, 'কারওয়ান বাজার'],
  [/\bFarmgate\b/gi, 'ফার্মগেট'],
  [/\bDhaka Central\b/gi, 'ঢাকা কেন্দ্রীয়'],
  [/\bDhaka\b/gi, 'ঢাকা'],
  [/\bBangladesh\b/gi, 'বাংলাদেশ'],
  [/\bHouse\b/gi, 'বাড়ি'],
  [/\bPlot\b/gi, 'প্লট'],
  [/\bRoad\b/gi, 'রোড'],
  [/\bRd\.?\b/gi, 'রোড'],
  [/\bSector\b/gi, 'সেক্টর'],
  [/\bBlock\b/gi, 'ব্লক'],
  [/\bAve\.?\b|\bAvenue\b/gi, 'এভিনিউ'],
  [/\bStreet\b|\bSt\.?\b/gi, 'স্ট্রিট'],
  [/\bLane\b/gi, 'লেন'],
  [/\bCorner\b/gi, 'কর্নার'],
  [/\bSquare\b/gi, 'চত্বর'],
  [/\bCommunity Center\b/gi, 'কমিউনিটি সেন্টার'],
  [/\bCommunity Hub\b/gi, 'কমিউনিটি হাব'],
  [/\bCourtyard\b/gi, 'প্রাঙ্গণ'],
  [/\bPark Gate\b/gi, 'পার্ক গেট'],
  [/\bLake Drive Road\b/gi, 'লেক ড্রাইভ রোড'],
  [/\bSatmasjid Road\b/gi, 'সাতমসজিদ রোড'],
  [/\bBegum Rokeya Sarani\b/gi, 'বেগম রোকেয়া সরণি'],
  [/\bTajmahal Road\b/gi, 'তাজমহল রোড'],
  [/\bGreen Road\b/gi, 'গ্রিন রোড'],
  [/\bDilkusha C\/A\b/gi, 'দিলকুশা বা/এ'],
  [/\bKazi Nazrul Islam\b/gi, 'কাজী নজরুল ইসলাম'],
  [/\bRabindra Sarobar\b/gi, 'রবীন্দ্র সরোবর'],
];

function translateDhakaAddressFallback(raw: string): string {
  let out = raw.replace(/\bBlock\s+([A-Za-z])\b/gi, (_m, letter: string) => {
    const upper = letter.toUpperCase();
    return `ব্লক ${BLOCK_LETTER_BN[upper] ?? upper}`;
  });
  for (const [pattern, replacement] of DHAKA_ADDRESS_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return toBanglaDigits(out);
}

function translateHoursToBangla(raw: string): string {
  const formatted = raw.replace(
    /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/gi,
    (_m, hStr: string, mStr: string | undefined, meridiem: string) => {
      const hour = Number(hStr);
      const mins = mStr ?? '00';
      const upper = meridiem.toUpperCase();
      let prefix = '';
      if (upper === 'AM') {
        prefix = hour >= 4 && hour < 12 ? 'সকাল ' : 'রাত ';
      } else {
        if (hour === 12 || hour < 4) prefix = 'দুপুর ';
        else if (hour < 6) prefix = 'বিকাল ';
        else if (hour < 8) prefix = 'সন্ধ্যা ';
        else prefix = 'রাত ';
      }
      return `${prefix}${hStr}:${mins}`;
    }
  );
  return toBanglaDigits(formatted);
}

interface I18nContextValue {
  lang: Language;
  setLang: (next: Language) => void;
  toggleLang: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  formatNumber: (value: string | number) => string;
  formatTime: (iso: string) => string;
  formatWindow: (startIso: string, endIso: string) => string;
  formatTimeLeft: (endIso: string) => string;
  formatUnit: (unit: string) => string;
  formatDietary: (tag: string) => string;
  formatArea: (area?: string | null) => string;
  formatAddress: (address?: string | null, addressBn?: string | null) => string;
  formatHours: (hours?: string | null) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(getInitialLanguage);

  useEffect(() => {
    document.documentElement.lang = lang;
    const title = resolveKey(DICTS[lang], 'meta.title') ?? 'Rizik';
    const desc =
      resolveKey(DICTS[lang], 'meta.description') ??
      'রিজিক কখনো ভুল ঠিকানায় পৌঁছায় না, যার জন্য যতটুকু বরাদ্দ, সে ততটুকুই পায়।';
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', desc);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', desc);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      // Ignore
    }
  }, [lang]);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => (prev === 'en' ? 'bn' : 'en'));
  }, []);

  const formatNumber = useCallback(
    (value: string | number) => (lang === 'bn' ? toBanglaDigits(value) : String(value)),
    [lang]
  );

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const raw = resolveKey(DICTS[lang], key) ?? resolveKey(DICTS.en, key) ?? key;
      if (!vars) return raw;
      return raw.replace(/\{\{(\w+)\}\}/g, (_, k) => {
        const val = vars[k];
        if (val === undefined) return '';
        if (typeof val === 'number' && lang === 'bn') return toBanglaDigits(val);
        return String(val);
      });
    },
    [lang]
  );

  const formatTime = useCallback(
    (iso: string) => {
      const date = new Date(iso);
      const formatted = date.toLocaleTimeString(lang === 'bn' ? 'bn-BD' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
      return lang === 'bn' ? toBanglaDigits(formatted) : formatted;
    },
    [lang]
  );

  const formatWindow = useCallback(
    (startIso: string, endIso: string) => `${formatTime(startIso)} – ${formatTime(endIso)}`,
    [formatTime]
  );

  const formatTimeLeft = useCallback(
    (endIso: string) => {
      const diffMin = Math.round((new Date(endIso).getTime() - Date.now()) / 60_000);
      if (diffMin <= 0) return t('feed.expired');
      const hUnit = t('common.hoursUnit');
      const mUnit = t('common.minutesUnit');
      if (diffMin < 60) return `${formatNumber(diffMin)}${lang === 'bn' ? ' ' : ''}${mUnit}`;
      const hrs = Math.floor(diffMin / 60);
      const mins = diffMin % 60;
      if (mins > 0) {
        return `${formatNumber(hrs)}${lang === 'bn' ? ' ' : ''}${hUnit} ${formatNumber(mins)}${lang === 'bn' ? ' ' : ''}${mUnit}`;
      }
      return `${formatNumber(hrs)}${lang === 'bn' ? ' ' : ''}${hUnit}`;
    },
    [lang, formatNumber, t]
  );

  const formatUnit = useCallback(
    (unit: string) => {
      const translated = resolveKey(DICTS[lang], `units.${unit}`);
      return translated ?? unit;
    },
    [lang]
  );

  const formatDietary = useCallback(
    (tag: string) => {
      const translated = resolveKey(DICTS[lang], `dietary.${tag}`);
      return translated ?? tag;
    },
    [lang]
  );

  const formatArea = useCallback(
    (area?: string | null) => {
      if (!area) return '';
      const exact = resolveKey(DICTS[lang], `areas.${area}`);
      if (exact) return exact;
      if (lang === 'bn') return translateDhakaAddressFallback(area);
      return area;
    },
    [lang]
  );

  const formatAddress = useCallback(
    (address?: string | null, addressBn?: string | null) => {
      if (lang === 'bn') {
        if (addressBn && addressBn.trim()) return toBanglaDigits(addressBn.trim());
        if (!address) return '';
        const exactArea = resolveKey(DICTS.bn, `areas.${address}`);
        if (exactArea) return exactArea;
        return translateDhakaAddressFallback(address);
      }
      return address ?? '';
    },
    [lang]
  );

  const formatHours = useCallback(
    (hours?: string | null) => {
      if (!hours) return '';
      if (lang === 'bn') return translateHoursToBangla(hours);
      return hours;
    },
    [lang]
  );

  return (
    <I18nContext.Provider
      value={{
        lang,
        setLang,
        toggleLang,
        t,
        formatNumber,
        formatTime,
        formatWindow,
        formatTimeLeft,
        formatUnit,
        formatDietary,
        formatArea,
        formatAddress,
        formatHours,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
