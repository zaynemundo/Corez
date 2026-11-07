/**
 * Shared chrome for the sign-in, sign-up and reset screens: brand wordmark,
 * keyboard-safe centred card and the monochrome field styling from the web.
 */
import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/state/theme";

interface AuthScaffoldProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthScaffold({
  title,
  subtitle,
  children,
  footer,
}: AuthScaffoldProps) {
  const { theme } = useTheme();
  const colors = theme.colors;
  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.bgPrimary }]}
      edges={["top", "bottom"]}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <Text
              style={[styles.brand, { color: colors.textPrimary }]}
              accessibilityRole="header"
            >
              COREZ
            </Text>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {subtitle}
              </Text>
            ) : null}
            <View style={styles.form}>{children}</View>
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
  },
  brand: {
    fontFamily: "Outfit_700Bold",
    fontSize: 18,
    letterSpacing: 6,
    marginBottom: 28,
  },
  title: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 26,
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 4,
  },
  form: {
    marginTop: 22,
    gap: 14,
  },
  footer: {
    marginTop: 22,
    alignItems: "center",
  },
});
