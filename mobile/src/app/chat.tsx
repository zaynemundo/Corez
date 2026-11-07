/**
 * Chat screen (Phase 0 spike).
 *
 * Proves the riskiest assumptions with the real Worker: bearer auth, streamed
 * SSE deltas, live thinking events and abort. History persistence, markdown,
 * attachments and the canvas arrive in Phase 1.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import {
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
import { SessionGate } from "@/components/SessionGate";
import { streamChatTurn, type ChatHistoryMessage } from "@/api/ai";
import { useAuth } from "@/state/auth";
import { useTheme } from "@/state/theme";
import { useI18n } from "@/i18n";
import { friendlyError } from "@/lib/errors";

const THINKING_TOKEN_RATIO = 4;

export default function ChatScreen() {
  return (
    <SessionGate>
      <ChatView />
    </SessionGate>
  );
}

function ChatView() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const colors = theme.colors;

  const [messages, setMessages] = useState<ChatMessageModel[]>([]);
  const messagesRef = useRef<ChatMessageModel[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [thinkingExpanded, setThinkingExpanded] = useState(true);
  const [elapsedMs, setElapsedMs] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const scrollRef = useRef<ScrollViewInstance | null>(null);

  const publishMessages = useCallback(
    (next: ChatMessageModel[] | ((prev: ChatMessageModel[]) => ChatMessageModel[])) => {
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

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const send = useCallback(
    async (override?: string) => {
      const prompt = (override ?? input).trim();
      if (!prompt || streaming) return;

      const history: ChatHistoryMessage[] = messagesRef.current
        .filter((message) => !message.streaming && message.content.trim())
        .map((message) => ({
          role: message.role,
          content: message.content,
        }));

      const now = Date.now();
      const userId = `u-${now}`;
      const assistantId = `a-${now}`;
      const userMessage: ChatMessageModel = {
        id: userId,
        role: "user",
        content: prompt,
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

      const finish = (patch: Partial<ChatMessageModel>) => {
        const elapsed = Date.now() - startedAtRef.current;
        patchMessage(assistantId, {
          streaming: false,
          thinking,
          thinkingSeconds: Math.max(0, Math.round(elapsed / 1000)),
          ...patch,
        });
      };

      try {
        const result = await streamChatTurn(
          { prompt, messages: history },
          {
            onDelta: (text) => {
              publishMessages((prev) =>
                prev.map((message) =>
                  message.id === assistantId
                    ? { ...message, content: message.content + text }
                    : message,
                ),
              );
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
        stopTimer();
        setElapsedMs(0);
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [input, streaming, publishMessages, patchMessage, stopTimer, t],
  );

  const streams = messages.length === 0;
  const liveThinkingChars = messages.reduce(
    (sum, message) =>
      sum + (message.streaming ? message.thinking?.length || 0 : 0),
    0,
  );
  const liveRate =
    elapsedMs > 0 ? liveThinkingChars / THINKING_TOKEN_RATIO / (elapsedMs / 1000) : 0;

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
        <View style={styles.headerText}>
          <Text style={[styles.brand, { color: colors.textPrimary }]}>COREZ</Text>
          <Text style={[styles.previewTag, { color: colors.textMuted }]}>
            Preview build
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("shell.settings")}
          onPress={() => router.push("/settings")}
          hitSlop={12}
          style={styles.settingsButton}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 20 }}>⚙</Text>
        </Pressable>
      </View>

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
        {streams ? (
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
                    style={[styles.starterLabel, { color: colors.textSecondary }]}
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
          autoFocus={false}
        />
      </View>
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
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
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
  settingsButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  messages: {
    paddingTop: 18,
    paddingBottom: 12,
    flexGrow: 1,
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
