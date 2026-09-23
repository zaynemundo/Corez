// Languages the Corez interface can be used in.
//
// English is the default and the fallback for every missing translation, so a
// half-translated language degrades to English instead of showing blank labels.
// Arabic switches the whole document to right-to-left (see src/rtl.css).
export const DEFAULT_LANGUAGE = "en";

export const SUPPORTED_LANGUAGES = [
  { id: "en", label: "English", nativeLabel: "English", dir: "ltr" },
  { id: "ar", label: "Arabic", nativeLabel: "العربية", dir: "rtl" },
];

export const LANGUAGE_STORAGE_KEY = "corez_language";

export function isSupportedLanguage(value) {
  return SUPPORTED_LANGUAGES.some((language) => language.id === value);
}

export function getLanguageMeta(value) {
  return (
    SUPPORTED_LANGUAGES.find((language) => language.id === value) ||
    SUPPORTED_LANGUAGES[0]
  );
}
