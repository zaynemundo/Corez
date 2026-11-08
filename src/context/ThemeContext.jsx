// Application theme state: light, dark and up to two saved custom themes.
//
// This provider is the ONLY place that touches document.documentElement's
// theme attributes, inline variables, classes and the theme-color meta tag. The
// ordering promise is what makes custom themes safe: a custom palette can only
// paint CSS variables and a body background, never layout or behaviour.
//
// Storage contract:
//  - localStorage["corez_theme"]      selection: "light" | "dark" | "custom:<id>".
//    Unknown/legacy values fall back to "dark" (index.html applies the same rule
//    before React mounts).
//  - localStorage["corez_theme_cache"] the last applied custom theme (tokens +
//    images) so a reload paints it before GET /api/themes resolves. It is
//    discarded when the theme no longer exists on the server.
//
// The provider never throws for an unavailable theme API: signed-out, offline,
// 401/404 and a failed fetch all keep the interface rendering with the light or
// dark base. Themes are fetched again whenever the signed-in user changes (and
// on refreshThemes()).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "./AuthContext";
import {
  DEFAULT_MAX_CUSTOM_THEMES,
  ThemeApiError,
  applyThemeProposal as applyThemeProposalRequest,
  deleteStoredTheme,
  discardThemeProposal,
  fetchThemes,
  normalizeTheme,
} from "../services/themeService";

export const THEME_STORAGE_KEY = "corez_theme";
export const THEME_CACHE_KEY = "corez_theme_cache";
const CUSTOM_PREFIX = "custom:";
const CUSTOM_THEME_ID = /^[A-Za-z0-9_-]{1,80}$/;
const MANAGED_CLASSES = ["theme-custom", "theme-has-backgrounds"];

const ThemeContext = createContext(null);

// ---------------------------------------------------------------- selection

/** Split a stored selection into { mode: "light"|"dark"|"custom", themeId }. */
export function parseThemeSelection(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw === "light" || raw === "dark") return { mode: raw, themeId: null };
  if (raw.startsWith(CUSTOM_PREFIX)) {
    const themeId = raw.slice(CUSTOM_PREFIX.length);
    if (CUSTOM_THEME_ID.test(themeId)) return { mode: "custom", themeId };
  }
  // Anything unrecognised — including a value written by a future version — is
  // the dark base rather than a broken/blank interface.
  return { mode: "dark", themeId: null };
}

/** Canonical storage string for a selection. */
export function themeSelectionValue(selection) {
  const parsed =
    typeof selection === "string"
      ? parseThemeSelection(selection)
      : {
          mode: selection?.mode === "light" ? "light" : selection?.mode === "custom" ? "custom" : "dark",
          themeId: selection?.themeId || null,
        };
  return parsed.mode === "custom" && parsed.themeId
    ? `${CUSTOM_PREFIX}${parsed.themeId}`
    : parsed.mode === "light"
      ? "light"
      : "dark";
}

function readStoredSelection() {
  if (typeof window === "undefined") return "dark";
  try {
    return themeSelectionValue(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "dark";
  }
}

// -------------------------------------------------------------------- cache

function readCachedTheme(expectedId = null) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(THEME_CACHE_KEY);
    if (!raw) return null;
    const theme = normalizeTheme(JSON.parse(raw));
    if (!theme) return null;
    if (expectedId && theme.id !== expectedId) return null;
    return theme;
  } catch {
    return null;
  }
}

function writeCachedTheme(theme) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(theme));
  } catch {
    /* private mode / quota: the theme still paints for this session */
  }
}

function clearCachedTheme() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(THEME_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

// ----------------------------------------------------------- document paint

function isUsableTokenValue(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 200 &&
    !/[{};\n\r]/.test(value)
  );
}

function safeBackgroundUrl(value) {
  const url = typeof value === "string" ? value.trim() : "";
  if (!url) return "";
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  if (url.startsWith("https://")) return url;
  if (url.startsWith("data:image/")) return url;
  return "";
}

function setVariable(root, name, value, applied) {
  if (!name.startsWith("--") || !isUsableTokenValue(value)) return;
  root.style.setProperty(name, value);
  applied.push(name);
}

function applyTokenMap(root, tokens, applied) {
  if (!tokens || typeof tokens !== "object") return;
  for (const [name, value] of Object.entries(tokens)) {
    setVariable(root, name, value, applied);
  }
}

/**
 * Paint one resolved state onto the document. Returns every inline custom
 * property it set, so the next switch can remove exactly those and no others.
 */
