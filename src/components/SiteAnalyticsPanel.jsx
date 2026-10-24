import { useEffect, useId, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Eye,
  Loader2,
  RefreshCw,
  Repeat2,
  Users,
  X,
} from "lucide-react";
import { useI18n } from "../i18n/index.jsx";
import { formatDate, localeFor } from "../i18n/format.js";
import { fetchSiteAnalytics } from "../services/appStorageService";

const RANGES = [7, 30, 90];
const RANGE_KEYS = {
  7: "common.sites.analytics.range7",
  30: "common.sites.analytics.range30",
  90: "common.sites.analytics.range90",
};
const HOME_PAGE = "index.html";

const DEVICE_KEYS = {
  desktop: "common.sites.analytics.desktop",
  mobile: "common.sites.analytics.mobile",
  tablet: "common.sites.analytics.tablet",
};

function formatNumber(value, language, maximumFractionDigits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  try {
    return new Intl.NumberFormat(localeFor(language), {
      maximumFractionDigits,
    }).format(number);
  } catch {
    return String(number);
  }
}

function formatDay(day, language, options = {}) {
  if (!day || typeof day !== "string") return "";
  return formatDate(`${day}T00:00:00.000Z`, language, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...options,
  });
}

function countryLabel(code, language) {
  if (!code) return "";
  if (code === "unknown") return "";
  try {
    const display = new Intl.DisplayNames([localeFor(language)], {
      type: "region",
    });
    return display.of(code) || code;
  } catch {
    return code;
  }
}

function percentChangeLabel(change, days, t) {
  const sign = change > 0 ? "+" : "";
  return t("common.sites.analytics.change", {
    change: `${sign}${change}`,
    days,
  });
}

function ChangeBadge({ change, days }) {
  const { t } = useI18n();
  if (change === null || change === undefined || !Number.isFinite(change)) {
    return null;
  }
  const positive = change > 0;
  const negative = change < 0;
  const Icon = positive ? ArrowUpRight : negative ? ArrowDownRight : null;
  const label = percentChangeLabel(change, days, t);
  return (
    <span
      className={`site-analytics-change${positive ? " up" : ""}${
        negative ? " down" : ""
      }`}
      aria-label={label}
      title={label}
    >
      {Icon && <Icon size={12} strokeWidth={2} aria-hidden="true" />}
      {`${change > 0 ? "+" : ""}${change}%`}
    </span>
  );
}

function StatTile({ icon: Icon, label, value, change, days }) {
  return (
    <div className="site-analytics-stat">
      <span className="site-analytics-stat-label">
        <Icon size={13} strokeWidth={1.75} aria-hidden="true" />
        {label}
      </span>
      <span className="site-analytics-stat-value">{value}</span>
      {change !== undefined && <ChangeBadge change={change} days={days} />}
    </div>
  );
}

/**
 * One ranked list (top pages, sources, countries, devices). The bar makes the
 * share of traffic readable at a glance; the numbers stay next to it so the
 * panel is useful without hovering.
 */
