// Unit tests for published-site analytics.
//
// The Worker contract test covers the HTTP surface; this file pins the privacy
// and counting rules directly: what counts as a view, what is normalised, what
// is never stored, and how the owner report is assembled from D1 rows.
import { describe, it, expect, beforeEach } from "vitest";
import {
  __resetSiteAnalyticsForTests,
  countryFromRequest,
  deleteSiteAnalyticsForSlug,
  deviceFromRequest,
  hasAnalyticsOptOut,
  isCountableSiteNavigation,
  normalizeAnalyticsRange,
  pruneSiteAnalytics,
  readSiteAnalytics,
  recordSitePageView,
  sourceFromReferrer,
  visitorFingerprint,
} from "../worker/siteAnalytics.js";
import { createJWT, SESSION_COOKIE } from "../worker/auth.js";

const SECRET = "site-analytics-test-secret";
const NOW = Date.UTC(2026, 9, 24, 12, 0, 0);

function fakeDb(batchResults = null) {
  const statements = [];
  const runSql = [];
  const db = {
    statements,
    runSql,
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        async run() {
          runSql.push({ sql, values: statement.values });
          return { success: true };
        },
        async all() {
          return { results: [] };
        },
        async first() {
          // verifySession re-checks the account when D1 is configured.
          if (/FROM users/i.test(sql)) {
            return { id: "alice-uid", email: "alice@test.dev", password_changed_at: 0 };
          }
          return null;
        },
        bind(...values) {
          statement.values = values;
          return statement;
        },
      };
      return statement;
    },
    async batch(statementsToRun) {
      for (const statement of statementsToRun) {
        statements.push({ sql: statement.sql, values: statement.values });
      }
      if (typeof batchResults === "function") return batchResults(statementsToRun);
      if (Array.isArray(batchResults)) {
        return batchResults.map((results) => ({ results }));
      }
      return statementsToRun.map(() => ({ results: [] }));
    },
  };
  return db;
}

function request(url, headers = {}) {
  return new Request(url, { method: "GET", headers });
}

beforeEach(() => {
  __resetSiteAnalyticsForTests();
});

describe("what counts as a published-site view", () => {
  it("counts GET navigations and the site's own fetch-swap navigations", () => {
    expect(isCountableSiteNavigation(request("https://corez.pro/site"))).toBe(true);
    expect(
      isCountableSiteNavigation(request("https://corez.pro/site", { "Sec-Fetch-Mode": "navigate" })),
    ).toBe(true);
    expect(
      isCountableSiteNavigation(request("https://corez.pro/site/about.html", {
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Dest": "empty",
      })),
    ).toBe(true);
    expect(
      isCountableSiteNavigation(request("https://corez.pro/site", { "Sec-Fetch-Dest": "iframe" })),
    ).toBe(true);
  });

  it("ignores non-GET requests, prefetches and subresource fetches", () => {
    expect(
      isCountableSiteNavigation(new Request("https://corez.pro/site", { method: "HEAD" })),
    ).toBe(false);
    expect(
      isCountableSiteNavigation(request("https://corez.pro/site", { "Sec-Purpose": "prefetch" })),
    ).toBe(false);
    expect(
      isCountableSiteNavigation(request("https://corez.pro/site", { "X-Moz": "prefetch" })),
    ).toBe(false);
    expect(
      isCountableSiteNavigation(request("https://corez.pro/site", {
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Dest": "image",
      })),
    ).toBe(false);
  });

  it("honours DNT and GPC", () => {
    expect(hasAnalyticsOptOut(request("https://corez.pro/site"))).toBe(false);
    expect(hasAnalyticsOptOut(request("https://corez.pro/site", { DNT: "1" }))).toBe(true);
    expect(hasAnalyticsOptOut(request("https://corez.pro/site", { "Sec-GPC": "1" }))).toBe(true);
  });
});

