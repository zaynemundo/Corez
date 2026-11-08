/**
 * Recent chats sheet.
 *
 * The server list is the source of truth (`GET /api/chats`): pinned chats are
 * held above recents, and each row can be renamed, pinned/unpinned or deleted.
 * Mutations invalidate the list query so the sheet and the header stay honest.
 */
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  deleteChat,
  forgetCachedChat,
  listChatsWithCache,
  patchChatTitle,
  setChatPinned,
  type ChatSummary,
} from "@/api/chats";
import { useAuth } from "@/state/auth";
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
  const insets = useSafeAreaInsets();
  const [slide] = useState(() => new Animated.Value(-1));

  useEffect(() => {
    if (!visible) return;
    slide.setValue(-1);
    Animated.timing(slide, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [slide, visible]);
  const queryClient = useQueryClient();
  const [actionChat, setActionChat] = useState<ChatSummary | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [renameValue, setRenameValue] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(true);
  const [messagesOpen, setMessagesOpen] = useState(true);
  const { user } = useAuth();

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
  const recentChats = chats.filter(
    (chat) => !chat.pinnedAt && chat.chatMode !== "conversation",
  );
  const messageChats = chats.filter(
    (chat) => !chat.pinnedAt && chat.chatMode === "conversation",
  );
  const emailLocal = String(user?.email || "").split("@")[0] || "";
  const profileName = emailLocal
    ? emailLocal
        .split(".")
        .map((part) =>
          part ? part[0].toUpperCase() + part.slice(1) : "",
        )
        .join(".")
    : "Corez";
  const profileInitials =
    (emailLocal.slice(0, 2) || "CZ").toUpperCase();
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
        animationType="fade"
        transparent
        onRequestClose={onClose}
      >
        <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
          <Animated.View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.bgPrimary,
                borderColor: colors.border,
                paddingTop: insets.top + 8,
                paddingBottom: insets.bottom + 10,
                transform: [
                  {
                    translateX: slide.interpolate({
                      inputRange: [-1, 0],
                      outputRange: [-380, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.drawerHeader}>
              <Text style={[styles.wordmark, { color: colors.textPrimary }]}>
                COREZ
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("common.action.close")}
                onPress={onClose}
                hitSlop={10}
                style={[styles.iconButton, { backgroundColor: colors.bgTertiary }]}
              >
                <Feather name="sidebar" size={16} color={colors.textPrimary} />
              </Pressable>
            </View>

            <View style={styles.nav}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onClose();
                  onNewChat();
                }}
                style={({ pressed }) => [
                  styles.navItem,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Feather name="edit-2" size={17} color={colors.textPrimary} />
                <Text style={[styles.navLabel, { color: colors.textPrimary }]}>
                  {t("chat.history.new")}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onClose();
                  router.push("/conversation/new");
                }}
                style={({ pressed }) => [
                  styles.navItem,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Feather name="users" size={17} color={colors.textPrimary} />
                <Text style={[styles.navLabel, { color: colors.textPrimary }]}>
                  {t("chat.history.conversation")}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onClose();
                  router.push("/sites");
                }}
                style={({ pressed }) => [
                  styles.navItem,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Feather name="grid" size={17} color={colors.textPrimary} />
                <Text style={[styles.navLabel, { color: colors.textPrimary }]}>
                  {t("chat.history.sites")}
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
                    <>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ expanded: pinnedOpen }}
                        onPress={() => setPinnedOpen((previous) => !previous)}
                        style={styles.sectionHeader}
                      >
                        <Text
                          style={[
                            styles.sectionLabel,
                            { color: colors.textPrimary },
                          ]}
                        >
                          {t("chat.history.pinned")}
                        </Text>
                        <Feather
                          name={pinnedOpen ? "chevron-down" : "chevron-right"}
                          size={14}
                          color={colors.textMuted}
                        />
                      </Pressable>
                      {pinnedOpen ? pinned.map(renderRow) : null}
                    </>
                  ) : null}
                  {recentChats.length > 0 ? (
                    <>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ expanded: recentOpen }}
                        onPress={() => setRecentOpen((previous) => !previous)}
                        style={styles.sectionHeader}
                      >
                        <Text
                          style={[
                            styles.sectionLabel,
                            { color: colors.textPrimary },
                          ]}
                        >
                          {t("chat.history.recents")}
                        </Text>
                        <Feather
                          name={recentOpen ? "chevron-down" : "chevron-right"}
                          size={14}
                          color={colors.textMuted}
                        />
                      </Pressable>
                      {recentOpen ? recentChats.map(renderRow) : null}
                    </>
                  ) : null}
                  {messageChats.length > 0 ? (
                    <>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ expanded: messagesOpen }}
                        onPress={() => setMessagesOpen((previous) => !previous)}
                        style={styles.sectionHeader}
                      >
                        <Text
                          style={[
                            styles.sectionLabel,
                            { color: colors.textPrimary },
                          ]}
                        >
                          {t("chat.history.messages")}
                        </Text>
                        <Feather
                          name={messagesOpen ? "chevron-down" : "chevron-right"}
                          size={14}
                          color={colors.textMuted}
                        />
                      </Pressable>
                      {messagesOpen ? messageChats.map(renderRow) : null}
                    </>
                  ) : null}
                </>
              )}
            </ScrollView>

            <View style={[styles.footer, { borderTopColor: colors.border }]}>
              <View
                style={[styles.avatar, { backgroundColor: colors.bgTertiary }]}
              >
                <Text style={[styles.avatarText, { color: colors.textPrimary }]}>
                  {profileInitials}
                </Text>
              </View>
              <Text
                numberOfLines={1}
                style={[styles.profileName, { color: colors.textPrimary }]}
              >
                {profileName}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("shell.settings")}
                onPress={() => {
                  onClose();
                  router.push("/settings");
                }}
                hitSlop={8}
                style={styles.footerGear}
              >
                <Feather name="settings" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
          </Animated.View>
          <Pressable
            style={styles.backdropPress}
            accessibilityLabel={t("common.action.close")}
            onPress={onClose}
          />
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
  backdrop: { flex: 1, flexDirection: "row" },
  backdropPress: { flex: 1 },
  sheet: {
    width: "84%",
    maxWidth: 360,
    height: "100%",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    paddingBottom: 18,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  wordmark: {
    fontFamily: "Outfit_700Bold",
    fontSize: 20,
    letterSpacing: 4,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  nav: {
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 10,
    gap: 2,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 46,
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  navLabel: {
    fontSize: 14.5,
    fontWeight: "500",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingTop: 14,
    paddingBottom: 6,
  },
  sectionLabel: {
    fontSize: 14.5,
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 13, fontWeight: "700" },
  profileName: { flex: 1, fontSize: 14.5, fontWeight: "600" },
  footerGear: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  newButton: {
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 12,
    minHeight: 34,
    justifyContent: "center",
  },
  newButtonLabel: { fontSize: 12.5, fontWeight: "600" },
  list: { paddingHorizontal: 8, paddingBottom: 8, gap: 1 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 54,
    paddingLeft: 8,
    paddingRight: 4,
  },
  rowTitle: { flex: 1, fontSize: 14.5 },
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
