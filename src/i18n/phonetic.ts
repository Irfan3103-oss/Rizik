// Lightweight Avro-style phonetic Roman-to-Bangla helper for chat typing

const PHONETIC_WORDS: Record<string, string> = {
  ami: 'আমি',
  amra: 'আমরা',
  tumi: 'তুমি',
  apni: 'আপনি',
  apnake: 'আপনাকে',
  tomake: 'তোমাকে',
  khabar: 'খাবার',
  khabarer: 'খাবারের',
  aschi: 'আসছি',
  ashchi: 'আসছি',
  asbo: 'আসবো',
  ashbo: 'আসবো',
  dhonnobad: 'ধন্যবাদ',
  dhanyabad: 'ধন্যবাদ',
  shukriya: 'শুকরিয়া',
  bhalo: 'ভালো',
  valo: 'ভালো',
  ache: 'আছে',
  achhe: 'আছে',
  aki: 'আছে কি',
  nai: 'নাই',
  nei: 'নেই',
  ekhon: 'এখন',
  akhon: 'এখন',
  kotokhon: 'কতক্ষণ',
  kothay: 'কোথায়',
  kothai: 'কোথায়',
  deri: 'দেরি',
  hobe: 'হবে',
  thakben: 'থাকবেন',
  thakun: 'থাকুন',
  doya: 'দয়া',
  kore: 'করে',
  bhai: 'ভাই',
  vai: 'ভাই',
  apu: 'আপু',
  salaam: 'সালাম',
  salam: 'সালাম',
  assalamu: 'আসসালামু',
  alaikum: 'আলাইকুম',
  ji: 'জি',
  ha: 'হ্যাঁ',
  han: 'হ্যাঁ',
  na: 'না',
  ekta: 'একটা',
  duita: 'দুইটা',
  tinta: 'তিনটা',
  minit: 'মিনিট',
  minute: 'মিনিট',
  ghonta: 'ঘণ্টা',
  box: 'বক্স',
  bag: 'ব্যাগ',
  ready: 'রেডি',
  pickup: 'পিকআপ',
  code: 'কোড',
  dhaka: 'ঢাকা',
  dhanmondi: 'ধানমন্ডি',
  gulshan: 'গুলশান',
  banani: 'বানানী',
  uttara: 'উত্তরা',
  mirpur: 'মিরপুর',
  motijheel: 'মতিঝিল',
  eti: 'এটি',
  ki: 'কি',
  ekhono: 'এখনো',
  lagbe: 'লাগবে',
  niye: 'নিয়ে',
  jabo: 'যাবো',
  jacchi: 'যাচ্ছি',
  pouchhe: 'পৌঁছে',
  gechi: 'গেছি',
  ready_ache: 'প্রস্তুত আছে',
};

const DIGRAPH_CONSONANTS: [string, string][] = [
  ['ksh', 'ক্ষ'],
  ['ng', 'ং'],
  ['chh', 'ছ'],
  ['kh', 'খ'],
  ['gh', 'ঘ'],
  ['ch', 'চ'],
  ['jh', 'ঝ'],
  ['th', 'থ'],
  ['dh', 'ধ'],
  ['ph', 'ফ'],
  ['bh', 'ভ'],
  ['sh', 'শ'],
  ['rh', 'ঢ়'],
  ['Th', 'ঠ'],
  ['Dh', 'ঢ'],
];

const SINGLE_CONSONANTS: Record<string, string> = {
  k: 'ক',
  g: 'গ',
  c: 'চ',
  j: 'জ',
  t: 'ত',
  T: 'ট',
  d: 'দ',
  D: 'ড',
  n: 'ন',
  N: 'ণ',
  p: 'প',
  f: 'ফ',
  b: 'ব',
  v: 'ভ',
  m: 'ম',
  z: 'য',
  r: 'র',
  l: 'ল',
  s: 'স',
  S: 'ষ',
  h: 'হ',
  y: 'য়',
  R: 'ড়',
};

const VOWELS_STANDALONE: [string, string][] = [
  ['oi', 'ঐ'],
  ['ou', 'ঔ'],
  ['aa', 'আ'],
  ['ee', 'ঈ'],
  ['oo', 'উ'],
  ['a', 'আ'],
  ['i', 'ই'],
  ['u', 'উ'],
  ['e', 'এ'],
  ['o', 'ও'],
];

const VOWEL_SIGNS: [string, string][] = [
  ['oi', 'ৈ'],
  ['ou', 'ৌ'],
  ['aa', 'া'],
  ['ee', 'ী'],
  ['oo', 'ু'],
  ['a', 'া'],
  ['i', 'ি'],
  ['u', 'ু'],
  ['e', 'ে'],
  ['o', 'ো'],
];

export function convertPhoneticWord(word: string): string {
  // If already contains Bengali Unicode characters, leave untouched
  if (/[\u0980-\u09FF]/.test(word)) return word;
  const lower = word.toLowerCase();
  if (PHONETIC_WORDS[lower]) return PHONETIC_WORDS[lower];
  if (!/^[a-zA-Z]+$/.test(word)) return word;

  let out = '';
  let i = 0;
  let lastWasConsonant = false;

  while (i < word.length) {
    // Check digits
    const ch = word[i];
    if (/\d/.test(ch)) {
      out += ch;
      lastWasConsonant = false;
      i++;
      continue;
    }

    // Check consonant digraphs
    let matchedCons = false;
    for (const [pat, bn] of DIGRAPH_CONSONANTS) {
      if (word.slice(i, i + pat.length).toLowerCase() === pat.toLowerCase()) {
        out += bn;
        i += pat.length;
        lastWasConsonant = true;
        matchedCons = true;
        break;
      }
    }
    if (matchedCons) continue;

    // Single consonant
    const singleC = SINGLE_CONSONANTS[ch] ?? SINGLE_CONSONANTS[ch.toLowerCase()];
    if (singleC) {
      out += singleC;
      i++;
      lastWasConsonant = true;
      continue;
    }

    // Vowels
    const vowelList = lastWasConsonant ? VOWEL_SIGNS : VOWELS_STANDALONE;
    let matchedVowel = false;
    for (const [pat, bn] of vowelList) {
      if (word.slice(i, i + pat.length).toLowerCase() === pat) {
        // In Bengali, implicit 'o' after consonant needs no kar sign
        if (!(lastWasConsonant && pat === 'o')) {
          out += bn;
        }
        i += pat.length;
        lastWasConsonant = false;
        matchedVowel = true;
        break;
      }
    }
    if (matchedVowel) continue;

    out += ch;
    lastWasConsonant = false;
    i++;
  }

  return out;
}

/**
 * Converts completed Romanized words when the user presses space or punctuation.
 */
export function convertPhoneticOnBoundary(input: string): string {
  if (!input.endsWith(' ') && !/[.,!?]$/.test(input)) return input;
  const trail = input.slice(-1);
  const body = input.slice(0, -1);
  const parts = body.split(/(\s+)/);
  const lastIdx = parts.length - 1;
  if (lastIdx >= 0 && parts[lastIdx] && /^[a-zA-Z]+$/.test(parts[lastIdx])) {
    parts[lastIdx] = convertPhoneticWord(parts[lastIdx]);
  }
  return parts.join('') + trail;
}
