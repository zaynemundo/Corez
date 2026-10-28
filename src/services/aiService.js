// Corez AI Service Engine - Universal Public Conversational Engine

export const MODEL = {
  id: "corez-1.0",
  name: "Corez 1.0",
  description:
    "Corez 1.0 — conversational AI creation platform for websites, apps, games, and tools.",
};

// AI traffic order. Same-origin /api/ai is ALWAYS first — in dev (the Vite
// proxy targets the local worker) and deployed (corez.pro / chat.corez.pro
// are custom-domain routes of this same Worker, so they serve the SPA and the
// API together). The session cookie (corez_session) is HttpOnly and
// host-bound to the SPA's own domain, so a cross-origin POST to the dedicated
// workers.dev host can NEVER carry it: calling that host first produced a
// guaranteed 401 on every deployed message, and the client paid an extra
// ~0.6s cross-origin round trip (a red failed request in devtools on a
// perfectly healthy app) before the same-origin retry could answer.
// The raw workers.dev host (chat.zayne-mayo.workers.dev) remains the fallback
// only: it serves ONLY /api/ai, requires an approved CoreZ origin, answers
// CORS, and still bypasses custom-domain WAF rules and challenge pages when
// corez.pro itself is challenged.
export const AI_PROXY_ENDPOINT = "/api/ai";
const AI_FALLBACK_ENDPOINT = "https://chat.zayne-mayo.workers.dev/api/ai";
const CLOUDFLARE_CHALLENGE_PATTERN =
  /Just a moment|challenge-platform|__cf_chl_/i;
export const IMAGE_PROXY_ENDPOINT = "/api/image";

import { defaultSkillRegistry } from "../skills/registry.js";
import { classifyIntent } from "./intentClassifier.js";
import {
  toLegacyIntentType,
  classifyIntent as classifyIntentNew,
  extractRequirements,
  classifyComplexity,
} from "./promptIntelligence/index.js";
import { createIntentContract } from "./promptIntelligence/intentContract.js";
import {
  evaluateResponse,
  repairResponse,
  ensureGameChatBrief,
  ensureSiteChatBrief,
  recordQualitySignal,
} from "./reflectionEngine.js";
import { stripThinkingBlocks } from "../../packages/agent-core/providers/text.js";
import { resolveSkills } from "../skills/resolver.js";
import { classifyExecutionMode } from "./executionModes.js";
import {
  isWebSearchRequest,
  formatSearchResults,
  answerWithWebSearch,
  extractOutlineItems,
  dedupeSources,
  runResearchCommand,
} from "./ai/researchPipeline.js";
import {
  WORKERS_AI_IMAGE_MODEL,
  WORKERS_AI_SDXL_LIGHTNING_MODEL,
  WORKERS_AI_IMAGE_ENDPOINT,
  createFallbackSvgDataUrl,
  generateImage,
  generateWorkersAIImage,
  detectRequestedImageModel,
  runImageCommand,
  createImageTitle,
  isMixedQuestionImageRequest,
  extractImageSubject,
  extractQuestionPrompt,
  extractReferenceImage,
  handleMixedQuestionImageRequest,
  isExplicitImageRequest,
} from "./ai/imagePipeline.js";
import { generateSessionTitle, generateAISessionTitle } from "./ai/sessionTitle.js";
import {
  isGameDevIntent,
  isSocialCarouselCopyRequest,
  isExplicitWebsiteRequest,
  isRevisionContextPrompt,
  improveCodingPrompt,
} from "./ai/promptEnhancer.js";
import {
  extractCodeFromMessage,
  parseSlashCommand,
  parseCommand,
  isSlashCommand,
  isCommand,
} from "./ai/codeExtractor.js";
import { compactConversationForRequest } from "./ai/conversationCompactor.js";
import {
  abortError,
  sleepResumable,
  describeHostedUnavailable,
  PERSISTENT_RETRY_BASE_DELAY_MS,
  PERSISTENT_RETRY_MAX_DELAY_MS,
  PERSISTENT_RETRY_DEFAULT_MAX_ATTEMPTS,
  BUILD_IN_PROGRESS_MAX_ATTEMPTS,
  BUILD_IN_PROGRESS_BASE_DELAY_MS,
  BUILD_IN_PROGRESS_MAX_DELAY_MS,
  BUILD_IN_PROGRESS_MESSAGE,
  isBuildInProgressError,
  getBuildInProgressDelay,
  getPersistentRetryDelay,
  isRetryableHostedError,
  isHostedUnavailableFallback,
  resolvePersistentRetryOpts,
} from "./ai/retryPolicy.js";
export {
  isWebSearchRequest,
  formatSearchResults,
  answerWithWebSearch,
  extractOutlineItems,
  dedupeSources,
  runResearchCommand,
  WORKERS_AI_IMAGE_MODEL,
  WORKERS_AI_SDXL_LIGHTNING_MODEL,
  WORKERS_AI_IMAGE_ENDPOINT,
  createFallbackSvgDataUrl,
  generateImage,
  generateWorkersAIImage,
  runImageCommand,
  createImageTitle,
  isMixedQuestionImageRequest,
  extractImageSubject,
  extractQuestionPrompt,
  extractReferenceImage,
  handleMixedQuestionImageRequest,
  isExplicitImageRequest,
  generateSessionTitle,
  generateAISessionTitle,
  isGameDevIntent,
  isSocialCarouselCopyRequest,
  isExplicitWebsiteRequest,
  isRevisionContextPrompt,
  improveCodingPrompt,
  extractCodeFromMessage,
  parseSlashCommand,
  parseCommand,
  isSlashCommand,
  isCommand,
  compactConversationForRequest,
  describeHostedUnavailable,
  PERSISTENT_RETRY_BASE_DELAY_MS,
  PERSISTENT_RETRY_MAX_DELAY_MS,
  PERSISTENT_RETRY_DEFAULT_MAX_ATTEMPTS,
  BUILD_IN_PROGRESS_MAX_ATTEMPTS,
  BUILD_IN_PROGRESS_BASE_DELAY_MS,
  BUILD_IN_PROGRESS_MAX_DELAY_MS,
  BUILD_IN_PROGRESS_MESSAGE,
  isBuildInProgressError,
  getBuildInProgressDelay,
  getPersistentRetryDelay,
  isRetryableHostedError,
  isHostedUnavailableFallback,
};

export const PUBLIC_USER_INTENT_PROMPT = `
Analyze the public user intent behind the request. Corez uses a server-configured image-generation pipeline for background generation and image rendering.
Identify whether the user wants to create a public-facing website, landing page, dashboard,
portal, app, game (with full word dictionaries for word games like Scrabble & Wordle), widget, calculator, timer, prototype, tool, code help,
writing help, an explanation, or general guidance. 
Corez will infer goals instead of matching only keywords to understand public user intent.

Available skills in the CoreZ Skill Registry:
${defaultSkillRegistry.getFormattedSkillList()}

Respond with the likely goal, useful next action, the appropriate skill if applicable, and a concise path forward.
`;

