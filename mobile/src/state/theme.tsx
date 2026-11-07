/**
 * Theme provider.
 *
 * Resolves `system | dark | light` into the dark/light token sets from
 * `tokens.ts`. The choice is stored in SecureStore for the same reason the
 * language is: it must survive restarts and it is not sensitive.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

const THEME_STORAGE_KEY = "corez_theme";

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const stored = await SecureStore.getItemAsync(THEME_STORAGE_KEY);
        if (
          mounted &&
          (stored === "dark" || stored === "light" || stored === "system")
        ) {
          setModeState(stored);
        }
      } catch {
        // System default remains.
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void SecureStore.setItemAsync(THEME_STORAGE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const resolved =
      mode === "system" ? (systemScheme === "light" ? "light" : "dark") : mode;
    return {
      theme: resolved === "light" ? lightTheme : darkTheme,
      mode,
      setMode,
    };
  }, [mode, setMode, systemScheme]);

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
