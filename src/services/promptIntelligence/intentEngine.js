/**
 * CoreZ Intent Engine
 *
 * Understands user intent from raw prompts.  Attempts local pattern
 * classification first; may delegate to AI models when configured.
 *
 * Returns structured intent data — it NEVER executes the task.
 */

import { INTENT_TYPES, COMPLEXITY_LEVELS, createIntentResult } from './schemas.js';

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
    type: INTENT_TYPES.MARKET,
    pattern: /\b(price|prices|stock|stocks|ticker|quote|how much is|convert|to usd|to eur|to php|exchange rate|bitcoin|ethereum|crypto)\b/i,
    signals: ['price', 'stock', 'quote', 'convert', 'ticker', 'crypto', 'bitcoin', 'ethereum', 'usd', 'eur', 'php', 'how much'],
    extract(_prompt, _lower) {
      return {
        goal: `check the current market price`,
        deliverable: 'live market data',
      };
    },
  },
  {
    type: INTENT_TYPES.WEBSITE_CREATION,
    pattern: /\b(build|make|create|generate|design|code|develop)\b.*\b(website|site|landing page|webpage|web app|web application|homepage|portfolio site)\b|\b(website|site|landing page|portfolio)\b.*\b(build|make|create|generate|design|code|develop)\b/i,
    signals: ['website', 'landing page', 'homepage', 'web app', 'web application', 'site', 'portfolio site'],
    extract(prompt, lower) {
      const domain = extractDomain(lower) || 'general';
      return {
        goal: `create a website for ${domain}`,
        domain,
        deliverable: 'responsive website',
      };
    },
  },
  {
    type: INTENT_TYPES.GAME_CREATION,
    pattern: /\b(build|make|create|generate|design|code|develop|program)\b.*\b(game|simulator|simulation|sandbox|multiplayer|rpg|platformer|shooter|chess|pong|snake|quiz|wordle|scrabble|puzzle|arcade|canvas game|2d game|3d game|physics sandbox|tetris|flappy|clicker|idle game)\b|\b(game|simulator|chess|pong|snake|platformer|shooter|tetris|flappy)\b.*\b(build|make|create|generate|design|code|develop)\b/i,
    signals: ['game', 'play', 'simulator', 'simulation', 'sandbox', 'multiplayer', 'platformer', 'shooter', 'chess', 'pong', 'snake', 'quiz', 'wordle', 'scrabble', 'puzzle', 'arcade', 'tetris', 'flappy', 'clicker'],
    extract(prompt, lower) {
      const genre = extractGenre(lower) || 'general';
      return {
        goal: `create a ${genre} browser game`,
        domain: 'browser gaming',
        deliverable: 'browser game',
      };
    },
  },
  {
    type: INTENT_TYPES.FEATURE_IMPLEMENTATION,
    pattern: /\b(add|implement|build|integrate|create)\b.*\b(feature|module|component|page|api|endpoint|route|service|handler|auth|login|authentication|search|search bar|filter|pagination|upload|export|toggle|dark mode|light mode|theme|settings|sort|modal|form|button|sidebar|header|footer|dashboard|analytics)\b/i,
    signals: ['add', 'implement', 'integrate', 'feature', 'module', 'component', 'endpoint', 'toggle', 'dark mode', 'theme', 'settings', 'modal', 'search bar'],
    extract(_prompt, _lower) {
      return {
        type: INTENT_TYPES.FEATURE_IMPLEMENTATION,
        goal: `implement ${extractFeature(_lower) || 'feature'}`,
        deliverable: `${extractFeature(_lower) || 'feature'} implementation`,
      };
    },
  },
  {
    type: INTENT_TYPES.BUG_FIX,
    pattern: /\b(fix|debug|repair|resolve|patch|bug|error|exception|crash|broken|not working|failing|issue)\b/i,
    signals: ['fix', 'debug', 'repair', 'bug', 'error', 'exception', 'crash', 'broken', 'not working'],
    extract(_prompt, _lower) {
      return {
        goal: `fix the reported bug or error`,
        deliverable: 'bug fix',
      };
    },
  },
  {
    type: INTENT_TYPES.CODE_REFACTOR,
    pattern: /\b(refactor|rewrite|restructure|reorganise|reorganize|clean up|improve|optimise|optimize)\b.*\b(code|function|module|class|component|architecture|service|api|file|dir)\b|\b(refactoring)\b/i,
    signals: ['refactor', 'rewrite', 'restructure', 'reorganise', 'optimise', 'optimize', 'clean up'],
    extract(_prompt, _lower) {
      return {
        goal: `refactor the existing code`,
        deliverable: 'refactored code',
      };
    },
  },
  {
    type: INTENT_TYPES.CODE_QUESTION,
    pattern: /\b(how|what|why|explain|tell me|show me|help)\b.*\b(code|js|javascript|react|python|css|html|function|component|api|library|framework|syntax|pattern)\b|\b(explain|understand|learn)\b.*\b(code|programming)\b/i,
    signals: ['how', 'what', 'why', 'explain', 'tell me', 'help', 'code', 'syntax'],
    extract(_prompt, _lower) {
      return {
        goal: `answer a code-related question`,
        deliverable: 'explanation',
      };
    },
  },
  {
    type: INTENT_TYPES.RESEARCH,
    pattern: /\b(research|search for|search the web|look up|investigate|analyse|analyze|compare|definition of|what is|what are|how does|how do|tell me about|difference between|find out)\b/i,
    signals: ['research', 'search for', 'look up', 'investigate', 'analyse', 'analyze', 'compare', 'definition', 'what is', 'tell me about', 'difference between'],
    extract(_prompt, _lower) {
      return {
        goal: `research the requested topic`,
        deliverable: 'research findings',
      };
    },
  },
  {
    type: INTENT_TYPES.DESIGN_TASK,
    pattern: /\b(design|redesign|layout|wireframe|mockup|ux|ui|style|theme|color scheme|typography)\b.*\b(for|of|page|app)\b|\b(design|redesign)\b.*\b(component|page|screen)\b/i,
    signals: ['design', 'redesign', 'layout', 'wireframe', 'mockup', 'ux', 'ui', 'style', 'theme'],
    extract(_prompt, _lower) {
      return {
        goal: `complete a design task`,
        deliverable: 'design',
      };
    },
  },
  {
    type: INTENT_TYPES.IMAGE_GENERATION,
    pattern: /\b(generate|create|make|draw|render|produce)\b.*\b(image|picture|photo|artwork|illustration|graphic|icon|sprite|logo|banner|poster)\b|\b(image generation)\b/i,
    signals: ['image', 'picture', 'photo', 'artwork', 'illustration', 'graphic', 'icon', 'sprite'],
    extract(_prompt, _lower) {
      return {
        goal: `generate an image`,
        deliverable: 'image',
      };
    },
  },
  {
    type: INTENT_TYPES.CONTENT_CREATION,
    pattern: /\b(write|create|compose|draft|generate)\b.*\b(article|blog|post|email|newsletter|copy|content|text|document|report|proposal|summary|description)\b/i,
    signals: ['write', 'create', 'compose', 'article', 'blog', 'email', 'newsletter', 'copy', 'content'],
    extract(_prompt, _lower) {
      return {
        goal: `create written content`,
        deliverable: 'content',
      };
    },
  },
  {
    type: INTENT_TYPES.SIMPLE_EDIT,
    pattern: /\b(change|update|rename|move|delete|remove|set|color|colour|font|size|width|height|margin|padding)\b.*\b(to|the|this|file|component)\b|\b(tweak|adjust|switch|swap)\b/i,
    signals: ['change', 'update', 'rename', 'delete', 'remove', 'color', 'colour', 'font', 'adjust', 'tweak'],
    extract(_prompt, _lower) {
      return {
        goal: `make a simple edit`,
        deliverable: 'code edit',
      };
    },
  },
  {
    type: INTENT_TYPES.SWARM,
    pattern: /\b(swarm|multi-agent|agents|orchestrate|orchestration|complex|architect|plan|system design|full stack|complete.*app|production.*app|SaaS|enterprise)\b/i,
    signals: ['swarm', 'multi-agent', 'orchestrate', 'system design', 'full stack', 'saas', 'enterprise'],
    extract(_prompt, _lower) {
      return {
        goal: `coordinate a complex multi-agent task`,
        deliverable: 'orchestrated solution',
      };
    },
  },
];

