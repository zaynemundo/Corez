import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { ImageBackground, StyleSheet, View } from "react-native";
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
import { useAuth } from "@/state/auth";
import { hasThemeArtwork, themeWallpaperBase } from "@/theme/customTheme";
import {
  resolveThemeArtwork,
  themeArtworkRemote,
  type ThemeArtwork,
} from "@/theme/artwork";
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
  const { theme, customTheme } = useTheme();
  const { status } = useAuth();
  const [artwork, setArtwork] = useState<ThemeArtwork | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!hasThemeArtwork(customTheme)) {
      return () => {
        cancelled = true;
      };
    }
    void resolveThemeArtwork(customTheme).then((next) => {
      if (!cancelled) setArtwork(next);
    });
    return () => {
      cancelled = true;
    };
    // Re-run once the session token exists so protected artwork can download.
  }, [customTheme, status]);

  const currentRemote = themeArtworkRemote(customTheme);
  const activeArtwork =
    artwork && currentRemote && artwork.remote === currentRemote
      ? artwork
      : null;
  const baseColor = themeWallpaperBase(customTheme, theme.colors.bgPrimary);
  const navigator = (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "transparent" },
        animation: "fade",
      }}
    />
  );

  return (
    <>
      <StatusBar style={theme.mode === "light" ? "dark" : "light"} />
      <View style={[styles.root, { backgroundColor: baseColor }]}>
        {activeArtwork ? (
          <ImageBackground
            source={{ uri: activeArtwork.uri }}
            style={styles.root}
            resizeMode="cover"
          >
            <View
              style={[styles.scrim, { backgroundColor: activeArtwork.scrim }]}
            />
            {navigator}
          </ImageBackground>
        ) : (
          navigator
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrim: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
});

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
