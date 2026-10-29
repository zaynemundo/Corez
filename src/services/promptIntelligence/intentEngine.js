/**
 * CoreZ Intent Engine
 *
 * Understands user intent from raw prompts.  Attempts local pattern
 * classification first; may delegate to AI models when configured.
 *
 * Returns structured intent data — it NEVER executes the task.
 */

import {
  INTENT_TYPES,
  createIntentResult,
} from "./schemas.js";
import {
  extractDomain,
  extractGenre,
  extractFeature,
  BLOCKING_QUESTIONS,
  OPTIONAL_QUESTIONS,
  detectIsExistingProject,
  detectOutputFormat,
  isCVRewriteRequest,
  getInstructionPart,
  hasExplicitWebCreationInInstruction,
  isSocialCarouselCopyInstruction,
  extractRequirements,
  detectMissingInformation,
  classifyComplexity,
} from "./intentHandlers.js";

export {
  extractDomain,
  extractGenre,
  extractFeature,
  BLOCKING_QUESTIONS,
  OPTIONAL_QUESTIONS,
  extractRequirements,
  detectMissingInformation,
  classifyComplexity,
};

// ---------------------------------------------------------------------------
// Intent registry — each entry maps a type to detection + extraction logic
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} IntentHandler
 * @property {RegExp}  pattern   — primary detection regex
 * @property {string[]} signals  — lowercased keyword signals
 * @property {(_prompt: string, _lower: string) => Partial<IntentResult>} extract
 */

