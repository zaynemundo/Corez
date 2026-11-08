// User-designed CoreZ themes: the AI designs a palette (optionally with
// desktop + mobile background images), the user picks one of two options in the
// chat message, and the saved theme is applied by the client as CSS variables.
//
// Storage: D1 (user_themes + theme_proposals) and R2 (background images under
// the owner's asset prefix). Images are charged to the existing image budget and
// deleted whenever the theme/proposal that owned them is gone.
import { randomId, sessionUid } from "./auth.js";
import { runProviderChain } from "./providerChain.js";
import { getActiveSubscription } from "./subscriptions.js";
import {
  UsageUnavailableError,
  consumeAllowance,
  normalizePlan,
} from "./usage.js";
import {
  createRateLimiter,
  jsonResponse,
  readBoundedJson,
  safeErrorDetail,
} from "./utils.js";
import {
  generateWorkersAIImageBytes,
  saveToR2IfAvailable,
} from "./imageRoutes.js";
import { userAssetKey } from "./storageKeys.js";
import { THEMES_SCHEMA } from "./dbSchema.js";
import {
  MAX_CUSTOM_THEMES,
  THEME_PROPOSAL_TTL_MS,
  ThemeSpecError,
  buildThemeDesign,
  normalizeThemeSpec,
  relativeLuminance,
  stripControlCharacters,
} from "../packages/corez-shared/src/theme/palette.js";

// Designing a theme spends a text model call and two image generations, so the
// endpoint is bounded per client and per account-day on top of the image budget.
const themeRateLimiter = createRateLimiter({ windowMs: 60_000, limit: 5 });
const PROPOSALS_PER_DAY = 12;
const THEME_IMAGE_MODEL = "@cf/black-forest-labs/flux-2-klein-4b";
const BACKGROUND_SIZE = {
  desktop: { width: 1536, height: 864, label: "16:9 desktop wallpaper" },
  mobile: { width: 864, height: 1536, label: "9:16 phone wallpaper" },
};
const RETIRED_PROPOSAL_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const readyDatabases = new WeakMap();

/** Create the theme tables once per database handle (same pattern as memory). */
export async function ensureThemeTables(env) {
  if (!env?.DB) return false;
  const cached = readyDatabases.get(env.DB);
  if (cached) return cached;
  const ready = (async () => {
    // Table and index text lives in worker/dbSchema.js (THEMES_SCHEMA).
    for (const sql of THEMES_SCHEMA.tables) {
      await env.DB.prepare(sql).run();
    }
    for (const sql of THEMES_SCHEMA.indexes) {
      await env.DB.prepare(sql).run();
    }
    return true;
  })();
  readyDatabases.set(env.DB, ready);
  try {
    return await ready;
  } catch (error) {
    readyDatabases.delete(env.DB);
    throw error;
  }
}

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function assetUrl(key) {
  return key ? `/api/assets/${key}` : null;
}

function imageKeysFromValue(value) {
  const parsed = typeof value === "string" ? safeJsonParse(value, null) : value;
  if (!parsed || typeof parsed !== "object") return null;
  const desktop = typeof parsed.desktop === "string" ? parsed.desktop : null;
  const mobile = typeof parsed.mobile === "string" ? parsed.mobile : null;
  return desktop && mobile ? { desktop, mobile } : null;
}

function themeJsonFromRow(row) {
  if (!row) return null;
  const palette = safeJsonParse(row.palette, {});
  const tokens = safeJsonParse(row.tokens, null);
  // A row whose JSON was corrupted is treated as missing rather than shipped to
  // the client as a half-applied theme.
  if (!palette?.background || !tokens?.solid?.["--bg-primary"]) return null;
  const keys = imageKeysFromValue(row.image_keys);
  return {
    id: String(row.id || ""),
    name: String(row.name || "Custom theme"),
    tone: row.tone === "light" ? "light" : "dark",
    palette,
    tokens,
    images: keys
      ? { desktop: assetUrl(keys.desktop), mobile: assetUrl(keys.mobile) }
      : null,
    proposalId: row.proposal_id || null,
    createdAt: Number(row.created_at) || 0,
  };
}

