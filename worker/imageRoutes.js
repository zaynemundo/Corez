import { sessionUid } from "./auth.js";
import { getActiveSubscription } from "./subscriptions.js";
import {
  UsageUnavailableError,
  consumeAllowance,
  limitResponse,
  normalizePlan,
  usageUnavailableResponse,
} from "./usage.js";
import {
  safeErrorDetail,
  readBoundedJson,
  jsonResponse,
  createRateLimiter,
} from "./utils.js";
import { callOpenRouterImage } from "./imageProvider.js";
import { enhanceImagePrompt } from "./imagePrompt.js";
import { userAssetKey } from "./storageKeys.js";

// Paid image generations are expensive (provider cost + R2 writes): bound
// them per client like every other costly endpoint.
const imageRateLimiter = createRateLimiter({ windowMs: 60_000, limit: 30 });

// Server-side fetch guard: provider-returned image URLs may only point at
// public internet hosts. Loopback, link-local, private, CGNAT, and cloud
// metadata ranges are rejected so a malformed or injected provider reply can
// never be used to probe internal services from the Worker.
const PRIVATE_IPV4_PATTERNS = [
  /^10\./, // RFC 1918 class A
  /^127\./, // loopback
  /^169\.254\./, // link-local + cloud metadata
  /^172\.(1[6-9]|2[0-9]|3[01])\./, // RFC 1918 class B
  /^192\.168\./, // RFC 1918 class C
  /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./, // CGNAT
  /^0\./,
  /^198\.18\./, // benchmarking
  /^192\.0\.0\./,
  /^224\./, // multicast
  /^240\./, // reserved
];
const PRIVATE_IPV6_PATTERNS = [
  /^::$/,
  /^::1$/, // loopback
  /^fc/i,
  /^fd/i, // ULA
  /^fe80:/i, // link-local
  /^fe[89ab]f:/i, // IPv4-compatible
  /^ff:/i, // multicast
  /^::ffff:/,
];

export function isBlockedInternalHost(hostname) {
  const host = String(hostname || "")
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (!host) return true;
  if (host === "localhost") return true;
  if (PRIVATE_IPV4_PATTERNS.some((pattern) => pattern.test(host))) return true;
  if (PRIVATE_IPV6_PATTERNS.some((pattern) => pattern.test(host))) return true;
  // Non-numeric hostnames (e.g. intranet hostnames) are allowed: the worker
  // only fetches https URLs, and DNS rebinding is not feasible against a
  // hostname that resolves publicly. Numeric IPv4/IPv6 literals are covered
  // by the patterns above.
  return false;
}

// Reference images sent to the image model. The client ships small base64
// data: payloads (thumbnails capped at 1.5 MB client-side); https URLs are
// also accepted but must point at public hosts — the same SSRF guard used
// for provider-returned image URLs. The worker itself never fetches the
// reference; it is forwarded to the provider only.
const REFERENCE_IMAGE_MAX_DECODED_BYTES = 8 * 1024 * 1024;
const REFERENCE_DATA_URL_PATTERN =
  /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/i;

