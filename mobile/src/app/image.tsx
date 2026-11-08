/**
 * Image studio.
 *
 * A small, native surface for `POST /api/image`: prompt + optional style,
 * generated image preview, persistence into the gallery via the share sheet,
 * and a session-local history of the images created in this visit.
 */
import { useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { SessionGate } from "@/components/SessionGate";
import { generateImage, IMAGE_STYLES, type GeneratedImage } from "@/api/images";
import { copyText, shareImage } from "@/lib/downloads";
import { friendlyError } from "@/lib/errors";
import { useTheme } from "@/state/theme";
import { useI18n } from "@/i18n";

interface HistoryEntry extends GeneratedImage {
  prompt: string;
  at: number;
}

export default function ImageStudioScreen() {
  return (
    <SessionGate>
      <ImageStudio />
    </SessionGate>
  );
}

function ImageStudio() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const colors = theme.colors;
  const [prompt, setPrompt] = useState("");
  const [styleId, setStyleId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedImage | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const generate = async () => {
    const base = prompt.trim();
    if (!base || busy) return;
    const style = IMAGE_STYLES.find((entry) => entry.id === styleId);
    const finalPrompt = style ? `${base}, ${style.suffix}` : base;
    setBusy(true);
    setNotice(null);
    try {
      const generated = await generateImage({ prompt: finalPrompt });
      setResult(generated);
      setHistory((previous) =>
        [
          { ...generated, prompt: base, at: Date.now() },
          ...previous.filter((entry) => entry.image !== generated.image),
        ].slice(0, 6),
      );
    } catch (caught) {
      setNotice(friendlyError(caught, t("image.failed")));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!result) return;
    const ok = await shareImage(result.image, "corez-image.png");
    if (!ok) setNotice(t("image.saveFailed"));
  };

  const copyPrompt = async () => {
    if (!prompt.trim()) return;
    const ok = await copyText(prompt.trim());
    setNotice(ok ? t("image.promptCopied") : t("image.saveFailed"));
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.bgPrimary }]}
      edges={["top", "bottom"]}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/chat")
          }
          hitSlop={12}
          style={styles.headerButton}
        >
          <Feather name="chevron-left" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {t("image.title")}
        </Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          {t("image.subtitle")}
        </Text>

        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          placeholder={t("image.placeholder")}
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={2_000}
          textAlignVertical="top"
          accessibilityLabel={t("image.placeholder")}
          style={[
            styles.input,
            {
              backgroundColor: colors.bgSecondary,
              borderColor: colors.border,
              color: colors.textPrimary,
            },
          ]}
        />

        <View style={styles.styleRow}>
          {IMAGE_STYLES.map((style) => {
            const active = style.id === styleId;
            return (
              <Pressable
                key={style.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setStyleId(active ? null : style.id)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? colors.textPrimary : "transparent",
                    borderColor: colors.borderHover,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipLabel,
                    { color: active ? colors.bgPrimary : colors.textSecondary },
                  ]}
                >
                  {style.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("image.generate")}
            disabled={!prompt.trim() || busy}
            onPress={() => void generate()}
            style={({ pressed }) => [
              styles.generate,
              {
                backgroundColor:
                  prompt.trim() && !busy ? colors.textPrimary : colors.bgTertiary,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            {busy ? (
              <ActivityIndicator size="small" color={colors.bgPrimary} />
            ) : (
              <Text
                style={{
                  color: prompt.trim() ? colors.bgPrimary : colors.textMuted,
                  fontWeight: "600",
                }}
              >
                {t("image.generate")}
              </Text>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("image.copyPrompt")}
            onPress={() => void copyPrompt()}
            style={[styles.secondary, { borderColor: colors.borderHover }]}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 12.5 }}>
              {t("image.copyPrompt")}
            </Text>
          </Pressable>
        </View>

        {notice ? (
          <Text accessibilityRole="alert" style={[styles.notice, { color: colors.caution }]}>
            {notice}
          </Text>
        ) : null}

        {result ? (
          <View style={[styles.resultCard, { borderColor: colors.border, backgroundColor: colors.bgCard }]}>
            <Image
              source={{ uri: result.image }}
              resizeMode="contain"
              accessibilityLabel={t("image.result")}
              style={styles.resultImage}
            />
            <View style={styles.resultMeta}>
              <Text style={{ color: colors.textMuted, fontSize: 11.5 }}>
                {result.model || ""}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("image.save")}
                onPress={() => void save()}
                style={[styles.saveButton, { backgroundColor: colors.actionStrong }]}
              >
                <Text style={{ color: colors.bgPrimary, fontWeight: "600", fontSize: 12.5 }}>
                  {t("image.save")}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {history.length > 1 ? (
          <View style={styles.history}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
              {t("image.recent")}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.historyRow}>
              {history.map((entry) => (
                <Pressable
                  key={entry.at}
                  accessibilityRole="button"
                  accessibilityLabel={entry.prompt}
                  onPress={() => setResult({ image: entry.image, model: entry.model })}
                >
                  <Image
                    source={{ uri: entry.image }}
                    style={[styles.thumb, { borderColor: colors.border }]}
                  />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Outfit_600SemiBold",
    fontSize: 16,
  },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  hint: { fontSize: 12.5, lineHeight: 18 },
  input: {
    minHeight: 110,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 20,
  },
  styleRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 14,
    minHeight: 34,
    justifyContent: "center",
  },
  chipLabel: { fontSize: 12, fontWeight: "600" },
  actions: { flexDirection: "row", alignItems: "center", gap: 10 },
  generate: {
    flex: 1,
    minHeight: 46,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  secondary: {
    minHeight: 46,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  notice: { fontSize: 12.5, lineHeight: 18 },
  resultCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 10,
    gap: 8,
  },
  resultImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 10,
    backgroundColor: "#111",
  },
  resultMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  saveButton: {
    minHeight: 38,
    paddingHorizontal: 18,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  history: { gap: 8 },
  historyRow: { gap: 8 },
  thumb: {
    width: 74,
    height: 74,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: { fontSize: 11, letterSpacing: 1.1, fontFamily: "JetBrainsMono_400Regular" },
});
