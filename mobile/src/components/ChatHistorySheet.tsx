/**
 * Recent chats sheet.
 *
 * The server list is the source of truth (`GET /api/chats`), so this is also
 * the first screen that proves mobile chat persistence end to end.
 */
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { listChats, type ChatSummary } from "@/api/chats";
import { useTheme } from "@/state/theme";
import { useI18n } from "@/i18n";

interface ChatHistorySheetProps {
  visible: boolean;
  activeChatId?: string | null;
  onClose: () => void;
  onSelect: (chatId: string) => void;
  onNewChat: () => void;
}

function relativeLabel(updatedAt: number, now = Date.now()): string {
  const diff = Math.max(0, now - (Number(updatedAt) || now));
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const date = new Date(Number(updatedAt) || now);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ChatHistorySheet({
  visible,
  activeChatId,
  onClose,
  onSelect,
  onNewChat,
}: ChatHistorySheetProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const colors = theme.colors;

  const chatsQuery = useQuery({
    queryKey: ["chats"],
    queryFn: listChats,
    enabled: visible,
    staleTime: 10_000,
  });

  const chats: ChatSummary[] = chatsQuery.data?.chats ?? [];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <Pressable
          style={styles.backdropPress}
          accessibilityLabel={t("common.action.close")}
          onPress={onClose}
        />
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.bgPrimary, borderColor: colors.border },
          ]}
        >
          <View style={styles.handleRow}>
            <View style={[styles.handle, { backgroundColor: colors.borderHover }]} />
          </View>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              {t("chat.history.title")}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onClose();
                onNewChat();
              }}
              style={({ pressed }) => [
                styles.newButton,
                {
                  borderColor: colors.borderHover,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text style={[styles.newButtonLabel, { color: colors.textPrimary }]}>
                {t("chat.history.new")}
              </Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.list}>
            {chatsQuery.isLoading ? (
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                {t("chat.history.loading")}
              </Text>
            ) : chatsQuery.isError ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void chatsQuery.refetch()}
              >
                <Text style={[styles.hint, { color: colors.negative }]}>
                  {t("chat.history.error")}
                </Text>
              </Pressable>
            ) : chats.length === 0 ? (
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                {t("chat.history.empty")}
              </Text>
            ) : (
              chats.map((chat) => {
                const active = chat.id === activeChatId;
                return (
                  <Pressable
                    key={chat.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      onClose();
                      onSelect(chat.id);
                    }}
                    style={({ pressed }) => [
                      styles.row,
                      {
                        backgroundColor: active
                          ? colors.bgTertiary
                          : pressed
                            ? colors.bgCard
                            : "transparent",
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[styles.rowTitle, { color: colors.textPrimary }]}
                    >
                      {chat.title || t("chat.history.untitled")}
                    </Text>
                    <Text style={[styles.rowTime, { color: colors.textMuted }]}>
                      {relativeLabel(chat.updatedAt)}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  backdropPress: { flex: 1 },
  sheet: {
    maxHeight: "72%",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 18,
  },
  handleRow: { alignItems: "center", paddingTop: 8, paddingBottom: 4 },
  handle: { width: 38, height: 4, borderRadius: 2 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  title: { fontFamily: "Outfit_600SemiBold", fontSize: 18 },
  newButton: {
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 12,
    minHeight: 34,
    justifyContent: "center",
  },
  newButtonLabel: { fontSize: 12.5, fontWeight: "600" },
  list: { paddingHorizontal: 12, paddingBottom: 10, gap: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowTitle: { flex: 1, fontSize: 14.5 },
  rowTime: { fontSize: 11.5 },
  hint: { padding: 14, fontSize: 13.5, textAlign: "center" },
});