export function validateReferenceImage(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const candidate = value.trim();

  if (candidate.startsWith("data:")) {
    const match = candidate.match(REFERENCE_DATA_URL_PATTERN);
    if (!match) return null;
    // Decoded base64 size: 3 bytes per 4 base64 chars (padding excluded).
    const base64Body = match[2];
    const decodedBytes = Math.floor((base64Body.length * 3) / 4);
    if (decodedBytes > REFERENCE_IMAGE_MAX_DECODED_BYTES) return null;
    return candidate;
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (isBlockedInternalHost(parsed.hostname)) return null;
  return candidate;
}

export async function saveToR2IfAvailable(
  env,
  key,
  buffer,
  mimeType = "image/png",
  ownerId = null,
) {
  if (env.ASSET_BUCKET && typeof env.ASSET_BUCKET.put === "function") {
    try {
      // Generated images live in their owner's folder; the public URL stays
      // flat (/api/assets/<key>) and the read path resolves the folder.
      const storageKey = ownerId ? userAssetKey(ownerId, key) : key;
      await env.ASSET_BUCKET.put(storageKey, buffer, {
        httpMetadata: { contentType: mimeType },
        ...(ownerId ? { customMetadata: { ownerId } } : {}),
      });
      return `/api/assets/${key}`;
    } catch {
      // R2 is optional: the provider URL is returned when storage fails.
    }
  }
  return null;
}

/**
 * The image budget gate shared by both image routes. Charges the image budget
 * atomically before either provider runs; returns a Response when the plan is
 * out of images or the accounting store is unavailable, otherwise null.
 */
export async function meterImageRequest(request, env) {
  const uid = await sessionUid(request, env);
  const sub = await getActiveSubscription(env, uid).catch(() => null);
  const plan = normalizePlan(
    sub?.status === "expired" || sub?.isExpired ? "free" : sub?.plan || "free",
  );
  try {
    const admission = await consumeAllowance(env, uid, {
      plan,
      charges: [{ metric: "images", amount: 1 }],
    });
    if (!admission.ok && admission.reason === "limit") {
      return limitResponse("images", admission.evaluation, plan);
    }
  } catch (err) {
    if (err instanceof UsageUnavailableError) {
      return usageUnavailableResponse();
    }
    throw err;
  }
  return null;
}

export async function handleImage(request, env) {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  const retryAfter = imageRateLimiter(request);
  if (retryAfter !== null) {
    return jsonResponse(
      429,
      { error: "Too many image requests. Try again shortly." },
      { "Retry-After": String(retryAfter) },
    );
  }

  let body;
  try {
    body = await readBoundedJson(request);
  } catch (bodyErr) {
    const message = bodyErr?.message || "Invalid JSON payload.";
    return jsonResponse(400, { error: `Request body rejected: ${message}` });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    body = {};
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return jsonResponse(400, { error: "Prompt is required." });
  }

  // Image generations are billed per call: check the plan's image budget before
  // calling the provider and count this one when it is allowed.
  const imageGate = await meterImageRequest(request, env);
  if (imageGate) return imageGate;

  // Optional reference image (the user's own image) sent to the image model
  // as multimodal input. Only validated data: image payloads or public https
  // URLs are accepted; anything else is rejected before any provider call.
  const referenceImage = validateReferenceImage(body.referenceImage);
  if (
    referenceImage === null &&
    typeof body.referenceImage === "string" &&
    body.referenceImage
  ) {
    return jsonResponse(400, {
      error:
        "referenceImage must be a base64 data:image URL or a public https URL.",
    });
  }

  const openRouterKey = env?.OPENROUTER_API_KEY;
  if (!openRouterKey) {
    // Honest 503: no image provider is configured. Text providers are never
    // routed as fake image providers.
    return jsonResponse(503, {
      error:
        "Image generation is unavailable: no image provider is configured on this deployment (set OPENROUTER_API_KEY to enable image generation).",
    });
  }

  const r2Key = `image_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.png`;

  // Image generation runs as long as it needs; only a client disconnect
  // aborts (Stop button, tab close).
  const imageClientSignal = (() => {
    const controller = new AbortController();
    if (request.signal) {
      if (request.signal.aborted) controller.abort();
      else
        request.signal.addEventListener("abort", () => controller.abort(), {
          once: true,
        });
    }
    return controller.signal;
  })();

  // A bare request ("flower") underspecifies the image: expand it into a
  // complete generator prompt. Crafted prompts pass through untouched.
  const imagePrompt = enhanceImagePrompt(prompt) || prompt;

  // OpenRouter image responses may use images[0].url, content URLs, or data:
  // image payloads. OPENROUTER_IMAGE_MODEL overrides the configured default
  // chain with one model.
  const imageModels = env?.OPENROUTER_IMAGE_MODEL
    ? [String(env.OPENROUTER_IMAGE_MODEL)]
    : undefined;
  const imageResult = await callOpenRouterImage(
    openRouterKey,
    imagePrompt,
    imageClientSignal,
    imageModels,
    referenceImage,
  );
  if (!imageResult?.url) {
    const attemptSummary = (imageResult?.attempts || [])
      .map((attempt) => `${attempt.model}:${attempt.reason || "failed"}`)
      .join(" | ")
      .slice(0, 300);
    console.warn("Image generation failed:", attemptSummary || "no image returned");
    return jsonResponse(503, {
      error:
        "Image generation is unavailable: the image provider did not return an image.",
    });
  }
  const { url: imageUrl, model: imageModel } = imageResult;

  // Only https: or inline data: payloads are ever fetched. This blocks the
  // provider-returned URL from being used to reach internal hosts
  // (metadata endpoints, private ranges) via a malformed or injected reply.
  const isDataUrl = imageUrl.startsWith("data:");
  if (!isDataUrl) {
    let parsed;
    try {
      parsed = new URL(imageUrl);
    } catch {
      return jsonResponse(502, {
        error:
          "Image generation failed: the provider returned an invalid image URL.",
      });
    }
    if (parsed.protocol !== "https:") {
      return jsonResponse(502, {
        error:
          "Image generation failed: the provider returned a non-https image URL.",
      });
    }
    // Scheme is not enough: never fetch loopback, private, link-local, or
    // cloud metadata hosts (169.254.169.254) that a malformed provider reply
    // could point at.
    if (isBlockedInternalHost(parsed.hostname)) {
      return jsonResponse(502, {
        error:
          "Image generation failed: the provider returned a non-public image URL.",
      });
    }
  }

  try {
    let buffer;
    let mimeType = "image/png";
    if (isDataUrl) {
      const parts = imageUrl.split(",");
      mimeType = parts[0].match(/:(.*?);/)?.[1] || "image/png";
      const bstr = atob(parts[1] || "");
      const u8arr = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) {
        u8arr[i] = bstr.charCodeAt(i);
      }
      buffer = u8arr.buffer;
    } else {
      // Image generation runs as long as it needs (project contract: no
      // artificial generation timeouts); only client disconnect aborts.
      const imgResp = await fetch(imageUrl, { signal: imageClientSignal });
      if (imgResp.ok) {
        mimeType = imgResp.headers.get("content-type") || "image/png";
        buffer = await imgResp.arrayBuffer();
      }
    }

    if (buffer && buffer.byteLength > 0) {
      const r2Url = await saveToR2IfAvailable(
        env,
        r2Key,
        buffer,
        mimeType,
        await sessionUid(request, env),
      );
      const absoluteR2 = r2Url
        ? String(r2Url).startsWith("http")
          ? String(r2Url)
          : `https://corez.pro${String(r2Url).startsWith("/") ? "" : "/"}${String(r2Url)}`
        : null;
      return jsonResponse(200, {
        image: absoluteR2 || imageUrl,
        model: imageModel,
      });
    }
  } catch (err) {
    console.warn(
      "Failed to persist image to R2, returning provider URL:",
      safeErrorDetail(err),
    );
  }
  return jsonResponse(200, { image: imageUrl, model: imageModel });
}