// ——— Helpers ———

function extractDomain(lower) {
  const patterns = {
    'e-commerce': /\b(shop|store|ecommerce|e-commerce|product|retail|selling|buy|cart|checkout)\b/i,
    'portfolio': /\b(portfolio|showcase|gallery|personal|CV|resume)\b/i,
    'furniture': /chair|furniture|desk|table|sofa/i,
    'healthcare': /\b(health|medical|patient|doctor|clinic|fitness|wellness|therapy)\b/i,
    'education': /\b(education|school|university|course|learn|teach|academy|training)\b/i,
    'food': /\b(food|restaurant|recipe|cafe|bakery|menu|dining|meal)\b/i,
    'technology': /\b(tech|software|ai|ml|data|cloud|api|platform|digital)\b/i,
    'finance': /\b(finance|bank|money|invest|loan|crypto|payment|billing)\b/i,
    'real-estate': /\b(real estate|property|house|apartment|rent|mortgage)\b/i,
    'saas': /\b(saas|software as a service|subscription|b2b|dashboard|admin)\b/i,
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    if (pattern.test(lower)) return key;
  }
  return null;
}

function extractGenre(lower) {
  const genres = [
    'platformer', 'shooter', 'rpg', 'puzzle', 'quiz', 'word', 'chess',
    'racing', 'strategy', 'simulation', 'arcade', 'card', 'action',
    'adventure', 'browser', 'multiplayer', 'snake', 'pong', 'tetris',
    'flappy', 'clicker', 'idle', 'runner', 'endless', 'tower defense',
    'wordle', 'scrabble', 'memory', 'maze', 'survival', 'horror', 'fps',
  ];
  for (const g of genres) {
    if (lower.includes(g)) return g;
  }
  return null;
}

