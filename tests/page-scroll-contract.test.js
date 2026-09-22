// @vitest-environment jsdom
// Contract: every full-page route must be its own scroll container.
//
// body carries overflow: hidden, which propagates to the viewport and blocks
// user scrolling (wheel, touch, PageDown) while still allowing programmatic
// window.scrollTo. A page that relies on document scrolling therefore looks
// scrollable to an automated scrollTo check and is unscrollable for a real
// reader — which is exactly how /privacy shipped broken. These assertions read
// the stylesheet, so they hold in every environment.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, '../src/index.css'), 'utf8');

/** Extract the declaration block for a selector, ignoring nested at-rules. */
function blockFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'));
  return match ? match[2] : '';
}

/** Every flat (non-nested) rule whose declarations match the pattern. */
function rulesMatching(pattern) {
  // Comments first: a stray "}" inside one would split rules wrongly.
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((match) => ({ selectors: match[1].trim(), block: match[2] }))
    .filter((rule) => pattern.test(rule.block));
}

const FULL_PAGE_ROUTES = ['.pricing-page', '.auth-page', '.legal-page'];

// Containers that take focus on arrival. The auth page is excluded on purpose:
// its email field carries autoFocus, so focus already lands inside the scroller
// (asserted in tests/page-focus.test.jsx).
const FOCUS_ON_ARRIVAL = ['.pricing-page', '.legal-page'];

describe('full-page routes scroll without relying on the document', () => {
  it('body still hides overflow, which is why the pattern is required', () => {
    expect(blockFor('body')).toMatch(/overflow:\s*hidden/);
  });

  it.each(FULL_PAGE_ROUTES)('%s is its own scroll container', (selector) => {
    const block = blockFor(selector);
    expect(block, `${selector} block not found`).not.toBe('');
    expect(block).toMatch(/overflow-y:\s*auto/);
  });

  it('the legal page is pinned to the viewport so it covers the full height', () => {
    const block = blockFor('.legal-page');
    expect(block).toMatch(/position:\s*fixed/);
    expect(block).toMatch(/inset:\s*0/);
    expect(block).toMatch(/overflow-x:\s*hidden/);
  });

  it('the sticky legal nav can stick for the whole document', () => {
    const block = blockFor('.legal-nav');
    expect(block).toMatch(/position:\s*sticky/);
    expect(block).toMatch(/top:\s*0/);
    expect(block).toMatch(/width:\s*100%/);
  });

  it('printing returns the legal page to normal flow', () => {
    const printStart = css.indexOf('@media print');
    expect(printStart).toBeGreaterThan(-1);
    // The end of the block is found with a line-ending-agnostic pattern: a
    // Windows checkout has CRLF in the working copy, and a literal '\n}\n'
    // search silently returns -1 there, emptying the block and failing this
    // assertion for a reason that has nothing to do with print styles.
    const articleRule = css.indexOf('.legal-article p', printStart);
    const blockEnd = /\r?\n\}\r?\n/.exec(css.slice(articleRule));
    expect(blockEnd, 'print block for .legal-article p not found').toBeTruthy();
    const printBlock = css.slice(printStart, articleRule + blockEnd.index + blockEnd[0].length);
    expect(printBlock).toMatch(/\.legal-page\s*\{[^}]*position:\s*static/);
    expect(printBlock).toMatch(/\.legal-page\s*\{[^}]*overflow:\s*visible/);
  });

  it('anchors the auth card to the top of the page instead of centring it', () => {
    // Login and Sign Up differ in height by the consent rows. A vertically
    // centred card shifted its top edge - and with it the logo, both tabs and
    // every field - each time the mode changed.
    const block = blockFor('.auth-center');
    expect(block, '.auth-center block not found').not.toBe('');
    expect(block).toMatch(/align-items:\s*flex-start/);
    expect(block).not.toMatch(/align-items:\s*center/);
  });

  it('the consent banner reserves space inside whichever container scrolls', () => {
    const rule = css.match(/body\.corez-consent-visible[^{]*\{([^}]*)\}/);
    expect(rule).toBeTruthy();
    expect(rule[1]).toMatch(/padding-bottom:\s*var\(--corez-consent-space/);
    for (const selector of FULL_PAGE_ROUTES) {
      expect(rule[0]).toContain(selector);
    }
  });

  it('keyboard scrolling can reach each scroller: the container is focusable and is not left with a focus ring', () => {
    const outlineReset = rulesMatching(/outline:\s*none/);
    const pageRule = outlineReset.find((rule) =>
      FOCUS_ON_ARRIVAL.every((selector) => rule.selectors.includes(`${selector}:focus`)),
    );
    expect(pageRule, 'no :focus rule resetting the outline for the page containers').toBeTruthy();
  });
});
