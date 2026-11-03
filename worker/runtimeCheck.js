// Authenticated runtime-check endpoint used by the preview UI/tools to execute
// generated HTML in a real browser and report console/page/WebGL failures.

import { verifySession } from "./auth.js";
import {
  createRateLimiter,
  jsonResponse,
  readBoundedJson,
  safeErrorDetail,
} from "./utils.js";
import { runRuntimeVerification } from "./runtimeVerifier.js";

const runtimeCheckLimiter = createRateLimiter({
  windowMs: 60_000,
  limit: 5,
});

const MAX_HTML_CHARS = 2_000_000;

export async function handleRuntimeCheck(request, env) {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }
  const session = await verifySession(request, env).catch(() => null);
  if (!session) {
    return jsonResponse(401, { error: "Authentication required. Please log in." });
  }
  const retryAfter = runtimeCheckLimiter(request);
  if (retryAfter !== null) {
    return jsonResponse(
      429,
      { error: "Too many runtime checks. Try again shortly." },
      { "Retry-After": String(retryAfter) },
    );
  }
  let body;
  try {
    body = await readBoundedJson(request);
  } catch {
    return jsonResponse(400, { error: "Invalid JSON payload." });
  }
  const html = typeof body?.html === "string" ? body.html : "";
  if (!html.trim()) {
    return jsonResponse(400, { error: "HTML is required." });
  }
  if (html.length > MAX_HTML_CHARS) {
    return jsonResponse(413, { error: "HTML is too large to verify." });
  }
  try {
    const report = await runRuntimeVerification(env, html, {
      includeScreenshot: body?.screenshot === true,
    });
    if (report.skipped && /not configured|timed out/i.test(report.reason || "")) {
      return jsonResponse(503, {
        error: "Runtime verification is unavailable right now.",
        detail: safeErrorDetail(report.reason),
      });
    }
    return jsonResponse(200, report);
  } catch (error) {
    return jsonResponse(502, {
      error: "Could not run the page in a browser.",
      detail: safeErrorDetail(error),
    });
  }
}
