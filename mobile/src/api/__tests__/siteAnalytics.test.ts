import { requestJson } from "../client";
import {
  chartBarHeights,
  getSiteAnalytics,
  shortDayLabel,
} from "../siteAnalytics";

jest.mock("../client", () => {
  const actual = jest.requireActual("../client");
  return { ...actual, requestJson: jest.fn() };
});

const requestMock = requestJson as jest.MockedFunction<typeof requestJson>;

beforeEach(() => {
  requestMock.mockReset();
});

describe("site analytics API", () => {
  it("requests the owner report with the selected range", async () => {
    requestMock.mockResolvedValueOnce({ slug: "moon", totals: {} });
    await getSiteAnalytics("moon", 30);
    expect(requestMock).toHaveBeenCalledWith(
      "/api/publish/moon/analytics?days=30",
      { method: "GET", timeoutMs: 30_000 },
    );
  });

  it("encodes the slug and defaults to 7 days", async () => {
    requestMock.mockResolvedValueOnce({ slug: "a/b" });
    await getSiteAnalytics("a/b");
    expect(requestMock).toHaveBeenCalledWith(
      "/api/publish/a%2Fb/analytics?days=7",
      expect.any(Object),
    );
  });

  it("rejects a missing slug instead of calling the API", async () => {
    await expect(getSiteAnalytics("  ")).rejects.toThrow(/slug is required/i);
    expect(requestMock).not.toHaveBeenCalled();
  });
});

describe("chartBarHeights", () => {
  const point = (views: number) => ({
    day: "2026-11-07",
    views,
    visitors: 0,
    returning: 0,
  });

  it("scales the largest day to the chart height", () => {
    expect(chartBarHeights([point(0), point(5), point(10)])).toEqual([2, 36, 72]);
  });

  it("keeps zero days visible as a flat stub", () => {
    expect(chartBarHeights([point(0), point(0)])).toEqual([2, 2]);
  });

  it("handles an empty series", () => {
    expect(chartBarHeights([])).toEqual([]);
  });
});

describe("shortDayLabel", () => {
  it("formats ISO days as short UTC dates", () => {
    expect(shortDayLabel("2026-11-07")).toBe("7 Nov");
    expect(shortDayLabel("2026-01-01")).toBe("1 Jan");
  });

  it("passes unknown input through", () => {
    expect(shortDayLabel("not-a-day")).toBe("not-a-day");
    expect(shortDayLabel("")).toBe("");
  });
});
