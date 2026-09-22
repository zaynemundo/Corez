// Consent state for Corez — cookies, local storage and optional trackers.
//
// One record is the single source of truth for every optional technology the
// product loads. Nothing here is inferred or defaulted to "on": a category is
// enabled only after the user actively turns it on, and the raw decision
// (including the receipts log) is kept so a consent record can be evidenced
// later. Selling or sharing data for advertising is not a category because the
// product does not do it — if that ever changes, a new category must be added
// and re-consented, which is why every record carries a version.
//
// Storage: localStorage["corez_consent_v1"]. That key holds no identifier and
// is intentionally the only consent-related storage: the analytics session id
// lives in memory (see analytics.js) so withdrawing consent leaves nothing to
// clean up beyond this record itself.

export const CONSENT_VERSION = 1;
export const CONSENT_STORAGE_KEY = "corez_consent_v1";
export const CONSENT_CHANGED_EVENT = "corez:consent-changed";
export const OPEN_CONSENT_SETTINGS_EVENT = "corez:open-consent-settings";

// How long a consent decision is honoured before the banner asks again.
export const CONSENT_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
// Bound the receipts log: enough to evidence a decision history, small enough
// to never grow unbounded in a browser profile.
const MAX_RECEIPTS = 20;

export const POLICY_ROUTES = {
  privacy: "/privacy",
  terms: "/terms",
  cookies: "/cookies",
  refunds: "/refunds",
};

export const CONSENT_CATEGORIES = [
  {
    id: "essential",
    label: "Strictly necessary",
    required: true,
    summary: "Always on",
    description:
      "Keeps you signed in, remembers the look of the app, protects sign-in from cross-site request forgery, and resumes an in-flight build if you reload. These cannot be switched off because the product does not work without them.",
  },
  {
    id: "analytics",
    label: "Analytics",
    required: false,
    summary: "Off until you allow it",
    description:
      "First-party product analytics: which pages are opened and which features are used, so broken flows can be found and fixed. No cookies, no advertising, no cross-site tracking, no profile built around you, and nothing sent to a third-party analytics company.",
  },
  {
    id: "embeds",
    label: "External media & embeds",
    required: false,
    summary: "Off until you allow it",
    description:
      "Lets embedded third-party media (for example a YouTube or Vimeo player) load in the page. Until this is allowed, those embeds stay as a click-to-load placeholder and the third party receives no request from your browser.",
  },
  {
    id: "marketing",
    label: "Marketing",
    required: false,
    summary: "Off until you allow it",
    description:
      "Product news and offers by email, plus any future advertising measurement. Corez does not run advertising or cross-site tracking pixels today; if that changes it will only ever run under this category, after you allow it.",
  },
];

export function getConsentCategory(categoryId) {
  return CONSENT_CATEGORIES.find((c) => c.id === categoryId) || null;
}

export function isKnownCategory(categoryId) {
  return Boolean(getConsentCategory(categoryId));
}

export function defaultConsentCategories() {
  const categories = {};
  for (const category of CONSENT_CATEGORIES) {
    categories[category.id] = Boolean(category.required);
  }
  return categories;
}

// Normalise any input down to the exact category set, with required categories
// forced on. Unknown keys are dropped rather than stored.
export function normalizeConsentCategories(input) {
  const categories = defaultConsentCategories();
  if (input && typeof input === "object") {
    for (const category of CONSENT_CATEGORIES) {
      if (category.required) continue;
      if (typeof input[category.id] === "boolean") {
        categories[category.id] = input[category.id];
      }
    }
  }
  return categories;
}

function storage() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    // Storage can throw when cookies/site data are blocked. Consent then simply
    // cannot be remembered, and the banner reappears on the next visit.
    return null;
  }
}

function isValidRecord(record) {
  return Boolean(
    record &&
      typeof record === "object" &&
      Number.isInteger(record.version) &&
      record.version === CONSENT_VERSION &&
      record.categories &&
      typeof record.categories === "object" &&
      Number.isFinite(record.decidedAt),
  );
}

/**
 * Read the stored consent record.
 * Returns null when no decision exists (banner required) or when the stored
 * record predates the current version (the user is asked again).
 */
export function readConsent() {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValidRecord(parsed)) return null;
    return {
      version: parsed.version,
      decidedAt: parsed.decidedAt,
      updatedAt: Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : parsed.decidedAt,
      source: typeof parsed.source === "string" ? parsed.source : "unknown",
      categories: normalizeConsentCategories(parsed.categories),
      receipts: Array.isArray(parsed.receipts)
        ? parsed.receipts.filter((r) => r && typeof r === "object").slice(-MAX_RECEIPTS)
        : [],
    };
  } catch {
    return null;
  }
}

