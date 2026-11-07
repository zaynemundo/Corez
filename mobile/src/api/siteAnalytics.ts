/**
 * Owner-only traffic report for one published site.
 *
 * Mirrors `GET /api/publish/:slug/analytics?days=7|30|90` in the Worker.
 * The Worker aggregates anonymous daily views and unique visitors; the app
 * only renders the numbers, it never collects analytics itself.
 */
import { requestJson } from "./client";

export type AnalyticsRange = 7 | 30 | 90;

export interface AnalyticsPoint {
  day: string;
  views: number;
  visitors: number;
  returning: number;
}

export interface AnalyticsBreakdownEntry {
  value: string;
  views: number;
}

export interface SiteAnalytics {
  slug: string;
  url: string;
  title: string;
  range: { days: number; from: string; to: string };
  totals: {
    views: number;
    visitors: number;
    returning: number;
    newVisitors: number;
    viewsPerVisitor: number;
  };
  previous: { views: number; visitors: number };
  change: { views: number | null; visitors: number | null };
  series: AnalyticsPoint[];
  pages: { page: string; views: number }[];
  source: AnalyticsBreakdownEntry[];
  country: AnalyticsBreakdownEntry[];
  device: AnalyticsBreakdownEntry[];
  trackingSince: string | null;
  hasData: boolean;
  retentionDays: number;
  collectionDisabled?: boolean;
}

export const ANALYTICS_RANGES: AnalyticsRange[] = [7, 30, 90];

export async function getSiteAnalytics(
  slug: string,
  days: AnalyticsRange = 7,
): Promise<SiteAnalytics> {
  const safe = String(slug || "").trim();
  if (!safe) throw new Error("A page slug is required.");
  return requestJson<SiteAnalytics>(
    `/api/publish/${encodeURIComponent(safe)}/analytics?days=${days}`,
    { method: "GET", timeoutMs: 30_000 },
  );
}

/** Scale a series to bar heights; keeps a single view visible. */
export function chartBarHeights(
  series: AnalyticsPoint[],
  height = 72,
): number[] {
  const max = series.reduce((top, point) => Math.max(top, point.views), 0);
  if (max === 0) return series.map(() => 2);
  return series.map((point) => {
    if (point.views <= 0) return 2;
    return Math.max(3, Math.round((point.views / max) * height));
  });
}

/** Compact day label for the chart axis (`2026-11-07` -> `7 Nov`). */
export function shortDayLabel(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day || "");
  if (!match) return day;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  const month = date.toLocaleDateString("en", { month: "short", timeZone: "UTC" });
  return `${date.getUTCDate()} ${month}`;
}
