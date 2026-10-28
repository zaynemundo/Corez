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
  process as processPromptIntelligence,
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
import { buildAwwwardsDesignPrompt } from "../../packages/agent-core/context/designTokens.js";
import { stripThinkingBlocks } from "../../packages/agent-core/providers/text.js";
import { resolveSkills } from "../skills/resolver.js";
import { stripJunkAfterDocumentEnd } from "../utils/htmlRepair.js";
import {
  ensureLeadingPageMarker,
  findArtifactStartIndex,
} from "../utils/previewTransformer.js";
import { classifyExecutionMode } from "./executionModes.js";
import { persistAndSummarize } from "./contextStore.js";
import { fetchAwwwardsInspiration } from "./inspirationService.js";
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
  WRITING_JOB_GUARD,
  IMAGE_REQUEST_TAIL,
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
};
import {
  retrieveSemanticCodePatterns,
  formatRetrievedPatternsForPrompt,
} from "./semanticCodeRetrieval.js";

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

const GAME_DEV_PATTERNS =
  /\b(game|gamedev|game development|play|chess|snake|pong|shooter|arcade|platformer|canvas game|2d game|3d game|simulator|physics sandbox|bot enemy|rpg|enemy|space defender|retro game|interactive game)\b|\b(build|make|create|develop|design)\b.*\b(game|simulator|simulation|sandbox)\b/i;

export function isGameDevIntent(prompt) {
  if (!prompt) return false;
  return GAME_DEV_PATTERNS.test(prompt);
}

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

// Social-media carousel copy ("create a post for this carousel",
// "LinkedIn/Instagram carousel post + caption") is WRITING, not a UI build.
// Instruction prefix only (first ~300 chars) so pasted body copy containing
// "research"/"design" cannot hijack intent. Explicit UI terms
// ("carousel component/UI/code/website") opt back into a build.
export function isSocialCarouselCopyRequest(prompt) {
  if (!prompt || typeof prompt !== "string") return false;
  const instruction = String(prompt).slice(0, 400).toLowerCase();
  const hasSocial =
    /\b(create|write|draft|compose|make|generate|need|want)\b.{0,60}\b(post|caption|carousel post|linkedin post|instagram post|social post)\b/i.test(
      instruction,
    ) ||
    /\bpost\s+for\s+(this|that|my|our|a|the)\s+carousel\b/i.test(instruction) ||
    (/\bcarousel\b/i.test(instruction) &&
      /\b(post|caption|hashtags?|slide\s+\d|slide\s+breakdown)\b/i.test(
        instruction,
      ));
  if (!hasSocial) return false;
  const hasExplicitUI =
    /\bcarousel\b.{0,30}\b(component|widget|\bui\b|ux|slider|code|react|jsx|html|website|web\s?app|landing\s?page)\b/i.test(
      instruction,
    ) ||
    /\b(build|code|develop|program)\b.{0,30}\b(carousel|slider)\b.{0,30}\b(component|widget|\bui\b|code|website|app)\b/i.test(
      instruction,
    );
  return !hasExplicitUI;
}

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

