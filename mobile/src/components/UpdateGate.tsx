/**
 * Update gate for sideloaded Android builds.
 *
 * The APK is distributed from corez.pro/download, not a store, so Android never
 * updates it by itself. On launch (and when the app returns to the foreground)
 * the client compares its embedded versionCode with the Worker's published
 * metadata; when a newer build exists it replaces the app with a short update
 * screen before the user enters. Offline/failed checks never block entry, and
 * "Continue with this version" dismisses the gate for the session.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  AppState,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  checkForAppUpdate,
  installedVersion,
  type AppUpdateInfo,
} from "@/api/appUpdate";
import { useTheme } from "@/state/theme";
import { useI18n } from "@/i18n";

export function UpdateGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const colors = theme.colors;
  const [latest, setLatest] = useState<AppUpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const check = useCallback(async () => {
    if (Platform.OS !== "android") return;
    try {
      const result = await checkForAppUpdate();
      if (result.updateAvailable && result.latest) {
        setLatest(result.latest);
      }
    } catch {
      // Offline or a Worker hiccup must never block the app.
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void check();
    }, 0);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void check();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [check]);

  if (!latest || dismissed) return <>{children}</>;
  const installed = installedVersion();

  return (
    <View style={[styles.screen, { backgroundColor: colors.bgPrimary }]}>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.bgSecondary, borderColor: colors.border },
        ]}
      >
        <Image
          source={require("../../assets/android-icon-foreground.png")}
          style={styles.mark}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {t("update.title")}
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          {t("update.body")}
        </Text>

        <View style={styles.metaRow}>
          <View style={[styles.pill, { backgroundColor: colors.bgTertiary }]}>
            <Text style={[styles.pillText, { color: colors.textMuted }]}>
              {installed.name}
            </Text>
          </View>
          <Feather name="arrow-right" size={14} color={colors.textMuted} />
          <View style={[styles.pill, { backgroundColor: colors.bgTertiary }]}>
            <Text style={[styles.pillText, { color: colors.textPrimary }]}>
              {latest.versionName}
            </Text>
          </View>
        </View>

        {latest.notes ? (
          <Text style={[styles.notes, { color: colors.textMuted }]}>
            {latest.notes}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("update.now")}
          onPress={() => {
            void Linking.openURL(latest.pageUrl).catch(() => {});
          }}
          style={({ pressed }) => [
            styles.primary,
            {
              backgroundColor: colors.actionStrong,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Feather
            name="download"
            size={16}
            color={colors.actionStrongContrast}
          />
          <Text
            style={[
              styles.primaryLabel,
              { color: colors.actionStrongContrast },
            ]}
          >
            {t("update.now")}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("update.later")}
          onPress={() => setDismissed(true)}
          style={styles.later}
        >
          <Text style={[styles.laterText, { color: colors.textMuted }]}>
            {t("update.later")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    padding: 26,
    gap: 12,
  },
  mark: { width: 54, height: 54, marginBottom: 4 },
  title: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 22,
    textAlign: "center",
  },
  body: {
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: "center",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  pill: {
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: { fontSize: 11.5, fontWeight: "600" },
  notes: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  primary: {
    alignSelf: "stretch",
    flexDirection: "row",
    gap: 8,
    minHeight: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  primaryLabel: { fontSize: 15, fontWeight: "600" },
  later: { paddingVertical: 8 },
  laterText: { fontSize: 12.5 },
});