describe("normalisation", () => {
  it("keeps a valid country and collapses unknown or malformed values", () => {
    expect(countryFromRequest({ cf: { country: "ae" } })).toBe("AE");
    expect(countryFromRequest({ cf: { country: "XX" } })).toBe("unknown");
    expect(countryFromRequest({ cf: { country: "TOO-LONG" } })).toBe("unknown");
    expect(countryFromRequest({})).toBe("unknown");
  });

  it("classifies the device without keeping the user agent", () => {
    expect(deviceFromRequest(request("https://corez.pro/site", { "User-Agent": "Mozilla/5.0 (iPhone)" }))).toBe("mobile");
    expect(deviceFromRequest(request("https://corez.pro/site", { "User-Agent": "Mozilla/5.0 (iPad)" }))).toBe("tablet");
    expect(deviceFromRequest(request("https://corez.pro/site", { "User-Agent": "Mozilla/5.0 (Macintosh)" }))).toBe("desktop");
    expect(deviceFromRequest(request("https://corez.pro/site"))).toBe("unknown");
  });

  it("attributes referrers and internal navigation", () => {
    expect(sourceFromReferrer(request("https://corez.pro/site"))).toBe("direct");
    expect(
      sourceFromReferrer(request("https://corez.pro/site", { "Sec-Fetch-Site": "same-origin" })),
    ).toBe("internal");
    expect(
      sourceFromReferrer(request("https://corez.pro/site", { Referer: "https://corez.pro/site/about.html" })),
    ).toBe("internal");
    expect(
      sourceFromReferrer(request("https://corez.pro/site", { Referer: "https://www.google.com/search?q=corez" })),
    ).toBe("google.com");
    expect(
      sourceFromReferrer(request("https://corez.pro/site", { Referer: "not a url" })),
    ).toBe("other");
    expect(
      sourceFromReferrer(request("https://corez.pro/site", { Referer: "https://evil.example.com/%0aDROP" })),
    ).toBe("evil.example.com");
  });

  it("accepts only the three owner-facing ranges", () => {
    expect(normalizeAnalyticsRange("7")).toBe(7);
    expect(normalizeAnalyticsRange(30)).toBe(30);
    expect(normalizeAnalyticsRange("90")).toBe(90);
    expect(normalizeAnalyticsRange("14")).toBe(null);
    expect(normalizeAnalyticsRange("abc")).toBe(null);
  });
});

describe("visitor fingerprinting", () => {
  it("is stable for the same visitor and site, and different across sites", async () => {
    const env = { AUTH_SECRET: SECRET };
    const first = await visitorFingerprint(env, {
      slug: "alice-site",
      ip: "203.0.113.7",
      userAgent: "Mozilla/5.0 (Macintosh)",
    });
    const same = await visitorFingerprint(env, {
      slug: "alice-site",
      ip: "203.0.113.7",
      userAgent: "Mozilla/5.0 (Macintosh)",
    });
    const otherSite = await visitorFingerprint(env, {
      slug: "bob-site",
      ip: "203.0.113.7",
      userAgent: "Mozilla/5.0 (Macintosh)",
    });
    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(same).toBe(first);
    expect(otherSite).not.toBe(first);
    expect(first).not.toContain("203.0.113.7");
  });
});

