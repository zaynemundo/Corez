import { handleSearch } from "./search.js";
import { handleStorageMigrate } from "./storageMigrate.js";
import {
  handleMemory,
  ensureMemoryTables,
  d1StoreMemory,
  d1ListMemories,
  d1DeleteMemory,
  d1UpsertInference,
  getUserAccount,
} from "./memory.js";
import { handleRerank, handleEmbed } from "./aiModels.js";
import { handleTranscribe } from "./transcribe.js";
import { fetchAwwwardsInspirationCached, handleInspiration } from "./inspiration.js";
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
  estimateCostUsd,
} from "./utils.js";
import {
  runProviderChain,
  runStreamingChain,
} from "./providerChain.js";
import { resolveOpencodeSessionId } from "./opencodeClient.js";
import { runCreationHarness } from "./harness.js";
import { repairMalformedHtml } from "./htmlRepair.js";
import {
  selectModelForRequest,
  selectReasoningConfig,
  withVisibleReasoning,
} from "./modelRouter.js";
import {
  processResponse,
  detectTruncation,
  stitchContinuationChunk,
  isMetaOnlyReply,
  CONTINUATION_INSTRUCTION,
  ANTI_REPEAT_CONTINUATION_INSTRUCTION,
} from "./responseProcessor.js";
import { toMultimodalMessage } from "./attachmentVision.js";
import {
  parseProjectState,
  deriveProjectState,
  isFollowUpRequest,
  buildProjectContextSection,
  serializeProjectState,
} from "./projectState.js";
import {
  detectLiveDataNeed,
  buildRuntimeContext,
  buildRuntimeContextBlock,
  runVerificationWithRepair,
} from "./skillVerification.js";
import {
  fixCommonJSInHtml,
  patchLocalImageSrc,
  buildLiveDataDiagnostics,
  buildDataAnalysisContext,
} from "./artifactPostProcess.js";
import {
  normalizeIntentType,
  isGameCreationRequest,
  buildSystemPrompt,
} from "./systemPrompt.js";
import {
  MEMORY_RECALL_PATTERN,
  MEMORY_REMEMBER_PATTERN,
  MEMORY_FORGET_PATTERN,
  MEMORY_SECRET_PATTERN,
  MEMORY_NAME_PATTERN,
  detectInferenceSignals,
  buildMemoryRecallAnswer,
  inferencePercent,
} from "./memoryInference.js";
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
// Deterministic short replies honor the streaming contract exactly like the
// greeting/identity fast-paths: a real SSE stream with one delta for
// streamed requests, JSON otherwise — never a JSON body an SSE parser would
// misread as an empty stream.
function deterministicChatReply(body, text, model) {
  if (body?.stream === true) {
    const encoder = new TextEncoder();
    const sse = (event) => `data: ${JSON.stringify(event)}\n\n`;
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            sse({ type: "meta", provider: "corez", model }),
          ),
        );
        controller.enqueue(encoder.encode(sse({ type: "delta", text })));
        controller.enqueue(
          encoder.encode(
            sse({ type: "done", final: true, projectState: null }),
          ),
        );
        controller.close();
      },
    });
    return new Response(readable, {
      status: 200,
      headers: sseHeaders({ "Access-Control-Allow-Origin": "*" }),
    });
  }
  return jsonResponse(200, {
    content: text,
    model,
  });
}

/**
 * Headers for a Server-Sent Events response.
 *
 * `no-transform` and `X-Accel-Buffering: no` stop intermediaries from buffering
 * a long build into one lump (which the user experiences as a frozen UI), and
 * `Connection: keep-alive` keeps the socket from being reaped mid-stream.
 */
function sseHeaders(extra = {}) {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    ...extra,
  };
}

/**
 * Send an SSE comment while a long provider call is in flight.
 *
 * A build can reason for a minute without emitting a token. With nothing on the
 * wire, mobile networks and proxies are free to treat the connection as dead and
 * drop it — the user then sees a build that "just stopped". A comment line every
 * few seconds keeps it alive, and the client's SSE parser ignores lines that do
 * not start with `data:` so nothing reaches the UI.
 *
 * Interval is overridable for tests (COREZ_HEARTBEAT_MS), the same way retry
 * sleeps are.
 */
