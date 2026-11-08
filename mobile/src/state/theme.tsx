/**
 * Theme provider.
 *
 * Resolves `system | dark | light` into the dark/light token sets from
 * `tokens.ts`, or a saved custom theme from the Worker into native colours.
 * Both the base mode and the last applied custom theme are cached in
 * SecureStore so the app paints correctly before any network request.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";
import {
  darkTheme,
  lightTheme,
  type Theme,
  type ThemeMode,
} from "@/theme/tokens";
import { themeFromCustomTheme, isCustomTheme } from "@/theme/customTheme";
import type { CustomTheme } from "@/api/themes";

const THEME_STORAGE_KEY = "corez_theme";
const CUSTOM_THEME_STORAGE_KEY = "corez_custom_theme";

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  customTheme: CustomTheme | null;
  applyCustomTheme: (theme: CustomTheme) => void;
  clearCustomTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [customTheme, setCustomTheme] = useState<CustomTheme | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const [storedMode, storedCustom] = await Promise.all([
          SecureStore.getItemAsync(THEME_STORAGE_KEY),
          SecureStore.getItemAsync(CUSTOM_THEME_STORAGE_KEY),
        ]);
        if (!mounted) return;
        if (
          storedMode === "dark" ||
          storedMode === "light" ||
          storedMode === "system"
        ) {
          setModeState(storedMode);
        }
        if (storedCustom) {
          try {
            const parsed: unknown = JSON.parse(storedCustom);
            if (isCustomTheme(parsed)) setCustomTheme(parsed);
          } catch {
            // Ignore a corrupt cache; the base theme stays.
          }
        }
      } catch {
        // System default remains.
      } finally {
        if (mounted) hydrated.current = true;
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    setCustomTheme(null);
    void SecureStore.setItemAsync(THEME_STORAGE_KEY, next).catch(() => {});
    void SecureStore.deleteItemAsync(CUSTOM_THEME_STORAGE_KEY).catch(() => {});
  }, []);

  const applyCustomTheme = useCallback((next: CustomTheme) => {
    setCustomTheme(next);
    void SecureStore.setItemAsync(
      CUSTOM_THEME_STORAGE_KEY,
      JSON.stringify(next),
    ).catch(() => {});
  }, []);

  const clearCustomTheme = useCallback(() => {
    setCustomTheme(null);
    void SecureStore.deleteItemAsync(CUSTOM_THEME_STORAGE_KEY).catch(() => {});
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const resolved =
      mode === "system" ? (systemScheme === "light" ? "light" : "dark") : mode;
    return {
      theme: customTheme
        ? themeFromCustomTheme(customTheme)
        : resolved === "light"
          ? lightTheme
          : darkTheme,
      mode,
      setMode,
      customTheme,
      applyCustomTheme,
      clearCustomTheme,
    };
  }, [applyCustomTheme, clearCustomTheme, customTheme, mode, setMode, systemScheme]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used inside ThemeProvider.");
  }
  return value;
}
