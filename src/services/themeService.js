// Client for the custom-theme API.
//
// The Worker owns palette design and validation; the client only transports the
// proposal/theme shapes described in the shared contract and refuses anything
// that does not validate, so a malformed response can never be written into CSS
// variables or persisted in local storage.
//
// Read-only helpers (fetchThemes, proposeTheme) never throw: callers render the
// signed-out/default interface instead of an error boundary. Mutating helpers
// used by the explicit Save/Delete actions reject with a ThemeApiError carrying
// the HTTP status and server `code`, which the chat card and Settings surface.

const THEMES_ENDPOINT = "/api/themes";

/** Server cap is authoritative; this is only the fallback when it is missing. */
export const DEFAULT_MAX_CUSTOM_THEMES = 2;

const PALETTE_KEYS = ["background", "surface", "text", "muted", "border"];
const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * A failed theme operation. `status` is the HTTP status (0 for a network or
 * invalid-response failure) and `code` is the server code when it sent one
 * ("theme_limit", "proposal_expired", "backgrounds_unavailable", ...).
 */
export class ThemeApiError extends Error {
  constructor(message, { status = 0, code = "" } = {}) {
    super(message);
    this.name = "ThemeApiError";
    this.status = status;
    this.code = code;
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readJson(response) {
  if (!response || typeof response.json !== "function") return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function apiErrorMessage(data, fallback) {
  if (data && typeof data.error === "string" && data.error.trim()) {
    return data.error.trim();
  }
  return fallback;
}

/** Only same-origin paths or https/data-image URLs may become CSS backgrounds. */
function safeImageUrl(value) {
  const url = typeof value === "string" ? value.trim() : "";
  if (!url) return null;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  if (url.startsWith("https://")) return url;
  if (url.startsWith("data:image/")) return url;
  return null;
}

function normalizeImages(value) {
  if (!isObject(value)) return null;
  const desktop = safeImageUrl(value.desktop);
  const mobile = safeImageUrl(value.mobile) || desktop;
  if (!desktop) return null;
  return { desktop, mobile };
}

function normalizeTokenMap(value) {
  if (!isObject(value)) return null;
  const tokens = {};
  for (const [name, raw] of Object.entries(value)) {
    if (!name.startsWith("--")) continue;
    if (typeof raw !== "string") continue;
    const token = raw.trim();
    // Token values are colours/rgba strings from the palette engine. Rejecting
    // braces/semicolons keeps a tampered cache from smuggling extra declarations.
    if (!token || token.length > 200 || /[{};\n\r]/.test(token)) continue;
    tokens[name] = token;
  }
  return Object.keys(tokens).length > 0 ? tokens : null;
}

/**
 * Validate a Theme object from GET /api/themes, POST /api/themes/apply or the
 * local paint cache. Returns null when the shape is not safe to apply.
 */
export function normalizeTheme(raw) {
  if (!isObject(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const tone = raw.tone === "light" ? "light" : raw.tone === "dark" ? "dark" : null;
  if (!id || !name || !tone) return null;

  const palette = isObject(raw.palette) ? raw.palette : null;
  const tokens = isObject(raw.tokens) ? raw.tokens : null;
  if (!palette || !tokens) return null;
  const solid = normalizeTokenMap(tokens.solid);
  if (!solid) return null;

  const normalizedPalette = {};
  for (const key of PALETTE_KEYS) {
    const value = typeof palette[key] === "string" ? palette[key].trim() : "";
    if (!HEX_COLOR.test(value)) return null;
    normalizedPalette[key] = value.toLowerCase();
  }

  const image = normalizeTokenMap(tokens.image) || {};
  const scrim =
    typeof tokens.scrim === "string" && tokens.scrim.trim()
      ? tokens.scrim.trim()
      : image["--theme-scrim"] || "";

  return {
    id,
    name,
    tone,
    palette: normalizedPalette,
    tokens: { solid, image, scrim },
    images: normalizeImages(raw.images),
    proposalId: typeof raw.proposalId === "string" ? raw.proposalId : null,
    createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : 0,
  };
}

function failedResponse(response, data, fallback, extra = {}) {
  return {
    ok: false,
    status: response ? response.status : 0,
    code: typeof data?.code === "string" ? data.code : "",
    message: apiErrorMessage(data, fallback),
    ...extra,
  };
}

/**
 * GET /api/themes -> { themes, max }. Never throws. A 401/404/network failure is
 * reported as ok:false so the provider keeps painting light/dark and retries
 * after the next sign-in.
 */
export async function fetchThemes() {
  const empty = { themes: [], max: DEFAULT_MAX_CUSTOM_THEMES };
  let response;
  try {
    response = await fetch(THEMES_ENDPOINT, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    return {
      ok: false,
      status: 0,
      code: "network_error",
      message: error?.message || "Themes could not be loaded.",
      ...empty,
    };
  }
  const data = await readJson(response);
  if (!response.ok) {
    return failedResponse(
      response,
      data,
      `Themes could not be loaded (${response.status}).`,
      empty,
    );
  }
  const themes = Array.isArray(data?.themes)
    ? data.themes.map(normalizeTheme).filter(Boolean)
    : [];
  const max =
    Number.isInteger(data?.max) && data.max > 0
      ? data.max
      : DEFAULT_MAX_CUSTOM_THEMES;
  return { ok: true, status: response.status, code: "", message: "", themes, max };
}

/**
 * POST /api/themes/propose. The @theme chat pipeline owns the conversation UX;
 * this thin transport exists so there is one definition of the endpoint shape.
 */
export async function proposeTheme(prompt) {
  const text = typeof prompt === "string" ? prompt.trim() : "";
  if (!text) {
    return { ok: false, status: 0, code: "empty_prompt", message: "Describe the theme you want.", proposal: null };
  }
  let response;
  try {
    response = await fetch(`${THEMES_ENDPOINT}/propose`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ prompt: text }),
    });
  } catch (error) {
    return { ok: false, status: 0, code: "network_error", message: error?.message || "The theme could not be designed.", proposal: null };
  }
  const data = await readJson(response);
  if (!response.ok || !isObject(data?.proposal)) {
    return failedResponse(response, data, `The theme could not be designed (${response.status}).`, { proposal: null });
  }
  return { ok: true, status: response.status, code: "", message: "", proposal: data.proposal };
}

/**
 * POST /api/themes/apply -> { theme }. Resolves with the validated Theme;
 * rejects with ThemeApiError (status/code preserved) on every failure. Applying
 * the same proposal twice is idempotent on the server and yields the same theme.
 */
export async function applyThemeProposal(proposalId, option) {
  const id = typeof proposalId === "string" ? proposalId.trim() : "";
  if (!id) {
    throw new ThemeApiError("This theme proposal has no id.", { code: "invalid_proposal" });
  }
  if (option !== "palette" && option !== "backgrounds") {
    throw new ThemeApiError("Unknown theme option.", { code: "invalid_option" });
  }
  let response;
  try {
    response = await fetch(`${THEMES_ENDPOINT}/apply`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ proposalId: id, option }),
    });
  } catch (error) {
    throw new ThemeApiError(error?.message || "The theme could not be saved.", {
      status: 0,
      code: "network_error",
    });
  }
  const data = await readJson(response);
  const theme = normalizeTheme(data?.theme);
  if (!response.ok || !theme) {
    throw new ThemeApiError(
      apiErrorMessage(data, `The theme could not be saved (${response.status}).`),
      {
        status: response.status,
        code: typeof data?.code === "string" ? data.code : "theme_apply_failed",
      },
    );
  }
  return theme;
}

/** POST /api/themes/proposals/:id/discard. Resolves true on success; never throws. */
export async function discardThemeProposal(proposalId) {
  const id = typeof proposalId === "string" ? proposalId.trim() : "";
  if (!id) return false;
  try {
    const response = await fetch(
      `${THEMES_ENDPOINT}/proposals/${encodeURIComponent(id)}/discard`,
      { method: "POST", credentials: "include", headers: { Accept: "application/json" } },
    );
    return Boolean(response?.ok);
  } catch {
    return false;
  }
}

/** DELETE /api/themes/:id. Resolves true when the theme is gone (404 included). */
export async function deleteStoredTheme(id) {
  const clean = typeof id === "string" ? id.trim() : "";
  if (!clean) return false;
  try {
    const response = await fetch(`${THEMES_ENDPOINT}/${encodeURIComponent(clean)}`, {
      method: "DELETE",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    return Boolean(response?.ok) || response?.status === 404;
  } catch {
    return false;
  }
}
