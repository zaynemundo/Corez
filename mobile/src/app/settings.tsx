/**
 * Settings: appearance, language, account and sign-out.
 *
 * Phase 1 grows this into the full settings modal; the structure already
 * matches the web's (General / Appearance / Account).
 */
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { SessionGate } from "@/components/SessionGate";
import { useAuth } from "@/state/auth";
import { useTheme } from "@/state/theme";
import { useI18n, type LanguageId } from "@/i18n";
import type { ThemeMode } from "@/theme/tokens";

export default function SettingsScreen() {
  return (
    <SessionGate>
      <SettingsView />
    </SessionGate>
  );
}

function SettingsView() {
  const { user, signOut, busy } = useAuth();
  const { theme, mode, setMode } = useTheme();
  const { t, language, setLanguage, isRTL } = useI18n();
  const colors = theme.colors;

  const themeModes: { id: ThemeMode; label: string }[] = [
    { id: "system", label: t("settings.theme.system") },
    { id: "dark", label: t("settings.theme.dark") },
    { id: "light", label: t("settings.theme.light") },
  ];

  const languages: { id: LanguageId; label: string }[] = [
    { id: "en", label: "English" },
    { id: "ar", label: "العربية" },
  ];

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.bgPrimary }]}
      edges={["top", "bottom"]}
    >
      <View
        style={[styles.header, { borderBottomColor: colors.border }]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/chat"))}
          hitSlop={12}
          style={styles.backButton}
        >
          <Text style={{ color: colors.textPrimary, fontSize: 22 }}>‹</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {t("shell.settings")}
        </Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Section title="Account">
          <Text style={[styles.value, { color: colors.textPrimary }]}>
            {user?.email || "—"}
          </Text>
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            {user?.plan ? `Plan: ${user.plan}` : ""}
          </Text>
        </Section>

        <Section title={t("settings.theme")}>
          <View style={styles.options}>
            {themeModes.map((entry) => {
              const active = mode === entry.id;
              return (
                <Pressable
                  key={entry.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => setMode(entry.id)}
                  style={[
                    styles.option,
                    {
                      borderColor: active ? colors.textPrimary : colors.border,
                      backgroundColor: active
                        ? colors.bgTertiary
                        : colors.bgSecondary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.optionLabel,
                      { color: active ? colors.textPrimary : colors.textSecondary },
                    ]}
                  >
                    {entry.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section title={t("settings.language")}>
          <View style={styles.options}>
            {languages.map((entry) => {
              const active = language === entry.id;
              return (
                <Pressable
                  key={entry.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => setLanguage(entry.id)}
                  style={[
                    styles.option,
                    {
                      borderColor: active ? colors.textPrimary : colors.border,
                      backgroundColor: active
                        ? colors.bgTertiary
                        : colors.bgSecondary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.optionLabel,
                      { color: active ? colors.textPrimary : colors.textSecondary },
                    ]}
                  >
                    {entry.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            {language === "ar" && !isRTL
              ? "Restart the app to finish switching to right-to-left layout."
              : "Arabic switches the interface to right-to-left."}
          </Text>
        </Section>

        <Section title="About">
          <Text style={[styles.value, { color: colors.textPrimary }]}>
            Corez {Constants.expoConfig?.version ?? "0.1.0"}
          </Text>
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            React Native client · same account as corez.pro
          </Text>
        </Section>

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void signOut()}
          style={({ pressed }) => [
            styles.signOut,
            {
              borderColor: colors.border,
              backgroundColor: colors.bgSecondary,
              opacity: pressed || busy ? 0.7 : 1,
            },
          ]}
        >
          <Text style={[styles.signOutLabel, { color: colors.negative }]}>
            {t("settings.signOut")}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>
        {title}
      </Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 17,
  },
  content: {
    padding: 18,
    gap: 22,
    paddingBottom: 40,
  },
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.06,
    textTransform: "uppercase",
  },
  sectionBody: { gap: 8 },
  value: { fontSize: 14.5 },
  hint: { fontSize: 12.5, lineHeight: 18 },
  options: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  option: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    minHeight: 44,
    justifyContent: "center",
  },
  optionLabel: { fontSize: 13.5 },
  signOut: {
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  signOutLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
});
