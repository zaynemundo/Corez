/**
 * CoreZ Intent Helpers, Disambiguators, and Requirement/Complexity Classifiers
 *
 * Extracted from intentEngine.js so domain/genre/feature extractors,
 * CV/carousel disambiguators, requirement extraction, missing-information
 * detection, and complexity classification live in a dedicated module.
 */

import { INTENT_TYPES, COMPLEXITY_LEVELS } from "./schemas.js";

// ——— Helpers ———

export function extractDomain(lower) {
  const patterns = {
    "e-commerce":
      /\b(shop|store|ecommerce|e-commerce|product|retail|selling|buy|cart|checkout)\b/i,
    portfolio: /\b(portfolio|showcase|gallery|personal|CV|resume)\b/i,
    furniture: /chair|furniture|desk|table|sofa/i,
    healthcare:
      /\b(health|medical|patient|doctor|clinic|fitness|wellness|therapy)\b/i,
    education:
      /\b(education|school|university|course|learn|teach|academy|training)\b/i,
    food: /\b(food|restaurant|recipe|cafe|bakery|menu|dining|meal)\b/i,
    technology: /\b(tech|software|ai|ml|data|cloud|api|platform|digital)\b/i,
    finance: /\b(finance|bank|money|invest|loan|crypto|payment|billing)\b/i,
    "real-estate": /\b(real estate|property|house|apartment|rent|mortgage)\b/i,
    saas: /\b(saas|software as a service|subscription|b2b|dashboard|admin)\b/i,
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    if (pattern.test(lower)) return key;
  }
  return null;
}

export function extractGenre(lower) {
  const genres = [
    "platformer",
    "shooter",
    "rpg",
    "puzzle",
    "quiz",
    "word",
    "chess",
    "racing",
    "strategy",
    "simulation",
    "arcade",
    "card",
    "action",
    "adventure",
    "browser",
    "multiplayer",
    "snake",
    "pong",
    "tetris",
    "flappy",
    "clicker",
    "idle",
    "runner",
    "endless",
    "tower defense",
    "wordle",
    "scrabble",
    "memory",
    "maze",
    "survival",
    "horror",
    "fps",
  ];
  for (const g of genres) {
    if (lower.includes(g)) return g;
  }
  return null;
}

