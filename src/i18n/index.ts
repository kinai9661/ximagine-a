import { Locale } from './types';
import zhTW from './locales/zh-TW.json';
import enUS from './locales/en-US.json';

const STORAGE_KEY = 'grok-draw-locale';

const DICTIONARIES: Record<Locale, Record<string, any>> = {
 'zh-TW': zhTW,
 'en-US': enUS,
};

export const SUPPORTED_LOCALES: Locale[] = ['zh-TW', 'en-US'];

export function detectLocale(): Locale {
 if (typeof window === 'undefined') {
 return 'zh-TW';
 }

 const stored = window.localStorage.getItem(STORAGE_KEY) as Locale | null;
 if (stored && SUPPORTED_LOCALES.includes(stored)) {
 return stored;
 }

 const browser = window.navigator.language;
 if (browser.toLowerCase().startsWith('zh')) {
 return 'zh-TW';
 }

 return 'en-US';
}

export function persistLocale(locale: Locale) {
 if (typeof window === 'undefined') {
 return;
 }

 window.localStorage.setItem(STORAGE_KEY, locale);
}

export function createTranslator(locale: Locale) {
 const dictionary = DICTIONARIES[locale] ?? DICTIONARIES['zh-TW'];

 return function translate(path: string, fallback?: string): string {
 const segments = path.split('.');
 let current: any = dictionary;

 for (const segment of segments) {
 if (!current || typeof current !== 'object') {
 return fallback ?? path;
 }
 current = current[segment];
 }

 if (typeof current === 'string') {
 return current;
 }

 if (Array.isArray(current)) {
 return JSON.stringify(current);
 }

 return fallback ?? path;
 };
}
