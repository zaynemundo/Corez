import { useState } from "react";
import { Link, Redirect } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { AuthScaffold } from "@/components/AuthScaffold";
import { AuthField } from "@/components/AuthField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAuth } from "@/state/auth";
import { useTheme } from "@/state/theme";
import { useI18n } from "@/i18n";
import { friendlyError } from "@/lib/errors";

export default function LoginScreen() {
  const { status, busy, signIn } = useAuth();
  const { theme } = useTheme();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (status === "signedIn") return <Redirect href="/chat" />;

  const submit = async () => {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setError(null);
    try {
      await signIn(email, password);
    } catch (caught) {
      setError(friendlyError(caught));
    }
  };

  return (
    <AuthScaffold
      title={t("auth.login.subtitle")}
      footer={
        <View style={styles.footerRow}>
          <Text style={{ color: theme.colors.textSecondary, fontSize: 13.5 }}>
            {t("auth.login.noAccount")}{" "}
          </Text>
          <Link href="/signup" asChild>
            <Text
              style={[styles.link, { color: theme.colors.textPrimary }]}
              accessibilityRole="link"
            >
              {t("auth.login.signUpLink")}
            </Text>
          </Link>
        </View>
      }
    >
      <AuthField
        label={t("auth.common.emailLabel")}
        value={email}
        onChangeText={setEmail}
        placeholder={t("auth.common.emailPlaceholder")}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
      />
      <AuthField
        label={t("auth.common.passwordLabel")}
        value={password}
        onChangeText={setPassword}
        placeholder={t("auth.common.passwordPlaceholder")}
        secure
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
      />
      {error ? (
        <Text
          style={[styles.error, { color: theme.colors.negative }]}
          accessibilityRole="alert"
        >
          {error}
        </Text>
      ) : null}
      <PrimaryButton
        label={busy ? t("auth.common.pleaseWait") : t("auth.common.login")}
        busy={busy}
        onPress={() => void submit()}
      />
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
  },
  link: {
    fontSize: 13.5,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  error: {
    fontSize: 13,
    lineHeight: 19,
  },
});
