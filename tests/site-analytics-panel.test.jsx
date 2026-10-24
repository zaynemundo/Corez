// @vitest-environment jsdom
//
// The per-site analytics panel: the tiles, the chart summary, the ranked lists,
// and the honest loading/empty/error states. The worker contract covers the
// numbers' provenance; these tests pin what the owner actually sees.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import SiteAnalyticsPanel from "../src/components/SiteAnalyticsPanel.jsx";
import Sites from "../src/pages/Sites.jsx";
import { I18nProvider } from "../src/i18n/index.jsx";

const SERIES = Array.from({ length: 30 }, (_, index) => ({
  day: new Date(Date.UTC(2026, 8, 25 + index)).toISOString().slice(0, 10),
  views: index === 26 ? 400 : 20,
  visitors: index === 26 ? 60 : 15,
  returning: index === 26 ? 4 : 1,
}));

const REPORT = {
  slug: "asyag23-123",
  url: "/asyag23-123",
  title: "Portfolio",
  range: { days: 30, from: "2026-09-25", to: "2026-10-24" },
  totals: {
    views: 1234,
    visitors: 456,
    returning: 78,
    newVisitors: 378,
    viewsPerVisitor: 2.7,
  },
  previous: { views: 1000, visitors: 400 },
  change: { views: 23.4, visitors: 14 },
  series: SERIES,
  pages: [
    { page: "index.html", views: 900 },
    { page: "about.html", views: 334 },
  ],
  source: [
    { value: "direct", views: 800 },
    { value: "google.com", views: 434 },
  ],
  country: [
    { value: "AE", views: 700 },
    { value: "US", views: 534 },
  ],
  device: [
    { value: "desktop", views: 900 },
    { value: "mobile", views: 334 },
  ],
  trackingSince: "2026-09-01",
  hasData: true,
  retentionDays: 90,
  collectionDisabled: false,
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockAnalytics(report = REPORT) {
  const calls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const target = String(url);
    calls.push(target);
    if (target.includes("/analytics")) return json(report);
    return json({ error: `unexpected ${target}` }, 404);
  });
  return calls;
}

function renderPanel(props = {}) {
  return render(
    <I18nProvider>
      <SiteAnalyticsPanel slug="asyag23-123" title="Portfolio" onClose={vi.fn()} {...props} />
    </I18nProvider>,
  );
}

function renderSites() {
  return render(
    <I18nProvider>
      <Sites onOpenChat={vi.fn()} />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the site analytics panel", () => {
  it("shows views, visitors, returning readers and depth for the period", async () => {
    const calls = mockAnalytics();
    renderPanel();

    expect(await screen.findByText("1,234")).toBeTruthy();
    expect(screen.getByText("456")).toBeTruthy();
    expect(screen.getByText("78")).toBeTruthy();
    expect(screen.getByText("2.7")).toBeTruthy();
    expect(screen.getByText("+23.4%")).toBeTruthy();
    expect(screen.getByText("+14%")).toBeTruthy();
    expect(calls[0]).toContain("/api/publish/asyag23-123/analytics?days=30");
  });

  it("names the busiest day and ranks pages, sources, countries and devices", async () => {
    mockAnalytics();
    renderPanel();
    await screen.findByText("1,234");

    // The chart carries an accessible summary instead of thirty unlabelled bars.
    expect(
      screen.getByRole("img", { name: /Sep 25 – Oct 24: 1,234 views/i }),
    ).toBeTruthy();
    expect(screen.getByText(/Busiest day: Oct 21 \(400 views\)/i)).toBeTruthy();

    expect(screen.getByText("Home")).toBeTruthy();
    expect(screen.getByText("about.html")).toBeTruthy();
    expect(screen.getByText("google.com")).toBeTruthy();
    expect(screen.getByText("Desktop")).toBeTruthy();
    expect(screen.getByText("Mobile")).toBeTruthy();
    expect(screen.getByText(/Tracking since Sep 1, 2026/i)).toBeTruthy();
    expect(screen.getByText(/cookie-free analytics/i)).toBeTruthy();
  });

  it("reloads when the owner changes the date range", async () => {
    const calls = mockAnalytics();
    renderPanel();
    await screen.findByText("1,234");

    fireEvent.click(screen.getByRole("button", { name: "7 days" }));

    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toContain("days=7");
    expect(
      screen.getByRole("button", { name: "7 days" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("shows a share-the-link empty state before the first visit", async () => {
    mockAnalytics({
      ...REPORT,
      totals: {
        views: 0,
        visitors: 0,
        returning: 0,
        newVisitors: 0,
        viewsPerVisitor: 0,
      },
      change: { views: null, visitors: null },
      series: SERIES.map((entry) => ({ ...entry, views: 0, visitors: 0, returning: 0 })),
      pages: [],
      source: [],
      country: [],
      device: [],
      hasData: false,
      trackingSince: null,
    });
    renderPanel();

    expect(await screen.findByText("No views yet")).toBeTruthy();
    // The most common reason for a believable zero: the owner's own visit.
    expect(screen.getByText(/signed-in browser are not counted/i)).toBeTruthy();
    expect(screen.getByText(/private window/i)).toBeTruthy();
    expect(screen.queryByText("Top pages")).toBeNull();
    expect(screen.queryByText("Devices")).toBeNull();
  });

  it("reports an unavailable deployment and retries", async () => {
    const calls = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      calls.push(String(url));
      return json({ error: "Site analytics storage is not configured on this deployment." }, 503);
    });
    renderPanel();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("not configured");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(calls).toHaveLength(2));
  });

  it("closes from its own header", async () => {
    mockAnalytics();
    const onClose = vi.fn();
    renderPanel({ onClose });
    await screen.findByText("1,234");
    fireEvent.click(screen.getByRole("button", { name: "Close analytics" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("opening analytics from a site card", () => {
  it("loads that site's report and closes it again", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const target = String(url);
      if (target === "/api/publish") {
        return json({
          pages: [
            {
              slug: "asyag23-123",
              url: "/asyag23-123",
              title: "Portfolio",
              createdAt: "2026-10-01T10:00:00.000Z",
              badge: true,
              customized: false,
              pages: 1,
              bytes: 4200,
            },
          ],
          truncated: false,
        });
      }
      if (target.includes("/analytics")) return json(REPORT);
      return json({ error: `unexpected ${target}` }, 404);
    });

    renderSites();
    await screen.findByText("Portfolio");
    fireEvent.click(screen.getByRole("button", { name: "Analytics" }));

    expect(await screen.findByText("1,234")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close analytics" }));
    await waitFor(() => expect(screen.queryByText("1,234")).toBeNull());
  });
});
