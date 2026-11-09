/**
 * Published sites.
 *
 * Lists the account's public pages from `GET /api/publish` and gives each one
 * the actions the web's Sites screen has: open, share, copy the link and
 * unpublish. Chat creations stay untouched when a page is unpublished.
 */
import { useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SessionGate } from "@/components/SessionGate";
import {
  getPublishedPage,
  isValidPublishSlug,
  listPublishedPages,
  publishHtml,
  unpublishPage,
  type PublishedPage,
  type PublishedPageDetail,
} from "@/api/publish";
import { copyText } from "@/lib/downloads";
import { friendlyError } from "@/lib/errors";
import { useTheme } from "@/state/theme";
import { useI18n } from "@/i18n";

export default function SitesScreen() {
  return (
    <SessionGate>
      <SitesView />
    </SessionGate>
  );
}

function SitesView() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const colors = theme.colors;
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);

  const sitesQuery = useQuery({
    queryKey: ["published-pages"],
    queryFn: listPublishedPages,
    staleTime: 30_000,
  });

  const removeMutation = useMutation({
    mutationFn: (slug: string) => unpublishPage(slug),
    onSuccess: async () => {
      setNotice(t("sites.removed"));
      await queryClient.invalidateQueries({ queryKey: ["published-pages"] });
    },
    onError: (error) =>
      setNotice(friendlyError(error, t("sites.loadFailed"))),
  });

  const pages: PublishedPage[] = sitesQuery.data?.pages ?? [];

  const copyLink = async (page: PublishedPage) => {
    const ok = await copyText(page.url);
    setNotice(ok ? t("sites.copied") : t("sites.loadFailed"));
  };

  const shareLink = async (page: PublishedPage) => {
    try {
      await Share.share({ message: page.url });
    } catch {
      setNotice(t("sites.loadFailed"));
    }
  };

  const confirmRemove = (page: PublishedPage) => {
    Alert.alert(t("sites.removeTitle"), t("sites.removeBody"), [
      { text: t("common.action.cancel"), style: "cancel" },
      {
        text: t("sites.remove"),
        style: "destructive",
        onPress: () => removeMutation.mutate(page.slug),
      },
    ]);
  };

  const [slugEditor, setSlugEditor] = useState<{
    page: PublishedPage;
    detail: PublishedPageDetail | null;
    value: string;
    busy: boolean;
    error: string | null;
  } | null>(null);

  const openSlugEditor = async (page: PublishedPage) => {
    setNotice(null);
    setSlugEditor({
      page,
      detail: null,
      value: page.slug,
      busy: true,
      error: null,
    });
    try {
      const detail = await getPublishedPage(page.slug);
      setSlugEditor((previous) =>
        previous && previous.page.slug === page.slug
          ? { ...previous, detail, value: detail.slug || page.slug, busy: false }
          : previous,
      );
    } catch (error) {
      setSlugEditor((previous) =>
        previous && previous.page.slug === page.slug
          ? {
              ...previous,
              busy: false,
              error: friendlyError(error, t("sites.loadFailed")),
            }
          : previous,
      );
    }
  };

  const saveSlug = async () => {
    const editor = slugEditor;
    if (!editor || !editor.detail || editor.busy) return;
    const next = editor.value.trim().toLowerCase();
    if (next === editor.page.slug) {
      setSlugEditor(null);
      return;
    }
    if (!isValidPublishSlug(next)) {
      setSlugEditor({ ...editor, error: t("sites.urlInvalid") });
      return;
    }
    setSlugEditor({ ...editor, busy: true, error: null });
    try {
      const result = await publishHtml({
        html: editor.detail.html,
        title: editor.detail.title || editor.page.title,
        slug: next,
        previousSlug: editor.page.slug,
        pages: editor.detail.pages,
      });
      setSlugEditor(null);
      setNotice(`${t("sites.urlChanged")} ${result.url}`);
      await queryClient.invalidateQueries({ queryKey: ["published-pages"] });
    } catch (error) {
      setSlugEditor({
        ...editor,
        busy: false,
        error: friendlyError(error, t("sites.loadFailed")),
      });
    }
  };

  return (
    <SafeAreaView
      style={styles.safe}
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
          style={styles.backButton}
        >
          <Feather name="chevron-left" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {t("sites.title")}
        </Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={sitesQuery.isFetching && !sitesQuery.isLoading}
            onRefresh={() => void sitesQuery.refetch()}
            tintColor={colors.textSecondary}
          />
        }
      >
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {t("sites.subtitle")}
        </Text>

        {notice ? (
          <Text accessibilityRole="alert" style={[styles.notice, { color: colors.caution }]}>
            {notice}
          </Text>
        ) : null}

        {sitesQuery.isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.textSecondary} />
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              {t("sites.loading")}
            </Text>
          </View>
        ) : sitesQuery.isError ? (
          <View style={styles.centered}>
            <Text style={[styles.hint, { color: colors.negative }]}>
              {t("sites.loadFailed")}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void sitesQuery.refetch()}
              style={[styles.retry, { borderColor: colors.borderHover }]}
            >
              <Text style={{ color: colors.textPrimary }}>{t("sites.retry")}</Text>
            </Pressable>
          </View>
        ) : pages.length === 0 ? (
          <View style={styles.centered}>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              {t("sites.empty")}
            </Text>
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              {t("sites.emptyHint")}
            </Text>
          </View>
        ) : (
          pages.map((page) => (
            <View
              key={page.slug}
              style={[
                styles.card,
                { backgroundColor: colors.bgCard, borderColor: colors.border },
              ]}
            >
              <View style={styles.cardHeader}>
                <Text
                  numberOfLines={2}
                  style={[styles.cardTitle, { color: colors.textPrimary }]}
                >
                  {page.title || page.slug}
                </Text>
                <View style={styles.liveBadge}>
                  <View
                    style={[styles.liveDot, { backgroundColor: colors.positive }]}
                  />
                  <Text style={[styles.liveText, { color: colors.textMuted }]}>
                    {t("sites.live")}
                  </Text>
                </View>
              </View>
              <Text
                numberOfLines={1}
                style={[styles.cardUrl, { color: colors.textMuted }]}
              >
                {page.url}
              </Text>
              <View style={styles.cardActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t("sites.open")} ${page.title || page.slug}`}
                  onPress={() => void Linking.openURL(page.url).catch(() => {})}
                  style={[
                    styles.action,
                    styles.actionPrimary,
                    {
                      borderColor: colors.actionStrong,
                      backgroundColor: colors.actionStrong,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.actionLabel,
                      { color: colors.actionStrongContrast },
                    ]}
                  >
                    {t("sites.open")}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t("sites.stats")} ${page.title || page.slug}`}
                  onPress={() =>
                    router.push({
                      pathname: "/sites/[slug]",
                      params: { slug: page.slug },
                    })
                  }
                  style={[styles.action, { borderColor: colors.borderHover }]}
                >
                  <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>
                    {t("sites.stats")}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t("sites.changeUrl")} ${page.title || page.slug}`}
                  onPress={() => void openSlugEditor(page)}
                  style={[styles.action, { borderColor: colors.borderHover }]}
                >
                  <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>
                    {t("sites.changeUrl")}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t("sites.copy")} ${page.title || page.slug}`}
                  onPress={() => void copyLink(page)}
                  style={[styles.action, { borderColor: colors.borderHover }]}
                >
                  <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>
                    {t("sites.copy")}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t("sites.share")} ${page.title || page.slug}`}
                  onPress={() => void shareLink(page)}
                  style={[styles.action, { borderColor: colors.borderHover }]}
                >
                  <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>
                    {t("sites.share")}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t("sites.remove")} ${page.title || page.slug}`}
                  onPress={() => confirmRemove(page)}
                  disabled={removeMutation.isPending}
                  style={[styles.action, { borderColor: colors.negative }]}
                >
                  {removeMutation.isPending ? (
                    <ActivityIndicator size="small" color={colors.negative} />
                  ) : (
                    <Text style={[styles.actionLabel, { color: colors.negative }]}>
                      {t("sites.remove")}
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal
        visible={Boolean(slugEditor)}
        transparent
        animationType="fade"
        onRequestClose={() => setSlugEditor(null)}
      >
        <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.bgSecondary, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              {t("sites.changeUrlTitle")}
            </Text>
            <Text style={[styles.hint, { color: colors.textMuted, textAlign: "left" }]}>
              {t("sites.changeUrlHint")}
            </Text>
            <View style={styles.slugRow}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                corez.pro/
              </Text>
              <TextInput
                value={slugEditor?.value ?? ""}
                onChangeText={(value) =>
                  setSlugEditor((previous) =>
                    previous ? { ...previous, value, error: null } : previous,
                  )
                }
                autoCapitalize="none"
                autoCorrect={false}
                editable={!slugEditor?.busy}
                accessibilityLabel={t("sites.newUrl")}
                style={[
                  styles.slugInput,
                  {
                    color: colors.textPrimary,
                    borderColor: colors.border,
                    backgroundColor: colors.bgPrimary,
                  },
                ]}
              />
            </View>
            {slugEditor?.error ? (
              <Text
                accessibilityRole="alert"
                style={{ color: colors.negative, fontSize: 12.5, lineHeight: 18 }}
              >
                {slugEditor.error}
              </Text>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                disabled={slugEditor?.busy}
                onPress={() => setSlugEditor(null)}
                style={[styles.action, { borderColor: colors.borderHover }]}
              >
                <Text style={{ color: colors.textSecondary }}>
                  {t("common.action.cancel")}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("sites.saveUrl")}
                disabled={slugEditor?.busy || !slugEditor?.detail}
                onPress={() => void saveSlug()}
                style={[
                  styles.saveUrlButton,
                  { backgroundColor: colors.actionStrong },
                ]}
              >
                {slugEditor?.busy ? (
                  <ActivityIndicator size="small" color={colors.bgPrimary} />
                ) : (
                  <Text style={{ color: colors.bgPrimary, fontWeight: "600" }}>
                    {t("sites.saveUrl")}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  backButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: "Outfit_600SemiBold", fontSize: 17 },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  subtitle: { fontSize: 12.5, lineHeight: 18 },
  notice: { fontSize: 12.5 },
  centered: { paddingVertical: 40, alignItems: "center", gap: 8 },
  hint: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  emptyTitle: { fontFamily: "Outfit_600SemiBold", fontSize: 18 },
  retry: {
    marginTop: 4,
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 18,
    minHeight: 40,
    justifyContent: "center",
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  cardTitle: {
    flex: 1,
    fontFamily: "Outfit_600SemiBold",
    fontSize: 16.5,
    lineHeight: 22,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingTop: 3,
  },
  liveDot: { width: 7, height: 7, borderRadius: 3.5 },
  liveText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  cardUrl: { fontSize: 12, fontFamily: "JetBrainsMono_400Regular" },
  cardActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  actionPrimary: { minHeight: 38, paddingHorizontal: 18 },
  action: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 9999,
    justifyContent: "center",
    alignItems: "center",
  },
  actionLabel: { fontSize: 12.5, fontWeight: "600" },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  modalCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  modalTitle: { fontFamily: "Outfit_600SemiBold", fontSize: 17 },
  slugRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexWrap: "wrap",
  },
  slugInput: {
    flexGrow: 1,
    minWidth: 160,
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    fontSize: 14,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  saveUrlButton: {
    minHeight: 40,
    minWidth: 110,
    paddingHorizontal: 18,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
});