function RankingList({ title, items, total, labelFor, emptyLabel }) {
  const { t } = useI18n();
  return (
    <div className="site-analytics-ranking">
      <h4>{title}</h4>
      {items.length === 0 ? (
        <p className="site-analytics-ranking-empty">{emptyLabel}</p>
      ) : (
        <ul>
          {items.map((item) => {
            const percent = total > 0 ? Math.round((item.views / total) * 100) : 0;
            const label = labelFor(item.value ?? item.page);
            return (
              <li
                key={item.value ?? item.page}
                aria-label={t("common.sites.analytics.rowLabel", {
                  label,
                  views: item.views,
                  percent,
                })}
              >
                <span className="site-analytics-rank-label" title={label}>
                  {label}
                </span>
                <span className="site-analytics-rank-track" aria-hidden="true">
                  <span
                    className="site-analytics-rank-bar"
                    style={{ width: `${Math.max(percent, item.views > 0 ? 2 : 0)}%` }}
                  />
                </span>
                <span className="site-analytics-rank-value">{item.views}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Traffic for one published site, expanded inside its Sites card.
 *
 * The panel loads its own report (and reloads when the range changes), so the
 * Sites list stays a cheap server read and opening analytics is one owner-only
 * request. It renders its own loading, empty and error states: a deployment
 * without D1 shows an honest message, never invented zeroes.
 */
export default function SiteAnalyticsPanel({ slug, title, onClose }) {
  const { t, language } = useI18n();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const titleId = useId();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchSiteAnalytics(slug, days).then((result) => {
      if (cancelled) return;
      if (result.success) {
        setData(result.analytics);
      } else {
        setData(null);
        setError(result.error || t("common.sites.analytics.error"));
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, days, reloadToken, t]);

  const series = Array.isArray(data?.series) ? data.series : [];
  const maxViews = useMemo(
    () => Math.max(1, ...series.map((entry) => Number(entry.views) || 0)),
    [series],
  );
  const busiest = useMemo(() => {
    let best = null;
    for (const entry of series) {
      if (!best || (Number(entry.views) || 0) > (Number(best.views) || 0)) {
        best = entry;
      }
    }
    return best && Number(best.views) > 0 ? best : null;
  }, [series]);
  const totals = data?.totals || {};
  const range = data?.range || { days, from: "", to: "" };
  const deviceLabel = (value) =>
    t(DEVICE_KEYS[value] || "common.sites.analytics.unknown");
  const sourceLabel = (value) => {
    if (value === "direct") return t("common.sites.analytics.direct");
    if (value === "internal") return t("common.sites.analytics.internal");
    if (value === "other") return t("common.sites.analytics.other");
    return value;
  };

  const chartSummary = busiest
    ? t("common.sites.analytics.chartSummary", {
        from: formatDay(range.from, language),
        to: formatDay(range.to, language),
        views: formatNumber(totals.views, language),
        day: formatDay(busiest.day, language),
        count: formatNumber(busiest.views, language),
      })
    : t("common.sites.analytics.chartSummaryEmpty", {
        from: formatDay(range.from, language),
        to: formatDay(range.to, language),
      });

  return (
    <section
      className="site-analytics"
      id={`site-analytics-${slug}`}
      aria-labelledby={titleId}
    >
      <header className="site-analytics-header">
        <div className="site-analytics-heading">
          <h3 id={titleId}>{t("common.sites.analytics.title")}</h3>
          <p>
            {title || slug} · <code>corez.pro/{slug}</code>
          </p>
        </div>
        <div className="site-analytics-controls">
          <div
            className="site-analytics-ranges"
            role="group"
            aria-label={t("common.sites.analytics.rangeLabel")}
          >
            {RANGES.map((rangeDays) => (
              <button
                key={rangeDays}
                type="button"
                className={`site-analytics-range${
                  days === rangeDays ? " active" : ""
                }`}
                aria-pressed={days === rangeDays}
                onClick={() => setDays(rangeDays)}
              >
                {t(RANGE_KEYS[rangeDays])}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="sites-button quiet"
            onClick={() => setReloadToken((token) => token + 1)}
            disabled={loading}
            aria-label={t("common.sites.refresh")}
            title={t("common.sites.refresh")}
          >
            <RefreshCw size={13} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="sites-button quiet"
            onClick={onClose}
            aria-label={t("common.sites.analytics.close")}
            title={t("common.sites.analytics.close")}
          >
            <X size={14} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </header>

      {loading && (
        <p className="site-analytics-state" role="status">
          <Loader2 size={14} strokeWidth={1.75} className="spin" aria-hidden="true" />
          {t("common.sites.analytics.loading")}
        </p>
      )}

      {!loading && error && (
        <div className="site-analytics-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="sites-button"
            onClick={() => setReloadToken((token) => token + 1)}
          >
            {t("common.sites.analytics.retry")}
          </button>
        </div>
      )}

      {!loading && !error && data && (
        <>
          <div className="site-analytics-stats">
            <StatTile
              icon={Eye}
              label={t("common.sites.analytics.views")}
              value={formatNumber(totals.views, language)}
              change={data.change?.views ?? null}
              days={days}
            />
            <StatTile
              icon={Users}
              label={t("common.sites.analytics.visitors")}
              value={formatNumber(totals.visitors, language)}
              change={data.change?.visitors ?? null}
              days={days}
            />
            <StatTile
              icon={Repeat2}
              label={t("common.sites.analytics.returning")}
              value={formatNumber(totals.returning, language)}
            />
            <StatTile
              icon={Eye}
              label={t("common.sites.analytics.perVisitor")}
              value={formatNumber(totals.viewsPerVisitor, language, 1)}
            />
          </div>

          {!data.hasData ? (
            <div className="site-analytics-empty">
              <p className="site-analytics-empty-title">
                {t("common.sites.analytics.empty")}
              </p>
              <p className="site-analytics-empty-hint">
                {t("common.sites.analytics.emptyHint")}
              </p>
            </div>
          ) : (
            <>
              <div className="site-analytics-chart-block">
                <div
                  className="site-analytics-chart"
                  role="img"
                  aria-label={chartSummary}
                >
                  {series.map((entry) => (
                    <span key={entry.day} className="site-analytics-chart-slot">
                      <span
                        className={`site-analytics-chart-bar${
                          Number(entry.views) > 0 ? "" : " zero"
                        }`}
                        style={{
                          height: `${
                            Number(entry.views) > 0
                              ? Math.max(
                                  4,
                                  Math.round(
                                    ((Number(entry.views) || 0) / maxViews) * 100,
                                  ),
                                )
                              : 0
                          }%`,
                        }}
                      />
                    </span>
                  ))}
                </div>
                <p className="site-analytics-chart-summary">{chartSummary}</p>
              </div>

              <div className="site-analytics-rankings">
                <RankingList
                  title={t("common.sites.analytics.topPages")}
                  items={data.pages || []}
                  total={totals.views || 0}
                  labelFor={(page) =>
                    page === HOME_PAGE
                      ? t("common.sites.homePage")
                      : String(page)
                  }
                  emptyLabel={t("common.sites.analytics.empty")}
                />
                <RankingList
                  title={t("common.sites.analytics.sources")}
                  items={data.source || []}
                  total={totals.views || 0}
                  labelFor={sourceLabel}
                  emptyLabel={t("common.sites.analytics.empty")}
                />
                <RankingList
                  title={t("common.sites.analytics.countries")}
                  items={(data.country || []).map((entry) => ({
                    ...entry,
                    value:
                      entry.value === "unknown"
                        ? t("common.sites.analytics.unknown")
                        : countryLabel(entry.value, language) || entry.value,
                  }))}
                  total={totals.views || 0}
                  labelFor={(value) => value}
                  emptyLabel={t("common.sites.analytics.empty")}
                />
                <RankingList
                  title={t("common.sites.analytics.devices")}
                  items={data.device || []}
                  total={totals.views || 0}
                  labelFor={deviceLabel}
                  emptyLabel={t("common.sites.analytics.empty")}
                />
              </div>
            </>
          )}

          <footer className="site-analytics-footer">
            {data.trackingSince && (
              <span>
                {t("common.sites.analytics.trackingSince", {
                  date: formatDay(data.trackingSince, language, {
                    year: "numeric",
                  }),
                })}
              </span>
            )}
            {data.collectionDisabled && (
              <span className="site-analytics-disabled">
                {t("common.sites.analytics.disabled")}
              </span>
            )}
            <span>
              {t("common.sites.analytics.privacy", {
                days: data.retentionDays ?? 90,
              })}
            </span>
          </footer>
        </>
      )}
    </section>
  );
}
