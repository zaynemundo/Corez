import { useState } from "react";
import { Redirect, router } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import { AuthScaffold } from "@/components/AuthScaffold";
import { AuthField } from "@/components/AuthField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { forgotPassword } from "@/api/auth";
import { useAuth } from "@/state/auth";
import { useTheme } from "@/state/theme";
import { useI18n } from "@/i18n";
import { friendlyError } from "@/lib/errors";

export default function ForgotScreen() {
  const { status } = useAuth();
  const { theme } = useTheme();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (status === "signedIn") return <Redirect href="/chat" />;

  const submit = async () => {
    if (!email.trim()) {
      setError(t("auth.forgot.emailRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    setSent(null);
    try {
      const result = await forgotPassword(email);
      setSent(result.message || t("auth.forgot.sent"));
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScaffold
      subtitle={t("auth.forgot.subtitle")}
      legalNote={t("auth.login.legalNote")}
      footer={
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${t("auth.forgot.remembered")} ${t("auth.common.backToLogin")}`}
          onPress={() => router.replace("/login")}
          style={styles.footerRow}
        >
          <Text style={{ color: theme.colors.textSecondary, fontSize: 13.5 }}>
            {t("auth.forgot.remembered")}{" "}
          </Text>
          <Text style={[styles.link, { color: theme.colors.textPrimary }]}>
            {t("auth.common.backToLogin")}
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
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
      />
      {sent ? (
        <Text accessibilityRole="alert" style={[styles.notice, { color: theme.colors.positive }]}>
          {sent}
        </Text>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: theme.colors.negative }]}>
          {error}
        </Text>
      ) : null}
      <PrimaryButton
        label={busy ? t("auth.common.pleaseWait") : t("auth.forgot.submit")}
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
  notice: { fontSize: 12.5, lineHeight: 18 },
  error: { fontSize: 13, lineHeight: 19 },
});
