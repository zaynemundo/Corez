/**
 * Fullscreen image viewer for markdown answers and generated artwork.
 *
 * Provides the two actions the web's image viewer has: native share/save via
 * the share sheet, and copy the absolute image URL.
 */
import { useContext, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { useTheme } from "@/state/theme";
import { useI18n } from "@/i18n";
import { resolveAssetUrl } from "@/lib/urls";
import { copyImageLink, shareImage } from "@/lib/imageShare";

interface ImageFullscreenModalProps {
  uri: string | null;
  onClose: () => void;
}

export function ImageFullscreenModal({
  uri,
  onClose,
}: ImageFullscreenModalProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  // The modal is also rendered in unit tests without a SafeAreaProvider; the
  // context fallback keeps insets at zero instead of throwing.
  const insets = useContext(SafeAreaInsetsContext) ?? {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  };
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  if (!uri) return null;
  const absolute = resolveAssetUrl(uri);

  const share = async () => {
    setBusy(true);
    setStatus(null);
    const ok = await shareImage(absolute);
    setBusy(false);
    setStatus(ok ? null : t("image.shareFailed"));
  };

  const copy = async () => {
    const ok = await copyImageLink(absolute);
    setStatus(ok ? t("image.copied") : t("image.copyFailed"));
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("common.action.close")}
        />
        <Image
          source={{ uri: absolute }}
          style={styles.image}
          resizeMode="contain"
          accessibilityLabel={t("image.preview")}
        />
        <View style={[styles.toolbar, { paddingTop: insets.top + 8 }]}>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
            {t("image.preview")}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.action.close")}
            onPress={onClose}
            hitSlop={12}
            style={styles.closeButton}
          >
            <Text style={styles.closeGlyph}>×</Text>
          </Pressable>
        </View>
        <View
          style={[styles.actions, { paddingBottom: insets.bottom + 12 }]}
        >
          {status ? (
            <Text style={styles.status} accessibilityRole="alert">
              {status}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("image.share")}
            disabled={busy}
            onPress={() => void share()}
            style={({ pressed }) => [styles.button, { opacity: pressed ? 0.7 : 1 }]}
          >
            {busy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>{t("image.share")}</Text>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("image.copyLink")}
            onPress={() => void copy()}
            style={({ pressed }) => [styles.button, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={styles.buttonText}>{t("image.copyLink")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "#000000",
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: "72%",
  },
  toolbar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  title: { fontSize: 14, fontWeight: "600" },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  closeGlyph: { color: "#f0f0f0", fontSize: 28, lineHeight: 30 },
  actions: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 16,
    flexWrap: "wrap",
  },
  status: {
    width: "100%",
    textAlign: "center",
    color: "#fbbf24",
    fontSize: 12.5,
    marginBottom: 4,
  },
  button: {
    minHeight: 44,
    minWidth: 120,
    paddingHorizontal: 18,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "#f0f0f0", fontSize: 13.5, fontWeight: "600" },
});
