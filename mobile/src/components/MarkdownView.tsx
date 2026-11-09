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
import { Feather } from "@expo/vector-icons";
import { marked, type Token } from "marked";
import { useTheme } from "@/state/theme";
import { useI18n } from "@/i18n";
import { resolveAssetUrl } from "@/lib/urls";
import {
  classifyDownloadableAsset,
  isHtmlLanguage,
  isRenderableHtml,
} from "@/lib/artifacts";
import { downloadAndShareFile } from "@/lib/downloads";
import { ImageFullscreenModal } from "./ImageFullscreenModal";
import { CanvasView } from "./CanvasView";
import { ThemeProposalCard } from "./ThemeProposalCard";
import {
  THEME_FENCE_LANGUAGE,
  parseThemeProposal,
  stripThemeMarkers,
} from "@/lib/themeProposal";

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
const CanvasOpenContext = createContext<((html: string) => void) | null>(null);
const ReviseCodeContext = createContext<((code: string) => void) | null>(null);
const ReadOnlyContext = createContext(false);

function stripHtml(value: string): string {
  return String(value || "").replace(/<[^>]+>/g, "");
}

export function MarkdownView({
  content,
  onReviseCode,
  publishSessionId,
  readOnly = false,
}: {
  content: string;
  onReviseCode?: (code: string) => void;
  publishSessionId?: string | null;
  readOnly?: boolean;
}) {
  const tokens = useMemo(
    () => parseMarkdown(stripThemeMarkers(content)),
    [content],
  );
  const [fullscreenUri, setFullscreenUri] = useState<string | null>(null);
  const [canvasHtml, setCanvasHtml] = useState<string | null>(null);
  return (
    <ReadOnlyContext.Provider value={readOnly}>
    <ImagePressContext.Provider value={setFullscreenUri}>
      <CanvasOpenContext.Provider value={setCanvasHtml}>
        <ReviseCodeContext.Provider value={onReviseCode ?? null}>
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
          {canvasHtml ? (
            <CanvasView
              html={canvasHtml}
              onClose={() => setCanvasHtml(null)}
              sessionId={publishSessionId}
            />
          ) : null}
        </ReviseCodeContext.Provider>
      </CanvasOpenContext.Provider>
    </ImagePressContext.Provider>
    </ReadOnlyContext.Provider>
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
    case "text": {
      // `marked` wraps inline content (bold, links, code spans) in a `text`
      // token inside list items; render it through the inline walker instead of
      // falling back to the raw markdown source.
      const textToken = token as { text?: string; tokens?: Token[] };
      return (
        <Text style={[styles.paragraph, { color: colors.textPrimary }]}>
          {textToken.tokens && textToken.tokens.length > 0 ? (
            <Inline tokens={textToken.tokens} />
          ) : (
            textToken.text || ""
          )}
        </Text>
      );
    }
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
                  if (!url) return;
                  const downloadable = classifyDownloadableAsset(url);
                  if (downloadable) {
                    void downloadAndShareFile(downloadable).then((ok) => {
                      if (!ok) void Linking.openURL(url).catch(() => {});
                    });
                    return;
                  }
                  void Linking.openURL(url).catch(() => {});
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
  const openCanvas = useContext(CanvasOpenContext);
  const reviseCode = useContext(ReviseCodeContext);
  const readOnly = useContext(ReadOnlyContext);
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canPreview = isHtmlLanguage(language) || isRenderableHtml(code);
  const themeProposal =
    String(language || "").trim().toLowerCase() === THEME_FENCE_LANGUAGE
      ? parseThemeProposal(code)
      : null;

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

  if (themeProposal) {
    return <ThemeProposalCard proposal={themeProposal} readOnly={readOnly} />;
  }

  if (canPreview) {
    // Artifacts become a compact action bar (like the web) instead of dumping
    // the whole HTML document into the conversation.
    return (
      <View
        style={[
          styles.artifactCard,
          { backgroundColor: colors.bgCard, borderColor: colors.border },
        ]}
      >
        <View style={styles.artifactActions}>
          {openCanvas ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("canvas.preview")}
              onPress={() => openCanvas(code)}
              style={({ pressed }) => [
                styles.artifactPrimary,
                {
                  backgroundColor: colors.actionStrong,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Feather
                name="eye"
                size={15}
                color={colors.actionStrongContrast}
              />
              <Text
                style={[
                  styles.artifactActionLabel,
                  { color: colors.actionStrongContrast },
                ]}
              >
                {t("canvas.preview")}
              </Text>
            </Pressable>
          ) : null}
          {reviseCode ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("chat.code.revise")}
              onPress={() => reviseCode(code)}
              style={({ pressed }) => [
                styles.artifactSecondary,
                {
                  backgroundColor: colors.bgSecondary,
                  borderColor: colors.borderHover,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Feather name="edit-3" size={15} color={colors.textPrimary} />
              <Text
                style={[
                  styles.artifactActionLabel,
                  { color: colors.textPrimary },
                ]}
              >
                {t("chat.code.revise")}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

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
        <View style={styles.codeActions}>
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
  artifactCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 10,
  },
  artifactActions: {
    flexDirection: "row",
    gap: 8,
  },
  artifactPrimary: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  artifactSecondary: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  artifactActionLabel: { fontSize: 13, fontWeight: "600" },
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
  codeActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  codeAction: { fontSize: 11.5, fontWeight: "600" },
  codeText: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 12.5,
    lineHeight: 19,
    padding: 12,
  },
});
