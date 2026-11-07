/**
 * One chat message.
 *
 * Phase 0 renders plain text (with the thinking panel above an assistant
 * message). The full markdown renderer, code-block actions and attachments
 * land in Phase 1; the layout here is already the final one.
 */
import { StyleSheet, Text, View } from "react-native";
import { ThinkingPanel } from "./ThinkingPanel";
import { useTheme } from "@/state/theme";
import { useI18n } from "@/i18n";

export interface ChatMessageModel {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  thinkingSeconds?: number;
  streaming?: boolean;
  error?: string | null;
}

interface MessageBubbleProps {
  message: ChatMessageModel;
  thinkingExpanded: boolean;
  onToggleThinking: () => void;
  streamElapsedMs?: number;
  tokensPerSecond?: number;
}

export function MessageBubble({
  message,
  thinkingExpanded,
  onToggleThinking,
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
        </View>
      </View>
    );
  }

  const hasThinking = Boolean(
    message.streaming
      ? message.thinking
      : (message.thinking || "").trim(),
  );

  return (
    <View style={styles.assistantRow}>
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
        <Text
          selectable
          style={[styles.assistantText, { color: colors.textPrimary }]}
        >
          {message.content}
          {message.streaming ? (
            <Text style={{ color: colors.textMuted }}> ▍</Text>
          ) : null}
        </Text>
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
    maxWidth: "92%",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userText: {
    fontSize: 15,
    lineHeight: 22,
  },
  assistantRow: {
    marginBottom: 22,
    paddingHorizontal: 16,
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
