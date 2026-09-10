// OpenRouter image generation.
//
// Image generation is intentionally separate from the text provider chain:
// chat is OpenCode Go only, while images use OPENROUTER_API_KEY when
// configured. Every model attempt is recorded so callers can report why the
// provider produced no image instead of failing blind, and transient provider
// failures (429/5xx/network) are retried a bounded number of times.

import { safeErrorDetail } from "./utils.js";
import { classifyFailureStatus } from "../packages/agent-core/providers/failure.js";

export const OPENROUTER_DEFAULT_ENDPOINT =
  "https://openrouter.ai/api/v1/chat/completions";

// OpenRouter retired black-forest-labs/flux-1-schnell, so image generation
// uses Google's Nano Banana 2 lite (Gemini 3.1 Flash Lite Image) only.
// OPENROUTER_IMAGE_MODEL overrides the chain with a single model.
export const DEFAULT_IMAGE_MODEL_CHAIN = ["google/gemini-3.1-flash-lite-image"];

// Bounded transient retries per model. Delays are overridable (tests pass
// zeros) so the retry behavior itself is covered without real waiting.
const IMAGE_RETRY_DELAYS_MS = [500, 1500];
const IMAGE_MAX_RETRY_AFTER_MS = 5_000;
const IMAGE_DEADLINE_MS = 60_000;

/**
 * Generate one image through OpenRouter. Tries each model in the chain (env
 * override, then the default chain) and returns the first usable image as
 * { url, model, attempts } — the response reports the model that actually
 * produced the image and the per-model attempt log (including transient
 * retries). When no model produces a usable image it returns
 * { url: null, model: null, attempts } so callers can report the real reason.
 *
 * The preferred path parses choices[0].message.images[0].url; content URLs
 * and data:image payloads are also accepted.
 *
 * referenceImage (optional) is a validated data: URL or public https URL of
 * the user's own image. When present the message becomes OpenAI-style
 * multimodal content ([{ type: 'text' }, { type: 'image_url' }]) so image
 * models use it as visual reference instead of inventing from text alone.
 *
 * retryDelaysMs (optional) bounds transient retries per model; each entry is
 * the wait before the next attempt. Timeouts and unusable 200 responses are
 * terminal for the model so the request cannot hang for minutes.
 */
export async function callOpenRouterImage(
  apiKey,
  prompt,
  parentSignal,
  imageModels = DEFAULT_IMAGE_MODEL_CHAIN,
  referenceImage = null,
  retryDelaysMs = IMAGE_RETRY_DELAYS_MS,
) {
  const models =
    Array.isArray(imageModels) && imageModels.length > 0
      ? imageModels
      : DEFAULT_IMAGE_MODEL_CHAIN;
  const delays = Array.isArray(retryDelaysMs) ? retryDelaysMs : [];
  const userContent =
    typeof referenceImage === "string" && referenceImage
      ? [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: referenceImage } },
        ]
      : prompt;
  const attempts = [];

  async function requestOnce(model) {
    // Deadline guard: a hung image generation must not hang the request.
    const controller = new AbortController();
    const forwardAbort = () => controller.abort();
    if (parentSignal) {
      if (parentSignal.aborted) controller.abort();
      else parentSignal.addEventListener("abort", forwardAbort, { once: true });
    }
    let deadlineHit = false;
    const timer = setTimeout(() => {
      deadlineHit = true;
      controller.abort();
    }, IMAGE_DEADLINE_MS);
    try {
      const response = await fetch(OPENROUTER_DEFAULT_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://corez.ai",
          "X-Title": "COREZ AI",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: userContent }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 200);
        const retryAfter = Number(response.headers.get("Retry-After") || 0);
        return {
          ok: false,
          reason: `HTTP ${response.status}: ${safeErrorDetail(detail)}`,
          transient: classifyFailureStatus(response.status) === "transient",
          retryAfterMs:
            Number.isFinite(retryAfter) && retryAfter > 0
              ? Math.min(retryAfter * 1000, IMAGE_MAX_RETRY_AFTER_MS)
              : 0,
        };
      }

      const data = await response.json();
      const message = data?.choices?.[0]?.message;
      if (Array.isArray(message?.images) && message.images.length > 0) {
        // Providers differ: some expose images[0].url, others use the
        // OpenAI-style images[0].image_url.url — accept both.
        const first = message.images[0];
        const imageUrl = first?.url || first?.image_url?.url;
        if (typeof imageUrl === "string" && imageUrl) {
          return { ok: true, url: imageUrl };
        }
      }
      const content =
        typeof message?.content === "string" ? message.content : "";
      const urlMatch =
        content.match(/https?:\/\/[^\s)"']+\.(?:png|jpg|jpeg|webp)/i) ||
        content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
      if (urlMatch) return { ok: true, url: urlMatch[1] || urlMatch[0] };
      if (content.startsWith("data:image")) return { ok: true, url: content };
      return {
        ok: false,
        reason: "no usable image in provider response",
        transient: false,
        retryAfterMs: 0,
      };
    } catch (err) {
      if (deadlineHit) {
        return {
          ok: false,
          reason: `timed out after ${IMAGE_DEADLINE_MS / 1000}s`,
          transient: false,
          retryAfterMs: 0,
        };
      }
      if (parentSignal?.aborted) {
        return { ok: false, reason: "cancelled", transient: false, retryAfterMs: 0 };
      }
      console.warn(
        `OpenRouter image generation attempt failed (${model}):`,
        safeErrorDetail(err),
      );
      return {
        ok: false,
        reason: safeErrorDetail(err) || "request failed",
        transient: true,
        retryAfterMs: 0,
      };
    } finally {
      clearTimeout(timer);
      if (parentSignal) parentSignal.removeEventListener("abort", forwardAbort);
    }
  }

  for (const model of models) {
    for (let attempt = 0; attempt <= delays.length; attempt += 1) {
      const result = await requestOnce(model);
      attempts.push(
        result.ok
          ? { model, ok: true, attempt: attempt + 1 }
          : { model, ok: false, attempt: attempt + 1, reason: result.reason },
      );
      if (result.ok) return { url: result.url, model, attempts };
      if (
        !result.transient ||
        attempt >= delays.length ||
        parentSignal?.aborted
      ) {
        break;
      }
      const delayMs = result.retryAfterMs > 0 ? result.retryAfterMs : delays[attempt] || 0;
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  return { url: null, model: null, attempts };
}