// Workers AI text-to-image endpoint: runs FLUX on the account's OWN Workers AI
// (env.AI binding) — no third-party key, billed inside the daily free neuron allocation.
// Default is flux-2-klein-9b (9B, finer detail); flux-2-klein-4b (4B, fast)
// is the opt-in speed tier. Failure of any selected model falls back to
// flux-1-schnell (stable).
// Same response contract as /api/image: { image: <r2 url | data url>, model }.
//
// Input contract: prompt (required) + optional width/height (256-1920) and
// seed + optional model. The model consumes multipart/form-data (the JSON body shape is
// rejected by the runner), so the binding call builds a FormData part.
const WORKERS_AI_IMAGE_MODEL = "@cf/black-forest-labs/flux-2-klein-9b";
const WORKERS_AI_IMAGE_FAST_MODEL = "@cf/black-forest-labs/flux-2-klein-4b";
const WORKERS_AI_FALLBACK_MODEL = "@cf/black-forest-labs/flux-1-schnell";
const WORKERS_AI_SDXL_LIGHTNING_MODEL =
  "@cf/bytedance/stable-diffusion-xl-lightning";
// The only Workers AI image model with an img2img input contract. Used for
// edits of a user's reference image when no keyed image provider is configured.
const WORKERS_AI_IMG2IMG_MODEL =
  "@cf/stabilityai/stable-diffusion-xl-base-1.0";
