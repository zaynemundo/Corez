// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Legal, { LegalIndex } from '../src/pages/Legal.jsx';
import {
  LEGAL_CONTACTS,
  LEGAL_DOCUMENTS,
  LEGAL_ORDER,
  LEGAL_UPDATED,
} from '../src/data/legalDocuments.js';

afterEach(cleanup);

const KNOWN_ROUTES = new Set([
  '/',
  '/pricing',
  '/login',
  '/legal',
  '/privacy',
  '/terms',
  '/cookies',
  '/refunds',
  '/privacy-policy',
  '/terms-and-conditions',
  '/cookie-policy',
  '/refund-policy',
]);

function collectLinks(container) {
  return [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
}

describe('legal documents', () => {
  it('ships the four required policies, each substantial enough to be real', () => {
    expect(LEGAL_ORDER).toEqual(['privacy', 'terms', 'cookies', 'refunds']);
    for (const id of LEGAL_ORDER) {
      const doc = LEGAL_DOCUMENTS[id];
      expect(doc.id).toBe(id);
      expect(doc.title).toMatch(/Policy|Terms/);
      expect(doc.sections.length).toBeGreaterThanOrEqual(8);
      expect(doc.summary.length).toBeGreaterThan(40);
    }
  });

  it.each(LEGAL_ORDER)('renders %s with headings, a table of contents and a contact block', (id) => {
    const doc = LEGAL_DOCUMENTS[id];
    render(<Legal docId={id} />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(doc.title);
    expect(screen.getAllByText(new RegExp(LEGAL_UPDATED)).length).toBeGreaterThan(0);
    expect(screen.getByRole('navigation', { name: /on this page/i })).toBeTruthy();

    for (const section of doc.sections) {
      expect(screen.getByRole('heading', { level: 2, name: section.heading })).toBeTruthy();
    }

    for (const email of Object.values(LEGAL_CONTACTS)) {
      expect(screen.getAllByText(email).length).toBeGreaterThan(0);
    }
  });

  it.each(LEGAL_ORDER)('%s links only to routes that exist', (id) => {
    const { container } = render(<Legal docId={id} />);
    for (const href of collectLinks(container)) {
      if (!href) continue;
      if (href.startsWith('mailto:') || href.startsWith('#')) continue;
      if (href.startsWith('https://')) continue;
      expect(KNOWN_ROUTES.has(href), `${id} links to unknown route ${href}`).toBe(true);
    }
  });

  it('cross-links every other policy from each document', () => {
    for (const id of LEGAL_ORDER) {
      cleanup();
      render(<Legal docId={id} />);
      for (const other of LEGAL_ORDER) {
        if (other === id) continue;
        expect(
          screen.getAllByRole('link', { name: new RegExp(LEGAL_DOCUMENTS[other].title, 'i') })
            .length,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('renders tables where the documents use them', () => {
    render(<Legal docId="cookies" />);
    // The cookie inventory must name the storage the app actually writes.
    expect(screen.getByText('corez_session')).toBeTruthy();
    expect(screen.getByText(/corez_consent_v1/)).toBeTruthy();
    expect(screen.getAllByRole('table').length).toBeGreaterThan(0);
  });

  it('names the processors the product actually calls', () => {
    render(<Legal docId="privacy" />);
    for (const processor of ['Cloudflare', 'OpenCode Zen', 'Ziina', 'Resend']) {
      expect(screen.getAllByText(new RegExp(processor, 'i')).length).toBeGreaterThan(0);
    }
  });

  it('states the no-refund stance together with statutory rights', () => {
    render(<Legal docId="refunds" />);
    expect(screen.getByText(/we do not refund part-used billing periods/i)).toBeTruthy();
    expect(screen.getByText(/14 days from the start of a new paid subscription/i)).toBeTruthy();
  });

  it('offers a Cookie settings control and a print action', () => {
    render(<Legal docId="privacy" />);
    expect(screen.getByRole('button', { name: /cookie settings/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /print or save as pdf/i })).toBeTruthy();
  });

  it('lists all policies on the index and handles an unknown document', () => {
    render(<LegalIndex />);
    for (const id of LEGAL_ORDER) {
      expect(screen.getAllByText(LEGAL_DOCUMENTS[id].title).length).toBeGreaterThan(0);
    }
    cleanup();
    render(<Legal docId="does-not-exist" />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/not found/i);
  });
});
