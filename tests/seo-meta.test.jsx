// @vitest-environment jsdom
//
// Per-route metadata.
//
// The served head is one static document for every URL, so the parts of it that
// are route specific have to be corrected on navigation. Two defects motivated
// this:
//
//  - `<link rel="canonical">` was hardcoded to https://corez.pro/, so /pricing
//    and every policy told crawlers they were duplicates of the front door and
//    were dropped from the index even though the sitemap submits them;
//  - the title was the marketing one everywhere, which in the chat is noise in
//    a browser tab and advertises front-door keywords for a private page.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import App from "../src/App.jsx";
import {
  HOME_TITLE,
  applyRouteMeta,
  routeMetaFor,
} from "../src/utils/seo.js";

const SITE = "https://corez.pro";

function signedInFetch() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const target = String(url);
    if (target.includes("/api/auth/me")) {
      return new Response(JSON.stringify({ user: { id: "u1", email: "a@b.co" } }), { status: 200 });
    }
    if (target.includes("/api/chats")) {
      return new Response(JSON.stringify({ chats: [] }), { status: 200 });
    }
    return new Response(null, { status: 404 });
  });
}

function signedOutFetch() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const target = String(url);
    if (target.includes("/api/auth/me")) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
    }
    return new Response(null, { status: 404 });
  });
}

const head = (selector) => document.head.querySelector(selector);
const metaContent = (selector) => head(selector)?.getAttribute("content");

async function openAt(path) {
  window.history.pushState({}, "", path);
  render(<App />);
}

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
  document.head.querySelectorAll("meta, link[rel=canonical]").forEach((el) => el.remove());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("what a route says about itself", () => {
  it("consolidates the front door and its sign-in redirect onto one canonical", () => {
    for (const path of ["/", "/login", ""]) {
      const meta = routeMetaFor(path);
      expect(meta.canonical).toBe(`${SITE}/`);
      expect(meta.title).toBe(HOME_TITLE);
      expect(meta.robots).toMatch(/^index/);
    }
  });

  it("gives /pricing a canonical of its own, not the front door", () => {
    const meta = routeMetaFor("/pricing");
    expect(meta.canonical).toBe(`${SITE}/pricing`);
    expect(meta.title).toMatch(/Pricing/);
    expect(meta.robots).toMatch(/^index/);
  });

  it("gives each policy a canonical of its own and leaves the title to the page", () => {
    const meta = routeMetaFor("/privacy");
    expect(meta.canonical).toBe(`${SITE}/privacy`);
    expect(meta.robots).toMatch(/^index/);
    // Legal.jsx sets <title> from the same document; this must not fight it.
    expect(meta.ownTitle).toBe(true);
    expect(meta.title).toMatch(/Privacy Policy/);
  });

  it("keeps the chat and the signed-in app out of the index", () => {
    for (const meta of [
      routeMetaFor("/chat/abc123"),
      routeMetaFor("/", { signedIn: true }),
    ]) {
      expect(meta.robots).toBe("noindex, nofollow");
      expect(meta.title).toBe("Corez");
      // A page that must not be indexed makes no canonical claim at all.
      expect(meta.canonical).toBeNull();
    }
  });

  it("keeps a checkout return out of the index", () => {
    expect(routeMetaFor("/payment/success").robots).toBe("noindex, nofollow");
  });

  it("normalises a trailing slash", () => {
    expect(routeMetaFor("/pricing/").canonical).toBe(`${SITE}/pricing`);
    expect(routeMetaFor("/").canonical).toBe(`${SITE}/`);
  });
});

describe("applying it to the document", () => {
  it("rewrites the canonical link rather than adding a second one", () => {
    applyRouteMeta("/", { doc: document });
    expect(document.head.querySelectorAll('link[rel="canonical"]').length).toBe(1);
    expect(head('link[rel="canonical"]').getAttribute("href")).toBe(`${SITE}/`);

    applyRouteMeta("/pricing", { doc: document });
    expect(document.head.querySelectorAll('link[rel="canonical"]').length).toBe(1);
    expect(head('link[rel="canonical"]').getAttribute("href")).toBe(`${SITE}/pricing`);
    expect(metaContent('meta[property="og:url"]')).toBe(`${SITE}/pricing`);
  });

  it("removes the canonical and the og:url entirely on a noindex route", () => {
    applyRouteMeta("/pricing", { doc: document });
    applyRouteMeta("/chat/abc123", { doc: document });
    expect(head('link[rel="canonical"]')).toBeNull();
    expect(head('meta[property="og:url"]')).toBeNull();
    expect(metaContent('meta[name="robots"]')).toBe("noindex, nofollow");
    expect(document.title).toBe("Corez");
  });
});

describe("through the app", () => {
  it("shows the plain product name in the chat, not the marketing title", async () => {
    signedInFetch();
    await openAt("/chat/abc123");

    await waitFor(() => {
      expect(document.title).toBe("Corez");
    });
    expect(document.title).not.toMatch(/Turn Ideas into Websites/);
    expect(metaContent('meta[name="robots"]')).toBe("noindex, nofollow");
  });

  it("leaves the marketing title on the front door", async () => {
    // Signed out, because that is the document a crawler and a new visitor get.
    signedOutFetch();
    await openAt("/login");

    await waitFor(() => {
      expect(document.title).toBe(HOME_TITLE);
    });
    expect(head('link[rel="canonical"]').getAttribute("href")).toBe(`${SITE}/`);
    expect(metaContent('meta[name="robots"]')).toMatch(/^index/);
    expect(screen.getByText("COREZ")).toBeTruthy();
  });
});
