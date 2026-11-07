import { useState } from "react";
import { Link, Redirect } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { AuthScaffold } from "@/components/AuthScaffold";
import { AuthField } from "@/components/AuthField";
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
      setError("Enter your email and password.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (!consent) {
      setError(t("auth.signup.consentError"));
      return;
    }
    setError(null);
    try {
      await signUp(email, password, {
        termsVersion: "native-2026-11",
        acceptedAt: Date.now(),
        marketingConsent: false,
      });
    } catch (caught) {
      setError(friendlyError(caught));
    }
  };

  return (
    <AuthScaffold
      title={t("auth.signup.subtitle")}
      footer={
        <View style={styles.footerRow}>
          <Text style={{ color: theme.colors.textSecondary, fontSize: 13.5 }}>
            {t("auth.signup.alreadyHaveAccount")}{" "}
          </Text>
          <Link href="/login" asChild>
            <Text
              style={[styles.link, { color: theme.colors.textPrimary }]}
              accessibilityRole="link"
            >
              {t("auth.common.login")}
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
        label="Confirm password"
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
              ✓
            </Text>
          ) : null}
        </View>
        <Text style={[styles.consentText, { color: theme.colors.textSecondary }]}>
          I am 16 or older and I accept the{" "}
          <Text
            style={[styles.link, { color: theme.colors.textPrimary }]}
            onPress={() => void WebBrowser.openBrowserAsync(`${API_BASE_URL}/terms`)}
          >
            Terms and Conditions
          </Text>{" "}
          and the{" "}
          <Text
            style={[styles.link, { color: theme.colors.textPrimary }]}
            onPress={() => void WebBrowser.openBrowserAsync(`${API_BASE_URL}/privacy`)}
          >
            Privacy Policy
          </Text>
          .
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
    fontSize: 13.5,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  error: {
    fontSize: 13,
    lineHeight: 19,
  },
  consentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 2,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkmark: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700",
  },
  consentText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 19,
  },
});
