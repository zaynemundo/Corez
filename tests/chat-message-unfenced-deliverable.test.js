/**
 * Unfenced deliverable extraction — the start-of-artifact boundary.
 *
 * A model writing a multi-page site typically writes the home page straight
 * into the reply, UNMARKED, and only starts emitting `<!-- PAGE: ... -->`
 * markers from the second document:
 *
 *   <!DOCTYPE html> …home… </html>
 *   <!-- PAGE: about.html -->
 *   <!DOCTYPE html> …about… </html>
 *
 * Extraction used to slice from the first MARKER, which discarded the whole
 * home page. The completeness gate then reported "Missing index.html home
 * page" and one dangling link per navigation element on every sub-page
 * ("about.html links to missing page index.html", five times for a page with
 * brand + nav + drawer + two footer links), and publishing was blocked even
 * though the model had emitted a perfectly good home page.
 *
 * These tests pin the boundary itself and the end-to-end consequence.
 */

import { describe, it, expect } from 'vitest';
import { extractUnfencedDeliverable } from '../src/components/ChatMessage.jsx';
import { extractCodeFromMessage } from '../src/services/aiService.js';
import {
  parseMultiPageSite,
  validateMultiPageSite,
  ensureLeadingPageMarker,
} from '../src/utils/previewTransformer.js';

/** A page carrying the five home links a real template has. */
function page(title) {
  return [
    '<!DOCTYPE html>',
    '<html lang="en"><head><title>' + title + '</title></head><body>',
    '<a href="index.html">brand</a>',
    '<a href="index.html">nav</a>',
    '<a href="index.html">drawer</a>',
    '<a href="index.html">footer</a>',
    '<a href="index.html">footer nav</a>',
    '<a href="about.html">About</a>',
    '</body></html>',
  ].join('\n');
}

/** Unmarked home page followed by five marked sub-pages. */
const MULTI_PAGE_WITH_UNMARKED_HOME = [
  page('Home'),
  '<!-- PAGE: about.html -->',
  page('About'),
  '<!-- PAGE: services.html -->',
  page('Services'),
  '<!-- PAGE: team.html -->',
  page('Team'),
  '<!-- PAGE: contact.html -->',
  page('Contact'),
  '<!-- PAGE: faq.html -->',
  page('FAQ'),
].join('\n');

describe('extractUnfencedDeliverable — start of artifact', () => {
  it('keeps an unmarked home page that precedes the first page marker', () => {
    const result = extractUnfencedDeliverable(MULTI_PAGE_WITH_UNMARKED_HOME);
    expect(result, 'extraction returned nothing').toBeTruthy();
    // The artifact must begin at the home document — named by its own marker —
    // and not at the about.html marker.
    expect(result.code.startsWith('<!-- PAGE: index.html -->')).toBe(true);
    expect(result.code).toContain('<title>Home</title>');
    expect(result.code).toContain('<!-- PAGE: about.html -->');
    expect(result.code.indexOf('<title>Home</title>')).toBeLessThan(
      result.code.indexOf('<!-- PAGE: about.html -->'),
    );
  });

  it('still extracts a plain single document', () => {
    const result = extractUnfencedDeliverable(page('Only'));
    expect(result).toBeTruthy();
    expect(result.code).toContain('<title>Only</title>');
  });

  it('still extracts a marker-first multi-page site', () => {
    const text = `<!-- PAGE: index.html -->\n${page('Home')}\n<!-- PAGE: about.html -->\n${page('About')}`;
    const result = extractUnfencedDeliverable(text);
    expect(result).toBeTruthy();
    expect(result.code.startsWith('<!-- PAGE: index.html -->')).toBe(true);
  });

  it('keeps prose before the artifact as preamble', () => {
    const result = extractUnfencedDeliverable(`Here is your site:\n\n${page('Home')}`);
    expect(result.preamble).toBe('Here is your site:');
    expect(result.code.startsWith('<!DOCTYPE html>')).toBe(true);
  });

  it('returns null when there is no artifact at all', () => {
    expect(extractUnfencedDeliverable('Just a sentence with no markup.')).toBeNull();
    expect(extractUnfencedDeliverable('')).toBeNull();
  });
});