export function hasConsentDecision() {
  return readConsent() !== null;
}

/**
 * Whether a category is currently allowed.
 * `essential` is always true; every other category requires an explicit
 * recorded decision that turns it on.
 */
export function hasConsent(categoryId) {
  if (!isKnownCategory(categoryId)) return false;
  const category = getConsentCategory(categoryId);
  if (category?.required) return true;
  const record = readConsent();
  if (!record) return false;
  return record.categories[categoryId] === true;
}

/**
 * Persist a decision and notify listeners. Returns the stored record, or null
 * when storage is unavailable (the caller should still treat the in-memory
 * choice as effective for this page load).
 */
export function saveConsent(inputCategories, { source = "banner", now = Date.now() } = {}) {
  const categories = normalizeConsentCategories(inputCategories);
  const previous = readConsent();
  const record = {
    version: CONSENT_VERSION,
    decidedAt: previous?.decidedAt || now,
    updatedAt: now,
    source,
    categories,
    receipts: [
      ...(previous?.receipts || []),
      { at: now, source, version: CONSENT_VERSION, categories: { ...categories } },
    ].slice(-MAX_RECEIPTS),
  };

  const store = storage();
  if (store) {
    try {
      store.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
    } catch {
      /* Storage full or blocked — the choice still applies to this page. */
    }
  }
  emitConsentChanged(record);
  return record;
}

export function clearConsent() {
  const store = storage();
  if (store) {
    try {
      store.removeItem(CONSENT_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  emitConsentChanged(null);
}

/**
 * Record that the user accepted the Terms / Privacy Policy while creating an
 * account. Terms and privacy acceptance is not a toggleable cookie category, so
 * it is kept as a receipt on the same record rather than as a category.
 *
 * `marketing` is only written when it is passed: account creation does not ask
 * the marketing question (the consent dialog does), so a signup must not
 * overwrite an answer the visitor already gave there.
 */
export function recordPolicyAcceptance({ marketing, source = "signup", now = Date.now() } = {}) {
  const current = readConsent();
  const base = current?.categories || defaultConsentCategories();
  const categories =
    marketing === undefined
      ? { ...base }
      : { ...base, marketing: Boolean(marketing) };
  return saveConsent(categories, { source, now });
}

export function browserBlocksAnalytics() {
  try {
    if (typeof navigator === "undefined" && typeof window === "undefined") return false;
    const nav = typeof navigator === "undefined" ? {} : navigator;
    const win = typeof window === "undefined" ? {} : window;
    const dnt =
      nav.doNotTrack ?? win.doNotTrack ?? nav.msDoNotTrack ?? null;
    if (String(dnt) === "1") return true;
    // Global Privacy Control: an opt-out-of-sale/sharing signal that browsers
    // send on the user's behalf. Analytics stays off when it is present.
    if (nav.globalPrivacyControl === true) return true;
    return false;
  } catch {
    return false;
  }
}

export function isConsentStale(now = Date.now()) {
  const record = readConsent();
  if (!record) return true;
  // Staleness is measured from the last change, not the first decision: a
  // visitor who re-confirms a choice should not be asked again immediately.
  return now - record.updatedAt > CONSENT_MAX_AGE_MS;
}

function consentListeners() {
  if (typeof window === "undefined") return null;
  if (!window.__corezConsentListeners) {
    window.__corezConsentListeners = new Set();
  }
  return window.__corezConsentListeners;
}

export function subscribeConsent(listener) {
  const listeners = consentListeners();
  if (!listeners || typeof listener !== "function") return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitConsentChanged(record) {
  const listeners = consentListeners();
  if (listeners) {
    for (const listener of [...listeners]) {
      try {
        listener(record);
      } catch {
        /* A broken listener must not break the consent write. */
      }
    }
  }
  try {
    if (typeof window !== "undefined" && typeof window.CustomEvent === "function") {
      window.dispatchEvent(
        new window.CustomEvent(CONSENT_CHANGED_EVENT, { detail: record }),
      );
    }
  } catch {
    /* ignore */
  }
}

/** Open the cookie preferences dialog from anywhere in the UI. */
export function openConsentPreferences() {
  try {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event(OPEN_CONSENT_SETTINGS_EVENT));
  } catch {
    /* ignore */
  }
}

export function onOpenConsentPreferences(listener) {
  if (typeof window === "undefined" || typeof listener !== "function") return () => {};
  window.addEventListener(OPEN_CONSENT_SETTINGS_EVENT, listener);
  return () => window.removeEventListener(OPEN_CONSENT_SETTINGS_EVENT, listener);
}