export function extractFeature(lower) {
  const features = [
    "authentication",
    "login",
    "search",
    "filter",
    "pagination",
    "upload",
    "export",
    "dashboard",
    "admin panel",
    "payment",
    "chat",
    "notification",
    "profile",
    "settings",
    "analytics",
    "dark mode",
    "theme",
    "modal",
    "form",
    "sidebar",
    "header",
    "footer",
    "toggle",
    "sort",
    "sign up",
    "register",
    "search bar",
  ];
  for (const f of features) {
    if (lower.includes(f)) return f;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Missing information detection
// ---------------------------------------------------------------------------

export const BLOCKING_QUESTIONS = [
  {
    keyword: /\b(source code|codebase|repository)\b/i,
    message:
      "Unclear what file or code to modify when multiple implementations exist",
    blocking: true,
  },
];

export const OPTIONAL_QUESTIONS = [
  {
    keyword: /\b(colou?r|color scheme|theme|palette)\b/i,
    message: "Preferred colour scheme was not specified",
    blocking: false,
  },
  {
    keyword: /\b(font|typography)\b/i,
    message: "Font preference was not specified",
    blocking: false,
  },
  {
    keyword: /\b(logo|brand|identity|name)\b/i,
    message: "Brand identity was not provided",
    blocking: false,
  },
  {
    keyword: /\b(pricing|price)\b/i,
    message: "Pricing information was not provided",
    blocking: false,
  },
  {
    keyword: /\b(hosting|deploy|domain|url)\b/i,
    message: "Hosting/deployment preference was not specified",
    blocking: false,
  },
];

export function detectIsExistingProject(lower, primaryType) {
  if (
    [
      "bug_fix",
      "code_refactor",
      "feature_implementation",
      "simple_edit",
    ].includes(primaryType)
  ) {
    return true;
  }
  const existingProjectSignals =
    /\b(repo|repository|file|files|existing|codebase|src\/|component|function|line|in this project|my app|our app|current code|update|modify|patch|refactor|fix|debug)\b/i;
  return existingProjectSignals.test(lower);
}

export function detectOutputFormat(lower, primaryType) {
  if (
    /\b(html\b|css\b|vanilla|plain html|pure html|html\/css|raw html|html\s*\+\s*css|vanilla js)\b/i.test(
      lower,
    )
  ) {
    return "html";
  }
  // "Design principles", "explain this layout", and similar advisory prompts
  // are design topics, not UI builds. They must not be repaired into a JSX
  // fallback just because the classifier's primary type is design_task.
  const isDesignExplanation =
    /\b(explain|what are|why|principles?|concepts?|tips?|advice|ideas|guide|how to|compare|difference between)\b/i.test(
      lower,
    );
  const isUiBuild =
    /\b(build|create|make|generate|design|redesign|code|develop)\b[\s\S]{0,64}?\b(component|page|screen|app|website|site|ui|interface|layout|wireframe|mockup|dashboard|widget|landing page)\b/i.test(
      lower,
    );
  if (isDesignExplanation && !isUiBuild) return "markdown";
  if (
    ["website_creation", "game_creation", "design_task"].includes(
      primaryType,
    ) ||
    /\b(react|jsx|component|app|dashboard|widget)\b/i.test(lower)
  ) {
    return "jsx";
  }
  if (["content_creation", "code_question", "research"].includes(primaryType)) {
    return "markdown";
  }
  return "text";
}

// ---------------------------------------------------------------------------
// CV / Rewrite vs Web-dev disambiguation
// ---------------------------------------------------------------------------

export function isCVRewriteRequest(lower) {
  const hasCV = /\b(cv|resume|curriculum vitae|biodata)\b/i.test(lower);
  const hasRewriteSignal =
    /\b(less description|less text|shorten|short version|condense|condensed|concise|make.*concise|make.*shorter|rewrite|rephrase|reduce|brief|summarize|summary|bullet|one line)\b/i.test(
      lower,
    ) || /\bgive me less/i.test(lower);
  const hasPastedCVContent =
    lower.includes("created proposals") ||
    lower.includes("developed websites") ||
    (lower.includes("social media") && lower.includes("analytics"));
  // Case 1: explicit CV + rewrite
  if (hasCV && hasRewriteSignal) return true;
  // Case 2: rewrite request with pasted CV-like work history block
  if (hasRewriteSignal && hasPastedCVContent) return true;
  // Case 3: bare "give me less description for this" with any work history
  if (/\bgive me less description\b/i.test(lower)) return true;
  return false;
}

export function getInstructionPart(prompt) {
  // Instruction is typically the first 300 chars before a long pasted block.
  // Detect pasted block start by a newline followed by a long bullet or "Created proposals"
  const lower = prompt.toLowerCase();
  const pastedMarkers = [
    "created proposals",
    "developed websites using",
    "collaborated with the design",
  ];
  let earliest = prompt.length;
  for (const m of pastedMarkers) {
    const idx = lower.indexOf(m);
    if (idx !== -1 && idx < earliest) earliest = idx;
  }
  // Instruction is everything before the pasted block, or first 280 chars if no marker
  if (earliest < prompt.length) return prompt.slice(0, earliest).toLowerCase();
  return prompt.slice(0, 280).toLowerCase();
}

export function hasExplicitWebCreationInInstruction(instructionLower) {
  return /\b(build|make|create|generate|develop|design|launch|ship)\b[\w\s,'"-]{0,48}?\b(website|site|landing page|webpage|web app|web application|homepage|portfolio site)\b|\b(website|site|landing page|portfolio)\b[\w\s,'"-]{0,48}?\b(build|make|create|generate|design|develop)\b/i.test(
    instructionLower,
  );
}

// ---------------------------------------------------------------------------
// Social carousel copy vs UI-carousel disambiguation
// ---------------------------------------------------------------------------
// A "carousel post" / "post for this carousel" / "LinkedIn/Instagram carousel"
// is SOCIAL-MEDIA copy (slide breakdown + caption + hashtags) — NOT a UI
// component to code. The pasted body copy often contains hijack words like
// "research" ("continuous research into workplace behaviour") which must not
// flip the request to research/explanation, and "carousel" must not flip it
// to website/app creation. Only an explicit UI request ("carousel component",
// "carousel UI", "carousel code/slider/website") is a build.
export function isSocialCarouselCopyInstruction(instructionLower) {
  if (!instructionLower) return false;
  // `post` is also the HTTP verb, and the social-instruction test below is
  // case-insensitive, so an API task read as social copy: "Make a POST request
  // to the /api/users endpoint" was classified content_creation 0.9 with domain
  // "social / marketing" — legacy intent `writing`. An HTTP/API context vetoes
  // the social reading outright.
  const isHttpRequestContext =
    /\b(get|post|put|patch|delete|head|options)\s+(request|call|endpoint|route|handler|response)\b|\bhttp\s+(get|post|put|patch|delete)\b|\b(api|endpoint|route|handler|curl|fetch|axios|webhook|rest)\b.{0,40}\b(get|post|put|patch|delete)\b|\b(get|post|put|patch|delete)\b.{0,40}\b(api|endpoint|route|handler|curl|fetch|axios|webhook|rest|request)\b/i.test(
      instructionLower,
    );
  if (isHttpRequestContext) return false;
  const hasSocialInstruction =
    /\b(create|write|draft|compose|make|generate|need|want)\b.{0,60}\b(post|caption|carousel post|linkedin post|instagram post|social post)\b/i.test(
      instructionLower,
    ) ||
    /\bpost\s+for\s+(this|that|my|our|a|the)\s+carousel\b/i.test(
      instructionLower,
    ) ||
    /\bcarousel\s+(post|caption|copy|slides?\b.*caption|caption\b.*slides?)\b/i.test(
      instructionLower,
    ) ||
    (/\bcarousel\b/i.test(instructionLower) &&
      /\b(post|caption|hashtags?|slide\s+\d|slide\s+breakdown)\b/i.test(
        instructionLower,
      ));
  if (!hasSocialInstruction) return false;
  // Explicit UI/code build overrides social-copy: user really wants a component.
  const hasExplicitUICarousel =
    /\bcarousel\b.{0,30}\b(component|widget|\bui\b|ux|slider|code|react|jsx|html|website|web\s?app|landing\s?page)\b/i.test(
      instructionLower,
    ) ||
    /\b(build|code|develop|program)\b.{0,30}\b(carousel|slider)\b.{0,30}\b(component|widget|\bui\b|code|website|app)\b/i.test(
      instructionLower,
    );
  return !hasExplicitUICarousel;
}

/**
 * Separates explicit vs inferred requirements from a raw prompt.
 */
export function extractRequirements(prompt, intent) {
  if (!prompt || typeof prompt !== "string") {
    return { explicit: [], inferred: [], forbidden: [] };
  }

  const lower = prompt.toLowerCase().trim();

  const explicit = [];
  const inferred = [];
  const forbidden = [];

  // Detect explicit keywords
  if (/\b(responsive|mobile|desktop)\b/i.test(prompt)) {
    explicit.push("responsive layout");
  }
  if (/\b(accessible|accessibility|a11y|WCAG)\b/i.test(prompt)) {
    explicit.push("accessibility compliance");
  }
  if (/\b(seo|search engine)\b/i.test(prompt)) {
    explicit.push("SEO optimization");
  }
  if (/\b(fast|performance|speed|optimize)\b/i.test(prompt)) {
    explicit.push("performance optimization");
  }
  if (/\b(auth|login|logout|sign up|register|authentication)\b/i.test(prompt)) {
    explicit.push("authentication");
  }
  if (/\b(payment|checkout|stripe|billing|subscription)\b/i.test(prompt)) {
    explicit.push("payment integration");
  }
  if (/\b(dark mode|dark theme|light mode)\b/i.test(prompt)) {
    explicit.push("dark/light mode toggle");
  }
  if (/\b(animation|animated|micro-interaction)\b/i.test(prompt)) {
    explicit.push("animations");
  }
  if (/\b(multiplayer|online|real-time|websocket)\b/i.test(prompt)) {
    explicit.push("multiplayer/real-time");
  }
  if (
    /\b(i18n|internationalization|multi-language|translation)\b/i.test(prompt)
  ) {
    explicit.push("internationalization");
  }

  // The core action + subject are always explicit
  const actionMatch = prompt.match(
    /\b(build|make|create|generate|design|code|fix|add|implement|change|update)\b/i,
  );
  if (actionMatch) {
    const subjectStart = prompt.indexOf(actionMatch[0]) + actionMatch[0].length;
    // Bound the captured subject. Unbounded, this took the entire remainder of
    // the prompt: on a ~4.8 KB paste it produced a single 4,817-character
    // "requirement", which is copied verbatim into `contract.mustAchieve` and
    // injected into the execution prompt. A requirement is a short clause, and
    // a subject shorter than a word is not one.
    const subjectChunk = prompt.slice(subjectStart).trim().slice(0, 160);
    if (subjectChunk.length >= 3)
      explicit.push(`${actionMatch[0].toLowerCase()} ${subjectChunk}`);
  }

  // Inferred requirements (always reasonable, always support user goal)
  if (
    !lower.includes("accessible") &&
    !lower.includes("a11y") &&
    !lower.includes("wcag")
  ) {
    inferred.push("basic accessibility");
  }

  if (
    !/\b(responsive|mobile|desktop)\b/i.test(prompt) &&
    intent.type !== INTENT_TYPES.SIMPLE_EDIT &&
    intent.type !== INTENT_TYPES.CODE_QUESTION
  ) {
    inferred.push("responsive layout");
  }

  if (
    (intent.type === INTENT_TYPES.WEBSITE_CREATION ||
      intent.type === INTENT_TYPES.GAME_CREATION) &&
    !lower.includes("navigation") &&
    !lower.includes("nav")
  ) {
    inferred.push("working navigation");
  }

  // Forbidden — things we must never invent
  forbidden.push(
    "inventing real testimonials or reviews",
    "inventing factual claims about real companies",
    "inventing pricing for real products",
  );

  // If no explicit brand info, add that
  if (!/\b(brand|company name|logo|identity)\b/i.test(prompt)) {
    inferred.push("sensible visual hierarchy and spacing");
  }

  return { explicit, inferred, forbidden };
}

/**
 * Detects which information is missing — classified as blocking or optional.
 */
export function detectMissingInformation(prompt, intent) {
  const lower = prompt.toLowerCase();
  const missing = [];

  // Blocking: user mentions code but gives no file-level target to work on
  for (const q of BLOCKING_QUESTIONS) {
    if (
      q.keyword.test(lower) &&
      !/\.[a-z0-9]{1,8}\b|\/[a-z0-9_.-]+/i.test(lower)
    ) {
      missing.push({ ...q });
    }
  }

  // Optional: report only when the topic is NOT mentioned (absence detection),
  // so "dark theme landing page" never triggers "colour scheme not specified".
  for (const q of OPTIONAL_QUESTIONS) {
    if (!q.keyword.test(lower)) {
      missing.push({ ...q, blocking: false });
    }
  }

  // Intent-specific checks
  if (
    intent.type === INTENT_TYPES.WEBSITE_CREATION ||
    intent.type === INTENT_TYPES.GAME_CREATION
  ) {
    if (
      !/\b(page|section|component|hero|footer|navbar|specific)\b/i.test(lower)
    ) {
      missing.push({
        message: "Specific pages or sections were not listed",
        blocking: false,
      });
    }
  }

  return missing;
}

/**
 * Determines complexity from intent + prompt.
 */
export function classifyComplexity(prompt, intent) {
  const lower = prompt.toLowerCase();
  const type = intent?.type;

  if (
    type === INTENT_TYPES.SIMPLE_EDIT ||
    type === INTENT_TYPES.CODE_QUESTION ||
    type === INTENT_TYPES.GENERAL_QUESTION
  ) {
    return COMPLEXITY_LEVELS.TRIVIAL;
  }

  if (
    type === INTENT_TYPES.IMAGE_GENERATION ||
    type === INTENT_TYPES.CONTENT_CREATION ||
    type === INTENT_TYPES.RESEARCH
  ) {
    return COMPLEXITY_LEVELS.LOW;
  }

  if (
    type === INTENT_TYPES.BUG_FIX ||
    type === INTENT_TYPES.CODE_REFACTOR ||
    type === INTENT_TYPES.DESIGN_TASK
  ) {
    return /\b(complex|architecture|major|overhaul)\b/i.test(lower)
      ? COMPLEXITY_LEVELS.MEDIUM
      : COMPLEXITY_LEVELS.LOW;
  }

  if (type === INTENT_TYPES.FEATURE_IMPLEMENTATION) {
    if (
      /\b(auth|authentication|payment|subscription|real-time|websocket|database|migration)\b/i.test(
        lower,
      )
    )
      return COMPLEXITY_LEVELS.MEDIUM;
    return COMPLEXITY_LEVELS.LOW;
  }

  if (type === INTENT_TYPES.WEBSITE_CREATION) {
    if (
      /\b(epic|enterprise-scale|massive|large-scale|full platform|complete platform|AAA|metaverse)\b/i.test(
        lower,
      )
    )
      return COMPLEXITY_LEVELS.EPIC;
    if (
      /\b(SaaS|enterprise|production|full-stack|complex|complete|full)\b/i.test(
        lower,
      )
    )
      return COMPLEXITY_LEVELS.HIGH;
    if (/\b(landing|simple|single page|portfolio)\b/i.test(lower))
      return COMPLEXITY_LEVELS.LOW;
    return COMPLEXITY_LEVELS.MEDIUM;
  }

  if (type === INTENT_TYPES.GAME_CREATION) {
    if (
      /\b(epic|massive|large-scale|full platform|AAA|metaverse|persistent world|open world)\b/i.test(
        lower,
      )
    )
      return COMPLEXITY_LEVELS.EPIC;
    if (
      /\b(multiplayer|mmo|rpg|role playing|complex|large|production)\b/i.test(
        lower,
      )
    )
      return COMPLEXITY_LEVELS.HIGH;
    if (/\b(snake|pong|tictactoe|quiz|memory|simple|basic)\b/i.test(lower))
      return COMPLEXITY_LEVELS.LOW;
    return COMPLEXITY_LEVELS.MEDIUM;
  }

  return COMPLEXITY_LEVELS.LOW;
}