describe('the reported failure mode stays fixed end to end', () => {
  it('produces a complete, publishable site from an unmarked home page', () => {
    const { code } = extractUnfencedDeliverable(MULTI_PAGE_WITH_UNMARKED_HOME);
    const parsed = parseMultiPageSite(code);

    expect(parsed.pages.map((p) => p.name)).toContain('index.html');

    const validation = validateMultiPageSite(parsed.pages);
    const errors = validation.issues.filter((i) => i.severity === 'error');
    expect(
      errors.map((i) => i.message),
      'publishing would still be blocked',
    ).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it('would have blocked publishing if the home page were sliced away', () => {
    // Guard the regression itself: slicing from the first marker is exactly the
    // bug, so assert that shape is genuinely invalid rather than trusting that
    // the fixed path is the only one that matters.
    const markerOnly = MULTI_PAGE_WITH_UNMARKED_HOME.slice(
      MULTI_PAGE_WITH_UNMARKED_HOME.search(/<!--\s*PAGE:/i),
    );
    const parsed = parseMultiPageSite(markerOnly);
    expect(parsed.pages.map((p) => p.name)).not.toContain('index.html');
    expect(validateMultiPageSite(parsed.pages).valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The deterministic backstop. Prompt wording now says the marker comes BEFORE
// every page including the home page, but a model can always drift, so the
// artifact is normalised regardless of what it did.
// ---------------------------------------------------------------------------

describe('ensureLeadingPageMarker — canonical marker convention', () => {
  it('gives an unmarked leading document its own index.html marker', () => {
    const code = `<!DOCTYPE html>\n<html><body>home</body></html>\n<!-- PAGE: about.html -->\n<!DOCTYPE html>\n<html><body>about</body></html>`;
    const out = ensureLeadingPageMarker(code);
    expect(out.startsWith('<!-- PAGE: index.html -->')).toBe(true);
  });

  it('leaves an already-marked artifact untouched (no duplicate)', () => {
    const code = `<!-- PAGE: index.html -->\n<!DOCTYPE html>\n<html><body>home</body></html>\n<!-- PAGE: about.html -->\n<!DOCTYPE html>\n<html><body>about</body></html>`;
    const out = ensureLeadingPageMarker(code);
    expect(out).toBe(code);
    expect(out.match(/PAGE:\s*index\.html/gi)).toHaveLength(1);
  });

  it('leaves a single-page artifact alone so it stays single-page', () => {
    const code = `<!DOCTYPE html>\n<html><body>only</body></html>`;
    const out = ensureLeadingPageMarker(code);
    expect(out).toBe(code);
    expect(out).not.toContain('PAGE:');
    expect(parseMultiPageSite(out).isMultiPage).toBe(false);
  });

  it('does not invent a marker for a marker-first artifact', () => {
    const code = `<!-- PAGE: about.html -->\n<!DOCTYPE html>\n<html><body>about</body></html>`;
    expect(ensureLeadingPageMarker(code)).toBe(code);
  });

  it('is safe on empty and non-string input', () => {
    expect(ensureLeadingPageMarker('')).toBe('');
    expect(ensureLeadingPageMarker(null)).toBe(null);
    expect(ensureLeadingPageMarker(undefined)).toBe(undefined);
  });
});

describe('a model that ignores the instruction still yields a publishable site', () => {
  it('normalises the artifact end to end', () => {
    const { code } = extractUnfencedDeliverable(MULTI_PAGE_WITH_UNMARKED_HOME);
    // The artifact itself now carries the convention, not just the parser.
    expect(code.startsWith('<!-- PAGE: index.html -->')).toBe(true);

    const parsed = parseMultiPageSite(code);
    expect(parsed.pages.map((p) => p.name)).toEqual([
      'index.html',
      'about.html',
      'contact.html',
      'faq.html',
      'services.html',
      'team.html',
    ]);
    expect(validateMultiPageSite(parsed.pages).valid).toBe(true);
  });

  it('does not double-mark an artifact the model already marked correctly', () => {
    const marked = [
      '<!-- PAGE: index.html -->',
      page('Home'),
      '<!-- PAGE: about.html -->',
      page('About'),
    ].join('\n');
    const { code } = extractUnfencedDeliverable(marked);
    expect(code.match(/PAGE:\s*index\.html/gi)).toHaveLength(1);
    expect(validateMultiPageSite(parseMultiPageSite(code).pages).valid).toBe(true);
  });

  it('leaves a single-page reply as a single page', () => {
    const { code } = extractUnfencedDeliverable(page('Only'));
    expect(code).not.toContain('PAGE:');
    expect(parseMultiPageSite(code).isMultiPage).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The second copy of the same rule: truncated-response salvage in aiService.
// It searched for the first page marker too, so a truncated multi-page reply
// lost its unmarked home page the same way.
// ---------------------------------------------------------------------------

describe('truncated-response salvage keeps the unmarked home page', () => {
  it('extracts a truncated multi-page reply with its home page intact', () => {
    // No closing fence: the model was cut off mid-site.
    const truncated = [
      '```html',
      page('Home'),
      '<!-- PAGE: about.html -->',
      page('About'),
      '<!-- PAGE: services.html -->',
      '<!DOCTYPE html><html lang="en"><head><title>Serv',
    ].join('\n');

    const code = extractCodeFromMessage(truncated);
    expect(code, 'salvage returned nothing').toBeTruthy();
    expect(code).toContain('<title>Home</title>');
    expect(code.startsWith('<!-- PAGE: index.html -->')).toBe(true);

    const parsed = parseMultiPageSite(code);
    expect(parsed.pages.map((p) => p.name)).toContain('index.html');
  });

  it('does not regress a normal fenced single document', () => {
    const code = extractCodeFromMessage('```html\n' + page('Only') + '\n```');
    expect(code).toContain('<title>Only</title>');
    expect(code).not.toContain('PAGE:');
  });
});
