/**
 * Chat composer.
 *
 * Multiline input pinned above the keyboard with a send/stop control that
 * mirrors the web composer's two states. Attachments, command chips and
 * dictation arrive in Phase 1; this component owns the layout they slot into.
 */
import { forwardRef } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
} from "react-native";
import { useTheme } from "@/state/theme";
import { useI18n } from "@/i18n";

interface ComposerProps {
  value: string;
  onChangeText: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  editable?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

export const Composer = forwardRef<TextInputInstance, ComposerProps>(function Composer(
  {
    value,
    onChangeText,
    onSend,
    onStop,
    streaming,
    editable = true,
    placeholder,
    autoFocus,
  },
  ref,
) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const colors = theme.colors;
  const canSend = value.trim().length > 0 && !streaming;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.bgSecondary,
          borderColor: colors.border,
        },
      ]}
    >
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
            style={[styles.stopSquare, { backgroundColor: colors.textPrimary }]}
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
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 28,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    minHeight: 48,
  },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    maxHeight: 140,
    paddingTop: 8,
    paddingBottom: 8,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  sendGlyph: {
    fontSize: 20,
    lineHeight: 22,
    fontWeight: "600",
  },
  stopSquare: {
    width: 12,
    height: 12,
    borderRadius: 2,
  },
});