function applyDocumentTheme({ mode, selectionInfo, activeTheme }) {
  if (typeof document === "undefined") return [];
  const root = document.documentElement;
  const applied = [];

  root.classList.remove(...MANAGED_CLASSES);
  const tone = mode === "light" ? "light" : "dark";
  root.setAttribute("data-theme", tone);
  try {
    root.style.colorScheme = tone;
  } catch {
    /* very old engines ignore color-scheme */
  }

  let metaColor = null;
  // A custom selection without a loaded theme is a transient state (cache empty
  // and the API still unavailable): paint the tone base and wait for the fetch.
  if (selectionInfo.mode === "custom" && activeTheme) {
    root.classList.add("theme-custom");
    applyTokenMap(root, activeTheme.tokens?.solid, applied);
    if (typeof activeTheme.palette?.background === "string") {
      metaColor = activeTheme.palette.background;
    }

    const desktop = safeBackgroundUrl(activeTheme.images?.desktop);
    if (desktop) {
      root.classList.add("theme-has-backgrounds");
      applyTokenMap(root, activeTheme.tokens?.image, applied);
      if (!applied.includes("--theme-scrim")) {
        setVariable(root, "--theme-scrim", activeTheme.tokens?.scrim, applied);
      }
      const mobile = safeBackgroundUrl(activeTheme.images?.mobile) || desktop;
      setVariable(root, "--theme-image-desktop", `url("${desktop}")`, applied);
      setVariable(root, "--theme-image-mobile", `url("${mobile}")`, applied);
    }
  }

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const color = metaColor || (tone === "light" ? "#f7f7f7" : "#000000");
    meta.setAttribute("content", color);
  }

  return applied;
}

// ----------------------------------------------------------------- provider

function initialSelection(initialValue) {
  if (initialValue === undefined || initialValue === null) {
    return readStoredSelection();
  }
  return themeSelectionValue(initialValue);
}

