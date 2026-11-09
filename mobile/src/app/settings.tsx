/**
 * Settings: appearance, language, account and sign-out.
 *
 * Phase 1 grows this into the full settings modal; the structure already
 * matches the web's (General / Appearance / Account).
 */
import { useEffect, useMemo } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import { SessionGate } from "@/components/SessionGate";
import { deleteTheme, listThemes, type CustomTheme } from "@/api/themes";
import { friendlyError } from "@/lib/errors";
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
  const { theme, mode, setMode, customTheme, applyCustomTheme, clearCustomTheme } =
    useTheme();
  const { t, language, setLanguage, isRTL } = useI18n();
  const colors = theme.colors;
  const queryClient = useQueryClient();

  const themesQuery = useQuery({
    queryKey: ["themes"],
    queryFn: listThemes,
    staleTime: 60_000,
    retry: 1,
  });
  const customThemes: CustomTheme[] = useMemo(
    () => themesQuery.data?.themes ?? [],
    [themesQuery.data],
  );

  useEffect(() => {
    // A theme deleted on another device must not stay painted here.
    if (
      customTheme &&
      themesQuery.isSuccess &&
      !customThemes.some((entry) => entry.id === customTheme.id)
    ) {
      clearCustomTheme();
    }
  }, [clearCustomTheme, customTheme, customThemes, themesQuery.isSuccess]);

  const deleteThemeMutation = useMutation({
    mutationFn: (id: string) => deleteTheme(id),
    onSuccess: async (_result, id) => {
      if (customTheme?.id === id) clearCustomTheme();
      await queryClient.invalidateQueries({ queryKey: ["themes"] });
    },
    onError: (error) =>
      Alert.alert(t("settings.customThemes"), friendlyError(error)),
  });

  const confirmDeleteTheme = (entry: CustomTheme) => {
    Alert.alert(t("settings.themeDeleteTitle"), t("settings.themeDeleteBody"), [
      { text: t("common.action.cancel"), style: "cancel" },
      {
        text: t("settings.themeDelete"),
        style: "destructive",
        onPress: () => deleteThemeMutation.mutate(entry.id),
      },
    ]);
  };

  const applySavedTheme = (entry: CustomTheme) => {
    if (customTheme?.id === entry.id) return;
    applyCustomTheme(entry);
  };

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
      style={styles.safe}
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
          <Feather name="chevron-left" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {t("shell.settings")}
        </Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View
          style={[
            styles.profileCard,
            { backgroundColor: colors.bgCard, borderColor: colors.border },
          ]}
        >
          <View
            style={[styles.profileAvatar, { backgroundColor: colors.bgTertiary }]}
          >
            <Text style={[styles.profileInitial, { color: colors.textPrimary }]}>
              {(user?.email || "C").charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileText}>
            <Text
              numberOfLines={1}
              style={[styles.profileEmail, { color: colors.textPrimary }]}
            >
              {user?.email || "—"}
            </Text>
            {user?.plan ? (
              <View style={[styles.planPill, { backgroundColor: colors.bgTertiary }]}>
                <Text style={[styles.planPillText, { color: colors.textSecondary }]}>
                  {user.plan.toUpperCase()}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/image")}
          style={({ pressed }) => [
            styles.sitesRow,
            {
              backgroundColor: colors.bgSecondary,
              borderColor: colors.border,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
        >
          <View style={[styles.rowIcon, { backgroundColor: colors.bgTertiary }]}>
            <Feather name="image" size={17} color={colors.textPrimary} />
          </View>
          <Text style={[styles.sitesRowLabel, { color: colors.textPrimary }]}>
            {t("image.title")}
          </Text>
          <Feather name="chevron-right" size={18} color={colors.textMuted} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/sites")}
          style={({ pressed }) => [
            styles.sitesRow,
            {
              backgroundColor: colors.bgSecondary,
              borderColor: colors.border,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
        >
          <View style={[styles.rowIcon, { backgroundColor: colors.bgTertiary }]}>
            <Feather name="globe" size={17} color={colors.textPrimary} />
          </View>
          <Text style={[styles.sitesRowLabel, { color: colors.textPrimary }]}>
            {t("sites.title")}
          </Text>
          <Feather name="chevron-right" size={18} color={colors.textMuted} />
        </Pressable>

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

        <Section title={t("settings.customThemes")}>
          {themesQuery.isLoading ? (
            <View style={styles.themeLoading}>
              <ActivityIndicator size="small" color={colors.textSecondary} />
            </View>
          ) : themesQuery.isError ? (
            <Text style={[styles.hint, { color: colors.textMuted, textAlign: "left" }]}>
              {t("settings.themeLoadFailed")}
            </Text>
          ) : customThemes.length === 0 ? (
            <Text style={[styles.hint, { color: colors.textMuted, textAlign: "left" }]}>
              {t("settings.customThemesHint")}
            </Text>
          ) : (
            customThemes.map((entry) => {
              const active = customTheme?.id === entry.id;
              return (
                <View
                  key={entry.id}
                  style={[
                    styles.customThemeRow,
                    {
                      borderColor: active ? colors.textPrimary : colors.border,
                      backgroundColor: active
                        ? colors.bgTertiary
                        : colors.bgSecondary,
                    },
                  ]}
                >
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={entry.name}
                    onPress={() => applySavedTheme(entry)}
                    style={styles.customThemeMain}
                  >
                    <View style={styles.customThemeSwatches}>
                      {(
                        ["background", "surface", "text", "muted", "border"] as const
                      ).map((key) => (
                        <View
                          key={key}
                          style={[
                            styles.miniSwatch,
                            {
                              backgroundColor: entry.palette?.[key],
                              borderColor: colors.border,
                            },
                          ]}
                        />
                      ))}
                    </View>
                    <Text
                      numberOfLines={1}
                      style={[styles.optionLabel, { color: colors.textPrimary }]}
                    >
                      {entry.name}
                    </Text>
                    {active ? (
                      <Feather name="check" size={16} color={colors.positive} />
                    ) : null}
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t("settings.themeDelete")} ${entry.name}`}
                    onPress={() => confirmDeleteTheme(entry)}
                    hitSlop={8}
                    style={styles.themeDelete}
                  >
                    {deleteThemeMutation.isPending &&
                    deleteThemeMutation.variables === entry.id ? (
                      <ActivityIndicator size="small" color={colors.textMuted} />
                    ) : (
                      <Feather name="trash-2" size={16} color={colors.textMuted} />
                    )}
                  </Pressable>
                </View>
              );
            })
          )}
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
          <Feather name="log-out" size={16} color={colors.negative} />
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
  sitesRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    minHeight: 58,
    paddingHorizontal: 14,
    gap: 12,
  },
  sitesRowLabel: { flex: 1, fontSize: 14.5, fontWeight: "600" },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 14,
  },
  profileAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  profileInitial: { fontSize: 18, fontWeight: "700" },
  profileText: { flex: 1, gap: 6, minWidth: 0 },
  profileEmail: { fontSize: 14.5, fontWeight: "600" },
  planPill: {
    alignSelf: "flex-start",
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  planPillText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8 },
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
  themeLoading: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  customThemeRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 52,
    paddingLeft: 12,
  },
  customThemeMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 52,
  },
  customThemeSwatches: {
    flexDirection: "row",
    gap: 2,
  },
  miniSwatch: {
    width: 12,
    height: 22,
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
  },
  themeDelete: {
    width: 52,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  signOut: {
    flexDirection: "row",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  signOutLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
});
