/**
 * Recent chats sheet.
 *
 * The server list is the source of truth (`GET /api/chats`): pinned chats are
 * held above recents, and each row can be renamed, pinned/unpinned or deleted.
 * Mutations invalidate the list query so the sheet and the header stay honest.
 */
import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteChat,
  forgetCachedChat,
  listChatsWithCache,
  patchChatTitle,
  setChatPinned,
  type ChatSummary,
} from "@/api/chats";
import { useTheme } from "@/state/theme";
import { useI18n } from "@/i18n";
import { friendlyError } from "@/lib/errors";

interface ChatHistorySheetProps {
  visible: boolean;
  activeChatId?: string | null;
  onClose: () => void;
  onSelect: (chatId: string) => void;
  onNewChat: () => void;
  onDeleted?: (chatId: string) => void;
}

type ActionMode = "menu" | "rename" | "delete" | null;

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
  onDeleted,
}: ChatHistorySheetProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const colors = theme.colors;
  const queryClient = useQueryClient();
  const [actionChat, setActionChat] = useState<ChatSummary | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [renameValue, setRenameValue] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const chatsQuery = useQuery({
    queryKey: ["chats"],
    queryFn: listChatsWithCache,
    enabled: visible,
    staleTime: 10_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["chats"] });

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      patchChatTitle(id, title),
    onSuccess: async () => {
      setActionMode(null);
      setActionChat(null);
      await refresh();
    },
    onError: (error) => setActionError(friendlyError(error)),
  });

  const pinMutation = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      setChatPinned(id, pinned),
    onSuccess: async () => {
      setActionMode(null);
      setActionChat(null);
      await refresh();
    },
    onError: (error) => setActionError(friendlyError(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteChat(id),
    onSuccess: async (_result, id) => {
      forgetCachedChat(id);
      setActionMode(null);
      setActionChat(null);
      await refresh();
      onDeleted?.(id);
    },
    onError: (error) => setActionError(friendlyError(error)),
  });

  const chats: ChatSummary[] = chatsQuery.data?.chats ?? [];
  const pinned = chats.filter((chat) => Boolean(chat.pinnedAt));
  const recent = chats.filter((chat) => !chat.pinnedAt);
  const busy =
    renameMutation.isPending || pinMutation.isPending || deleteMutation.isPending;

  const openMenu = (chat: ChatSummary) => {
    setActionError(null);
    setActionChat(chat);
    setActionMode("menu");
  };

  const closeActions = () => {
    if (busy) return;
    setActionMode(null);
    setActionChat(null);
  };

  const renderRow = (chat: ChatSummary) => {
    const active = chat.id === activeChatId;
    return (
      <View
        key={chat.id}
        style={[
          styles.row,
          {
            backgroundColor: active ? colors.bgTertiary : "transparent",
            borderColor: colors.border,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: active }}
          onPress={() => {
            onClose();
            onSelect(chat.id);
          }}
          onLongPress={() => openMenu(chat)}
          style={styles.rowMain}
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("chat.history.actions")}
          onPress={() => openMenu(chat)}
          hitSlop={8}
          style={styles.moreButton}
        >
          <Feather name="more-horizontal" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
    );
  };

  return (
    <>
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
              <View
                style={[styles.handle, { backgroundColor: colors.borderHover }]}
              />
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
                <Text
                  style={[styles.newButtonLabel, { color: colors.textPrimary }]}
                >
                  {t("chat.history.new")}
                </Text>
              </Pressable>
            </View>

            {chatsQuery.data?.offline ? (
              <Text style={[styles.offlineHint, { color: colors.caution }]}>
                {t("chat.offline.chats")}
              </Text>
            ) : null}

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
                <>
                  {pinned.length > 0 ? (
                    <Text
                      style={[styles.sectionLabel, { color: colors.textMuted }]}
                    >
                      {t("chat.history.pinned")}
                    </Text>
                  ) : null}
                  {pinned.map(renderRow)}
                  {recent.length > 0 && pinned.length > 0 ? (
                    <Text
                      style={[styles.sectionLabel, { color: colors.textMuted }]}
                    >
                      {t("chat.history.recent")}
                    </Text>
                  ) : null}
                  {recent.map(renderRow)}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={actionMode !== null}
        animationType="fade"
        transparent
        onRequestClose={closeActions}
      >
        <Pressable
          style={[styles.actionBackdrop, { backgroundColor: colors.overlay }]}
          onPress={closeActions}
          accessibilityLabel={t("common.action.cancel")}
        >
          <Pressable
            style={[
              styles.actionCard,
              { backgroundColor: colors.bgSecondary, borderColor: colors.border },
            ]}
            onPress={(event) => event.stopPropagation()}
          >
            {actionMode === "rename" ? (
              <>
                <Text style={[styles.actionTitle, { color: colors.textPrimary }]}>
                  {t("chat.history.renameTitle")}
                </Text>
                <TextInput
                  value={renameValue}
                  onChangeText={setRenameValue}
                  autoFocus
                  maxLength={120}
                  placeholder={t("chat.history.renamePlaceholder")}
                  placeholderTextColor={colors.textMuted}
                  style={[
                    styles.renameInput,
                    {
                      color: colors.textPrimary,
                      borderColor: colors.border,
                      backgroundColor: colors.bgPrimary,
                    },
                  ]}
                  accessibilityLabel={t("chat.history.renameTitle")}
                />
                <View style={styles.actionRow}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={closeActions}
                    style={[styles.actionButton, { borderColor: colors.border }]}
                  >
                    <Text style={{ color: colors.textSecondary }}>
                      {t("common.action.cancel")}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy || !renameValue.trim()}
                    onPress={() => {
                      if (!actionChat) return;
                      renameMutation.mutate({
                        id: actionChat.id,
                        title: renameValue.trim(),
                      });
                    }}
                    style={[
                      styles.actionButton,
                      {
                        borderColor: colors.actionStrong,
                        backgroundColor: colors.actionStrong,
                        opacity: busy || !renameValue.trim() ? 0.5 : 1,
                      },
                    ]}
                  >
                    {renameMutation.isPending ? (
                      <ActivityIndicator
                        size="small"
                        color={colors.actionStrongContrast}
                      />
                    ) : (
                      <Text
                        style={{ color: colors.actionStrongContrast }}
                      >
                        {t("chat.history.save")}
                      </Text>
                    )}
                  </Pressable>
                </View>
              </>
            ) : actionMode === "delete" ? (
              <>
                <Text style={[styles.actionTitle, { color: colors.textPrimary }]}>
                  {t("chat.history.deleteTitle")}
                </Text>
                <Text style={[styles.actionBody, { color: colors.textSecondary }]}>
                  {t("chat.history.deleteBody")}
                </Text>
                <View style={styles.actionRow}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={closeActions}
                    style={[styles.actionButton, { borderColor: colors.border }]}
                  >
                    <Text style={{ color: colors.textSecondary }}>
                      {t("common.action.cancel")}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => {
                      if (actionChat) deleteMutation.mutate(actionChat.id);
                    }}
                    style={[
                      styles.actionButton,
                      {
                        borderColor: colors.negative,
                        opacity: busy ? 0.5 : 1,
                      },
                    ]}
                  >
                    {deleteMutation.isPending ? (
                      <ActivityIndicator size="small" color={colors.negative} />
                    ) : (
                      <Text style={{ color: colors.negative }}>
                        {t("chat.history.delete")}
                      </Text>
                    )}
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text
                  numberOfLines={1}
                  style={[styles.actionTitle, { color: colors.textPrimary }]}
                >
                  {actionChat?.title || t("chat.history.untitled")}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setRenameValue(actionChat?.title || "");
                    setActionMode("rename");
                  }}
                  style={[styles.menuRow, { borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.textPrimary }}>
                    {t("chat.history.rename")}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    if (!actionChat) return;
                    pinMutation.mutate({
                      id: actionChat.id,
                      pinned: !actionChat.pinnedAt,
                    });
                  }}
                  style={[styles.menuRow, { borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.textPrimary }}>
                    {actionChat?.pinnedAt
                      ? t("chat.history.unpin")
                      : t("chat.history.pin")}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setActionMode("delete")}
                  style={[styles.menuRow, { borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.negative }}>
                    {t("chat.history.delete")}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={closeActions}
                  style={[styles.menuRow, { borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.textSecondary }}>
                    {t("common.action.cancel")}
                  </Text>
                </Pressable>
              </>
            )}
            {actionError ? (
              <Text
                accessibilityRole="alert"
                style={[styles.actionError, { color: colors.negative }]}
              >
                {actionError}
              </Text>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
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
  sectionLabel: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 0.08,
    textTransform: "uppercase",
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 48,
    paddingLeft: 10,
  },
  rowTitle: { flex: 1, fontSize: 14.5 },
  rowTime: { fontSize: 11.5 },
  moreButton: {
    width: 44,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: { padding: 14, fontSize: 13.5, textAlign: "center" },
  offlineHint: {
    fontSize: 12,
    paddingHorizontal: 18,
    paddingBottom: 6,
  },
  actionBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
  },
  actionCard: {
    width: "100%",
    maxWidth: 420,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  actionTitle: { fontFamily: "Outfit_600SemiBold", fontSize: 17 },
  actionBody: { fontSize: 13.5, lineHeight: 20 },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  actionButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  renameInput: {
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 46,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  menuRow: {
    minHeight: 46,
    justifyContent: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 2,
  },
  actionError: { fontSize: 12.5 },
});
