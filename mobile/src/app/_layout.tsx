import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  useFonts as useOutfitFonts,
} from "@expo-google-fonts/outfit";
import {
  JetBrainsMono_400Regular,
  useFonts as useMonoFonts,
} from "@expo-google-fonts/jetbrains-mono";
import { ThemeProvider, useTheme } from "@/state/theme";
import { I18nProvider } from "@/i18n";
import { AuthProvider } from "@/state/auth";

// Keep the native splash visible until fonts are ready so the first frame is
// never a flash of unstyled text.
void SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

function RootNavigator() {
  const { theme } = useTheme();
  return (
    <>
      <StatusBar style={theme.mode === "light" ? "dark" : "light"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.bgPrimary },
          animation: "fade",
        }}
      />
    </>
  );
}

export default function RootLayout() {
  const [outfitLoaded, outfitError] = useOutfitFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
  });
  const [monoLoaded, monoError] = useMonoFonts({
    JetBrainsMono_400Regular,
  });

  const ready = (outfitLoaded || outfitError) && (monoLoaded || monoError);

  useEffect(() => {
    if (ready) {
      void SplashScreen.hideAsync().catch(() => {});
    }
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <I18nProvider>
            <AuthProvider>
              <QueryClientProvider client={queryClient}>
                <RootNavigator />
              </QueryClientProvider>
            </AuthProvider>
          </I18nProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
