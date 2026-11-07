/**
 * Analytics for one published site.
 *
 * Route: /sites/<slug>. Owner-only data from the Worker; this screen shows the
 * 7/30/90-day window, totals, daily traffic bars, top pages and the source /
 * country / device breakdowns.
 */
import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { SessionGate } from "@/components/SessionGate";
import {
  ANALYTICS_RANGES,
  chartBarHeights,
  getSiteAnalytics,
  shortDayLabel,
  type AnalyticsRange,
} from "@/api/siteAnalytics";
import { friendlyError } from "@/lib/errors";
import { useTheme } from "@/state/theme";
import { useI18n } from "@/i18n";

export default function SiteAnalyticsScreen() {
  return (
    <SessionGate>
      <SiteAnalyticsView />
    </SessionGate>
  );
}

function percentLabel(value: number | null): string {
  if (value === null) return "—";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value}%`;
}

function SiteAnalyticsView() {
  const params = useLocalSearchParams<{ slug?: string }>();
  const slug = typeof params.slug === "string" ? params.slug : "";
  const { theme } = useTheme();
  const { t } = useI18n();
  const colors = theme.colors;
  const [days, setDays] = useState<AnalyticsRange>(7);

  const analyticsQuery = useQuery({
    queryKey: ["site-analytics", slug, days],
    queryFn: () => getSiteAnalytics(slug, days),
    enabled: Boolean(slug),
    staleTime: 30_000,
    retry: 1,
  });

  const data = analyticsQuery.data;
  const heights = data ? chartBarHeights(data.series) : [];
  const labelEvery = data ? Math.max(1, Math.floor(data.series.length / 7)) : 1;

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
            router.canGoBack() ? router.back() : router.replace("/sites")
          }
          hitSlop={12}
          style={styles.backButton}
        >
          <Text style={{ color: colors.textPrimary, fontSize: 22 }}>‹</Text>
        </Pressable>
        <Text numberOfLines={1} style={[styles.title, { color: colors.textPrimary }]}>
          {data?.title || slug || t("analytics.title")}
        </Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={analyticsQuery.isFetching && !analyticsQuery.isLoading}
            onRefresh={() => void analyticsQuery.refetch()}
            tintColor={colors.textSecondary}
          />
        }
      >
        <View style={styles.rangeRow}>
          {ANALYTICS_RANGES.map((range) => {
            const active = range === days;
            return (
              <Pressable
                key={range}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setDays(range)}
                style={[
                  styles.rangeChip,
                  {
                    backgroundColor: active ? colors.textPrimary : "transparent",
                    borderColor: colors.borderHover,
                  },
                ]}
              >
                <Text
                  style={{
                    color: active ? colors.bgPrimary : colors.textSecondary,
                    fontWeight: "600",
                    fontSize: 12.5,
                  }}
                >
                  {t(`analytics.range.${range}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {analyticsQuery.isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.textSecondary} />
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              {t("analytics.loading")}
            </Text>
          </View>
        ) : analyticsQuery.isError ? (
          <View style={styles.centered}>
            <Text style={[styles.hint, { color: colors.negative }]}>
              {friendlyError(analyticsQuery.error, t("analytics.loadFailed"))}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void analyticsQuery.refetch()}
              style={[styles.retry, { borderColor: colors.borderHover }]}
            >
              <Text style={{ color: colors.textPrimary }}>{t("sites.retry")}</Text>
            </Pressable>
          </View>
        ) : data ? (
          <>
            {data.collectionDisabled ? (
              <Text style={[styles.banner, { color: colors.caution }]}>
                {t("analytics.collectionDisabled")}
              </Text>
            ) : null}

            {!data.hasData ? (
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                {t("analytics.empty")}
              </Text>
            ) : null}

            <View style={styles.statsGrid}>
              <StatCard label={t("analytics.views")} value={data.totals.views} />
              <StatCard
                label={t("analytics.visitors")}
                value={data.totals.visitors}
              />
              <StatCard
                label={t("analytics.returning")}
                value={data.totals.returning}
              />
              <StatCard
                label={t("analytics.viewsPerVisitor")}
                value={data.totals.viewsPerVisitor}
              />
            </View>

            <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                {t("analytics.dailyViews")}
              </Text>
              <View style={[styles.chart, { height: 92 }]}>
                {data.series.map((point, index) => (
                  <View key={point.day} style={styles.barColumn}>
                    <View
                      accessibilityLabel={`${shortDayLabel(point.day)}: ${point.views}`}
                      style={[
                        styles.bar,
                        {
                          height: heights[index] ?? 2,
                          backgroundColor: colors.textPrimary,
                        },
                      ]}
                    />
                    {index % labelEvery === 0 ? (
                      <Text
                        numberOfLines={1}
                        style={[styles.axisLabel, { color: colors.textMuted }]}
                      >
                        {shortDayLabel(point.day)}
                      </Text>
                    ) : null}
                  </View>
                ))}
                {data.series.length === 0 ? (
                  <Text style={[styles.hint, { color: colors.textMuted }]}>
                    {t("analytics.empty")}
                  </Text>
                ) : null}
              </View>
              <View style={styles.changeRow}>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {t("analytics.changeViews", { value: percentLabel(data.change.views) })}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {t("analytics.changeVisitors", {
                    value: percentLabel(data.change.visitors),
                  })}
                </Text>
              </View>
            </View>

            {data.pages.length > 0 ? (
              <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                  {t("analytics.topPages")}
                </Text>
                {data.pages.map((page) => (
                  <View key={page.page} style={styles.breakdownRow}>
                    <Text
                      numberOfLines={1}
                      style={[styles.breakdownValue, { color: colors.textSecondary }]}
                    >
                      {page.page}
                    </Text>
                    <Text style={{ color: colors.textPrimary, fontWeight: "600", fontSize: 12.5 }}>
                      {page.views}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            <BreakdownCard
              title={t("analytics.sources")}
              rows={data.source}
              emptyLabel={t("analytics.noBreakdown")}
            />
            <BreakdownCard
              title={t("analytics.countries")}
              rows={data.country}
              emptyLabel={t("analytics.noBreakdown")}
            />
            <BreakdownCard
              title={t("analytics.devices")}
              rows={data.device}
              emptyLabel={t("analytics.noBreakdown")}
            />

            {data.range ? (
              <Text style={[styles.footer, { color: colors.textMuted }]}>
                {t("analytics.window", {
                  from: shortDayLabel(data.range.from),
                  to: shortDayLabel(data.range.to),
                })}
              </Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  const { theme } = useTheme();
  const colors = theme.colors;
  return (
    <View
      style={[
        styles.statCard,
        { backgroundColor: colors.bgCard, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.statValue, { color: colors.textPrimary }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

function BreakdownCard({
  title,
  rows,
  emptyLabel,
}: {
  title: string;
  rows: { value: string; views: number }[];
  emptyLabel: string;
}) {
  const { theme } = useTheme();
  const colors = theme.colors;
  return (
    <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{title}</Text>
      {rows.length === 0 ? (
        <Text style={[styles.hint, { color: colors.textMuted, textAlign: "left" }]}>
          {emptyLabel}
        </Text>
      ) : (
        rows.map((row) => (
          <View key={`${title}-${row.value}`} style={styles.breakdownRow}>
            <Text
              numberOfLines={1}
              style={[styles.breakdownValue, { color: colors.textSecondary }]}
            >
              {row.value}
            </Text>
            <Text style={{ color: colors.textPrimary, fontWeight: "600", fontSize: 12.5 }}>
              {row.views}
            </Text>
          </View>
        ))
      )}
    </View>
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
  title: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Outfit_600SemiBold",
    fontSize: 16,
  },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  rangeRow: { flexDirection: "row", gap: 8 },
  rangeChip: {
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 16,
    minHeight: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  centered: { paddingVertical: 50, alignItems: "center", gap: 10 },
  hint: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  banner: { fontSize: 12.5, lineHeight: 18 },
  retry: {
    marginTop: 4,
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 18,
    minHeight: 40,
    justifyContent: "center",
  },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: {
    flexGrow: 1,
    flexBasis: "45%",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    gap: 2,
  },
  statValue: { fontFamily: "Outfit_600SemiBold", fontSize: 24 },
  statLabel: { fontSize: 11.5, lineHeight: 16 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  cardTitle: { fontFamily: "Outfit_600SemiBold", fontSize: 14.5 },
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
    paddingTop: 8,
  },
  barColumn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    alignSelf: "stretch",
  },
  bar: {
    width: "70%",
    borderRadius: 2,
    minWidth: 2,
  },
  axisLabel: { fontSize: 8.5, textAlign: "center" },
  changeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 6,
  },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 3,
  },
  breakdownValue: { flex: 1, fontSize: 12.5 },
  footer: { textAlign: "center", fontSize: 11.5, marginTop: 8 },
});