describe("recording a view", () => {
  const pageRecord = { ownerUserId: "alice-uid" };

  it("stores the page count, the three breakdowns and the visitor", async () => {
    const db = fakeDb();
    const env = { DB: db, AUTH_SECRET: SECRET };
    const result = await recordSitePageView(
      env,
      request("https://corez.pro/alice-site", {
        "CF-Connecting-IP": "203.0.113.7",
        "User-Agent": "Mozilla/5.0 (Macintosh)",
        Referer: "https://www.google.com/search?q=alice",
      }),
      null,
      { slug: "alice-site", page: "index.html", record: pageRecord, now: NOW },
    );

    expect(result.recorded).toBe(true);
    expect(db.statements).toHaveLength(6);
    const joined = JSON.stringify(db.statements);
    expect(joined).not.toContain("203.0.113.7");
    expect(joined).not.toContain("Mozilla");
    expect(joined).toContain("alice-site");
    expect(joined).toContain("index.html");
    expect(joined).toContain("google.com");
    expect(joined).toContain("desktop");
    const dimensions = db.statements
      .filter((entry) => entry.sql.includes("site_analytics_breakdown"))
      .map((entry) => entry.values[2]);
    expect(dimensions.sort()).toEqual(["country", "device", "source"]);
  });

  it("counts an opted-out view anonymously, with no visitor row", async () => {
    const db = fakeDb();
    const env = { DB: db, AUTH_SECRET: SECRET };
    const result = await recordSitePageView(
      env,
      request("https://corez.pro/alice-site", {
        DNT: "1",
        "CF-Connecting-IP": "203.0.113.7",
        "User-Agent": "Mozilla/5.0 (Macintosh)",
      }),
      null,
      { slug: "alice-site", page: "index.html", record: pageRecord, now: NOW },
    );
    expect(result.recorded).toBe(true);
    expect(db.statements).toHaveLength(4);
    expect(db.statements.some((entry) => entry.sql.includes("site_analytics_visits"))).toBe(false);
    expect(db.statements.some((entry) => entry.sql.includes("site_analytics_visitors"))).toBe(false);
  });

  it("never counts bots, disabled deployments, non-navigations or the owner", async () => {
    const botDb = fakeDb();
    const bot = await recordSitePageView(
      { DB: botDb, AUTH_SECRET: SECRET },
      request("https://corez.pro/alice-site", { "User-Agent": "Googlebot/2.1" }),
      null,
      { slug: "alice-site", page: "index.html", record: pageRecord, now: NOW },
    );
    expect(bot.reason).toBe("bot");
    expect(botDb.statements).toHaveLength(0);

    const disabledDb = fakeDb();
    const disabled = await recordSitePageView(
      { DB: disabledDb, SITE_ANALYTICS_DISABLED: "1" },
      request("https://corez.pro/alice-site"),
      null,
      { slug: "alice-site", page: "index.html", record: pageRecord, now: NOW },
    );
    expect(disabled.reason).toBe("disabled");
    expect(disabledDb.statements).toHaveLength(0);

    const prefetchDb = fakeDb();
    const prefetch = await recordSitePageView(
      { DB: prefetchDb },
      request("https://corez.pro/alice-site", { "Sec-Purpose": "prefetch" }),
      null,
      { slug: "alice-site", page: "index.html", record: pageRecord, now: NOW },
    );
    expect(prefetch.reason).toBe("not-a-navigation");

    const token = await createJWT(
      { uid: "alice-uid", email: "alice@test.dev", exp: Math.floor(Date.now() / 1000) + 3600 },
      SECRET,
    );
    const ownerDb = fakeDb();
    const owner = await recordSitePageView(
      { DB: ownerDb, AUTH_SECRET: SECRET },
      request("https://corez.pro/alice-site", { Cookie: `${SESSION_COOKIE}=${token}` }),
      null,
      { slug: "alice-site", page: "index.html", record: pageRecord, now: NOW },
    );
    expect(owner.reason).toBe("owner");
    expect(ownerDb.statements).toHaveLength(0);
  });

  it("suppresses an immediate duplicate of the same view", async () => {
    const db = fakeDb();
    const env = { DB: db, AUTH_SECRET: SECRET };
    const headers = {
      "CF-Connecting-IP": "203.0.113.7",
      "User-Agent": "Mozilla/5.0 (Macintosh)",
    };
    await recordSitePageView(
      env,
      request("https://corez.pro/alice-site", headers),
      null,
      { slug: "alice-site", page: "index.html", record: pageRecord, now: NOW },
    );
    const before = db.statements.length;
    const duplicate = await recordSitePageView(
      env,
      request("https://corez.pro/alice-site", headers),
      null,
      { slug: "alice-site", page: "index.html", record: pageRecord, now: NOW + 1000 },
    );
    expect(duplicate.reason).toBe("duplicate");
    expect(db.statements.length).toBe(before);
  });

  it("hands storage to waitUntil when a Worker ctx is available", async () => {
    const db = fakeDb();
    const scheduled = [];
    const result = await recordSitePageView(
      { DB: db },
      request("https://corez.pro/alice-site"),
      { waitUntil: (promise) => scheduled.push(promise) },
      { slug: "alice-site", page: "index.html", record: pageRecord, now: NOW },
    );
    expect(result.scheduled).toBe(true);
    expect(scheduled).toHaveLength(1);
    await scheduled[0];
    expect(db.statements.length).toBeGreaterThan(0);
  });
});

