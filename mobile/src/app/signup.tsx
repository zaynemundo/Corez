import { useState } from "react";
import { Redirect, router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { AuthScaffold } from "@/components/AuthScaffold";
import { AuthField } from "@/components/AuthField";
import { AuthTabs } from "@/components/AuthTabs";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAuth } from "@/state/auth";
import { useTheme } from "@/state/theme";
import { useI18n } from "@/i18n";
import { friendlyError } from "@/lib/errors";
import { API_BASE_URL } from "@/api/client";

export default function SignupScreen() {
  const { status, busy, signUp } = useAuth();
  const { theme } = useTheme();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "signedIn") return <Redirect href="/chat" />;

  const submit = async () => {
    if (!email.trim() || !password) {
      setError(t("auth.errors.emailAndPassword"));
      return;
    }
    if (password !== confirm) {
      setError(t("auth.signup.passwordMismatch"));
      return;
    }
    if (!consent) {
      setError(t("auth.signup.consentError"));
      return;
    }
    setError(null);
    try {
      await signUp(email.trim(), password, {
        termsVersion: "2026-01",
        acceptedAt: Date.now(),
      });
    } catch (caught) {
      setError(friendlyError(caught));
    }
  };

  const openLegal = (path: string) => {
    void WebBrowser.openBrowserAsync(`${API_BASE_URL}${path}`).catch(() => {});
  };

  return (
    <AuthScaffold
      subtitle={t("auth.signup.subtitle")}
      tabs={
        <AuthTabs
          active="signup"
          onLogin={() => router.replace("/login")}
          onSignup={() => {}}
        />
      }
      legalNote={t("auth.signup.legalNote")}
      footer={
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${t("auth.signup.alreadyHaveAccount")} ${t("auth.common.login")}`}
          onPress={() => router.replace("/login")}
          style={styles.footerRow}
        >
          <Text style={{ color: theme.colors.textSecondary, fontSize: 13.5 }}>
            {t("auth.signup.alreadyHaveAccount")}{" "}
          </Text>
          <Text style={[styles.link, { color: theme.colors.textPrimary }]}>
            {t("auth.common.login")}
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
      />
      <AuthField
        label={t("auth.common.passwordLabel")}
        value={password}
        onChangeText={setPassword}
        placeholder={t("auth.common.passwordPlaceholder")}
        secure
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <AuthField
        label={t("auth.common.confirmPasswordLabel")}
        value={confirm}
        onChangeText={setConfirm}
        placeholder={t("auth.common.passwordPlaceholder")}
        secure
        autoComplete="new-password"
        textContentType="newPassword"
        onSubmitEditing={() => void submit()}
      />
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: consent }}
        accessibilityLabel={t("auth.signup.consentError")}
        onPress={() => setConsent((prev) => !prev)}
        style={styles.consentRow}
        hitSlop={6}
      >
        <View
          style={[
            styles.checkbox,
            {
              borderColor: theme.colors.borderHover,
              backgroundColor: consent
                ? theme.colors.textPrimary
                : "transparent",
            },
          ]}
        >
          {consent ? (
            <Text
              style={[
                styles.checkmark,
                { color: theme.colors.actionStrongContrast },
              ]}
            >
              âœ“
            </Text>
          ) : null}
        </View>
        <Text style={[styles.consentText, { color: theme.colors.textSecondary }]}>
          {t("auth.signup.consentIntro")}
          <Text
            style={[styles.link, { color: theme.colors.textPrimary }]}
            onPress={() => openLegal("/terms")}
          >
            {t("auth.signup.consentTerms")}
          </Text>
          {t("auth.signup.consentAnd")}
          <Text
            style={[styles.link, { color: theme.colors.textPrimary }]}
            onPress={() => openLegal("/privacy")}
          >
            {t("auth.signup.consentPrivacy")}
          </Text>
          {t("auth.signup.consentEnd")}
        </Text>
      </Pressable>
      {error ? (
        <Text
          style={[styles.error, { color: theme.colors.negative }]}
          accessibilityRole="alert"
        >
          {error}
        </Text>
      ) : null}
      <PrimaryButton
        label={busy ? t("auth.common.pleaseWait") : t("auth.signup.submit")}
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
  consentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkmark: { fontSize: 12, fontWeight: "700" },
  consentText: { flex: 1, fontSize: 12, lineHeight: 18 },
  error: { fontSize: 13, lineHeight: 19 },
});
