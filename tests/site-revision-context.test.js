import { describe, it, expect } from "vitest";
import { buildSiteRevisionContext } from "../src/utils/siteRevisionContext.js";

const SITE = {
  slug: "portfolio-123",
  url: "/portfolio-123",
  title: "Portfolio",
  html: "<!DOCTYPE html><html><body><h1>Home</h1></body></html>",
  pages: {
    "work.html": "<!DOCTYPE html><html><body><h1>Work</h1></body></html>",
    "about.html": "<!DOCTYPE html><html><body><h1>About</h1></body></html>",
  },
};

describe("buildSiteRevisionContext", () => {
  it("names the site and includes every editable document in a stable order", () => {
    const context = buildSiteRevisionContext(SITE);

    expect(context).toContain("Published site: Portfolio at /portfolio-123");
    expect(context).toContain("===== index.html =====");
    expect(context).toContain("<h1>Home</h1>");
    expect(context).toContain("===== about.html =====");
    expect(context).toContain("<h1>About</h1>");
    expect(context).toContain("===== work.html =====");
    expect(context).toContain("<h1>Work</h1>");
    // Sub-pages are sorted rather than following object insertion order.
    expect(context.indexOf("===== about.html =====")).toBeLessThan(
      context.indexOf("===== work.html ====="),
    );
    // The model is told that untouched pages must survive the edit.
    expect(context).toMatch(/preserve every page/i);
  });

  it("trims documents without dropping empty sub-pages into the prompt", () => {
    const context = buildSiteRevisionContext({
      ...SITE,
      title: "  ",
      url: "",
      html: `\n${SITE.html}\n`,
      pages: {
        ...SITE.pages,
        "empty.html": "   ",
      },
    });

    expect(context).toContain("Published site: portfolio-123");
    expect(context).not.toContain("empty.html");
    expect(context).not.toContain("\n\n\n");
  });

  it("returns no context when there is no home document", () => {
    expect(buildSiteRevisionContext(null)).toBe("");
    expect(buildSiteRevisionContext({ pages: SITE.pages })).toBe("");
    expect(buildSiteRevisionContext({ html: "   " })).toBe("");
  });
});
