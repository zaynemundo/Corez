import { handleSearch } from "./search.js";
import { handleStorageMigrate } from "./storageMigrate.js";
import { handleMemory } from "./memory.js";
import { handleRerank, handleEmbed } from "./aiModels.js";
import { handleTranscribe } from "./transcribe.js";
import { handleInspiration } from "./inspiration.js";
import { sessionUid } from "./auth.js";
import { getActiveSubscription } from "./subscriptions.js";
import {
  UsageUnavailableError,
  consumeAllowance,
  estimateTokens,
  limitResponse,
  meteringEnabled,
  normalizePlan,
  periodKey,
  recordUsageOnce,
  usageSummary,
  usageUnavailableResponse,
} from "./usage.js";
import {
  decodePathSegment,
  safeErrorDetail,
  readBoundedJson,
  jsonResponse,
  createTaskStateStore,
} from "./utils.js";
import { resolveOpencodeSessionId } from "./opencodeClient.js";
import {
  selectModelForRequest,
  selectReasoningConfig,
  withVisibleReasoning,
} from "./modelRouter.js";
import {
  normalizeIntentType,
  isGameCreationRequest,
  buildSystemPrompt,
} from "./systemPrompt.js";
import {
  PUBLISH_SLUG_PATTERN,
  PUBLISH_PAGE_PATTERN,
  PUBLISH_SLUG_ROOT_PATTERN,
  PUBLISH_UNPUBLISH_PATH_PATTERN,
  RESERVED_SLUGS,
  scanPublishRecords,
} from "./publishStore.js";
import { handleImage, handleWorkersAIImage } from "./imageRoutes.js";
import { handleR2Assets, handleR2Apps } from "./r2Routes.js";
import { handlePublish } from "./publishRoutes.js";
import {
  handleTitleFastPath,
  tryGreetingOrIdentityFastPath,
  resolveMemoryFastPathAndContext,
} from "./aiFastPaths.js";
import {
  appendAttachmentMetadataMessage,
  resolveLiveGroundingAndSkillContext,
  appendConversationAndInspirationMessages,
} from "./aiContextBuilder.js";
import {
  runHarnessAiExecution,
  runStreamingAiExecution,
  runNonStreamingAiExecution,
} from "./aiExecution.js";

const SAFE_ROOM_ID = /^[a-z0-9][a-z0-9-]{2,31}$/;

async function handleGameSocket(request, env) {
  const pathname = new URL(request.url).pathname;
  const roomId = decodePathSegment(pathname.replace("/api/game/ws/", ""));
  if (!roomId || !SAFE_ROOM_ID.test(roomId)) {
    return jsonResponse(400, {
      error: "Invalid room id: use lowercase letters, digits and dashes.",
    });
  }
  if (!env?.GAME_ROOMS || typeof env.GAME_ROOMS.get !== "function") {
    return jsonResponse(503, { error: "Multiplayer is not configured." });
  }
  if (!/websocket/i.test(request.headers.get("Upgrade") || "")) {
    return jsonResponse(400, { error: "WebSocket upgrade required." });
  }
  // Cross-site WebSocket hijacking guard: browsers always send an Origin
  // header, so a third-party page cannot open sockets into our rooms. The
  // room must originate from this host (or a localhost dev host); CLI
  // tooling without an Origin header remains allowed.
  const origin = request.headers.get("Origin");
  if (origin) {
    let originHost;
    try {
      originHost = new URL(origin).hostname;
    } catch {
      return jsonResponse(403, { error: "Invalid Origin header." });
    }
    const requestHost = new URL(request.url).hostname;
    const isLocalhost = (host) =>
      host === "localhost" || host === "127.0.0.1" || host === "::1";
    if (
      originHost !== requestHost &&
      !(isLocalhost(originHost) && isLocalhost(requestHost))
    ) {
      return jsonResponse(403, {
        error: "Cross-site WebSocket connections are not allowed.",
      });
    }
  }
  const stub = env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(roomId));
  return stub.fetch(request);
}

// Canonical intents ("app", "code-help", "writing", "explanation", "general") live in worker/systemPrompt.js

/**
 * A deep research request: the explicit @research command, or the classifier's
 * research intent. It is a heuristic on purpose — it decides which budget a
 * request draws on, and a missed classification only means the request is
 * counted as an ordinary generation instead of a research report.
 */
function isDeepResearchRequest(prompt, body) {
  if (/^\s*@research\b/i.test(String(prompt || ""))) return true;
  const intents = [body?.intent, body?.fineIntent, body?.fine_intent];
  for (const intent of intents) {
    if (!intent || typeof intent !== "object") continue;
    const primary = String(intent.primaryIntent || intent.type || "").toLowerCase();
    if (primary === "research") return true;
  }
  return false;
}

