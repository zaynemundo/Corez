/**
 * Markdown renderer for chat answers.
 *
 * CoreZ answers are markdown: headings, lists, fenced code, tables, links and
 * inline images. React Native has no DOM renderer, so this walks `marked`'s
 * token stream and renders native components. Fenced code gets a language
 * header and a copy action; tables scroll horizontally instead of overflowing.
 *
 * Parsing is memoised by content string because streaming re-renders the same
 * growing text; the cache is bounded so a long answer cannot grow it forever.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { marked, type Token } from "marked";
import { useTheme } from "@/state/theme";
import { useI18n } from "@/i18n";
import { resolveAssetUrl } from "@/lib/urls";
import { ImageFullscreenModal } from "./ImageFullscreenModal";

const MAX_CACHE_ENTRIES = 60;
const parseCache = new Map<string, Token[]>();

export function parseMarkdown(content: string): Token[] {
  if (!content) return [];
  const cached = parseCache.get(content);
  if (cached) return cached;
  const tokens = marked.lexer(content, { gfm: true, breaks: true }) as Token[];
  if (parseCache.size >= MAX_CACHE_ENTRIES) parseCache.clear();
  parseCache.set(content, tokens);
  return tokens;
}

/** Resolve relative asset paths against the API origin. */
export const resolveMarkdownUrl = resolveAssetUrl;

const ImagePressContext = createContext<((uri: string) => void) | null>(null);

function stripHtml(value: string): string {
  return String(value || "").replace(/<[^>]+>/g, "");
}

export function MarkdownView({ content }: { content: string }) {
  const tokens = useMemo(() => parseMarkdown(content), [content]);
  const [fullscreenUri, setFullscreenUri] = useState<string | null>(null);
  return (
    <ImagePressContext.Provider value={setFullscreenUri}>
      <View style={styles.container}>
        {tokens.map((token, index) => (
          <Block key={`${token.type}-${index}`} token={token} />
        ))}
      </View>
      {fullscreenUri ? (
        <ImageFullscreenModal
          uri={fullscreenUri}
          onClose={() => setFullscreenUri(null)}
        />
      ) : null}
    </ImagePressContext.Provider>
  );
}