const INTENT_PATTERNS = {
  // Like image detection below, the build verb must govern the artifact noun
  // within a tight window (~48 chars): unbounded `.*` let "create an email ...
  // mentioning our site" route to a website build. Bare game-word mentions
  // ("tell me about chess") are handled by isGameDevIntent, not this pattern.
  app: /\b(build|make|create|generate|design|launch|prototype|develop|ship)\b[\w\s,'"-]{0,48}?\b(app|tool|website|site|landing page|dashboard|portal|widget|calculator|timer|game|simulator|preview|html|bot|enemy)\b|\b(app|tool|website|site|landing page|dashboard|portal|widget|calculator|timer|game|simulator|bot|enemy)\b[\w\s,'"-]{0,48}?\b(build|make|create|generate|design|launch|prototype|develop|ship)\b|\b(game|play|chess|snake|pong|shooter|quiz|puzzle|simulator|canvas|bot|enemy)\b/i,
  code: /\b(code|debug|bug|fix|error|javascript|typescript|python|react|css|html|component|function|api|compile|stack trace)\b/i,
  writing:
    /\b(write|rewrite|copy|caption|email|post|bio|headline|script|summarize|summary|proposal|description|landing copy)\b/i,
  explanation:
    /\b(explain|what is|what are|what's|whats|how does|why does|why is|why are|why do|teach me|break down|understand|compare|difference between|tell me about)\b/i,
};


function analyzeIntentWithRules(cleanPrompt) {
  const lower = cleanPrompt.toLowerCase();

  // Social-carousel copy guard: "create a post for this carousel" is WRITING
  // (slide copy + caption), never an app/component build. Must run BEFORE the
  // app pattern so a future app regex containing "carousel" cannot hijack it.
  if (isSocialCarouselCopyRequest(cleanPrompt)) {
    return {
      type: "writing",
      summary: "Help the user shape public-facing words or content.",
      responseStrategy:
        "Offer slide-by-slide carousel copy plus caption and hashtags in plain markdown. Do NOT generate code or previews.",
    };
  }

  if (INTENT_PATTERNS.app.test(cleanPrompt)) {
    // Website-flavored matches require an explicit website request (same rules
    // as @image): a bare mention of "site"/"website"/"dashboard" without a
    // governing build verb must not trigger a website build.
    const mentionsWebsiteNoun =
      /\b(website|web\s?site|landing page|webpage|web app|homepage|portfolio site|dashboard|admin panel|portal|saas|site)\b/i.test(
        cleanPrompt,
      );
    if (
      !mentionsWebsiteNoun ||
      isExplicitWebsiteRequest(cleanPrompt) ||
      isGameDevIntent(cleanPrompt)
    ) {
      return {
        type: "app",
        summary: "Create a public-facing interactive experience or web tool.",
        responseStrategy:
          "Build a runnable monochrome HTML preview when enough intent is present.",
      };
    }
    // Website-mentioned but not an explicit build: fall through to
    // code/writing/explanation/general below.
  }

  if (INTENT_PATTERNS.code.test(cleanPrompt)) {
    return {
      type: "code-help",
      summary: "Help the user understand, debug, or improve code.",
      responseStrategy:
        "Ask for the relevant snippet when the code is missing; otherwise explain the fix clearly.",
    };
  }

  if (INTENT_PATTERNS.writing.test(cleanPrompt)) {
    return {
      type: "writing",
      summary: "Help the user shape public-facing words or content.",
      responseStrategy: "Offer a concise draft or rewrite with a clear tone.",
    };
  }

  if (INTENT_PATTERNS.explanation.test(lower)) {
    return {
      type: "explanation",
      summary: "Explain the topic in plain language.",
      responseStrategy: "Give a direct answer with the minimum useful context.",
    };
  }

  return {
    type: "general",
    summary: "Understand the public user goal and give a useful next step.",
    responseStrategy:
      "Clarify the likely intent, answer directly, and invite the next concrete detail.",
  };
}

export function analyzePublicUserIntent(prompt) {
  const cleanPrompt = prompt ? prompt.trim() : "";

  if (!cleanPrompt) {
    return {
      type: "general",
      summary: "Understand the public user goal and give a useful next step.",
      responseStrategy:
        "Clarify the likely intent, answer directly, and invite the next concrete detail.",
      confidence: 0,
      source: "default",
    };
  }

  // CV rewrite disambiguation: pasted work history containing "Developed websites..."
  // must not be treated as app/website creation when instruction is to condense.
  const lowerForCV = cleanPrompt.toLowerCase();
  const isCVRewriteForLegacy =
    (/\b(cv|resume|curriculum vitae)\b/i.test(lowerForCV) &&
      /\b(less|short|concise|condense|rewrite|rephrase|reduce|bullet)\b/i.test(
        lowerForCV,
      )) ||
    /\bgive me less description\b/i.test(lowerForCV) ||
    (/\b(less description|shorten|condense|rewrite)\b/i.test(lowerForCV) &&
      (lowerForCV.includes("created proposals") ||
        lowerForCV.includes("developed websites")));
  if (isCVRewriteForLegacy) {
    const instructionPart = (() => {
      const markers = [
        "created proposals",
        "developed websites using",
        "collaborated with the design",
      ];
      let earliest = cleanPrompt.length;
      for (const m of markers) {
        const idx = lowerForCV.indexOf(m);
        if (idx !== -1 && idx < earliest) earliest = idx;
      }
      return earliest < cleanPrompt.length
        ? lowerForCV.slice(0, earliest)
        : lowerForCV.slice(0, 280);
    })();
    const hasWebInInstruction =
      /\b(build|make|create|generate|develop|design|launch|ship)\b.*\b(website|site|landing page|webpage|web app|homepage|portfolio site)\b/i.test(
        instructionPart,
      );
    if (!hasWebInInstruction) {
      return {
        type: "writing",
        summary: "Help the user shape public-facing words or content.",
        responseStrategy: "Offer a concise draft or rewrite with a clear tone.",
        confidence: 0.92,
        source: "prompt-intelligence-cv-guard",
      };
    }
  }

  // Business-copy writing guard: "At Office Inspirations, we provide full-service design, installation..."
  // Must not be treated as website/app creation even though it contains "design"/"solutions".
  // Classify as writing when the prompt is a business sentence copy request without an explicit website/app build instruction.
  const lowerBusiness = lowerForCV;
  const isBusinessCopyWriting =
    ((/\bat\s+[^.!?]{2,60},\s*we\s+provide\b/i.test(cleanPrompt) ||
      lowerBusiness.includes("we provide a complete") ||
      lowerBusiness.includes("we provide full-service")) &&
      /\b(design|installation|furniture|ergonomic|consultancy|leasing)\b/i.test(
        cleanPrompt,
      ) &&
      !/\b(build|create|make|generate|design|develop|ship)\b.*\b(website|web site|landing page|webpage|web app|homepage|portfolio|site|app|html|preview)\b/i.test(
        lowerBusiness,
      ) &&
      !/^\s*@(game|website|app)\b/i.test(cleanPrompt)) ||
    (lowerBusiness.includes("expanded versions") &&
      lowerBusiness.includes("keep your core message")) ||
    (lowerBusiness.includes("at office inspirations") &&
      lowerBusiness.includes("we provide"));
  if (isBusinessCopyWriting) {
    return {
      type: "writing",
      summary: "Help the user shape public-facing words or content.",
      responseStrategy:
        "Offer a concise draft or rewrite with a clear tone. Do NOT generate HTML code, previews, or website scaffolding unless the user explicitly asks for a website, landing page, or code.",
      confidence: 0.94,
      source: "business-copy-guard",
    };
  }

  // Social-carousel copy guard: "i need to create a post for this carousel ..."
  // is slide copy + caption + hashtags in plain markdown — never a UI component,
  // React preview, or website build. Pasted body copy containing "research"
  // must not flip it to explanation/research.
  if (isSocialCarouselCopyRequest(cleanPrompt)) {
    return {
      type: "writing",
      summary: "Help the user shape public-facing words or content.",
      responseStrategy:
        "Offer slide-by-slide carousel copy plus caption and hashtags in plain markdown. Do NOT generate code, HTML, React, or previews unless the user explicitly asks for a carousel component, UI, or website.",
      confidence: 0.94,
      source: "social-carousel-guard",
    };
  }

  // Try the new Prompt Intelligence intent engine first
  let newIntent;
  try {
    newIntent = classifyIntentNew(cleanPrompt);
  } catch {
    newIntent = null;
  }

  // Trained classifier result (higher-confidence signal wins over the
  // fine-grained engine's loose 0.5 gate on multi-intent prompts)
  let modelResult;
  try {
    modelResult = classifyIntent(cleanPrompt);
  } catch {
    modelResult = { accepted: false, confidence: 0 };
  }

  const modelWins =
    Boolean(modelResult?.accepted) &&
    (!newIntent || modelResult.confidence >= (newIntent.confidence || 0));

  // Website creation must be explicit — same rules as @image. A bare mention
  // of website nouns without a governing build verb never qualifies, no
  // matter how confident the fine-grained engine is.
  const fineType = newIntent?.primaryIntent || newIntent?.type;
  const websiteExplicit =
    fineType !== "website_creation" ||
    isExplicitWebsiteRequest(cleanPrompt);

  // If the new engine has a high-confidence classification, map it to legacy types
  if (
    !modelWins &&
    newIntent &&
    newIntent.confidence >= 0.5 &&
    newIntent.type !== "unknown" &&
    (fineType !== "website_creation" || websiteExplicit)
  ) {
    const legacyType = toLegacyIntentType(newIntent.type);
    const summaries = {
      app: "Create a public-facing interactive experience or web tool.",
      "code-help": "Help the user understand, debug, or improve code.",
      writing: "Help the user shape public-facing words or content.",
      explanation: "Explain the topic in plain language.",
      general: "Understand the public user goal and give a useful next step.",
    };
    const strategies = {
      app: "Build a runnable monochrome HTML preview when enough intent is present.",
      "code-help":
        "Ask for the relevant snippet when the code is missing; otherwise explain the fix clearly.",
      writing: "Offer a concise draft or rewrite with a clear tone.",
      explanation: "Give a direct answer with the minimum useful context.",
      general:
        "Clarify the likely intent, answer directly, and invite the next concrete detail.",
    };

    return {
      type: legacyType,
      summary: summaries[legacyType] || summaries.general,
      responseStrategy: strategies[legacyType] || strategies.general,
      confidence: newIntent.confidence,
      source: "prompt-intelligence",
      enriched: {
        fineType: newIntent.type,
        goal: newIntent.goal,
        domain: newIntent.domain,
        complexity: newIntent.complexity,
      },
    };
  }

  if (modelResult && modelResult.accepted) {
    // The trained model is software-heavy: a website-mentioned prompt it
    // labels `app` still needs an explicit website request (same rules as
    // @image) before it may build.
    if (
      modelResult.label === "app" &&
      /\b(website|web\s?site|landing page|webpage|web app|homepage|portfolio site|dashboard|admin panel|portal|saas|site)\b/i.test(
        cleanPrompt,
      ) &&
      !isExplicitWebsiteRequest(cleanPrompt) &&
      !isGameDevIntent(cleanPrompt)
    ) {
      // Fall through to the rule engine (which applies the same gate) instead
      // of building a website the user never asked for.
    } else switch (modelResult.label) {
      case "app":
        return {
          type: "app",
          summary: "Create a public-facing interactive experience or web tool.",
          responseStrategy:
            "Build a runnable monochrome HTML preview when enough intent is present.",
          confidence: modelResult.confidence,
          source: "model",
        };
      case "code-help":
        return {
          type: "code-help",
          summary: "Help the user understand, debug, or improve code.",
          responseStrategy:
            "Ask for the relevant snippet when the code is missing; otherwise explain the fix clearly.",
          confidence: modelResult.confidence,
          source: "model",
        };
      case "writing":
        return {
          type: "writing",
          summary: "Help the user shape public-facing words or content.",
          responseStrategy:
            "Offer a concise draft or rewrite with a clear tone.",
          confidence: modelResult.confidence,
          source: "model",
        };
      case "explanation":
        return {
          type: "explanation",
          summary: "Explain the topic in plain language.",
          responseStrategy:
            "Give a direct answer with the minimum useful context.",
          confidence: modelResult.confidence,
          source: "model",
        };
      case "general":
      default:
        return {
          type: "general",
          summary:
            "Understand the public user goal and give a useful next step.",
          responseStrategy:
            "Clarify the likely intent, answer directly, and invite the next concrete detail.",
          confidence: modelResult.confidence,
          source: "model",
        };
    }
  }

  const ruleResult = analyzeIntentWithRules(cleanPrompt);
  return {
    ...ruleResult,
    confidence: modelResult?.confidence ?? 0,
    source: "rules",
  };
}


// Persisted project memory: the worker returns a lightweight structured
// project state with every creation/modification response; it is stored here
// and sent back with the next request so follow-up turns edit the existing
// project instead of regenerating it. Session-scoped in practice: it is
// overwritten when a new project is created.
let persistedProjectState = null;
let onProjectStateChange = null;
export function setProjectStateListener(listener) {
  onProjectStateChange = typeof listener === "function" ? listener : null;
}
export function getPersistedProjectState() {
  return persistedProjectState;
}
export function clearPersistedProjectState() {
  persistedProjectState = null;
}

export async function generateHostedAIResponse(
  prompt,
  intent = analyzePublicUserIntent(prompt),
  history = [],
  signal = null,
  options = {},
) {
  // 1. Fine-grained intent classification & contract generation
  const fineIntent = classifyIntentNew(prompt);
  const legacyIntentType = toLegacyIntentType(
    fineIntent?.primaryIntent || fineIntent?.type,
  );
  const requirements = extractRequirements(prompt, fineIntent);
  const contract = createIntentContract(fineIntent, {
    explicit: requirements.explicit || [],
    inferred: requirements.inferred || [],
    forbidden: requirements.forbidden || [],
  });

  const executionPrompt =
    intent?.type === "code-help" ||
    intent?.type === "app" ||
    INTENT_PATTERNS.code.test(prompt)
      ? await improveCodingPrompt(prompt, intent)
      : prompt;

  // Creation requests (games, websites, apps) run through the agentic
  // creation harness so the artifact is verified and repaired before
  // delivery. Revisions of existing code keep the direct single-generation
  // path. The harness runs identically streamed or not (the worker answers
  // with the finished artifact either way), but the app requests streaming
  // so the build phases and deltas are visible live.
  const finePrimary = fineIntent?.primaryIntent || fineIntent?.type;
  const harnessIntent = intent?.primaryIntent || finePrimary;
  // Defense in depth: a website_creation without an explicit website request
  // (same rules as @image) never enters the creation harness, even if an
  // upstream classifier mislabeled it.
  const harnessWebsiteBlocked =
    harnessIntent === "website_creation" &&
    !isExplicitWebsiteRequest(String(prompt));
  const useCreationHarness =
    options.stream === true &&
    intent?.type === "app" &&
    !isRevisionContextPrompt(prompt) &&
    !String(prompt).includes("```") &&
    !harnessWebsiteBlocked &&
    ["game_creation", "website_creation", "design_task", "app"].includes(
      harnessIntent,
    );

  // 2. Skill resolution with fine-grained intent. Classification patterns run
  // against the RAW user prompt — never the model-enriched coding prompt,
  // whose generic boilerplate ("accessibility contrast standards", design
  // guidance) would false-positive specialist and workflow matching.
  const resolved = resolveSkills({
    intent: fineIntent,
    prompt,
    registry: defaultSkillRegistry,
  });

  const complexity = classifyComplexity(prompt, fineIntent);
  // Explicit execution mode: repository engineering work routes to the agent
  // path (and is reported honestly when no workspace is attached), while
  // conversational and standalone preview-creation prompts stay on the
  // direct provider route.
  const executionMode = classifyExecutionMode(prompt);

  const fetchOptions = {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      intent,
      messages: compactConversationForRequest(history),
      fineIntent,
      executionPrompt,
      legacyIntent: legacyIntentType,
      contract,
      skills: resolved.skills,
      executionPlan: resolved.compactExecutionPlan || null,
      complexity,
      mode: executionMode,
      project: persistedProjectState || undefined,
      stream: options.stream === true,
      harness: useCreationHarness,
    }),
  };
  if (signal) fetchOptions.signal = signal;

  // Transport resilience: a dropped connection (NetworkError / Failed to
  // fetch) is often a transient blip on the client's network or at the edge,
  // not a provider failure. Retry the same request once after a short pause
  // before reporting the transport failure — never retry when the user
  // pressed Stop. Declared before the streaming branch: both paths use it,
  // and a const referenced before its initializer would throw a temporal
  // dead zone error on every streamed request.
  const TRANSPORT_FAILURE_PATTERN =
    /networkerror|failed to fetch|load failed|fetch failed|connection (refused|reset|timed out)|network is unreachable|err_connection/i;
  const fetchWithTransportRetry = async (
    options,
    endpoint = AI_PROXY_ENDPOINT,
  ) => {
    const attempts = [null, 3000];
    for (let i = 0; i < attempts.length; i += 1) {
      if (signal?.aborted) {
        const err = new Error("AbortError");
        err.name = "AbortError";
        throw err;
      }
      try {
        return await (endpoint === AI_PROXY_ENDPOINT ? fetch(AI_PROXY_ENDPOINT, options) : fetch(endpoint, options));
      } catch (err) {
        if (err?.name === "AbortError" || signal?.aborted) throw err;
        const message = `${err?.message || ""} ${err?.cause?.message || ""}`;
        const isLastAttempt = i === attempts.length - 1;
        if (!TRANSPORT_FAILURE_PATTERN.test(message) || isLastAttempt)
          throw err;
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, attempts[i + 1]);
          signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
        });
      }
    }
    throw new Error("Hosted AI request failed to reach the AI worker.");
  };

  // The direct Worker host is cross-origin, so it can never carry the
  // host-bound, HttpOnly session cookie. Its 401/403 replies describe the
  // fallback's inability to authenticate — never the visitor's session — so
  // they must never replace the primary response (that would turn a WAF
  // challenge or a gateway outage into a false "please log in"). Every other
  // status is a genuine answer (success, rate limit or a provider error).
  const fallbackAnswerIsUsable = (fallback) =>
    Boolean(fallback) && fallback.status !== 401 && fallback.status !== 403;

  const fetchHostedResponse = async (options) => {
    let response;
    try {
      response = await fetchWithTransportRetry(options, AI_PROXY_ENDPOINT);
    } catch (err) {
      if (err?.name === "AbortError" || signal?.aborted) throw err;
      // If same-origin /api/ai failed to reach (e.g. dev server proxy
      // offline), retry through the Worker's direct live endpoint.
      let fallback;
      try {
        fallback = await fetchWithTransportRetry(
          options,
          AI_FALLBACK_ENDPOINT,
        );
      } catch (fallbackErr) {
        if (fallbackErr?.name === "AbortError" || signal?.aborted)
          throw fallbackErr;
        // Neither endpoint was reachable: report the primary failure.
        throw err;
      }
      // The direct host is cross-origin, so it can never carry the host-bound
      // session cookie: its 401 means "no cookie here", never "logged out".
      // Report the original transport failure instead of a bogus login prompt.
      if (fallback.status === 401) throw err;
      return fallback;
    }

    if (response.status === 403) {
      let challengePage = response.headers.get("cf-mitigated") === "challenge";
      if (!challengePage) {
        try {
          const body = await response.clone().text();
          challengePage = CLOUDFLARE_CHALLENGE_PATTERN.test(
            body.slice(0, 4000),
          );
        } catch {
          /* keep header-based result */
        }
      }
      if (challengePage) {
        try {
          const fallback = await fetchWithTransportRetry(
            options,
            AI_FALLBACK_ENDPOINT,
          );
          if (fallbackAnswerIsUsable(fallback)) return fallback;
        } catch (fallbackErr) {
          if (fallbackErr?.name === "AbortError" || signal?.aborted)
            throw fallbackErr;
        }
        // Neither host could answer: report the primary challenge page so the
        // caller's WAF diagnosis surfaces instead of a bogus login prompt.
        return response;
      }
    }

    // If the primary endpoint returned a 502/503/504 gateway failure, retry
    // through the other endpoint.
    if ([502, 503, 504].includes(response.status)) {
      try {
        const fallback = await fetchWithTransportRetry(
          options,
          AI_FALLBACK_ENDPOINT,
        );
        if (fallbackAnswerIsUsable(fallback)) return fallback;
      } catch (fallbackErr) {
        if (fallbackErr?.name === "AbortError" || signal?.aborted)
          throw fallbackErr;
      }
    }

    // A 401 from same-origin /api/ai is a genuine logged-out state, never a
    // cross-origin cookie artifact: the session cookie is host-bound to the
    // SPA's own domain, so the direct workers.dev host can never carry it and
    // would answer 401 as well. Retrying there just added a wasted
    // cross-origin round trip before the same login message — surface the 401
    // as-is.
    return response;
  };

  // Streaming path: the worker answers with SSE events (meta/delta/usage/
  // done/diagnostics). Deltas are delivered to onDelta as they arrive so the
  // user sees content before the generation finishes; the final content is
  // resolved when the done event closes the stream.
  if (options.stream === true) {
    // Harness builds are resumable server-side: the worker persists its task
    // state (planning/build/verify/review) and an identical request resumes
    // or replays it. A stream that dies mid-flight (connection drop, platform
    // kill, provider outage, busy lease) is therefore retried with backoff
    // instead of being reported as a dead end. Plain chat has no persisted
    // task, but a retryable worker error (transient rate limit, empty stream)
    // is still worth a bounded number of re-issues — a blip that clears in
    // seconds must never surface as a permanent failure.
    const MAX_STREAM_ATTEMPTS = useCreationHarness ? 4 : 3;
    // Test hook: tests pass tiny delays so retry behavior is exercised
    // without waiting minutes. Chat (no persisted task) uses a short ladder
    // so a blip costs seconds, not minutes; harness builds keep the long one.
    const STREAM_RETRY_DELAYS_MS = Array.isArray(options.retryDelaysMs)
      ? options.retryDelaysMs
      : useCreationHarness
        ? [15_000, 60_000, 240_000]
        : [2_000, 8_000];
    const waitWithAbort = async (ms) => {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
    };

    for (let attempt = 0; attempt < MAX_STREAM_ATTEMPTS; attempt += 1) {
      if (signal?.aborted) {
        const err = new Error("AbortError");
        err.name = "AbortError";
        throw err;
      }
      // A retry restarts the accumulation: the worker resumes the persisted
      // task and re-streams the artifact, so any partial deltas from the
      // failed attempt must not be concatenated with the resumed stream.
      if (attempt > 0) options.onClear?.();

      const response = await fetchHostedResponse(fetchOptions);
      if (!response.ok) {
        let errorText = "";
        try {
          errorText = await response.text();
        } catch {
          /* keep empty */
        }
        if (response.status === 401) {
          throw new Error("Authentication required. Please log in.");
        }
        // The plan wall: the server says which limit ran out and when it comes
        // back. Surface that sentence instead of a bare HTTP status, so the
        // message in the chat is the one that tells the user what to do.
        if (response.status === 402) {
          let planMessage = "";
          try {
            planMessage = String(JSON.parse(errorText)?.error || "");
          } catch {
            /* not JSON: fall through to the generic message below */
          }
          throw new Error(
            planMessage ||
              "You have used up your plan's monthly allowance. Upgrade in Settings → Billing to keep going.",
          );
        }
        // A 403 with the Cloudflare challenge page ("Just a moment...") means
        // the WAF intercepted the request before it reached the worker — the
        // API needs a WAF bypass rule, not a retry.
        if (
          response.status === 403 &&
          CLOUDFLARE_CHALLENGE_PATTERN.test(errorText.slice(0, 4000))
        ) {
          throw new Error(
            "The hosted AI request was intercepted by a security challenge page before reaching the worker. The site needs a WAF bypass rule for /api/* — please retry in a moment.",
          );
        }
        throw new Error(
          `Hosted AI stream failed: HTTP ${response.status} ${errorText.slice(0, 200)}`,
        );
      }
      if (!response.body) throw new Error("Hosted AI stream had no body.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamed = "";
      let rawBody = "";
      let projectState = null;
      let sawDone = false;
      let sawPhase = false;
      let retryableError = null;
      const handleSseLine = (line) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) return;
        const payload = trimmed.slice(5).trim();
        if (!payload) return;
        let event;
        try {
          event = JSON.parse(payload);
        } catch {
          return;
        }
        if (event.type === "delta" && typeof event.text === "string") {
          streamed += event.text;
          options.onDelta?.(event.text);
        } else if (event.type === "thinking" && typeof event.text === "string") {
          // The model's (already redacted server-side) reasoning. It streams
          // before the answer so the user watches progress instead of a
          // spinner; it is never part of the returned content.
          options.onThinking?.(event.text);
        } else if (event.type === "clear") {
          streamed = "";
          options.onClear?.();
        } else if (event.type === "phase" && typeof event.phase === "string") {
          sawPhase = true;
          options.onPhase?.(event);
        } else if (event.type === "done") {
          sawDone = true;
          if (event.projectState) projectState = event.projectState;
        } else if (event.type === "error") {
          // A retryable worker error (busy lease, rate limit, empty stream)
          // means the request is still viable — back off and re-issue it
          // (bounded by MAX_STREAM_ATTEMPTS) instead of failing instantly.
          // Anything else surfaces the worker's reason verbatim.
          if (
            event.retryable === true &&
            attempt < MAX_STREAM_ATTEMPTS - 1
          ) {
            retryableError = event;
          } else {
            throw new Error(event.message || "Hosted AI stream error.");
          }
        }
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          // Flush a final SSE line that arrived without a trailing newline
          // (a truncated or edge-case response must not lose its last event).
          if (buffer.trim()) handleSseLine(buffer);
          break;
        }
        const chunk = decoder.decode(value, { stream: true });
        if (rawBody.length < 200 * 1024) rawBody += chunk;
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) handleSseLine(line);
        if (retryableError) break;
      }
      if (retryableError) {
        await reader.cancel().catch(() => {});
      }
      if (projectState) {
        persistedProjectState = projectState;
        onProjectStateChange?.(projectState);
      }

      const rawTrimmed = rawBody.trim();
      const interrupted =
        useCreationHarness &&
        !sawDone &&
        (sawPhase || !rawTrimmed || streamed.trim());
      if (
        (retryableError || interrupted) &&
        attempt < MAX_STREAM_ATTEMPTS - 1 &&
        !signal?.aborted
      ) {
        // Prefer the worker's Retry-After window when it named one (rate
        // limits); otherwise use the configured backoff ladder.
        const retryAfterMs =
          Number(retryableError?.retryAfterSeconds) > 0
            ? Math.min(
                Number(retryableError.retryAfterSeconds) * 1000,
                120_000,
              )
            : (STREAM_RETRY_DELAYS_MS[attempt] ?? 240_000);
        // A retry means the user's stream went quiet and the resumed request
        // re-emits the artifact from the persisted task. Say so: without this
        // the wait is an unexplained pause inside a build that already looks
        // slow.
        options.onPhase?.({
          phase: "resuming",
          attempt: attempt + 1,
          total: MAX_STREAM_ATTEMPTS,
          retryAfterMs,
        });
        await waitWithAbort(retryAfterMs);
        continue;
      }
      if (retryableError) {
        throw new Error(retryableError.message || "Hosted AI stream error.");
      }
      // Streamed creation deliverables (harness builds especially) arrive as
      // a bare artifact with no chat description — the worker never sees a
      // final content string to brief on this path. Prepend the deterministic
      // brief here so chat always has one; preview extraction slices from the
      // artifact start, so leading prose never reaches the canvas.
      if (streamed.trim()) {
        const streamIntent =
          fineIntent?.primaryIntent ||
          fineIntent?.type ||
          intent?.primaryIntent ||
          intent?.type;
        if (
          useCreationHarness ||
          ["game_creation", "website_creation", "design_task", "app"].includes(
            streamIntent,
          )
        ) {
          return ensureSiteChatBrief(
            ensureGameChatBrief(streamed),
            prompt,
          );
        }
        return streamed;
      }

      // The stream completed with zero deltas and no error event: the response
      // was NOT valid SSE. Diagnose the body so the user sees the real cause
      // instead of a generic "no streamed content" (a Cloudflare challenge
      // page, a proxy error page, or a JSON fast-path answer).
      if (!rawTrimmed) {
        throw new Error(
          "The hosted AI returned an empty response. Please try again.",
        );
      }
      if (CLOUDFLARE_CHALLENGE_PATTERN.test(rawTrimmed.slice(0, 4000))) {
        throw new Error(
          "The hosted AI request was intercepted by a security challenge page instead of reaching the worker. Please retry in a moment.",
        );
      }
      if (rawTrimmed.startsWith("{") || rawTrimmed.startsWith("[")) {
        try {
          const parsed = JSON.parse(rawTrimmed);
          if (typeof parsed?.content === "string" && parsed.content.trim()) {
            return parsed.content;
          }
          if (typeof parsed?.error === "string") {
            throw new Error(`Hosted AI request failed: ${parsed.error}`);
          }
        } catch (jsonErr) {
          if (
            jsonErr instanceof Error &&
            jsonErr.message.startsWith("Hosted AI request failed:")
          )
            throw jsonErr;
          // Fall through to the generic error below.
        }
      }
      throw new Error("Hosted AI returned no streamed content.");
    }
  }

  // Transport resilience: retry logic lives above with the streaming path
  // (fetchWithTransportRetry). Non-streaming request:
  let response = await fetchHostedResponse(fetchOptions);

  let data;
  try {
    data = await response.json();
  } catch (err) {
    // A user-initiated abort must propagate so callers can stop cleanly
    // instead of fabricating a fallback reply after Stop was pressed.
    if (err?.name === "AbortError" || signal?.aborted) throw err;
    data = {};
  }

  // Provider recovery window: when the provider chain cannot recover within
  // the request's practical window, the worker persists a retry schedule and
  // answers HTTP 200 with { status: 'retry-scheduled', taskId,
  // retryAfterSeconds } — no content. The same request (same messages) hashes
  // to the same task, so re-issuing it after the window resumes the persisted
  // schedule and completes the original generation. Without this handling the
  // contentless 200 was misread as "reasoning only", failing app builds with
  // a misleading error.
  // Provider recovery polling: when the worker persists a retry schedule it
  // also mirrors a task-status record at GET /api/task/<taskId>, so instead
  // of blind fixed sleeps the client waits exactly until the task becomes
  // eligible again (nextEligibleAt) and then re-issues the request — the same
  // messages hash to the same task, resuming the original generation. The
  // promise stays pending throughout, so the UI keeps showing the normal
  // "working" state instead of a dead wait or a premature error.
  const RETRY_SCHEDULED_MAX_ATTEMPTS = 3;
  const RETRY_SCHEDULED_MIN_WAIT_MS = 500;
  const RETRY_SCHEDULED_MAX_WAIT_MS = 120000;
  for (
    let attempt = 0;
    attempt < RETRY_SCHEDULED_MAX_ATTEMPTS &&
    data?.status === "retry-scheduled";
    attempt += 1
  ) {
    // Ask the worker when this task becomes eligible again. A missing record
    // means the task is no longer deferred (it completed or was permanently
    // classified), so the worker's own estimate is kept and the request is
    // re-issued anyway — the only way to fetch a final result.
    let statusWaitSeconds = Math.max(1, Number(data?.retryAfterSeconds) || 10);
    if (typeof data?.taskId === "string" && data.taskId) {
      try {
        const statusResponse = await fetch(
          `/api/task/${encodeURIComponent(data.taskId)}`,
          { signal },
        );
        const status = await statusResponse.json();
        if (status?.status === "retry-scheduled") {
          statusWaitSeconds = Math.max(
            1,
            Number(status.retryAfterSeconds) || statusWaitSeconds,
          );
        }
      } catch {
        // Status poll failed: fall back to the worker's own estimate.
      }
    }
    const waitMs = Math.max(
      RETRY_SCHEDULED_MIN_WAIT_MS,
      Math.min(statusWaitSeconds * 1000, RETRY_SCHEDULED_MAX_WAIT_MS),
    );
    await sleepResumable(waitMs, signal);
    response = await fetchHostedResponse(fetchOptions);
    try {
      data = await response.json();
    } catch (err) {
      // A user-initiated abort must propagate so callers can stop cleanly.
      if (err?.name === "AbortError" || signal?.aborted) throw err;
      data = {};
    }
  }
  if (data?.status === "retry-scheduled") {
    throw new Error(
      "The hosted AI service is temporarily busy and its recovery is still scheduled. Please try again shortly.",
    );
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Authentication required. Please log in.");
    }
    const serverMsg =
      typeof data?.error === "string"
        ? data.error
        : data?.error?.message || data?.message || `HTTP ${response.status}`;
    // Plan walls and rate limits carry a sentence written for the user; keep it
    // verbatim instead of wrapping it in transport language.
    if (response.status === 402 || data?.code === "plan_limit") {
      throw new Error(
        serverMsg === `HTTP ${response.status}`
          ? "You have used up your plan's monthly allowance. Upgrade in Settings → Billing to keep going."
          : serverMsg,
      );
    }
    const detail =
      typeof data?.detail === "string" && data.detail.trim()
        ? ` (${data.detail.trim()})`
        : "";
    throw new Error(`Hosted AI request failed: ${serverMsg}${detail}`);
  }

  // Defense-in-depth: reasoning text must never reach the user. The worker
  // already strips it (including inline blocks split across stream chunks),
  // but a cached/legacy response or a direct path must never leak it either.
  const strippedContent = stripThinkingBlocks(
    typeof data?.content === "string" ? data.content : ""
  );
  const rawContent = strippedContent || null;

  if (!rawContent) {
    throw new Error("Hosted AI returned only reasoning and no answer.");
  }

  // Persist project memory returned by the worker so the next follow-up turn
  // edits the existing implementation (delta-first) instead of rebuilding.
  if (data?.projectState && typeof data.projectState === "object") {
    persistedProjectState = data.projectState;
    onProjectStateChange?.(data.projectState);
  }

  // 3. Local Reflection & Bounded Repair Loop
  const initialEval = evaluateResponse(rawContent, contract, fineIntent);
  let finalContent = rawContent;
  let repaired = false;

  if (!initialEval.isCompliant) {
    // Progress-aware repair: repairResponse iterates while each pass makes a
    // material change and stops when the response is compliant or blocked.
    const repairResult = repairResponse(
      rawContent,
      initialEval,
      contract,
      Number.MAX_SAFE_INTEGER,
      0,
      fineIntent,
    );
    finalContent = repairResult.finalContent;
    repaired = repairResult.repaired;
  }

  // 4. Record anonymous quality signal
  recordQualitySignal({
    intentType: fineIntent?.primaryIntent || fineIntent?.type,
    confidence: fineIntent?.confidence || 0,
    selectedSkillsCount: resolved.skills.length,
    isCompliant: initialEval.isCompliant,
    violationsCount: initialEval.violations.length,
    repaired,
  });

  return finalContent;
}


