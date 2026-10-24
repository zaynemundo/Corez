// Published-site analytics against REAL SQLite, not a mocked D1.
//
// The HTTP contract uses a hand-written D1 double, and a double cannot reject a
// SQL dialect mistake. That is exactly how the first release shipped a
// `COUNT(*) AS returning` alias — `returning` is reserved in SQLite, so every
// report 503'd in production while the mocked tests stayed green. This test
// runs the feature's actual DDL, writes and reads through node:sqlite, which
// uses the same SQL dialect D1 does.
//
// node:sqlite is not available on older Node releases, so the suite skips (not
// fails) there; the default CI/runtime here provides it.
import { describe, it, expect, beforeAll } from "vitest";
import {
  __resetSiteAnalyticsForTests,
  deleteSiteAnalyticsForSlug,
  readSiteAnalytics,
  recordSitePageView,
} from "../worker/siteAnalytics.js";
import { SITE_ANALYTICS_SCHEMA } from "../worker/dbSchema.js";

let DatabaseSync = null;
try {
  ({ DatabaseSync } = await import("node:sqlite"));
} catch {
  // Older Node: no embedded SQLite. The D1 contract still covers the shape.
}

const describeSqlite = DatabaseSync ? describe : describe.skip;
const SLUG = "alice-site";
const OWNER = "alice-uid";

function sqliteD1(db) {
  return {
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async run() {
          db.prepare(sql).run(...statement.values);
          return { success: true };
        },
        async all() {
          return { results: db.prepare(sql).all(...statement.values) };
        },
        async first() {
          return db.prepare(sql).get(...statement.values) || null;
        },
      };
      return statement;
    },
    async batch(items) {
      return items.map((statement) => {
        if (/^\s*SELECT/i.test(statement.sql)) {
          return { results: db.prepare(statement.sql).all(...statement.values) };
        }
        db.prepare(statement.sql).run(...statement.values);
        return { success: true };
      });
    },
  };
}

function visit({ ip, page = "index.html", headers = {} }) {
  return new Request(`https://corez.test/${SLUG}/${page === "index.html" ? "" : page}`, {
    method: "GET",
    headers: {
      "CF-Connecting-IP": ip,
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      ...headers,
    },
  });
}

async function record(env, options) {
  return recordSitePageView(env, visit(options), null, {
    slug: SLUG,
    page: options.page || "index.html",
    record: { ownerUserId: OWNER },
    now: Date.UTC(2026, 9, options.day, 12),
  });
}

describeSqlite("site analytics on real SQLite", () => {
  let db;
  let env;

  beforeAll(async () => {
    __resetSiteAnalyticsForTests();
    db = new DatabaseSync(":memory:");
    for (const sql of SITE_ANALYTICS_SCHEMA.tables) db.exec(sql);
    for (const sql of SITE_ANALYTICS_SCHEMA.indexes) db.exec(sql);
    env = { DB: sqliteD1(db) };

    // Visitor A: first seen 20 Oct, returns on 21 Oct.
    await record(env, { ip: "203.0.113.1", day: 20 });
    await record(env, {
      ip: "203.0.113.1",
      day: 21,
      page: "about.html",
      headers: { "Sec-Fetch-Site": "same-origin" },
    });
    // Visitor B: first seen 22 Oct, one visit.
    await record(env, { ip: "203.0.113.2", day: 22 });
    // Visitor C: DNT — one anonymous view, no identity.
    await record(env, { ip: "203.0.113.3", day: 22, headers: { DNT: "1" } });
  });

  it("accepts the real DDL and stores no address or user agent", () => {
    const visitorRows = db.prepare("SELECT * FROM site_analytics_visitors").all();
    expect(visitorRows).toHaveLength(2);
    for (const row of visitorRows) {
      expect(row.visitor_key).toMatch(/^[0-9a-f]{32}$/);
      expect(JSON.stringify(row)).not.toContain("203.0.113");
      expect(JSON.stringify(row)).not.toContain("Mozilla");
    }
    // Four views, but DNT leaves no visit row for visitor C.
    expect(db.prepare("SELECT SUM(views) AS views FROM site_analytics_daily").get().views).toBe(4);
    expect(db.prepare("SELECT COUNT(*) AS visits FROM site_analytics_visits").get().visits).toBe(3);
  });

  it("answers the report with the reserved-word alias fixed", async () => {
    const report = await readSiteAnalytics(env, SLUG, {
      days: 7,
      now: Date.UTC(2026, 9, 24, 12),
    });

    expect(report).not.toBeNull();
    expect(report.totals).toEqual({
      views: 4,
      visitors: 2,
      returning: 1,
      newVisitors: 1,
      viewsPerVisitor: 2,
    });
    expect(report.range).toEqual({ days: 7, from: "2026-10-18", to: "2026-10-24" });
    expect(report.series).toHaveLength(7);
    expect(report.series.find((entry) => entry.day === "2026-10-21")).toMatchObject({
      views: 1,
      visitors: 1,
      returning: 1,
    });
    expect(report.pages).toEqual([
      { page: "index.html", views: 3 },
      { page: "about.html", views: 1 },
    ]);
    expect(report.source).toEqual(
      expect.arrayContaining([
        { value: "direct", views: 3 },
        { value: "internal", views: 1 },
      ]),
    );
    expect(report.trackingSince).toBe("2026-10-20");
    expect(report.hasData).toBe(true);
    expect(report.retentionDays).toBe(90);
  });

  it("deletes every table's rows for an unpublished slug", async () => {
    expect(await deleteSiteAnalyticsForSlug(env, SLUG)).toBe(true);
    for (const table of Object.values({
      daily: "site_analytics_daily",
      breakdown: "site_analytics_breakdown",
      visits: "site_analytics_visits",
      visitors: "site_analytics_visitors",
    })) {
      expect(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count).toBe(0);
    }
  });
});
