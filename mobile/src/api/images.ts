/**
 * Image generation for the native client.
 *
 * `POST /api/image` (OpenRouter image model) and `/api/image/cf` (Workers AI
 * FLUX) share the same response contract: `{ image, model }` where `image` is
 * either an absolute URL (persisted to R2) or a `data:` URL. The Worker owns
 * prompt expansion and provider fallback; the app only sends the prompt.
 */
import { requestJson } from "./client";

export interface GeneratedImage {
  image: string;
  model?: string;
}

export async function generateImage(input: {
  prompt: string;
  model?: string;
}): Promise<GeneratedImage> {
  const prompt = String(input.prompt || "").trim();
  if (!prompt) throw new Error("A prompt is required.");
  if (prompt.length > 2_000) {
    throw new Error("The prompt is too long (2,000 characters max).");
  }
  const data = await requestJson<GeneratedImage>("/api/image", {
    method: "POST",
    body: {
      prompt,
      ...(input.model ? { model: input.model } : {}),
    },
    timeoutMs: 120_000,
  });
  if (!data?.image) throw new Error("The image request returned no image.");
  return data;
}

/** Suggested styles append a short phrase to the prompt. */
export const IMAGE_STYLES = [
  { id: "photo", label: "photo", suffix: "photorealistic, natural lighting" },
  { id: "illustration", label: "illustration", suffix: "illustrated, bold shapes" },
  { id: "3d", label: "3D", suffix: "3d render, soft studio lighting" },
  { id: "minimal", label: "minimal", suffix: "minimal flat design, clean composition" },
] as const;
