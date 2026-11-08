/**
 * Shared chrome for the sign-in, sign-up and reset screens.
 *
 * Mirrors the web auth page: a blurred background photograph, a centred surface
 * card, the COREZ wordmark with its subtitle, the Login/Sign Up tabs, and the
 * policy note/links that stay reachable from every auth mode.
 */
import type { ReactNode } from "react";
import {
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_BASE_URL } from "@/api/client";
import { useTheme } from "@/state/theme";
import { useI18n } from "@/i18n";

interface AuthScaffoldProps {
  /** The line under the COREZ wordmark, e.g. "Sign in to your account". */
  subtitle: string;
  tabs?: ReactNode;
  children: ReactNode;
  legalNote?: string;
  footer?: ReactNode;
}

const LEGAL_LINKS = [
  { path: "/privacy", key: "auth.common.privacyPolicy" },
  { path: "/terms", key: "auth.common.terms" },
  { path: "/cookies", key: "auth.common.cookies" },
  { path: "/refunds", key: "auth.common.refunds" },
  { path: "/cookies", key: "auth.common.cookieSettings" },
] as const;

function openLegal(path: string): void {
  void WebBrowser.openBrowserAsync(`${API_BASE_URL}${path}`).catch(() => {});
}

export function AuthScaffold({
  subtitle,
  tabs,
  children,
  legalNote,
  footer,
}: AuthScaffoldProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const colors = theme.colors;
  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.bgPrimary }]}
      edges={["top", "bottom"]}
    >
      <ImageBackground
        source={require("../../assets/auth-bg.jpeg")}
        style={styles.background}
        resizeMode="cover"
        blurRadius={7}
      >
        <View style={styles.overlay} />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.bgSecondary,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.logoWrap}>
                <Image
                  source={require("../../assets/android-icon-foreground.png")}
                  style={styles.logoMark}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                />
                <Text
                  style={[styles.wordmark, { color: colors.textPrimary }]}
                  accessibilityRole="header"
                >
                  COREZ
                </Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  {subtitle}
                </Text>
              </View>

              {tabs ? <View style={styles.tabs}>{tabs}</View> : null}

              <View style={styles.form}>{children}</View>

              {legalNote ? (
                <Text style={[styles.legalNote, { color: colors.textMuted }]}>
                  {legalNote}
                </Text>
              ) : null}

              <View
                style={styles.legalLinks}
                accessibilityLabel={t("auth.common.policiesNav")}
              >
                {LEGAL_LINKS.map((link) => (
                  <Pressable
                    key={`${link.path}-${link.key}`}
                    accessibilityRole="link"
                    accessibilityLabel={t(link.key)}
                    onPress={() => openLegal(link.path)}
                    hitSlop={6}
                  >
                    <Text
                      style={[styles.legalLink, { color: colors.textMuted }]}
                    >
                      {t(link.key)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {footer ? <View style={styles.footer}>{footer}</View> : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </ImageBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  background: { flex: 1 },
  flex: { flex: 1 },
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0, 0, 0, 0.42)",
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    padding: 24,
  },
  logoWrap: { alignItems: "center", marginBottom: 22 },
  logoMark: {
    width: 58,
    height: 58,
    marginBottom: 14,
  },
  wordmark: {
    fontFamily: "Outfit_700Bold",
    fontSize: 26,
    letterSpacing: 8,
  },
  subtitle: {
    marginTop: 9,
    fontSize: 14,
    textAlign: "center",
  },
  tabs: { marginBottom: 20 },
  form: { gap: 16 },
  legalNote: {
    marginTop: 18,
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: "center",
  },
  legalLinks: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 14,
  },
  legalLink: {
    fontSize: 12.5,
    textDecorationLine: "underline",
  },
  footer: {
    marginTop: 20,
    alignItems: "center",
  },
});
