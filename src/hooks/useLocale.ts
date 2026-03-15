import { useMemo, useState } from 'react';
import { createTranslator, detectLocale, persistLocale } from '../i18n';
import type { Locale } from '../i18n/types';

export function useLocale() {
 const [locale, setLocaleState] = useState<Locale>(() => detectLocale());
 const t = useMemo(() => createTranslator(locale), [locale]);

 const setLocale = (next: Locale) => {
 setLocaleState(next);
 persistLocale(next);
 };

 return {
 locale,
 setLocale,
 t,
 };
}
