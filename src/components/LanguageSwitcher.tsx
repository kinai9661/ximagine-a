import type { Locale } from '../i18n/types';

type LanguageOption = {
 value: Locale;
 label: string;
};

type LanguageSwitcherProps = {
 label: string;
 locale: Locale;
 options: LanguageOption[];
 onChange: (locale: Locale) => void;
};

export default function LanguageSwitcher({ label, locale, options, onChange }: LanguageSwitcherProps) {
 return (
 <label className="field">
 <span>{label}</span>
 <select value={locale} onChange={(event) => onChange(event.target.value as Locale)}>
 {options.map((option) => (
 <option key={option.value} value={option.value}>
 {option.label}
 </option>
 ))}
 </select>
 </label>
 );
}
