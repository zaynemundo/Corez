/**
 * Login / Sign Up segmented tabs, matching the web auth card.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/state/theme";
import { useI18n } from "@/i18n";

export function AuthTabs({
  active,
  onLogin,
  onSignup,
}: {
  active: "login" | "signup";
  onLogin: () => void;
  onSignup: () => void;
}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const colors = theme.colors;

  const renderTab = (
    key: "login" | "signup",
    label: string,
    onPress: () => void,
  ) => {
    const selected = active === key;
    return (
      <Pressable
        key={key}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        accessibilityLabel={label}
        onPress={onPress}
        style={[
          styles.tab,
          {
            borderColor: selected ? colors.actionStrong : colors.border,
            backgroundColor: selected ? colors.actionStrong : "transparent",
          },
        ]}
      >
        <Text
          style={[
            styles.label,
            {
              color: selected
                ? colors.actionStrongContrast
                : colors.textSecondary,
            },
          ]}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.row} accessibilityRole="tablist">
      {renderTab("login", t("auth.common.login"), onLogin)}
      {renderTab("signup", t("auth.common.signUpTab"), onSignup)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10 },
  tab: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontSize: 14.5, fontWeight: "600" },
});
