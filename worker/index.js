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
  extractDataSeriesNumbers,
  calcStats,
  calcLinearTrend,
  round2,
} from "./skillVerification.js";
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

// For revise-with-image, we keep the request small but still give the model
// the exact R2/data URL to use. The frontend uploads to /api/assets and
// stores assetUrl; we append that URL as text so the model can copy it
// verbatim, and patchLocalImageSrc still fixes any hallucinated filename
// or Unsplash placeholder as a safety-net.
// Fix common JS syntax errors introduced when model copies large base64 data URLs
// (e.g. missing * in particle system: Math.random()canvas.width -> Math.random()*canvas.width)
function fixCommonJSInHtml(html) {
  if (typeof html !== "string" || !html.includes("<script")) return html;
  return (
    html
      // Particle system: Math.random()canvas.width → Math.random()*canvas.width
      .replace(
        /Math\.random\(\)\s*canvas\.width/g,
        "Math.random()*canvas.width",
      )
      .replace(
        /Math\.random\(\)\s*canvas\.height/g,
        "Math.random()*canvas.height",
      )
      .replace(/Math\.random\(\)\s*2/g, "Math.random()*2")
      .replace(
        /\(Math\.random\(\)\s*-\s*0\.5\)\s*0\.3/g,
        "(Math.random()-0.5)*0.3",
      )
      .replace(
        /\(Math\.random\(\)\s*-\s*0\.5\)\s*0\.3/g,
        "(Math.random()-0.5)*0.3",
      )
      // rgba with template literal inside string (missing backticks)
      .replace(/ctx\.fillStyle\s*=\s*rgba\(/g, "ctx.fillStyle=`rgba(")
      .replace(/\$\{this\.opacity\}\)\s*;/g, "${this.opacity})`;")
      // Fix missing * in other common patterns: 0.05(1-... ) → 0.05*(1-... )
      .replace(/0\.05\s*\(/g, "0.05*(")
      .replace(/0\.08\s*\(/g, "0.08*(")
      // Fix canvas.width/height missing * in other places
      .replace(
        /Math\.random\(\)\s*([a-zA-Z_][a-zA-Z0-9_]*\.width)/g,
        "Math.random()*$1",
      )
      .replace(
        /Math\.random\(\)\s*([a-zA-Z_][a-zA-Z0-9_]*\.height)/g,
        "Math.random()*$1",
      )
  );
}

// Safety-net: if the model still emits a local filename (e.g. 1716041183016.jpg, avatar.jpg)
// or a generic Unsplash placeholder (https://images.unsplash.com/...) instead
// of using the user's attached image, replace it with the attached image.
// Generic for all users/portfolios: when the user attaches any image and asks
// to use it (e.g. "add this image", "change the photo", "use my portrait"),
// we patch local filenames, hallucinated R2 URLs, and placeholder Unsplash
// images so the uploaded photo always displays.
function patchLocalImageSrc(html, messages) {
  if (typeof html !== "string" || !html.includes("<img")) return html;
  const urls = [];
  let promptText = "";
  for (const m of Array.isArray(messages) ? messages : []) {
    if (typeof m?.content === "string")
      promptText += " " + m.content.toLowerCase();
    else if (Array.isArray(m?.content)) {
      for (const c of m.content)
        if (c?.text) promptText += " " + String(c.text).toLowerCase();
    }
    for (const a of Array.isArray(m?.attachments) ? m.attachments : []) {
      if (
        typeof a?.assetUrl === "string" &&
        String(a.assetUrl).includes("/api/assets/")
      ) {
        const abs = String(a.assetUrl).startsWith("http")
          ? String(a.assetUrl)
          : `https://corez.pro${String(a.assetUrl).startsWith("/") ? "" : "/"}${String(a.assetUrl)}`;
        urls.push(abs);
      } else if (
        typeof a?.thumb === "string" &&
        a.thumb.startsWith("data:image/")
      )
        urls.push(a.thumb);
    }
  }
  if (urls.length === 0) return html;
  const mentionsChangeImage =
    /change\s+(the\s+)?image|add\s+this\s+image|replace\s+.*image|use\s+this\s+(image|photo|picture|portrait|avatar)/i.test(
      promptText,
    );
  const shouldPatchUnsplash = mentionsChangeImage;
  // Patterns for external placeholder images that should be replaced when we have an attached portrait
  const isPlaceholderUrl = (src) =>
    /unsplash\.com|picsum\.photos|placehold\.|via\.placeholder|dummyimage|placeholder\.com/i.test(
      src,
    );

  let patched = html;
  let urlIndex = 0;

  // First pass (generic): when user explicitly asked to change/add an image, replace the most likely portrait/avatar/profile image
  if (shouldPatchUnsplash) {
    let replacedPrimary = false;
    patched = patched.replace(/<img\s+[^>]*>/gi, (match) => {
      if (replacedPrimary || urlIndex >= urls.length) return match;
      const altMatch = match.match(/alt=["']([^"']*)["']/i);
      const alt = altMatch ? altMatch[1].toLowerCase() : "";
      const srcMatch = match.match(/src=["']([^"']+)["']/i);
      const src = srcMatch ? srcMatch[1] : "";
      const isPortraitAlt =
        /(portrait|avatar|profile|headshot|photo)/i.test(alt) ||
        /(portrait|avatar|profile|headshot)/i.test(match.toLowerCase());
      const idx = patched.indexOf(match);
      const context = patched
        .slice(Math.max(0, idx - 500), idx + 500)
        .toLowerCase();
      const nearbyPortrait = /(portrait|avatar|profile|headshot)/i.test(
        context,
      );
      const isPlaceholder = isPlaceholderUrl(src);
      const isLocalFile =
        src &&
        !src.startsWith("data:") &&
        !src.startsWith("/api/") &&
        !src.startsWith("http");
      if (isPortraitAlt || nearbyPortrait || isPlaceholder || isLocalFile) {
        const isCorrectUrl = urls.includes(src);
        if (isCorrectUrl) return match;
        if (src) {
          const replacement = urls[urlIndex++];
          replacedPrimary = true;
          let newTag = match.replace(src, replacement);
          newTag = newTag.replace(/\s*display\s*:\s*none\s*;?/gi, "");
          newTag = newTag.replace(/style=["']\s*["']/i, "");
          newTag = newTag.replace(/style=["']\s*;\s*["']/i, 'style=""');
          if (!/onerror/i.test(newTag)) {
            newTag = newTag.replace(
              /<img/i,
              "<img onerror=\"this.onerror=null;this.style.display='none';const p=this.nextElementSibling;if(p&&p.classList.contains('image-fallback'))p.style.display='block'\"",
            );
          }
          if (!/alt=/i.test(newTag) || /alt=["']\s*["']/i.test(newTag)) {
            newTag = newTag.replace(
              /alt=["'][^"']*["']/i,
              'alt="User portrait"',
            );
            if (!/alt=/i.test(newTag))
              newTag = newTag.replace(/<img/i, '<img alt="User portrait"');
          }
          if (!/object-fit/i.test(newTag)) {
            newTag = newTag.replace(/style=["']/i, 'style="object-fit:cover;');
            if (!/style=/i.test(newTag))
              newTag = newTag.replace(
                /<img/i,
                '<img style="width:100%;height:100%;object-fit:cover"',
              );
          }
          return newTag;
        }
      }
      return match;
    });
    if (replacedPrimary) return patched;
  }

  // Second pass: patch local filenames, placeholder Unsplash, and hallucinated R2 URLs
  patched = patched.replace(
    /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi,
    (match, src) => {
      const isData = src.startsWith("data:");
      const isApi = src.startsWith("/api/");
      const isHttps = src.startsWith("https://") || src.startsWith("http://");
      const isPlaceholder = isPlaceholderUrl(src);
      const isHallucinatedR2 = isApi && !urls.includes(src);
      // If src is already the correct attached URL, leave it
      if (urls.includes(src)) return match;
      // Leave correct data URLs as is
      if (isData) return match;
      // For hallucinated R2 URLs (e.g. /api/assets/user-upload_1716041183016.jpg missing timestamp), patch when we have a real attached URL
      if (isHallucinatedR2 && urlIndex < urls.length) {
        const replacement = urls[urlIndex++];
        let newTag = match.replace(src, replacement);
        newTag = newTag.replace(/\s*display\s*:\s*none\s*;?/gi, "");
        newTag = newTag.replace(/style=["']\s*["']/i, "");
        if (!/onerror/i.test(newTag)) {
          newTag = newTag.replace(
            /<img/i,
            "<img onerror=\"this.onerror=null;this.style.display='none';const p=this.nextElementSibling;if(p&&p.classList.contains('image-fallback'))p.style.display='block'\"",
          );
        }
        if (!/alt=/i.test(newTag)) {
          newTag = newTag.replace(/<img/i, '<img alt="Attached image"');
        }
        return newTag;
      }
      // Leave correct /api/assets URLs (already handled) and non-placeholder https unless we should patch
      if (isApi) return match;
      if (isHttps && !isPlaceholder && !shouldPatchUnsplash) return match;
      // For placeholder/unsplash when we have an attached image for a change-image request, patch it
      if (
        isHttps &&
        isPlaceholder &&
        shouldPatchUnsplash &&
        urlIndex < urls.length
      ) {
        const replacement = urls[urlIndex++];
        let newTag = match.replace(src, replacement);
        newTag = newTag.replace(/\s*display\s*:\s*none\s*;?/gi, "");
        if (!/onerror/i.test(newTag)) {
          newTag = newTag.replace(
            /<img/i,
            "<img onerror=\"this.onerror=null;this.style.display='none';const p=this.nextElementSibling;if(p&&p.classList.contains('image-fallback'))p.style.display='block'\"",
          );
        }
        if (!/alt=/i.test(newTag)) {
          newTag = newTag.replace(/<img/i, '<img alt="Attached image"');
        }
        return newTag;
      }
      if (!isHttps && !isData && !isApi) {
        // Local filename
        if (urlIndex < urls.length) {
          const replacement = urls[urlIndex++];
          let newTag = match.replace(src, replacement);
          newTag = newTag.replace(/\s*display\s*:\s*none\s*;?/gi, "");
          if (!/onerror/i.test(newTag)) {
            newTag = newTag.replace(
              /<img/i,
              "<img onerror=\"this.onerror=null;this.style.display='none';const p=this.nextElementSibling;if(p&&p.classList.contains('image-fallback'))p.style.display='block'\"",
            );
          }
          if (!/alt=/i.test(newTag)) {
            newTag = newTag.replace(/<img/i, '<img alt="Attached image"');
          }
          return newTag;
        }
      }
      return match;
    },
  );
  return patched;
}

// Storage key segments are validated with SAFE_STORAGE_SEGMENT from utils.js:
// no slashes, no leading dots (blocks ../ traversal), bounded length — the same
// pattern memory.js uses, so the two endpoints agree on what a segment is.

// Online multiplayer rooms: short lowercase ids used in the WebSocket URL.
const SAFE_ROOM_ID = /^[a-z0-9][a-z0-9-]{2,31}$/;

function buildLiveDataDiagnostics(
  liveDataEvidence,
  liveDataNeed,
  verification,
) {
  if (!liveDataEvidence) {
    return liveDataNeed.required
      ? {
          liveDataRequired: true,
          searchFetched: false,
          liveDataUsed: false,
          answerGrounded: false,
          liveDataNeed: liveDataNeed.kind,
        }
      : null;
  }

  const results = Array.isArray(verification?.results)
    ? verification.results
    : [];
  const liveResult = results.find(
    (result) => result.skillId === "live-data-utilities",
  );
  const researchResult = results.find(
    (result) => result.skillId === "research-report",
  );
  const honestRefusal = Boolean(liveResult?.evidence?.honestRefusal);
  const answerGrounded = liveResult
    ? Boolean(
        liveResult.evidence?.liveDataUsed && liveResult.failures?.length === 0,
      )
    : researchResult
      ? Boolean(
          researchResult.evidence?.groundingValid &&
          researchResult.failures?.length === 0,
        )
      : false;

  return {
    liveDataRequired: liveDataNeed.required || false,
    searchFetched: true,
    liveDataUsed: answerGrounded,
    answerGrounded,
    honestRefusal,
    dataSource: liveDataEvidence.sources,
    fetchedAt: liveDataEvidence.fetchedAt,
    sourceTimestamp: liveDataEvidence.servedAt,
    freshnessMs: Math.max(
      0,
      Date.now() - new Date(liveDataEvidence.servedAt).getTime(),
    ),
    resultsCount: liveDataEvidence.results.length,
  };
}

function buildDataAnalysisContext(prompt) {
  const numbers = extractDataSeriesNumbers(prompt);
  if (numbers.length < 2) return null;
  const stats = calcStats(numbers);
  const trend = calcLinearTrend(numbers);
  const direction =
    numbers[numbers.length - 1] > numbers[0]
      ? "upward"
      : numbers[numbers.length - 1] < numbers[0]
        ? "downward"
        : "flat";
  return `Deterministic data-analysis results (authoritative; source order preserved):
- Values: ${numbers.join(", ")}
- Total: ${round2(stats.sum)}
- Mean: ${round2(stats.mean)}
- Median: ${round2(stats.median)}
- First-to-last direction: ${direction}
${
  trend
    ? `- Least-squares trend: y = ${round2(trend.intercept)} + ${round2(trend.slope)} * period
- Next-period forecast: ${round2(trend.intercept + trend.slope * (numbers.length + 1))}`
    : ""
}
Use these checked values exactly. Do not recompute them from memory.`;
}

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

const CANONICAL_INTENT_TYPES = new Set([
  "app",
  "code-help",
  "writing",
  "explanation",
  "general",
]);

function normalizeIntentType(intentType) {
  return CANONICAL_INTENT_TYPES.has(intentType) ? intentType : "general";
}

function isGameCreationRequest(prompt, intent, fineIntent) {
  return (
    intent?.primaryIntent === "game_creation" ||
    fineIntent?.primaryIntent === "game_creation" ||
    fineIntent?.type === "game_creation" ||
    /\b(build|create|make|generate|design|develop|code)\b.{0,80}\b(game|platformer|shooter|pong|snake|tetris|rpg|simulator|chess|puzzle|racing|fighter|wordle|flappy)\b/i.test(
      String(prompt || ""),
    )
  );
}

function buildSystemPrompt(options = {}) {
  const intent = typeof options.intent === "object" ? options.intent : null;
  const fineIntent =
    typeof options.fineIntent === "object" ? options.fineIntent : null;
  const legacyIntent =
    options.legacyIntent ||
    (typeof options.intent === "string" ? options.intent : intent?.type);
  const skills = Array.isArray(options.skills) ? options.skills : [];
  const contract =
    options.contract && typeof options.contract === "object"
      ? options.contract
      : null;
  const executionPlan =
    typeof options.executionPlan === "string" ? options.executionPlan : null;

  const intentType = normalizeIntentType(legacyIntent || intent?.type);
  const primaryIntent = isGameCreationRequest(
    options.prompt,
    intent,
    fineIntent,
  )
    ? "game_creation"
    : intent?.primaryIntent ||
      fineIntent?.primaryIntent ||
      fineIntent?.type ||
      intent?.type ||
      intentType;
  const secondaryIntent = intent?.secondaryIntent
    ? ` (secondary: ${intent.secondaryIntent})`
    : "";

  const isRevisionPrompt =
    /^\s*(?:revise|update|modify|patch|fix)\s+code\b/i.test(
      options.prompt || "",
    );

  let adaptiveInstructions;
  if (isRevisionPrompt) {
    adaptiveInstructions = `
Adaptive Routing - Code Revision Path:
- Apply the requested change directly to the provided code and output the complete updated file.
- Keep all other code, styles, scripts and structure unchanged unless the request explicitly says to change them.
- When the user attaches an image (e.g. for any person's portrait/avatar/profile), use that exact image — it is available as https://corez.pro/api/assets/user-upload_...jpg (or data:image/...). Do NOT use Unsplash or invented URLs. Example: <img src="https://corez.pro/api/assets/user-upload_...jpg" alt="User portrait" style="width:100%;height:100%;object-fit:cover"> with meaningful alt and onerror fallback. Always use absolute https://corez.pro/api/assets/ URLs for storage images, never relative /api/assets/ or local filenames.
- If the existing code is HTML, output the full HTML document inside one \`\`\`html block.
- If repairing missing sub-page links:
  - If single-page: convert <a href="page.html"> to in-page anchors (<a href="#section">).
  - If multi-page: write ONE \`<!-- PAGE: page.html -->\` marker line immediately BEFORE each page, INCLUDING the home page (the first line of the artifact is \`<!-- PAGE: index.html -->). Never write a page before its marker.
- Output the complete, working updated file inside a single code block so the live canvas preview immediately updates.`;
  } else if (
    intentType === "code-help" ||
    [
      "bug_fix",
      "code_refactor",
      "feature_implementation",
      "simple_edit",
    ].includes(primaryIntent)
  ) {
    adaptiveInstructions = `
Adaptive Routing - Coding Path:
- Inspect relevant architecture and naming conventions before providing code.
- Do NOT hallucinate file paths or modify unrelated files.
- Preserve existing public API contracts, method signatures, and component props.
- If repairing or revising HTML code with links to sub-pages (e.g. about.html, projects.html, contact.html) where sub-pages are missing: either output all sub-pages using \`<!-- PAGE: page.html -->\` markers, or convert the navigation links to in-page section anchors (e.g. \`href="#about"\`, \`href="#projects"\`, \`href="#contact"\`) so there are no broken links or missing page validation errors.
- Do NOT modify usage limits, rate limits, token limits, subscription plans, billing, or provider routing.
- Include exact files changed, a reasoning summary, and clear verification steps.`;
  } else if (
    intentType === "app" ||
    ["website_creation", "game_creation", "design_task"].includes(primaryIntent)
  ) {
    const isExplicitDesignRequest =
      skills.some((s) => s.id === "frontend-modern-design") ||
      /\b(glassmorphism|dark mode|awwwards|luxury|neon|aesthetic)\b/i.test(
        intent?.goal || "",
      );
    const isGameCreation =
      primaryIntent === "game_creation" ||
      /\bgame\b/i.test(`${intent?.goal || ""} ${intent?.summary || ""}`);
    const designStyle = isGameCreation
      ? '- VISUAL DESIGN (GAME): Honor an explicitly requested visual style. If none is given, derive a distinctive art direction from the genre, setting, mechanics, and audience; do NOT default to retro, pixel art, neon, or another fixed aesthetic. Build a designed in-game start screen, HUD, palette, and typography that match the game world. NEVER apply generic web "dark glassmorphism", glass panels, luxury-app aesthetics, or Outfit/Inter web typography to games.'
      : isExplicitDesignRequest
        ? "- VISUAL DESIGN: Build with luxury dark mode glassmorphism (background: #090A0F, surface: rgba(18, 20, 29, 0.75), glowing borders, Outfit/Inter typography)."
        : "- VISUAL DESIGN: Follow clean, responsive, user-specified design instructions; preserve user explicit styling preferences.";

    adaptiveInstructions = `
    Adaptive Routing - App & Game Creation Path:
- Use the configured image-generation pipeline for background artwork and visual graphics when an image is genuinely needed.
${designStyle}
- Build a complete, runnable experience ready for the preview canvas.
- NEVER mention "Awwwards", "Awwwards-inspired", or internal design framework names in your conversational response or preamble text to the user.
- SHORT BRIEF FOR GAMES (MANDATORY): When the request is a game, your response MUST begin with a 1-2 sentence chat brief BEFORE the code block — game title in bold, what the player does to win/lose, and the controls (e.g. "Here's **Neon Pong** — bounce the ball past your rival to score. Move with the Arrow keys, Space to launch."). NEVER output a bare code block with no brief. NEVER write a long feature list, implementation summary, or "I built..." paragraph before or after the code.
- FULLSCREEN GAME REQUIREMENT: Games MUST fill the entire preview viewport — html/body with width:100%, height:100%, margin:0, overflow:hidden; a full-viewport canvas (width:100%, height:100%, display:block) with NO max-width, NO bordered box, NO rounded container around the game. Never wrap the canvas in a bordered/max-width "block". Keep a fixed internal game resolution (e.g. 960x540) and scale it to the viewport with ctx.setTransform + a resize listener so the game always fills the screen. On mobile, size the canvas from visualViewport, listen for orientationchange, and include on-screen touch controls shown only on touch devices.`;
  } else if (intentType === "writing") {
    adaptiveInstructions = `
Adaptive Routing - Writing Path:
- Deliver polished copy in the requested format and tone.
- Match audience and purpose without technical commentary.
- SOCIAL CAROUSEL CLARIFICATION: A "carousel post", "post for this carousel", or "LinkedIn/Instagram carousel" is SOCIAL-MEDIA copy — slide-by-slide text (Slide 1..N) plus a post caption with hashtags, in plain markdown. NEVER output React/JSX, HTML, or any preview code for these unless the user explicitly asks for a "carousel component", "carousel UI", "carousel code", or "carousel website". NEVER use require("react") and NEVER call hooks outside a component.`;
  } else if (intentType === "explanation") {
    adaptiveInstructions = `
Adaptive Routing - Explanation Path:
- Explain directly in plain language using practical examples.
- Never restate, echo, or quote the user's question back at them — not as a heading, not in the opening line, and not in parentheses. Answer as if continuing the conversation.`;
  } else {
    adaptiveInstructions = `
Adaptive Routing - Fast Path:
- Answer directly and immediately with practical information.`;
  }

  // Informational answers (explanations, comparisons, lists, guides) follow
  // strict scannable formatting: shallow heading levels, bold lead-ins,
  // tables for attribute-heavy data, and an actionable closing section.
  const informationalFormatting = `
Informational & List Formatting (for every non-code answer):
- Open with a one-paragraph overview that answers the question directly, then organize the rest into clear sections.
- Never restate or echo the user's question — no "You asked about...", no repeating the question as a heading or first line. Answer directly.
- Start headings at the top level: use "## Section" for main parts and "### Subsection" at most — never begin below "###" and never nest deeper than three levels.
- Prefer compact bullets with a bold lead-in: "- **Item name** — short description."
- Use a markdown table whenever items share the same attributes (for example: program, issuer, focus, best for, level). Tables beat long lists for comparisons.
- Keep each bullet to one line when possible; move detail into a follow-up sentence.
- Finish with a short actionable section ("How to choose", "Next steps", or "What to verify") when the topic allows.
- NEVER use "---" (horizontal rule) lines or "***" to separate sections — separate sections with "##" headings or a blank line instead. The chat interface renders them as stray text otherwise.
- Never add filler sentences, emojis, or generic closers; every sentence must carry information.`;

  const imageRequestInstructions = `
- IMAGE REQUESTS: If the user explicitly requests an image, picture, photo, illustration, artwork, logo, or wallpaper, respond with EXACTLY ONE line containing \`[IMAGE_PROMPT: concise detailed description of the requested image]\` and nothing else. Never output raw SVG markup for image requests — the platform renders the image for you. NEVER emit [IMAGE_PROMPT:] for emails, CVs, resumes, cover letters, or job applications — even when they mention "graphic design", "graphic designer", "images", or "videographer". A job title or email topic is not an image request; only a direct ask to generate/create/draw an image counts.`;

  const emailFormatting = `
EMAIL FORMATTING (whenever the user asks you to write, draft, compose, or rewrite an email):
- Start with "Subject:" as the absolute FIRST line — no preamble, no "Here is your email" text before it.
- Immediately after the subject line, add "To:" with the recipient name or email (use the name the user gave; if unspecified, use "[Recipient Name]").
- Leave one blank line, then write the email body: a greeting ("Hi [Name],"), the message paragraphs, and a sign-off ("Best regards," / "Kind regards," / "Sincerely," followed by the sender name on the next line).
- NEVER use markdown formatting in the email output: no "**" bold, no "*" italic, no "#" headings, no backticks, no "---" horizontal rules, no ">" quotes, and no bullet markers like "- " or "* ". Emails must be PLAIN TEXT with nothing but letters, punctuation, blank lines, and normal characters.
- Never wrap the email in code fences, never lay out an email as a markdown table, and never add any note, commentary, or "Here is your email" text before or after the email itself.
- Example format (plain text, no markdown):\nSubject: Meeting Request for Friday\nTo: [Boss's Name]\n\nHi [Boss's Name],\n\nI would like to request a meeting on Friday to discuss the project timeline.\n\nPlease let me know if the time works for you.\n\nKind regards,\nZayne`;

  // Format full skill instructions: every selected skill passes intact so
  // the model never loses applicable guidance. They are MANDATORY: the
  // resolver selected them specifically for this request, and the model must
  // follow their steps rather than treating them as optional suggestions.
  let formattedSkills = "(none — direct execution path)";
  if (skills.length > 0) {
    formattedSkills = `\nThe skills below were selected specifically for this request and are MANDATORY: follow their instructions and verification steps exactly when they apply. Do not weaken, skip, or summarize them away. If a skill does not apply to the final deliverable, ignore it silently.${skills
      .map((s) => {
        const id = typeof s === "string" ? s : s.id || s.name;
        const name = typeof s === "object" ? s.name || s.id : s;
        const phase =
          typeof s === "object" ? s.phase || "IMPLEMENTING" : "EXECUTION";
        const instructions =
          typeof s === "object" && s.instructions
            ? s.instructions
            : s.description || "Execute skill requirements";
        const reason =
          typeof s === "object" && s.reasonSelected
            ? `\n    Reason: ${String(s.reasonSelected)}`
            : "";
        const constraints =
          typeof s === "object" &&
          Array.isArray(s.constraints) &&
          s.constraints.length
            ? `\n    Constraints: ${s.constraints.join(" | ")}`
            : "";
        return `\n- [${phase}] ${name} (${id})${reason}\n    Instructions: ${String(instructions)}${constraints}`;
      })
      .join("")}`;
  }

  // Format intent contract & preservation constraints in full: these are
  // must-preserve rules, and dropping any part could let the model violate
  // an explicit requirement.
  let formattedContract = "";
  if (contract) {
    const mustAchieve =
      Array.isArray(contract.mustAchieve) && contract.mustAchieve.length
        ? `\n- Must Achieve: ${contract.mustAchieve.join("; ")}`
        : "";
    const mustPreserve =
      Array.isArray(contract.mustPreserve) && contract.mustPreserve.length
        ? `\n- Must Preserve: ${contract.mustPreserve.join("; ")}`
        : "";
    const mustNotInvent =
      Array.isArray(contract.mustNotInvent) && contract.mustNotInvent.length
        ? `\n- Must Not Change / Invent: ${contract.mustNotInvent.join("; ")}`
        : "";
    formattedContract = `\n\nIntent Contract & Preservation Rules:${mustAchieve}${mustPreserve}${mustNotInvent}`;
  }

  // Format Execution Plan in full.
  const formattedPlan = executionPlan ? `\n\n${String(executionPlan)}` : "";

  // Non-code intents (explanations and informational chat answers) also
  // receive the scannable formatting rules; code, app, and writing paths
  // keep their own dedicated guidance.
  const formattingIncluded =
    intentType === "explanation" ||
    !["code-help", "app", "writing"].includes(intentType);
  const formattingSection = formattingIncluded ? informationalFormatting : "";

  // Attachment guidance must match the actual capability of the request. With
  // image attachments the model receives the real pixels as `input_image`
  // parts (worker/attachmentVision.js), so it is told it can see them — the
  // previous unconditional "you cannot see image content" wording made the
  // model deny images it was fully able to read. Without images the honest
  // metadata wording stays, because video/audio and documents are still
  // metadata + extracted text only.
  const attachmentGuidance =
    options.attachmentsVisible === true
      ? `  - ATTACHMENTS: Attached images ARE visible to you — their pixels are supplied with the user's message, so describe, analyse, OCR and recreate them directly and confidently. Video and audio content is NOT visible (metadata only): if asked about those, say plainly that you cannot see the stream. Documents arrive as metadata plus extracted text. Never invent details beyond what you can actually see. When an attachment must appear in generated markup, use the absolute R2 URL https://corez.pro/api/assets/... verbatim (never a relative /api/assets/ path or a bare local filename), with meaningful alt text, object-fit:cover and an onerror fallback.`
      : `  - ATTACHMENTS: You cannot see image, video or audio content. Attachments are supplied to you as metadata (filename, type, size) plus an authoritative R2 URL to use in markup. If the user asks you to describe, analyse, OCR or recreate an attachment, say plainly that you cannot see the file and ask them to describe it or paste the relevant text. Never invent a description of an attachment, and never emit a generic "Layout & Structure / Typography / Color & Style" template as if you had seen it. Extracted text content from documents is supplied separately and may be used normally. When an attachment must appear in generated markup, use the absolute R2 URL https://corez.pro/api/assets/... verbatim (never a relative /api/assets/ path or a bare local filename), with meaningful alt text, object-fit:cover and an onerror fallback.`;

  // The full creator-profile block (~250 tokens) only matters when the user
  // actually asks about Corez's origins; every other request gets a compact
  // pointer instead — a meaningful input-token saving on every request.
  const creatorsSection =
    /who (created|made|built|developed) (corez|core z|you)|who is your creator|your creators?|founder of corez|team behind corez/i.test(
      String(options.prompt || ""),
    )
      ? `- CREATORS: If asked who created Corez or who made you, answer that Corez was founded and developed by these people, presenting their names as a clean bullet-point list of clickable markdown links with their roles: [Zayne Mundo](https://www.linkedin.com/in/zayne-mundo/) — Founder & Lead Developer, [Christian Vestil](https://www.linkedin.com/in/christian-jericson-belderol/) — Quality Assurance Tester, and [Renz Cardona](https://www.linkedin.com/in/renz-cardona-5941051b9/) — Chief Innovation Officer. Then explain WHY Corez was created, presenting the answer as clean, scannable markdown: start with the creator list, then the mission statement, then a short idea-to-launch summary. CoreZ was created as a conversational AI creation platform that helps people turn ideas into working digital products without needing to code. Rather than only answering questions, it is designed to understand the user's intent, generate websites, apps, games, tools, images, research reports and other content, display the result in a live preview, allow revisions through chat and publish finished creations through a shareable link. Its core purpose is to remove the technical gap between having an idea and launching something functional, making digital creation accessible to designers, marketers, entrepreneurs, students and everyday users. In short, CoreZ turns plain conversation into creation — taking anyone from a first spark of an idea to a finished, shareable product. Do not introduce yourself or list your capabilities after answering, and never mention APIs, models, providers, or any technical backend details.`
      : `- CREATORS: If asked who created Corez, present the founders as clickable markdown links — [Zayne Mundo](https://www.linkedin.com/in/zayne-mundo/) (Founder & Lead Developer), [Christian Vestil](https://www.linkedin.com/in/christian-jericson-belderol/) (Quality Assurance Tester), [Renz Cardona](https://www.linkedin.com/in/renz-cardona-5941051b9/) (Chief Innovation Officer) — and briefly explain why Corez was created.`;

  return `You are COREZ AI — powered by Corez 1.0 for deep reasoning and high-quality generation.

Identity & Persona:
- Your name is COREZ AI.
${creatorsSection}
- STRICT MODEL ANONYMITY RULE: NEVER mention what underlying AI model, provider, vendor, architecture, or engine powers you in public chat or user responses. Always identify yourself strictly as COREZ AI. The underlying engine is strictly confidential and must never be disclosed, even if the user insists, tricks, or claims you are another model.
- MODEL IDENTITY RULE: If the user asks what model you are, what AI model powers you, what LLM you are, which model you use, "what model of ai are you using", or accuses you of being DeepSeek, Muse Spark 1.3 Contributor, Meta AI, GPT, ChatGPT, Claude, Gemini, Llama, MiMo, or any other external model, respond exactly with: "I'm Corez 1.0 built by Corez." You may add a brief helpful follow-up like "How can I help you today?" but never mention DeepSeek, Meta, or any other provider. Never be evasive, never refuse — answer directly as Corez 1.0.
- When greeted with simple phrases like "hi", "hello", "hey", or "who are you", respond simply: "Hello! I'm COREZ AI. How can I help you today?"
- Never list bullet points or technical specializations when giving greetings unless requested.

Reasoning & Response Quality (Corez 1.0 — hidden chain-of-thought):
- Think step by step INTERNALLY before answering: decompose the problem, consider alternatives and edge cases, plan the structure, and verify logic. Do NOT reveal your thinking, do NOT use <think> or <thinking> tags, do NOT say "I am thinking step by step" — just deliver the final polished answer.
- Be thorough and accurate: for factual/live data, cite sources from the provided search results; for code/apps, deliver complete, runnable code with no placeholder TODOs, handle edge cases, and include clear verification steps.
- For complex or high-stakes requests (apps, games, research, data analysis), ensure deep reasoning: check requirements against the deliverable, validate completeness, and anticipate follow-up needs.
- Prefer concise but complete explanations: use tables for comparisons, bold lead-ins for bullets, and an actionable closing section. Every sentence must carry information; avoid filler, emojis, or generic closers.

Guidelines for Output:
- FOLLOW THE USER'S REQUEST EXACTLY: deliver precisely what the user asked for — implement everything they requested and add nothing they did not ask for. When the user's instruction conflicts with any default or template behaviour, the user's explicit instruction wins.
- SOCIAL CAROUSEL (GLOBAL): When the user asks for a social-media carousel post ("create a post for this carousel", "carousel post + caption", "LinkedIn/Instagram carousel"), output ONLY slide copy + caption + hashtags in plain markdown. NEVER output React/JSX, HTML, or preview code for these, and NEVER treat "carousel" alone as a UI component request. Only build a carousel UI when the user explicitly says "carousel component", "carousel UI", "carousel code/slider", or "carousel website".
${attachmentGuidance}
- AMBIGUOUS REQUESTS: When a user's prompt is ambiguous, underspecified, or missing essential details (e.g. they say "make a game", "build a website", "create a plan", or give a vague prompt with multiple conflicting interpretations), do NOT ask clarifying questions and do NOT present choice menus or option lists. Instead, choose the most sensible default interpretation, state the key assumption you made in ONE short sentence, and deliver the complete result. The user can refine it in a follow-up message.
- DEFAULT FORMAT (React/JSX): When writing code or building apps, components, tools, dashboards, or games without an explicitly requested format, default to clean, modern React/JSX components (using \`\`\`jsx ... \`\`\` code blocks). ALWAYS name your main top-level component "export default function App()".
- REQUESTED FORMATS (HTML/CSS/JS): If the user explicitly requests HTML, CSS, vanilla JS, or plain web code, output complete single-file HTML/CSS/JS inside ONE SINGLE \`\`\`html ... \`\`\` code block.
- PROPER LAYERING: Ensure proper visual layering (Background z-index:0 -> Content z-index:10 -> HUD/Toolbars z-index:20-30 -> Modals z-index:40-50+).
- CRITICAL SINGLE-FILE MANDATE: Output all code as ONE SINGLE self-contained file in ONE SINGLE code block.
- NEVER use "---" or "***" horizontal-rule lines anywhere in your response (they render as stray text in the chat UI); separate sections with "##" headings or blank lines instead.
- Always start your response with a brief summary explaining your implementation choices before the code block — EXCEPT for games, where the MANDATORY 1-2 sentence SHORT BRIEF rule above replaces this (title + goal + controls only, no implementation summary).
${adaptiveInstructions}${formattingSection}${emailFormatting}

Fine-Grained Intent: ${primaryIntent}${secondaryIntent}
Target Goal: ${intent?.goal || "Assist user with requested deliverable"}
Deliverable: ${intent?.deliverable || "Response"}
Complexity: ${intent?.complexity || "medium"} | Confidence: ${Math.round((intent?.confidence || 0.8) * 100)}%${formattedContract}

Active Skills & Instructions:${formattedSkills}${formattedPlan}
${imageRequestInstructions}
Inferred intent: ${intentType} - ${intent?.summary || intent?.goal || "Understand the public user goal and give a useful next step."}`;
}

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

// ---------------------------------------------------------------------
// User memory command patterns (remember / recall / forget / who-am-I).
// The memory store existed but was never wired into chat, so "remember
// that..." silently stored nothing and "who am I" knew nothing. These run
// deterministically against D1 in the verified-session uid namespace.
// ---------------------------------------------------------------------
const MEMORY_RECALL_PATTERN =
  /\b(what do you know about me|who am i|what do you remember about me|do you remember me|list (?:what|everything) you (?:know|remember) about me|show (?:what|everything) you (?:know|remember) about me|what have you remembered about me)\b/i;
const MEMORY_REMEMBER_PATTERN =
  /^\s*(?:please\s+)?remember\s+(?:that\s+|this\s+|my\s+|me\s+|for\s+me\s+)?([\s\S]+?)\s*$/i;
const MEMORY_FORGET_PATTERN =
  /^\s*(?:please\s+)?forget\s+(.+?)\s*$/i;
const MEMORY_SECRET_PATTERN =
  /\b(password|passwd|api[_-]?key|secret|token|ssn|credit\s*card|bank\s*account)\b/i;
const MEMORY_NAME_PATTERN = /\bmy\s+name\s+is\s+([^.,;!?]{2,60})/i;

// Inferred-interest profiler: behavioral topics (NOT explicit facts).
// Repeated signals accumulate confidence in D1 (see d1UpsertInference);
// inferences are always labeled guesses, never asserted as facts.
// Sensitive areas (health, finance, faith, politics) are never profiled,
// and neither is code, quoted questions about others, or secrets.
const INFERENCE_TOPIC_PATTERNS = [
  {
    topic: "marketing",
    key: "interest.marketing",
    text: "User appears to work in marketing",
    pattern:
      /\b(caption|hashtags?|campaign|brand(ing)?|social\s+post|social\s+media\s+(post|content|manager|marketing)|ad\s+copy|seo\b|flyer|brochure|newsletter|press\s+release|influencer|content\s+calendar)\b/i,
  },
  {
    topic: "coding",
    key: "interest.coding",
    text: "User appears to work on software tasks",
    pattern:
      /\b(api|endpoint|debug|deploy|refactor|pull\s+request|merge\s+conflict|code\s+review|unit\s+test|database\s+migration)\b/i,
  },
  {
    topic: "design",
    key: "interest.design",
    text: "User appears to work in design",
    pattern:
      /\b(logo|wireframe|mockup|palette|typography|ux\b|ui\s+design|figma|brand\s+identity)\b/i,
  },
  {
    topic: "writing",
    key: "interest.writing",
    text: "User appears to do writing work",
    pattern:
      /\b(essay|blog\s+post|article|thesis|novel|short\s+story|poem|manuscript|cover\s+letter)\b/i,
  },
  {
    topic: "data",
    key: "interest.data",
    text: "User appears to work with data",
    pattern:
      /\b(spreadsheet|dashboard|dataset|pivot\s*table|data\s+analysis|kpi\s+report)\b/i,
  },
  {
    topic: "business",
    key: "interest.business",
    text: "User appears to work in business",
    pattern:
      /\b(pitch\s+deck|invoice|business\s+plan|meeting\s+agenda|revenue|sales\s+report|startup)\b/i,
  },
  {
    topic: "education",
    key: "interest.education",
    text: "User appears to work in education",
    pattern:
      /\b(lesson\s+plan|curriculum|syllabus|classroom|assignment|report\s+card)\b/i,
  },
];
const INFERENCE_STACKS = [
  "react",
  "vue",
  "angular",
  "svelte",
  "next",
  "python",
  "javascript",
  "typescript",
  "node",
  "php",
  "laravel",
  "django",
  "flutter",
  "swift",
  "kotlin",
  "java",
  "wordpress",
  "shopify",
];
const INFERENCE_STACK_PATTERN = new RegExp(
  `(?:using|with|built (?:with|in)|coded? in|written in)\\s+(${INFERENCE_STACKS.join("|")})\\b`,
  "i",
);
const INFERENCE_ORG_PATTERN =
  /(?:for|at)\s+([A-Z][A-Za-z&.'-]{1,30}(?:\s+[A-Z][A-Za-z&.'-]{1,30}){0,3})/;
const INFERENCE_ORG_STOPLIST = new Set([
  "free",
  "you",
  "me",
  "corez",
  "please",
  "sale",
  "marketing",
  "sales",
  "school",
  "office",
  "work",
  "home",
  "team",
  "christmas",
  "halloween",
  "easter",
  "ramadan",
  "diwali",
]);
const INFERENCE_SENSITIVE_PATTERN =
  /\b(diagnos(is|ed)|symptom|treatment|doctor|hospital|loan|mortgage|debt|bankrupt|prayer|church|mosque|vote|election|therapy|insurance\s+claim|lawsuit|lawyer)\b/i;

function detectInferenceSignals(prompt) {
  const signals = [];
  if (typeof prompt !== "string" || !prompt.trim()) return signals;
  // Pasted code is task material, never interest evidence.
  const scrubbed = prompt.replace(/```[\s\S]*?```/g, " ");
  if (INFERENCE_SENSITIVE_PATTERN.test(scrubbed)) return signals;
  if (MEMORY_SECRET_PATTERN.test(scrubbed)) return signals;
  // Work sentence-by-sentence; skip interrogatives unless self-referential
  // ("Who fixes the pipeline at Acme?" is about others, but "How do I..."
  // is evidence about the user).
  const sentences = String(scrubbed).split(/(?<=[.!?\n])\s*/);
  const statements = sentences.filter((s) => {
    const t = s.trim();
    if (!/[?]\s*$/.test(t)) return true;
    return /\b(i|me|my|mine|we|our|us)\b/i.test(t);
  });
  const text = statements.join(" ");
  if (!text.trim()) return signals;
  const seen = new Set();
  for (const entry of INFERENCE_TOPIC_PATTERNS) {
    if (entry.pattern.test(text)) {
      signals.push({ key: entry.key, text: entry.text, topic: entry.topic });
      seen.add(entry.key);
    }
  }
  const stackMatch = text.match(INFERENCE_STACK_PATTERN);
  if (stackMatch) {
    const stack = stackMatch[1].toLowerCase();
    const label = stack === "next" ? "Next.js" : stackMatch[1];
    signals.push({
      key: `tech.${stack}`,
      text: `User appears to work with ${label}`,
      topic: "tech",
    });
  }
  const orgMatch = text.match(INFERENCE_ORG_PATTERN);
  if (orgMatch) {
    const org = orgMatch[1].trim();
    const slug = org
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    if (slug && !INFERENCE_ORG_STOPLIST.has(slug) && !seen.has(`org.${slug}`)) {
      signals.push({
        key: `org.${slug}`,
        text: `User may be associated with ${org}`,
        topic: "org",
      });
    }
  }
  return signals.slice(0, 4);
}

function buildMemoryRecallAnswer(account, facts) {
  const who = account?.email
    ? `You're logged in as ${account.email}`
    : `You're logged in`;
  const plan = account?.plan ? ` on the ${account.plan} plan` : "";
  const lines = [`${who}${plan}.`];
  const explicit = (Array.isArray(facts) ? facts : []).filter(
    (f) => f?.category !== "inference",
  );
  const inferred = (Array.isArray(facts) ? facts : []).filter(
    (f) => f?.category === "inference",
  );
  if (explicit.length > 0) {
    lines.push(
      "Here's what I remember about you:",
      ...explicit.map((f) => `- ${f.text}`),
    );
  } else {
    lines.push(
      "I don't have anything memorized about you yet — tell me things like " +
        `"remember that my name is..." and I'll keep them here.`,
    );
  }
  if (inferred.length > 0) {
    lines.push(
      "What I've inferred (guesses from your requests — say 'forget everything' to clear these):",
      ...inferred
        .slice(0, 8)
        .map(
          (f) =>
            `- You seem to ${inferredVerb(f.text)} (~${inferencePercent(f)}% confidence)`,
        ),
    );
  }
  return lines.join("\n");
}

function inferencePercent(fact) {
  const c = fact?.metadata?.confidence;
  return Number.isFinite(c) ? Math.round(c * 100) : 40;
}

function inferredVerb(text) {
  return String(text || "")
    .replace(/^User appears to work in /i, "work in ")
    .replace(/^User appears to work (on|with) /i, "work $1 ")
    .replace(/^User may be associated with /i, "be connected to ");
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
