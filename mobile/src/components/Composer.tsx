/**
 * Chat composer.
 *
 * Multiline input with the two send states, plus an attachment tray backed by
 * `pickAttachment` (camera, photo library, files). Attachments upload to R2
 * before the turn is sent, so the model receives the same shape the web sends.
 */
import { forwardRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
} from "react-native";
import { useTheme } from "@/state/theme";
import { useI18n } from "@/i18n";
import type { Attachment, AttachmentSource } from "@/lib/attachments";
import type { DictationStatus } from "@/hooks/useDictation";

interface ComposerProps {
  value: string;
  onChangeText: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  editable?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  attachments?: Attachment[];
  attachmentBusy?: boolean;
  attachmentError?: string | null;
  onPickAttachment?: (source: AttachmentSource) => void;
  onRemoveAttachment?: (id: string) => void;
  dictationStatus?: DictationStatus;
  dictationError?: string | null;
  onToggleDictation?: () => void;
}

export const Composer = forwardRef<TextInputInstance, ComposerProps>(
  function Composer(
    {
      value,
      onChangeText,
      onSend,
      onStop,
      streaming,
      editable = true,
      placeholder,
      autoFocus,
      attachments = [],
      attachmentBusy = false,
      attachmentError,
      onPickAttachment,
      onRemoveAttachment,
      dictationStatus = "idle",
      dictationError,
      onToggleDictation,
    },
    ref,
  ) {
    const { theme } = useTheme();
    const { t } = useI18n();
    const colors = theme.colors;
    const canSend =
      (value.trim().length > 0 || attachments.length > 0) && !streaming;
    const [menuOpen, setMenuOpen] = useState(false);

    const pick = (source: AttachmentSource) => {
      setMenuOpen(false);
      onPickAttachment?.(source);
    };

    return (
      <>
        <View style={styles.wrapper}>
          {attachments.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tray}
            >
              {attachments.map((attachment) => (
                <View
                  key={attachment.id}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: colors.bgCard,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  {attachment.thumb ? (
                    <Image
                      source={{ uri: attachment.thumb }}
                      style={styles.thumb}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={styles.fileGlyph}>📄</Text>
                  )}
                  <Text
                    numberOfLines={1}
                    style={[styles.chipName, { color: colors.textSecondary }]}
                  >
                    {attachment.name}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t("chat.attachments.remove")} ${attachment.name}`}
                    hitSlop={8}
                    onPress={() => onRemoveAttachment?.(attachment.id)}
                  >
                    <Text style={[styles.chipRemove, { color: colors.textMuted }]}>
                      ×
                    </Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}

          {attachmentError || dictationError ? (
            <Text
              accessibilityRole="alert"
              style={[styles.error, { color: colors.negative }]}
            >
              {attachmentError || dictationError}
            </Text>
          ) : null}

          <View
            style={[
              styles.container,
              {
                backgroundColor: colors.bgSecondary,
                borderColor: colors.border,
              },
            ]}
          >
            {onPickAttachment ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("chat.attachments.add")}
                onPress={() => setMenuOpen(true)}
                disabled={attachmentBusy}
                style={({ pressed }) => [
                  styles.attachButton,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
              >
                {attachmentBusy ? (
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                ) : (
                  <Text style={[styles.attachGlyph, { color: colors.textSecondary }]}>
                    +
                  </Text>
                )}
              </Pressable>
            ) : null}
            {onToggleDictation ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  dictationStatus === "recording"
                    ? t("chat.dictation.stop")
                    : t("chat.dictation.start")
                }
                accessibilityState={{
                  disabled: dictationStatus === "transcribing",
                  busy: dictationStatus === "transcribing",
                }}
                onPress={onToggleDictation}
                disabled={dictationStatus === "transcribing"}
                style={({ pressed }) => [
                  styles.attachButton,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
              >
                {dictationStatus === "transcribing" ? (
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                ) : (
                  <Text
                    style={[
                      styles.micGlyph,
                      {
                        color:
                          dictationStatus === "recording"
                            ? colors.negative
                            : colors.textSecondary,
                      },
                    ]}
                  >
                    {dictationStatus === "recording" ? "■" : "🎙"}
                  </Text>
                )}
              </Pressable>
            ) : null}
            <TextInput
              ref={ref}
              style={[styles.input, { color: colors.textPrimary }]}
              value={value}
              onChangeText={onChangeText}
              placeholder={placeholder || t("chat.composer.placeholder")}
              placeholderTextColor={colors.textMuted}
              multiline
              editable={editable}
              autoFocus={autoFocus}
              maxLength={20_000}
              textAlignVertical="top"
              accessibilityLabel={placeholder || t("chat.composer.placeholder")}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                streaming ? t("chat.composer.stop") : t("chat.composer.send")
              }
              accessibilityState={{ disabled: !streaming && !canSend }}
              disabled={!streaming && !canSend}
              onPress={streaming ? onStop : onSend}
              style={({ pressed }) => [
                styles.sendButton,
                {
                  backgroundColor: streaming
                    ? colors.bgTertiary
                    : canSend
                      ? colors.actionStrong
                      : colors.bgTertiary,
                  opacity: pressed ? 0.82 : 1,
                },
              ]}
            >
              {streaming ? (
                <View
                  style={[
                    styles.stopSquare,
                    { backgroundColor: colors.textPrimary },
                  ]}
                />
              ) : (
                <Text
                  style={[
                    styles.sendGlyph,
                    {
                      color: canSend
                        ? colors.actionStrongContrast
                        : colors.textMuted,
                    },
                  ]}
                >
                  ↑
                </Text>
              )}
            </Pressable>
          </View>
        </View>

        <Modal
          visible={menuOpen}
          animationType="fade"
          transparent
          onRequestClose={() => setMenuOpen(false)}
        >
          <Pressable
            style={[styles.menuBackdrop, { backgroundColor: colors.overlay }]}
            onPress={() => setMenuOpen(false)}
            accessibilityLabel={t("common.action.cancel")}
          >
            <View
              style={[
                styles.menu,
                { backgroundColor: colors.bgSecondary, borderColor: colors.border },
              ]}
            >
              {(
                [
                  ["camera", t("chat.attachments.camera"), "📷"],
                  ["library", t("chat.attachments.photos"), "🖼"],
                  ["file", t("chat.attachments.file"), "📎"],
                ] as const
              ).map(([source, label, glyph]) => (
                <Pressable
                  key={source}
                  accessibilityRole="button"
                  onPress={() => pick(source)}
                  style={({ pressed }) => [
                    styles.menuRow,
                    { borderColor: colors.border, opacity: pressed ? 0.65 : 1 },
                  ]}
                >
                  <Text style={styles.menuGlyph}>{glyph}</Text>
                  <Text style={[styles.menuLabel, { color: colors.textPrimary }]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Modal>
      </>
    );
  },
);

const styles = StyleSheet.create({
  wrapper: { gap: 8 },
  tray: { gap: 8, paddingHorizontal: 2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 9999,
    paddingLeft: 4,
    paddingRight: 10,
    paddingVertical: 4,
    maxWidth: 240,
  },
  thumb: { width: 28, height: 28, borderRadius: 14 },
  fileGlyph: { fontSize: 16, marginLeft: 4 },
  chipName: { flexShrink: 1, fontSize: 12 },
  chipRemove: { fontSize: 16, lineHeight: 18 },
  error: { fontSize: 12, paddingHorizontal: 6 },
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 28,
    paddingLeft: 8,
    paddingRight: 6,
    paddingVertical: 6,
    minHeight: 48,
  },
  attachButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  attachGlyph: { fontSize: 24, lineHeight: 26, fontWeight: "400" },
  micGlyph: { fontSize: 19, lineHeight: 22 },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    maxHeight: 140,
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 6,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  sendGlyph: { fontSize: 20, lineHeight: 22, fontWeight: "600" },
  stopSquare: { width: 12, height: 12, borderRadius: 2 },
  menuBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 16,
  },
  menu: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 6,
    marginBottom: 16,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuGlyph: { fontSize: 18 },
  menuLabel: { fontSize: 15 },
});
