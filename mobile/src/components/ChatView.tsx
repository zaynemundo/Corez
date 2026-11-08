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
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  type ScrollViewInstance,
  type TextInputInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
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
  getChatWithCache,
} from "@/api/chats";
import { createChatShare } from "@/api/shareChat";
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
import {
  buildPersonaPrompt,
  cleanReply,
  conversationHistory,
  orderSpeakers,
  speakersForPrompt,
  type Persona,
} from "@/lib/conversation";
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
  const [offlineNotice, setOfflineNotice] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sharingChat, setSharingChat] = useState(false);
  const [conversationPersonas, setConversationPersonas] = useState<Persona[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const scrollRef = useRef<ScrollViewInstance | null>(null);
  const composerRef = useRef<TextInputInstance | null>(null);
  const revisionCodeRef = useRef<string | null>(null);

  const reviseCode = useCallback((code: string) => {
    revisionCodeRef.current = code;
    setInput("Revise code: ");
    setNotice(null);
    setTimeout(() => composerRef.current?.focus(), 80);
  }, []);

  const shareChat = useCallback(async () => {
    if (sharingChat) return;
    if (!chatId) {
      setNotice(t("chat.share.empty"));
      return;
    }
    setSharingChat(true);
    setNotice(null);
    try {
      const result = await createChatShare(chatId);
      if (result.url) await Share.share({ message: result.url });
    } catch (caught) {
      setNotice(friendlyError(caught, t("chat.share.failed")));
    } finally {
      setSharingChat(false);
    }
  }, [chatId, sharingChat, t]);

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
      revisionCodeRef.current = null;
      setLoadingChat(true);
      setLoadError(null);
      setChatId(id);
      try {
        const detail = await getChatWithCache(id);
        if (seq !== loadSeqRef.current) return;
        setChatTitle(detail.title || null);
        setConversationPersonas(
          detail.chatMode === "conversation" && Array.isArray(detail.personas)
            ? detail.personas
            : [],
        );
        setOfflineNotice(Boolean(detail.offline));
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
              ...(message.speakerId ? { speakerId: message.speakerId } : {}),
              ...(message.speakerName
                ? { speakerName: message.speakerName }
                : {}),
              ...(message.turnId ? { turnId: message.turnId } : {}),
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
      setConversationPersonas([]);
      setOfflineNotice(false);
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
      let apiPrompt = `${prompt}${buildAttachmentPrompt(turnAttachments)}`;
      const revisionCode = revisionCodeRef.current;
      if (revisionCode) {
        apiPrompt = `${apiPrompt}\n\n[Existing code to revise - apply the requested change directly and output the complete updated file]:\n\`\`\`html\n${revisionCode}\n\`\`\``;
        revisionCodeRef.current = null;
      }
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
      const conversation = conversationPersonas.length === 2;
      const conversationTurnId = `turn-${Date.now()}`;

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
            ...(conversation
              ? {
                  chatMode: "conversation" as const,
                  personas: conversationPersonas,
                }
              : {}),
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
            ...(conversation
              ? {
                  speakerId: "user",
                  speakerName: "You",
                  turnId: conversationTurnId,
                }
              : {}),
          });
        }
      } catch (caught) {
        setNotice(friendlyError(caught));
        return;
      }
      setOfflineNotice(false);

      if (conversation) {
        const now = Date.now();
        const userMessage: ChatMessageModel = {
          id: `u-${now}`,
          role: "user",
          content: prompt,
          speakerId: "user",
          speakerName: "You",
          turnId: conversationTurnId,
          ...(displayAttachments.length > 0
            ? { attachments: displayAttachments }
            : {}),
        };
        const baseHistory: ChatHistoryMessage[] = [
          ...conversationHistory(messagesRef.current),
          {
            role: "user" as const,
            content: prompt,
            ...(apiAttachments.length > 0
              ? { attachments: apiAttachments }
              : {}),
          },
        ];
        publishMessages((prev) => [...prev, userMessage]);
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
        const publicIntent = classifyPublicIntent(prompt);
        const fineIntent = classifyEngineIntent(prompt);
        let previousSpeaker: Persona | null = null;

        try {
          const speakers = orderSpeakers(
            speakersForPrompt(conversationPersonas, prompt),
          );
          for (const speaker of speakers) {
            if (controller.signal.aborted) break;
            const placeholderId = `a-${Date.now()}-${speaker.id}`;
            publishMessages((prev) => [
              ...prev,
              {
                id: placeholderId,
                role: "assistant",
                content: "",
                thinking: "",
                streaming: true,
                speakerId: speaker.id,
                speakerName: speaker.name,
                turnId: conversationTurnId,
              },
            ]);
            let thinking = "";
            let text = "";
            const personaPrompt = buildPersonaPrompt({
              speaker,
              personas: conversationPersonas,
              previousSpeaker,
              userPrompt: prompt,
            });
            try {
              const result = await streamChatTurn(
                {
                  prompt: personaPrompt,
                  messages: baseHistory,
                  intent: {
                    type: publicIntent.label,
                    confidence: publicIntent.confidence,
                  },
                  fineIntent,
                },
                {
                  onDelta: (delta) => {
                    text += delta;
                    patchMessage(placeholderId, { content: text });
                  },
                  onThinking: (chunk) => {
                    thinking += chunk;
                    patchMessage(placeholderId, { thinking });
                  },
                },
                controller.signal,
              );
              const cleaned = cleanReply(text, speaker.name);
              patchMessage(placeholderId, {
                content: cleaned || text,
                streaming: false,
                thinking,
                thinkingSeconds: Math.max(
                  0,
                  Math.round((Date.now() - startedAtRef.current) / 1000),
                ),
                ...(result.errorEvent?.message
                  ? { error: result.errorEvent.message }
                  : {}),
              });
              if (cleaned.trim()) {
                baseHistory.push({
                  role: "assistant",
                  content: `${speaker.name}: ${cleaned}`,
                });
                if (activeChatId) {
                  await appendMessage(activeChatId, {
                    role: "assistant",
                    content: cleaned,
                    turnId: conversationTurnId,
                    speakerId: speaker.id,
                    speakerName: speaker.name,
                    modelId: "deepseek-v4.1-flash",
                  }).catch(() => {});
                }
              }
            } catch (caught) {
              patchMessage(placeholderId, {
                streaming: false,
                ...(controller.signal.aborted
                  ? {}
                  : { error: friendlyError(caught) }),
              });
            }
            previousSpeaker = speaker;
          }
        } finally {
          stopTimer();
          setElapsedMs(0);
          setStreaming(false);
          abortRef.current = null;
        }

        if (createdThisTurn && activeChatId) {
          router.replace(`/chat/${activeChatId}`);
        }
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
    [
      attachments,
      chatId,
      conversationPersonas,
      input,
      streaming,
      publishMessages,
      patchMessage,
      stopTimer,
      t,
    ],
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
          style={[styles.headerButton, { backgroundColor: colors.bgTertiary }]}
        >
          <Feather name="menu" size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.brandWrap}>
          <Image
            source={require("../../assets/android-icon-foreground.png")}
            style={styles.headerMark}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          <View style={styles.headerText}>
            <Text style={[styles.brand, { color: colors.textPrimary }]}>
              COREZ
            </Text>
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
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("chat.share.action")}
            onPress={() => void shareChat()}
            disabled={sharingChat}
            hitSlop={12}
            style={[styles.headerButton, { backgroundColor: colors.bgTertiary }]}
          >
            {sharingChat ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <Feather name="share-2" size={18} color={colors.textSecondary} />
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("shell.settings")}
            onPress={() => router.push("/settings")}
            hitSlop={12}
            style={[styles.headerButton, { backgroundColor: colors.bgTertiary }]}
          >
            <Feather name="settings" size={19} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      {notice ? (
        <Text
          accessibilityRole="alert"
          style={[styles.notice, { color: colors.negative }]}
        >
          {notice}
        </Text>
      ) : null}

      {offlineNotice ? (
        <Text style={[styles.notice, { color: colors.caution }]}>
          {t("chat.offline.messages")}
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
            <Image
              source={require("../../assets/android-icon-foreground.png")}
              style={styles.heroMark}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
            <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
              {t("newChat.title")}
            </Text>
            <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
              {t("newChat.subtitle")}
            </Text>
            {user?.email ? (
              <Text style={[styles.heroUser, { color: colors.textMuted }]}>
                {user.email}
              </Text>
            ) : null}
            <View style={styles.starterGrid}>
              {[
                {
                  key: "website",
                  icon: "layout" as const,
                  label: t("home.starters.website"),
                  hint: t("home.starters.websiteHint"),
                  conversation: false,
                },
                {
                  key: "game",
                  icon: "zap" as const,
                  label: t("home.starters.game"),
                  hint: t("home.starters.gameHint"),
                  conversation: false,
                },
                {
                  key: "image",
                  icon: "image" as const,
                  label: t("home.starters.image"),
                  hint: t("home.starters.imageHint"),
                  conversation: false,
                },
                {
                  key: "research",
                  icon: "search" as const,
                  label: t("home.starters.research"),
                  hint: t("home.starters.researchHint"),
                  conversation: false,
                },
                {
                  key: "conversation",
                  icon: "users" as const,
                  label: t("home.starters.conversation"),
                  hint: t("home.starters.conversationHint"),
                  conversation: true,
                },
              ].map((starter) => (
                <Pressable
                  key={starter.key}
                  accessibilityRole="button"
                  accessibilityLabel={starter.label}
                  onPress={() => {
                    if (starter.conversation) {
                      router.push("/conversation/new");
                      return;
                    }
                    setInput(`${starter.label}: `);
                  }}
                  style={({ pressed }) => [
                    starter.conversation ? styles.starterWide : styles.starterCard,
                    {
                      borderColor: starter.conversation
                        ? colors.borderHover
                        : colors.border,
                      backgroundColor: starter.conversation
                        ? colors.bgTertiary
                        : colors.bgCard,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.starterIcon,
                      { backgroundColor: colors.bgTertiary },
                    ]}
                  >
                    <Feather
                      name={starter.icon}
                      size={17}
                      color={colors.textPrimary}
                    />
                  </View>
                  <View style={styles.starterText}>
                    <Text
                      numberOfLines={1}
                      style={[styles.starterLabel, { color: colors.textPrimary }]}
                    >
                      {starter.label}
                    </Text>
                    <Text
                      numberOfLines={2}
                      style={[styles.starterHint, { color: colors.textMuted }]}
                    >
                      {starter.hint}
                    </Text>
                  </View>
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
              onReviseCode={reviseCode}
              publishSessionId={chatId}
              streamElapsedMs={elapsedMs}
              tokensPerSecond={liveRate}
            />
          ))
        )}
      </ScrollView>

      <View style={[styles.composerWrap, { paddingBottom: insets.bottom + 10 }]}>
        <Composer
          ref={composerRef}
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
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  brandWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  headerMark: { width: 22, height: 22 },
  headerText: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  chatTitle: {
    flexShrink: 1,
    fontSize: 13,
  },
  headerButton: {
    width: 38,
    height: 38,
    minWidth: 38,
    minHeight: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginLeft: 8,
  },
  brand: {
    fontFamily: "Outfit_700Bold",
    fontSize: 15,
    letterSpacing: 3.2,
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
    paddingHorizontal: 18,
    gap: 8,
  },
  heroMark: {
    width: 54,
    height: 54,
    alignSelf: "center",
    marginBottom: 12,
  },
  heroTitle: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 28,
    lineHeight: 35,
    letterSpacing: -0.5,
    textAlign: "center",
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  heroUser: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 2,
  },
  starterGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 18,
  },
  starterCard: {
    flexBasis: "48%",
    flexGrow: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    gap: 9,
    minHeight: 106,
  },
  starterWide: {
    flexBasis: "100%",
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 12,
    minHeight: 68,
  },
  starterIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  starterText: {
    flexShrink: 1,
    gap: 3,
  },
  starterLabel: {
    fontSize: 13.5,
    fontWeight: "600",
  },
  starterHint: {
    fontSize: 11.5,
    lineHeight: 15,
  },
  composerWrap: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
});
