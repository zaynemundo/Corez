/**
 * Live reasoning panel.
 *
 * The worker streams `thinking` events before the answer deltas. This panel
 * shows that reasoning while it runs, collapses to a single "Thought for Ns"
 * line once the answer starts, and never invents reasoning that was not sent.
 * Mirrors src/components/ThinkingPanel.jsx.
 */
import { Feather } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/state/theme";
import { useI18n } from "@/i18n";

interface ThinkingPanelProps {
  text: string;
  live: boolean;
  expanded: boolean;
  onToggle: () => void;
  elapsedMs: number;
  tokensPerSecond?: number;
  placeholder?: string;
  output?: string;
}

export function ThinkingPanel({
  text,
  live,
  expanded,
  onToggle,
  elapsedMs,
  tokensPerSecond = 0,
  placeholder,
  output = "",
}: ThinkingPanelProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const colors = theme.colors;

  const seconds = Math.max(0, Math.round(elapsedMs / 1000));
  const hasReasoning = text.trim().length > 0;
  // While the model has not streamed reasoning yet, keep a quiet "Working…"
  // row so a long generation is not a blank screen. Once the answer starts
  // streaming with no reasoning, hide the panel entirely.
  if (!live && !hasReasoning) return null;
  if (!hasReasoning && !live) return null;

  const rateLabel =
    live && tokensPerSecond >= 1
      ? ` · ${Math.round(tokensPerSecond)} tok/s`
      : "";

  let title: string;
  if (live && !hasReasoning) {
    title = placeholder || t("chat.thinking.working");
  } else if (live) {
    title = `${t("chat.thinking.label")} · ${seconds}s${rateLabel}`;
  } else {
    title = t("chat.thinking.thoughtForSeconds", { seconds });
  }

  return (
    <View
      style={[
        styles.container,
        { borderColor: colors.border, backgroundColor: colors.bgCard },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={title}
        onPress={onToggle}
        style={styles.header}
      >
        <Text
          style={[styles.title, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Feather
          name={expanded ? "chevron-down" : "chevron-right"}
          size={16}
          color={colors.textMuted}
        />
      </Pressable>
      {expanded ? (
        <View style={styles.body}>
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
            {hasReasoning
              ? text
              : live
                ? t("chat.thinking.working")
                : output}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
  },
  header: {
    minHeight: 40,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 12,
    letterSpacing: 0.02,
  },
  chevron: {
    fontSize: 14,
  },
  body: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 2,
  },
  bodyText: {
    fontSize: 12.5,
    lineHeight: 19,
  },
});
