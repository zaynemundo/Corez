/**
 * n8n Webhook Bridge — webhook-only (no N8N_API_KEY needed)
 *
 * CoreZ triggers external n8n workflows via plain Webhook URLs.
 * This is the recommended sidecar pattern: CoreZ stays the code harness,
 * n8n handles automation (Slack, Sheets, Email, CRM) when a CoreZ event
 * fires (publish, new chat, lead form).
 *
 * Env: N8N_WEBHOOK_URL (optional default, e.g. https://<n8n>/webhook/<id>)
 *       N8N_WEBHOOK_SECRET (optional HMAC header for verification)
 *       N8N_WEBHOOK_TIMEOUT_MS (default 8000)
 *       N8N_ALLOW_PRIVATE=1  (dev only: permit loopback/private targets)
 *       N8N_ALLOW_HTTP=1     (dev only: permit plain-http targets)
 *
 * Endpoints:
 *  POST /api/n8n/webhook  { event, payload, webhookUrl? }
 *    -> forwards JSON to the n8n webhook URL (env default or per-request)
 *       No n8n API key required. Webhook URLs are unguessable tokens.
 */

import { jsonResponse, readBoundedJson, safeErrorDetail } from "./utils.js";
import { verifySession } from "./auth.js";

const DEFAULT_TIMEOUT_MS = 8000;

function getWebhookUrl(requestBody, env) {
  const fromBody =
    typeof requestBody?.webhookUrl === "string"
      ? requestBody.webhookUrl.trim()
      : "";
  if (fromBody && /^https?:\/\//i.test(fromBody)) return fromBody;
  const fromEnv =
    typeof env?.N8N_WEBHOOK_URL === "string" ? env.N8N_WEBHOOK_URL.trim() : "";
  if (fromEnv && /^https?:\/\//i.test(fromEnv)) return fromEnv;
  return null;
}

// Block loopback, private, link-local, CGNAT, multicast and metadata
// hostnames. Without this an authenticated user could make the Worker POST to
// internal services (SSRF) — the shared secret header made that worse.
function isPrivateHostname(hostname) {
  const host = String(hostname || "")
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal"
  ) {
    return true;
  }
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if ([a, b, Number(v4[3]), Number(v4[4])].some((n) => n > 255)) return true;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
  }
  if (
    host === "::1" ||
    host === "::" ||
    host.startsWith("fe80:") ||
    host.startsWith("fc") ||
    host.startsWith("fd")
  ) {
    return true;
  }
  return false;
}

function isAllowedWebhookUrl(url, env) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    // http and private targets are dev-only escape hatches.
    if (u.protocol === "http:" && env?.N8N_ALLOW_HTTP !== "1") return false;
    if (isPrivateHostname(u.hostname) && env?.N8N_ALLOW_PRIVATE !== "1")
      return false;
    return true;
  } catch {
    return false;
  }
}

// The shared secret is only sent to the configured N8N_WEBHOOK_URL host: a
// per-request URL must never be able to harvest it.
function configuredWebhookHost(env) {
  try {
    return new URL(env?.N8N_WEBHOOK_URL).host;
  } catch {
    return null;
  }
}

export async function handleN8nWebhook(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== "/api/n8n/webhook") return null;
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }
  if (request.method !== "POST") {
    return jsonResponse(405, {
      error: "Method not allowed. Use POST /api/n8n/webhook",
    });
  }

  // Optional auth: if AUTH_SECRET is set, require a valid session for the bridge
  // (prevents anonymous trigger of user-configured automations). Local dev without
  // AUTH_SECRET allows anonymous calls so contract tests don't need a session.
  if (env?.AUTH_SECRET) {
    const sess = await verifySession(request, env);
    if (!sess)
      return jsonResponse(401, {
        error: "Authentication required for n8n webhook bridge.",
      });
  }

  let body;
  try {
    body = await readBoundedJson(request);
  } catch {
    return jsonResponse(400, { error: "Invalid JSON payload." });
  }

  const webhookUrl = getWebhookUrl(body, env);
  if (!webhookUrl) {
    return jsonResponse(400, {
      error:
        "Missing webhookUrl. Provide { webhookUrl } in body or set N8N_WEBHOOK_URL in worker env.",
    });
  }
  if (!isAllowedWebhookUrl(webhookUrl, env)) {
    return jsonResponse(400, {
      error:
        "Invalid webhookUrl — must be an https URL that is not a loopback or private address.",
    });
  }

  const event =
    typeof body?.event === "string" ? body.event.slice(0, 120) : "corez.event";
  const payload =
    body?.payload !== undefined
      ? body.payload
      : body?.data !== undefined
        ? body.data
        : {};
  const forwarded = {
    event,
    source: "corez",
    timestamp: Date.now(),
    payload,
  };

  const timeoutMs = Math.min(
    20000,
    Math.max(1000, Number(env?.N8N_WEBHOOK_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS),
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = { "Content-Type": "application/json" };
    const targetHost = new URL(webhookUrl).host;
    const trustedHost = configuredWebhookHost(env);
    if (env?.N8N_WEBHOOK_SECRET && trustedHost && targetHost === trustedHost) {
      // Shared-secret header so the n8n workflow can verify origin. Only ever
      // sent to the operator-configured host, never to a caller-supplied one.
      headers["X-Corez-Secret"] = String(env.N8N_WEBHOOK_SECRET).slice(0, 256);
    }
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(forwarded),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const text = await res.text().catch(() => "");
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text ? { raw: text.slice(0, 2000) } : null;
    }
    if (!res.ok) {
      return jsonResponse(502, {
        error: `n8n webhook responded HTTP ${res.status}`,
        detail: safeErrorDetail(text).slice(0, 500),
        forwardedTo: webhookUrl,
      });
    }
    return jsonResponse(200, {
      success: true,
      forwardedTo: webhookUrl,
      event,
      n8nResponse: data,
    });
  } catch (e) {
    clearTimeout(timeout);
    const isAbort = e?.name === "AbortError";
    return jsonResponse(isAbort ? 504 : 502, {
      error: isAbort
        ? `n8n webhook timeout after ${timeoutMs}ms`
        : "Failed to reach n8n webhook",
      detail: safeErrorDetail(e).slice(0, 500),
      forwardedTo: webhookUrl,
    });
  }
}
