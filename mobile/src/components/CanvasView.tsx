/**
 * In-app preview canvas for generated HTML pages and games.
 *
 * The web renders artifacts in a sandboxed iframe; React Native has no DOM, so
 * the artifact is rendered in a WebView. The source stays native: Copy and
 * Share/Save act on the HTML string, never on the sandboxed page.
 */
import { useContext, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { useTheme } from "@/state/theme";
import { useI18n } from "@/i18n";
import { artifactFileName } from "@/lib/artifacts";
import { copyText, shareTextFile } from "@/lib/downloads";

interface CanvasViewProps {
  html: string | null;
  onClose: () => void;
}

export function CanvasView({ html, onClose }: CanvasViewProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const colors = theme.colors;
  const insets = useContext(SafeAreaInsetsContext) ?? {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  };
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  if (!html) return null;

  const copy = async () => {
    const ok = await copyText(html);
    setStatus(ok ? t("canvas.copied") : t("canvas.failed"));
  };

  const share = async () => {
    setBusy(true);
    setStatus(null);
    const ok = await shareTextFile({
      content: html,
      fileName: artifactFileName(html),
      mimeType: "text/html",
      dialogTitle: t("canvas.shareFile"),
    });
    setBusy(false);
    if (!ok) setStatus(t("canvas.failed"));
  };

  return (
    <Modal
      visible
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        style={[
          styles.screen,
          { backgroundColor: colors.bgPrimary, paddingTop: insets.top },
        ]}
      >
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {t("canvas.previewTitle")}
          </Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("canvas.copy")}
              onPress={() => void copy()}
              hitSlop={8}
              style={styles.action}
            >
              <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>
                {t("canvas.copy")}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("canvas.shareFile")}
              disabled={busy}
              onPress={() => void share()}
              hitSlop={8}
              style={styles.action}
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : (
                <Text
                  style={[styles.actionLabel, { color: colors.textSecondary }]}
                >
                  {t("canvas.shareFile")}
                </Text>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.action.close")}
              onPress={onClose}
              hitSlop={10}
              style={styles.action}
            >
              <Text style={[styles.closeGlyph, { color: colors.textPrimary }]}>
                ×
              </Text>
            </Pressable>
          </View>
        </View>

        {status ? (
          <Text
            accessibilityRole="alert"
            style={[styles.status, { color: colors.caution }]}
          >
            {status}
          </Text>
        ) : null}

        <View style={styles.webviewWrap}>
          <WebView
            source={{ html }}
            originWhitelist={["*"]}
            javaScriptEnabled
            domStorageEnabled
            setSupportMultipleWindows={false}
            allowFileAccess={false}
            mixedContentMode="never"
            thirdPartyCookiesEnabled={false}
            sharedCookiesEnabled={false}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setStatus(t("canvas.renderError"));
            }}
            onShouldStartLoadWithRequest={(request) => {
              // Keep the artifact inside the canvas; open real navigations in
              // the system browser instead.
              if (/^https?:/i.test(request.url)) {
                void Linking.openURL(request.url).catch(() => {});
                return false;
              }
              return true;
            }}
            style={{ backgroundColor: colors.bgPrimary }}
          />
          {loading ? (
            <View
              style={[
                styles.loading,
                { backgroundColor: colors.bgPrimary },
              ]}
              pointerEvents="none"
            >
              <ActivityIndicator color={colors.textSecondary} />
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  title: { flex: 1, fontFamily: "Outfit_600SemiBold", fontSize: 16 },
  actions: { flexDirection: "row", alignItems: "center", gap: 12 },
  action: { minHeight: 36, minWidth: 36, justifyContent: "center" },
  actionLabel: { fontSize: 12.5, fontWeight: "600" },
  closeGlyph: { fontSize: 24, lineHeight: 26 },
  status: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    fontSize: 12.5,
  },
  webviewWrap: { flex: 1 },
  loading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
