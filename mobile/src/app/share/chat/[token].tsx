/**
 * Public, read-only shared conversation viewer.
 *
 * Opens from `https://corez.pro/share/chat/<token>` (Android App Link) or
 * `corez://share/chat/<token>`, with no session required. Content is a frozen
 * snapshot: later messages do not appear, and revoking the share makes this
 * route return "unavailable".
 */
import { router, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { getSharedChat } from "@/api/shareChat";
import { MarkdownView } from "@/components/MarkdownView";
import { friendlyError } from "@/lib/errors";
import { API_BASE_URL } from "@/api/client";
import { useTheme } from "@/state/theme";
import { useI18n } from "@/i18n";

export default function SharedChatScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const token = typeof params.token === "string" ? params.token : "";
  const { theme } = useTheme();
  const { t } = useI18n();
  const colors = theme.colors;

  const shareUrl = token
    ? `${API_BASE_URL}/share/chat/${encodeURIComponent(token)}`
    : "";

  const sharedQuery = useQuery({
    queryKey: ["shared-chat", token],
    queryFn: () => getSharedChat(token),
    enabled: Boolean(token),
    staleTime: 60_000,
    retry: 1,
  });

  const data = sharedQuery.data;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.bgPrimary }]}
      edges={["top", "bottom"]}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/chat")
          }
          hitSlop={12}
          style={styles.headerButton}
        >
          <Text style={{ color: colors.textPrimary, fontSize: 22 }}>‹</Text>
        </Pressable>
        <Text numberOfLines={1} style={[styles.title, { color: colors.textPrimary }]}>
          {t("shareChat.title")}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("shareChat.share")}
          disabled={!data}
          onPress={() =>
            void Share.share({ message: shareUrl }).catch(() => {})
          }
          hitSlop={12}
          style={styles.headerButton}
        >
          <Text style={{ color: colors.textMuted, fontSize: 18 }}>↗</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {sharedQuery.isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.textSecondary} />
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              {t("shareChat.loading")}
            </Text>
          </View>
        ) : sharedQuery.isError ? (
          <View style={styles.centered}>
            <Text style={[styles.hint, { color: colors.negative }]}>
              {friendlyError(sharedQuery.error, t("shareChat.unavailable"))}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace("/")}
              style={[styles.primary, { backgroundColor: colors.textPrimary }]}
            >
              <Text style={{ color: colors.bgPrimary, fontWeight: "600" }}>
                {t("shareChat.openApp")}
              </Text>
            </Pressable>
          </View>
        ) : data ? (
          <>
            <Text style={[styles.chatTitle, { color: colors.textPrimary }]}>
              {data.title || t("shareChat.untitled")}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              {t("shareChat.snapshot")}
            </Text>
            {data.messages.length === 0 ? (
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                {t("shareChat.empty")}
              </Text>
            ) : (
              data.messages.map((message, index) => (
                <View
                  key={`${message.role}-${index}`}
                  style={[
                    styles.message,
                    {
                      backgroundColor: colors.bgCard,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.role, { color: colors.textMuted }]}>
                    {message.role === "assistant"
                      ? "COREZ"
                      : message.speakerName || t("shareChat.you")}
                  </Text>
                  <MarkdownView content={message.content} />
                </View>
              ))
            )}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace("/")}
              style={[styles.primary, { backgroundColor: colors.textPrimary }]}
            >
              <Text style={{ color: colors.bgPrimary, fontWeight: "600" }}>
                {t("shareChat.openApp")}
              </Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Outfit_600SemiBold",
    fontSize: 16,
  },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  centered: { paddingVertical: 50, alignItems: "center", gap: 10 },
  chatTitle: { fontFamily: "Outfit_600SemiBold", fontSize: 22 },
  subtitle: { fontSize: 12.5 },
  hint: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  message: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  role: {
    fontSize: 11,
    letterSpacing: 1.2,
    fontFamily: "JetBrainsMono_400Regular",
  },
  primary: {
    marginTop: 8,
    borderRadius: 9999,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
});
