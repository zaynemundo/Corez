import {
  ensureMemoryTables,
  d1StoreMemory,
  d1ListMemories,
  d1DeleteMemory,
  d1UpsertInference,
  getUserAccount,
} from "./memory.js";
import { sessionUid } from "./auth.js";
import {
  UsageUnavailableError,
  consumeAllowance,
  usageUnavailableResponse,
} from "./usage.js";
import { safeErrorDetail, jsonResponse } from "./utils.js";
import { runProviderChain } from "./providerChain.js";
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

/**
 * Headers for a Server-Sent Events response.
 *
 * `no-transform` and `X-Accel-Buffering: no` stop intermediaries from buffering
 * a long build into one lump (which the user experiences as a frozen UI), and
 * `Connection: keep-alive` keeps the socket from being reaped mid-stream.
 */
export function sseHeaders(extra = {}) {
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
export function startSseHeartbeat(controller, encoder, env) {
  const configured = Number(env?.COREZ_HEARTBEAT_MS);
  const intervalMs =
    Number.isFinite(configured) && configured > 0 ? configured : 15000;
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

// Deterministic short replies honor the streaming contract exactly like the
// greeting/identity fast-paths: a real SSE stream with one delta for
// streamed requests, JSON otherwise — never a JSON body an SSE parser would
// misread as an empty stream.
export function deterministicChatReply(body, text, model) {
  if (body?.stream === true) {
    const encoder = new TextEncoder();
    const sse = (event) => `data: ${JSON.stringify(event)}\n\n`;
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(sse({ type: "meta", provider: "corez", model })),
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

// Title-only fast path: the client asks the model to name a new chat
// session from its first message. A tiny dedicated system prompt and a
// strict output cap keep this near-free; failures resolve to title: null
// so the client falls back to its deterministic heuristic naming.
// Title generation is billed work, so it draws on its own bounded `titles`
// allowance (never the generation budget) and an unavailable accounting
// store stops it before the provider is called.
export async function handleTitleFastPath({
  request,
  env,
  uid,
  plan,
  requestTokensEstimate,
  prompt,
  sessionId,
  tokenAccount,
  retrySleepFor,
}) {
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

export function tryGreetingOrIdentityFastPath(body, prompt) {
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
    return deterministicChatReply(body, greetingContent, "corez-greeting");
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
    return deterministicChatReply(body, modelReply, "corez-1.0");
  }

  return null;
}

// ---------------------------------------------------------------------
// User memory fast-path: remember / recall / forget + who-am-I, answered
// deterministically from D1 with no LLM round-trip (which also keeps
// these out of the continuation/repair loop). Memory is best-effort:
// anything unexpected falls through to the normal pipeline — memory
// must never break chat.
// ---------------------------------------------------------------------
export async function resolveMemoryFastPathAndContext({
  request,
  env,
  body,
  prompt,
}) {
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
      return {
        response: deterministicChatReply(
          body,
          buildMemoryRecallAnswer(memoryAccount, memoryFacts),
          "corez-memory",
        ),
        memorySystemMessage: null,
      };
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
          return {
            response: deterministicChatReply(
              body,
              "I can't store that — it looks like a secret or credential, and I never memorize those. Tell me something else about yourself instead.",
              "corez-memory",
            ),
            memorySystemMessage: null,
          };
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
          return {
            response: deterministicChatReply(
              body,
              `Got it — I'll remember that: ${record.text}`,
              "corez-memory",
            ),
            memorySystemMessage: null,
          };
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
            return {
              response: deterministicChatReply(
                body,
                count > 0
                  ? `Done — I forgot everything I knew about you (${count} ${count === 1 ? "memory" : "memories"} removed).`
                  : "There's nothing stored about you, so nothing to forget.",
                "corez-memory",
              ),
              memorySystemMessage: null,
            };
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
            return {
              response: deterministicChatReply(
                body,
                `I don't have anything stored about "${target}".`,
                "corez-memory",
              ),
              memorySystemMessage: null,
            };
          }
          for (const h of hits) {
            await d1DeleteMemory(env, {
              userId: memoryUid,
              key: h.key,
            }).catch(() => {});
          }
          return {
            response: deterministicChatReply(
              body,
              `Forgot ${hits.length === 1 ? "this" : `these ${hits.length}`}:\n` +
                hits.map((h) => `- ${h.text}`).join("\n"),
              "corez-memory",
            ),
            memorySystemMessage: null,
          };
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

  let memorySystemMessage = null;
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
      (f) =>
        `- ${f.text} [~${inferencePercent(f)}% — possible, do NOT assert as fact]`,
    );
    memorySystemMessage = {
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
    };
  }

  return { response: null, memorySystemMessage };
}