function extractFeature(lower) {
  const features = [
    'authentication', 'login', 'search', 'filter', 'pagination',
    'upload', 'export', 'dashboard', 'admin panel', 'payment',
    'chat', 'notification', 'profile', 'settings', 'analytics',
    'dark mode', 'theme', 'modal', 'form', 'sidebar', 'header', 'footer',
    'toggle', 'sort', 'sign up', 'register', 'search bar',
  ];
  for (const f of features) {
    if (lower.includes(f)) return f;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Missing information detection
// ---------------------------------------------------------------------------

const BLOCKING_QUESTIONS = [
  {
    keyword: /\b(source code|codebase|repository)\b/i,
    message: 'Unclear what file or code to modify when multiple implementations exist',
    blocking: true,
  },
];

const OPTIONAL_QUESTIONS = [
  { keyword: /\b(colou?r|color scheme|theme|palette)\b/i, message: 'Preferred colour scheme was not specified', blocking: false },
  { keyword: /\b(font|typography)\b/i, message: 'Font preference was not specified', blocking: false },
  { keyword: /\b(logo|brand|identity|name)\b/i, message: 'Brand identity was not provided', blocking: false },
  { keyword: /\b(pricing|price)\b/i, message: 'Pricing information was not provided', blocking: false },
  { keyword: /\b(hosting|deploy|domain|url)\b/i, message: 'Hosting/deployment preference was not specified', blocking: false },
];

// ---------------------------------------------------------------------------
// Main classifier
// ---------------------------------------------------------------------------

function computeConfidence(handler, lower) {
  const maxSignals = Math.min(handler.signals.length || 1, 8);
  let matchedSignals = 0;
  for (const s of handler.signals) {
    if (lower.includes(s)) matchedSignals += 1;
  }
  let score = Math.min(1, matchedSignals / Math.max(1, maxSignals * 0.4));
  if (handler.pattern.test(lower)) score = Math.min(1, score + 0.25);
  return Math.round(score * 100) / 100;
}

function detectIsExistingProject(lower, primaryType) {
  if (['bug_fix', 'code_refactor', 'feature_implementation', 'simple_edit'].includes(primaryType)) {
    return true;
  }
  const existingProjectSignals = /\b(repo|repository|file|files|existing|codebase|src\/|component|function|line|in this project|my app|our app|current code|update|modify|patch|refactor|fix|debug)\b/i;
  return existingProjectSignals.test(lower);
}

function detectOutputFormat(lower, primaryType) {
  if (/\b(html\b|css\b|vanilla|plain html|pure html|html\/css|raw html|html\s*\+\s*css|vanilla js)\b/i.test(lower)) {
    return 'html';
  }
  if (['website_creation', 'game_creation', 'design_task'].includes(primaryType) || /\b(react|jsx|component|app|dashboard|widget)\b/i.test(lower)) {
    return 'jsx';
  }
  if (['content_creation', 'code_question', 'research'].includes(primaryType)) {
    return 'markdown';
  }
  return 'text';
}

/**
 * @param {string} prompt — raw user prompt
 * @returns {object} structured intent result
 */
export function classifyIntent(prompt) {
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return createIntentResult({ confidence: 0, type: INTENT_TYPES.GENERAL_QUESTION });
  }

  const lower = prompt.toLowerCase().trim();
  const candidateMatches = [];

  for (const handler of INTENT_HANDLERS) {
    const matched = handler.pattern.test(prompt) || handler.signals.some((s) => lower.includes(s));
    if (matched) {
      const confidence = computeConfidence(handler, lower);
      candidateMatches.push({ handler, confidence });
    }
  }

  candidateMatches.sort((a, b) => b.confidence - a.confidence);

  if (candidateMatches.length === 0 || candidateMatches[0].confidence < 0.15) {
    const isExisting = detectIsExistingProject(lower, INTENT_TYPES.GENERAL_QUESTION);
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
  if (secondMatch && (topMatch.confidence - secondMatch.confidence) <= 0.15) {
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
    domain: extracted.domain || '',
    deliverable: extracted.deliverable || '',
    isExistingProject: isExisting,
    outputFormat: format,
  });
}

/**
 * Separates explicit vs inferred requirements from a raw prompt.
 */
export function extractRequirements(prompt, intent) {
  if (!prompt || typeof prompt !== 'string') {
    return { explicit: [], inferred: [], forbidden: [] };
  }

  const lower = prompt.toLowerCase().trim();

  const explicit = [];
  const inferred = [];
  const forbidden = [];

  // Detect explicit keywords
  if (/\b(responsive|mobile|desktop)\b/i.test(prompt)) {
    explicit.push('responsive layout');
  }
  if (/\b(accessible|accessibility|a11y|WCAG)\b/i.test(prompt)) {
    explicit.push('accessibility compliance');
  }
  if (/\b(seo|search engine)\b/i.test(prompt)) {
    explicit.push('SEO optimization');
  }
  if (/\b(fast|performance|speed|optimize)\b/i.test(prompt)) {
    explicit.push('performance optimization');
  }
  if (/\b(auth|login|logout|sign up|register|authentication)\b/i.test(prompt)) {
    explicit.push('authentication');
  }
  if (/\b(payment|checkout|stripe|billing|subscription)\b/i.test(prompt)) {
    explicit.push('payment integration');
  }
  if (/\b(dark mode|dark theme|light mode)\b/i.test(prompt)) {
    explicit.push('dark/light mode toggle');
  }
  if (/\b(animation|animated|micro-interaction)\b/i.test(prompt)) {
    explicit.push('animations');
  }
  if (/\b(multiplayer|online|real-time|websocket)\b/i.test(prompt)) {
    explicit.push('multiplayer/real-time');
  }
  if (/\b(i18n|internationalization|multi-language|translation)\b/i.test(prompt)) {
    explicit.push('internationalization');
  }

  // The core action + subject are always explicit
  const actionMatch = prompt.match(/\b(build|make|create|generate|design|code|fix|add|implement|change|update)\b/i);
  if (actionMatch) {
    const subjectStart = prompt.indexOf(actionMatch[0]) + actionMatch[0].length;
    const subjectChunk = prompt.slice(subjectStart).trim();
    if (subjectChunk) explicit.push(`${actionMatch[0].toLowerCase()} ${subjectChunk}`);
  }

  // Inferred requirements (always reasonable, always support user goal)
  if (!lower.includes('accessible') && !lower.includes('a11y') && !lower.includes('wcag')) {
    inferred.push('basic accessibility');
  }

  if (!/\b(responsive|mobile|desktop)\b/i.test(prompt) && intent.type !== INTENT_TYPES.SIMPLE_EDIT && intent.type !== INTENT_TYPES.CODE_QUESTION) {
    inferred.push('responsive layout');
  }

  if (
    (intent.type === INTENT_TYPES.WEBSITE_CREATION || intent.type === INTENT_TYPES.GAME_CREATION) &&
    !lower.includes('navigation') && !lower.includes('nav')
  ) {
    inferred.push('working navigation');
  }

  // Forbidden — things we must never invent
  forbidden.push('inventing real testimonials or reviews', 'inventing factual claims about real companies', 'inventing pricing for real products');

  // If no explicit brand info, add that
  if (!/\b(brand|company name|logo|identity)\b/i.test(prompt)) {
    inferred.push('sensible visual hierarchy and spacing');
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
    if (q.keyword.test(lower) && !/\.[a-z0-9]{1,8}\b|\/[a-z0-9_.-]+/i.test(lower)) {
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
  if (intent.type === INTENT_TYPES.WEBSITE_CREATION || intent.type === INTENT_TYPES.GAME_CREATION) {
    if (!/\b(page|section|component|hero|footer|navbar|specific)\b/i.test(lower)) {
      missing.push({ message: 'Specific pages or sections were not listed', blocking: false });
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

  if (type === INTENT_TYPES.SIMPLE_EDIT || type === INTENT_TYPES.CODE_QUESTION || type === INTENT_TYPES.GENERAL_QUESTION) {
    return COMPLEXITY_LEVELS.TRIVIAL;
  }

  if (type === INTENT_TYPES.IMAGE_GENERATION || type === INTENT_TYPES.CONTENT_CREATION || type === INTENT_TYPES.RESEARCH) {
    return COMPLEXITY_LEVELS.LOW;
  }

  if (type === INTENT_TYPES.BUG_FIX || type === INTENT_TYPES.CODE_REFACTOR || type === INTENT_TYPES.DESIGN_TASK) {
    return /\b(complex|architecture|major|overhaul)\b/i.test(lower) ? COMPLEXITY_LEVELS.MEDIUM : COMPLEXITY_LEVELS.LOW;
  }

  if (type === INTENT_TYPES.FEATURE_IMPLEMENTATION) {
    if (/\b(auth|authentication|payment|subscription|real-time|websocket|database|migration)\b/i.test(lower)) return COMPLEXITY_LEVELS.MEDIUM;
    return COMPLEXITY_LEVELS.LOW;
  }

  if (type === INTENT_TYPES.WEBSITE_CREATION) {
    if (/\b(SaaS|enterprise|production|full-stack|complex|complete|full)\b/i.test(lower)) return COMPLEXITY_LEVELS.HIGH;
    if (/\b(landing|simple|single page|portfolio)\b/i.test(lower)) return COMPLEXITY_LEVELS.LOW;
    return COMPLEXITY_LEVELS.MEDIUM;
  }

  if (type === INTENT_TYPES.GAME_CREATION) {
    if (/\b(multiplayer|mmo|rpg|role playing|complex|large|production)\b/i.test(lower)) return COMPLEXITY_LEVELS.HIGH;
    if (/\b(snake|pong|tictactoe|quiz|memory|simple|basic)\b/i.test(lower)) return COMPLEXITY_LEVELS.LOW;
    return COMPLEXITY_LEVELS.MEDIUM;
  }

  if (type === INTENT_TYPES.SWARM) {
    return COMPLEXITY_LEVELS.HIGH;
  }

  return COMPLEXITY_LEVELS.LOW;
}
