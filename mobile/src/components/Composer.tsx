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
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/state/theme";
import { useI18n } from "@/i18n";
import type { Attachment, AttachmentSource } from "@/lib/attachments";
import type { DictationStatus } from "@/hooks/useDictation";
import { resolveComposerAction } from "@/lib/composerAction";

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
    const hasContent =
      value.trim().length > 0 || attachments.length > 0;
    const canSend = hasContent && !streaming;
    const action = resolveComposerAction({
      streaming,
      hasContent,
      dictationStatus,
      canDictate: Boolean(onToggleDictation),
    });
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
                    <Feather
                      name="file-text"
                      size={16}
                      color={colors.textMuted}
                      style={styles.fileGlyph}
                    />
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
                    <Feather name="x" size={14} color={colors.textMuted} />
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
                backgroundColor: colors.bgCard,
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
                  <Feather
                    name="plus"
                    size={22}
                    color={colors.textSecondary}
                  />
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
                action === "stop"
                  ? t("chat.composer.stop")
                  : action === "mic"
                    ? dictationStatus === "transcribing"
                      ? t("chat.dictation.transcribing")
                      : dictationStatus === "recording"
                        ? t("chat.dictation.stop")
                        : t("chat.dictation.start")
                    : t("chat.composer.send")
              }
              accessibilityState={{
                disabled:
                  action === "stop"
                    ? false
                    : action === "mic"
                      ? dictationStatus === "transcribing"
                      : !canSend,
                busy: dictationStatus === "transcribing",
                selected: dictationStatus === "recording",
              }}
              disabled={
                action === "stop"
                  ? false
                  : action === "mic"
                    ? dictationStatus === "transcribing"
                    : !canSend
              }
              onPress={
                action === "stop"
                  ? onStop
                  : action === "mic"
                    ? onToggleDictation
                    : onSend
              }
              style={({ pressed }) => [
                styles.sendButton,
                {
                  backgroundColor:
                    action === "send" && canSend
                      ? colors.actionStrong
                      : colors.bgTertiary,
                  opacity: pressed ? 0.82 : 1,
                },
              ]}
            >
              {action === "stop" ? (
                <View
                  style={[
                    styles.stopSquare,
                    { backgroundColor: colors.textPrimary },
                  ]}
                />
              ) : action === "mic" ? (
                dictationStatus === "transcribing" ? (
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                ) : (
                  <Feather
                    name={dictationStatus === "recording" ? "mic-off" : "mic"}
                    size={20}
                    color={
                      dictationStatus === "recording"
                        ? colors.negative
                        : colors.textSecondary
                    }
                  />
                )
              ) : (
                <Feather
                  name="arrow-up"
                  size={20}
                  color={
                    canSend ? colors.actionStrongContrast : colors.textMuted
                  }
                />
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
                  ["camera", t("chat.attachments.camera"), "camera"],
                  ["library", t("chat.attachments.photos"), "image"],
                  ["file", t("chat.attachments.file"), "paperclip"],
                ] as const
              ).map(([source, label, icon]) => (
                <Pressable
                  key={source}
                  accessibilityRole="button"
                  onPress={() => pick(source)}
                  style={({ pressed }) => [
                    styles.menuRow,
                    { borderColor: colors.border, opacity: pressed ? 0.65 : 1 },
                  ]}
                >
                  <Feather
                    name={icon}
                    size={18}
                    color={colors.textSecondary}
                    style={styles.menuGlyph}
                  />
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
  fileGlyph: { marginLeft: 4 },
  chipName: { flexShrink: 1, fontSize: 12 },
  chipRemove: { fontSize: 16, lineHeight: 18 },
  error: { fontSize: 12, paddingHorizontal: 6 },
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 26,
    paddingLeft: 8,
    paddingRight: 6,
    paddingVertical: 6,
    minHeight: 54,
  },
  attachButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  attachGlyph: { fontSize: 24, lineHeight: 26, fontWeight: "400" },
  input: {
    flex: 1,
    fontSize: 15.5,
    lineHeight: 22,
    maxHeight: 140,
    paddingTop: 9,
    paddingBottom: 9,
    paddingHorizontal: 6,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  stopSquare: { width: 12, height: 12, borderRadius: 2 },
  sendGlyph: { fontSize: 20, lineHeight: 22, fontWeight: "600" },
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