export function ThemeProvider({ children, initialSelection: initialValue }) {
  // The provider also has to render in isolated component tests that do not
  // mount AuthProvider (the same tolerance useI18n has), so a missing provider
  // means "no user" rather than a crash.
  let auth;
  try {
    auth = useAuth();
  } catch {
    auth = null;
  }
  const userId = auth?.user?.id || null;

  const [bootState] = useState(() => {
    const selection = initialSelection(initialValue);
    const parsed = parseThemeSelection(selection);
    return {
      selection,
      cachedTheme:
        parsed.mode === "custom" ? readCachedTheme(parsed.themeId) : null,
    };
  });
  const [selection, setSelection] = useState(bootState.selection);
  const [cachedTheme, setCachedTheme] = useState(bootState.cachedTheme);
  const [customThemes, setCustomThemes] = useState([]);
  const [maxCustomThemes, setMaxCustomThemes] = useState(DEFAULT_MAX_CUSTOM_THEMES);
  const [loadingThemes, setLoadingThemes] = useState(false);
  const [lastError, setLastError] = useState(null);

  // Mirrors for async callbacks that need the latest value without re-creating
  // themselves on every state change.
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const customThemesRef = useRef(customThemes);
  customThemesRef.current = customThemes;
  const cachedThemeRef = useRef(cachedTheme);
  cachedThemeRef.current = cachedTheme;
  const maxCustomThemesRef = useRef(maxCustomThemes);
  maxCustomThemesRef.current = maxCustomThemes;
  const appliedVarsRef = useRef([]);
  // A theme saved while GET /api/themes was in flight must not be erased by that
  // (older) response, and an apply waits for the in-flight list first so the
  // server copy and the local selection cannot disagree.
  const inFlightThemesRef = useRef(null);
  const appliedDuringFetchRef = useRef(new Set());

  const selectionInfo = useMemo(() => parseThemeSelection(selection), [selection]);

  const activeTheme = useMemo(() => {
    if (selectionInfo.mode !== "custom" || !selectionInfo.themeId) return null;
    const saved = customThemes.find((theme) => theme.id === selectionInfo.themeId);
    if (saved) return saved;
    if (cachedTheme && cachedTheme.id === selectionInfo.themeId) return cachedTheme;
    return null;
  }, [selectionInfo, customThemes, cachedTheme]);

  const mode =
    selectionInfo.mode === "custom"
      ? activeTheme?.tone === "light"
        ? "light"
        : "dark"
      : selectionInfo.mode;

  const commitSelection = useCallback((nextValue) => {
    const value = themeSelectionValue(nextValue);
    selectionRef.current = value;
    setSelection(value);
  }, []);

  // Persist every committed selection (including the first canonicalisation of a
  // legacy value) so index.html can paint it before React mounts next time.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, selection);
    } catch {
      /* private mode: this session still switches */
    }
  }, [selection]);

  // Apply the resolved state. Clearing before painting is what makes a switch
  // between custom and light/dark complete: no orphaned inline variables from
  // the previous theme can leak into the next one.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    for (const name of appliedVarsRef.current) root.style.removeProperty(name);
    appliedVarsRef.current = applyDocumentTheme({ mode, selectionInfo, activeTheme });
  }, [mode, selectionInfo, activeTheme]);

  // Leaving the tree (a test cleanup, or the ErrorBoundary unmounting the app)
  // must not leave custom tokens or classes on the document element.
  useEffect(() => {
    return () => {
      if (typeof document === "undefined") return;
      const root = document.documentElement;
      for (const name of appliedVarsRef.current) root.style.removeProperty(name);
      appliedVarsRef.current = [];
      root.classList.remove(...MANAGED_CLASSES);
    };
  }, []);

  const reconcileFetchedThemes = useCallback(
    (themes, max) => {
      const limit = Number.isInteger(max) && max > 0 ? max : DEFAULT_MAX_CUSTOM_THEMES;
      // Keep themes this tab saved while the request was in flight: the
      // response predates them, but they are real. Everything else in the
      // fetched list is authoritative, so deletions elsewhere still disappear.
      const pending = appliedDuringFetchRef.current;
      const extras = pending.size
        ? customThemesRef.current.filter(
            (theme) => pending.has(theme.id) && !themes.some((entry) => entry.id === theme.id),
          )
        : [];
      const merged = (extras.length ? [...themes, ...extras] : themes).slice(0, limit);
      setCustomThemes(merged);
      setMaxCustomThemes(limit);
      for (const theme of merged) pending.delete(theme.id);
      const info = parseThemeSelection(selectionRef.current);
      if (info.mode !== "custom" || !info.themeId) return;
      const saved = merged.find((theme) => theme.id === info.themeId);
      if (saved) {
        // The server copy wins over the local cache (it may have been updated).
        setCachedTheme(saved);
        writeCachedTheme(saved);
        return;
      }
      // The saved theme no longer exists (deleted on another device/tab): fall
      // back to dark instead of leaving a custom id that can never resolve.
      setLastError(null);
      setCachedTheme(null);
      clearCachedTheme();
      commitSelection("dark");
    },
    [commitSelection],
  );

  const loadThemes = useCallback(async () => {
    setLoadingThemes(true);
    const request = fetchThemes();
    inFlightThemesRef.current = request;
    const result = await request;
    if (inFlightThemesRef.current === request) inFlightThemesRef.current = null;
    if (result.ok) reconcileFetchedThemes(result.themes, result.max);
    // A 401/404/network failure is not an error state: keep painting the cached
    // theme (when there is one) and retry on the next sign-in or refresh.
    setLoadingThemes(false);
    return result.ok ? result.themes : customThemesRef.current;
  }, [reconcileFetchedThemes]);

  // Capture the selection the user had on a fresh mount, and re-fetch whenever
  // the signed-in user changes (sign in, sign out, account switch).
  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    (async () => {
      setLoadingThemes(true);
      const request = fetchThemes();
      inFlightThemesRef.current = request;
      const result = await request;
      if (inFlightThemesRef.current === request) inFlightThemesRef.current = null;
      if (cancelled) return;
      if (result.ok) reconcileFetchedThemes(result.themes, result.max);
      setLoadingThemes(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, reconcileFetchedThemes]);

  const refreshThemes = useCallback(async () => {
    return loadThemes();
  }, [loadThemes]);

  const setMode = useCallback(
    (nextMode) => {
      if (nextMode !== "light" && nextMode !== "dark") return;
      commitSelection(nextMode);
      setCachedTheme(null);
      clearCachedTheme();
      setLastError(null);
    },
    [commitSelection],
  );

  const selectCustomTheme = useCallback(
    (themeId) => {
      const id = typeof themeId === "string" ? themeId.trim() : "";
      if (!CUSTOM_THEME_ID.test(id)) return;
      const theme =
        customThemesRef.current.find((entry) => entry.id === id) ||
        (cachedThemeRef.current?.id === id ? cachedThemeRef.current : null);
      if (!theme) return; // never select a palette we cannot paint
      setCachedTheme(theme);
      writeCachedTheme(theme);
      commitSelection(`${CUSTOM_PREFIX}${id}`);
      setLastError(null);
    },
    [commitSelection],
  );

  const deleteCustomTheme = useCallback(
    async (themeId) => {
      const id = typeof themeId === "string" ? themeId.trim() : "";
      if (!id) return false;
      const deleted = await deleteStoredTheme(id);
      if (!deleted) {
        setLastError({
          status: 0,
          code: "delete_failed",
          message: "The theme could not be deleted.",
        });
        return false;
      }
      setLastError(null);
      setCustomThemes((previous) => previous.filter((theme) => theme.id !== id));
      if (cachedThemeRef.current?.id === id) {
        setCachedTheme(null);
        clearCachedTheme();
      }
      const info = parseThemeSelection(selectionRef.current);
      if (info.mode === "custom" && info.themeId === id) {
        // Deleting the active theme returns to the dark base, not to an id that
        // would resolve to nothing on the next paint.
        commitSelection("dark");
      }
      return true;
    },
    [commitSelection],
  );

  const applyProposal = useCallback(
    async (proposalId, option) => {
      try {
        // Let an in-flight theme list settle first, so its reconcile cannot
        // interpret the brand-new theme id as a dangling selection.
        if (inFlightThemesRef.current) {
          try {
            await inFlightThemesRef.current;
          } catch {
            /* the list failed; the apply is still worth trying */
          }
        }
        const theme = await applyThemeProposalRequest(proposalId, option);
        appliedDuringFetchRef.current.add(theme.id);
        setCustomThemes((previous) => {
          const withoutTheme = previous.filter((entry) => entry.id !== theme.id);
          return [theme, ...withoutTheme].slice(0, maxCustomThemesRef.current);
        });
        setCachedTheme(theme);
        writeCachedTheme(theme);
        commitSelection(`${CUSTOM_PREFIX}${theme.id}`);
        setLastError(null);
        return theme;
      } catch (error) {
        const status = Number.isFinite(error?.status) ? error.status : 0;
        const code = typeof error?.code === "string" ? error.code : "";
        setLastError({
          status,
          code,
          message: error?.message || "The theme could not be saved.",
        });
        throw error instanceof ThemeApiError
          ? error
          : new ThemeApiError(error?.message || "The theme could not be saved.", {
              status,
              code,
            });
      }
    },
    [commitSelection],
  );

  const discardProposal = useCallback(async (proposalId) => {
    const discarded = await discardThemeProposal(proposalId);
    if (discarded) {
      setLastError(null);
    } else {
      setLastError({
        status: 0,
        code: "discard_failed",
        message: "The theme proposal could not be discarded.",
      });
    }
    return discarded;
  }, []);

  // Other tabs share the same storage. Their selection (including a custom id)
  // and the cache they wrote are adopted without a round-trip.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onStorage = (event) => {
      if (event.key === THEME_STORAGE_KEY) {
        const next = themeSelectionValue(event.newValue);
        selectionRef.current = next;
        setSelection(next);
        const info = parseThemeSelection(next);
        if (info.mode === "custom") {
          const cached = readCachedTheme(info.themeId);
          if (cached) setCachedTheme(cached);
        }
        return;
      }
      if (event.key === THEME_CACHE_KEY) {
        setCachedTheme(readCachedTheme());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo(
    () => ({
      selection,
      mode,
      activeTheme,
      customThemes,
      maxCustomThemes,
      loadingThemes,
      setMode,
      selectCustomTheme,
      deleteCustomTheme,
      refreshThemes,
      applyProposal,
      discardProposal,
      lastError,
    }),
    [
      selection,
      mode,
      activeTheme,
      customThemes,
      maxCustomThemes,
      loadingThemes,
      setMode,
      selectCustomTheme,
      deleteCustomTheme,
      refreshThemes,
      applyProposal,
      discardProposal,
      lastError,
    ],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// Safe defaults for components rendered without the provider (unit tests, error
// boundaries above it, story-style previews). Mirrors the useI18n pattern: the
// tree renders dark instead of crashing, and actions are inert.
const FALLBACK_THEME = {
  selection: "dark",
  mode: "dark",
  activeTheme: null,
  customThemes: [],
  maxCustomThemes: DEFAULT_MAX_CUSTOM_THEMES,
  loadingThemes: false,
  setMode: () => {},
  selectCustomTheme: () => {},
  deleteCustomTheme: async () => false,
  refreshThemes: async () => [],
  applyProposal: async () => {
    throw new ThemeApiError("Theme provider is unavailable.", {
      status: 0,
      code: "theme_provider_unavailable",
    });
  },
  discardProposal: async () => false,
  lastError: null,
};

export function useTheme() {
  return useContext(ThemeContext) || FALLBACK_THEME;
}
