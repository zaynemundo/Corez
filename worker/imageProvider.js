// OpenRouter image generation.
//
// Image generation is intentionally separate from the text provider chain:
// chat is OpenCode Go only, while images use OPENROUTER_API_KEY when
// configured. Every model attempt is recorded so callers can report why the
// provider produced no image instead of failing blind.

import { safeErrorDetail } from "./utils.js";

export const OPENROUTER_DEFAULT_ENDPOINT =
  "https://openrouter.ai/api/v1/chat/completions";

// OpenRouter retired black-forest-labs/flux-1-schnell, so image generation
// uses Google's Nano Banana 2 lite (Gemini 3.1 Flash Lite Image) only.
// OPENROUTER_IMAGE_MODEL overrides the chain with a single model.
export const DEFAULT_IMAGE_MODEL_CHAIN = ["google/gemini-3.1-flash-lite-image"];

/**
 * Generate one image through OpenRouter. Tries each model in the chain (env
 * override, then the default chain) and returns the first usable image as
 * { url, model, attempts } — the response reports the model that actually
 * produced the image and the per-model attempt log. When no model produces a
 * usable image it returns { url: null, model: null, attempts } so callers can
 * report the real reason.
 *
 * The preferred path parses choices[0].message.images[0].url; content URLs
 * and data:image payloads are also accepted.
 *
 * referenceImage (optional) is a validated data: URL or public https URL of
 * the user's own image. When present the message becomes OpenAI-style
 * multimodal content ([{ type: 'text' }, { type: 'image_url' }]) so image
 * models use it as visual reference instead of inventing from text alone.
 */
export async function callOpenRouterImage(
  apiKey,
  prompt,
  parentSignal,
  imageModels = DEFAULT_IMAGE_MODEL_CHAIN,
  referenceImage = null,
) {
  const models =
    Array.isArray(imageModels) && imageModels.length > 0
      ? imageModels
      : DEFAULT_IMAGE_MODEL_CHAIN;
  const userContent =
    typeof referenceImage === "string" && referenceImage
      ? [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: referenceImage } },
        ]
      : prompt;
  const attempts = [];
  for (const model of models) {
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
    }, 60_000);
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

      if (response.ok) {
        const data = await response.json();
        const message = data?.choices?.[0]?.message;
        if (Array.isArray(message?.images) && message.images.length > 0) {
          // Providers differ: some expose images[0].url, others use the
          // OpenAI-style images[0].image_url.url — accept both.
          const first = message.images[0];
          const imageUrl = first?.url || first?.image_url?.url;
          if (typeof imageUrl === "string" && imageUrl) {
            attempts.push({ model, ok: true });
            return { url: imageUrl, model, attempts };
          }
        }
        const content =
          typeof message?.content === "string" ? message.content : "";
        const urlMatch =
          content.match(/https?:\/\/[^\s)"']+\.(?:png|jpg|jpeg|webp)/i) ||
          content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
        if (urlMatch) {
          attempts.push({ model, ok: true });
          return { url: urlMatch[1] || urlMatch[0], model, attempts };
        }
        if (content.startsWith("data:image")) {
          attempts.push({ model, ok: true });
          return { url: content, model, attempts };
        }
        attempts.push({
          model,
          ok: false,
          reason: "no usable image in provider response",
        });
      } else {
        const detail = (await response.text().catch(() => "")).slice(0, 200);
        attempts.push({
          model,
          ok: false,
          reason: `HTTP ${response.status}: ${safeErrorDetail(detail)}`,
        });
      }
    } catch (err) {
      if (deadlineHit) {
        attempts.push({ model, ok: false, reason: "timed out after 60s" });
      } else {
        console.warn(
          `OpenRouter image generation attempt failed (${model}):`,
          safeErrorDetail(err),
        );
        attempts.push({
          model,
          ok: false,
          reason: safeErrorDetail(err) || "request failed",
        });
      }
    } finally {
      clearTimeout(timer);
      if (parentSignal) parentSignal.removeEventListener("abort", forwardAbort);
    }
  }
  return { url: null, model: null, attempts };
}