function proposalJsonFromRow(row, { slots, max }) {
  const palette = safeJsonParse(row.palette, {});
  const prompts = safeJsonParse(row.image_prompts, {});
  const keys = imageKeysFromValue(row.image_keys);
  return {
    v: 1,
    proposalId: String(row.id || ""),
    name: String(row.name || "Custom theme"),
    palette,
    images: keys
      ? { desktop: assetUrl(keys.desktop), mobile: assetUrl(keys.mobile) }
      : null,
    imagePrompts: {
      desktop: String(prompts.desktop || ""),
      mobile: String(prompts.mobile || ""),
    },
    options: {
      palette: true,
      backgrounds: Boolean(keys),
      ...(keys || !row.backgrounds_reason
        ? {}
        : { backgroundsReason: String(row.backgrounds_reason) }),
    },
    slots: { used: Number(slots) || 0, max: Number(max) || MAX_CUSTOM_THEMES },
    expiresAt: Number(row.expires_at) || 0,
  };
}

function errorResponse(status, error, code) {
  return jsonResponse(status, { error, ...(code ? { code } : {}) });
}

function imageFailureReason(reason) {
  return reason || "generation_failed";
}

async function themeCount(env, uid) {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM user_themes WHERE user_id = ?",
  )
    .bind(uid)
    .first();
  return Number(row?.count) || 0;
}

async function proposalCountSince(env, uid, since) {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM theme_proposals WHERE user_id = ? AND created_at >= ?",
  )
    .bind(uid, since)
    .first();
  return Number(row?.count) || 0;
}

async function deleteImageKeys(env, uid, keys) {
  if (!env?.ASSET_BUCKET || !keys) return;
  for (const key of [keys.desktop, keys.mobile]) {
    if (!key) continue;
    const namespaced = userAssetKey(uid, key);
    await env.ASSET_BUCKET.delete(namespaced).catch(() => {});
    // Older/manual uploads used the flat key; remove that too so a deleted
    // theme never leaves an accessible copy behind.
    if (namespaced !== key) {
      await env.ASSET_BUCKET.delete(key).catch(() => {});
    }
  }
}

/** Remove every still-pending proposal for the account (images included). */
async function discardPendingProposals(env, uid) {
  const rows = await env.DB.prepare(
    "SELECT id, image_keys FROM theme_proposals WHERE user_id = ? AND status = 'pending'",
  )
    .bind(uid)
    .all();
  for (const row of rows?.results || []) {
    await deleteImageKeys(env, uid, imageKeysFromValue(row.image_keys));
    await env.DB.prepare(
      "UPDATE theme_proposals SET status = 'discarded', image_keys = NULL WHERE id = ? AND user_id = ?",
    )
      .bind(row.id, uid)
      .run();
  }
}

function buildThemeSystemPrompt() {
  return [
    "You are the CoreZ theme designer. Design a readable colour theme for a chat application from the user's mood description.",
    "Return ONLY valid JSON, no markdown fences, no commentary, in exactly this shape:",
    '{"name":"short theme name","palette":{"background":"#rrggbb","surface":"#rrggbb","text":"#rrggbb","muted":"#rrggbb","border":"#rrggbb"},"imagePrompts":{"desktop":"...","mobile":"..."}}',
    "Rules:",
    "- name: 2-40 characters, plain words, no quotes/markdown.",
    "- All five colours must be strict #rrggbb hex.",
    "- background and surface are the app surfaces; text must be clearly readable on them (aim for 7:1 contrast); muted is a quieter readable text tone; border separates surfaces.",
    "- The palette may carry the mood's hue (for a red Porsche theme, deep red-tinted surfaces) but stay restful behind chat text.",
    "- imagePrompts.desktop: a 16:9 artistic wallpaper description for a desktop app background, no text, no words, no logos, no UI.",
    "- imagePrompts.mobile: the same mood composed for a 9:16 phone wallpaper, no text, no words, no logos, no UI.",
    "- Keep prompts under 220 characters each and do not include URLs.",
  ].join("\n");
}

function extractJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function designTheme(env, prompt, signal) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const userMessage =
      attempt === 0
        ? prompt
        : `${prompt}\n\nYour previous reply was rejected (${lastError || "invalid JSON"}). Reply with the JSON object only.`;
    const result = await runProviderChainSafe(env, [
      { role: "system", content: buildThemeSystemPrompt() },
      { role: "user", content: userMessage },
    ], signal);
    if (!result?.content) {
      lastError = "the design model returned no answer";
      continue;
    }
    const rawSpec = extractJsonObject(result.content);
    if (!rawSpec) {
      lastError = "the reply was not valid JSON";
      continue;
    }
    try {
      const spec = normalizeThemeSpec(rawSpec);
      const design = buildThemeDesign(spec.palette);
      return { spec, design };
    } catch (error) {
      if (error instanceof ThemeSpecError) {
        lastError = error.code;
        continue;
      }
      throw error;
    }
  }
  return null;
}

/** Local wrapper so a provider failure never takes the whole route down. */
async function runProviderChainSafe(env, messages, signal) {
  try {
    return await runProviderChain(messages, { env, signal });
  } catch (error) {
    console.warn("Theme design model failed:", safeErrorDetail(error));
    return null;
  }
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function backgroundPrompt(variant, description) {
  return `Full-bleed CoreZ app background wallpaper, ${description}. ${BACKGROUND_SIZE[variant].label}. No text, no words, no logos, no user interface. Photographic or painterly, subtle enough to sit behind a chat interface.`;
}

/** Charge the two image generations atomically before spending provider time. */
async function chargeBackgroundImages(env, uid) {
  if (!env?.DB) return { ok: false, reason: "usage_unavailable" };
  try {
    const sub = await getActiveSubscription(env, uid).catch(() => null);
    const plan = normalizePlan(
      sub?.status === "expired" || sub?.isExpired ? "free" : sub?.plan || "free",
    );
    const admission = await consumeAllowance(env, uid, {
      plan,
      charges: [{ metric: "images", amount: 2 }],
    });
    if (admission?.ok) return { ok: true };
    return {
      ok: false,
      reason: admission?.reason === "limit" ? "image_budget" : "usage_unavailable",
    };
  } catch (error) {
    if (error instanceof UsageUnavailableError) {
      return { ok: false, reason: "usage_unavailable" };
    }
    console.warn("Theme image budget check failed:", safeErrorDetail(error));
    return { ok: false, reason: "usage_unavailable" };
  }
}

async function generateBackgroundImages(env, uid, proposalId, prompts, signal) {
  const variants = ["desktop", "mobile"];
  const settled = await Promise.allSettled(
    variants.map(async (variant) => {
      const size = BACKGROUND_SIZE[variant];
      const generated = await generateWorkersAIImageBytes(env, {
        prompt: backgroundPrompt(variant, prompts[variant]),
        width: size.width,
        height: size.height,
        model: THEME_IMAGE_MODEL,
        signal,
      });
      const key = `theme_${proposalId}_${variant}.${generated.extension}`;
      const bytes = base64ToBytes(generated.base64);
      const url = await saveToR2IfAvailable(
        env,
        key,
        bytes.buffer,
        generated.mimeType,
        uid,
      );
      if (!url) throw new Error("R2 storage is unavailable.");
      return { variant, key, url };
    }),
  );

  const saved = settled
    .filter((entry) => entry.status === "fulfilled")
    .map((entry) => entry.value);
  if (saved.length !== variants.length) {
    const failures = settled
      .filter((entry) => entry.status === "rejected")
      .map((entry) => safeErrorDetail(entry.reason))
      .filter(Boolean);
    console.warn("Theme background generation failed:", failures.join(" | "));
    await Promise.all(
      saved.map((entry) =>
        deleteImageKeys(env, uid, {
          desktop: entry.variant === "desktop" ? entry.key : null,
          mobile: entry.variant === "mobile" ? entry.key : null,
        }),
      ),
    );
    return { images: null, keys: null, reason: "generation_failed" };
  }

  const byVariant = Object.fromEntries(saved.map((entry) => [entry.variant, entry]));
  return {
    images: {
      desktop: byVariant.desktop.url,
      mobile: byVariant.mobile.url,
    },
    keys: {
      desktop: byVariant.desktop.key,
      mobile: byVariant.mobile.key,
    },
    reason: null,
  };
}

async function listThemes(env, uid) {
  const rows = await env.DB.prepare(
    "SELECT * FROM user_themes WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
  )
    .bind(uid, MAX_CUSTOM_THEMES)
    .all();
  return {
    themes: (rows?.results || []).map(themeJsonFromRow).filter(Boolean),
    max: MAX_CUSTOM_THEMES,
  };
}

async function handlePropose(request, env, uid) {
  const retryAfter = themeRateLimiter(request);
  if (retryAfter !== null) {
    return jsonResponse(
      429,
      { error: "Too many theme requests. Try again shortly.", code: "rate_limited" },
      { "Retry-After": String(retryAfter) },
    );
  }
  let body;
  try {
    body = await readBoundedJson(request);
  } catch (error) {
    return errorResponse(400, `Request body rejected: ${error?.message || "invalid JSON"}`, "invalid_request");
  }
  const prompt = stripControlCharacters(body?.prompt || "").trim();
  if (prompt.length < 3) {
    return errorResponse(
      400,
      "Describe the theme you want, e.g. @theme a red Porsche racing theme.",
      "invalid_prompt",
    );
  }
  if (prompt.length > 280) {
    return errorResponse(400, "Keep the theme description under 280 characters.", "invalid_prompt");
  }

  const slotsUsed = await themeCount(env, uid);
  if (slotsUsed >= MAX_CUSTOM_THEMES) {
    return errorResponse(
      409,
      `You already have ${MAX_CUSTOM_THEMES} custom themes. Delete one in Settings → Appearance, then try again.`,
      "theme_limit",
    );
  }
  const now = Date.now();
  const recent = await proposalCountSince(env, uid, now - 24 * 60 * 60 * 1000);
  if (recent >= PROPOSALS_PER_DAY) {
    return errorResponse(
      429,
      "That is a lot of theme ideas for one day. Try again tomorrow.",
      "proposal_limit",
    );
  }

  const designed = await designTheme(env, prompt, request.signal);
  if (!designed) {
    return errorResponse(
      502,
      "The theme designer could not turn that into a readable palette. Try describing the colours or mood a little differently.",
      "theme_design_failed",
    );
  }
  const { spec, design } = designed;

  // A new proposal replaces the previous waiting one for this account.
  await discardPendingProposals(env, uid);

  const proposalId = `thm_${randomId().replace(/-/g, "")}`;
  const budget = await chargeBackgroundImages(env, uid);
  let backgrounds = { images: null, keys: null, reason: budget.ok ? "generation_failed" : budget.reason };
  if (budget.ok) {
    backgrounds = await generateBackgroundImages(
      env,
      uid,
      proposalId,
      spec.imagePrompts,
      request.signal,
    );
  }
  const expiresAt = now + THEME_PROPOSAL_TTL_MS;
  const tokens = {
    solid: design.solid,
    image: design.image,
    scrim: design.scrim,
  };
  await env.DB.prepare(
    `INSERT INTO theme_proposals
       (id, user_id, name, palette, tokens, image_prompts, image_keys, backgrounds_reason, status, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
  )
    .bind(
      proposalId,
      uid,
      spec.name,
      JSON.stringify(spec.palette),
      JSON.stringify(tokens),
      JSON.stringify(spec.imagePrompts),
      backgrounds.keys ? JSON.stringify(backgrounds.keys) : null,
      backgrounds.reason ? imageFailureReason(backgrounds.reason) : null,
      now,
      expiresAt,
    )
    .run();

  const row = await env.DB.prepare(
    "SELECT * FROM theme_proposals WHERE id = ? AND user_id = ?",
  )
    .bind(proposalId, uid)
    .first();
  return jsonResponse(200, {
    proposal: proposalJsonFromRow(row, {
      slots: slotsUsed,
      max: MAX_CUSTOM_THEMES,
    }),
  });
}

async function handleApply(request, env, uid) {
  let body;
  try {
    body = await readBoundedJson(request);
  } catch (error) {
    return errorResponse(400, `Request body rejected: ${error?.message || "invalid JSON"}`, "invalid_request");
  }
  const proposalId = String(body?.proposalId || "").trim();
  const option = String(body?.option || "").trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(proposalId)) {
    return errorResponse(400, "A theme proposal id is required.", "invalid_proposal");
  }
  if (option !== "palette" && option !== "backgrounds") {
    return errorResponse(400, "Choose either the colors or the colors with backgrounds.", "invalid_option");
  }

  const row = await env.DB.prepare(
    "SELECT * FROM theme_proposals WHERE id = ? AND user_id = ?",
  )
    .bind(proposalId, uid)
    .first();
  if (!row) {
    return errorResponse(410, "That theme proposal has expired. Run @theme again.", "proposal_expired");
  }

  // Already applied: return the saved theme so a double click / reload is safe.
  if (row.status === "applied") {
    const existing = await env.DB.prepare(
      "SELECT * FROM user_themes WHERE proposal_id = ? AND user_id = ?",
    )
      .bind(proposalId, uid)
      .first();
    if (existing) return jsonResponse(200, { theme: themeJsonFromRow(existing) });
    return errorResponse(409, "That theme proposal was already used.", "proposal_used");
  }
  if (row.status !== "pending") {
    return errorResponse(409, "That theme proposal is no longer active. Run @theme again.", "proposal_used");
  }
  if (Number(row.expires_at) <= Date.now()) {
    await deleteImageKeys(env, uid, imageKeysFromValue(row.image_keys));
    await env.DB.prepare(
      "UPDATE theme_proposals SET status = 'expired', image_keys = NULL WHERE id = ? AND user_id = ?",
    )
      .bind(proposalId, uid)
      .run();
    return errorResponse(410, "That theme proposal has expired. Run @theme again.", "proposal_expired");
  }

  const proposalKeys = imageKeysFromValue(row.image_keys);
  if (option === "backgrounds" && !proposalKeys) {
    return errorResponse(
      409,
      "The background images for that proposal are not available. Choose the colors instead or run @theme again.",
      "backgrounds_unavailable",
    );
  }

  // Conditional insert makes the two-theme cap atomic against two concurrent
  // applies in different tabs.
  const themeId = `thm_${randomId().replace(/-/g, "")}`;
  const palette = row.palette;
  const tokens = row.tokens;
  const name = row.name;
  const imageKeys =
    option === "backgrounds" && proposalKeys ? JSON.stringify(proposalKeys) : null;
  const now = Date.now();
  const insertResult = await env.DB.prepare(
    `INSERT INTO user_themes
       (id, user_id, name, tone, palette, tokens, image_keys, proposal_id, created_at, updated_at)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
     WHERE (SELECT COUNT(*) FROM user_themes WHERE user_id = ?) < ?`,
  )
    .bind(
      themeId,
      uid,
      name,
      detectToneFromTokens(tokens),
      palette,
      tokens,
      imageKeys,
      proposalId,
      now,
      now,
      uid,
      MAX_CUSTOM_THEMES,
    )
    .run();
  if (!insertResult?.meta?.changes) {
    return errorResponse(
      409,
      `You already have ${MAX_CUSTOM_THEMES} custom themes. Delete one in Settings → Appearance, then try again.`,
      "theme_limit",
    );
  }

  await env.DB.prepare(
    "UPDATE theme_proposals SET status = 'applied', theme_id = ? WHERE id = ? AND user_id = ? AND status = 'pending'",
  )
    .bind(themeId, proposalId, uid)
    .run();

  // Option 1 keeps only the palette, so the preview images are deleted at once
  // (the user chose not to keep them). Option 2 keeps them as theme assets.
  if (option === "palette") {
    await deleteImageKeys(env, uid, proposalKeys);
    await env.DB.prepare(
      "UPDATE theme_proposals SET image_keys = NULL WHERE id = ? AND user_id = ?",
    )
      .bind(proposalId, uid)
      .run();
  }

  const themeRow = await env.DB.prepare(
    "SELECT * FROM user_themes WHERE id = ? AND user_id = ?",
  )
    .bind(themeId, uid)
    .first();
  return jsonResponse(200, { theme: themeJsonFromRow(themeRow) });
}

function detectToneFromTokens(tokensJson) {
  const parsed = safeJsonParse(tokensJson, null);
  const background = parsed?.solid?.["--bg-primary"];
  if (!background) return "dark";
  return relativeLuminance(background) < 0.4 ? "dark" : "light";
}

async function handleDiscard(request, env, uid, proposalId) {
  const row = await env.DB.prepare(
    "SELECT * FROM theme_proposals WHERE id = ? AND user_id = ?",
  )
    .bind(proposalId, uid)
    .first();
  if (!row) return jsonResponse(200, { success: true });
  if (row.status === "pending") {
    await deleteImageKeys(env, uid, imageKeysFromValue(row.image_keys));
    await env.DB.prepare(
      "UPDATE theme_proposals SET status = 'discarded', image_keys = NULL WHERE id = ? AND user_id = ?",
    )
      .bind(proposalId, uid)
      .run();
  }
  return jsonResponse(200, { success: true });
}

async function handleDeleteTheme(request, env, uid, themeId) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(themeId)) {
    return errorResponse(400, "Invalid theme id.", "invalid_theme");
  }
  const row = await env.DB.prepare(
    "SELECT * FROM user_themes WHERE id = ? AND user_id = ?",
  )
    .bind(themeId, uid)
    .first();
  if (!row) {
    return errorResponse(404, "That theme no longer exists.", "theme_not_found");
  }
  await deleteImageKeys(env, uid, imageKeysFromValue(row.image_keys));
  await env.DB.prepare("DELETE FROM user_themes WHERE id = ? AND user_id = ?")
    .bind(themeId, uid)
    .run();
  return jsonResponse(200, { success: true });
}

/**
 * Sweep expired theme proposals and their leftover images. Runs on the cron and
 * opportunistically before a new proposal; safe to call with no DB.
 */
export async function pruneThemeProposals(env, now = Date.now()) {
  if (!env?.DB) return 0;
  await ensureThemeTables(env);
  let removed = 0;
  const expired = await env.DB.prepare(
    "SELECT id, user_id, image_keys FROM theme_proposals WHERE status = 'pending' AND expires_at <= ? LIMIT 25",
  )
    .bind(now)
    .all();
  for (const row of expired?.results || []) {
    await deleteImageKeys(env, row.user_id, imageKeysFromValue(row.image_keys));
    await env.DB.prepare(
      "UPDATE theme_proposals SET status = 'expired', image_keys = NULL WHERE id = ? AND user_id = ?",
    )
      .bind(row.id, row.user_id)
      .run();
    removed += 1;
  }
  // Applied/discarded rows are only bookkeeping; their images are owned by the
  // theme (or were deleted) and the chat card matches on the theme's proposal id.
  await env.DB.prepare(
    "DELETE FROM theme_proposals WHERE status != 'pending' AND created_at < ?",
  )
    .bind(now - RETIRED_PROPOSAL_AGE_MS)
    .run()
    .catch(() => {});
  return removed;
}

/**
 * Routes: /api/themes (GET), /api/themes/propose, /api/themes/apply,
 * /api/themes/proposals/:id/discard, /api/themes/:id (DELETE).
 */
export async function handleThemes(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  if (pathname !== "/api/themes" && !pathname.startsWith("/api/themes/")) {
    return null;
  }
  if (!env?.DB) {
    return errorResponse(503, "Theme storage is unavailable on this deployment.", "storage_unavailable");
  }
  try {
    await ensureThemeTables(env);
  } catch (error) {
    console.warn("Theme schema bootstrap failed:", safeErrorDetail(error));
    return errorResponse(503, "Theme storage is unavailable on this deployment.", "storage_unavailable");
  }

  const uid = await sessionUid(request, env);
  if (!uid) {
    return errorResponse(401, "Authentication required. Please log in.", "unauthorized");
  }

  try {
    if (pathname === "/api/themes" && request.method === "GET") {
      return jsonResponse(200, await listThemes(env, uid));
    }
    if (pathname === "/api/themes/propose" && request.method === "POST") {
      return await handlePropose(request, env, uid);
    }
    if (pathname === "/api/themes/apply" && request.method === "POST") {
      return await handleApply(request, env, uid);
    }
    const discardMatch = /^\/api\/themes\/proposals\/([A-Za-z0-9_-]{1,80})\/discard$/.exec(pathname);
    if (discardMatch && request.method === "POST") {
      return await handleDiscard(request, env, uid, discardMatch[1]);
    }
    const deleteMatch = /^\/api\/themes\/([A-Za-z0-9_-]{1,80})$/.exec(pathname);
    if (deleteMatch && request.method === "DELETE") {
      return await handleDeleteTheme(request, env, uid, deleteMatch[1]);
    }
    return errorResponse(404, "Theme route not found.", "not_found");
  } catch (error) {
    console.warn("Theme request failed:", safeErrorDetail(error));
    return errorResponse(500, "The theme request failed. Please try again.", "theme_failed");
  }
}