// Generate concise, natural AI responses for any public user
export async function generateLocalAIResponse(
  prompt,
  hostedError = null,
  signal = null,
) {
  const cleanPrompt = prompt.trim();
  const lower = cleanPrompt.toLowerCase();
  const intent = analyzePublicUserIntent(cleanPrompt);

  // Natural short latency (0.6s), abortable so Stop interrupts the fallback
  // like every other generation path.
  await sleepResumable(600, signal);

  // Revision context: the user asked to revise an embedded code block. Never
  // discard their code or fabricate a different app — report the real status.
  const revisionMatch = cleanPrompt.match(
    /\[(?:SURGICAL REVISION CONTEXT|Context: The user is requesting a revision)/i,
  );
  const hasEmbeddedCode = cleanPrompt.includes("```");
  let userRequestPart =
    cleanPrompt
      .split(/User Request:\s*/i)
      .slice(-1)[0]
      ?.trim() || "";
  // For surgical context, extract the actual user revision request without the surrounding boilerplate
  if (!userRequestPart || isRevisionContextPrompt(cleanPrompt)) {
    const surgicalMatch = cleanPrompt.match(
      /User Revision Request:\s*([\s\S]*?)(?:\n\[INSTRUCTION\]:|\n\[Attached files\]|$)/i,
    );
    if (surgicalMatch && surgicalMatch[1].trim()) {
      userRequestPart = surgicalMatch[1].trim().split("\n")[0].trim();
    } else {
      // Fallback: try to extract "Revise code: ..." line
      const reviseLine = cleanPrompt.match(/Revise code:[^\n]*/i);
      if (reviseLine) userRequestPart = reviseLine[0].trim();
    }
  }
  // Clean up any remaining attachment metadata from the displayed request
  userRequestPart = userRequestPart
    .replace(/\n\[Attached files\][\s\S]*$/, "")
    .trim();

  if (revisionMatch) {
    const reason = describeHostedUnavailable(hostedError);
    return `I can see the code you want to revise, but I couldn't apply your revision (${userRequestPart || "no request captured"}).${reason} Your code has not been changed.`;
  }

  // 1. GREETINGS & SMALL TALK (Universal & Natural)
  if (
    /^(hello|hi|hey|greetings|good morning|good afternoon|good evening|howdy|sup)(\s|!|\.|\?|$)/i.test(
      lower,
    ) ||
    lower.includes("who are you") ||
    lower.includes("what can you do")
  ) {
    return `Hello! I'm COREZ AI. How can I help you today?`;
  }

  // 2. CREATOR FACT
  if (
    /\bwho\b.{0,20}\b(created|made|built|invented|developed)\b|\b(created|made|built|invented|developed)\b.{0,30}\b(corez|core z)\b/i.test(
      lower,
    )
  ) {
    return `**Corez was founded and developed by:**

- [Zayne Mundo](https://www.linkedin.com/in/zayne-mundo/) — **Founder & Lead Developer**
- [Christian Vestil](https://www.linkedin.com/in/christian-jericson-belderol/) — **Quality Assurance Tester**
- [Renz Cardona](https://www.linkedin.com/in/renz-cardona-5941051b9/) — **Chief Innovation Officer**

**Why Corez exists?** Corez is a conversational AI creation platform that helps people turn ideas into working digital products without needing to code. Rather than only answering questions, it understands your intent and takes it all the way from idea to launch:

- **Create** — websites, apps, games, tools, images, research reports and more
- **Preview** — watch your creation come to life in a live preview
- **Refine** — revise and polish it right through the chat
- **Publish** — share your finished product with a shareable link

Its core purpose is to remove the technical gap between having an idea and launching something functional, making digital creation accessible to designers, marketers, entrepreneurs, students and everyday users. In short, Corez turns plain conversation into creation — anyone can go from a first spark of an idea to a finished, shareable product.`;
  }

  if (
    /^(how are you|how is it going|how's it going)(\s|!|\.|\?|$)/i.test(lower)
  ) {
    return `Doing great! Ready to help whenever you are. What's on your mind?`;
  }

  // 3. GRATITUDE INTENT
  if (
    /^(thanks|thank you|awesome|great|cool|nice|perfect)(\s|!|\.|$)/i.test(
      lower,
    )
  ) {
    return `You're very welcome! Let me know if there's anything else I can help with.`;
  }

  // 4. PUBLIC APP / GAME / WIDGET CREATION INTENT
  // Only synthesize a brand-new experience for genuine creation prompts; a
  // prompt that already embeds code is a revision/analysis of existing code.
  // Games are NEVER canned: the hosted CoreZ AI is the only creator. When it
  // is unavailable, say so instead of substituting a template game.
  if (
    intent.type === "app" &&
    !hasEmbeddedCode &&
    !/^revise\s/i.test(cleanPrompt)
  ) {
    if (
      isGameDevIntent(cleanPrompt) ||
      intent.primaryIntent === "game_creation"
    ) {
      const reason = describeHostedUnavailable(hostedError);
      return `I'd love to build that game for you, but ${reason.trim()} — so I can't create it right now. Your request was received; please try again in a moment.`;
    }
    const reason = describeHostedUnavailable(hostedError);
    return `I'd love to build that for you, but ${reason.trim()} — so I can't create this specific app right now. Your request was received; please try again in a moment.`;
  }

  // 5. PUBLIC USER INTENT RESPONSES
  if (intent.type === "code-help") {
    if (hasEmbeddedCode) {
      const reason = describeHostedUnavailable(hostedError).replace(
        /^ The hosted AI service is unavailable/,
        "",
      );
      return `I can see the code you shared, but the hosted AI service is currently unavailable${reason}, so I couldn't analyse or revise it. Please check the AI service configuration and try again — your code has not been changed.`;
    }
    return `I understand the goal: ${intent.summary}\n\nShare the snippet, error message, or file you are working on. I'll walk through what is happening, identify the likely cause, propose a fix, and explain how to verify it so you can move forward without guessing.`;
  }

  if (intent.type === "writing") {
    return `I understand the goal: ${intent.summary}\n\nSend me the rough text, audience, and tone you want. I'll turn it into clear public-facing copy, tighten the message, and give you a polished version plus a short explanation of why it works.`;
  }

  if (intent.type === "explanation") {
    const reason = describeHostedUnavailable(hostedError);
    return `I can't properly answer "${cleanPrompt}" right now because the hosted AI service is currently unavailable.${reason}\n\nRetry in a moment and I'll explain it directly in plain language. If you'd rather work through it yourself in the meantime, this framework keeps any topic approachable:\n\n1. **Core idea** — define the topic in one everyday sentence.\n2. **Why it matters** — connect it to what you're trying to accomplish.\n3. **Key parts** — two or three simple pieces, each with a concrete example.\n4. **Next step** — one small action to test your understanding.`;
  }

  const fallbackReason = describeHostedUnavailable(hostedError);
  // For surgical revisions, don't leak the internal context — show just the user request
  const displayPrompt =
    isRevisionContextPrompt(cleanPrompt) && userRequestPart
      ? userRequestPart
      : cleanPrompt.slice(0, 120);
  const safeDisplay =
    displayPrompt
      .replace(
        /\[SURGICAL REVISION CONTEXT[\s\S]*?\[INSTRUCTION\]:[\s\S]*/i,
        "",
      )
      .trim()
      .slice(0, 120) || displayPrompt.slice(0, 80);
  return `I can't act on "${safeDisplay}" right now because the hosted AI service is currently unavailable.${fallbackReason}\n\nRetry in a moment and I'll turn it into a plan, a written answer, code, or a live preview depending on what you need.`;
}


export async function generateAIResponse(
  prompt,
  history = [],
  signal = null,
  onDelta = null,
  onPhase = null,
  onClear = null,
  retryOpts = {},
  onThinking = null,
) {
  // Explicit commands first: @website, @game, @research, @image. The command
  // token is stripped before any model sees the prompt, so the AI is never
  // confused by it.
  const { command, rest } = parseSlashCommand(prompt);
  if (command === "research") {
    return runResearchCommand(rest, history, signal);
  }
  if (command === "image") {
    return runImageCommand(rest, history, signal);
  }

  let cleanPrompt =
    command === "website" || command === "game" ? rest : prompt.trim();
  if (!cleanPrompt)
    cleanPrompt = command === "game" ? "Build a game" : "Build a website";
  const intent = analyzePublicUserIntent(cleanPrompt);

  // @website and @game force the exact intent the user asked for instead of
  // letting the classifier guess.
  if (command === "website") {
    intent.type = "app";
    intent.primaryIntent = "website_creation";
    intent.summary = "Create a public website or web page.";
    intent.confidence = 1;
    if (
      !/\b(website|web ?site|landing|page|site|homepage)\b/i.test(cleanPrompt)
    ) {
      cleanPrompt = `Build a website: ${cleanPrompt}`;
    }
  } else if (command === "game") {
    intent.type = "app";
    intent.primaryIntent = "game_creation";
    intent.summary = "Create a playable game.";
    intent.confidence = 1;
    if (!/\b(game|playable|arcade|simulator)\b/i.test(cleanPrompt)) {
      cleanPrompt = `Build a game: ${cleanPrompt}`;
    }
  }

  // Live web information: route to real search results (worker provider
  // chain), answered by the hosted AI with grounded sources — or the sources
  // themselves when the hosted AI is unavailable. CoreZ never fabricates
  // current information from its own training.
  if (isWebSearchRequest(cleanPrompt)) {
    try {
      const grounded = await answerWithWebSearch(
        cleanPrompt,
        intent,
        history,
        signal,
      );
      if (typeof grounded === "string" && grounded.trim()) return grounded;
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      // Search is best-effort: fall through to the normal AI path when the
      // search service itself fails (offline, no provider, etc.).
      console.warn(
        "Web search unavailable; falling back to the standard AI path.",
        error,
      );
    }
  }

  // Explicit image requests always route to the image-generation endpoint, regardless of
  // conversation length. Previously the history.length <= 1 gate let image requests
  // mid-conversation fall through to the LLM, which answered with raw SVG markup.
  if (isExplicitImageRequest(cleanPrompt)) {
    // Mixed requests ("what is X and show me an image") answer the question AND
    // render the image instead of dropping the explanation.
    if (isMixedQuestionImageRequest(cleanPrompt)) {
      try {
        return await handleMixedQuestionImageRequest(
          cleanPrompt,
          intent,
          history,
          signal,
        );
      } catch (mixedErr) {
        if (mixedErr?.name === "AbortError") throw mixedErr;
        console.warn(
          "Mixed question+image request failed; falling back to image-only path.",
          mixedErr,
        );
      }
    }
    try {
      const requestedModelExplicit = detectRequestedImageModel(
        cleanPrompt,
        history,
      );
      const imageUrl = await generateImage(
        cleanPrompt,
        signal,
        extractReferenceImage(history),
        requestedModelExplicit ? { model: requestedModelExplicit } : {},
      );
      if (imageUrl) {
        return `![](${imageUrl})`;
      }
    } catch (imgError) {
      if (imgError?.name === "AbortError") throw imgError;
      console.warn(
        "Image generation error; falling back to standard text response.",
        imgError,
      );
    }
  }

  const {
    maxPersistentAttempts,
    baseDelayMs,
    maxDelayMs,
    innerRetryDelaysMs,
    buildInProgressDelaysMs,
  } = resolvePersistentRetryOpts(retryOpts);

  const buildHostedStreamOpts = () => ({
    stream: typeof onDelta === "function",
    onDelta,
    onPhase,
    onClear,
    ...(typeof onThinking === "function" ? { onThinking } : {}),
    ...(innerRetryDelaysMs ? { retryDelaysMs: innerRetryDelaysMs } : {}),
  });

  const callHostedOnce = async (promptToSend) => {
    // The app requests STREAMING responses: the worker answers with SSE
    // events (meta/delta/phase/done) so the user sees the answer and the
    // build phases live as they happen. Direct API clients may still send
    // stream:false and receive the finished artifact as one JSON body.
    const hostedAiResponse = await generateHostedAIResponse(
      promptToSend,
      intent,
      history,
      signal,
      buildHostedStreamOpts(),
    );
    if (!hostedAiResponse) return null;
    // Check if the AI decided to generate an image
    const imageMatch = hostedAiResponse.match(/\[IMAGE_PROMPT:\s*(.*?)\]/i);
    if (imageMatch) {
      const imagePrompt = imageMatch[1].trim();
      try {
        const requestedModelTag = detectRequestedImageModel(
          imagePrompt + " " + cleanPrompt,
          history,
        );
        const imageUrl = await generateImage(
          imagePrompt,
          signal,
          extractReferenceImage(history),
          requestedModelTag ? { model: requestedModelTag } : {},
        );
        if (imageUrl) {
          // Replace the tag with the actual image markdown
          return hostedAiResponse.replace(imageMatch[0], `![](${imageUrl})`);
        }
      } catch (imgError) {
        if (imgError?.name === "AbortError") throw imgError;
        console.warn("Image generation error from AI tag.", imgError);
      }
    }
    return hostedAiResponse;
  };

  // Persistent keep-trying loop: never surface a hosted-unavailable give-up
  // while the failure looks transient. The same request is re-issued with
  // backoff up to maxPersistentAttempts, then the honest local fallback is
  // returned — the UI shows a real error instead of loading forever.
  // Only genuine instant answers (greetings, thanks, creator fact, ...) are
  // returned from the local fallback without retrying; everything else that
  // needs the hosted AI retries first. Authentication failures are
  // non-retryable and return the login message immediately.
  let persistentAttempt = 0;
  let buildInProgressAttempt = 0;
  let promptToSend = cleanPrompt;
  let usedExplicitRetryPrefix = false;
  let lastHostedError = null;

  while (true) {
    persistentAttempt += 1;
    if (signal?.aborted) throw abortError();
    try {
      const hostedResult = await callHostedOnce(promptToSend);
      if (hostedResult) return hostedResult;
      throw new Error("Hosted AI returned no content.");
    } catch (hostedAiError) {
      if (hostedAiError?.name === "AbortError" || signal?.aborted) {
        throw hostedAiError?.name === "AbortError"
          ? hostedAiError
          : abortError();
      }
      if (/Authentication required/i.test(hostedAiError?.message || "")) {
        return "Please log in to continue. Your session may have expired — refresh the page and sign in again, then retry your request.";
      }
      // Empty streaming is often transient (model overloaded,
      // reasoning-only) — try once immediately with a more explicit prompt
      // before entering the backoff ladder.
      if (
        /empty streaming response|empty or reasoning-only/i.test(
          hostedAiError?.message || "",
        ) &&
        !usedExplicitRetryPrefix &&
        !cleanPrompt.startsWith("[RETRY]")
      ) {
        usedExplicitRetryPrefix = true;
        promptToSend = `[RETRY] Explain clearly and directly: ${cleanPrompt}`;
        try {
          // The failed attempt may already have streamed partial deltas into
          // the bubble — clear them so the retry does not play on top and the
          // user sees one answer, not a partial plus a full repeat.
          try {
            onClear?.();
          } catch {}
          const retryResponse = await callHostedOnce(promptToSend);
          if (retryResponse) return retryResponse;
        } catch (retryErr) {
          if (retryErr?.name === "AbortError" || signal?.aborted) throw retryErr;
          lastHostedError = retryErr;
          console.warn("Explicit retry also failed, entering backoff.", retryErr);
        }
      }
      lastHostedError = lastHostedError || hostedAiError;
      // Preserve the original failure for the backoff report when the
      // explicit retry above already ran.
      const reportableError = hostedAiError;

      // First failure: return immediately only when the local engine can
      // answer without the hosted AI (greetings, thanks, creator, writing
      // guidance, ...). Hosted-required prompts fall through to retry —
      // their local "I can't act ..." give-up is never returned.
      // Cached so the single-attempt (test / opt-out) path does not pay the
      // 600ms local latency twice.
      let firstLocal = null;
      let firstLocalChecked = false;
      if (persistentAttempt === 1) {
        try {
          firstLocal = await generateLocalAIResponse(
            cleanPrompt,
            reportableError,
            signal,
          );
          firstLocalChecked = true;
          if (firstLocal && !isHostedUnavailableFallback(firstLocal))
            return firstLocal;
        } catch (localErr) {
          if (localErr?.name === "AbortError" || signal?.aborted)
            throw localErr;
        }
      }

      // The worker owns a live build for this exact request: wait for it
      // instead of failing. A later retry replays the finished artifact, so the
      // user gets their creation rather than a local template.
      if (isBuildInProgressError(reportableError)) {
        buildInProgressAttempt += 1;
        if (buildInProgressAttempt > BUILD_IN_PROGRESS_MAX_ATTEMPTS) {
          console.warn(
            "Build still owned by the worker after the bounded wait; asking the user to re-send.",
            reportableError,
          );
          return `Your build is taking longer than this tab can wait for — ${BUILD_IN_PROGRESS_MESSAGE}.`;
        }
        const delayMs = Array.isArray(buildInProgressDelaysMs)
          ? (buildInProgressDelaysMs[buildInProgressAttempt - 1] ??
            buildInProgressDelaysMs[buildInProgressDelaysMs.length - 1] ??
            0)
          : getBuildInProgressDelay(buildInProgressAttempt);
        try {
          onClear?.();
        } catch {}
        try {
          onPhase?.({
            phase: "waiting-for-build",
            attempt: buildInProgressAttempt,
            total: BUILD_IN_PROGRESS_MAX_ATTEMPTS,
            delayMs,
          });
        } catch {}
        console.warn(
          `Your build is still running on the server; waiting ${delayMs}ms before fetching it...`,
          reportableError,
        );
        await sleepResumable(delayMs, signal);
        lastHostedError = null;
        continue;
      }
      if (!isRetryableHostedError(reportableError)) {
        console.warn(
          "Hosted AI unavailable with non-retryable error; using local Corez fallback.",
          reportableError,
        );
        if (firstLocalChecked && firstLocal) return firstLocal;
        return generateLocalAIResponse(cleanPrompt, reportableError, signal);
      }
      if (persistentAttempt >= maxPersistentAttempts) {
        if (!(Number(maxPersistentAttempts) > 1)) {
          console.warn(
            "Hosted AI unavailable; using local Corez fallback.",
            lastHostedError || reportableError,
          );
        } else {
          console.warn(
            "Hosted AI unavailable after persistent retries; using local Corez fallback.",
            lastHostedError || reportableError,
          );
        }
        if (firstLocalChecked && firstLocal) return firstLocal;
        return generateLocalAIResponse(
          cleanPrompt,
          lastHostedError || reportableError,
          signal,
        );
      }
      const delayMs = getPersistentRetryDelay(
        persistentAttempt,
        baseDelayMs,
        maxDelayMs,
      );
      try {
        onClear?.();
      } catch {}
      try {
        onPhase?.({
          phase: "retrying",
          attempt: persistentAttempt,
          delayMs,
          message: reportableError?.message || "Hosted AI unavailable, retrying...",
        });
      } catch {}
      console.warn(
        `Hosted AI attempt ${persistentAttempt} failed; retrying in ${delayMs}ms...`,
        reportableError,
      );
      await sleepResumable(delayMs, signal);
      lastHostedError = null;
    }
  }
}
