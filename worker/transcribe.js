/**
 * POST /api/transcribe — turn a short microphone recording into text with the
 * account's own Workers AI binding. The browser sends base64 audio; Whisper
 * runs on Cloudflare, billed inside the daily free neuron allocation.
 *
 * This is a dictation helper, not an audio archive: the clip is held in memory
 * for the model call and is never persisted to R2 or D1.
 */

import { sessionUid } from "./auth.js";
import {
  createRateLimiter,
  jsonResponse,
  readBoundedJson,
  safeErrorDetail,
} from "./utils.js";

export const WORKERS_AI_TRANSCRIBE_MODEL =
  "@cf/openai/whisper-large-v3-turbo";

// A base64 body of 12 MiB is roughly a 9 MiB audio clip. Dictation caps at two
// minutes client-side, so this leaves generous headroom while still bounding
// what a public route can make the model process.
const MAX_AUDIO_BASE64_CHARS = 12 * 1024 * 1024;
const MAX_BODY_BYTES = 16 * 1024 * 1024;

const transcribeRateLimiter = createRateLimiter({
  windowMs: 60_000,
  limit: 10,
});

function retryResponse(retryAfter) {
  return jsonResponse(
    429,
    { error: "Too many dictation requests. Try again shortly." },
    { "Retry-After": String(retryAfter) },
  );
}

export async function handleTranscribe(request, env) {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  const uid = await sessionUid(request, env);
  if (!uid) {
    return jsonResponse(401, { error: "Authentication required." });
  }

  const retryAfter = transcribeRateLimiter(request);
  if (retryAfter !== null) return retryResponse(retryAfter);

  if (!env?.AI || typeof env.AI.run !== "function") {
    return jsonResponse(503, {
      error: "Speech transcription is not configured on this deployment.",
    });
  }

  let body;
  try {
    body = await readBoundedJson(request, MAX_BODY_BYTES);
  } catch (err) {
    const message = String(err?.message || "Invalid JSON payload.");
    if (message.includes("byte limit")) {
      return jsonResponse(413, { error: "Audio recording is too large." });
    }
    return jsonResponse(400, { error: "Invalid transcription request." });
  }

  const raw = typeof body?.audio === "string" ? body.audio.trim() : "";
  const audio = (raw.startsWith("data:") ? raw.split(",")[1] || "" : raw)
    .replace(/\s+/g, "");
  if (!audio || !/^[A-Za-z0-9+/=]+$/.test(audio)) {
    return jsonResponse(400, { error: "Audio data is missing or invalid." });
  }
  if (audio.length > MAX_AUDIO_BASE64_CHARS) {
    return jsonResponse(413, { error: "Audio recording is too large." });
  }

  const requestedLanguage =
    typeof body?.language === "string" && /^[a-z]{2,3}$/i.test(body.language)
      ? body.language.toLowerCase()
      : "";

  let result;
  try {
    result = await env.AI.run(WORKERS_AI_TRANSCRIBE_MODEL, {
      audio,
      task: "transcribe",
      vad_filter: true,
      ...(requestedLanguage ? { language: requestedLanguage } : {}),
    });
  } catch (err) {
    console.warn("Whisper transcription failed:", safeErrorDetail(err));
    return jsonResponse(502, {
      error: "Transcription failed: the speech model returned an error.",
    });
  }

  const text = String(result?.text || result?.response?.text || "").trim();
  return jsonResponse(200, {
    model: WORKERS_AI_TRANSCRIBE_MODEL,
    text,
    language:
      result?.transcription_info?.language || requestedLanguage || null,
  });
}