async function handleAi(request, env) {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
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

  // Who is asking decides the plan and where usage is recorded. Resolved once
  // and reused for the gateway session hint below.
  let uid = null;
  try {
    uid = await sessionUid(request, env);
  } catch {
    uid = null;
  }
  const isTitleRequest = body.titleOnly === true;
  const isHarnessRequest = body.harness === true;
  const contextChars = Array.isArray(body.messages)
    ? body.messages.reduce(
        (total, message) =>
          total + (typeof message?.content === "string" ? message.content.length : 0),
        0,
      )
    : 0;
  const requestTokensEstimate = estimateTokens(prompt) + Math.ceil(contextChars / 4);

  // Token accounting for this request. The estimated tokens are charged
  // atomically at admission (so an unaccounted call can never start); when the
  // provider reports more than the estimate, the difference is reconciled
  // afterwards through an idempotent receipt.
  let reportedTokens = 0;
  const usageReceiptKey = `ai:${uid || "anonymous"}:${periodKey()}:${crypto.randomUUID()}`;
  const tokenAccount = {
    record(tokens) {
      const input = Number(tokens?.inputTokens);
      const output = Number(tokens?.outputTokens);
      if (!Number.isFinite(input) && !Number.isFinite(output)) return;
      const total =
        (Number.isFinite(input) ? input : 0) +
        (Number.isFinite(output) ? output : 0);
      if (total > 0) reportedTokens += total;
    },
    async flush() {
      if (!meteringEnabled(env) || !uid) return false;
      const extra = Math.round(reportedTokens) - requestTokensEstimate;
      if (extra <= 0) return false;
      try {
        const result = await recordUsageOnce(env, uid, {
          key: usageReceiptKey,
          increments: { tokens: extra },
        });
        return Boolean(result.recorded);
      } catch {
        return false;
      }
    },
  };

  // Plan resolution shared by the gate and the metering below.
  const subscription = await getActiveSubscription(env, uid).catch(() => null);
  const plan = normalizePlan(
    subscription?.status === "expired" || subscription?.isExpired
      ? "free"
      : subscription?.plan || "free",
  );

  // Atomic allowance admission before any provider work starts.
  const isResearchRequest = !isTitleRequest && isDeepResearchRequest(prompt, body);
  if (!isTitleRequest) {
    try {
      const admission = await consumeAllowance(env, uid, {
        plan,
        charges: [
          { metric: "messages", amount: 1 },
          ...(isHarnessRequest ? [{ metric: "swarm_runs", amount: 1 }] : []),
          ...(isResearchRequest ? [{ metric: "research_reports", amount: 1 }] : []),
          { metric: "tokens", amount: requestTokensEstimate },
        ],
      });
      if (!admission.ok && admission.reason === "limit") {
        return limitResponse(admission.metric, admission.evaluation, plan);
      }
    } catch (err) {
      if (err instanceof UsageUnavailableError) {
        return usageUnavailableResponse();
      }
      throw err;
    }
  }

  // OpenCode gateway session affinity (required x-opencode-session header).
  let opencodeSessionHint =
    typeof body.opencodeSession === "string" && body.opencodeSession.trim()
      ? body.opencodeSession
      : null;
  if (!opencodeSessionHint && uid) {
    opencodeSessionHint = uid;
  }
  const sessionId = resolveOpencodeSessionId(opencodeSessionHint);

  if (body.titleOnly === true) {
    return handleTitleFastPath({
      request,
      env,
      uid,
      plan,
      requestTokensEstimate,
      prompt,
      sessionId,
      tokenAccount,
      retrySleepFor,
    });
  }

  const greetingOrIdentityResponse = tryGreetingOrIdentityFastPath(body, prompt);
  if (greetingOrIdentityResponse) return greetingOrIdentityResponse;

  const { response: memoryFastPathResponse, memorySystemMessage } =
    await resolveMemoryFastPathAndContext({
      request,
      env,
      body,
      prompt,
    });
  if (memoryFastPathResponse) return memoryFastPathResponse;

  const intent =
    body.intent &&
    typeof body.intent === "object" &&
    !Array.isArray(body.intent)
      ? body.intent
      : null;
  const fineIntent =
    body.fineIntent &&
    typeof body.fineIntent === "object" &&
    !Array.isArray(body.fineIntent)
      ? body.fineIntent
      : null;
  const legacyIntent =
    body.legacyIntent || (typeof intent === "string" ? intent : intent?.type);
  const intentType = normalizeIntentType(legacyIntent || intent?.type);
  const contract =
    body.contract && typeof body.contract === "object" ? body.contract : null;
  const skills = Array.isArray(body.skills) ? body.skills : [];
  const executionPlan =
    typeof body.executionPlan === "string" ? body.executionPlan : null;
  const executionPrompt =
    typeof body.executionPrompt === "string" && body.executionPrompt.trim()
      ? body.executionPrompt.trim()
      : null;

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const lastUserMessage = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role !== "assistant") return messages[i];
    }
    return null;
  })();
  const imageAttachmentsPresent =
    Array.isArray(lastUserMessage?.attachments) &&
    lastUserMessage.attachments.some((a) =>
      String(a?.type || "").toLowerCase().startsWith("image/"),
    );
  const systemPrompt = buildSystemPrompt({
    prompt,
    intent,
    fineIntent,
    legacyIntent,
    skills,
    contract,
    executionPlan,
    attachmentsVisible: imageAttachmentsPresent,
  });
  // Builds system + user message sequence ({ role: "system" }, ..., { role: "user" })
  const apiMessages = [{ role: "system", content: systemPrompt }];
  if (memorySystemMessage) {
    apiMessages.push(memorySystemMessage);
  }

  appendAttachmentMetadataMessage({
    messages,
    body,
    imageAttachmentsPresent,
    apiMessages,
  });

  const { runtimeContext, liveDataNeed, liveDataEvidence } =
    await resolveLiveGroundingAndSkillContext({
      prompt,
      executionPrompt,
      skills,
      env,
      apiMessages,
    });

  const { activeProject } = await appendConversationAndInspirationMessages({
    prompt,
    executionPrompt,
    intent,
    fineIntent,
    legacyIntent,
    intentType,
    skills,
    body,
    messages,
    lastUserMessage,
    imageAttachmentsPresent,
    env,
    apiMessages,
  });

  const clientDisconnectSignal = (() => {
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

  const requestStartedAt = Date.now();

  const selectedModel = selectModelForRequest(
    {
      prompt: executionPrompt || prompt,
      intent,
      fineIntent,
      skills,
      messages: body.messages,
    },
    env,
  );
  const selectedReasoning = selectReasoningConfig(
    {
      prompt: executionPrompt || prompt,
      intent,
      fineIntent,
      skills,
      messages: body.messages,
      complexity: body.complexity || intent?.complexity,
      primaryIntent: intent?.primaryIntent || fineIntent?.primaryIntent,
    },
    env,
  );

  if (body.harness === true) {
    const resolvedPrimary = isGameCreationRequest(prompt, intent, fineIntent)
      ? "game_creation"
      : intent?.primaryIntent ||
        fineIntent?.primaryIntent ||
        fineIntent?.type ||
        intentType;
    const harnessIntentType = [
      "app",
      "game_creation",
      "website_creation",
      "design_task",
    ].includes(resolvedPrimary)
      ? resolvedPrimary
      : intentType;
    const harnessOptions = {
      prompt,
      primaryIntent: resolvedPrimary,
      intentType: harnessIntentType,
      apiMessages,
      env,
      signal: clientDisconnectSignal,
      store: createTaskStateStore(env),
      sleep: retrySleepFor(env),
      sessionId,
      complexity: body.complexity,
      model: selectedModel,
      reasoning: withVisibleReasoning(selectedReasoning.reasoning),
      temperature: selectedReasoning.temperature,
    };
    return runHarnessAiExecution({
      body,
      harnessOptions,
      tokenAccount,
      env,
    });
  }

  if (body.stream === true) {
    return runStreamingAiExecution({
      apiMessages,
      prompt,
      activeProject,
      env,
      clientDisconnectSignal,
      retrySleepFor,
      sessionId,
      selectedModel,
      selectedReasoning,
      skills,
      runtimeContext,
      liveDataEvidence,
      liveDataNeed,
      messages,
      tokenAccount,
      requestStartedAt,
    });
  }

  return runNonStreamingAiExecution({
    apiMessages,
    prompt,
    activeProject,
    env,
    clientDisconnectSignal,
    retrySleepFor,
    sessionId,
    selectedModel,
    selectedReasoning,
    skills,
    runtimeContext,
    liveDataEvidence,
    liveDataNeed,
    messages,
    tokenAccount,
    requestStartedAt,
  });
}

// Test-only sleep override: contract suites drive the worker with real
// fetches and a real clock, so retry backoffs can be collapsed to a fixed
// duration (0 for instant). Unset in production, where backoff runs normally.
function retrySleepFor(env) {
  const overrideMs = Number(env?.__COREZ_RETRY_SLEEP_MS);
  if (!Number.isFinite(overrideMs) || overrideMs < 0) return undefined;
  return () => new Promise((resolve) => setTimeout(resolve, overrideMs));
}

/**
 * GET /api/usage - the numbers behind the settings panel: this month's
 * counters, the plan's limits, and how close each one is.
 */
async function handleUsageApi(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(405, { error: "Method not allowed." });
  }
  const uid = await sessionUid(request, env);
  if (!uid) {
    return jsonResponse(401, { error: "Authentication required." });
  }
  const sub = await getActiveSubscription(env, uid).catch(() => null);
  const plan = normalizePlan(
    sub?.status === "expired" || sub?.isExpired ? "free" : sub?.plan || "free",
  );

  // Published pages are a live gauge, not a monthly counter.
  let publishedPages = null;
  if (env?.ASSET_BUCKET && typeof env.ASSET_BUCKET.list === "function") {
    const { records } = await scanPublishRecords(env);
    publishedPages = records.filter(({ record }) => record?.ownerUserId === uid).length;
  }

  let summary;
  try {
    summary = await usageSummary(env, uid, { plan, publishedPages });
  } catch (err) {
    if (err instanceof UsageUnavailableError) {
      return usageUnavailableResponse();
    }
    throw err;
  }
  return jsonResponse(200, summary);
}

