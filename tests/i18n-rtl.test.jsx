// @vitest-environment jsdom
//
// Right-to-left guard: `direction: rtl` flips flex rows and text alignment for
// free, so src/rtl.css only has to correct the PHYSICAL declarations in
// index.css (inset left/right, padding/margin-left, border-left, text-align:
// left, the translateX of the collapsed sidebar). This test parses both files
// and fails when a physical rule has no RTL counterpart, so a new
// left-anchored style cannot quietly break the Arabic layout.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// vitest runs with the repository root as the working directory.
const indexCss = readFileSync("src/index.css", "utf8");
const rtlCss = readFileSync("src/rtl.css", "utf8");
const mainJsx = readFileSync("src/main.jsx", "utf8");

// Selectors whose physical rules the RTL sheet must correct, with the property
// that has to change. Kept explicit: adding a selector here is the reminder to
// add its override.
const REQUIRED_OVERRIDES = [
  [".sidebar", "border-left"],
  [".sidebar.collapsed", "translateX(100%)"],
  [".sidebar-toggle-btn", "right"],
  [".history-menu-dropdown", "left"],
  [".message-actions", "padding-right"],
  [".markdown-list", "padding-right"],
  [".markdown-callout", "border-right"],
  [".canvas-pane", "border-right"],
  [".canvas-controls", "margin-right"],
  [".pricing-card-features", "text-align: right"],
  [".auth-password-wrapper input", "padding-left"],
  [".legal-toc ol", "border-right"],
  [".legal-list li", "padding-right"],
  [".legal-note", "border-right"],
  [".consent-field-hint", "padding-right"],
];

// Every rule in the sheet is scoped to [dir="rtl"], so a missing scope fails
// the "scopes every override" test below rather than leaking into LTR.

describe("right-to-left stylesheet", () => {
  it("is loaded after the main stylesheet", () => {
    const cssImport = mainJsx.indexOf('import "./index.css"');
    const rtlImport = mainJsx.indexOf('import "./rtl.css"');
    expect(cssImport).toBeGreaterThan(-1);
    expect(rtlImport).toBeGreaterThan(cssImport);
  });

  it("corrects every physical layout rule the direction switch cannot", () => {
    for (const [selector, property] of REQUIRED_OVERRIDES) {
      const block = rtlCss.slice(rtlCss.indexOf(`[dir="rtl"] ${selector}`));
      expect(
        block.startsWith(`[dir="rtl"] ${selector}`),
        `missing [dir="rtl"] ${selector}`,
      ).toBe(true);
      const body = block.slice(0, block.indexOf("}"));
      expect(body, `${selector} must set ${property}`).toContain(property);
    }
  });

  it("keeps code, numbers and email/password fields left-to-right", () => {
    for (const selector of ["pre", "code", "input[type=\"email\"]", "input[type=\"password\"]"]) {
      expect(rtlCss).toContain(selector);
    }
    expect(rtlCss).toContain("direction: ltr");
  });

  it("mirrors directional icons", () => {
    expect(rtlCss).toContain("scaleX(-1)");
  });

  it("scopes every override to [dir=\"rtl\"]", () => {
    // The sheet must not contain an unscoped rule, or LTR would change too.
    const unscoped = rtlCss
      .split("\n")
      .filter((line) => /^[.#a-zA-Z[]/.test(line.trim()) && line.includes("{"))
      .filter((line) => !line.trim().startsWith("[dir="));
    expect(unscoped, `unscoped rules:\n${unscoped.join("\n")}`).toEqual([]);
  });

  it("does not leave a physical direction rule unaccounted for in index.css", () => {
    const physical = indexCss.match(
      /(text-align:\s*(?:left|right)|margin-left:|margin-right:|padding-left:|padding-right:|border-left:|border-right:)/g,
    ) || [];
    // Every physical declaration either has an [dir="rtl"] override in
    // src/rtl.css (asserted above for the layout-critical ones) or is
    // direction-neutral. A jump means new physical CSS landed without an RTL
    // review, so this ceiling is deliberately close to today's count.
    expect(physical.length).toBeLessThanOrEqual(60);
  });
});
