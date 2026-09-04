/**
 * MiMo V2.5 -> Muse Spark 1.3 Two-Stage Pipeline for corez.pro
 *
 * Every user attachment (image, video, audio, file, etc.) is first
 * understood by MiMo V2.5 (vision + multimodal), then its textual
 * description is fed to Muse Spark 1.3 for generation.
 *
 * This file is used by worker/index.js (server) and is safe to call
 * from any context. It reuses the same gateway as Muse (OpenCode Zen Go)
 * but with model mimo-v2.5 — same auth, same endpoint, different model.
 */

export const MIMO_DEFAULT_MODEL = "mimo-v2.5";
export const MIMO_DEFAULT_ENDPOINT = "https://opencode.ai/zen/go/v1/chat/completions";

const MIMO_MEDIA_PROMPTS = {
  image:
    "Describe this image in detail for a builder AI. Cover: subjects, layout, colors, style, text visible, composition, mood, and any UI elements. Be concise but thorough (120-200 words). Respond in English.",
  video:
    "Describe this video in detail for a builder AI. Cover: what is shown, motion/action, subjects, setting, colors, style, any text or UI. Be concise but thorough (120-200 words). If you see multiple frames, summarize the overall content. Respond in English.",
  audio:
    "Transcribe and describe this audio in detail for a builder AI. Provide a verbatim transcript if speech is present, plus notes on tone, speaker, music/sounds, and overall meaning (100-180 words).",
  file: "Summarize this file for a builder AI. Extract key content, structure, and intent. If it is a document, transcribe the important text; if it is a design/spec, note layout and sections. Be concise (120-200 words). Respond in English.",
  generic:
    "Describe this attachment in detail for a builder AI so it can use it accurately in generation. Cover content, structure, style, and intent (120-200 words). Respond in English.",
};

function mimoEndpoint(env) {
  return env?.MIMO_ENDPOINT || env?.OPENCODE_ENDPOINT || MIMO_DEFAULT_ENDPOINT;
}

function mimoModel(env) {
  return env?.MIMO_MODEL || "mimo-v2.5";
}

function mimoKey(env) {
  return (
    env?.MIMO_API_KEY ||
    env?.OPENCODE_GO_API_KEY ||
    env?.OPENCODE_API_KEY ||
    null
  );
}

export function isMimoAvailable(env) {
  return Boolean(mimoKey(env));
}

export function collectMediaAttachments(messages, _prompt) {
  const collected = [];
  const seen = new Set();
  for (const m of Array.isArray(messages) ? messages : []) {
    for (const a of Array.isArray(m?.attachments) ? m.attachments : []) {
      const key = a?.assetUrl || a?.thumb || a?.name || "";
      if (!key || seen.has(key)) continue;
      seen.add(key);
      // Accept anything that has visual/file data: thumb, assetUrl, or text content
      if (a?.thumb || a?.assetUrl || a?.content || a?.type) {
        collected.push(a);
      }
    }
  }
  // Also attach current prompt context for file-only messages
  return collected;
}

function mediaKind(attachment) {
  const t = String(attachment?.type || "").toLowerCase();
  const name = String(attachment?.name || "").toLowerCase();
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("audio/")) return "audio";
  if (t === "application/pdf" || name.endsWith(".pdf")) return "file";
  if (t.startsWith("text/") || attachment?.content) return "file";
  if (t) return "generic";
  return "generic";
}

/**
 * Extract the R2 object key from an asset URL, accepting both the relative
 * form (/api/assets/<key>) and the absolute form
 * (https://corez.pro/api/assets/<key>) that attachments carry since storage
 * URLs were absolutized. Returns null for anything else.
 */
function r2KeyFromAssetUrl(assetUrl) {
  const path = String(assetUrl || "").replace(/^https?:\/\/[^/]+/i, "");
  const prefix = "/api/assets/";
  if (!path.startsWith(prefix)) return null;
  const key = path.slice(prefix.length).split("?")[0];
  // User-upload keys are simple filenames; nested publish/... keys are left
  // to the direct-https path instead of a bucket refetch.
  if (!key || key.includes("..") || key.includes("/")) return null;
  return key;
}