function startSseHeartbeat(controller, encoder, env) {
  const configured = Number(env?.COREZ_HEARTBEAT_MS);
  const intervalMs = Number.isFinite(configured) && configured > 0 ? configured : 15000;
  let timer = null;
  try {
    timer = setInterval(() => {
      try {
        controller.enqueue(encoder.encode(": keepalive\n\n"));
      } catch {
        // The stream is already closed (client gone): stop pinging.
        if (timer) clearInterval(timer);
        timer = null;
      }
    }, intervalMs);
  } catch {
    timer = null;
  }
  return () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
}

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
  // afterwards through an idempotent receipt, so a repeated flush can never
  // double-charge. `tokensEstimated` keeps the estimated part visible so the
  // number is never mistaken for billed truth.
  let reportedTokens = 0;
  const usageReceiptKey = `ai:${uid || "anonymous"}:${periodKey()}:${crypto.randomUUID()}`;
  const tokenAccount = {
    record(tokens) {
      const input = Number(tokens?.inputTokens);
      const output = Number(tokens?.outputTokens);
      if (!Number.isFinite(input) && !Number.isFinite(output)) return;
      const total = (Number.isFinite(input) ? input : 0) + (Number.isFinite(output) ? output : 0);
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
        // The estimate was already charged; a failed top-up under-reports the
        // overshoot but never allows unaccounted work or double-charges.
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

  // One user turn is one generation. A harness build also draws on the separate
  // build-run budget, because it is many provider calls rather than one. A deep
  // research request additionally draws on the research budget. All of a
  // request's budgets are charged atomically before any provider work starts:
  // the guarded increments are the check, so two simultaneous requests can
  // never both pass against the same remaining allowance, and a failed charge
  // never leaves the request running unaccounted. Title requests are not
  // generations (they name a chat after the turn) and have their own bounded
  // allowance below.
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
        // The account cannot be charged, so the provider must not run: the
        // client gets a retryable 503 instead of an unaccounted generation.
        return usageUnavailableResponse();
      }
      throw err;
    }
  }

  // OpenCode gateway session affinity (required x-opencode-session header):
  // one id per incoming request — explicit client hint first, then the
  // authenticated user (stable across turns), else a fresh random id. Shared
  // by every provider call in this request (title, chain, repairs, harness)
  // so the gateway routes the whole turn to one backend.
  let opencodeSessionHint =
    typeof body.opencodeSession === "string" && body.opencodeSession.trim()
      ? body.opencodeSession
      : null;
  if (!opencodeSessionHint && uid) {
    opencodeSessionHint = uid;
  }
  const sessionId = resolveOpencodeSessionId(opencodeSessionHint);

  // Title-only fast path: the client asks the model to name a new chat
  // session from its first message. A tiny dedicated system prompt and a
  // strict output cap keep this near-free; failures resolve to title: null
  // so the client falls back to its deterministic heuristic naming.
  // Title generation is billed work, so it draws on its own bounded `titles`
  // allowance (never the generation budget) and an unavailable accounting
  // store stops it before the provider is called.
  // NOTE: the provider is a reasoning model that spends tokens thinking
  // before answering — a 30-token cap was entirely consumed by reasoning
  // (content: ""), so the budget must leave room for the actual title.
  if (body.titleOnly === true) {
    try {
      const titleAdmission = await consumeAllowance(env, uid, {
        plan,
        charges: [
          { metric: "titles", amount: 1 },
          { metric: "tokens", amount: requestTokensEstimate },
        ],
      });
      if (!titleAdmission.ok && titleAdmission.reason === "limit") {
        // A title is optional: the client falls back to heuristic naming
        // instead of failing the chat. Nothing reached the provider.
        return jsonResponse(200, {
          title: null,
          code: "plan_limit",
          metric: titleAdmission.metric,
        });
      }
    } catch (err) {
      if (err instanceof UsageUnavailableError) {
        return usageUnavailableResponse();
      }
      throw err;
    }
    const TITLE_SYSTEM_PROMPT =
      "You name chat conversations. Given the user's first message, reply with ONLY a short descriptive title for the conversation (5 words or fewer, no quotes, no ending punctuation, no markdown, no explanations). Capture the topic or the deliverable the user is asking for.";
    const titleMessages = [
      { role: "system", content: TITLE_SYSTEM_PROMPT },
      { role: "user", content: prompt.slice(0, 400) },
    ];
    try {
      const titleResult = await runProviderChain(titleMessages, {
        env,
        signal: request.signal || null,
        store: null,
        sleep: retrySleepFor(env),
        sessionId,
      });
      tokenAccount.record(titleResult?.usage);
      await tokenAccount.flush();
      let title =
        typeof titleResult?.content === "string"
          ? titleResult.content.trim()
          : "";
      title = title.replace(/^Title:\s*/i, "").trim();
      title = title
        .replace(/^["'\s]+|["'\s]+$/g, "")
        .replace(/[.!?]+$/, "")
        .trim();
      if (title.length > 60) title = title.slice(0, 60).trim();
      if (!title) {
        return jsonResponse(200, { title: null });
      }
      return jsonResponse(200, {
        title,
        model: titleResult?.model || titleResult?.provider || null,
      });
    } catch (err) {
      console.warn(
        "AI session title generation failed (client falls back to heuristic):",
        safeErrorDetail(err),
      );
      return jsonResponse(200, { title: null });
    }
  }

  // Greeting fast-path: common greetings get the mandated persona reply
  // instantly without paying an LLM round-trip. Replies are short, natural
  // variants selected deterministically (no large LLM for tiny requests).
  // The reply honors the streaming contract: a streamed request gets a
  // real SSE stream with one delta, never a JSON body the client's SSE
  // parser would misread as an empty stream.
  const GREETING_PATTERN =
    /^(hi|hello|hey|yo|sup|howdy|greetings|good\s+(morning|afternoon|evening|day)|who\s+(are|r)\s+you|what\s+(are|r)\s+you|whats?\s+(is\s+)?your\s+name)\b[.?!]*$/i;
  if (prompt.length <= 60 && GREETING_PATTERN.test(prompt)) {
    const isIdentityQuestion =
      /who\s+(are|r)\s+you|what\s+(are|r)\s+you|whats?\s+(is\s+)?your\s+name/i.test(
        prompt,
      );
    const greetingReplies = isIdentityQuestion
      ? [
          "I'm COREZ AI — turn ideas into working digital products. What are we building today?",
          "I'm COREZ AI: describe an idea and I'll build it for you. What's the idea?",
        ]
      : [
          "Hey! What are we building today?",
          "Hey there — what should we create?",
          "Hi! What are we building today?",
        ];
    const index =
      [...prompt.toLowerCase()].reduce(
        (acc, char) => acc + char.charCodeAt(0),
        0,
      ) % greetingReplies.length;
    const greetingContent = greetingReplies[index];
    if (body.stream === true) {
      const encoder = new TextEncoder();
      const sse = (event) => `data: ${JSON.stringify(event)}\n\n`;
      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              sse({ type: "meta", provider: "corez", model: "corez-greeting" }),
            ),
          );
          controller.enqueue(
            encoder.encode(sse({ type: "delta", text: greetingContent })),
          );
          controller.enqueue(
            encoder.encode(
              sse({ type: "done", final: true, projectState: null }),
            ),
          );
          controller.close();
        },
      });
      return new Response(readable, {
        status: 200,
        headers: sseHeaders({ "Access-Control-Allow-Origin": "*" }),
      });
    }
    return jsonResponse(200, {
      content: greetingContent,
      model: "corez-greeting",
    });
  }

  // Model identity fast-path: "what model are you using" / "which llm" / "are you DeepSeek" etc.
  // Always answer Corez 1.0 deterministically without paying an LLM round-trip, so the
  // underlying provider (Muse Spark 1.3 Contributor) is never leaked even if the model is tricked.
  // This covers the exact user request: "what model of ai are you using" -> "Corez 1.0".
  const MODEL_IDENTITY_PATTERN =
    /(what|which)\s+(model|llm|ai\s*model|language\s*model).*?\b(you|your|using|power|are\s+you)\b|what\s+model\s+of\s+ai\s+are\s+you\s+using|are\s+you\s+(muse|meta\s*ai|muse\s+spark|gpt|chatgpt|claude|gemini|llama|mimo|deepseek|openai)|which\s+ai\s+are\s+you|powered\s+by.*\b(you|model)\b/i;
  const lowerPrompt = String(prompt || "").toLowerCase();
  const isModelIdentityQuestion =
    MODEL_IDENTITY_PATTERN.test(prompt) ||
    (/what\s+model/i.test(lowerPrompt) &&
      /\b(you|your)\b/i.test(lowerPrompt)) ||
    (/which\s+model/i.test(lowerPrompt) &&
      /\b(you|your)\b/i.test(lowerPrompt)) ||
    /what\s+ai\s+are\s+you/i.test(lowerPrompt) ||
    (/\bpowered\s+by\b/i.test(prompt) && /\b(you|model|ai)\b/i.test(prompt));
  const hasYouReference = /\b(you|your|are you|you're|u are)\b/i.test(prompt);
  const hasModelKeyword =
    /\b(model|muse|gpt|claude|gemini|llama|meta|mimo|deepseek|llm|ai|powered)\b/i.test(
      prompt,
    );
  // "what is the ai engine of corez" has no "you" reference, so the generic
  // gate above misses it — yet it is unambiguously an identity question.
  // Require a Corez/you anchor so legit coding questions ("chess ai engine",
  // "game engine ai") never match.
  const isAiEngineQuestion =
    /ai\s*engine/i.test(prompt) &&
    (/\bcorez\b/i.test(prompt) || hasYouReference);
  const isPoweredByQuestion =
    /\bpowered\s+by\b/i.test(prompt) && hasYouReference;
  if (
    ((isModelIdentityQuestion &&
      hasYouReference &&
      (hasModelKeyword || isPoweredByQuestion)) ||
      isAiEngineQuestion) &&
    prompt.length <= 350
  ) {
    const modelReply =
      "I'm Corez 1.0 built by Corez. How can I help you today?";
    if (body.stream === true) {
      const encoder = new TextEncoder();
      const sse = (event) => `data: ${JSON.stringify(event)}\n\n`;
      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              sse({ type: "meta", provider: "corez", model: "corez-1.0" }),
            ),
          );
          controller.enqueue(
            encoder.encode(sse({ type: "delta", text: modelReply })),
          );
          controller.enqueue(
            encoder.encode(
              sse({ type: "done", final: true, projectState: null }),
            ),
          );
          controller.close();
        },
      });
      return new Response(readable, {
        status: 200,
        headers: sseHeaders({ "Access-Control-Allow-Origin": "*" }),
      });
    }
    return jsonResponse(200, {
      content: modelReply,
      model: "corez-1.0",
    });
  }

  // ---------------------------------------------------------------------
  // User memory fast-path: remember / recall / forget + who-am-I, answered
  // deterministically from D1 with no LLM round-trip (which also keeps
  // these out of the continuation/repair loop). Memory is best-effort:
  // anything unexpected falls through to the normal pipeline — memory
  // must never break chat.
  // ---------------------------------------------------------------------
  let memoryUid = null;
  let memoryAccount = null;
  let memoryFacts = [];
  try {
    if (env?.DB) {
      const uid = await sessionUid(request, env);
      if (uid) {
        memoryUid = uid;
        // The tables only get created on /api/memory/* calls, which chat
        // clients rarely make — so a fresh production DB has no tables at
        // all and every silent list/store would fail. Ensure once per chat
        // request (cheap IF NOT EXISTS) so memory works from day one.
        await ensureMemoryTables(env).catch(() => {});
        const [account, facts] = await Promise.all([
          getUserAccount(env, uid),
          d1ListMemories(env, uid).catch(() => []),
        ]);
        memoryAccount = account;
        memoryFacts = Array.isArray(facts) ? facts.slice(0, 20) : [];
      }
    }
  } catch {
    memoryUid = null;
    memoryFacts = [];
  }

  if (memoryUid) {
    // RECALL: "who am I" / "what do you know about me"
    if (prompt.length <= 350 && MEMORY_RECALL_PATTERN.test(prompt)) {
      return deterministicChatReply(
        body,
        buildMemoryRecallAnswer(memoryAccount, memoryFacts),
        "corez-memory",
      );
    }
    // REMEMBER: "remember that ..." (short explicit commands only, so
    // task text like "remember to close the file" in long prompts is
    // never mistaken for a memory store).
    const rememberMatch =
      prompt.length <= 300 ? prompt.match(MEMORY_REMEMBER_PATTERN) : null;
    if (rememberMatch) {
      const fact = String(rememberMatch[1] || "")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[.?!]+$/, "");
      if (fact && fact.length <= 300) {
        if (MEMORY_SECRET_PATTERN.test(fact)) {
          return deterministicChatReply(
            body,
            "I can't store that — it looks like a secret or credential, and I never memorize those. Tell me something else about yourself instead.",
            "corez-memory",
          );
        }
        try {
          await ensureMemoryTables(env);
          const nameMatch = fact.match(MEMORY_NAME_PATTERN);
          const record = await d1StoreMemory(env, {
            userId: memoryUid,
            key: nameMatch ? "identity.name" : `fact_${Date.now()}`,
            category: nameMatch ? "identity" : "fact",
            text: nameMatch
              ? `User's name is ${nameMatch[1].trim()}`
              : fact,
          });
          return deterministicChatReply(
            body,
            `Got it — I'll remember that: ${record.text}`,
            "corez-memory",
          );
        } catch (err) {
          console.warn(
            "COREZ memory store failed (falling through to chat):",
            safeErrorDetail(err),
          );
        }
      }
    }
    // FORGET: "forget ..." / "forget everything"
    const forgetMatch =
      prompt.length <= 350 ? prompt.match(MEMORY_FORGET_PATTERN) : null;
    if (forgetMatch) {
      const target = String(forgetMatch[1] || "")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[.?!]+$/, "");
      if (target) {
        try {
          if (
            /^(everything|all|all of it|everything you know( about me)?|what you know about me|my memories)$/i.test(
              target,
            )
          ) {
            const count = memoryFacts.length;
            for (const f of memoryFacts) {
              await d1DeleteMemory(env, {
                userId: memoryUid,
                key: f.key,
              }).catch(() => {});
            }
            return deterministicChatReply(
              body,
              count > 0
                ? `Done — I forgot everything I knew about you (${count} ${count === 1 ? "memory" : "memories"} removed).`
                : "There's nothing stored about you, so nothing to forget.",
              "corez-memory",
            );
          }
          const words = target
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter((w) => w.length > 2);
          const hits = memoryFacts.filter((f) => {
            const haystack =
              `${f.key} ${f.text} ${f.category}`.toLowerCase();
            return words.some((w) => haystack.includes(w));
          });
          if (hits.length === 0) {
            return deterministicChatReply(
              body,
              `I don't have anything stored about "${target}".`,
              "corez-memory",
            );
          }
          for (const h of hits) {
            await d1DeleteMemory(env, {
              userId: memoryUid,
              key: h.key,
            }).catch(() => {});
          }
          return deterministicChatReply(
            body,
            `Forgot ${hits.length === 1 ? "this" : `these ${hits.length}`}:\n` +
              hits.map((h) => `- ${h.text}`).join("\n"),
            "corez-memory",
          );
        } catch (err) {
          console.warn(
            "COREZ memory delete failed (falling through to chat):",
            safeErrorDetail(err),
          );
        }
      }
    }
    // Interest profiler: behavioral signals accumulate confidence silently
    // (visible anytime via recall). Runs only for ordinary prompts — the
    // command handlers above already returned.
    if (prompt.length <= 2000) {
      try {
        const signals = detectInferenceSignals(prompt);
        if (signals.length > 0) {
          await Promise.all(
            signals.map((s) =>
              d1UpsertInference(env, {
                userId: memoryUid,
                key: s.key,
                text: s.text,
                topic: s.topic,
              }).catch(() => {}),
            ),
          );
          const fresh = await d1ListMemories(env, memoryUid).catch(
            () => null,
          );
          if (Array.isArray(fresh)) memoryFacts = fresh.slice(0, 20);
        }
      } catch {
        // Inference must never break chat.
      }
    }
  }

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
  // The client-computed execution prompt carries the design spec (Awwwards
  // principles, layout rules, code format). It must reach the model: it
  // replaces the bare user prompt when present.
  const executionPrompt =
    typeof body.executionPrompt === "string" && body.executionPrompt.trim()
      ? body.executionPrompt.trim()
      : null;

  const messages = Array.isArray(body.messages) ? body.messages : [];
  // Vision for the CURRENT turn only: the latest user message is the one the
  // user just sent, so its images travel as real `input_image` pixels. Older
  // attachments in the history stay metadata + R2 URL text: re-sending them
  // would make the gateway re-download every old asset on every follow-up
  // (and a deleted asset 400s the whole request with "failed to download
  // media", observed live). Capability verified live on the gateway's
  // Responses API — Muse Spark 1.3 Contributor read randomized striped-color
  // images correctly through this exact pipeline. Video/audio never send bytes.
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
  const apiMessages = [{ role: "system", content: systemPrompt }];

  // Known-user grounding: the verified account plus remembered facts travel
  // with every request so the model answers the owner about themselves
  // ("my name", "my plan", preferences) instead of claiming amnesia. This
  // block is private context — the system prompt already forbids pasting it
  // into generated artifacts unless explicitly asked.
  if (memoryUid && (memoryAccount?.email || memoryFacts.length > 0)) {
    const explicitFacts = memoryFacts.filter(
      (f) => f?.category !== "inference",
    );
    const inferences = memoryFacts.filter(
      (f) => f?.category === "inference",
    );
    const strong = inferences
      .filter((f) => inferencePercent(f) >= 70)
      .slice(0, 6);
    const weak = inferences
      .filter((f) => inferencePercent(f) < 70)
      .slice(0, 4);
    const factLines = explicitFacts
      .slice(0, 12)
      .map((f) => `- ${f.text} [${f.category}]`);
    const strongLines = strong.map(
      (f) => `- ${f.text} [~${inferencePercent(f)}% confidence]`,
    );
    const weakLines = weak.map(
      (f) => `- ${f.text} [~${inferencePercent(f)}% — possible, do NOT assert as fact]`,
    );
    apiMessages.push({
      role: "system",
      content:
        `User account & remembered facts (private — describes the logged-in account owner; you may answer the owner ABOUT themselves when asked, but NEVER paste this into generated code, artifacts, emails, posts, or published pages unless explicitly asked):\n` +
        `- Logged in as: ${memoryAccount?.email || "unknown"} (plan: ${memoryAccount?.plan || "free"})\n` +
        (factLines.length > 0
          ? `- Remembered facts:\n${factLines.join("\n")}`
          : `- Remembered facts: none yet`) +
        (strongLines.length > 0
          ? `\n- Likely about the user (repeated behavior — you may tune answers to this):\n${strongLines.join("\n")}`
          : "") +
        (weakLines.length > 0
          ? `\n- Weak guesses (single sightings — use lightly, never state as fact):\n${weakLines.join("\n")}`
          : ""),
    });
  }

  // ---------------------------------------------------------------------
  // Skill Verification Layer — runtime context + live-data grounding.
  // Requests that need fresh external data (currency, weather, research
  // with citations) are grounded in a REAL web search BEFORE generation so
  // the model answers from evidence, never from memory. A search failure is
  // honest: no live evidence is injected and the verifier flags answers
  // that still present current values as fabricated.
  // ---------------------------------------------------------------------
  // ---------------------------------------------------------------------
  // Attachment metadata block.
  //
  // Image attachments are sent to the model as real vision input (input_image
  // parts built in worker/attachmentVision.js; verified live against the
  // gateway's Responses API), while every attachment ALSO gets a metadata hint
  // here: kind, name, size, and the authoritative R2 URL to use in markup.
  // Video and audio never send pixel/stream bytes — metadata only — and the
  // system block below states which of the two cases applies for this request
  // so the model never invents a description of something it cannot see.
  // Covers: image/*, video/*, audio/*, pdf, text, and generic files.
  // ---------------------------------------------------------------------
  {
    try {
      const allAttachments = [];
      const seenAttachments = new Set();
      const collectAttachments = (list) => {
        for (const a of Array.isArray(list) ? list : []) {
          const key = String(
            a?.assetUrl || a?.thumb || a?.name + "|" + a?.type || "",
          );
          if (!key || seenAttachments.has(key)) continue;
          seenAttachments.add(key);
          if (
            a?.thumb ||
            a?.assetUrl ||
            (typeof a?.content === "string" && a.content.trim()) ||
            a?.type
          ) {
            allAttachments.push(a);
          }
        }
      };
      for (const m of Array.isArray(messages) ? messages : []) {
        collectAttachments(m?.attachments);
      }
      collectAttachments(body?.attachments);

      if (allAttachments.length > 0) {
        const directAssetHints = allAttachments
          .map((a) => {
            const mime = String(a.type || "").toLowerCase();
            const kind = mime.startsWith("image/")
              ? "image"
              : mime.startsWith("video/")
                ? "video"
                : mime.startsWith("audio/")
                  ? "audio"
                  : "file";
            const hasR2 =
              a?.assetUrl && String(a.assetUrl).includes("/api/assets/");
            const hasThumb =
              a?.thumb && String(a.thumb).startsWith("data:");
            const hasContent =
              typeof a?.content === "string" && a.content.trim();
            const sizeHint = a.size ? " (" + (a.size / 1024).toFixed(1) + "KB)" : "";
            if (hasR2) {
              const raw = String(a.assetUrl);
              const absoluteUrl = raw.startsWith("http")
                ? raw
                : "https://corez.pro" + (raw.startsWith("/") ? "" : "/") + raw;
              return `[Attached ${kind} "${a.name}"${sizeHint} R2 URL: ${absoluteUrl} - USE THIS EXACT URL (must start with https://corez.pro/api/assets/) for <img>/<video>/<audio> src, never hallucinate a local filename like "${a.name}"]`;
            }
            if (hasThumb) {
              return (
                '[Attached ' + kind + ' "' + a.name + '"' + sizeHint +
                " available as a data URL thumb - for <img src> use the data URL when no R2 URL exists]"
              );
            }
            if (hasContent) {
              return (
                '[Attached file "' + a.name + '"' + sizeHint +
                " has extracted text content (" + a.content.length + " chars) supplied separately]"
              );
            }
            return (
              '[Attached ' + kind + ' "' + a.name + '" (' + (mime || "unknown") + ")" +
              sizeHint + " - metadata only]"
            );
          })
          .filter(Boolean)
          .join("\n");
        if (directAssetHints) {
          apiMessages.push({
            role: "system",
            content: imageAttachmentsPresent
              ? "Attached media (images ARE visible to you — their pixels are supplied; video and audio are metadata only):\n" +
                directAssetHints +
                "\nUse the exact URLs above for markup. Image attachments are readable: describe, analyse and recreate them directly. Video and audio content is NOT available to you — if asked about those, say plainly that you cannot see the stream. Extracted text content, when present, is supplied elsewhere in this conversation and may be used normally."
              : "Attached media (metadata only - you cannot see image, video or audio content):\n" +
                directAssetHints +
                "\nThese files exist and their URLs are authoritative for markup. Their visual content is NOT available to you. If the user asks you to describe, analyse, OCR or recreate an attachment, say plainly that you cannot see the file and ask them to describe it or paste the relevant text - never invent a description, and never produce a generic layout/typography/colour template as if you had seen it. Extracted text content, when present, is supplied elsewhere in this conversation and may be used normally.",
          });
        }
      }
    } catch (attachmentErr) {
      console.warn(
        "Attachment metadata block failed (continuing):",
        attachmentErr?.message || attachmentErr,
      );
    }
  }

  const runtimeContext = buildRuntimeContext();
  const liveDataNeed = detectLiveDataNeed(executionPrompt || prompt);
  const specialistIds = Array.isArray(skills)
    ? skills.map((s) => (typeof s === "string" ? s : s.id)).filter(Boolean)
    : [];
  if (specialistIds.includes("data-analysis")) {
    const dataContext = buildDataAnalysisContext(executionPrompt || prompt);
    if (dataContext) apiMessages.push({ role: "system", content: dataContext });
  }
  const needsGrounding =
    liveDataNeed.required || specialistIds.includes("research-report");
  let liveDataEvidence = null;
  if (needsGrounding && env?.__DISABLE_LIVE_GROUNDING !== "true") {
    apiMessages.push({
      role: "system",
      content: buildRuntimeContextBlock(runtimeContext),
    });
    try {
      const searchRequest = new Request("https://corez.test/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: executionPrompt || prompt,
          detail: true,
        }),
      });
      const searchResult = await handleSearch(searchRequest, env);
      if (searchResult.ok) {
        const data = await searchResult.json();
        if (Array.isArray(data?.results) && data.results.length > 0) {
          liveDataEvidence = {
            servedAt: data.meta?.servedAt || new Date().toISOString(),
            fetchedAt: new Date().toISOString(),
            sources: Array.isArray(data.meta?.sources)
              ? data.meta.sources
              : ["web-search"],
            results: data.results,
            maxAgeMs: 12 * 60 * 60 * 1000,
          };
          const snippets = data.results
            .slice(0, 8)
            .map(
              (r) =>
                `- ${r.title} | ${r.url} | ${String(r.snippet || "").slice(0, 300)}${r.extract ? ` | ${String(r.extract).slice(0, 1200)}` : ""}`,
            )
            .join("\n");
          // Enumerated live-data kinds are STRICT: the answer must come only
          // from the search results. The fuzzy kinds ('freshness' and
          // 'media-releases') are SOFT: results are used when they answer the
          // question, otherwise the model answers from knowledge and notes it
          // could not verify — a miss degrades gracefully instead of forcing
          // a refusal.
          const softLiveKinds = new Set(["freshness", "media-releases"]);
          const liveInstruction = liveDataNeed.required
            ? softLiveKinds.has(liveDataNeed.kind)
              ? `This request may need CURRENT data (${liveDataNeed.kind}). Use the search results below when they contain current information for the request, and cite the source URLs you used. If the results do NOT answer the question, answer from your knowledge and note that you could not verify current information.`
              : `This request needs CURRENT data (${liveDataNeed.kind}). Answer ONLY from the search results below; state the source URL and timestamp. NEVER use remembered values. If the results do not contain the current value, say clearly that live data could not be retrieved.`
            : `Use the search results below as the research evidence for your answer. Cite the actual source URLs. Do NOT invent citations or claims not supported by these results.`;
          apiMessages.push({
            role: "system",
            content: `${liveInstruction}\n\nLive search results (fetched at ${liveDataEvidence.fetchedAt}):\n${snippets}`,
          });
        }
      }
    } catch (err) {
      console.warn(
        "Live grounding search failed (request continues without live evidence):",
        safeErrorDetail(err),
      );
    }
  }

  // Fast path for general intents: explanations, writing, and casual chat are
  // answered from the last few turns only, so they come back quickly. Coding,
  // app, and game requests keep the FULL history. NO output caps exist
  // anywhere: every provider call runs uncapped, so reasoning models can think
  // as long as they need and deliverables are never cut off mid-generation.
  const primaryIntent = intent?.primaryIntent || legacyIntent || intentType;
  const specialistSkills =
    Array.isArray(skills) && skills.length > 0
      ? skills.map((s) => (typeof s === "string" ? s : s.id)).filter(Boolean)
      : [];
  const isFastIntent =
    ["explanation", "general", "writing"].includes(intentType) &&
    ![
      "bug_fix",
      "code_refactor",
      "feature_implementation",
      "simple_edit",
      "code_question",
      "app",
      "website_creation",
      "game_creation",
      "design_task",
    ].includes(primaryIntent) &&
    intentType !== "app" &&
    specialistSkills.length === 0;
  const fastHistoryWindow = Math.max(
    2,
    Math.min(8, body.fastHistoryWindow || 8),
  );

  const fastMessages = isFastIntent
    ? messages.filter((m) => m.role && m.content).slice(-fastHistoryWindow)
    : messages;

  // Live Awwwards inspiration for app/site requests: real award-winning
  // site references (title + URL) are injected into the system prompt so the
  // model has concrete visual direction. Best-effort: failure never blocks
  // the request and never fabricates references.
  const appIntent = intent?.type === "app" || legacyIntent === "app";
  const gameIntent = isGameCreationRequest(prompt, intent, fineIntent);
  if (appIntent && !gameIntent) {
    try {
      const inspiration = await fetchAwwwardsInspirationCached(
        env,
        prompt,
        env?.__INSPIRATION_FETCH || fetch,
      );
      if (Array.isArray(inspiration?.sites) && inspiration.sites.length > 0) {
        const refs = inspiration.sites
          .map((site) => {
            let line = `- ${site.title} — ${site.url}`;
            if (site.liveUrl) line += ` (Live site: ${site.liveUrl})`;
            if (site.description)
              line += `\n  Design approach: ${site.description}`;
            if (site.tags && site.tags.length > 0)
              line += `\n  Visual elements: ${site.tags.join(", ")}`;
            return line;
          })
          .join("\n\n");
        apiMessages.push({
          role: "system",
          content: `Live design inspiration (${inspiration.category} category):\n${refs}\n\nUse these award-winning sites as visual references for layout, typography, colour, and interaction quality. Use them as design direction. NEVER mention "Awwwards" or "Awwwards-inspired" in your response text to the user.`,
        });
      }
    } catch (error) {
      console.warn(
        "Awwwards inspiration fetch failed (request continues):",
        safeErrorDetail(error),
      );
    }
  }

  let hasAppendedPrompt = false;
  for (const m of fastMessages) {
    if (m.role && m.content) {
      const converted = toMultimodalMessage(
        {
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
          attachments: m.attachments,
        },
        // Pixels only for the current turn's message (the one the user just
        // sent); assistant turns and older history stay text/metadata. See the
        // current-turn note above and worker/attachmentVision.js.
        { vision: imageAttachmentsPresent && m === lastUserMessage },
      );
      apiMessages.push(converted);
      const contentStr =
        typeof m.content === "string"
          ? m.content
          : Array.isArray(m.content)
            ? JSON.stringify(m.content)
            : String(m.content || "");
      const targetPrompt = executionPrompt || prompt;
      if (
        m.role === "user" &&
        typeof targetPrompt === "string" &&
        contentStr.includes(
          targetPrompt.slice(0, Math.min(80, targetPrompt.length)),
        )
      ) {
        hasAppendedPrompt = true;
      } else if (
        m.role === "user" &&
        contentStr.includes(prompt.slice(0, Math.min(80, prompt.length)))
      ) {
        hasAppendedPrompt = true;
      }
    }
  }

  if (!hasAppendedPrompt) {
    apiMessages.push({ role: "user", content: executionPrompt || prompt });
  }

  // State-aware follow-ups: build/merge lightweight project memory so a
  // modification request edits the existing implementation instead of
  // regenerating it. The client may send persisted state (body.project); the
  // worker also derives it deterministically from the conversation when the
  // client did not.
  const clientProject = parseProjectState(body.project);
  const derivedProject = deriveProjectState(messages);
  const activeProject = clientProject || derivedProject;
  const isFollowUp = isFollowUpRequest(prompt, activeProject);
  if (isFollowUp && activeProject) {
    apiMessages.push({
      role: "system",
      content: buildProjectContextSection(activeProject, prompt),
    });
  }

  // Provider chain: OpenCode Go only — the single approved text gateway
  // (worker/providerChain.js owns retry scheduling and the resume contract).
  // There is no DeepSeek-direct or OpenRouter text fallback; a failure fails
  // honestly with an explicit SSE error event. The same messages travel
  // to every provider, so a fallback resumes the same task — completed work
  // is never restarted.
  //
  // Generations run uncapped (no output ceilings): the provider decides how
  // long it generates. The only hard time limits are the per-provider
  // deadline guards in providerChain.js (first-token / mid-stream silence /
  // non-stream total) and the harness total budget — both fail loudly with an
  // SSE error event instead of letting a hung upstream get killed by the
  // platform wall-clock limit, which truncated the stream silently and made
  // the client report "Hosted AI returned no streamed content."
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

  // Creation Harness: plan -> build -> verify -> repair -> review, with
  // durable R2 state so a disconnected build resumes. Replaces the single
  // generation for creation requests; SSE events (phase/delta/done) keep the
  // client informed while the loop takes as long as it needs. Game requests
  // resolve to game_creation (prompt-based, same rule as the system prompt)
  // so the harness takes the simple one-pass game path.
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
      // The build stream renders its reasoning as a live thinking panel, so
      // the provider must return it. Spec/review calls keep exclude:true.
      reasoning: withVisibleReasoning(selectedReasoning.reasoning),
      temperature: selectedReasoning.temperature,
    };
    if (body.stream === true) {
      // Streaming harness: SSE events (phase/delta/done) keep the client
      // informed while the loop takes as long as it needs.
      const encoder = new TextEncoder();
      const sse = (event) => `data: ${JSON.stringify(event)}\n\n`;
      const readable = new ReadableStream({
        async start(controller) {
          const stopHeartbeat = startSseHeartbeat(controller, encoder, env);
          try {
            for await (const event of runCreationHarness(harnessOptions)) {
              // A build is many provider calls: capture the reported usage on
              // the diagnostics event so the token counter reflects it.
              if (event.type === "diagnostics") {
                tokenAccount.record(
                  event.diagnostics?.usage?.total ||
                    event.diagnostics?.usage?.initial ||
                    event.diagnostics?.usage,
                );
                await tokenAccount.flush();
              }
              controller.enqueue(encoder.encode(sse(event)));
            }
          } catch (err) {
            const payload = {
              type: "error",
              message: err?.retryable
                ? err.message
                : `Creation harness failed: ${safeErrorDetail(err)}`,
              status: err?.status || 502,
              ...(err?.retryable ? { retryable: true } : {}),
            };
            controller.enqueue(encoder.encode(sse(payload)));
          }
          stopHeartbeat();
          controller.close();
        },
      });
      return new Response(readable, {
        status: 200,
        headers: sseHeaders({ "Access-Control-Allow-Origin": "*" }),
      });
    }

    // Non-streaming harness: run the ENTIRE build loop (plan -> build ->
    // verify -> repair -> review) inside this request, then answer with the
    // finished artifact in a single JSON body. The client waits until the
    // build is done — no live deltas. The generator replays the persisted
    // terminal artifact on re-issue, so interrupted builds still resume.
    try {
      let content = "";
      let projectState = null;
      let diagnostics = null;
      for await (const event of runCreationHarness(harnessOptions)) {
        if (event.type === "clear") {
          content = "";
        } else if (event.type === "delta" && typeof event.text === "string") {
          content += event.text;
        } else if (event.type === "done") {
          projectState = event.projectState ?? projectState;
        } else if (event.type === "diagnostics") {
          diagnostics = event.diagnostics;
          tokenAccount.record(
            event.diagnostics?.usage?.total ||
              event.diagnostics?.usage?.initial ||
              event.diagnostics?.usage,
          );
          await tokenAccount.flush();
        }
      }
      return jsonResponse(200, { content, projectState, diagnostics });
    } catch (err) {
      if (err?.status === 499) {
        return jsonResponse(499, { error: "AI request cancelled." });
      }
      return jsonResponse(err?.status || 502, {
        error: err?.retryable
          ? err.message
          : `Creation harness failed: ${safeErrorDetail(err)}`,
        ...(err?.retryable ? { retryable: true } : {}),
      });
    }
  }

  // Streaming path: SSE through provider -> worker -> client, so the user
  // sees content quickly (TTFT is a headline UX metric). The stream is
  // validated after completion and repaired before the final done event.
  if (body.stream === true) {
    const chainOptions = {
      env,
      signal: clientDisconnectSignal,
      // Collapsible backoff for tests (__COREZ_RETRY_SLEEP_MS); real sleep
      // in production so transient retries actually ride out the blip.
      sleep: retrySleepFor(env),
      sessionId,
      model: selectedModel,
      // Streaming chat shows the reasoning as a live thinking panel, so the
      // provider must return it rather than discard it server-side.
      reasoning: withVisibleReasoning(selectedReasoning.reasoning),
      temperature: selectedReasoning.temperature,
    };
    const encoder = new TextEncoder();
    const sse = (event) => `data: ${JSON.stringify(event)}\n\n`;
    const readable = new ReadableStream({
      async start(controller) {
        let collected = "";
        let providerId = null;
        let providerModel = null;
        let inputTokens = null;
        let outputTokens = null;
        const stopHeartbeat = startSseHeartbeat(controller, encoder, env);
        try {
          for await (const event of runStreamingChain(
            apiMessages,
            chainOptions,
          )) {
            if (event.type === "delta") {
              collected += event.text;
              controller.enqueue(encoder.encode(sse(event)));
            } else if (event.type === "thinking") {
              // The model's (redacted) reasoning: a live progress signal the
              // client renders as a thinking panel. It is never part of the
              // answer, so `collected` stays content-only.
              controller.enqueue(encoder.encode(sse(event)));
            } else if (event.type === "meta") {
              providerId = providerId || event.provider || null;
              providerModel = providerModel || event.model || null;
              controller.enqueue(encoder.encode(sse(event)));
            } else if (event.type === "usage") {
              inputTokens = event.inputTokens ?? inputTokens;
              outputTokens = event.outputTokens ?? outputTokens;
            } else if (event.type === "done") {
              providerId = providerId || event.provider || null;
              providerModel = providerModel || event.model || null;

              // Streaming auto-continuation: if output ended mid-generation (token limit, unclosed blocks)
              let continuationCount = 0;
              const MAX_STREAM_CONTINUATIONS = 8;
              let currentStopReason = event.finishReason || null;
              let antiRepeatTried = false;
              while (
                continuationCount < MAX_STREAM_CONTINUATIONS &&
                collected.trim()
              ) {
                const streamTruncation = detectTruncation(collected, {
                  stopReason: currentStopReason,
                });
                if (!streamTruncation.truncated) break;
                continuationCount += 1;
                controller.enqueue(
                  encoder.encode(
                    sse({
                      type: "phase",
                      phase: "continuing",
                      attempt: continuationCount,
                      total: MAX_STREAM_CONTINUATIONS,
                    }),
                  ),
                );

                // If the previous continuation repeated the beginning instead
                // of continuing, switch to an explicit anti-repetition
                // instruction.
                const streamContMessages = [
                  ...apiMessages,
                  { role: "assistant", content: collected },
                  {
                    role: "user",
                    content: antiRepeatTried
                      ? ANTI_REPEAT_CONTINUATION_INSTRUCTION
                      : CONTINUATION_INSTRUCTION,
                  },
                ];

                let contChunk = "";
                let nextStopReason = null;
                try {
                  for await (const contEvent of runStreamingChain(
                    streamContMessages,
                    chainOptions,
                  )) {
                    if (contEvent.type === "delta") {
                      contChunk += contEvent.text;
                    } else if (
                      contEvent.type === "usage" &&
                      contEvent.outputTokens
                    ) {
                      outputTokens =
                        (outputTokens || 0) + contEvent.outputTokens;
                    } else if (contEvent.type === "done") {
                      nextStopReason = contEvent.finishReason || null;
                    }
                  }
                } catch {
                  break;
                }

                if (!contChunk.trim()) break;
                // A continuation that only narrates completion ("All tags are
                // properly closed...", "No further lines to add...") carries no
                // missing content: stop continuing and never stream the noise
                // after the deliverable.
                if (isMetaOnlyReply(contChunk)) break;
                const { stitched, deltaText, restarted } =
                  stitchContinuationChunk(collected, contChunk);
                if (deltaText) {
                  controller.enqueue(
                    encoder.encode(sse({ type: "delta", text: deltaText })),
                  );
                }
                if (restarted || stitched.length <= collected.length) {
                  // The model restarted from the beginning instead of
                  // continuing (restarted) or emitted nothing new: give it
                  // ONE retry with the anti-repetition instruction before
                  // giving up on this pass. Nothing duplicated was streamed:
                  // restarted chunks carry an empty deltaText.
                  if (!antiRepeatTried) {
                    antiRepeatTried = true;
                    continue;
                  }
                  break;
                }
                collected = stitched;
                currentStopReason = nextStopReason;
              }

              // Post-stream validation: truncation/language repair.
              const repairUsage = [];
              const repair = await processResponse(apiMessages, collected, {
                userPrompt: prompt,
                project: activeProject,
                stopReason: currentStopReason,
                generate: async (repairMessages) => {
                  const repaired = await runProviderChain(repairMessages, {
                    env,
                    signal: clientDisconnectSignal,
                    store: createTaskStateStore(env),
                    sleep: retrySleepFor(env),
                    sessionId,
                    model: selectedModel,
                    reasoning: selectedReasoning.reasoning,
                    temperature: selectedReasoning.temperature,
                  });
                  if (repaired?.usage) repairUsage.push(repaired.usage);
                  return repaired.content ? repaired : null;
                },
                maxRepairs: 4,
              });
              if (
                repair.diagnostics.repaired &&
                repair.diagnostics.repairReasons.length > 0
              ) {
                controller.enqueue(
                  encoder.encode(
                    sse({
                      type: "validation",
                      action: "repaired",
                      reasons: repair.diagnostics.repairReasons,
                    }),
                  ),
                );
                const appended = repair.content.slice(collected.length);
                if (appended) {
                  controller.enqueue(
                    encoder.encode(sse({ type: "delta", text: appended })),
                  );
                }
                collected = repair.content;
              }

              // Deterministic fix before honest gate: close truncated tags (htmlRepair)
              if (repair.diagnostics.truncationDetected) {
                const repairedStream = repairMalformedHtml(collected);
                if (repairedStream !== collected) {
                  const delta = repairedStream.slice(collected.length);
                  if (delta) {
                    controller.enqueue(
                      encoder.encode(sse({ type: "delta", text: delta })),
                    );
                  }
                  collected = repairedStream;
                  const re = detectTruncation(collected, {
                    stopReason: currentStopReason,
                  });
                  if (!re.truncated) {
                    repair.diagnostics.truncationDetected = false;
                    repair.diagnostics.truncationSignals = [];
                  }
                }
              }

              // Honest-failure gate: if the answer is STILL cut off after the
              // provider stream, streaming continuations, and every repair
              // round, surface an explicit error instead of a clean "done"
              // over truncated content (the client would otherwise render a
              // reply that just stops mid-way).
              if (repair.diagnostics.truncationDetected) {
                const signals = (repair.diagnostics.truncationSignals || [])
                  .slice(0, 3)
                  .join(", ");
                controller.enqueue(
                  encoder.encode(
                    sse({
                      type: "error",
                      message: signals
                        ? `The AI reply was cut off (${signals}) and could not be completed automatically. Please try again.`
                        : "The AI reply was cut off and could not be completed automatically. Please try again.",
                      status: 502,
                    }),
                  ),
                );
                controller.close();
                return;
              }

              // Safety-net: replace local filename image src with attached data URL if model hallucinated
              const verificationRaw = runVerificationWithRepair({
                prompt,
                content: repair.content,
                skills,
                runtimeContext,
                liveDataEvidence,
                searchEvidence: liveDataEvidence,
              });
              const patchedImage = patchLocalImageSrc(verificationRaw.content, [
                ...messages,
                ...apiMessages,
              ]);
              const fixedJs = fixCommonJSInHtml(patchedImage);
              const finalPatched =
                fixedJs !== patchedImage ? fixedJs : patchedImage;
              const verificationContentPatched = finalPatched;
              const verification =
                verificationRaw.content !== verificationContentPatched
                  ? { ...verificationRaw, content: verificationContentPatched }
                  : verificationRaw;
              const finalContent = verification.content;
              if (finalContent !== collected) {
                const appended = finalContent.slice(collected.length);
                if (appended) {
                  controller.enqueue(
                    encoder.encode(sse({ type: "delta", text: appended })),
                  );
                }
                collected = finalContent;
              }
              const returnedProject =
                activeProject ||
                deriveProjectState([
                  { role: "assistant", content: finalContent },
                ]);
              if (!finalContent.trim()) {
                // Nothing was produced after the provider stream, nudges,
                // retries, and repair: report the real failure instead of a
                // contentless success, so the client can surface the reason.
                controller.enqueue(
                  encoder.encode(
                    sse({
                      type: "error",
                      message:
                        "The AI provider returned no content for this request after retries. Please try again.",
                      status: 502,
                    }),
                  ),
                );
                controller.close();
                return;
              }
              const streamTotalInput = [inputTokens, ...repairUsage.map((u) => u.inputTokens)]
                .filter((n) => Number.isFinite(n) && n !== null)
                .reduce((a, b) => a + b, 0);
              const streamTotalOutput = [outputTokens, ...repairUsage.map((u) => u.outputTokens)]
                .filter((n) => Number.isFinite(n) && n !== null)
                .reduce((a, b) => a + b, 0);
              // Meter the provider's reported usage for this streamed turn.
              tokenAccount.record({
                inputTokens: streamTotalInput,
                outputTokens: streamTotalOutput,
              });
              await tokenAccount.flush();
              controller.enqueue(
                encoder.encode(
                  sse({
                    type: "done",
                    final: true,
                    projectState: serializeProjectState(returnedProject),
                  }),
                ),
              );
              controller.enqueue(
                encoder.encode(
                  sse({
                    type: "diagnostics",
                    diagnostics: {
                      ...repair.diagnostics,
                      ttftMs: event.ttftMs || 0,
                      totalMs: Date.now() - requestStartedAt,
                      provider: providerId,
                      model: providerModel,
                      inputTokens,
                      outputTokens,
                      verification: {
                        results: verification.results,
                        hardFailures: verification.hardFailures,
                        passed: verification.passed,
                        repairAttempts: verification.repairAttempts,
                        latencyMs: verification.latencyMs,
                      },
                      liveData: buildLiveDataDiagnostics(
                        liveDataEvidence,
                        liveDataNeed,
                        verification,
                      ),
                      usage: {
                        initial: { inputTokens, outputTokens },
                        repairs: repairUsage,
                        total: {
                          inputTokens: streamTotalInput,
                          outputTokens: streamTotalOutput,
                        },
                        estimatedCostUsd: estimateCostUsd(
                          streamTotalInput,
                          streamTotalOutput,
                          env,
                        ),
                      },
                      latency: {
                        routingMs: 0,
                        providerMs: event.totalMs || 0,
                        verificationMs: verification.latencyMs,
                        repairMs: 0,
                        totalMs: Date.now() - requestStartedAt,
                      },
                    },
                  }),
                ),
              );
              controller.close();
              return;
            } else if (event.type === "error") {
              controller.enqueue(encoder.encode(sse(event)));
              controller.close();
              return;
            }
          }
          // Belt-and-braces: the provider chain always ends with a terminal
          // event, but if it ever ends here without content, report an
          // explicit error instead of a bare done with zero deltas (which the
          // client would misread as "no streamed content").
          if (!collected.trim()) {
            controller.enqueue(
              encoder.encode(
                sse({
                  type: "error",
                  message:
                    "The AI provider returned no content for this request after retries. Please try again.",
                  status: 502,
                }),
              ),
            );
          } else {
            controller.enqueue(
              encoder.encode(
                sse({ type: "done", final: true, projectState: null }),
              ),
            );
          }
          controller.close();
        } catch (err) {
          controller.enqueue(
            encoder.encode(
              sse({
                type: "error",
                message: safeErrorDetail(err),
                status: 502,
              }),
            ),
          );
          controller.close();
        } finally {
          // Every exit path (normal end, early return, error) must stop pinging.
          stopHeartbeat();
        }
      },
    });
    return new Response(readable, {
      status: 200,
      headers: sseHeaders({ "Access-Control-Allow-Origin": "*" }),
    });
  }

  const providerStartedAt = Date.now();
  const result = await runProviderChain(apiMessages, {
    env,
    signal: clientDisconnectSignal,
    store: createTaskStateStore(env),
    sleep: retrySleepFor(env),
    sessionId,
    model: selectedModel,
    reasoning: selectedReasoning.reasoning,
    temperature: selectedReasoning.temperature,
  });
  const providerMs = Date.now() - providerStartedAt;

  if (result.status === "retry-scheduled") {
    // The provider could not recover within this request's practical window;
    // the retry schedule is persisted and the task resumes on a later call.
    return jsonResponse(200, {
      taskId: result.taskId,
      status: "retry-scheduled",
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }

  if (result.status === "cancelled") {
    return jsonResponse(499, { error: "AI request cancelled." });
  }

  if (result.content) {
    // Reliability pipeline: truncation/language detection, code validation,
    // automatic repair, and diagnostics — before the answer reaches the user.
    const repairUsage = [];
    const repairStartedAt = Date.now();
    const processed = await processResponse(apiMessages, result.content, {
      userPrompt: prompt,
      project: activeProject,
      stopReason: result.stopReason || null,
      generate: async (repairMessages) => {
        const repaired = await runProviderChain(repairMessages, {
          env,
          signal: clientDisconnectSignal,
          store: createTaskStateStore(env),
          sleep: retrySleepFor(env),
          sessionId,
          model: selectedModel,
          reasoning: selectedReasoning.reasoning,
          temperature: selectedReasoning.temperature,
        });
        if (repaired?.usage) repairUsage.push(repaired.usage);
        return repaired.content ? repaired : null;
      },
      maxRepairs: 2,
    });
    const repairMs = Date.now() - repairStartedAt;

    // Deterministic truncation repair: close unclosed script/style/html tags
    // so a clean truncation (e.g. token limit exactly at </script>) doesn't
    // surface as a 502. This mirrors worker/htmlRepair.js logic but covers
    // direct AI responses as well (harness already does this).
    if (processed.diagnostics.truncationDetected) {
      const repairedHtml = repairMalformedHtml(processed.content);
      if (repairedHtml !== processed.content) {
        processed.content = repairedHtml;
        const re = detectTruncation(repairedHtml, {
          stopReason: result.stopReason || null,
        });
        if (!re.truncated) {
          processed.diagnostics.truncationDetected = false;
          processed.diagnostics.truncationSignals = [];
        }
      }
    }

    // Honest-failure gate: a reply that is STILL cut off after the provider
    // call and every repair round is never returned as a successful 200 —
    // the client would otherwise render a message that stops mid-way.
    if (processed.diagnostics.truncationDetected) {
      return jsonResponse(502, {
        error:
          "The AI reply was cut off and could not be completed automatically. Please try again.",
        detail:
          (processed.diagnostics.truncationSignals || [])
            .slice(0, 3)
            .join(", ") || undefined,
        diagnostics: processed.diagnostics,
      });
    }

    // Safety-net: patch local image filenames with attached data URL
    const verificationRawNonStream = runVerificationWithRepair({
      prompt,
      content: processed.content,
      skills,
      runtimeContext,
      liveDataEvidence,
      searchEvidence: liveDataEvidence,
    });
    const patchedNonStream = patchLocalImageSrc(
      verificationRawNonStream.content,
      [...messages, ...apiMessages],
    );
    const fixedNonStream = fixCommonJSInHtml(patchedNonStream);
    const finalPatchedNonStream =
      fixedNonStream !== patchedNonStream ? fixedNonStream : patchedNonStream;
    const verificationContentPatchedNonStream = finalPatchedNonStream;
    const verification =
      verificationRawNonStream.content !== verificationContentPatchedNonStream
        ? {
            ...verificationRawNonStream,
            content: verificationContentPatchedNonStream,
          }
        : verificationRawNonStream;
    const finalContent = verification.content;
    const initialTokens = {
      inputTokens: result.usage?.inputTokens ?? null,
      outputTokens: result.usage?.outputTokens ?? null,
    };
    const totalInput = [
      initialTokens.inputTokens,
      ...repairUsage.map((u) => u.inputTokens),
    ]
      .filter((n) => Number.isFinite(n) && n !== null)
      .reduce((acc, n) => acc + n, 0);
    const totalOutput = [
      initialTokens.outputTokens,
      ...repairUsage.map((u) => u.outputTokens),
    ]
      .filter((n) => Number.isFinite(n) && n !== null)
      .reduce((acc, n) => acc + n, 0);

    // Meter the provider's reported usage for this turn (the up-front estimate
    // is topped up only if the provider reports more).
    tokenAccount.record({ inputTokens: totalInput, outputTokens: totalOutput });
    await tokenAccount.flush();

    // Project state returned to the client: the client-provided or
    // conversation-derived state, or — on first creation turns with no prior
    // code — the state derived from the just-generated answer, so the client
    // can persist it and send it back on the next follow-up turn.
    const returnedProject =
      activeProject ||
      deriveProjectState([{ role: "assistant", content: finalContent }]);
    const diagnostics = {
      ...processed.diagnostics,
      ttftMs: Date.now() - requestStartedAt,
      totalMs: Date.now() - requestStartedAt,
      provider: result.provider || null,
      model: result.model || null,
      inputTokens: result.usage?.inputTokens ?? null,
      outputTokens: result.usage?.outputTokens ?? null,
      fallbackUsed: Boolean(result.resumed),
      verification: {
        results: verification.results,
        hardFailures: verification.hardFailures,
        passed: verification.passed,
        repairAttempts: verification.repairAttempts,
        latencyMs: verification.latencyMs,
      },
      liveData: buildLiveDataDiagnostics(
        liveDataEvidence,
        liveDataNeed,
        verification,
      ),
      usage: {
        initial: initialTokens,
        repairs: repairUsage,
        total: {
          inputTokens: totalInput || initialTokens.inputTokens,
          outputTokens: totalOutput || initialTokens.outputTokens,
        },
        estimatedCostUsd: estimateCostUsd(
          totalInput || initialTokens.inputTokens,
          totalOutput || initialTokens.outputTokens,
          env,
        ),
      },
      latency: {
        routingMs: Math.max(0, providerStartedAt - requestStartedAt),
        providerMs,
        verificationMs: verification.latencyMs,
        repairMs,
        totalMs: Date.now() - requestStartedAt,
      },
    };
    return jsonResponse(200, {
      content: finalContent,
      model: result.model,
      provider: result.provider || null,
      projectState: serializeProjectState(returnedProject) || undefined,
      diagnostics,
    });
  }

  console.error(
    JSON.stringify({
      message: "AI generation failed",
      error: result.error || "all providers returned no usable response",
    }),
  );
  return jsonResponse(502, {
    error: "Unable to generate AI response.",
    detail: result.error || "all providers returned no usable response",
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
      // Never report fabricated zeros: the panel shows a retryable error.
      return usageUnavailableResponse();
    }
    throw err;
  }
  return jsonResponse(200, summary);
}

// Application CSP for the SPA (attached to HTML documents served from the
// assets binding). 'unsafe-inline' in script-src is REQUIRED: previews are
// AI-generated documents executed in sandboxed srcdoc iframes, and srcdoc
// documents inherit the parent's CSP (a child meta CSP does not override it
// — verified empirically in Chromium), so inline scripts must be allowed at
// the app level. Inline scripts only ever run inside originless, sandboxed
// iframes; the app bundle itself is external and eval-free. No 'unsafe-eval'.
// https: is REQUIRED for the same inheritance reason: generated artifacts and
// the JSX preview wrapper legitimately load libraries from CDNs (unpkg,
// cdnjs, tailwind, esm.sh). Without it, every external script in a preview is
// blocked and the canvas renders blank. This matches the published-page and
// PREVIEW_CSP policies so in-app previews and published links behave
// identically.
const APP_CSP = [
  "default-src 'self'",
  // static.cloudflareinsights.com: Cloudflare's own analytics beacon
  // (auto-injected RUM). Without it the beacon is blocked and every page
  // logs a CSP violation.
  "script-src 'self' 'unsafe-inline' https: https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline' https:",
  "font-src 'self' data: https:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "connect-src 'self' https: wss:",
  // No 'srcdoc' keyword exists in CSP — srcdoc iframes are covered by
  // 'self' via their inherited origin. The bogus keyword only logged a
  // violation on every page load.
  "frame-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

// Vite emits content-hashed build output under /assets/
// (index-<hash>.js, index-<hash>.css, vendor-<hash>.js, <name>-<hash>.jpg):
// the filename changes whenever the bytes change, so the browser may keep it
// for a year without ever revalidating. The assets binding default
// (`public, max-age=0, must-revalidate`) made the browser send a conditional
// request for every bundle on every page load — a wasted round trip per asset
// on each visit (the operator's own client RTT measured 163ms). A `_headers`
// file cannot do this: custom rules from that file are not applied to
// Worker-generated responses, and run_worker_first ["/*"] routes every asset
// through this Worker. Anything that is not a hashed build artifact (the SPA
// shell, robots.txt, sitemap.xml, the brand PNGs at the root) keeps the
// revalidating default so a new deploy is still picked up immediately.
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