const ALLOWED_WORKERS_AI_IMAGE_MODELS = new Set([
  WORKERS_AI_IMAGE_MODEL,
  WORKERS_AI_IMAGE_FAST_MODEL,
  WORKERS_AI_FALLBACK_MODEL,
  WORKERS_AI_SDXL_LIGHTNING_MODEL,
  "@cf/stabilityai/stable-diffusion-xl-base-1.0",
  "@cf/lykon/dreamshaper-8-lcm",
]);

function boundedInt(value, min, max) {
  const n = Number(value);
  return Number.isFinite(n)
    ? Math.min(max, Math.max(min, Math.round(n)))
    : null;
}

// Detect the image mime from the base64 magic bytes (FLUX.2 klein returns
// JPEG by default); PNG fallback for providers that return PNG.
function mimeFromBase64(base64) {
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("iVBOR")) return "image/png";
  if (base64.startsWith("UklGR")) return "image/webp";
  return "image/png";
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Workers AI image models disagree on their output shape: FLUX returns
 * { image: "<base64>" } while SDXL's schema is binary. Accept either, plus a
 * Response/Blob/stream, so an img2img response is not mistaken for no image.
 */
async function imageResultBase64(result) {
  const normalize = (value) => {
    if (typeof value !== "string") return "";
    const text = value.trim();
    if (!text) return "";
    return text.startsWith("data:")
      ? text.slice(text.indexOf(",") + 1)
      : text;
  };

  if (typeof result === "string") return normalize(result);
  const direct = normalize(result?.image);
  if (direct) return direct;

  let raw = result?.image ?? result?.body ?? result;
  if (raw instanceof Uint8Array) return bytesToBase64(raw);
  if (raw instanceof ArrayBuffer) return bytesToBase64(new Uint8Array(raw));
  if (raw && typeof raw.arrayBuffer === "function") {
    return bytesToBase64(new Uint8Array(await raw.arrayBuffer()));
  }
  if (raw && typeof raw.getReader === "function") {
    return bytesToBase64(
      new Uint8Array(await new Response(raw).arrayBuffer()),
    );
  }
  return "";
}