async function fetchR2AssetAsDataUrl(assetUrl, env) {
  try {
    if (!env?.ASSET_BUCKET || typeof env.ASSET_BUCKET.get !== "function")
      return null;
    const key = r2KeyFromAssetUrl(assetUrl);
    if (!key) return null;
    const obj = await env.ASSET_BUCKET.get(key);
    if (!obj) return null;
    const mime =
      obj.httpMetadata?.contentType || "image/jpeg";
    const buf = await obj.arrayBuffer();
    if (!buf || buf.byteLength === 0) return null;
    // Guard: don't blow up MiMo with huge payloads (>8MB)
    if (buf.byteLength > 8 * 1024 * 1024) return null;
    let binary = "";
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const b64 = btoa(binary);
    return `data:${mime};base64,${b64}`;
  } catch {
    return null;
  }
}

function buildMimoMessages(attachment, promptHint, resolvedImageUrl) {
  const kind = mediaKind(attachment);
  const systemText = MIMO_MEDIA_PROMPTS[kind] || MIMO_MEDIA_PROMPTS.generic;
  const userText = promptHint
    ? `User request: "${String(promptHint).slice(0, 300)}" — ${systemText}`
    : systemText;

  // Prefer data URL thumb (already base64, no fetch needed). Fallback to resolved R2 dataUrl or https URL.
  const imageUrl =
    resolvedImageUrl ||
    (attachment?.thumb && String(attachment.thumb).startsWith("data:")
      ? String(attachment.thumb)
      : attachment?.assetUrl &&
          String(attachment.assetUrl).startsWith("http")
        ? String(attachment.assetUrl)
        : null);

  // For text-like files with extracted content, just ask mimo to summarize that content
  if (
    attachment?.content &&
    typeof attachment.content === "string" &&
    attachment.content.trim()
  ) {
    return [
      {
        role: "user",
        content:
          userText +
          "\n\nFile: " +
          attachment.name +
          " (" +
          attachment.type +
          ")\n---\n" +
          attachment.content.slice(0, 8000) +
          "\n---",
      },
    ];
  }

  if (imageUrl) {
    return [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              userText +
              (attachment?.name ? " (file: " + attachment.name + ")" : ""),
          },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ];
  }

  // No image URL available — fall back to metadata + prompt
  return [
    {
      role: "user",
      content:
        userText +
        (attachment?.name
          ? "\nFile: " +
            attachment.name +
            " (" +
            (attachment.type || "unknown") +
            ")"
          : ""),
    },
  ];
}

function isResponsesEndpoint(endpoint) {
  return typeof endpoint === "string" && endpoint.includes("/responses");
}

