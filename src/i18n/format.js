// Locale-aware formatting for the interface language.
//
// Dates are the one place where the interface language must reach beyond the
// dictionary: `toLocaleDateString()` with no locale follows the BROWSER locale,
// so an Arabic interface on an English machine would still print English
// month names. Latin digits are kept in both languages on purpose — prices,
// counters and the usage meter already use them, and mixing numeral systems in
// one panel reads as a rendering bug.
import { DEFAULT_LANGUAGE } from "./languages.js";

const LOCALES = {
  en: "en",
  ar: "ar-AE-u-nu-latn",
};

export function localeFor(language) {
  return LOCALES[language] || LOCALES[DEFAULT_LANGUAGE];
}

export function formatDate(value, language, options) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(localeFor(language), options);
}