export async function handleWorkersAIImage(request, env) {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  const retryAfter = imageRateLimiter(request);
  if (retryAfter !== null) {
    return jsonResponse(
      429,
      { error: "Too many image requests. Try again shortly." },
      { "Retry-After": String(retryAfter) },
    );
  }

  let body;
  try {
    body = await readBoundedJson(request);
  } catch (bodyErr) {
    const message = bodyErr?.message || "Invalid JSON payload.";
    return jsonResponse(400, { error: `Request body rejected: ${message}` });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    body = {};
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return jsonResponse(400, { error: "Prompt is required." });
  }

  // Same image budget as the OpenRouter route.
  const imageGate = await meterImageRequest(request, env);
  if (imageGate) return imageGate;

  const ai = env?.AI;
  if (!ai || typeof ai.run !== "function") {
    return jsonResponse(503, {
      error:
        "Workers AI image generation is unavailable: no AI binding is configured on this deployment.",
    });
  }

  // Only a client disconnect aborts (Stop button, tab close).
  const clientSignal = (() => {
    const controller = new AbortController();
    if (request.signal) {
      if (request.signal.aborted) controller.abort();
      else
        request.signal.addEventListener("abort", () => controller.abort(), {
          once: true,
        });
    }
    return controller.signal;
  })();

  // A bare request ("flower") underspecifies the image: expand it into a
  // complete generator prompt. Crafted prompts pass through untouched.
  const enhancedPrompt = enhanceImagePrompt(prompt) || prompt;

  // A user-supplied reference image turns text-to-image into an edit. Only
  // SDXL base accepts an image input on Workers AI; FLUX.2 cannot preserve the
  // reference, so the model choice is fixed when a reference is present.
  const referenceImage = validateReferenceImage(body.referenceImage);
  if (
    typeof body.referenceImage === "string" &&
    body.referenceImage &&
    !referenceImage
  ) {
    return jsonResponse(400, {
      error:
        "referenceImage must be a base64 data:image URL or a public https URL.",
    });
  }
  if (referenceImage && !referenceImage.startsWith("data:image/")) {
    return jsonResponse(400, {
      error:
        "Workers AI image editing requires a data:image reference, not a remote URL.",
    });
  }

  // Allow client to request a specific Workers AI model (e.g. sdxl-lightning)
  let requestedModel =
    typeof body.model === "string" ? body.model.trim() : "";
  // Normalize shorthands: sdxl-lightning, sdxl, dreamshaper, etc.
  const modelAliases = {
    "sdxl-lightning": WORKERS_AI_SDXL_LIGHTNING_MODEL,
    sdxl: WORKERS_AI_SDXL_LIGHTNING_MODEL,
    lightning: WORKERS_AI_SDXL_LIGHTNING_MODEL,
    "stable-diffusion-xl-lightning": WORKERS_AI_SDXL_LIGHTNING_MODEL,
    "stable-diffusion-xl-lighting": WORKERS_AI_SDXL_LIGHTNING_MODEL,
    "flux-klein": WORKERS_AI_IMAGE_MODEL,
    "flux-klein-9b": WORKERS_AI_IMAGE_MODEL,
    "klein-9b": WORKERS_AI_IMAGE_MODEL,
    "flux-9b": WORKERS_AI_IMAGE_MODEL,
    "flux-klein-4b": WORKERS_AI_IMAGE_FAST_MODEL,
    "klein-4b": WORKERS_AI_IMAGE_FAST_MODEL,
    "flux-4b": WORKERS_AI_IMAGE_FAST_MODEL,
    fast: WORKERS_AI_IMAGE_FAST_MODEL,
    "flux-schnell": WORKERS_AI_FALLBACK_MODEL,
    flux: WORKERS_AI_IMAGE_MODEL,
    schnell: WORKERS_AI_FALLBACK_MODEL,
    dreamshaper: "@cf/lykon/dreamshaper-8-lcm",
    "sdxl-base": "@cf/stabilityai/stable-diffusion-xl-base-1.0",
  };
  if (modelAliases[requestedModel.toLowerCase()]) {
    requestedModel = modelAliases[requestedModel.toLowerCase()];
  }
  const selectedModel = referenceImage
    ? WORKERS_AI_IMG2IMG_MODEL
    : requestedModel && ALLOWED_WORKERS_AI_IMAGE_MODELS.has(requestedModel)
      ? requestedModel
      : WORKERS_AI_IMAGE_MODEL;
  let usedModel = selectedModel;

  let result;
  try {
    if (referenceImage) {
      const imageBase64 = referenceImage.slice(
        referenceImage.indexOf(",") + 1,
      );
      const requestedStrength = Number(body.strength);
      const strength = Number.isFinite(requestedStrength)
        ? Math.min(0.9, Math.max(0.35, requestedStrength))
        : 0.55;
      const seed = boundedInt(body.seed, 0, 2147483647);
      result = await ai.run(
        selectedModel,
        {
          prompt: enhancedPrompt,
          image_b64: imageBase64,
          strength,
          num_steps: 20,
          ...(seed !== null ? { seed } : {}),
        },
        clientSignal ? { signal: clientSignal } : undefined,
      );
    } else {
    // The model consumes multipart/form-data. Serialize the FormData through
    // a Response so the binding receives a proper multipart stream PLUS its
    // derived Content-Type with the boundary (the documented klein-4b
    // pattern): passing a raw FormData with a custom Content-Type strips the
    // boundary (runner 3030), and string/byte bodies are rejected (8001).
    // SDXL-Lightning uses the same multipart shape (prompt + optional width/height/seed).
    const form = new FormData();
    form.append("prompt", enhancedPrompt);
    const width = boundedInt(body.width, 256, 1920);
    const height = boundedInt(body.height, 256, 1920);
    const seed = boundedInt(body.seed, 0, 2147483647);
    if (width !== null) form.append("width", String(width));
    if (height !== null) form.append("height", String(height));
    if (seed !== null) form.append("seed", String(seed));
    const formResponse = new Response(form);
    const inputs = {
      multipart: {
        body: formResponse.body,
        contentType: formResponse.headers.get("content-type"),
      },
    };
    try {
      result = await ai.run(
        selectedModel,
        inputs,
        clientSignal ? { signal: clientSignal } : undefined,
      );
    } catch (primaryErr) {
      // Fallback to flux-1-schnell if selected model is unavailable (model not found, quota, etc.)
      const msg = String(primaryErr?.message || "");
      const isModelNotFound =
        /model not found|unknown model|not available|400|404/i.test(msg);
      const fallbackModel =
        selectedModel !== WORKERS_AI_FALLBACK_MODEL
          ? WORKERS_AI_FALLBACK_MODEL
          : WORKERS_AI_SDXL_LIGHTNING_MODEL;
      if (isModelNotFound && fallbackModel) {
        console.warn(
          `Primary Workers AI model ${selectedModel} failed (${safeErrorDetail(primaryErr)}), trying fallback ${fallbackModel}`,
        );
        const fallbackForm = new FormData();
        fallbackForm.append("prompt", enhancedPrompt);
        if (width !== null) fallbackForm.append("width", String(width));
        if (height !== null) fallbackForm.append("height", String(height));
        if (seed !== null) fallbackForm.append("seed", String(seed));
        const fallbackResp = new Response(fallbackForm);
        const fallbackInputs = {
          multipart: {
            body: fallbackResp.body,
            contentType: fallbackResp.headers.get("content-type"),
          },
        };
        result = await ai.run(
          fallbackModel,
          fallbackInputs,
          clientSignal ? { signal: clientSignal } : undefined,
        );
        usedModel = fallbackModel;
      } else {
        throw primaryErr;
      }
    }
    }
  } catch (err) {
    if (clientSignal?.aborted || err?.name === "AbortError") {
      return jsonResponse(499, { error: "Image request cancelled." });
    }
    console.warn("Workers AI image generation failed:", safeErrorDetail(err));
    return jsonResponse(502, {
      error:
        "Image generation failed: the Workers AI provider returned an error.",
    });
  }

  const base64 = await imageResultBase64(result);
  if (!base64) {
    return jsonResponse(502, {
      error:
        "Image generation failed: the Workers AI provider returned no image.",
    });
  }

  // Persist to R2 when available; otherwise return the inline data URL. The
  // data URL is always the safe fallback — it is never fetched again.
  const mimeType = mimeFromBase64(base64);
  const extension =
    mimeType === "image/jpeg"
      ? "jpg"
      : mimeType === "image/webp"
        ? "webp"
        : "png";
  const r2Key = `image_cf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${extension}`;
  let imageUrl = `data:${mimeType};base64,${base64}`;
  try {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const r2Url = await saveToR2IfAvailable(
      env,
      r2Key,
      bytes.buffer,
      mimeType,
      await sessionUid(request, env),
    );
    if (r2Url) {
      imageUrl = String(r2Url).startsWith("http")
        ? String(r2Url)
        : `https://corez.pro${String(r2Url).startsWith("/") ? "" : "/"}${String(r2Url)}`;
    }
  } catch {
    // R2 is optional: the data URL is returned when storage fails.
  }
  return jsonResponse(200, { image: imageUrl, model: usedModel });
}