async function callMimo(messages, env, signal) {
  const key = mimoKey(env);
  if (!key) {
    console.warn("MiMo: skipped vision pre-pass (no API key available)");
    return null;
  }
  const endpoint = mimoEndpoint(env);
  const model = mimoModel(env);
  const isResponses = isResponsesEndpoint(endpoint);

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  let timeout;
  let hit = false;
  // MiMo vision should be quick — 25s cap per attachment so the main build is not blocked
  timeout = setTimeout(() => {
    hit = true;
    controller.abort();
  }, 25000);
  try {
    const body = isResponses ? { model, input: messages } : { model, messages };
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://corez.pro",
        "X-Title": "COREZ AI - MiMo Vision",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`MiMo: vision request failed (HTTP ${res.status})`);
      return null;
    }
    const data = await res.json().catch(() => null);
    if (isResponses) {
      const output = Array.isArray(data?.output) ? data.output : [];
      const messageItem = output.find(
        (item) => item && item.type === "message" && item.role === "assistant",
      );
      if (messageItem && Array.isArray(messageItem.content)) {
        const textPart = messageItem.content.find(
          (c) => c && c.type === "output_text" && typeof c.text === "string",
        );
        if (
          textPart &&
          typeof textPart.text === "string" &&
          textPart.text.trim()
        )
          return textPart.text.trim();
      }
      console.warn("MiMo: vision request returned no usable text");
      return null;
    }
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text === "string" && text.trim()) return text.trim();
    if (Array.isArray(text)) {
      const joined = text
        .map((p) => p?.text || "")
        .join("")
        .trim();
      if (joined) return joined;
    }
    console.warn("MiMo: vision request returned no usable text");
    return null;
  } catch (err) {
    if (hit) {
      console.warn("MiMo: vision request timed out (25s cap)");
      return null;
    }
    if (err?.name === "AbortError") {
      console.warn("MiMo: vision request aborted (client disconnect)");
      return null;
    }
    console.warn(`MiMo: vision request errored (${err?.message || err})`);
    return null;
  } finally {
    clearTimeout(timeout);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

/**
 * Describe all collected attachments with MiMo V2.5.
 * Returns an array of { name, type, kind, description } — one per attachment that succeeded.
 * Failures are silent (null entries dropped) so the Muse build always proceeds.
 */
export async function describeAttachmentsWithMimo(
  attachments,
  promptHint,
  env,
  signal,
) {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];
  if (!isMimoAvailable(env)) return [];
  if (env?.MIMO_DISABLED === "true" || env?.MIMO_DISABLED === "1") return [];
  // Cap to 4 attachments to keep latency bounded; prioritize images
  const sorted = [...attachments]
    .sort((a, b) => {
      const ka = mediaKind(a),
        kb = mediaKind(b);
      const pri = { image: 0, video: 1, audio: 2, file: 3, generic: 4 };
      return (pri[ka] ?? 4) - (pri[kb] ?? 4);
    })
    .slice(0, 4);

  const results = await Promise.all(
    sorted.map(async (att) => {
      const kind = mediaKind(att);
      // Resolve R2 URLs (relative or absolute https://corez.pro form) to a
      // dataUrl for MiMo when no data-URL thumb is present (large images)
      let resolvedUrl = null;
      if (
        (!att?.thumb || !String(att.thumb).startsWith("data:")) &&
        att?.assetUrl &&
        r2KeyFromAssetUrl(att.assetUrl)
      ) {
        resolvedUrl = await fetchR2AssetAsDataUrl(att.assetUrl, env);
      }
      const mimoMessages = buildMimoMessages(att, promptHint, resolvedUrl);
      const desc = await callMimo(mimoMessages, env, signal);
      if (!desc) return null;
      // Preserve assetUrl so downstream can inject exact R2 URL into Muse prompt
      return {
        name: att.name || "attachment",
        type: att.type || "",
        kind,
        description: desc,
        assetUrl: att.assetUrl || null,
        thumb: att.thumb || null,
      };
    }),
  );
  return results.filter(Boolean);
}

/**
 * Build the system prompt block that carries MiMo descriptions to Muse.
 * Injected as a system message before the Muse generation so Muse has
 * grounded vision/file understanding.
 */
export function buildMimoContextBlock(descriptions) {
  if (!Array.isArray(descriptions) || descriptions.length === 0) return null;
  const lines = descriptions
    .map((d, i) => {
      const label =
        d.kind === "image"
          ? "Image"
          : d.kind === "video"
            ? "Video"
            : d.kind === "audio"
              ? "Audio"
              : "File";
      const absUrl = d.assetUrl
        ? String(d.assetUrl).startsWith("http")
          ? String(d.assetUrl)
          : `https://corez.pro${String(d.assetUrl).startsWith("/") ? "" : "/"}${String(d.assetUrl)}`
        : null;
      const srcHint = absUrl
        ? `\nR2 URL (use EXACTLY this for <img src> — must start with https://corez.pro/api/assets/ — never hallucinate local filenames like "${d.name}" or Screenshot...png): ${absUrl}`
        : d.thumb && String(d.thumb).startsWith("data:")
          ? `\nData URL available (use this for <img src> if no R2 URL): data:image/... (truncated, use assetUrl if present)`
          : "";
      return (
        i +
        1 +
        ". " +
        label +
        ' "' +
        d.name +
        '" (' +
        (d.type || d.kind) +
        "):\n" +
        d.description +
        srcHint
      );
    })
    .join("\n\n");
  return (
    "MiMo V2.5 Media Understanding (vision/file analysis — authoritative, use this as ground truth for the attached media, then fulfill the user's request with Muse Spark 1.3):\n" +
    lines +
    "\n\nUse the above MiMo descriptions as the true content of the user's attached files. Do NOT hallucinate or invent media content — ground your generation in these descriptions. When you need to display the attached image in generated HTML, use the EXACT R2 URL provided above for <img src> (e.g. <img src=\"https://corez.pro/api/assets/user-upload_...jpg\"> — must start with https://corez.pro/api/assets/). Never use local filenames like \"Screenshot 2026-09-02 145516.png\" or relative /api/assets/ — they will 404 or break on published sites."
  );
}