describe("owner report", () => {
  it("aggregates totals, deltas, series and breakdowns", async () => {
    const results = [
      [
        { day: "2026-10-20", views: 5 },
        { day: "2026-10-22", views: 3 },
      ],
      [
        { day: "2026-10-20", visitors: 2 },
        { day: "2026-10-22", visitors: 2 },
      ],
      [{ day: "2026-10-22", returning: 1 }],
      [{ visitors: 4 }],
      [{ returning: 1 }],
      [{ views: 10 }],
      [{ visitors: 5 }],
      [
        { page: "index.html", views: 6 },
        { page: "about.html", views: 2 },
      ],
      [
        { dimension: "source", value: "direct", views: 5 },
        { dimension: "source", value: "google.com", views: 3 },
        { dimension: "country", value: "AE", views: 7 },
        { dimension: "country", value: "US", views: 1 },
        { dimension: "device", value: "desktop", views: 6 },
        { dimension: "device", value: "mobile", views: 2 },
      ],
      [{ since: "2026-10-01" }],
    ];
    const db = fakeDb(results);
    const report = await readSiteAnalytics({ DB: db }, "alice-site", {
      days: 7,
      now: NOW,
    });

    expect(report.totals).toEqual({
      views: 8,
      visitors: 4,
      returning: 1,
      newVisitors: 3,
      viewsPerVisitor: 2,
    });
    expect(report.previous).toEqual({ views: 10, visitors: 5 });
    expect(report.change.views).toBe(-20);
    expect(report.change.visitors).toBe(-20);
    expect(report.series).toHaveLength(7);
    expect(report.series[0].day).toBe("2026-10-18");
    expect(report.series[2]).toMatchObject({ day: "2026-10-20", views: 5, visitors: 2 });
    expect(report.pages[0]).toEqual({ page: "index.html", views: 6 });
    expect(report.source).toHaveLength(2);
    expect(report.country[0]).toEqual({ value: "AE", views: 7 });
    expect(report.device[1]).toEqual({ value: "mobile", views: 2 });
    expect(report.trackingSince).toBe("2026-10-01");
    expect(report.hasData).toBe(true);
    expect(report.retentionDays).toBe(90);
  });

  it("returns an honest empty window when there is no data", async () => {
    const db = fakeDb([]);
    const report = await readSiteAnalytics({ DB: db }, "alice-site", {
      days: 30,
      now: NOW,
    });
    expect(report.totals.views).toBe(0);
    expect(report.totals.visitors).toBe(0);
    expect(report.change.views).toBe(null);
    expect(report.series).toHaveLength(30);
    expect(report.hasData).toBe(false);
    expect(report.trackingSince).toBe(null);
  });

  it("returns null when D1 is unavailable", async () => {
    expect(await readSiteAnalytics({}, "alice-site")).toBe(null);
  });
});

describe("retention and deletion", () => {
  it("prunes visitor identity after 90 days and totals after 400", async () => {
    const db = fakeDb();
    const ok = await pruneSiteAnalytics({ DB: db }, NOW);
    expect(ok).toBe(true);
    expect(db.statements).toHaveLength(4);
    const cutoffByTable = Object.fromEntries(
      db.statements.map((entry) => [
        entry.sql.match(/site_analytics_[a-z]+/)?.[0],
        entry.values[0],
      ]),
    );
    expect(cutoffByTable.site_analytics_visits).toBe("2026-07-26");
    expect(cutoffByTable.site_analytics_visitors).toBe("2026-07-26");
    expect(cutoffByTable.site_analytics_daily).toBe("2025-09-19");
    expect(cutoffByTable.site_analytics_breakdown).toBe("2025-09-19");
  });

  it("deletes every row that belongs to an unpublished site", async () => {
    const db = fakeDb();
    const ok = await deleteSiteAnalyticsForSlug({ DB: db }, "alice-site");
    expect(ok).toBe(true);
    expect(db.statements).toHaveLength(4);
    for (const entry of db.statements) {
      expect(entry.sql).toContain("DELETE FROM site_analytics_");
      expect(entry.values).toEqual(["alice-site"]);
    }
  });
});