function Block({ token }: { token: Token }) {
  const { theme } = useTheme();
  const colors = theme.colors;

  switch (token.type) {
    case "space":
      return null;
    case "paragraph":
      return (
        <Text style={[styles.paragraph, { color: colors.textPrimary }]}>
          <Inline tokens={(token as { tokens?: Token[] }).tokens} />
        </Text>
      );
    case "heading": {
      const depth = Number((token as { depth?: number }).depth) || 1;
      const size = depth === 1 ? 22 : depth === 2 ? 19 : 16.5;
      return (
        <Text
          style={[
            styles.heading,
            { color: colors.textPrimary, fontSize: size, lineHeight: size * 1.35 },
          ]}
        >
          <Inline tokens={(token as { tokens?: Token[] }).tokens} />
        </Text>
      );
    }
    case "code":
      return (
        <CodeBlock
          code={String((token as { text?: string }).text || "")}
          language={String((token as { lang?: string }).lang || "")}
        />
      );
    case "blockquote": {
      const children = (token as { tokens?: Token[] }).tokens || [];
      return (
        <View
          style={[
            styles.blockquote,
            { borderLeftColor: colors.borderHover },
          ]}
        >
          {children.map((child, index) => (
            <Block key={`quote-${index}`} token={child} />
          ))}
        </View>
      );
    }
    case "list": {
      const tokenList = token as {
        ordered?: boolean;
        start?: number | "";
        items?: { tokens?: Token[]; task?: boolean; checked?: boolean }[];
      };
      return (
        <View style={styles.list}>
          {(tokenList.items || []).map((item, index) => {
            const marker = tokenList.ordered
              ? `${(Number(tokenList.start) || 1) + index}.`
              : "•";
            return (
              <View key={`item-${index}`} style={styles.listItem}>
                <Text style={[styles.listMarker, { color: colors.textSecondary }]}>
                  {item.task ? (item.checked ? "☑" : "☐") : marker}
                </Text>
                <View style={styles.listContent}>
                  {(item.tokens || []).map((child, childIndex) => (
                    <Block key={`item-${index}-${childIndex}`} token={child} />
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      );
    }
    case "table":
      return <TableBlock token={token as unknown as TableToken} />;
    case "hr":
      return <View style={[styles.hr, { backgroundColor: colors.border }]} />;
    case "html":
      return (
        <Text style={[styles.paragraph, { color: colors.textMuted }]}>
          {stripHtml((token as { text?: string }).text || "")}
        </Text>
      );
    default: {
      const raw = (token as { raw?: string }).raw || "";
      const text = raw.trim();
      if (!text) return null;
      return (
        <Text style={[styles.paragraph, { color: colors.textPrimary }]}>
          {text}
        </Text>
      );
    }
  }
}

function Inline({ tokens }: { tokens?: Token[] }) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const onImagePress = useContext(ImagePressContext);
  if (!tokens || tokens.length === 0) return null;

  return (
    <>
      {tokens.map((token, index) => {
        const key = `${token.type}-${index}`;
        switch (token.type) {
          case "text": {
            const nested = (token as { tokens?: Token[] }).tokens;
            if (nested && nested.length > 0) {
              return <Inline key={key} tokens={nested} />;
            }
            return <Text key={key}>{(token as { text?: string }).text || ""}</Text>;
          }
          case "strong":
            return (
              <Text key={key} style={styles.bold}>
                <Inline tokens={(token as { tokens?: Token[] }).tokens} />
              </Text>
            );
          case "em":
            return (
              <Text key={key} style={styles.italic}>
                <Inline tokens={(token as { tokens?: Token[] }).tokens} />
              </Text>
            );
          case "del":
            return (
              <Text key={key} style={styles.strike}>
                <Inline tokens={(token as { tokens?: Token[] }).tokens} />
              </Text>
            );
          case "codespan":
            return (
              <Text
                key={key}
                style={[styles.codespan, { color: colors.inlineCode }]}
              >
                {(token as { text?: string }).text || ""}
              </Text>
            );
          case "link": {
            const href = (token as { href?: string }).href || "";
            return (
              <Text
                key={key}
                style={[styles.link, { color: colors.textPrimary }]}
                onPress={() => {
                  const url = resolveMarkdownUrl(href);
                  if (url) void Linking.openURL(url).catch(() => {});
                }}
              >
                <Inline tokens={(token as { tokens?: Token[] }).tokens} />
              </Text>
            );
          }
          case "image": {
            const src = (token as { href?: string }).href || "";
            const alt = (token as { text?: string }).text || "";
            return (
              <Text
                key={key}
                onPress={() => onImagePress?.(src)}
                accessibilityRole="imagebutton"
                accessibilityLabel={alt}
              >
                <Image
                  source={{ uri: resolveMarkdownUrl(src) }}
                  style={[styles.image, { borderColor: colors.border }]}
                  resizeMode="contain"
                  accessibilityLabel={alt}
                />
              </Text>
            );
          }
          case "br":
            return <Text key={key}>{"\n"}</Text>;
          case "escape":
            return <Text key={key}>{(token as { text?: string }).text || ""}</Text>;
          default: {
            const nested = (token as { tokens?: Token[] }).tokens;
            if (nested && nested.length > 0) {
              return <Inline key={key} tokens={nested} />;
            }
            return (
              <Text key={key}>
                {(token as { text?: string }).text ||
                  stripHtml((token as { raw?: string }).raw || "")}
              </Text>
            );
          }
        }
      })}
    </>
  );
}

interface TableToken {
  header?: { text: string }[];
  rows?: { text: string }[][];
  [key: string]: unknown;
}

function TableBlock({ token }: { token: TableToken }) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const header = token.header || [];
  const rows = token.rows || [];
  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      style={styles.tableScroll}
    >
      <View style={[styles.table, { borderColor: colors.border }]}>
        <View
          style={[
            styles.tableRow,
            styles.tableHeaderRow,
            { backgroundColor: colors.bgCard, borderColor: colors.border },
          ]}
        >
          {header.map((cell, index) => (
            <View key={`h-${index}`} style={[styles.tableCell, { borderColor: colors.border }]}>
              <Text style={[styles.tableHeaderText, { color: colors.textPrimary }]}>
                {cell.text}
              </Text>
            </View>
          ))}
        </View>
        {rows.map((row, rowIndex) => (
          <View
            key={`r-${rowIndex}`}
            style={[styles.tableRow, { borderColor: colors.border }]}
          >
            {row.map((cell, cellIndex) => (
              <View
                key={`c-${rowIndex}-${cellIndex}`}
                style={[styles.tableCell, { borderColor: colors.border }]}
              >
                <Text style={[styles.tableCellText, { color: colors.textSecondary }]}>
                  {cell.text}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const colors = theme.colors;
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(code);
      setCopied(true);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard failures are non-fatal; the code is still selectable.
    }
  };

  return (
    <View
      style={[
        styles.codeBlock,
        { backgroundColor: colors.codeBg, borderColor: colors.border },
      ]}
    >
      <View
        style={[
          styles.codeHeader,
          { backgroundColor: colors.codeHeaderBg, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.codeLang, { color: colors.textMuted }]}>
          {language || t("chat.code.plain")}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("chat.code.copy")}
          onPress={() => void copy()}
          hitSlop={8}
        >
          <Text style={[styles.codeAction, { color: colors.textSecondary }]}>
            {copied ? t("chat.code.copied") : t("chat.code.copy")}
          </Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text
          selectable
          style={[styles.codeText, { color: colors.textPrimary }]}
        >
          {code}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  paragraph: { fontSize: 15, lineHeight: 23 },
  heading: {
    fontFamily: "Outfit_600SemiBold",
    marginTop: 4,
  },
  bold: { fontWeight: "700" },
  italic: { fontStyle: "italic" },
  strike: { textDecorationLine: "line-through" },
  codespan: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 13.5,
  },
  link: {
    textDecorationLine: "underline",
  },
  image: {
    width: 260,
    height: 180,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
  blockquote: {
    borderLeftWidth: 2,
    paddingLeft: 12,
    gap: 8,
  },
  list: { gap: 6 },
  listItem: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  listMarker: {
    minWidth: 18,
    fontSize: 14.5,
    lineHeight: 22,
    textAlign: "right",
  },
  listContent: { flex: 1, gap: 6 },
  hr: { height: StyleSheet.hairlineWidth, marginVertical: 6 },
  tableScroll: { marginVertical: 4 },
  table: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, overflow: "hidden" },
  tableRow: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tableHeaderRow: {},
  tableCell: {
    minWidth: 120,
    maxWidth: 220,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  tableHeaderText: { fontSize: 13, fontWeight: "700" },
  tableCellText: { fontSize: 13, lineHeight: 19 },
  codeBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    overflow: "hidden",
    marginVertical: 4,
  },
  codeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    minHeight: 32,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  codeLang: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 11,
  },
  codeAction: { fontSize: 11.5, fontWeight: "600" },
  codeText: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 12.5,
    lineHeight: 19,
    padding: 12,
  },
});