export async function improveCodingPrompt(prompt, intent = null) {
  const cleanPrompt = typeof prompt === "string" ? prompt.trim() : "";
  if (!cleanPrompt) return cleanPrompt;

  // Social-carousel copy must never receive a coding spec (React/HTML) even if
  // an upstream classifier mislabels it as an app build.
  if (isSocialCarouselCopyRequest(cleanPrompt)) {
    return cleanPrompt;
  }

  const currentIntent = intent || analyzePublicUserIntent(cleanPrompt);
  const intentType = currentIntent?.type || "general";

  // A website mention without an explicit website request (same rules as
  // @image) must not be enriched as an app/website build.
  const websiteMentioned =
    /\b(website|web\s?site|landing page|webpage|web app|homepage|portfolio site|dashboard|admin panel|portal|saas|site)\b/i.test(
      cleanPrompt,
    );
  const websiteBlocked =
    websiteMentioned && !isExplicitWebsiteRequest(cleanPrompt);

  const isCoding =
    intentType === "code-help" ||
    (intentType === "app" && !websiteBlocked) ||
    INTENT_PATTERNS.code.test(cleanPrompt) ||
    (INTENT_PATTERNS.app.test(cleanPrompt) && !websiteBlocked);
  if (!isCoding) {
    return cleanPrompt;
  }

  const isAppIntent =
    (intentType === "app" && !websiteBlocked) ||
    (INTENT_PATTERNS.app.test(cleanPrompt) && !websiteBlocked);

  // Game creation: respond with a SMALL brief, not a feature dump.
  const isGameRequest =
    currentIntent?.primaryIntent === "game_creation" ||
    /\b(build|create|make|generate|design|want|need|give|show|play)\b.{0,60}\b(game|arcade|platformer|pong|snake|tetris|flappy|simulator|puzzle|shooter|rpg|runner|clicker)\b/i.test(
      cleanPrompt,
    );

  // Build the Awwwards design spec + live inspiration once for app requests.
  // The live references are best-effort: failure never blocks and never
  // fabricates sites.
  const useWebDesignReferences = isAppIntent && !isGameRequest;
  const designSpec = useWebDesignReferences
    ? buildAwwwardsDesignPrompt(cleanPrompt)
    : "";

  // Both enrichment lookups are OPTIONAL context, and each one is a network
  // round trip of its own (the worker's Awwwards scrape alone is allowed up to
  // 8s). They used to run one after the other on the critical path, so the
  // model request waited for the sum of both before it was even issued. Start
  // them together, give each a bounded budget, and let the model request go as
  // soon as they settle: a slow third party can then cost at most its budget
  // instead of the whole build start.
  const OPTIONAL_CONTEXT_BUDGET_MS = 2500;
  const withOptionalBudget = (task, ms = OPTIONAL_CONTEXT_BUDGET_MS) => {
    let timer;
    const budget = new Promise((resolve) => {
      timer = setTimeout(() => resolve(""), ms);
    });
    return Promise.race([task.catch(() => ""), budget]).finally(() =>
      clearTimeout(timer),
    );
  };

  const liveInspirationTask = useWebDesignReferences
    ? (async () => {
        try {
          const { sites } = await fetchAwwwardsInspiration(cleanPrompt, null);
          if (sites.length === 0) return "";
          return `\n\n--- Live Awwwards Design Inspiration (real references) ---\n${sites
            .map((site) => {
              let text = `- ${site.title} — ${site.url}`;
              if (site.liveUrl) text += ` (Live site: ${site.liveUrl})`;
              if (site.description)
                text += `\n  Design approach: ${site.description}`;
              if (site.tags && site.tags.length > 0)
                text += `\n  Visual elements: ${site.tags.join(", ")}`;
              return text;
            })
            .join(
              "\n\n",
            )}\n\nUse these award-winning sites as visual direction for layout, typography, colour, and interaction quality.`;
        } catch {
          return "";
        }
      })()
    : null;

  // Retrieve relevant code patterns via semantic embedding search
  const semanticPatternsTask = (async () => {
    try {
      const patterns = await retrieveSemanticCodePatterns(cleanPrompt, {
        topK: 1,
        minSimilarity: 0.15,
      });
      return formatRetrievedPatternsForPrompt(patterns);
    } catch {
      return "";
    }
  })();

  const [liveInspiration, semanticPatternsPrompt] = await Promise.all([
    liveInspirationTask
      ? withOptionalBudget(liveInspirationTask)
      : Promise.resolve(""),
    withOptionalBudget(semanticPatternsTask),
  ]);

  // Simple revision handling: just return the prompt with code as-is, no surgical spec
  if (isRevisionContextPrompt(cleanPrompt)) {
    return `${cleanPrompt}${semanticPatternsPrompt}`;
  }

  // Use the Prompt Intelligence Engine for structured enrichment
  try {
    const pipelineResult = await processPromptIntelligence({
      prompt: cleanPrompt,
      dryRun: true,
    });

    if (
      pipelineResult &&
      pipelineResult.executionPrompt &&
      pipelineResult.executionPrompt !== cleanPrompt
    ) {
      // Website/app builds may use live web-design references. Games derive
      // their visual direction from the user request and genre instead.
      return isAppIntent
        ? `${pipelineResult.executionPrompt}\n\n${designSpec}${liveInspiration}${semanticPatternsPrompt}`
        : pipelineResult.executionPrompt;
    }
  } catch {
    // Fall back to legacy enhancement on pipeline failure
  }

  if (isAppIntent) {
    if (isGameRequest) {
      return `${cleanPrompt}

[SINGLE-FILE GAME SPECIFICATION]:
- MANDATORY CHAT BRIEF: your response MUST begin with a 1-2 sentence chat brief BEFORE the code block — game title in bold, what the player does to win/lose, and the controls. Example: "Here's **Neon Pong** — bounce the ball past your rival to score. Move with the Arrow keys, Space to launch." NEVER output a bare code block with no brief. NEVER write a long feature list, architecture summary, or "I built..." paragraph.
- GAME ART DIRECTION: Follow any visual style the user explicitly requests. Otherwise infer a distinctive style from the game's genre, setting, mechanics, and audience; do NOT default to retro, pixel art, neon, or any other fixed aesthetic. Include a designed start screen and game-over screen, HUD, color palette, and typography that fit the game world. NEVER apply generic web "dark glassmorphism", glass panels, or luxury web-app styling to games.
- Build a complete, runnable, self-contained single-file HTML canvas game inside ONE SINGLE \`\`\`html ... \`\`\` code block with inline <style> and <script> tags.
- FULLSCREEN GAME REQUIREMENT: The game MUST fill the entire preview viewport — html/body with width:100%, height:100%, margin:0, overflow:hidden; a full-viewport canvas (width:100%, height:100%, display:block) with NO max-width, NO bordered box, NO rounded container around the game. Keep a fixed internal game resolution (e.g. 960x540) and scale it to the viewport with ctx.setTransform + a resize listener so the game always fills the screen.
- MOBILE: size the canvas from visualViewport (not just innerHeight) and listen for orientationchange; include on-screen touch controls (left/right/jump/action buttons) shown only on touch or coarse-pointer devices, bound with touchstart/touchend/touchcancel.
- COMPLETENESS CHECK before you finish: implement EVERY feature and rule you promise in the brief — score, lives, levels, enemies, collisions, win/lose states, menus — with no stubs, no TODOs, and no placeholder functions; the game must be fully playable end-to-end.
- GAME LOOP: fixed-timestep simulation — accumulate real dt (clamped to max 0.1s) and run update() in fixed STEP=1/60 increments inside requestAnimationFrame; never tie movement or physics directly to raw frame dt.
- CONTROLS: poll a held-key map every frame using e.code (layout-independent: KeyW/ArrowLeft/Space); preventDefault() scrolling keys (arrows/space); for mouse-look games use Pointer Lock; poll navigator.getGamepads() with a deadzone where controllers fit.
- AUDIO: procedural Web Audio SFX (jump, collect, hit, win, lose) plus a simple looping music pattern — zero external audio files; create AND resume() the AudioContext ONLY inside a user gesture (Start button click/keypress); add a mute toggle on M.
- ARCHITECTURE: explicit game-state machine (START/PLAYING/PAUSED/GAMEOVER/VICTORY, pausing on visibilitychange) and entity AI states (idle/patrol/chase/attack/flee); pool bullets/particles/enemies — reuse objects, never allocate with \`new\` inside the per-frame loop.
- GAME FEEL: screen shake on hits, hit-flash, particle bursts, floating score popups, and difficulty that ramps with score/time.
- ENEMY AI: give enemies a behavior ladder — patrol waypoints, chase on sight with steering (seek/flee/wander), grid pathfinding in mazes — scaled by a difficulty factor.
- PORTAL-READY: viewport meta and resize handling (already required above), zero external requests except approved CDNs, fully playable while muted.
- Output ONLY the brief followed by the code block — NO feature summary, NO step-by-step guide, NO closing paragraph after the code.`;
    }

    const isExplicitNonJsx =
      /\b(html\b|css\b|vanilla|plain html|pure html|html\/css|raw html|html\s*\+\s*css|vanilla js)\b/i.test(
        cleanPrompt,
      );
    const isOneShot =
      /\b(oneshot|one-shot|one shot|single[- ]page|one[- ]page)\b/i.test(
        cleanPrompt,
      );

    if (isExplicitNonJsx) {
      return `${cleanPrompt}

${designSpec}${liveInspiration}${semanticPatternsPrompt}

[SINGLE-FILE HTML/CSS/JS SPECIFICATION]:
- ALWAYS begin your response with a clear, detailed overview explaining the features, layout, and styling choices!
- NEVER mention "Awwwards", "Awwwards-inspired", or internal prompt buzzwords in your output or preamble text. Describe your creation naturally without meta-commentary.
- Ensure proper visual layering and z-index stacking hierarchy (Background z-index:0 -> Content z-index:10 -> HUD/Toolbars z-index:20-30 -> Modals/Overlays z-index:40-50+) so elements don't obscure interactive controls!
- Output complete, clean HTML/CSS/JS code inside ONE SINGLE \`\`\`html ... \`\`\` code block including inline \`<style>\` and \`<script>\` tags.
- ${isOneShot ? "ONE-SHOT MODE: output ONE single page only — no sub-pages, no markers." : "MULTI-PAGE BY DEFAULT: output a multi-page website unless the user explicitly asked for ONE-SHOT (single page only). For multi-page output, put every page as its own complete standalone HTML document inside the SAME single code block. Write ONE marker line immediately BEFORE each page, INCLUDING the home page:"}
  <!-- PAGE: index.html -->
  <!DOCTYPE html>... complete home page with inline <style>/<script> ...
  <!-- PAGE: about.html -->
  <!DOCTYPE html>... complete about page ...
  The home page MUST have its own <!-- PAGE: index.html --> line above it, and nothing (no HTML, no prose) may appear before that first marker — never write a page before its marker.
  Link pages with PLAIN RELATIVE anchors ONLY: <a href="about.html">About</a>. Never use a leading slash or absolute URL for internal links (never "/about.html", "https://...", or "corez.pro/...") — the preview and the published site serve every page under its own folder (corez.pro/<slug>/about.html), so only bare relative filenames resolve to the right URL. Keep filenames lowercase like index.html, about.html, contact.html (max 12 pages). COMPLETENESS CHECK before you finish: the FIRST line of the artifact is <!-- PAGE: index.html -->, make every <a href="..."> point to a page you actually output (a link to a page you never created is a broken site), and keep every page a complete standalone HTML document.
- ONE-SHOT MODE: ONLY when the user explicitly asked for "oneshot" (or "one shot", "single page", "one page"), output ONE single page only (no sub-pages, no markers).
- Build a complete, responsive, standalone experience ready for the preview canvas.
- IMPLEMENTATION CHECK before you finish: implement EVERY feature you describe in the overview and every control the user asked for — no stubs, no TODOs, no placeholder functions; every button, form, and interactive element must actually work.
- ALWAYS end your response with a step-by-step user guide and feature summary after the code block! Never output ONLY a bare code block.`;
    }

    return `${cleanPrompt}

${designSpec}${liveInspiration}${semanticPatternsPrompt}

[SINGLE-FILE REACT SPECIFICATION]:
- ALWAYS begin your response with a clear, detailed overview explaining the features, architecture, styling decisions, and layout choices!
- NEVER mention "Awwwards", "Awwwards-inspired", or internal prompt buzzwords in your output or preamble text. Describe your creation naturally without meta-commentary.
- Ensure proper visual layering and z-index stacking hierarchy (Background z-index:0 -> Content z-index:10 -> HUD/Toolbars z-index:20-30 -> Modals/Overlays z-index:40-50+) so elements don't obscure interactive controls!
- Output clean, modern React/JSX code inside ONE SINGLE \`\`\`jsx ... \`\`\` code block starting with \`export default function App()\`.
- DO NOT wrap React code inside HTML boilerplate (\`<!DOCTYPE html>\`, \`<head>\`, \`<script type="text/babel">\`, or \`ReactDOM.createRoot()\`) because the preview canvas automatically compiles and renders React/JSX code!
- Do NOT split your output into multiple separate code blocks, file headers (// App.tsx, // components/Navbar.tsx), or relative file imports (import Navbar from './components/Navbar').
- Define all child components (Navbar, Hero, Footer, etc.) inline within the SAME file BEFORE the main App component!
- MULTI-PAGE BY DEFAULT: build a multi-page website unless the user explicitly asked for ONE-SHOT (single page only). For multi-page output, switch to plain HTML and output every page as its own complete standalone HTML document inside the SAME single \`\`\`html ... \`\`\` code block. Write ONE marker line immediately BEFORE each page, INCLUDING the home page:
  <!-- PAGE: index.html -->
  <!DOCTYPE html>... complete home page ...
  <!-- PAGE: about.html -->
  <!DOCTYPE html>... complete about page ...
  The home page MUST have its own <!-- PAGE: index.html --> line above it, and nothing (no HTML, no prose) may appear before that first marker — never write a page before its marker.
  Link pages with PLAIN RELATIVE anchors ONLY: <a href="about.html">About</a>. Never use a leading slash or absolute URL for internal links (never "/about.html", "https://...", or "corez.pro/...") — the preview and the published site serve every page under its own folder (corez.pro/<slug>/about.html), so only bare relative filenames resolve to the right URL. Keep filenames lowercase like index.html, about.html, contact.html (max 12 pages). COMPLETENESS CHECK before you finish: the FIRST line of the artifact is <!-- PAGE: index.html -->, make every <a href="..."> point to a page you actually output (a link to a page you never created is a broken site), and keep every page a complete standalone HTML document.
- ONE-SHOT MODE: ONLY when the user explicitly asked for "oneshot" (or "one shot", "single page", "one page"), output a single React component exactly as described above (no sub-pages, no markers).
- IMPLEMENTATION CHECK before you finish: implement EVERY feature you describe in the overview and every control the user asked for — no stubs, no TODOs, no placeholder functions; every button and interactive element must actually work.
- ALWAYS end your response with a step-by-step user guide and feature summary after the code block! Never output ONLY a bare code block.`;
  }

  return `${cleanPrompt}

[CODE DIAGNOSIS & FIX SPECIFICATION]:
- Systematically inspect the root cause before writing code.
- Produce clean, modern, production-ready code preserving existing API signatures and component props.
- If the user asks to fix "incomplete site" or "links to missing page" validation errors in HTML:
  1) If repairing a single-page site: replace external .html links (<a href="about.html">, <a href="projects.html">, etc.) with in-page section anchors (<a href="#about">, <a href="#projects">, <a href="#contact">).
  2) If repairing a multi-page site: output all referenced pages inside the same code block using <!-- PAGE: index.html -->, <!-- PAGE: about.html -->, etc. markers.
- After writing the fix, re-read your answer for completeness: include the COMPLETE corrected code — never ellipses ("..."), "rest unchanged", or "same as before" placeholders.
- Include a concise explanation of the changes and test verification steps.`;
}

