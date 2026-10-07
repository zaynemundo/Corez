/**
 * Per-route document metadata.
 *
 * `index.html` ships one static `<head>` for every URL. That is right for the
 * first paint and wrong for search, because two things in it are route
 * specific and were hardcoded to the front door:
 *
 *  - `<link rel="canonical" href="https://corez.pro/">` — so `/pricing` and
 *    every policy told crawlers they were duplicates of `/` and were dropped
 *    from the index, even though `public/sitemap.xml` submits them;
 *  - the title, which was the marketing one on every route. In the chat that
 *    reads as noise in a browser tab, and it also advertised the front door's
 *    keywords for a private, signed-in page.
 *
 * This module is the single source of truth for what a route says about itself.
 * `AppInner` applies it on every navigation, above its early returns, so it
 * runs for public and private routes alike. The legal pages keep setting their
 * own `<title>` in `src/pages/Legal.jsx` (a tested behaviour), so this module
 * leaves the title alone there and only corrects the canonical and social tags.
 */

import { LEGAL_DOCUMENTS } from "../data/legalDocuments.js";

export const SITE_ORIGIN = "https://corez.pro";

export const HOME_TITLE =
  "Corez — Turn Ideas into Websites, Apps & Games with AI";
export const HOME_DESCRIPTION =
  "Corez is the conversational AI creation platform. Chat your idea and get websites, apps & games instantly — live preview and one-click publish. No code.";

/**
 * The chat and the signed-in app are private, personalised surfaces: they must
 * never be indexed, and their tab title is just the product name.
 */
export const APP_TITLE = "Corez";

const LEGAL_PATHS = { privacy: "privacy", terms: "terms", cookies: "cookies", refunds: "refunds" };

/**
 * The metadata for one route.
 *
 * @param {string} pathname - `location.pathname`, with or without a trailing slash.
 * @param {{ signedIn?: boolean }} [context] - whether a session owns the route.
 * @returns {{ title: string|null, description: string, canonical: string|null,
 *   robots: string, ownTitle: boolean }} `title` is null when the page owns it.
 */
export function routeMetaFor(pathname, { signedIn = false } = {}) {
  const path = pathname.replace(/\/+$/, "") || "/";

  // The signed-in app, and any chat, is private.
  if (signedIn && (path === "/" || path.startsWith("/chat/"))) {
    return {
      title: APP_TITLE,
      description: HOME_DESCRIPTION,
      canonical: null,
      robots: "noindex, nofollow",
      ownTitle: false,
    };
  }
  if (path.startsWith("/chat/")) {
    return {
      title: APP_TITLE,
      description: HOME_DESCRIPTION,
      canonical: null,
      robots: "noindex, nofollow",
      ownTitle: false,
    };
  }

  // The front door. `/` sends a signed-out visitor to `/login`, and both serve
  // the same document, so they share one canonical to consolidate the signal.
  if (path === "/" || path === "/login") {
    return {
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      canonical: `${SITE_ORIGIN}/`,
      robots: "index, follow, max-image-preview:large",
      ownTitle: false,
    };
  }

  if (path === "/pricing") {
    return {
      title: "Pricing — Corez",
      description:
        "Corez plans and pricing. Start free, then upgrade for more AI creations, higher limits and custom domains. Chat your idea and publish a website, app or game.",
      canonical: `${SITE_ORIGIN}/pricing`,
      robots: "index, follow, max-image-preview:large",
      ownTitle: false,
    };
  }

  // Checkout return: transactional, never a search result.
  if (path === "/payment/success") {
    return {
      title: "Payment — Corez",
      description: HOME_DESCRIPTION,
      canonical: null,
      robots: "noindex, nofollow",
      ownTitle: false,
    };
  }

  const legalId = LEGAL_PATHS[path.slice(1)];
  if (legalId) {
    const doc = LEGAL_DOCUMENTS[legalId];
    return {
      // Legal.jsx sets `<title>` from the same document, so this only feeds the
      // social tags; it is here to keep the two from drifting apart.
      title: `${doc.title} · Corez`,
      description:
        doc.summary ||
        `${doc.title} for Corez — how the platform handles your data, your content and your account.`,
      canonical: `${SITE_ORIGIN}/${legalId}`,
      robots: "index, follow, max-image-preview:large",
      ownTitle: true,
    };
  }

  // Unknown route: it renders the front door (or a redirect), so it must not
  // claim a canonical of its own.
  return {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    canonical: `${SITE_ORIGIN}/`,
    robots: "index, follow, max-image-preview:large",
    ownTitle: false,
  };
}

/** Set a `<meta>` by selector, creating it when the static head lacks it. */
function setMeta(doc, selector, attrs) {
  let el = doc.head.querySelector(selector);
  if (!el) {
    el = doc.createElement("meta");
    doc.head.appendChild(el);
  }
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
}

/**
 * Apply one route's metadata to the document.
 *
 * @param {string} pathname - the route being rendered.
 * @param {{ signedIn?: boolean, doc?: Document }} [context]
 * @returns {ReturnType<typeof routeMetaFor>} what was applied.
 */
export function applyRouteMeta(pathname, { signedIn = false, doc } = {}) {
  const target = doc || (typeof document === "undefined" ? null : document);
  const meta = routeMetaFor(pathname, { signedIn });
  if (!target) return meta;

  if (meta.title && !meta.ownTitle) target.title = meta.title;

  setMeta(target, 'meta[name="description"]', { name: "description", content: meta.description });
  setMeta(target, 'meta[name="robots"]', { name: "robots", content: meta.robots });

  // A canonical is a claim about where the real copy lives. Routes that must
  // not be indexed make no claim, so the tag is removed rather than pointed at
  // the front door.
  const existing = target.head.querySelector('link[rel="canonical"]');
  if (meta.canonical) {
    if (existing) existing.setAttribute("href", meta.canonical);
    else {
      const link = target.createElement("link");
      link.setAttribute("rel", "canonical");
      link.setAttribute("href", meta.canonical);
      target.head.appendChild(link);
    }
  } else if (existing) {
    existing.remove();
  }

  const social = meta.title || target.title;
  setMeta(target, 'meta[property="og:title"]', { property: "og:title", content: social });
  setMeta(target, 'meta[property="og:description"]', { property: "og:description", content: meta.description });
  setMeta(target, 'meta[name="twitter:title"]', { name: "twitter:title", content: social });
  setMeta(target, 'meta[name="twitter:description"]', { name: "twitter:description", content: meta.description });
  if (meta.canonical) {
    setMeta(target, 'meta[property="og:url"]', { property: "og:url", content: meta.canonical });
  } else {
    target.head.querySelector('meta[property="og:url"]')?.remove();
  }

  return meta;
}