const INTENT_HANDLERS = [
  {
    type: INTENT_TYPES.WEBSITE_CREATION,
    // `dashboard`/`portal`/`saas` are web-app artifacts too. Without them a new
    // app build ("Build a responsive React user dashboard for managing customer
    // subscriptions") was claimed by feature_implementation, which owns
    // "dashboard" for the *additive* case ("add a dashboard to my app") — and
    // feature_implementation marks the project as existing, so a greenfield
    // build was reported as a change to an existing project.
    //
    // Like image detection, the build verb must govern the website noun
    // within a tight window (~48 chars): unbounded `.*` let "create an email
    // ... mentioning our site" classify as a website build. Bare mentions
    // without a governing verb are demoted by the explicit-website guard in
    // classifyIntent below (same rules as @image).
    pattern:
      /\b(build|make|create|generate|design|code|develop)\b[\w\s,'"-]{0,48}?\b(website|site|landing page|webpage|web app|web application|homepage|portfolio site|dashboard|admin panel|portal|saas)\b|\b(website|site|landing page|portfolio|dashboard|admin panel|portal)\b[\w\s,'"-]{0,48}?\b(build|make|create|generate|design|code|develop)\b/i,
    signals: [
      "website",
      "landing page",
      "homepage",
      "web app",
      "web application",
      "site",
      "portfolio site",
      "dashboard",
      "portal",
      "saas",
    ],
    extract(prompt, lower) {
      const domain = extractDomain(lower) || "general";
      return {
        goal: `create a website for ${domain}`,
        domain,
        deliverable: "responsive website",
      };
    },
  },
  {
    type: INTENT_TYPES.GAME_CREATION,
    pattern:
      /\b(build|make|create|generate|design|code|develop|program)\b.*\b(game|simulator|simulation|sandbox|multiplayer|rpg|platformer|shooter|chess|pong|snake|quiz|wordle|scrabble|puzzle|arcade|canvas game|2d game|3d game|physics sandbox|tetris|flappy|clicker|idle game)\b|\b(game|simulator|chess|pong|snake|platformer|shooter|tetris|flappy)\b.*\b(build|make|create|generate|design|code|develop)\b/i,
    signals: [
      "game",
      "play",
      "simulator",
      "simulation",
      "sandbox",
      "multiplayer",
      "platformer",
      "shooter",
      "chess",
      "pong",
      "snake",
      "quiz",
      "wordle",
      "scrabble",
      "puzzle",
      "arcade",
      "tetris",
      "flappy",
      "clicker",
    ],
    extract(prompt, lower) {
      const genre = extractGenre(lower) || "general";
      return {
        goal: `create a ${genre} browser game`,
        domain: "browser gaming",
        deliverable: "browser game",
      };
    },
  },
  {
    type: INTENT_TYPES.FEATURE_IMPLEMENTATION,
    pattern:
      /\b(add|implement|build|integrate|create)\b.*\b(feature|module|component|page|api|endpoint|route|service|handler|auth|login|authentication|search|search bar|filter|pagination|upload|export|toggle|dark mode|light mode|theme|settings|sort|modal|form|button|sidebar|header|footer|dashboard|analytics)\b/i,
    signals: [
      "add",
      "implement",
      "integrate",
      "feature",
      "module",
      "component",
      "endpoint",
      "toggle",
      "dark mode",
      "theme",
      "settings",
      "modal",
      "search bar",
    ],
    extract(_prompt, _lower) {
      return {
        type: INTENT_TYPES.FEATURE_IMPLEMENTATION,
        goal: `implement ${extractFeature(_lower) || "feature"}`,
        deliverable: `${extractFeature(_lower) || "feature"} implementation`,
      };
    },
  },
  {
    type: INTENT_TYPES.BUG_FIX,
    pattern:
      /\b(fix|debug|repair|resolve|patch|bug|error|exception|crash|broken|not working|failing|issue)\b/i,
    signals: [
      "fix",
      "debug",
      "repair",
      "bug",
      "error",
      "exception",
      "crash",
      "broken",
      "not working",
    ],
    extract(_prompt, _lower) {
      return {
        goal: `fix the reported bug or error`,
        deliverable: "bug fix",
      };
    },
  },
  {
    type: INTENT_TYPES.CODE_REFACTOR,
    pattern:
      /\b(refactor|rewrite|restructure|reorganise|reorganize|clean up|improve|optimise|optimize)\b.*\b(code|function|module|class|component|architecture|service|api|file|dir)\b|\b(refactoring)\b/i,
    signals: [
      "refactor",
      "rewrite",
      "restructure",
      "reorganise",
      "optimise",
      "optimize",
      "clean up",
    ],
    extract(_prompt, _lower) {
      return {
        goal: `refactor the existing code`,
        deliverable: "refactored code",
      };
    },
  },
  {
    type: INTENT_TYPES.CODE_QUESTION,
    pattern:
      /\b(how|what|why|explain|tell me|show me|help)\b.*\b(code|js|javascript|react|python|css|html|function|component|api|library|framework|syntax|pattern)\b|\b(explain|understand|learn)\b.*\b(code|programming)\b/i,
    signals: [
      "how",
      "what",
      "why",
      "explain",
      "tell me",
      "help",
      "code",
      "syntax",
    ],
    extract(_prompt, _lower) {
      return {
        goal: `answer a code-related question`,
        deliverable: "explanation",
      };
    },
  },
  {
    type: INTENT_TYPES.RESEARCH,
    pattern:
      /\b(research|search for|search the web|look up|investigate|analyse|analyze|compare|definition of|what is|what are|how does|how do|tell me about|difference between|find out)\b/i,
    signals: [
      "research",
      "search for",
      "look up",
      "investigate",
      "analyse",
      "analyze",
      "compare",
      "definition",
      "what is",
      "tell me about",
      "difference between",
    ],
    extract(_prompt, _lower) {
      return {
        goal: `research the requested topic`,
        deliverable: "research findings",
      };
    },
  },
  {
    type: INTENT_TYPES.DESIGN_TASK,
    pattern:
      /\b(design|redesign|layout|wireframe|mockup|ux|ui|style|theme|color scheme|typography)\b.*\b(for|of|page|app)\b|\b(design|redesign)\b.*\b(component|page|screen)\b/i,
    signals: [
      "design",
      "redesign",
      "layout",
      "wireframe",
      "mockup",
      "ux",
      "ui",
      "style",
      "theme",
    ],
    extract(_prompt, _lower) {
      return {
        goal: `complete a design task`,
        deliverable: "design",
      };
    },
  },
  {
    type: INTENT_TYPES.IMAGE_GENERATION,
    pattern:
      /\b(generate|create|make|draw|render|produce)\b[\w\s,'"-]{0,48}?\b(?:images?|pictures?|photos?|pics?|artworks?|illustrations?|graphic(?!\s+(?:design|designer|designs|designing)\b)|icons?|sprites?|logos?|banners?|posters?)\b|\b(image generation)\b/i,
    signals: [
      "image",
      "picture",
      "photo",
      "artwork",
      "illustration",
      "graphic",
      "icon",
      "sprite",
    ],
    extract(_prompt, _lower) {
      return {
        goal: `generate an image`,
        deliverable: "image",
      };
    },
  },
  {
    type: INTENT_TYPES.CONTENT_CREATION,
    pattern:
      /\b(write|create|compose|draft|generate|rewrite|condense|shorten|summarize|rephrase|reduce|polish|edit)\b.*\b(article|blog|post|email|newsletter|copy|content|text|document|report|proposal|summary|description|cv|resume|bullet|bio)\b|\b(give me less|less description|make.*shorter|make.*concise|short version|concise version|ultra.short|condensed version)\b/i,
    signals: [
      "write",
      "create",
      "compose",
      "article",
      "blog",
      "email",
      "newsletter",
      "copy",
      "content",
      "cv",
      "resume",
      "rewrite",
      "summarize",
      "condense",
      "less description",
      "shorten",
      "bullet",
    ],
    extract(_prompt, _lower) {
      return {
        goal: `create written content`,
        deliverable: "content",
      };
    },
  },
  {
    type: INTENT_TYPES.SIMPLE_EDIT,
    pattern:
      /\b(change|update|rename|move|delete|remove|set|color|colour|font|size|width|height|margin|padding)\b.*\b(to|the|this|file|component)\b|\b(tweak|adjust|switch|swap)\b/i,
    signals: [
      "change",
      "update",
      "rename",
      "delete",
      "remove",
      "color",
      "colour",
      "font",
      "adjust",
      "tweak",
    ],
    extract(_prompt, _lower) {
      return {
        goal: `make a simple edit`,
        deliverable: "code edit",
      };
    },
  },
];

// ---------------------------------------------------------------------------
// Main classifier
// ---------------------------------------------------------------------------

// Signal matching is word-boundary, not substring. A plain `includes` test let
// short signals match inside unrelated words, silently reassigning the intent:
// "build" matched `ui`, "address" matched `add`, "prefix" matched `fix`,
// "display" matched `play` and "silicon" matched `icon` — so a bare "build" was
// classified design_task, "address" feature_implementation, "prefix" bug_fix,
// "display" game_creation (domain "browser gaming") and "silicon"
// image_generation. Every signal is lowercase alphanumeric-plus-space, so a
// word-boundary wrap is safe; the compiled regexes are cached per handler
// because this runs for every handler on every classification.
const SIGNAL_REGEX_CACHE = new WeakMap();

function signalRegexes(handler) {
  let compiled = SIGNAL_REGEX_CACHE.get(handler);
  if (!compiled) {
    compiled = (handler.signals || []).map(
      (signal) =>
        new RegExp(`\\b${signal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`),
    );
    SIGNAL_REGEX_CACHE.set(handler, compiled);
  }
  return compiled;
}

function computeConfidence(handler, lower) {
  const maxSignals = Math.min(handler.signals.length || 1, 8);
  let matchedSignals = 0;
  for (const signalPattern of signalRegexes(handler)) {
    if (signalPattern.test(lower)) matchedSignals += 1;
  }
  let score = Math.min(1, matchedSignals / Math.max(1, maxSignals * 0.4));
  if (handler.pattern.test(lower)) score = Math.min(1, score + 0.25);
  return Math.round(score * 100) / 100;
}

/**
 * @param {string} prompt — raw user prompt
 * @returns {object} structured intent result
 */
export function classifyIntent(prompt) {
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return createIntentResult({
      confidence: 0,
      type: INTENT_TYPES.GENERAL_QUESTION,
    });
  }

  const lower = prompt.toLowerCase().trim();

  // Early disambiguation: social-media carousel copy ("create a post for this
  // carousel", "carousel post + caption") must stay content_creation even when
  // the pasted body contains hijack words like "research" or "design".
  // Instruction prefix only — the body copy is evidence, not intent.
  const socialInstructionLower = getInstructionPart(prompt);
  if (isSocialCarouselCopyInstruction(socialInstructionLower)) {
    const handler = INTENT_HANDLERS.find(
      (h) => h.type === INTENT_TYPES.CONTENT_CREATION,
    );
    const confidence = Math.max(0.9, computeConfidence(handler, lower));
    const extracted = handler.extract(prompt, lower);
    return createIntentResult({
      type: INTENT_TYPES.CONTENT_CREATION,
      primaryIntent: INTENT_TYPES.CONTENT_CREATION,
      secondaryIntent: null,
      confidence,
      goal: extracted.goal || "create social carousel post copy",
      domain: "social / marketing",
      deliverable: "content",
      isExistingProject: false,
      outputFormat: "markdown",
    });
  }

  // Early disambiguation: CV rewrite / "less description" must NOT become website_creation
  // Pasted work history like "Developed websites using WordPress..." contains "website" + "develop"
  // which previously triggered website_creation via signals. We isolate the instruction prefix.
  if (isCVRewriteRequest(lower)) {
    const instructionLower = getInstructionPart(prompt);
    const hasWebInInstruction =
      hasExplicitWebCreationInInstruction(instructionLower);
    if (!hasWebInInstruction) {
      // Force content_creation — the user wants a shorter CV, not a website build
      const handler = INTENT_HANDLERS.find(
        (h) => h.type === INTENT_TYPES.CONTENT_CREATION,
      );
      const confidence = Math.max(0.88, computeConfidence(handler, lower));
      const extracted = handler.extract(prompt, lower);
      return createIntentResult({
        type: INTENT_TYPES.CONTENT_CREATION,
        primaryIntent: INTENT_TYPES.CONTENT_CREATION,
        secondaryIntent: null,
        confidence,
        goal: extracted.goal || "condense CV work history into concise bullets",
        domain: "career / resume",
        deliverable: "content",
        isExistingProject: false,
        outputFormat: "markdown",
      });
    }
  }

  const candidateMatches = [];

  for (const handler of INTENT_HANDLERS) {
    // Word-boundary signal matching (same rule as computeConfidence below): a
    // plain `includes` let "site" match inside unrelated words and let bare
    // noun mentions ("What should I check before deploying a website?")
    // claim website_creation with no build verb at all.
    const signalMatched = signalRegexes(handler).some((signalPattern) =>
      signalPattern.test(lower),
    );
    const matched = handler.pattern.test(prompt) || signalMatched;
    if (matched) {
      const confidence = computeConfidence(handler, lower);
      candidateMatches.push({ handler, confidence });
    }
  }

  candidateMatches.sort((a, b) => b.confidence - a.confidence);

  // Explicit-website guard (same rules as @image): a top website_creation
  // claimed by bare noun signals alone — "What should I check before
  // deploying a website?", "write an email about our new website launch",
  // pasted code mentioning "site" — is not a build. The build verb must
  // govern the website noun. Demoted prompts fall through to the next-best
  // candidate (writing, research, general ...) instead of building a website
  // the user never asked for.
  const WEBSITE_BUILD_STRICT =
    /\b(build|make|create|generate|design|code|develop)\b[\w\s,'"-]{0,48}?\b(website|site|landing page|webpage|web app|web application|homepage|portfolio site|dashboard|admin panel|portal|saas)\b/i;
  const WEBSITE_NOUN_VERB_STRICT =
    /\b(website|site|landing page|portfolio|dashboard|admin panel|portal)\b[\w\s,'"-]{0,48}?\b(build|make|create|generate|design|code|develop)\b/i;
  const WEBSITE_WRITING_GUARD =
    /\b(e-?mail|cover\s*letter|\bcv\b|resume|curriculum\s+vitae|job\s+application|applying\s+for)\b/i;
  const topIsWebsite =
    candidateMatches.length > 0 &&
    candidateMatches[0].handler.type === INTENT_TYPES.WEBSITE_CREATION;
  if (topIsWebsite) {
    const instructionLower = getInstructionPart(prompt);
    const explicitInInstruction =
      hasExplicitWebCreationInInstruction(instructionLower);
    const explicitShort =
      prompt.length < 300 &&
      (WEBSITE_BUILD_STRICT.test(prompt) ||
        WEBSITE_NOUN_VERB_STRICT.test(prompt));
    // Verb-governed builds stay explicit even in writing contexts ("build a
    // website for my resume"); noun-first mentions do not ("our new website
    // launch" inside an email request).
    const writingVeto =
      WEBSITE_WRITING_GUARD.test(prompt) &&
      !WEBSITE_BUILD_STRICT.test(instructionLower) &&
      !(prompt.length < 300 && WEBSITE_BUILD_STRICT.test(prompt));
    const codeVeto =
      /```|<!DOCTYPE\s+html|<html|<style|<script|\[(?:SURGICAL REVISION CONTEXT|Context: The user is requesting a revision)/i.test(
        prompt,
      );
    const socialVeto = isSocialCarouselCopyInstruction(instructionLower);
    if (
      (!explicitInInstruction && !explicitShort) ||
      writingVeto ||
      codeVeto ||
      socialVeto
    ) {
      const filteredWebsite = candidateMatches.filter(
        (c) => c.handler.type !== INTENT_TYPES.WEBSITE_CREATION,
      );
      candidateMatches.length = 0;
      if (filteredWebsite.length > 0) {
        candidateMatches.push(...filteredWebsite);
        candidateMatches.sort((a, b) => b.confidence - a.confidence);
      }
      // Empty: falls through to GENERAL_QUESTION below.
    }
  }

  // Secondary guards: pasted CV/resume content must not hijack intent
  const instructionLowerFallback = getInstructionPart(prompt);
  const pastHistoryMarkers = [
    "created proposals",
    "collaborated with the design",
    "monitored social media",
    "developed websites using",
    "managed advertising",
    "maintained close contact with clients",
    "scheduled social media posts",
  ];
  const resumeSignalCount = pastHistoryMarkers.filter((m) =>
    lower.includes(m),
  ).length;
  const looksLikeResumeDump = resumeSignalCount >= 2;

  if (
    !hasExplicitWebCreationInInstruction(instructionLowerFallback) &&
    /\b(give me less|less description|condense|rewrite|rephrase|make.*concise|make.*shorter|short version|concise version)\b/i.test(
      lower,
    )
  ) {
    const filtered = candidateMatches.filter(
      (c) =>
        c.handler.type !== INTENT_TYPES.WEBSITE_CREATION &&
        c.handler.type !== INTENT_TYPES.GAME_CREATION,
    );
    if (filtered.length > 0 && filtered[0].confidence >= 0.15) {
      candidateMatches.length = 0;
      candidateMatches.push(...filtered);
      candidateMatches.sort((a, b) => b.confidence - a.confidence);
    } else if (
      filtered.length === 0 &&
      candidateMatches.some(
        (c) => c.handler.type === INTENT_TYPES.WEBSITE_CREATION,
      )
    ) {
      // No alternative — fall back to content_creation for rewrite requests
      candidateMatches.length = 0;
      const handler = INTENT_HANDLERS.find(
        (h) => h.type === INTENT_TYPES.CONTENT_CREATION,
      );
      candidateMatches.push({ handler, confidence: 0.88 });
    }
  }

  // Tertiary guard: pure past-tense resume dump without any web-build instruction should not be website_creation
  if (
    looksLikeResumeDump &&
    !hasExplicitWebCreationInInstruction(instructionLowerFallback)
  ) {
    const filteredResume = candidateMatches.filter(
      (c) => c.handler.type !== INTENT_TYPES.WEBSITE_CREATION,
    );
    if (filteredResume.length > 0) {
      candidateMatches.length = 0;
      candidateMatches.push(...filteredResume);
      candidateMatches.sort((a, b) => b.confidence - a.confidence);
    } else if (
      candidateMatches.some(
        (c) => c.handler.type === INTENT_TYPES.WEBSITE_CREATION,
      )
    ) {
      // Convert bare resume dump to content_creation/general
      candidateMatches.length = 0;
      const handler = INTENT_HANDLERS.find(
        (h) => h.type === INTENT_TYPES.CONTENT_CREATION,
      );
      if (handler) candidateMatches.push({ handler, confidence: 0.75 });
    }
  }

  // Quaternary guard: signal-only website_creation from past-tense work history without request verb
  const hasRequestVerb =
    /\b(need|want|looking for|hire|seeking|require|build|make|create|generate|design|launch|ship|make me|create me|build me)\b/i.test(
      instructionLowerFallback,
    );
  const pastResumeVerbs = (
    lower.match(
      /\b(developed|created|collaborated|monitored|managed|maintained|scheduled|designed)\b/gi,
    ) || []
  ).length;
  if (
    !hasRequestVerb &&
    pastResumeVerbs >= 1 &&
    pastResumeVerbs >=
      (lower.match(/\b(website|site|landing page)\b/gi) || []).length
  ) {
    // Check if top candidate is website_creation via signals only
    const webHandler = INTENT_HANDLERS.find(
      (h) => h.type === INTENT_TYPES.WEBSITE_CREATION,
    );
    const webPatternMatched = webHandler.pattern.test(prompt);
    if (
      !webPatternMatched &&
      candidateMatches.some(
        (c) => c.handler.type === INTENT_TYPES.WEBSITE_CREATION,
      )
    ) {
      const filteredPast = candidateMatches.filter(
        (c) => c.handler.type !== INTENT_TYPES.WEBSITE_CREATION,
      );
      if (filteredPast.length > 0) {
        candidateMatches.length = 0;
        candidateMatches.push(...filteredPast);
        candidateMatches.sort((a, b) => b.confidence - a.confidence);
      } else {
        candidateMatches.length = 0;
        const handler = INTENT_HANDLERS.find(
          (h) => h.type === INTENT_TYPES.CONTENT_CREATION,
        );
        if (
          handler &&
          /\b(rewrite|condense|summarize|less description|shorten)\b/i.test(
            lower,
          )
        ) {
          candidateMatches.push({ handler, confidence: 0.75 });
        }
        // otherwise will fall through to GENERAL_QUESTION
      }
    }
  }

  if (candidateMatches.length === 0 || candidateMatches[0].confidence < 0.15) {
    const isExisting = detectIsExistingProject(
      lower,
      INTENT_TYPES.GENERAL_QUESTION,
    );
    const format = detectOutputFormat(lower, INTENT_TYPES.GENERAL_QUESTION);
    return createIntentResult({
      type: INTENT_TYPES.GENERAL_QUESTION,
      primaryIntent: INTENT_TYPES.GENERAL_QUESTION,
      secondaryIntent: null,
      goal: lower,
      confidence: candidateMatches[0]?.confidence || 0.1,
      isExistingProject: isExisting,
      outputFormat: format,
    });
  }

  const topMatch = candidateMatches[0];
  const secondMatch = candidateMatches.length > 1 ? candidateMatches[1] : null;

  // Confidence margin check: if second match is within 0.15 of top match, preserve secondary intent
  let secondaryIntent = null;
  if (secondMatch && topMatch.confidence - secondMatch.confidence <= 0.15) {
    secondaryIntent = secondMatch.handler.type;
  }

  const extracted = topMatch.handler.extract(prompt, lower);
  const isExisting = detectIsExistingProject(lower, topMatch.handler.type);
  const format = detectOutputFormat(lower, topMatch.handler.type);

  return createIntentResult({
    type: topMatch.handler.type,
    primaryIntent: topMatch.handler.type,
    secondaryIntent,
    confidence: topMatch.confidence,
    goal: extracted.goal || lower,
    domain: extracted.domain || "",
    deliverable: extracted.deliverable || "",
    isExistingProject: isExisting,
    outputFormat: format,
  });
}