// Application CSP for the SPA (attached to HTML documents served from the
// assets binding).
const APP_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https: https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline' https:",
  "font-src 'self' data: https:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "connect-src 'self' https: wss:",
  "frame-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

const HASHED_BUILD_ASSET_PATTERN =
  /^\/assets\/.+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/;
const HASHED_ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";

// Serve a static asset from the assets binding, attaching the application
// CSP to HTML documents. Non-HTML responses pass through untouched except for
// hashed build artifacts, which get immutable browser caching.
async function serveAssets(request, env) {
  const response = await env.ASSETS.fetch(request);
  const contentType = response.headers.get("content-type") || "";
  const pathname = new URL(request.url).pathname;
  const isHtmlDocument = contentType.includes("text/html");
  const isHashedBuildAsset = HASHED_BUILD_ASSET_PATTERN.test(pathname);
  if (!isHtmlDocument && !isHashedBuildAsset) return response;
  const headers = new Headers(response.headers);
  if (isHtmlDocument) headers.set("Content-Security-Policy", APP_CSP);
  if (isHashedBuildAsset)
    headers.set("Cache-Control", HASHED_ASSET_CACHE_CONTROL);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function runJsonSafe(operation) {
  try {
    return await operation();
  } catch (err) {
    console.error("Storage handler error:", safeErrorDetail(err));
    return jsonResponse(500, { error: "Storage operation failed." });
  }
}

export default {
  async fetch(request, env, ctx = null) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const pathname = new URL(request.url).pathname;
    if (pathname === "/api/ai") {
      return handleAi(request, env);
    }
    if (pathname === "/api/image") {
      // Uses OPENROUTER_API_KEY via worker/imageRoutes.js
      return handleImage(request, env);
    }
    if (pathname === "/api/image/cf") {
      return handleWorkersAIImage(request, env);
    }
    if (pathname === "/api/search") {
      return handleSearch(request, env);
    }
    if (pathname === "/api/rerank") {
      return handleRerank(request, env);
    }
    if (pathname === "/api/embed") {
      return handleEmbed(request, env);
    }
    if (pathname === "/api/transcribe") {
      return handleTranscribe(request, env);
    }
    if (pathname === "/api/inspiration") {
      return handleInspiration(request, env);
    }
    if (pathname === "/api/usage") {
      return runJsonSafe(() => handleUsageApi(request, env));
    }
    if (pathname === "/api/admin/storage-migrate") {
      return runJsonSafe(() => handleStorageMigrate(request, env));
    }
    if (pathname.startsWith("/api/assets")) {
      return runJsonSafe(() => handleR2Assets(request, env));
    }
    if (pathname.startsWith("/api/apps")) {
      return runJsonSafe(() => handleR2Apps(request, env));
    }
    if (pathname.startsWith("/api/memory")) {
      return runJsonSafe(() => handleMemory(request, env));
    }
    if (
      pathname === "/api/publish" ||
      (pathname === "/api/publish/lineage" && request.method === "POST") ||
      (request.method === "GET" &&
        pathname.startsWith("/api/publish/")) ||
      (request.method === "DELETE" &&
        PUBLISH_UNPUBLISH_PATH_PATTERN.test(pathname)) ||
      (request.method === "GET" &&
        !RESERVED_SLUGS.has(pathname.slice(1)) &&
        (PUBLISH_SLUG_PATTERN.test(pathname.slice(1)) ||
          PUBLISH_PAGE_PATTERN.test(pathname.slice(1)) ||
          PUBLISH_SLUG_ROOT_PATTERN.test(pathname)))
    ) {
      return runJsonSafe(() => handlePublish(request, env, ctx, serveAssets));
    }
    if (pathname.startsWith("/api/game/ws/")) {
      return runJsonSafe(() => handleGameSocket(request, env));
    }
    if (pathname.startsWith("/api/")) {
      return jsonResponse(404, { error: "API route not found." });
    }
    return typeof env.ASSETS?.fetch === "function"
      ? serveAssets(request, env)
      : jsonResponse(503, { error: "Static assets not configured." });
  },
};
