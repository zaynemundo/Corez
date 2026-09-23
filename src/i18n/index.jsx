// Interface localisation: one provider, one hook, no dependency.
//
// Usage:
//   const { t, language, setLanguage, dir, isRTL } = useI18n();
//   <button>{t("common.sidebar.newChat")}</button>
//   <p>{t("common.sidebar.optionsFor", { title })}</p>
//
// `useI18n()` works without the provider (the component tests render screens in
// isolation) and then behaves like English — the default language — so no
// screen has to guard against a missing provider.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  getLanguageMeta,
  isSupportedLanguage,
} from "./languages.js";
import { translate, setCurrentLanguage } from "./dictionaries.js";

const I18nContext = createContext(null);

export function readStoredLanguage() {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isSupportedLanguage(stored) ? stored : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

/**
 * The language the document should render in, decided before React mounts so
 * the first paint is never in the wrong direction. index.html runs the same
 * check inline for the initial HTML.
 */
export function applyDocumentLanguage(language) {
  if (typeof document === "undefined") return;
  const meta = getLanguageMeta(language);
  const root = document.documentElement;
  root.setAttribute("lang", meta.id);
  root.setAttribute("dir", meta.dir);
}

export function I18nProvider({ children, initialLanguage }) {
  const [language, setLanguageState] = useState(() =>
    isSupportedLanguage(initialLanguage)
      ? initialLanguage
      : readStoredLanguage(),
  );

  // Keep the ambient language (non-React utilities) and the document
  // attributes in step with the rendered language.
  setCurrentLanguage(language);

  useEffect(() => {
    applyDocumentLanguage(language);
  }, [language]);

  const setLanguage = useCallback((next) => {
    if (!isSupportedLanguage(next)) return;
    setLanguageState(next);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      /* private mode: the session still switches, it just is not remembered */
    }
  }, []);

  const value = useMemo(() => {
    const meta = getLanguageMeta(language);
    return {
      language,
      dir: meta.dir,
      isRTL: meta.dir === "rtl",
      languages: SUPPORTED_LANGUAGES,
      setLanguage,
      t: (key, vars) => translate(language, key, vars),
    };
  }, [language, setLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// English fallback used when a component renders outside the provider (unit
// tests, error boundaries above the provider, story-style previews).
const FALLBACK = {
  language: DEFAULT_LANGUAGE,
  dir: "ltr",
  isRTL: false,
  languages: SUPPORTED_LANGUAGES,
  setLanguage: () => {},
  t: (key, vars) => translate(DEFAULT_LANGUAGE, key, vars),
};

export function useI18n() {
  return useContext(I18nContext) || FALLBACK;
}

export { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES };
