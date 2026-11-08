import { useState } from "react";
import { Redirect, router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AuthScaffold } from "@/components/AuthScaffold";
import { AuthField } from "@/components/AuthField";
import { AuthTabs } from "@/components/AuthTabs";
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
      setError(t("auth.errors.emailAndPassword"));
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
      subtitle={t("auth.login.subtitle")}
      tabs={
        <AuthTabs
          active="login"
          onLogin={() => {}}
          onSignup={() => router.push("/signup")}
        />
      }
      legalNote={t("auth.login.legalNote")}
      footer={
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${t("auth.login.noAccount")} ${t("auth.login.signUpLink")}`}
          onPress={() => router.push("/signup")}
          style={styles.footerRow}
        >
          <Text style={{ color: theme.colors.textSecondary, fontSize: 13.5 }}>
            {t("auth.login.noAccount")}{" "}
          </Text>
          <Text style={[styles.link, { color: theme.colors.textPrimary }]}>
            {t("auth.login.signUpLink")}
          </Text>
        </Pressable>
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
      <View style={styles.forgotRow}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t("auth.login.forgotPassword")}
          onPress={() => router.push("/forgot")}
          hitSlop={8}
        >
          <Text style={[styles.forgot, { color: theme.colors.textSecondary }]}>
            {t("auth.login.forgotPassword")}
          </Text>
        </Pressable>
      </View>
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
    fontSize: 13,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  forgotRow: { alignItems: "flex-end", marginTop: -4 },
  forgot: {
    fontSize: 12,
    textDecorationLine: "underline",
  },
  error: {
    fontSize: 13,
    lineHeight: 19,
  },
});
