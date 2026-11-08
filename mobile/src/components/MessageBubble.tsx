/**
 * One chat message.
 *
 * Phase 0 renders plain text (with the thinking panel above an assistant
 * message). The full markdown renderer, code-block actions and attachments
 * land in Phase 1; the layout here is already the final one.
 */
import { Image, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThinkingPanel } from "./ThinkingPanel";
import { MarkdownView } from "./MarkdownView";
import { useTheme } from "@/state/theme";
import { useI18n } from "@/i18n";

export interface MessageAttachment {
  id?: string;
  name: string;
  type?: string;
  size?: number;
  thumb?: string;
  assetUrl?: string;
}

export interface ChatMessageModel {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  thinkingSeconds?: number;
  streaming?: boolean;
  error?: string | null;
  attachments?: MessageAttachment[];
  speakerId?: string | null;
  speakerName?: string | null;
  turnId?: string | null;
  modelId?: string | null;
}

interface MessageBubbleProps {
  message: ChatMessageModel;
  thinkingExpanded: boolean;
  onToggleThinking: () => void;
  onReviseCode?: (code: string) => void;
  publishSessionId?: string | null;
  streamElapsedMs?: number;
  tokensPerSecond?: number;
}

export function MessageBubble({
  message,
  thinkingExpanded,
  onToggleThinking,
  onReviseCode,
  publishSessionId,
  streamElapsedMs = 0,
  tokensPerSecond = 0,
}: MessageBubbleProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const colors = theme.colors;
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <View style={styles.userRow}>
        <View
          style={[
            styles.userBubble,
            {
              backgroundColor: colors.userBubble,
              borderColor: colors.userBubbleBorder,
            },
          ]}
        >
          <Text
            selectable
            style={[styles.userText, { color: colors.textPrimary }]}
          >
            {message.content}
          </Text>
          {message.attachments && message.attachments.length > 0 ? (
            <View style={styles.attachmentRow}>
              {message.attachments.map((attachment, index) => (
                <View key={attachment.id || `${attachment.name}-${index}`}>
                  {attachment.thumb ? (
                    <Image
                      source={{ uri: attachment.thumb }}
                      style={[
                        styles.attachmentImage,
                        { borderColor: colors.border },
                      ]}
                      resizeMode="cover"
                      accessibilityLabel={attachment.name}
                    />
                  ) : (
                    <View
                      style={[
                        styles.attachmentFile,
                        {
                          backgroundColor: colors.bgCard,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Feather
                        name="file-text"
                        size={13}
                        color={colors.textSecondary}
                      />
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.attachmentFileName,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {attachment.name}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  const hasThinking = Boolean(
    message.streaming
      ? message.thinking
      : (message.thinking || "").trim(),
  );
  const speakerInitials = String(message.speakerName || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return (
    <View style={styles.assistantRow}>
      {!message.speakerName ? (
        <Image
          source={require("../../assets/android-icon-foreground.png")}
          style={styles.assistantMark}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      ) : null}
      {message.speakerName ? (
        <View style={styles.speakerRow}>
          <View
            style={[
              styles.speakerAvatar,
              { backgroundColor: colors.bgTertiary, borderColor: colors.border },
            ]}
          >
            <Text
              style={[styles.speakerInitials, { color: colors.textPrimary }]}
            >
              {speakerInitials || "AI"}
            </Text>
          </View>
          <Text style={[styles.speakerName, { color: colors.textSecondary }]}>
            {message.speakerName}
          </Text>
        </View>
      ) : null}
      {hasThinking ? (
        <ThinkingPanel
          text={message.thinking || ""}
          live={Boolean(message.streaming)}
          expanded={thinkingExpanded}
          onToggle={onToggleThinking}
          elapsedMs={message.streaming ? streamElapsedMs : 0}
          tokensPerSecond={tokensPerSecond}
          placeholder={t("chat.thinking.working")}
          output={message.content}
        />
      ) : null}
      {message.content ? (
        <MarkdownView
          content={message.content}
          onReviseCode={onReviseCode}
          publishSessionId={publishSessionId}
        />
      ) : message.streaming ? null : (
        <Text style={[styles.assistantText, { color: colors.textMuted }]}>
          {t("chat.error.empty")}
        </Text>
      )}
      {message.error ? (
        <Text style={[styles.errorText, { color: colors.negative }]}>
          {message.error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  userRow: {
    alignItems: "flex-end",
    marginBottom: 18,
    paddingHorizontal: 16,
  },
  userBubble: {
    maxWidth: "88%",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  userText: {
    fontSize: 15,
    lineHeight: 22,
  },
  attachmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  attachmentImage: {
    width: 88,
    height: 88,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  attachmentFile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    maxWidth: 180,
  },
  attachmentFileName: { fontSize: 12, flexShrink: 1 },
  assistantRow: {
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  assistantMark: {
    width: 22,
    height: 22,
    marginBottom: 8,
  },
  speakerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  speakerAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  speakerInitials: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  speakerName: {
    fontSize: 12.5,
    fontWeight: "600",
  },
  assistantText: {
    fontSize: 15,
    lineHeight: 23,
  },
  errorText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
  },
});
