/**
 * Full-screen session states: the boot spinner and the "could not check"
 * screen. Both are deliberately honest: a failed check is not the same thing
 * as being signed out, so the app offers a retry instead of showing the login
 * form to a user whose token may still be valid.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/state/theme";
import { useI18n } from "@/i18n";

export function SessionLoadingScreen() {
  const { theme } = useTheme();
  const { t } = useI18n();
  return (
    <View
      style={[styles.screen, { backgroundColor: theme.colors.bgPrimary }]}
      accessibilityRole="progressbar"
    >
      <ActivityIndicator color={theme.colors.textSecondary} />
      <Text style={[styles.body, { color: theme.colors.textSecondary }]}>
        {t("common.status.loadingCorez")}
      </Text>
    </View>
  );
}

export function SessionFailedScreen({ onRetry }: { onRetry: () => void }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const colors = theme.colors;
  return (
    <View style={[styles.screen, { backgroundColor: colors.bgPrimary }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        {t("common.status.sessionFailedTitle")}
      </Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        {t("common.status.sessionFailedBody")}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [
          styles.button,
          {
            borderColor: colors.textPrimary,
            backgroundColor: colors.textPrimary,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <Text
          style={[styles.buttonLabel, { color: colors.actionStrongContrast }]}
        >
          {t("common.action.retry")}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    maxWidth: 320,
  },
  button: {
    marginTop: 8,
    minHeight: 42,
    paddingHorizontal: 22,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  buttonLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
});