// The only hard ceiling on a request is the platform's own body limit
// (the worker allows 24 MB). Below that, the full conversation travels with
// the request so earlier requirements and constraints are never discarded.
const MAX_COMPACTED_BYTES = 16 * 1024 * 1024;
const EXACT_EVIDENCE_PATTERN =
  /```[\s\S]*?```|(?:error|exception|failed|fix|bug|require|must|constraint|dependenc|version|@|\/\/|--)[^\n]{0,200}/i;

/**
 * Compact conversation history before sending it to the hosted AI.
 *
 * The full conversation is sent unchanged unless it approaches the platform
 * request-body limit. Only then are redundant older prose turns removed from
 * the request — but never deleted: every dropped message is persisted as an
 * exact retrievable record, and the request carries a REAL generated summary
 * (requirements, negative constraints, exact errors, decisions) with
 * retrieval keys linking back to the records. The latest user request, code
 * blocks, errors, and explicit requirements are preserved verbatim.
 */
export function compactConversationForRequest(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;

  const serialized = JSON.stringify(messages);
  if (serialized.length <= MAX_COMPACTED_BYTES) return messages;

  let compacted = [...messages];
  const dropped = [];
  let i = 0;
  while (
    compacted.length > 1 &&
    JSON.stringify(compacted).length > MAX_COMPACTED_BYTES &&
    i < compacted.length
  ) {
    const candidate = compacted[i];
    const isLatestUserTurn =
      candidate?.role === "user" && i === compacted.length - 1;
    const content =
      typeof candidate?.content === "string" ? candidate.content : "";
    const carriesEvidence = EXACT_EVIDENCE_PATTERN.test(content);
    if (!isLatestUserTurn && !carriesEvidence) {
      dropped.push(candidate);
      compacted.splice(i, 1);
      continue;
    }
    i += 1;
  }

  if (dropped.length > 0) {
    // Persist the dropped messages verbatim and generate a real summary with
    // retrieval links — never a generic "were summarised" placeholder.
    const { summaryMessage } = persistAndSummarize(dropped);
    compacted.splice(1, 0, summaryMessage);
  }

  // Final guard: if even the evidence-only payload exceeds the platform
  // limit, keep the latest user turn and every code block exactly; fold the
  // remaining prose into a persisted record with a real summary.
  const finalSerialized = JSON.stringify(compacted);
  if (finalSerialized.length > MAX_COMPACTED_BYTES) {
    const last = compacted[compacted.length - 1];
    const prefix = [];
    const overflow = [];
    for (const message of compacted.slice(0, -1)) {
      const content =
        typeof message?.content === "string" ? message.content : "";
      if (
        /```/.test(content) ||
        /(?:error|exception|failed|bug|must|require|constraint)/i.test(content)
      ) {
        prefix.push(message);
      } else {
        overflow.push(message);
      }
    }
    const { summaryMessage } = persistAndSummarize(overflow);
    compacted = [...prefix, summaryMessage, last];
  }

  return compacted;
}

function abortError() {
  const error = new Error("cancelled by user");
  error.name = "AbortError";
  return error;
}

function sleepResumable(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
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
        return await fetch(endpoint, options);
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

// Multi-page markers the model may place INSIDE a fence or BETWEEN
// separate fenced blocks (one fence per page). Both placements must reach
// the preview as one multi-page artifact, so every extraction path below
// preserves these marker lines verbatim.
const MULTI_PAGE_MARKER_LINE_PATTERN =
  /^\s*<!--\s*(?:PAGE|CORESITE-PAGES):\s*[^\n>]+-->\s*$/gm;
const MULTI_PAGE_MARKER_ANY_PATTERN =
  /<!--\s*(?:PAGE|CORESITE-PAGES):\s*[^\s>]+\s*-->/i;

export function extractCodeFromMessage(text) {
  if (!text) return null;

  // Every path below returns the artifact that the preview renders and the
  // canvas edits. Models like to keep writing after the final </html> — a
  // markdown "Verification checklist", a summary, a stray fence — and a
  // browser renders that as page text, so the extracted artifact is cut at its
  // closing tag before it leaves this function.
  // Every artifact leaving this function is normalised: the multi-page marker
  // convention is applied here so no caller — canvas, copy, publish — can
  // receive a site whose home page has no marker.
  const finish = (code) =>
    ensureLeadingPageMarker(stripJunkAfterDocumentEnd(code).trim());

  const codeBlocks = text.match(
    /```(?:html|xml|jsx|tsx|js|javascript|react)?\s*([\s\S]*?)```/gi,
  );
  if (codeBlocks) {
    const validCodes = [];
    for (const block of codeBlocks) {
      const match = block.match(
        /```(?:html|xml|jsx|tsx|js|javascript|react)?\s*([\s\S]*?)```/i,
      );
      if (match && match[1].trim()) {
        const code = match[1].trim();
        if (
          code.includes("<") ||
          code.includes("export default") ||
          code.includes("function ") ||
          code.includes("import ") ||
          code.includes("const ")
        ) {
          validCodes.push(code);
        }
      }
    }
    if (validCodes.length > 0) {
      // Rebuild the extracted artifact from the ORIGINAL text so the
      // <!-- PAGE: name.html --> markers the model puts BETWEEN fenced
      // blocks (one fence per page) survive extraction. Dropping them
      // collapsed multi-page sites into a single page whose nav links
      // pointed at pages that no longer exist — blank preview pages and
      // broken published links. Markers inside fences are kept by the
      // block capture above; markers between fences are spliced back here.
      const blocks = [];
      const gaps = [];
      let scanIdx = 0;
      const FENCE_BLOCK_PATTERN =
        /```(?:html|xml|jsx|tsx|js|javascript|react)?\s*[\s\S]*?```/gi;
      let blockMatch;
      while ((blockMatch = FENCE_BLOCK_PATTERN.exec(text)) !== null) {
        const gap = text.slice(scanIdx, blockMatch.index);
        gaps.push(
          (gap.match(MULTI_PAGE_MARKER_LINE_PATTERN) || []).map((m) =>
            m.trim(),
          ),
        );
        const inner = blockMatch[0].match(
          /```(?:html|xml|jsx|tsx|js|javascript|react)?\s*([\s\S]*?)```/i,
        );
        blocks.push(inner && inner[1].trim() ? inner[1].trim() : "");
        scanIdx = blockMatch.index + blockMatch[0].length;
      }
      // Markers that appear after the last fence (a trailing page marker
      // whose page block was truncated away) are kept too.
      const tailMarkers = (
        text.slice(scanIdx).match(MULTI_PAGE_MARKER_LINE_PATTERN) || []
      ).map((m) => m.trim());

      const joinedParts = [];
      for (let i = 0; i < blocks.length; i += 1) {
        // The leading gap's markers (e.g. a lone <!-- PAGE: index.html -->
        // before the first fence) belong to the site too.
        if (gaps[i] && gaps[i].length > 0 && (i === 0 || blocks[i])) {
          joinedParts.push(gaps[i].join("\n"));
        }
        if (blocks[i]) {
          const blockCode = blocks[i];
          if (
            blockCode.includes("<") ||
            blockCode.includes("export default") ||
            blockCode.includes("function ") ||
            blockCode.includes("import ") ||
            blockCode.includes("const ")
          ) {
            joinedParts.push(blockCode);
          }
        }
      }
      if (tailMarkers.length > 0 && joinedParts.length > 0) {
        joinedParts.push(tailMarkers.join("\n"));
      }
      const joined =
        joinedParts.filter(Boolean).join("\n\n") || validCodes.join("\n\n");

      // Salvage orphaned HTML closing tags that trail the last code block
      // (the harness occasionally emits them outside the fence).
      const lastFenceIdx = text.lastIndexOf("```");
      const trailing =
        lastFenceIdx > -1 ? text.slice(lastFenceIdx + 3).trim() : "";
      const ORPHANED_CLOSE = /^\s*(?:<\/(?:script|style|body|html)>\s*)+$/i;
      if (trailing && ORPHANED_CLOSE.test(trailing)) {
        return finish(joined + "\n" + trailing);
      }
      return finish(joined);
    }
  }

  const matchAny = text.match(/```\s*([\s\S]*?)```/);
  if (matchAny && matchAny[1].trim()) {
    return finish(matchAny[1]);
  }

  // Salvage truncated responses: a long generated app is often cut off
  // mid-code-block (no closing ```), so the strict matchers above miss it.
  // Extract everything after the last recognized fence when it still looks
  // like code, so the preview canvas can open anyway. Multi-page output
  // truncated mid-way keeps ALL pages: start from where the artifact begins
  // rather than from the last fence, which would isolate the final page and
  // drop every earlier page's markers.
  //
  // The start is resolved by findArtifactStartIndex — the single shared rule.
  // Searching for the first `<!-- PAGE: -->` marker here (as this code used to)
  // dropped the unmarked home page, the same defect that blocked publishing
  // from the unfenced path.
  const truncatedBlock = text.match(
    /```(?:html|xml|jsx|tsx|js|javascript|react)?\s*([\s\S]*)$/i,
  );
  if (truncatedBlock && truncatedBlock[1].trim()) {
    let code = truncatedBlock[1].trim();
    if (
      MULTI_PAGE_MARKER_ANY_PATTERN.test(code) ||
      MULTI_PAGE_MARKER_ANY_PATTERN.test(text)
    ) {
      const artifactStart = findArtifactStartIndex(text);
      if (artifactStart !== -1) {
        const fromArtifactStart = text.slice(artifactStart).trim();
        if (
          fromArtifactStart.includes("<html") ||
          fromArtifactStart.includes("<!DOCTYPE") ||
          fromArtifactStart.includes("</html>")
        ) {
          code = fromArtifactStart;
        }
      }
    }
    if (
      code.includes("<") ||
      code.includes("export default") ||
      code.includes("function ") ||
      code.includes("import ") ||
      code.includes("const ")
    ) {
      return finish(code);
    }
  }

  // 3. Unfenced multi-page site or HTML document (when model emits code without ``` fences)
  const multiPageIdx = text.search(
    /<!--\s*(?:PAGE|CORESITE-PAGES):\s*[^\s>]+\s*-->/i,
  );
  if (multiPageIdx !== -1) {
    const candidate = text.slice(multiPageIdx).trim();
    if (
      candidate.includes("<html") ||
      candidate.includes("<!DOCTYPE") ||
      candidate.includes("</html>") ||
      candidate.includes("<body") ||
      candidate.includes("<head")
    ) {
      return finish(candidate);
    }
  }

  const htmlDocIdx = text.search(/(?:<!DOCTYPE\s+html|<html[\s>])/i);
  if (htmlDocIdx !== -1) {
    const candidate = text.slice(htmlDocIdx).trim();
    if (
      candidate.includes("</html>") ||
      candidate.includes("<body") ||
      candidate.includes("<head") ||
      candidate.includes("<style") ||
      candidate.includes("<script")
    ) {
      return finish(candidate);
    }
  }

  // 4. Standalone canvas game with context/loop
  const canvasIdx = text.search(/<canvas[\s>]/i);
  if (
    canvasIdx !== -1 &&
    (/\.getContext\s*\(/i.test(text) || /requestAnimationFrame/i.test(text))
  ) {
    const candidate = text.slice(canvasIdx).trim();
    return finish(candidate);
  }

  return null;
}

// Detect requests that need live, up-to-date information from the web:
// current events, latest news, live
// scores, weather, or explicit "search the web / look up / google it"
// phrasing. Explanation and knowledge questions WITHOUT a recency signal are
// left to the model's own knowledge.
// Slash commands typed in the chat box give CoreZ an explicit, unambiguous
// intent — the AI is never asked to guess. The command token is stripped
// Explicit commands (@website, @game, @research, @image)
// The command token is stripped before the prompt reaches any model, so the
// model sees only the clean request.
const AT_COMMANDS = new Set(["website", "game", "research", "image"]);

export function parseSlashCommand(prompt) {
  const text = String(prompt || "").trim();
  const match = text.match(/^@([a-z]+)\b/i);
  if (!match) return { command: null, rest: text };
  const command = match[1].toLowerCase();
  if (!AT_COMMANDS.has(command)) return { command: null, rest: text };
  return { command, rest: text.slice(match[0].length).trim() };
}

export const parseCommand = parseSlashCommand;

export function isSlashCommand(prompt) {
  return parseSlashCommand(prompt).command !== null;
}

export const isCommand = isSlashCommand;

// Build the "why" for the honest fallback: name the transport error when the
// fetch itself failed, and give actionable guidance — the request never
// reached an AI provider, so a provider-key hint would be misleading.
export function describeHostedUnavailable(hostedError) {
  const message = hostedError?.message || "";
  const isRateLimit =
    /429|rate.?limit|rate_limit|too many requests/i.test(message);
  if (isRateLimit) {
    // Rate limits are transient and retried automatically on both ends: never
    // dump the raw provider JSON into the reply — keep it to one short line.
    return " The hosted AI service is rate-limited right now and automatic retries are backing off. Please wait a moment and try again.";
  }
  const isTransportFailure =
    /networkerror|failed to fetch|load failed|fetch failed|ERR_CONNECTION|net::|econnrefused|connection refused/i.test(
      message,
    );
  let reason = message
    ? ` The hosted AI service is unavailable: ${message}`
    : " The hosted AI service is currently unavailable.";
  if (isTransportFailure) {
    // The browser never got an HTTP response: this is a backend connectivity
    // problem, not a missing provider key. Give actionable guidance for both
    // local development and the deployed Worker regardless of hostname.
    reason +=
      " The request never reached the AI worker. Locally, /api/* is proxied to the Cloudflare Worker on port 8787 — start it with `npx wrangler dev` (with OPENCODE_GO_API_KEY in .dev.vars) so this request has a backend to answer. For the deployed site, make sure the Worker is deployed with `npx wrangler deploy`.";
  }
  return reason;
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

// Website requests must be explicit — same rules as `@image`. `@website`
// always qualifies. Natural-language detection is intentionally strict: the
// build verb must govern the website noun within a tight window (~48 chars,
// direct object), and writing/job contexts, code revisions, code blocks, and
// social-carousel copy never qualify — otherwise "write an email about our
// new website launch" or "what should I check before deploying a website"
// falsely routes to a website build.
const WEBSITE_VERB_SRC = `(?:build|make|create|generate|design|develop|launch|ship|prototype|code)`;
const WEBSITE_NOUN_SRC = `(?:websites?|web\\s?sites?|landing(?:\\s|-)?pages?|webpages?|web\\s?apps?|web\\s?applications?|homepages?|portfolio(?:\\s+sites?)?|dashboards?|admin(?:\\s|-)?panels?|portals?|saas)`;
const WEBSITE_BUILD_PATTERN = new RegExp(
  `\\b${WEBSITE_VERB_SRC}\\b[\\w\\s,'"-]{0,48}?\\b${WEBSITE_NOUN_SRC}\\b`,
  "i",
);
const WEBSITE_NOUN_VERB_PATTERN = new RegExp(
  `\\b${WEBSITE_NOUN_SRC}\\b[\\w\\s,'"-]{0,48}?\\b(?:build|make|create|generate|design|develop|launch|ship|prototype)\\b`,
  "i",
);

export function isExplicitWebsiteRequest(prompt) {
  const clean = String(prompt || "").trim();
  if (!clean) return false;

  const lower = clean.toLowerCase();
  if (lower.startsWith("@website")) return true;

  // Code revisions, code blocks, and HTML deliverables are NEVER new website
  // builds — they revise or analyse existing code.
  if (
    /^\s*(?:revise(?:\s+code)?|update(?:\s+code)?|fix(?:\s+code)?|refactor(?:\s+code)?)\b/i.test(
      clean,
    )
  )
    return false;
  if (isRevisionContextPrompt(clean)) return false;
  if (
    clean.includes("```") ||
    /<!DOCTYPE\s+html|<html|<style|<script/i.test(clean)
  )
    return false;

  // Social-carousel copy is NEVER a website build.
  if (isSocialCarouselCopyRequest(clean)) return false;

  // Writing / job-application contexts only veto noun-first matches ("our new
  // website launch" in an email): a verb-governed build ("build a website
  // for my resume") is still explicit.
  const hasWritingContext = WRITING_JOB_GUARD.test(clean);
  const hasBuildGovernance = WEBSITE_BUILD_PATTERN.test(clean);
  if (hasWritingContext && !hasBuildGovernance) return false;

  // Questions ABOUT websites ("what should I check before deploying a
  // website?") are explanations, not builds — unless a build verb governs
  // the website noun, which the patterns below already require.
  const firstLine = clean.split("\n")[0].trim();
  if (WEBSITE_BUILD_PATTERN.test(firstLine)) return true;
  if (WEBSITE_NOUN_VERB_PATTERN.test(firstLine) && !hasWritingContext)
    return true;
  if (clean.length < 300) {
    if (WEBSITE_BUILD_PATTERN.test(clean)) return true;
    if (WEBSITE_NOUN_VERB_PATTERN.test(clean) && !hasWritingContext)
      return true;
  }
  return false;
}

export function isRevisionContextPrompt(prompt) {
  return /\[(?:SURGICAL REVISION CONTEXT|Context: The user is requesting a revision)/i.test(
    String(prompt || ""),
  );
}

const GAME_GENRE_PATTERN =
  /\b(platformer|puzzle|arcade|shooter|racing|rpg|role[- ]?playing|survival|horror|tower[- ]?defense|idle|clicker|simulator|sim|strategy|sports|fighting|battle[- ]?royale|snake|pong|tetris|flappy[- ]?bird|wordle|crossword|memory|maze|endless[- ]?runner|runner|fps)\b/i;

const PROPER_NAME_PATTERN =
  /\b(?:called|named|titled)\s+["'`]?([A-Z][A-Za-z0-9' -]{1,24})/i;

const SITE_SUBJECT_PATTERN =
  /\b(?:for|of|about)\s+(?:my|our|the|a|an)?\s*([a-z][a-z0-9' -]{1,24})/i;

const FEATURE_PATTERN =
  /\b(?:fix|repair|implement|add|build|create|refactor|improve|update)\s+(?:the|a|an)?\s*([a-z][a-z0-9 _-]{2,24})/i;

function capitalizeTitle(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Generate a short, suiting title from a conversation's first prompt.
 * The intent engine classifies what the user wants (game, website, image,
 * explanation, code task...), then a subject is extracted from
 * the prompt itself so the title names the actual deliverable instead of
 * echoing the raw sentence.
 */
export function generateSessionTitle(prompt) {
  const clean = String(prompt || "").trim();
  if (!clean) return "New Conversation";
  try {
    const { command, rest } = parseSlashCommand(clean);
    if (command === "image") {
      const subject = rest
        .replace(/^(please\s+)?(can you|could you|would you|please)\s+/i, "")
        .replace(/^(a|an|the)\s+/i, "")
        .replace(/\s*[.!?]+$/, "")
        .trim();
      return capitalizeTitle(`Generate a ${subject || "custom"} image`).slice(
        0,
        40,
      );
    }

    const fine = classifyIntentNew(clean);
    const type = fine?.primaryIntent || fine?.type || "general";
    const lower = clean.toLowerCase();

    let title = "";
    if (type === "game_creation") {
      const genreMatch = lower.match(GAME_GENRE_PATTERN);
      let genre = genreMatch ? genreMatch[1].toLowerCase() : "custom";
      if (genre === "rpg" || genre === "fps") genre = genre.toUpperCase();
      const nameMatch = clean.match(PROPER_NAME_PATTERN);
      const name = nameMatch ? nameMatch[1].trim() : "";
      title = `Build a ${genre} game${name ? `: ${name}` : ""}`;
    } else if (type === "website_creation" || type === "design_task") {
      const subjectMatch = clean.match(SITE_SUBJECT_PATTERN);
      let subject = subjectMatch ? subjectMatch[1].trim() : "";
      // Drop trailing qualifiers ("called Sweet Crumb", "with dark mode").
      subject = subject
        .split(/\s+(?:called|named|titled|with|that|and|using|for)\b/i)[0]
        .trim();
      const nameMatch = clean.match(PROPER_NAME_PATTERN);
      const name = nameMatch ? nameMatch[1].trim() : "";
      title = subject
        ? `Create a ${subject} website${name ? `: ${name}` : ""}`
        : `Create a website${name ? `: ${name}` : ""}`;
    } else if (type === "image_generation") {
      const subject = clean
        .replace(/^(please\s+)?(can you|could you|would you|please)\s+/i, "")
        .replace(
          /^(generate|create|make|draw|render|show me|give me|show|give|get|want|need|produce|i want|i need|i'?d like)\s+(me|us)?\s*(an?|the)?\s*(image|picture|photo|illustration|artwork|wallpaper|drawing|graphic|logo|visual|pic|shot)\s+(of|for|showing|featuring|with|that|about)\s+/i,
          "",
        )
        .replace(IMAGE_REQUEST_TAIL, "")
        .replace(/^(a|an|the)\s+/i, "")
        .replace(/\s*[.!?]+$/, "")
        .trim();
      title = `Generate a ${subject || "custom"} image`;
    } else if (
      type === "bug_fix" ||
      type === "code_refactor" ||
      type === "feature_implementation" ||
      type === "simple_edit"
    ) {
      const featureMatch = clean.match(FEATURE_PATTERN);
      const feature = featureMatch ? featureMatch[1].trim() : "";
      title = feature
        ? `${type === "bug_fix" ? "Fix" : type === "code_refactor" ? "Refactor" : "Implement"} ${feature}`
        : capitalizeTitle(type.replace(/_/g, " "));
    } else if (type === "explanation") {
      title = clean
        .replace(
          /^(can you|could you|please|hey|hello|hi|corez|corez ai)[,\s]*/i,
          "",
        )
        .replace(/\s*[.!?]+$/, "")
        .trim();
    } else {
      title = clean.replace(/\s*[.!?]+$/, "").trim();
    }

    return capitalizeTitle(title).slice(0, 40) || "New Conversation";
  } catch {
    return clean.slice(0, 30) || "New Conversation";
  }
}

/**
 * Ask the hosted AI to name a conversation from its first user message.
 * The worker answers with a tiny, capped title-only generation; any failure
 * falls back to the deterministic heuristic so a title is always produced.
 */
export async function generateAISessionTitle(prompt) {
  const clean = String(prompt || "").trim();
  if (!clean) return generateSessionTitle(clean);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(AI_PROXY_ENDPOINT, {
      method: "POST",
      credentials: "include",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: clean.slice(0, 400), titleOnly: true }),
    });
    if (!response.ok)
      throw new Error(
        `Session title request failed with status ${response.status}.`,
      );
    const data = await response.json();
    const title = typeof data?.title === "string" ? data.title.trim() : "";
    return title ? title.slice(0, 60) : generateSessionTitle(clean);
  } catch {
    return generateSessionTitle(clean);
  } finally {
    clearTimeout(timeout);
  }
}

// --- Persistent keep-trying retry policy ----------------------------------
// The UI must never give up with "I can't act on ..." while the hosted AI
// is temporarily unavailable. Instead the request is re-issued with backoff
// a bounded number of times, then the honest local fallback (with the real
// error) is returned — a sustained outage must surface as an error, never
// as a stream that loads forever. The user can press Stop (abort) at any
// point to cancel the wait.
export const PERSISTENT_RETRY_BASE_DELAY_MS = 2000;
export const PERSISTENT_RETRY_MAX_DELAY_MS = 30000;
// Production default: 1 initial attempt + explicit retry + up to this many
// persistent attempts before surfacing the honest fallback.
export const PERSISTENT_RETRY_DEFAULT_MAX_ATTEMPTS = 3;

// A build the worker still owns is NOT an outage. The harness keeps the
// request's persisted task under a lease while it builds, verifies, repairs and
// reviews the artifact, and answers a duplicate request with "A build for this
// request is already in progress." — meaning the same request is alive
// server-side and a later retry replays the finished artifact. Giving up here
// (the plain 2s/4s ladder) threw the user's creation away, so this class of
// answer gets its own bounded ladder: long enough for a multi-minute build,
// short enough to still fail honestly.
export const BUILD_IN_PROGRESS_MAX_ATTEMPTS = 8;
export const BUILD_IN_PROGRESS_BASE_DELAY_MS = 15_000;
export const BUILD_IN_PROGRESS_MAX_DELAY_MS = 120_000;
export const BUILD_IN_PROGRESS_MESSAGE =
  "your build is still running on the server — send the same request again in a moment and it will pick up the finished result";

/** True when the worker answered "your build is already in progress". */
export function isBuildInProgressError(err) {
  return /build for this request is already in progress/i.test(
    err?.message || "",
  );
}

export function getBuildInProgressDelay(attempt) {
  const exp = BUILD_IN_PROGRESS_BASE_DELAY_MS * 2 ** Math.max(0, Number(attempt || 1) - 1);
  return Math.min(exp, BUILD_IN_PROGRESS_MAX_DELAY_MS);
}

export function getPersistentRetryDelay(
  attempt,
  baseDelayMs = PERSISTENT_RETRY_BASE_DELAY_MS,
  maxDelayMs = PERSISTENT_RETRY_MAX_DELAY_MS,
) {
  const base = Number(baseDelayMs) > 0 ? Number(baseDelayMs) : 2000;
  const max = Number(maxDelayMs) > 0 ? Number(maxDelayMs) : 30000;
  const exp = base * 2 ** Math.max(0, Number(attempt || 1) - 1);
  return Math.min(exp, max);
}

export function isRetryableHostedError(err) {
  if (!err) return true;
  if (err?.name === "AbortError") return false;
  if (/Authentication required/i.test(err?.message || "")) return false;
  return true;
}

// True when a local fallback string is a hosted-unavailable give-up (not a
// genuine instant answer like a greeting). Those give-ups must never be
// returned to the user — they mean "keep retrying the hosted AI instead".
export function isHostedUnavailableFallback(text) {
  if (!text || typeof text !== "string") return false;
  return /hosted AI service is (currently unavailable|rate-limited)|I can't act on|I can't properly answer|I couldn't apply your revision|couldn't analyse or revise|can't create (it|this specific app) right now|so I can't create/i.test(
    text,
  );
}

function resolvePersistentRetryOpts(retryOpts) {
  const isTestEnv =
    (typeof process !== "undefined" &&
      (process?.env?.VITEST === "true" ||
        process?.env?.VITEST === "1" ||
        process?.env?.NODE_ENV === "test")) ||
    (typeof globalThis !== "undefined" && Boolean(globalThis.__VITEST__));
  const raw = retryOpts && typeof retryOpts === "object" ? retryOpts : {};
  return {
    // Production retries a bounded number of times, then surfaces the honest
    // local fallback; tests keep the old single-attempt behaviour unless they
    // explicitly opt into persistence.
    maxPersistentAttempts:
      raw.maxPersistentAttempts ??
      raw.maxAttempts ??
      (isTestEnv ? 1 : PERSISTENT_RETRY_DEFAULT_MAX_ATTEMPTS),
    baseDelayMs:
      raw.baseDelayMs ?? PERSISTENT_RETRY_BASE_DELAY_MS,
    maxDelayMs: raw.maxDelayMs ?? PERSISTENT_RETRY_MAX_DELAY_MS,
    // Forwarded to the inner streaming retry ladder (tests use tiny delays).
    innerRetryDelaysMs: Array.isArray(raw.retryDelaysMs)
      ? raw.retryDelaysMs
      : Array.isArray(raw.innerRetryDelaysMs)
        ? raw.innerRetryDelaysMs
        : undefined,
    // Ladder used while the worker still owns the request ("build already in
    // progress"). Tests pass tiny delays instead of waiting minutes.
    buildInProgressDelaysMs: Array.isArray(raw.buildInProgressDelaysMs)
      ? raw.buildInProgressDelaysMs
      : undefined,
  };
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
