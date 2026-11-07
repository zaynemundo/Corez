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
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SessionGate } from "@/components/SessionGate";
import {
  listPublishedPages,
  unpublishPage,
  type PublishedPage,
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
          style={styles.backButton}
        >
          <Text style={{ color: colors.textPrimary, fontSize: 22 }}>‹</Text>
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
              <Text
                numberOfLines={2}
                style={[styles.cardTitle, { color: colors.textPrimary }]}
              >
                {page.title || page.slug}
              </Text>
              <Text numberOfLines={1} style={[styles.cardUrl, { color: colors.textMuted }]}>
                {page.url}
              </Text>
              <View style={styles.cardActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t("sites.open")} ${page.title || page.slug}`}
                  onPress={() => void Linking.openURL(page.url).catch(() => {})}
                  style={[styles.action, { borderColor: colors.borderHover }]}
                >
                  <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>
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
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  cardTitle: { fontFamily: "Outfit_600SemiBold", fontSize: 16 },
  cardUrl: { fontSize: 12 },
  cardActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  action: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 9999,
    justifyContent: "center",
    alignItems: "center",
  },
  actionLabel: { fontSize: 12.5, fontWeight: "600" },
});
