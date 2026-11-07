/**
 * Chat screen.
 *
 * Streams `/api/ai` turns and persists every message to `/api/chats`, so a
 * conversation survives an app restart and can be reopened from the history
 * sheet. The stream itself is unchanged from the Phase 0 spike.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Composer } from "@/components/Composer";
import {
  MessageBubble,
  type ChatMessageModel,
} from "@/components/MessageBubble";
import { ChatHistorySheet } from "@/components/ChatHistorySheet";
import { streamChatTurn, type ChatHistoryMessage } from "@/api/ai";
import {
  appendMessage,
  createChat,
  deriveChatTitle,
  getChat,
} from "@/api/chats";
import {
  buildAttachmentPrompt,
  pickAttachment,
  toApiAttachments,
  type Attachment,
  type AttachmentSource,
} from "@/lib/attachments";
import {
  classifyIntent as classifyEngineIntent,
  classifyPublicIntent,
} from "@corez_ai/shared/intent";
import { useAuth } from "@/state/auth";
import { useTheme } from "@/state/theme";
import { useI18n } from "@/i18n";
import { useDictation } from "@/hooks/useDictation";
import { friendlyError } from "@/lib/errors";

const THINKING_TOKEN_RATIO = 4;

interface ChatViewProps {
  initialChatId?: string;
}

export function ChatView({ initialChatId }: ChatViewProps) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const { t, language } = useI18n();
  const insets = useSafeAreaInsets();
  const colors = theme.colors;

  const [chatId, setChatId] = useState<string | null>(initialChatId ?? null);
  const [chatTitle, setChatTitle] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageModel[]>([]);
  const messagesRef = useRef<ChatMessageModel[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [thinkingExpanded, setThinkingExpanded] = useState(true);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [loadingChat, setLoadingChat] = useState(Boolean(initialChatId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const scrollRef = useRef<ScrollViewInstance | null>(null);

  const publishMessages = useCallback(
    (
      next:
        | ChatMessageModel[]
        | ((prev: ChatMessageModel[]) => ChatMessageModel[]),
    ) => {
      setMessages((prev) => {
        const value = typeof next === "function" ? next(prev) : next;
        messagesRef.current = value;
        return value;
      });
    },
    [],
  );

  const patchMessage = useCallback(
    (id: string, patch: Partial<ChatMessageModel>) => {
      publishMessages((prev) =>
        prev.map((message) =>
          message.id === id ? { ...message, ...patch } : message,
        ),
      );
    },
    [publishMessages],
  );

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopTimer();
      abortRef.current?.abort();
    };
  }, [stopTimer]);

  // Load a stored conversation when the route carries an id. This effect syncs
  // React state to the external route + server data, so the compiler rule's
  // "setState in effect" warning is expected here.
  const loadSeqRef = useRef(0);
  const loadStoredChat = useCallback(
    async (id: string) => {
      const seq = ++loadSeqRef.current;
      setLoadingChat(true);
      setLoadError(null);
      setChatId(id);
      try {
        const detail = await getChat(id);
        if (seq !== loadSeqRef.current) return;
        setChatTitle(detail.title || null);
        publishMessages(
          (detail.messages || [])
            .filter((message) => message.role !== "system")
            .map((message) => ({
              id: message.id,
              role: message.role === "assistant" ? "assistant" : "user",
              content: message.content,
              attachments: Array.isArray(message.attachments)
                ? message.attachments.map((raw, index) => {
                    const value = (raw ?? {}) as Record<string, unknown>;
                    return {
                      id:
                        typeof value.id === "string"
                          ? value.id
                          : `${message.id}-att-${index}`,
                      name:
                        typeof value.name === "string" ? value.name : "file",
                      type:
                        typeof value.type === "string" ? value.type : undefined,
                      size:
                        typeof value.size === "number" ? value.size : undefined,
                      thumb:
                        typeof value.thumb === "string"
                          ? value.thumb
                          : undefined,
                      assetUrl:
                        typeof value.assetUrl === "string"
                          ? value.assetUrl
                          : undefined,
                    };
                  })
                : undefined,
            })),
        );
      } catch (caught) {
        if (seq === loadSeqRef.current) setLoadError(friendlyError(caught));
      } finally {
        if (seq === loadSeqRef.current) setLoadingChat(false);
      }
    },
    [publishMessages],
  );

  useEffect(() => {
    if (!initialChatId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChatId(null);
      setChatTitle(null);
      publishMessages([]);
      setLoadingChat(false);
      setLoadError(null);
      return undefined;
    }
    void loadStoredChat(initialChatId);
    return () => {
      // A newer load (or unmount) invalidates this response.
      loadSeqRef.current += 1;
    };
  }, [initialChatId, loadStoredChat, publishMessages]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const addAttachment = useCallback(async (source: AttachmentSource) => {
    setAttachmentError(null);
    setAttachmentBusy(true);
    try {
      const attachment = await pickAttachment(source);
      if (attachment) {
        setAttachments((prev) => [...prev, attachment].slice(0, 6));
      }
    } catch (caught) {
      setAttachmentError(friendlyError(caught));
    } finally {
      setAttachmentBusy(false);
    }
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const dictation = useDictation({
    language,
    onTranscript: (text) => {
      setInput((prev) =>
        `${prev ? `${prev} ` : ""}${text}`.slice(0, 20_000),
      );
    },
  });

  const send = useCallback(
    async (override?: string) => {
      const trimmed = (override ?? input).trim();
      if (streaming || (!trimmed && attachments.length === 0)) return;
      setNotice(null);

      const turnAttachments = attachments;
      const prompt =
        trimmed || turnAttachments.map((item) => item.name).join(", ");
      const apiPrompt = `${prompt}${buildAttachmentPrompt(turnAttachments)}`;
      const apiAttachments = toApiAttachments(turnAttachments);
      const displayAttachments = turnAttachments.map(
        ({ id, name, type, size, thumb, assetUrl, assetKey }) => ({
          id,
          name,
          type,
          size,
          thumb,
          assetUrl,
          assetKey,
        }),
      );

      const history: ChatHistoryMessage[] = messagesRef.current
        .filter((message) => !message.streaming && message.content.trim())
        .map((message) => ({
          role: message.role,
          content: message.content,
          ...(message.attachments && message.attachments.length > 0
            ? { attachments: message.attachments }
            : {}),
        }));

      // Persist first: a turn that the server never accepted must not look
      // saved locally. A brand-new chat is created with the user message.
      let activeChatId = chatId;
      let createdThisTurn = false;
      try {
        if (!activeChatId) {
          const created = await createChat({
            title: deriveChatTitle(prompt),
            firstMessage: {
              role: "user",
              content: prompt,
              ...(displayAttachments.length > 0
                ? { attachments: displayAttachments }
                : {}),
            },
          });
          activeChatId = created.id;
          createdThisTurn = true;
          setChatId(created.id);
        } else {
          await appendMessage(activeChatId, {
            role: "user",
            content: prompt,
            ...(displayAttachments.length > 0
              ? { attachments: displayAttachments }
              : {}),
          });
        }
      } catch (caught) {
        setNotice(friendlyError(caught));
        return;
      }

      const now = Date.now();
      const userId = `u-${now}`;
      const assistantId = `a-${now}`;
      const userMessage: ChatMessageModel = {
        id: userId,
        role: "user",
        content: prompt,
        ...(displayAttachments.length > 0
          ? { attachments: displayAttachments }
          : {}),
      };
      const assistantMessage: ChatMessageModel = {
        id: assistantId,
        role: "assistant",
        content: "",
        thinking: "",
        streaming: true,
      };

      publishMessages((prev) => [...prev, userMessage, assistantMessage]);
      setInput("");
      setAttachments([]);
      setAttachmentError(null);
      setStreaming(true);
      setThinkingExpanded(true);
      setElapsedMs(0);
      startedAtRef.current = Date.now();
      stopTimer();
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 250);

      const controller = new AbortController();
      abortRef.current = controller;
      let thinking = "";
      let assistantText = "";
      // Streaming can emit many deltas per second and every render re-parses
      // the markdown. Flush the visible content at ~16fps; the final finish()
      // always writes the exact full text.
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      const scheduleFlush = () => {
        if (flushTimer) return;
        flushTimer = setTimeout(() => {
          flushTimer = null;
          patchMessage(assistantId, { content: assistantText });
        }, 60);
      };
      const clearFlush = () => {
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
      };

      // Same client-side classification the web sends: the trained public
      // label decides the legacy intent, the pattern engine supplies the
      // structured intent the Worker uses for skill routing.
      const publicIntent = classifyPublicIntent(prompt);
      const fineIntent = classifyEngineIntent(prompt);

      const finish = (patch: Partial<ChatMessageModel>) => {
        clearFlush();
        const elapsed = Date.now() - startedAtRef.current;
        patchMessage(assistantId, {
          content: assistantText,
          streaming: false,
          thinking,
          thinkingSeconds: Math.max(0, Math.round(elapsed / 1000)),
          ...patch,
        });
      };

      try {
        const result = await streamChatTurn(
          {
            prompt: apiPrompt,
            messages: [
              ...history,
              {
                role: "user" as const,
                content: apiPrompt,
                attachments: apiAttachments,
              },
            ],
            intent: {
              type: publicIntent.label,
              confidence: publicIntent.confidence,
            },
            fineIntent,
          },
          {
            onDelta: (text) => {
              assistantText += text;
              scheduleFlush();
            },
            onThinking: (text) => {
              thinking += text;
              patchMessage(assistantId, { thinking });
            },
          },
          controller.signal,
        );

        if (result.retryScheduled) {
          const seconds = result.retryScheduled.retryAfterSeconds;
          finish({
            error:
              seconds !== null
                ? `Corez is busy. Try again in ${seconds}s.`
                : "Corez is busy. Try again shortly.",
          });
        } else if (result.errorEvent?.message) {
          finish({ error: result.errorEvent.message });
        } else if (!result.sawDone) {
          finish({ error: t("chat.error.streamIncomplete") });
        } else {
          finish({});
        }
      } catch (caught) {
        if (controller.signal.aborted) {
          finish({});
        } else {
          finish({ error: friendlyError(caught) });
        }
      } finally {
        clearFlush();
        stopTimer();
        setElapsedMs(0);
        setStreaming(false);
        abortRef.current = null;
      }

      // Persist the answer (including a partial answer after Stop) and make the
      // new chat's URL real so it can be reloaded, shared or deep-linked.
      if (activeChatId && assistantText.trim()) {
        try {
          await appendMessage(activeChatId, {
            role: "assistant",
            content: assistantText,
          });
        } catch {
          setNotice("Answer shown, but it could not be saved to this chat.");
        }
      }
      if (createdThisTurn && activeChatId) {
        router.replace(`/chat/${activeChatId}`);
      }
    },
    [attachments, chatId, input, streaming, publishMessages, patchMessage, stopTimer, t],
  );

  const isEmpty = messages.length === 0;
  const liveThinkingChars = messages.reduce(
    (sum, message) =>
      sum + (message.streaming ? message.thinking?.length || 0 : 0),
    0,
  );
  const liveRate =
    elapsedMs > 0
      ? liveThinkingChars / THINKING_TOKEN_RATIO / (elapsedMs / 1000)
      : 0;

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.bgPrimary }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 10,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("chat.history.title")}
          onPress={() => setHistoryOpen(true)}
          hitSlop={12}
          style={styles.headerButton}
        >
          <Text style={{ color: colors.textPrimary, fontSize: 18 }}>☰</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={[styles.brand, { color: colors.textPrimary }]}>COREZ</Text>
          {chatTitle ? (
            <Text
              numberOfLines={1}
              style={[styles.chatTitle, { color: colors.textSecondary }]}
            >
              {chatTitle}
            </Text>
          ) : (
            <Text style={[styles.previewTag, { color: colors.textMuted }]}>
              {t("common.chat.mobileTag")}
            </Text>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("shell.settings")}
          onPress={() => router.push("/settings")}
          hitSlop={12}
          style={styles.headerButton}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 20 }}>⚙</Text>
        </Pressable>
      </View>

      {notice ? (
        <Text
          accessibilityRole="alert"
          style={[styles.notice, { color: colors.negative }]}
        >
          {notice}
        </Text>
      ) : null}

      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.messages}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onContentSizeChange={() => {
          if (streaming) scrollRef.current?.scrollToEnd({ animated: false });
        }}
      >
        {loadingChat ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.textSecondary} />
          </View>
        ) : loadError ? (
          <View style={styles.centered}>
            <Text style={[styles.loadErrorTitle, { color: colors.textPrimary }]}>
              {t("chat.history.loadFailed")}
            </Text>
            <Text style={[styles.loadErrorBody, { color: colors.textSecondary }]}>
              {loadError}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (initialChatId) void loadStoredChat(initialChatId);
              }}
              style={[styles.retry, { borderColor: colors.borderHover }]}
            >
              <Text style={{ color: colors.textPrimary }}>{t("common.action.retry")}</Text>
            </Pressable>
          </View>
        ) : isEmpty ? (
          <View style={styles.hero}>
            <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
              {t("newChat.title")}
            </Text>
            <Text style={[styles.heroUser, { color: colors.textMuted }]}>
              {user?.email}
            </Text>
            <View style={styles.starters}>
              {[
                t("home.starters.website"),
                t("home.starters.game"),
                t("home.starters.image"),
                t("home.starters.research"),
              ].map((label) => (
                <Pressable
                  key={label}
                  accessibilityRole="button"
                  onPress={() => setInput(`${label}: `)}
                  style={({ pressed }) => [
                    styles.starter,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.bgCard,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.starterLabel,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              thinkingExpanded={thinkingExpanded}
              onToggleThinking={() => setThinkingExpanded((prev) => !prev)}
              streamElapsedMs={elapsedMs}
              tokensPerSecond={liveRate}
            />
          ))
        )}
      </ScrollView>

      <View style={[styles.composerWrap, { paddingBottom: insets.bottom + 10 }]}>
        <Composer
          value={input}
          onChangeText={setInput}
          onSend={() => void send()}
          onStop={stop}
          streaming={streaming}
          editable={!loadingChat && !loadError}
          autoFocus={false}
          attachments={attachments}
          attachmentBusy={attachmentBusy}
          attachmentError={attachmentError}
          onPickAttachment={(source) => void addAttachment(source)}
          onRemoveAttachment={removeAttachment}
          dictationStatus={dictation.status}
          dictationError={dictation.error}
          onToggleDictation={dictation.toggle}
        />
      </View>

      <ChatHistorySheet
        visible={historyOpen}
        activeChatId={chatId}
        onClose={() => setHistoryOpen(false)}
        onSelect={(id) => {
          setAttachments([]);
          setAttachmentError(null);
          router.push(`/chat/${id}`);
        }}
        onNewChat={() => {
          setAttachments([]);
          setAttachmentError(null);
          router.replace("/chat");
        }}
        onDeleted={(deletedId) => {
          if (deletedId !== chatId) return;
          setChatId(null);
          setChatTitle(null);
          publishMessages([]);
          router.replace("/chat");
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
  },
  chatTitle: {
    flexShrink: 1,
    fontSize: 13,
  },
  headerButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    fontFamily: "Outfit_700Bold",
    fontSize: 16,
    letterSpacing: 3.5,
  },
  previewTag: {
    fontSize: 10.5,
    letterSpacing: 0.06,
    textTransform: "uppercase",
  },
  notice: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 12.5,
  },
  messages: {
    paddingTop: 18,
    paddingBottom: 12,
    flexGrow: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 24,
  },
  loadErrorTitle: { fontSize: 16, fontWeight: "600", textAlign: "center" },
  loadErrorBody: { fontSize: 13.5, textAlign: "center", maxWidth: 320 },
  retry: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 18,
    minHeight: 40,
    justifyContent: "center",
  },
  hero: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
    gap: 10,
  },
  heroTitle: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 26,
    lineHeight: 34,
    letterSpacing: -0.4,
  },
  heroUser: {
    fontSize: 13,
  },
  starters: {
    marginTop: 14,
    gap: 8,
  },
  starter: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  starterLabel: {
    fontSize: 13.5,
  },
  composerWrap: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
});
