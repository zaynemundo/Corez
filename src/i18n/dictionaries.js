// Dictionary registry. Each area file is a flat key → string map, addressed
// from `t()` with the area as the first segment (`t("chat.composer.sendMessage")`). Keeping the
// areas in separate files means a translation pass touches one small file per
// screen instead of one enormous dictionary.
import enCommon from "./en/common.js";
import enChat from "./en/chat.js";
import enCanvas from "./en/canvas.js";
import enSettings from "./en/settings.js";
import enAuth from "./en/auth.js";
import enPricing from "./en/pricing.js";
import enConsent from "./en/consent.js";
import enLegal from "./en/legal.js";

import arCommon from "./ar/common.js";
import arChat from "./ar/chat.js";
import arCanvas from "./ar/canvas.js";
import arSettings from "./ar/settings.js";
import arAuth from "./ar/auth.js";
import arPricing from "./ar/pricing.js";
import arConsent from "./ar/consent.js";
import arLegal from "./ar/legal.js";

export const DICTIONARIES = {
  en: {
    common: enCommon,
    chat: enChat,
    canvas: enCanvas,
    settings: enSettings,
    auth: enAuth,
    pricing: enPricing,
    consent: enConsent,
    legal: enLegal,
  },
  ar: {
    common: arCommon,
    chat: arChat,
    canvas: arCanvas,
    settings: arSettings,
    auth: arAuth,
    pricing: arPricing,
    consent: arConsent,
    legal: arLegal,
  },
};

// Areas every language must cover; used by the parity test and by the missing
// key warning below.
export const DICTIONARY_AREAS = Object.keys(DICTIONARIES.en);

/**
 * Resolve a dotted key inside one language's dictionaries. Grouping objects are
 * allowed inside an area file (`{ sidebar: { newChat: "New Chat" } }` resolves
 * as `common.sidebar.newChat`), which keeps large screens readable without a
 * flat wall of keys. Returns undefined when the key is unknown so callers can
 * fall back to English.
 */
export function lookup(language, key) {
  const areas = DICTIONARIES[language];
  if (!areas || typeof key !== "string") return undefined;
  const segments = key.split(".");
  if (segments.length < 2) return undefined;
  let node = areas[segments[0]];
  if (!node) return undefined;
  for (const segment of segments.slice(1)) {
    if (!node || typeof node !== "object") return undefined;
    node = node[segment];
  }
  return typeof node === "string" ? node : undefined;
}

/**
 * Flatten one area file into dotted keys (`{ sidebar: { newChat } }` →
 * `{ "sidebar.newChat": ... }`). Used by the dictionary integrity tests so a
 * translation gap is reported by its full key path.
 */
export function flattenDictionary(dictionary, prefix = "") {
  const flat = {};
  for (const [key, value] of Object.entries(dictionary || {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") flat[path] = value;
    else if (value && typeof value === "object") {
      Object.assign(flat, flattenDictionary(value, path));
    }
  }
  return flat;
}

/**
 * Interpolate {placeholders} in a translated string. Values are inserted
 * verbatim — never re-parsed as markup.
 */
export function interpolate(template, vars) {
  if (!vars || typeof template !== "string") return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

/**
 * Translate a key for one language: active language first, then English, then
 * the key itself (a visible, greppable failure instead of an empty label).
 */
export function translate(language, key, vars) {
  const value = lookup(language, key) ?? lookup("en", key);
  if (value === undefined) {
    warnOnce(`missing key ${key}`);
    return key;
  }
  if (language !== "en" && lookup(language, key) === undefined) {
    warnOnce(`${language} is missing ${key} (falling back to English)`);
  }
  return interpolate(value, vars);
}

// A missing translation is a bug in the dictionaries, not a runtime condition,
// so it is reported once per key in development and never in production.
const warned = new Set();

function warnOnce(message) {
  if (process.env.NODE_ENV === "production") return;
  if (warned.has(message)) return;
  warned.add(message);
  if (typeof console !== "undefined" && console.warn) {
    console.warn(`[i18n] ${message}`);
  }
}

// Ambient language for the few strings produced outside the React tree (build
// phase announcements in src/utils/buildPhaseLabel.js). The provider keeps it in
// sync with the language it renders; it defaults to English so utilities used in
// tests and in the worker keep their existing behaviour.
let currentLanguage = "en";

export function setCurrentLanguage(language) {
  if (DICTIONARIES[language]) currentLanguage = language;
}

export function getCurrentLanguage() {
  return currentLanguage;
}

export function translateCurrent(key, vars) {
  return translate(currentLanguage, key, vars);
}
