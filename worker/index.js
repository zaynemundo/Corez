import { handleSearch } from './search.js';
import { handleRerank, handleEmbed } from './aiModels.js';
import { fetchAwwwardsInspiration, handleInspiration } from './inspiration.js';
import { safeErrorDetail, readBoundedJson, jsonResponse, createTaskStateStore, createRateLimiter, estimateCostUsd } from './utils.js';
import { runProviderChain, runStreamingChain, callOpenRouterImage } from './providerChain.js';
import { runCreationHarness } from './harness.js';
import { processResponse, detectTruncation, stitchContinuationChunk, CONTINUATION_INSTRUCTION, ANTI_REPEAT_CONTINUATION_INSTRUCTION } from './responseProcessor.js';
import {
  parseProjectState,
  deriveProjectState,
  isFollowUpRequest,
  buildProjectContextSection,
  serializeProjectState
} from './projectState.js';
import {
  detectLiveDataNeed,
  buildRuntimeContext,
  buildRuntimeContextBlock,
  runVerificationWithRepair,
  extractDataSeriesNumbers,
  calcStats,
  calcLinearTrend,
  round2
} from './skillVerification.js';

// Storage key segments are validated identically on every R2-backed endpoint:
// no slashes, no leading dots (blocks ../ traversal), bounded length.
const SAFE_STORAGE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;

// Published creations get a short, human-shareable slug or custom slug (e.g. "asyag23-123" or "my-portfolio")
// served at the bare root path corez.pro/<slug>. Multi-page creations are
// served with the home page at corez.pro/<slug>/ and each page at
// corez.pro/<slug>/<page>.html so relative links always resolve inside the
// slug directory; the bare /<slug> path redirects there.
const PUBLISH_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;
const GENERATED_SLUG_PATTERN = /^[a-z0-9]{4,8}-[0-9]{1,6}$/;

// Sub-page paths inside a published multi-page creation: /<slug>/<page>.html
// where <page> is a validated file name (no slashes, no ".." traversal).
const PUBLISH_PAGE_PATTERN = /^([a-z0-9][a-z0-9-]{1,48}[a-z0-9])\/([a-z0-9][a-z0-9_-]{0,63}\.html)$/;
const PUBLISH_PAGE_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}\.html$/i;
const MAX_PUBLISH_PAGES = 12;

// Trailing-slash root of a published creation: /<slug>/ serves the home page
// so every RELATIVE sub-page link (<a href="about.html">) resolves inside the
// slug directory (corez.pro/<slug>/about.html) instead of the site root
// (corez.pro/about.html). Multi-page creations redirect the bare /<slug>
// path here for the same reason.
const PUBLISH_SLUG_ROOT_PATTERN = /^\/([a-z0-9][a-z0-9-]{1,48}[a-z0-9])\/$/;

const RESERVED_SLUGS = Object.freeze(new Set([
  'api', 'app', 'apps', 'auth', 'admin', 'assets', 'static', 'dist',
  'favicon', 'robots', 'sitemap', 'health', 'metrics', 'login',
  'register', 'dashboard', 'settings', 'publish', 'preview', 'search',
  'ws', 'worker', 'null', 'undefined', 'index', 'home'
]));

// Online multiplayer rooms: short lowercase ids used in the WebSocket URL.
const SAFE_ROOM_ID = /^[a-z0-9][a-z0-9-]{2,31}$/;

// Largest single decoded asset accepted by /api/assets/upload (10 MB decoded
// ≈ 13.4 MB base64, well under the 24 MB JSON body bound).
const MAX_ASSET_DECODED_BYTES = 10 * 1024 * 1024;

function buildLiveDataDiagnostics(liveDataEvidence, liveDataNeed, verification) {
  if (!liveDataEvidence) {
    return liveDataNeed.required
      ? { liveDataRequired: true, searchFetched: false, liveDataUsed: false, answerGrounded: false, liveDataNeed: liveDataNeed.kind }
      : null;
  }

  const results = Array.isArray(verification?.results) ? verification.results : [];
  const liveResult = results.find((result) => result.skillId === 'live-data-utilities');
  const researchResult = results.find((result) => result.skillId === 'research-report');
  const honestRefusal = Boolean(liveResult?.evidence?.honestRefusal);
  const answerGrounded = liveResult
    ? Boolean(liveResult.evidence?.liveDataUsed && liveResult.failures?.length === 0)
    : researchResult
      ? Boolean(researchResult.evidence?.groundingValid && researchResult.failures?.length === 0)
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
    freshnessMs: Math.max(0, Date.now() - new Date(liveDataEvidence.servedAt).getTime()),
    resultsCount: liveDataEvidence.results.length
  };
}

function buildDataAnalysisContext(prompt) {
  const numbers = extractDataSeriesNumbers(prompt);
  if (numbers.length < 2) return null;
  const stats = calcStats(numbers);
  const trend = calcLinearTrend(numbers);
  const direction = numbers[numbers.length - 1] > numbers[0]
    ? 'upward'
    : numbers[numbers.length - 1] < numbers[0] ? 'downward' : 'flat';
  return `Deterministic data-analysis results (authoritative; source order preserved):
- Values: ${numbers.join(', ')}
- Total: ${round2(stats.sum)}
- Mean: ${round2(stats.mean)}
- Median: ${round2(stats.median)}
- First-to-last direction: ${direction}
${trend ? `- Least-squares trend: y = ${round2(trend.intercept)} + ${round2(trend.slope)} * period
- Next-period forecast: ${round2(trend.intercept + trend.slope * (numbers.length + 1))}` : ''}
Use these checked values exactly. Do not recompute them from memory.`;
}

// Server-side fetch guard: provider-returned image URLs may only point at
// public internet hosts. Loopback, link-local, private, CGNAT, and cloud
// metadata ranges are rejected so a malformed or injected provider reply can
// never be used to probe internal services from the Worker.
const PRIVATE_IPV4_PATTERNS = [
  /^10\./,                                  // RFC 1918 class A
  /^127\./,                                 // loopback
  /^169\.254\./,                            // link-local + cloud metadata
  /^172\.(1[6-9]|2[0-9]|3[01])\./,          // RFC 1918 class B
  /^192\.168\./,                            // RFC 1918 class C
  /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./, // CGNAT
  /^0\./,
  /^198\.18\./,                             // benchmarking
  /^192\.0\.0\./,
  /^224\./,                                 // multicast
  /^240\./                                  // reserved
];
const PRIVATE_IPV6_PATTERNS = [
  /^::$/,
  /^::1$/,                                  // loopback
  /^fc/i, /^fd/i,                           // ULA
  /^fe80:/i,                                // link-local
  /^fe[89ab]f:/i,                           // IPv4-compatible
  /^ff:/i,                                  // multicast
  /^::ffff:/
];

function isBlockedInternalHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host) return true;
  if (host === 'localhost') return true;
  if (PRIVATE_IPV4_PATTERNS.some((pattern) => pattern.test(host))) return true;
  if (PRIVATE_IPV6_PATTERNS.some((pattern) => pattern.test(host))) return true;
  // Non-numeric hostnames (e.g. intranet hostnames) are allowed: the worker
  // only fetches https URLs, and DNS rebinding is not feasible against a
  // hostname that resolves publicly. Numeric IPv4/IPv6 literals are covered
  // by the patterns above.
  return false;
}

// Reference images sent to the image model. The client ships small base64
// data: payloads (thumbnails capped at 1.5 MB client-side); https URLs are
// also accepted but must point at public hosts — the same SSRF guard used
// for provider-returned image URLs. The worker itself never fetches the
// reference; it is forwarded to the provider only.
const REFERENCE_IMAGE_MAX_DECODED_BYTES = 8 * 1024 * 1024;
const REFERENCE_DATA_URL_PATTERN = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/i;

function validateReferenceImage(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const candidate = value.trim();

  if (candidate.startsWith('data:')) {
    const match = candidate.match(REFERENCE_DATA_URL_PATTERN);
    if (!match) return null;
    // Decoded base64 size: 3 bytes per 4 base64 chars (padding excluded).
    const base64Body = match[2];
    const decodedBytes = Math.floor((base64Body.length * 3) / 4);
    if (decodedBytes > REFERENCE_IMAGE_MAX_DECODED_BYTES) return null;
    return candidate;
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (isBlockedInternalHost(parsed.hostname)) return null;
  return candidate;
}

async function handleGameSocket(request, env) {
  const pathname = new URL(request.url).pathname;
  const roomId = decodePathSegment(pathname.replace('/api/game/ws/', ''));
  if (!roomId || !SAFE_ROOM_ID.test(roomId)) {
    return jsonResponse(400, { error: 'Invalid room id: use lowercase letters, digits and dashes.' });
  }
  if (!env?.GAME_ROOMS || typeof env.GAME_ROOMS.get !== 'function') {
    return jsonResponse(503, { error: 'Multiplayer is not configured.' });
  }
  if (!/websocket/i.test(request.headers.get('Upgrade') || '')) {
    return jsonResponse(400, { error: 'WebSocket upgrade required.' });
  }
  // Cross-site WebSocket hijacking guard: browsers always send an Origin
  // header, so a third-party page cannot open sockets into our rooms. The
  // room must originate from this host (or a localhost dev host); CLI
  // tooling without an Origin header remains allowed.
  const origin = request.headers.get('Origin');
  if (origin) {
    let originHost;
    try {
      originHost = new URL(origin).hostname;
    } catch {
      return jsonResponse(403, { error: 'Invalid Origin header.' });
    }
    const requestHost = new URL(request.url).hostname;
    const isLocalhost = (host) => host === 'localhost' || host === '127.0.0.1' || host === '::1';
    if (originHost !== requestHost && !(isLocalhost(originHost) && isLocalhost(requestHost))) {
      return jsonResponse(403, { error: 'Cross-site WebSocket connections are not allowed.' });
    }
  }
  const stub = env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(roomId));
  return stub.fetch(request);
}

function generatePublishSlug() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let word = '';
  const len = 5 + Math.floor(Math.random() * 3);
  for (let i = 0; i < len; i++) {
    word += chars[Math.floor(Math.random() * chars.length)];
  }
  const num = 100 + Math.floor(Math.random() * 900);
  return `${word}-${num}`;
}

const CANONICAL_INTENT_TYPES = new Set([
  'app',
  'code-help',
  'writing',
  'explanation',
  'general'
]);

function normalizeIntentType(intentType) {
  return CANONICAL_INTENT_TYPES.has(intentType) ? intentType : 'general';
}

function isGameCreationRequest(prompt, intent, fineIntent) {
  return intent?.primaryIntent === 'game_creation'
    || fineIntent?.primaryIntent === 'game_creation'
    || fineIntent?.type === 'game_creation'
    || /\b(build|create|make|generate|design|develop|code)\b.{0,80}\b(game|platformer|shooter|pong|snake|tetris|rpg|simulator|chess|puzzle|racing|fighter|wordle|flappy)\b/i.test(String(prompt || ''));
}

function buildSystemPrompt(options = {}) {
  const intent = typeof options.intent === 'object' ? options.intent : null;
  const fineIntent = typeof options.fineIntent === 'object' ? options.fineIntent : null;
  const legacyIntent = options.legacyIntent || (typeof options.intent === 'string' ? options.intent : intent?.type);
  const skills = Array.isArray(options.skills) ? options.skills : [];
  const contract = options.contract && typeof options.contract === 'object' ? options.contract : null;
  const executionPlan = typeof options.executionPlan === 'string' ? options.executionPlan : null;

  const intentType = normalizeIntentType(legacyIntent || intent?.type);
  const primaryIntent = isGameCreationRequest(options.prompt, intent, fineIntent)
    ? 'game_creation'
    : (intent?.primaryIntent || fineIntent?.primaryIntent || fineIntent?.type || intent?.type || intentType);
  const secondaryIntent = intent?.secondaryIntent ? ` (secondary: ${intent.secondaryIntent})` : '';

  let adaptiveInstructions;
  if (intentType === 'code-help' || ['bug_fix', 'code_refactor', 'feature_implementation', 'simple_edit'].includes(primaryIntent)) {
    adaptiveInstructions = `
Adaptive Routing - Coding Path:
- Inspect relevant architecture and naming conventions before providing code.
- Do NOT hallucinate file paths or modify unrelated files.
- Preserve existing public API contracts, method signatures, and component props.
- Do NOT modify usage limits, rate limits, token limits, subscription plans, billing, or provider routing.
- Include exact files changed, a reasoning summary, and clear verification steps.`;
  } else if (intentType === 'app' || ['website_creation', 'game_creation', 'design_task'].includes(primaryIntent)) {
    const isExplicitDesignRequest = skills.some(s => s.id === 'frontend-modern-design') || /\b(glassmorphism|dark mode|awwwards|luxury|neon|aesthetic)\b/i.test(intent?.goal || '');
    const isGameCreation = primaryIntent === 'game_creation' || /\bgame\b/i.test(`${intent?.goal || ''} ${intent?.summary || ''}`);
    const designStyle = isGameCreation
      ? '- VISUAL DESIGN (GAME): Honor an explicitly requested visual style. If none is given, derive a distinctive art direction from the genre, setting, mechanics, and audience; do NOT default to retro, pixel art, neon, or another fixed aesthetic. Build a designed in-game start screen, HUD, palette, and typography that match the game world. NEVER apply generic web "dark glassmorphism", glass panels, luxury-app aesthetics, or Outfit/Inter web typography to games.'
      : isExplicitDesignRequest
        ? '- VISUAL DESIGN: Build with luxury dark mode glassmorphism (background: #090A0F, surface: rgba(18, 20, 29, 0.75), glowing borders, Outfit/Inter typography).'
        : '- VISUAL DESIGN: Follow clean, responsive, user-specified design instructions; preserve user explicit styling preferences.';

    adaptiveInstructions = `
    Adaptive Routing - App & Game Creation Path:
- Use the configured image-generation pipeline for background artwork and visual graphics when an image is genuinely needed.
${designStyle}
- Build a complete, runnable experience ready for the preview canvas.
- SHORT BRIEF FOR GAMES: When the request is a game, begin your response with a SMALL brief of at most 1-2 short sentences (the game title and its controls — e.g. "Here's Neon Pong — move with the Arrow keys, Space to launch."). NEVER write a long feature list, implementation summary, or "I built..." paragraph before or after the code.
- FULLSCREEN GAME REQUIREMENT: Games MUST fill the entire preview viewport — html/body with width:100%, height:100%, margin:0, overflow:hidden; a full-viewport canvas (width:100%, height:100%, display:block) with NO max-width, NO bordered box, NO rounded container around the game. Never wrap the canvas in a bordered/max-width "block". Keep a fixed internal game resolution (e.g. 960x540) and scale it to the viewport with ctx.setTransform + a resize listener so the game always fills the screen. On mobile, size the canvas from visualViewport, listen for orientationchange, and include on-screen touch controls shown only on touch devices.`;
  } else if (intentType === 'writing') {
    adaptiveInstructions = `
Adaptive Routing - Writing Path:
- Deliver polished copy in the requested format and tone.
- Match audience and purpose without technical commentary.`;
  } else if (intentType === 'explanation') {
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
- IMAGE REQUESTS: If the user explicitly requests an image, picture, photo, illustration, artwork, logo, or wallpaper, respond with EXACTLY ONE line containing \`[IMAGE_PROMPT: concise detailed description of the requested image]\` and nothing else. Never output raw SVG markup for image requests — the platform renders the image for you.`;

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
  let formattedSkills = '(none — direct execution path)';
  if (skills.length > 0) {
    formattedSkills = `\nThe skills below were selected specifically for this request and are MANDATORY: follow their instructions and verification steps exactly when they apply. Do not weaken, skip, or summarize them away. If a skill does not apply to the final deliverable, ignore it silently.${skills.map(s => {
      const id = typeof s === 'string' ? s : (s.id || s.name);
      const name = typeof s === 'object' ? (s.name || s.id) : s;
      const phase = typeof s === 'object' ? (s.phase || 'IMPLEMENTING') : 'EXECUTION';
      const instructions = typeof s === 'object' && s.instructions ? s.instructions : (s.description || 'Execute skill requirements');
      const reason = typeof s === 'object' && s.reasonSelected ? `\n    Reason: ${String(s.reasonSelected)}` : '';
      const constraints = typeof s === 'object' && Array.isArray(s.constraints) && s.constraints.length ? `\n    Constraints: ${s.constraints.join(' | ')}` : '';
      return `\n- [${phase}] ${name} (${id})${reason}\n    Instructions: ${String(instructions)}${constraints}`;
    }).join('')}`;
  }

  // Format intent contract & preservation constraints in full: these are
  // must-preserve rules, and dropping any part could let the model violate
  // an explicit requirement.
  let formattedContract = '';
  if (contract) {
    const mustAchieve = Array.isArray(contract.mustAchieve) && contract.mustAchieve.length ? `\n- Must Achieve: ${contract.mustAchieve.join('; ')}` : '';
    const mustPreserve = Array.isArray(contract.mustPreserve) && contract.mustPreserve.length ? `\n- Must Preserve: ${contract.mustPreserve.join('; ')}` : '';
    const mustNotInvent = Array.isArray(contract.mustNotInvent) && contract.mustNotInvent.length ? `\n- Must Not Change / Invent: ${contract.mustNotInvent.join('; ')}` : '';
    formattedContract = `\n\nIntent Contract & Preservation Rules:${mustAchieve}${mustPreserve}${mustNotInvent}`;
  }

  // Format Execution Plan in full.
  const formattedPlan = executionPlan ? `\n\n${String(executionPlan)}` : '';

  // Non-code intents (explanations and informational chat answers) also
  // receive the scannable formatting rules; code, app, and writing paths
  // keep their own dedicated guidance.
  const formattingIncluded = intentType === 'explanation' || !['code-help', 'app', 'writing'].includes(intentType);
  const formattingSection = formattingIncluded ? informationalFormatting : '';

  // The full creator-profile block (~250 tokens) only matters when the user
  // actually asks about Corez's origins; every other request gets a compact
  // pointer instead — a meaningful input-token saving on every request.
  const creatorsSection = /who (created|made|built|developed) (corez|core z|you)|who is your creator|your creators?|founder of corez|team behind corez/i.test(String(options.prompt || ''))
    ? `- CREATORS: If asked who created Corez or who made you, answer that Corez was founded and developed by these people, presenting their names as a clean bullet-point list of clickable markdown links with their roles: [Zayne Mundo](https://www.linkedin.com/in/zayne-mundo/) — Founder & Lead Developer, [Christian Vestil](https://www.linkedin.com/in/christian-jericson-belderol/) — Quality Assurance Tester, and [Renz Cardona](https://www.linkedin.com/in/renz-cardona-5941051b9/) — Chief Innovation Officer. Then explain WHY Corez was created, presenting the answer as clean, scannable markdown: start with the creator list, then the mission statement, then a short idea-to-launch summary. CoreZ was created as a conversational AI creation platform that helps people turn ideas into working digital products without needing to code. Rather than only answering questions, it is designed to understand the user's intent, generate websites, apps, games, tools, images, research reports and other content, display the result in a live preview, allow revisions through chat and publish finished creations through a shareable link. Its core purpose is to remove the technical gap between having an idea and launching something functional, making digital creation accessible to designers, marketers, entrepreneurs, students and everyday users. In short, CoreZ turns plain conversation into creation — taking anyone from a first spark of an idea to a finished, shareable product. Do not introduce yourself or list your capabilities after answering, and never mention APIs, models, providers, or any technical backend details.`
    : `- CREATORS: If asked who created Corez, present the founders as clickable markdown links — [Zayne Mundo](https://www.linkedin.com/in/zayne-mundo/) (Founder & Lead Developer), [Christian Vestil](https://www.linkedin.com/in/christian-jericson-belderol/) (Quality Assurance Tester), [Renz Cardona](https://www.linkedin.com/in/renz-cardona-5941051b9/) (Chief Innovation Officer) — and briefly explain why Corez was created.`;

  return `You are COREZ AI.

Identity & Persona:
- Your name is COREZ AI.
${creatorsSection}
- STRICT MODEL ANONYMITY RULE: NEVER mention what underlying AI model, provider, vendor, architecture, or engine powers you in public chat or user responses. Always identify yourself strictly as COREZ AI.
- When greeted with simple phrases like "hi", "hello", "hey", or "who are you", respond simply: "Hello! I'm COREZ AI. How can I help you today?"
- Never list bullet points or technical specializations when giving greetings unless requested.

Guidelines for Output:
- FOLLOW THE USER'S REQUEST EXACTLY: deliver precisely what the user asked for — implement everything they requested and add nothing they did not ask for. When the user's instruction conflicts with any default or template behaviour, the user's explicit instruction wins.
- AMBIGUOUS REQUESTS: When a user's prompt is ambiguous, underspecified, or missing essential details (e.g. they say "make a game", "build a website", "create a plan", or give a vague prompt with multiple conflicting interpretations), do NOT ask clarifying questions and do NOT present choice menus or option lists. Instead, choose the most sensible default interpretation, state the key assumption you made in ONE short sentence, and deliver the complete result. The user can refine it in a follow-up message.
- DEFAULT FORMAT (React/JSX): When writing code or building apps, components, tools, dashboards, or games without an explicitly requested format, default to clean, modern React/JSX components (using \`\`\`jsx ... \`\`\` code blocks). ALWAYS name your main top-level component "export default function App()".
- REQUESTED FORMATS (HTML/CSS/JS): If the user explicitly requests HTML, CSS, vanilla JS, or plain web code, output complete single-file HTML/CSS/JS inside ONE SINGLE \`\`\`html ... \`\`\` code block.
- PROPER LAYERING: Ensure proper visual layering (Background z-index:0 -> Content z-index:10 -> HUD/Toolbars z-index:20-30 -> Modals z-index:40-50+).
- CRITICAL SINGLE-FILE MANDATE: Output all code as ONE SINGLE self-contained file in ONE SINGLE code block.
- NEVER use "---" or "***" horizontal-rule lines anywhere in your response (they render as stray text in the chat UI); separate sections with "##" headings or blank lines instead.
- Always start your response with a brief summary explaining your implementation choices before the code block.
${adaptiveInstructions}${formattingSection}${emailFormatting}

Fine-Grained Intent: ${primaryIntent}${secondaryIntent}
Target Goal: ${intent?.goal || 'Assist user with requested deliverable'}
Deliverable: ${intent?.deliverable || 'Response'}
Complexity: ${intent?.complexity || 'medium'} | Confidence: ${Math.round((intent?.confidence || 0.8) * 100)}%${formattedContract}

Active Skills & Instructions:${formattedSkills}${formattedPlan}
${imageRequestInstructions}
Inferred intent: ${intentType} - ${intent?.summary || intent?.goal || 'Understand the public user goal and give a useful next step.'}`;
}

async function handleAi(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  let body;
  try {
    body = await readBoundedJson(request);
  } catch (bodyErr) {
    const message = bodyErr?.message || 'Invalid JSON payload.';
    return jsonResponse(400, { error: `Request body rejected: ${message}` });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    body = {};
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return jsonResponse(400, { error: 'Prompt is required.' });
  }

  // Title-only fast path: the client asks the model to name a new chat
  // session from its first message. A tiny dedicated system prompt and a
  // strict output cap keep this near-free; failures resolve to title: null
  // so the client falls back to its deterministic heuristic naming.
  // NOTE: the provider is a reasoning model that spends tokens thinking
  // before answering — a 30-token cap was entirely consumed by reasoning
  // (content: ""), so the budget must leave room for the actual title.
  if (body.titleOnly === true) {
    const TITLE_SYSTEM_PROMPT = "You name chat conversations. Given the user's first message, reply with ONLY a short descriptive title for the conversation (5 words or fewer, no quotes, no ending punctuation, no markdown, no explanations). Capture the topic or the deliverable the user is asking for.";
    const titleMessages = [
      { role: 'system', content: TITLE_SYSTEM_PROMPT },
      { role: 'user', content: prompt.slice(0, 400) }
    ];
    try {
      const titleResult = await runProviderChain(titleMessages, {
        env,
        signal: request.signal || null,
        store: null,
        sleep: retrySleepFor(env),
          });
      let title = typeof titleResult?.content === 'string' ? titleResult.content.trim() : '';
      title = title.replace(/^Title:\s*/i, '').trim();
      title = title.replace(/^["'\s]+|["'\s]+$/g, '').replace(/[.!?]+$/, '').trim();
      if (title.length > 60) title = title.slice(0, 60).trim();
      if (!title) {
        return jsonResponse(200, { title: null });
      }
      return jsonResponse(200, {
        title,
        model: titleResult?.model || titleResult?.provider || null
      });
    } catch (err) {
      console.warn('AI session title generation failed (client falls back to heuristic):', safeErrorDetail(err));
      return jsonResponse(200, { title: null });
    }
  }

  // Greeting fast-path: common greetings get the mandated persona reply
  // instantly without paying an LLM round-trip. Replies are short, natural
  // variants selected deterministically (no large LLM for tiny requests).
  // The reply honors the streaming contract: a streamed request gets a
  // real SSE stream with one delta, never a JSON body the client's SSE
  // parser would misread as an empty stream.
  const GREETING_PATTERN = /^(hi|hello|hey|yo|sup|howdy|greetings|good\s+(morning|afternoon|evening|day)|who\s+(are|r)\s+you|what\s+(are|r)\s+you|whats?\s+(is\s+)?your\s+name)\b[.?!]*$/i;
  if (prompt.length <= 60 && GREETING_PATTERN.test(prompt)) {
    const isIdentityQuestion = /who\s+(are|r)\s+you|what\s+(are|r)\s+you|whats?\s+(is\s+)?your\s+name/i.test(prompt);
    const greetingReplies = isIdentityQuestion
      ? [
          "I'm COREZ AI — turn ideas into working digital products. What are we building today?",
          "I'm COREZ AI: describe an idea and I'll build it for you. What's the idea?"
        ]
      : [
          'Hey! What are we building today?',
          'Hey there — what should we create?',
          'Hi! What are we building today?'
        ];
    const index = [...prompt.toLowerCase()].reduce((acc, char) => acc + char.charCodeAt(0), 0) % greetingReplies.length;
    const greetingContent = greetingReplies[index];
    if (body.stream === true) {
      const encoder = new TextEncoder();
      const sse = (event) => `data: ${JSON.stringify(event)}\n\n`;
      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sse({ type: 'meta', provider: 'corez', model: 'corez-greeting' })));
          controller.enqueue(encoder.encode(sse({ type: 'delta', text: greetingContent })));
          controller.enqueue(encoder.encode(sse({ type: 'done', final: true, projectState: null })));
          controller.close();
        }
      });
      return new Response(readable, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'X-Accel-Buffering': 'no'
        }
      });
    }
    return jsonResponse(200, {
      content: greetingContent,
      model: 'corez-greeting'
    });
  }

  const intent = body.intent && typeof body.intent === 'object' && !Array.isArray(body.intent) ? body.intent : null;
  const fineIntent = body.fineIntent && typeof body.fineIntent === 'object' && !Array.isArray(body.fineIntent) ? body.fineIntent : null;
  const legacyIntent = body.legacyIntent || (typeof intent === 'string' ? intent : intent?.type);
  const intentType = normalizeIntentType(legacyIntent || intent?.type);
  const contract = body.contract && typeof body.contract === 'object' ? body.contract : null;
  const skills = Array.isArray(body.skills) ? body.skills : [];
  const executionPlan = typeof body.executionPlan === 'string' ? body.executionPlan : null;
  // The client-computed execution prompt carries the design spec (Awwwards
  // principles, layout rules, code format). It must reach the model: it
  // replaces the bare user prompt when present.
  const executionPrompt = typeof body.executionPrompt === 'string' && body.executionPrompt.trim()
    ? body.executionPrompt.trim()
    : null;

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const systemPrompt = buildSystemPrompt({ prompt, intent, fineIntent, legacyIntent, skills, contract, executionPlan });
  const apiMessages = [
    { role: 'system', content: systemPrompt }
  ];

  // ---------------------------------------------------------------------
  // Skill Verification Layer — runtime context + live-data grounding.
  // Requests that need fresh external data (currency, weather, research
  // with citations) are grounded in a REAL web search BEFORE generation so
  // the model answers from evidence, never from memory. A search failure is
  // honest: no live evidence is injected and the verifier flags answers
  // that still present current values as fabricated.
  // ---------------------------------------------------------------------
  const runtimeContext = buildRuntimeContext();
  const liveDataNeed = detectLiveDataNeed(executionPrompt || prompt);
  const specialistIds = Array.isArray(skills)
    ? skills.map((s) => (typeof s === 'string' ? s : s.id)).filter(Boolean)
    : [];
  if (specialistIds.includes('data-analysis')) {
    const dataContext = buildDataAnalysisContext(executionPrompt || prompt);
    if (dataContext) apiMessages.push({ role: 'system', content: dataContext });
  }
  const needsGrounding = liveDataNeed.required || specialistIds.includes('research-report');
  let liveDataEvidence = null;
  if (needsGrounding && env?.__DISABLE_LIVE_GROUNDING !== 'true') {
    apiMessages.push({ role: 'system', content: buildRuntimeContextBlock(runtimeContext) });
    try {
      const searchRequest = new Request('https://corez.test/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: executionPrompt || prompt, detail: true })
      });
      const searchResult = await handleSearch(searchRequest, env);
      if (searchResult.ok) {
        const data = await searchResult.json();
        if (Array.isArray(data?.results) && data.results.length > 0) {
          liveDataEvidence = {
            servedAt: data.meta?.servedAt || new Date().toISOString(),
            fetchedAt: new Date().toISOString(),
            sources: Array.isArray(data.meta?.sources) ? data.meta.sources : ['web-search'],
            results: data.results,
            maxAgeMs: 12 * 60 * 60 * 1000
          };
          const snippets = data.results
            .slice(0, 8)
            .map((r) => `- ${r.title} | ${r.url} | ${String(r.snippet || '').slice(0, 300)}${r.extract ? ` | ${String(r.extract).slice(0, 1200)}` : ''}`)
            .join('\n');
          // Enumerated live-data kinds are STRICT: the answer must come only
          // from the search results. The fuzzy kinds ('freshness' and
          // 'media-releases') are SOFT: results are used when they answer the
          // question, otherwise the model answers from knowledge and notes it
          // could not verify — a miss degrades gracefully instead of forcing
          // a refusal.
          const softLiveKinds = new Set(['freshness', 'media-releases']);
          const liveInstruction = liveDataNeed.required
            ? softLiveKinds.has(liveDataNeed.kind)
              ? `This request may need CURRENT data (${liveDataNeed.kind}). Use the search results below when they contain current information for the request, and cite the source URLs you used. If the results do NOT answer the question, answer from your knowledge and note that you could not verify current information.`
              : `This request needs CURRENT data (${liveDataNeed.kind}). Answer ONLY from the search results below; state the source URL and timestamp. NEVER use remembered values. If the results do not contain the current value, say clearly that live data could not be retrieved.`
            : `Use the search results below as the research evidence for your answer. Cite the actual source URLs. Do NOT invent citations or claims not supported by these results.`;
          apiMessages.push({
            role: 'system',
            content: `${liveInstruction}\n\nLive search results (fetched at ${liveDataEvidence.fetchedAt}):\n${snippets}`
          });
        }
      }
    } catch (err) {
      console.warn('Live grounding search failed (request continues without live evidence):', safeErrorDetail(err));
    }
  }

  // Fast path for general intents: explanations, writing, and casual chat are
  // answered from the last few turns only, so they come back quickly. Coding,
  // app, and game requests keep the FULL history. NO output caps exist
  // anywhere: every provider call runs uncapped, so reasoning models can think
  // as long as they need and deliverables are never cut off mid-generation.
  const primaryIntent = intent?.primaryIntent || legacyIntent || intentType;
  const specialistSkills = Array.isArray(skills) && skills.length > 0
    ? skills.map((s) => (typeof s === 'string' ? s : s.id)).filter(Boolean)
    : [];
  const isFastIntent = ['explanation', 'general', 'writing'].includes(intentType)
    && !['bug_fix', 'code_refactor', 'feature_implementation', 'simple_edit', 'code_question', 'app', 'website_creation', 'game_creation', 'design_task'].includes(primaryIntent)
    && intentType !== 'app'
    && specialistSkills.length === 0;
  const fastHistoryWindow = Math.max(2, Math.min(8, body.fastHistoryWindow || 8));

  const fastMessages = isFastIntent
    ? messages.filter(m => m.role && m.content).slice(-fastHistoryWindow)
    : messages;

  // Live Awwwards inspiration for app/site requests: real award-winning
  // site references (title + URL) are injected into the system prompt so the
  // model has concrete visual direction. Best-effort: failure never blocks
  // the request and never fabricates references.
  const appIntent = intent?.type === 'app' || legacyIntent === 'app';
  const gameIntent = isGameCreationRequest(prompt, intent, fineIntent);
  if (appIntent && !gameIntent) {
    try {
      const inspiration = await fetchAwwwardsInspiration(prompt, env?.__INSPIRATION_FETCH);
      if (Array.isArray(inspiration?.sites) && inspiration.sites.length > 0) {
        const refs = inspiration.sites
          .map((site) => {
            let line = `- ${site.title} — ${site.url}`;
            if (site.liveUrl) line += ` (Live site: ${site.liveUrl})`;
            if (site.description) line += `\n  Design approach: ${site.description}`;
            if (site.tags && site.tags.length > 0) line += `\n  Visual elements: ${site.tags.join(', ')}`;
            return line;
          })
          .join('\n\n');
        apiMessages.push({
          role: 'system',
          content: `Live design inspiration from Awwwards (${inspiration.category} category):\n${refs}\n\nUse these award-winning sites as visual references for layout, typography, colour, and interaction quality. Use them as design direction.`
        });
      }
    } catch (error) {
      console.warn('Awwwards inspiration fetch failed (request continues):', safeErrorDetail(error));
    }
  }

  let hasAppendedPrompt = false;
  for (const m of fastMessages) {
    if (m.role && m.content) {
      apiMessages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
      if (typeof m.content === 'string' && (m.content === prompt || m.content === executionPrompt) && m.role === 'user') {
        hasAppendedPrompt = true;
      }
    }
  }
  
  if (!hasAppendedPrompt) {
    apiMessages.push({ role: 'user', content: executionPrompt || prompt });
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
      role: 'system',
      content: buildProjectContextSection(activeProject, prompt)
    });
  }

  // Provider fallback chain: OpenCode Go is preferred and stays preferred;
  // the official DeepSeek API and OpenRouter are fallbacks tried in order
  // only when the preferred provider cannot serve. The same messages travel
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
      else request.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    return controller.signal;
  })();

  const requestStartedAt = Date.now();

  // Creation Harness: plan -> build -> verify -> repair -> review, with
  // durable R2 state so a disconnected build resumes. Replaces the single
  // generation for creation requests; SSE events (phase/delta/done) keep the
  // client informed while the loop takes as long as it needs. Game requests
  // resolve to game_creation (prompt-based, same rule as the system prompt)
  // so the harness takes the simple one-pass game path.
  if (body.harness === true) {
    const resolvedPrimary = isGameCreationRequest(prompt, intent, fineIntent)
      ? 'game_creation'
      : (intent?.primaryIntent || fineIntent?.primaryIntent || fineIntent?.type || intentType);
    const harnessIntentType = ['app', 'game_creation', 'website_creation', 'design_task'].includes(resolvedPrimary)
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
      complexity: body.complexity
    };
    if (body.stream === true) {
      // Streaming harness: SSE events (phase/delta/done) keep the client
      // informed while the loop takes as long as it needs.
      const encoder = new TextEncoder();
      const sse = (event) => `data: ${JSON.stringify(event)}\n\n`;
      const readable = new ReadableStream({
        async start(controller) {
          try {
            for await (const event of runCreationHarness(harnessOptions)) {
              controller.enqueue(encoder.encode(sse(event)));
            }
          } catch (err) {
            const payload = {
              type: 'error',
              message: err?.retryable
                ? err.message
                : `Creation harness failed: ${safeErrorDetail(err)}`,
              status: err?.status || 502,
              ...(err?.retryable ? { retryable: true } : {})
            };
            controller.enqueue(encoder.encode(sse(payload)));
          }
          controller.close();
        }
      });
      return new Response(readable, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'X-Accel-Buffering': 'no'
        }
      });
    }

    // Non-streaming harness: run the ENTIRE build loop (plan -> build ->
    // verify -> repair -> review) inside this request, then answer with the
    // finished artifact in a single JSON body. The client waits until the
    // build is done — no live deltas. The generator replays the persisted
    // terminal artifact on re-issue, so interrupted builds still resume.
    try {
      let content = '';
      let projectState = null;
      let diagnostics = null;
      for await (const event of runCreationHarness(harnessOptions)) {
        if (event.type === 'clear') {
          content = '';
        } else if (event.type === 'delta' && typeof event.text === 'string') {
          content += event.text;
        } else if (event.type === 'done') {
          projectState = event.projectState ?? projectState;
        } else if (event.type === 'diagnostics') {
          diagnostics = event.diagnostics;
        }
      }
      return jsonResponse(200, { content, projectState, diagnostics });
    } catch (err) {
      if (err?.status === 499) {
        return jsonResponse(499, { error: 'AI request cancelled.' });
      }
      return jsonResponse(err?.status || 502, {
        error: err?.retryable
          ? err.message
          : `Creation harness failed: ${safeErrorDetail(err)}`,
        ...(err?.retryable ? { retryable: true } : {})
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
      };
    const encoder = new TextEncoder();
    const sse = (event) => `data: ${JSON.stringify(event)}\n\n`;
    const bufferForSkillVerification = specialistSkills.length > 0;
    const readable = new ReadableStream({
      async start(controller) {
        let collected = '';
        let providerId = null;
        let providerModel = null;
        let inputTokens = null;
        let outputTokens = null;
        try {
          for await (const event of runStreamingChain(apiMessages, chainOptions)) {
            if (event.type === 'delta') {
              collected += event.text;
              if (!bufferForSkillVerification) controller.enqueue(encoder.encode(sse(event)));
            } else if (event.type === 'meta') {
              providerId = providerId || event.provider || null;
              providerModel = providerModel || event.model || null;
              controller.enqueue(encoder.encode(sse(event)));
            } else if (event.type === 'usage') {
              inputTokens = event.inputTokens ?? inputTokens;
              outputTokens = event.outputTokens ?? outputTokens;
            } else if (event.type === 'done') {
              providerId = providerId || event.provider || null;
              providerModel = providerModel || event.model || null;

              // Streaming auto-continuation: if output ended mid-generation (token limit, unclosed blocks)
              let continuationCount = 0;
              const MAX_STREAM_CONTINUATIONS = 8;
              let currentStopReason = event.finishReason || null;
              let antiRepeatTried = false;
              while (continuationCount < MAX_STREAM_CONTINUATIONS && collected.trim()) {
                const streamTruncation = detectTruncation(collected, { stopReason: currentStopReason });
                if (!streamTruncation.truncated) break;
                continuationCount += 1;
                controller.enqueue(encoder.encode(sse({ type: 'phase', phase: 'continuing', attempt: continuationCount, total: MAX_STREAM_CONTINUATIONS })));

                // If the previous continuation repeated the beginning instead
                // of continuing, switch to an explicit anti-repetition
                // instruction.
                const streamContMessages = [
                  ...apiMessages,
                  { role: 'assistant', content: collected },
                  {
                    role: 'user',
                    content: antiRepeatTried ? ANTI_REPEAT_CONTINUATION_INSTRUCTION : CONTINUATION_INSTRUCTION
                  }
                ];

                let contChunk = '';
                let nextStopReason = null;
                try {
                  for await (const contEvent of runStreamingChain(streamContMessages, chainOptions)) {
                    if (contEvent.type === 'delta') {
                      contChunk += contEvent.text;
                    } else if (contEvent.type === 'usage' && contEvent.outputTokens) {
                      outputTokens = (outputTokens || 0) + contEvent.outputTokens;
                    } else if (contEvent.type === 'done') {
                      nextStopReason = contEvent.finishReason || null;
                    }
                  }
                } catch {
                  break;
                }

                if (!contChunk.trim()) break;
                const { stitched, deltaText } = stitchContinuationChunk(collected, contChunk);
                if (deltaText && !bufferForSkillVerification) {
                  controller.enqueue(encoder.encode(sse({ type: 'delta', text: deltaText })));
                }
                if (stitched.length <= collected.length) {
                  // The model restarted from the beginning instead of
                  // continuing: give it ONE retry with the anti-repetition
                  // instruction before giving up on this pass.
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
                  });
                  if (repaired?.usage) repairUsage.push(repaired.usage);
                  return repaired.content ? repaired : null;
                },
                maxRepairs: 4
              });
              if (repair.diagnostics.repaired && repair.diagnostics.repairReasons.length > 0) {
                controller.enqueue(encoder.encode(sse({ type: 'validation', action: 'repaired', reasons: repair.diagnostics.repairReasons })));
                const appended = repair.content.slice(collected.length);
                if (appended && !bufferForSkillVerification) {
                  controller.enqueue(encoder.encode(sse({ type: 'delta', text: appended })));
                }
                collected = repair.content;
              }

              // Honest-failure gate: if the answer is STILL cut off after the
              // provider stream, streaming continuations, and every repair
              // round, surface an explicit error instead of a clean "done"
              // over truncated content (the client would otherwise render a
              // reply that just stops mid-way).
              if (repair.diagnostics.truncationDetected) {
                const signals = (repair.diagnostics.truncationSignals || []).slice(0, 3).join(', ');
                controller.enqueue(encoder.encode(sse({
                  type: 'error',
                  message: signals
                    ? `The AI reply was cut off (${signals}) and could not be completed automatically. Please try again.`
                    : 'The AI reply was cut off and could not be completed automatically. Please try again.',
                  status: 502
                })));
                controller.close();
                return;
              }

              // Skill Verification Layer: deterministic targeted patches only.
              const verification = runVerificationWithRepair({
                prompt,
                content: repair.content,
                skills,
                runtimeContext,
                liveDataEvidence,
                searchEvidence: liveDataEvidence
              });
              const finalContent = verification.content;
              if (bufferForSkillVerification) {
                controller.enqueue(encoder.encode(sse({ type: 'delta', text: finalContent })));
                collected = finalContent;
              } else if (finalContent !== collected) {
                const appended = finalContent.slice(collected.length);
                if (appended) {
                  controller.enqueue(encoder.encode(sse({ type: 'delta', text: appended })));
                }
                collected = finalContent;
              }
              const returnedProject = activeProject
                || deriveProjectState([{ role: 'assistant', content: finalContent }]);
              if (!finalContent.trim()) {
                // Nothing was produced after the provider stream, nudges,
                // retries, and repair: report the real failure instead of a
                // contentless success, so the client can surface the reason.
                controller.enqueue(encoder.encode(sse({
                  type: 'error',
                  message: 'The AI provider returned no content for this request after retries. Please try again.',
                  status: 502
                })));
                controller.close();
                return;
              }
              controller.enqueue(encoder.encode(sse({ type: 'done', final: true, projectState: serializeProjectState(returnedProject) })));
              controller.enqueue(encoder.encode(sse({
                type: 'diagnostics',
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
                    latencyMs: verification.latencyMs
                  },
                  liveData: buildLiveDataDiagnostics(liveDataEvidence, liveDataNeed, verification),
                  usage: {
                    initial: { inputTokens, outputTokens },
                    repairs: repairUsage,
                    total: {
                      inputTokens: [inputTokens, ...repairUsage.map((u) => u.inputTokens)].filter((n) => Number.isFinite(n) && n !== null).reduce((a, b) => a + b, 0),
                      outputTokens: [outputTokens, ...repairUsage.map((u) => u.outputTokens)].filter((n) => Number.isFinite(n) && n !== null).reduce((a, b) => a + b, 0)
                    },
                    estimatedCostUsd: estimateCostUsd(
                      [inputTokens, ...repairUsage.map((u) => u.inputTokens)].filter((n) => Number.isFinite(n) && n !== null).reduce((a, b) => a + b, 0),
                      [outputTokens, ...repairUsage.map((u) => u.outputTokens)].filter((n) => Number.isFinite(n) && n !== null).reduce((a, b) => a + b, 0),
                      env
                    )
                  },
                  latency: {
                    routingMs: 0,
                    providerMs: event.totalMs || 0,
                    verificationMs: verification.latencyMs,
                    repairMs: 0,
                    totalMs: Date.now() - requestStartedAt
                  }
                }
              })));
              controller.close();
              return;
            } else if (event.type === 'error') {
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
            controller.enqueue(encoder.encode(sse({
              type: 'error',
              message: 'The AI provider returned no content for this request after retries. Please try again.',
              status: 502
            })));
          } else {
            controller.enqueue(encoder.encode(sse({ type: 'done', final: true, projectState: null })));
          }
          controller.close();
        } catch (err) {
          controller.enqueue(encoder.encode(sse({ type: 'error', message: safeErrorDetail(err), status: 502 })));
          controller.close();
        }
      }
    });
    return new Response(readable, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'X-Accel-Buffering': 'no'
      }
    });
  }

  const providerStartedAt = Date.now();
  const result = await runProviderChain(apiMessages, {
    env,
    signal: clientDisconnectSignal,
    store: createTaskStateStore(env),
    sleep: retrySleepFor(env),
  });
  const providerMs = Date.now() - providerStartedAt;

  if (result.status === 'retry-scheduled') {
    // The provider could not recover within this request's practical window;
    // the retry schedule is persisted and the task resumes on a later call.
    return jsonResponse(200, {
      taskId: result.taskId,
      status: 'retry-scheduled',
      retryAfterSeconds: result.retryAfterSeconds
    });
  }

  if (result.status === 'cancelled') {
    return jsonResponse(499, { error: 'AI request cancelled.' });
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
              });
        if (repaired?.usage) repairUsage.push(repaired.usage);
        return repaired.content ? repaired : null;
      },
      maxRepairs: 2
    });
    const repairMs = Date.now() - repairStartedAt;

    // Honest-failure gate: a reply that is STILL cut off after the provider
    // call and every repair round is never returned as a successful 200 —
    // the client would otherwise render a message that stops mid-way.
    if (processed.diagnostics.truncationDetected) {
      return jsonResponse(502, {
        error: 'The AI reply was cut off and could not be completed automatically. Please try again.',
        detail: (processed.diagnostics.truncationSignals || []).slice(0, 3).join(', ') || undefined,
        diagnostics: processed.diagnostics
      });
    }

    // Skill Verification Layer: every activated skill verifies the response
    // before it is marked trustworthy. Deterministic targeted patches only —
    // bounded, never a full regeneration.
    const verification = runVerificationWithRepair({
      prompt,
      content: processed.content,
      skills,
      runtimeContext,
      liveDataEvidence,
      searchEvidence: liveDataEvidence
    });
    const finalContent = verification.content;
    const initialTokens = {
      inputTokens: result.usage?.inputTokens ?? null,
      outputTokens: result.usage?.outputTokens ?? null
    };
    const totalInput = [initialTokens.inputTokens, ...repairUsage.map((u) => u.inputTokens)]
      .filter((n) => Number.isFinite(n) && n !== null)
      .reduce((acc, n) => acc + n, 0);
    const totalOutput = [initialTokens.outputTokens, ...repairUsage.map((u) => u.outputTokens)]
      .filter((n) => Number.isFinite(n) && n !== null)
      .reduce((acc, n) => acc + n, 0);

    // Project state returned to the client: the client-provided or
    // conversation-derived state, or — on first creation turns with no prior
    // code — the state derived from the just-generated answer, so the client
    // can persist it and send it back on the next follow-up turn.
    const returnedProject = activeProject
      || deriveProjectState([{ role: 'assistant', content: finalContent }]);
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
        latencyMs: verification.latencyMs
      },
      liveData: buildLiveDataDiagnostics(liveDataEvidence, liveDataNeed, verification),
      usage: {
        initial: initialTokens,
        repairs: repairUsage,
        total: {
          inputTokens: totalInput || initialTokens.inputTokens,
          outputTokens: totalOutput || initialTokens.outputTokens
        },
        estimatedCostUsd: estimateCostUsd(
          totalInput || initialTokens.inputTokens,
          totalOutput || initialTokens.outputTokens,
          env
        )
      },
      latency: {
        routingMs: Math.max(0, providerStartedAt - requestStartedAt),
        providerMs,
        verificationMs: verification.latencyMs,
        repairMs,
        totalMs: Date.now() - requestStartedAt
      }
    };
    return jsonResponse(200, {
      content: finalContent,
      model: result.model,
      provider: result.provider || null,
      projectState: serializeProjectState(returnedProject) || undefined,
      diagnostics
    });
  }

  console.error(JSON.stringify({
    message: 'AI generation failed',
    error: result.error || 'all providers returned no usable response'
  }));
  return jsonResponse(502, {
    error: 'Unable to generate AI response.',
    detail: result.error || 'all providers returned no usable response'
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

async function saveToR2IfAvailable(env, key, buffer, mimeType = 'image/png') {
  if (env.ASSET_BUCKET && typeof env.ASSET_BUCKET.put === 'function') {
    try {
      await env.ASSET_BUCKET.put(key, buffer, {
        httpMetadata: { contentType: mimeType }
      });
      return `/api/assets/${key}`;
    } catch {
      // R2 is optional: the provider URL is returned when storage fails.
    }
  }
  return null;
}

async function handleImage(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  const retryAfter = imageRateLimiter(request);
  if (retryAfter !== null) {
    return jsonResponse(429, { error: 'Too many image requests. Try again shortly.' }, { 'Retry-After': String(retryAfter) });
  }

  let body;
  try {
    body = await readBoundedJson(request);
  } catch (bodyErr) {
    const message = bodyErr?.message || 'Invalid JSON payload.';
    return jsonResponse(400, { error: `Request body rejected: ${message}` });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    body = {};
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return jsonResponse(400, { error: 'Prompt is required.' });
  }

  // Optional reference image (the user's own image) sent to the image model
  // as multimodal input. Only validated data: image payloads or public https
  // URLs are accepted; anything else is rejected before any provider call.
  const referenceImage = validateReferenceImage(body.referenceImage);
  if (referenceImage === null && typeof body.referenceImage === 'string' && body.referenceImage) {
    return jsonResponse(400, {
      error: 'referenceImage must be a base64 data:image URL or a public https URL.'
    });
  }

  const openRouterKey = env?.OPENROUTER_API_KEY;
  if (!openRouterKey) {
    // Honest 503: no image provider is configured. Text providers are never
    // routed as fake image providers.
    return jsonResponse(503, {
      error: 'Image generation is unavailable: no image provider is configured on this deployment (set OPENROUTER_API_KEY to enable image generation).'
    });
  }

  const r2Key = `image_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.png`;

  // Image generation runs as long as it needs; only a client disconnect
  // aborts (Stop button, tab close).
  const imageClientSignal = (() => {
    const controller = new AbortController();
    if (request.signal) {
      if (request.signal.aborted) controller.abort();
      else request.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    return controller.signal;
  })();

  // OpenRouter image responses may use images[0].url, content URLs, or data:
  // image payloads. OPENROUTER_IMAGE_MODEL overrides the configured default
  // chain with one model.
  const imageModels = env?.OPENROUTER_IMAGE_MODEL ? [String(env.OPENROUTER_IMAGE_MODEL)] : undefined;
  const imageResult = await callOpenRouterImage(openRouterKey, prompt, imageClientSignal, imageModels, referenceImage);
  if (!imageResult) {
    return jsonResponse(503, {
      error: 'Image generation is unavailable: the image provider did not return an image.'
    });
  }
  const { url: imageUrl, model: imageModel } = imageResult;

  // Only https: or inline data: payloads are ever fetched. This blocks the
  // provider-returned URL from being used to reach internal hosts
  // (metadata endpoints, private ranges) via a malformed or injected reply.
  const isDataUrl = imageUrl.startsWith('data:');
  if (!isDataUrl) {
    let parsed;
    try {
      parsed = new URL(imageUrl);
    } catch {
      return jsonResponse(502, { error: 'Image generation failed: the provider returned an invalid image URL.' });
    }
    if (parsed.protocol !== 'https:') {
      return jsonResponse(502, { error: 'Image generation failed: the provider returned a non-https image URL.' });
    }
    // Scheme is not enough: never fetch loopback, private, link-local, or
    // cloud metadata hosts (169.254.169.254) that a malformed provider reply
    // could point at.
    if (isBlockedInternalHost(parsed.hostname)) {
      return jsonResponse(502, { error: 'Image generation failed: the provider returned a non-public image URL.' });
    }
  }

  try {
    let buffer;
    let mimeType = 'image/png';
    if (isDataUrl) {
      const parts = imageUrl.split(',');
      mimeType = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
      const bstr = atob(parts[1] || '');
      const u8arr = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) {
        u8arr[i] = bstr.charCodeAt(i);
      }
      buffer = u8arr.buffer;
    } else {
      // Image generation runs as long as it needs (project contract: no
      // artificial generation timeouts); only client disconnect aborts.
      const imgResp = await fetch(imageUrl, { signal: imageClientSignal });
      if (imgResp.ok) {
        mimeType = imgResp.headers.get('content-type') || 'image/png';
        buffer = await imgResp.arrayBuffer();
      }
    }

    if (buffer && buffer.byteLength > 0) {
      const r2Url = await saveToR2IfAvailable(env, r2Key, buffer, mimeType);
      return jsonResponse(200, { image: r2Url || imageUrl, model: imageModel });
    }
  } catch (err) {
    console.warn('Failed to persist image to R2, returning provider URL:', safeErrorDetail(err));
  }
  return jsonResponse(200, { image: imageUrl, model: imageModel });
}

// Workers AI text-to-image endpoint: runs @cf/black-forest-labs/flux-2-klein-4b
// on the account's OWN Workers AI (env.AI binding) — no third-party key, and
// billed inside the daily free neuron allocation. Same response contract as
// /api/image: { image: <r2 url | data url>, model }.
//
// Input contract: prompt (required) + optional width/height (256-1920) and
// seed. The model consumes multipart/form-data (the JSON body shape is
// rejected by the runner), so the binding call builds a FormData part.
const WORKERS_AI_IMAGE_MODEL = '@cf/black-forest-labs/flux-2-klein-4b';

function boundedInt(value, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : null;
}

// Detect the image mime from the base64 magic bytes (FLUX.2 klein returns
// JPEG by default); PNG fallback for providers that return PNG.
function mimeFromBase64(base64) {
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('iVBOR')) return 'image/png';
  if (base64.startsWith('UklGR')) return 'image/webp';
  return 'image/png';
}

async function handleWorkersAIImage(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  const retryAfter = imageRateLimiter(request);
  if (retryAfter !== null) {
    return jsonResponse(429, { error: 'Too many image requests. Try again shortly.' }, { 'Retry-After': String(retryAfter) });
  }

  let body;
  try {
    body = await readBoundedJson(request);
  } catch (bodyErr) {
    const message = bodyErr?.message || 'Invalid JSON payload.';
    return jsonResponse(400, { error: `Request body rejected: ${message}` });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    body = {};
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return jsonResponse(400, { error: 'Prompt is required.' });
  }

  const ai = env?.AI;
  if (!ai || typeof ai.run !== 'function') {
    return jsonResponse(503, {
      error: 'Workers AI image generation is unavailable: no AI binding is configured on this deployment.'
    });
  }

  // Only a client disconnect aborts (Stop button, tab close).
  const clientSignal = (() => {
    const controller = new AbortController();
    if (request.signal) {
      if (request.signal.aborted) controller.abort();
      else request.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    return controller.signal;
  })();

  let result;
  try {
    // The model consumes multipart/form-data. Serialize the FormData through
    // a Response so the binding receives a proper multipart stream PLUS its
    // derived Content-Type with the boundary (the documented klein-4b
    // pattern): passing a raw FormData with a custom Content-Type strips the
    // boundary (runner 3030), and string/byte bodies are rejected (8001).
    const form = new FormData();
    form.append('prompt', prompt);
    const width = boundedInt(body.width, 256, 1920);
    const height = boundedInt(body.height, 256, 1920);
    const seed = boundedInt(body.seed, 0, 2147483647);
    if (width !== null) form.append('width', String(width));
    if (height !== null) form.append('height', String(height));
    if (seed !== null) form.append('seed', String(seed));
    const formResponse = new Response(form);
    const inputs = {
      multipart: {
        body: formResponse.body,
        contentType: formResponse.headers.get('content-type')
      }
    };
    result = await ai.run(WORKERS_AI_IMAGE_MODEL, inputs, clientSignal ? { signal: clientSignal } : undefined);
  } catch (err) {
    if (clientSignal?.aborted || err?.name === 'AbortError') {
      return jsonResponse(499, { error: 'Image request cancelled.' });
    }
    console.warn('Workers AI image generation failed:', safeErrorDetail(err));
    return jsonResponse(502, { error: 'Image generation failed: the Workers AI provider returned an error.' });
  }

  const base64 = result?.image;
  if (typeof base64 !== 'string' || base64.length === 0) {
    return jsonResponse(502, { error: 'Image generation failed: the Workers AI provider returned no image.' });
  }

  // Persist to R2 when available; otherwise return the inline data URL. The
  // data URL is always the safe fallback — it is never fetched again.
  const mimeType = mimeFromBase64(base64);
  const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png';
  const r2Key = `image_cf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${extension}`;
  let imageUrl = `data:${mimeType};base64,${base64}`;
  try {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const r2Url = await saveToR2IfAvailable(env, r2Key, bytes.buffer, mimeType);
    if (r2Url) imageUrl = r2Url;
  } catch {
    // R2 is optional: the data URL is returned when storage fails.
  }
  return jsonResponse(200, { image: imageUrl, model: WORKERS_AI_IMAGE_MODEL });
}

async function handleR2Assets(request, env) {
  if (!env.ASSET_BUCKET || typeof env.ASSET_BUCKET.put !== 'function') {
    return jsonResponse(503, { error: 'Cloudflare R2 ASSET_BUCKET is not configured.' });
  }

  const url = new URL(request.url);
  const pathname = url.pathname;

  if (pathname === '/api/assets/upload' && request.method === 'POST') {
    let body;
    try {
      body = await readBoundedJson(request);
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON payload.' });
    }

    const ALLOWED_ASSET_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/x-icon'];
    const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;

    const key = typeof body?.key === 'string' ? body.key.replace(/^\/+/, '') : `asset_${Date.now()}`;
    const dataUrl = typeof body?.dataUrl === 'string' ? body.dataUrl : '';
    const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : 'image/png';

    if (!dataUrl) {
      return jsonResponse(400, { error: 'dataUrl is required.' });
    }
    if (!SAFE_KEY.test(key)) {
      return jsonResponse(400, { error: 'Invalid asset key: use letters, digits, dots, dashes or underscores.' });
    }
    if (!ALLOWED_ASSET_TYPES.includes(mimeType)) {
      return jsonResponse(400, { error: `Unsupported content type "${mimeType}".` });
    }
    // The data URL must be a base64 data URL whose declared image type matches
    // the stored content type; arbitrary bytes are never stored as-is.
    const expectedPrefix = `data:${mimeType};base64,`;
    if (!dataUrl.startsWith(expectedPrefix)) {
      return jsonResponse(400, { error: 'dataUrl must be a base64 data URL matching the declared content type.' });
    }

    let bytes;
    try {
      const parts = dataUrl.split(',');
      const bstr = atob(parts[1] || '');
      // Cap the decoded payload: the bounded JSON body could still carry an
      // ~18 MB image, and unbounded decoded sizes would let one client fill
      // the bucket and every future read of this object.
      if (bstr.length > MAX_ASSET_DECODED_BYTES) {
        return jsonResponse(413, { error: 'Uploaded asset exceeds the size limit.' });
      }
      const u8arr = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) {
        u8arr[i] = bstr.charCodeAt(i);
      }
      bytes = u8arr.buffer;
    } catch {
      return jsonResponse(400, { error: 'Invalid base64 payload.' });
    }

    await env.ASSET_BUCKET.put(key, bytes, {
      httpMetadata: { contentType: mimeType }
    });

    return jsonResponse(200, {
      success: true,
      key,
      url: `/api/assets/${key}`
    });
  }

  if (request.method === 'GET' && pathname.startsWith('/api/assets/')) {
    const key = decodePathSegment(pathname.replace('/api/assets/', ''));
    if (!key || !SAFE_STORAGE_SEGMENT.test(key)) {
      return jsonResponse(400, { error: 'Invalid asset key.' });
    }

    const object = await env.ASSET_BUCKET.get(key);
    if (!object) {
      return jsonResponse(404, { error: 'Asset not found in R2 bucket.' });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('Referrer-Policy', 'no-referrer');
    // SVG can carry <script>; sandbox it so it never executes as a document.
    if ((headers.get('content-type') || '').includes('svg')) {
      headers.set('Content-Security-Policy', "sandbox; default-src 'none'");
    }

    return new Response(object.body, { headers });
  }

  if (request.method === 'DELETE' && pathname.startsWith('/api/assets/')) {
    const key = decodePathSegment(pathname.replace('/api/assets/', ''));
    if (!key || !SAFE_STORAGE_SEGMENT.test(key)) {
      return jsonResponse(400, { error: 'Invalid asset key.' });
    }

    await env.ASSET_BUCKET.delete(key);
    return jsonResponse(200, { success: true, deletedKey: key });
  }

  return jsonResponse(405, { error: 'Method not allowed.' });
}

async function handleR2Apps(request, env) {
  if (!env?.ASSET_BUCKET) {
    return jsonResponse(530, { error: 'R2 storage (ASSET_BUCKET) is not configured.' });
  }

  const url = new URL(request.url);
  const pathname = url.pathname;

  // 1. POST /api/apps/store - Store or update an app under a session
  if (pathname === '/api/apps/store' && request.method === 'POST') {
    let body;
    try {
      body = await readBoundedJson(request);
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON payload.' });
    }

    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
    const appId = typeof body?.appId === 'string' ? body.appId.trim() : `app_${Date.now()}`;
    const title = typeof body?.title === 'string' ? body.title : 'Untitled Application';
    const code = typeof body?.code === 'string' ? body.code : '';
    const html = typeof body?.html === 'string' ? body.html : '';

    if (!sessionId) {
      return jsonResponse(400, { error: 'sessionId is required.' });
    }
    if (!SAFE_STORAGE_SEGMENT.test(sessionId)) {
      return jsonResponse(400, { error: 'Invalid sessionId: use letters, digits, dots, dashes or underscores.' });
    }
    if (!SAFE_STORAGE_SEGMENT.test(appId)) {
      return jsonResponse(400, { error: 'Invalid appId: use letters, digits, dots, dashes or underscores.' });
    }
    if (!code && !html) {
      return jsonResponse(400, { error: 'code or html content is required.' });
    }

    const appRecord = {
      sessionId,
      appId,
      title,
      code,
      html,
      updatedAt: new Date().toISOString(),
      metadata: body?.metadata || {}
    };

    const key = `apps/${sessionId}/${appId}.json`;
    await env.ASSET_BUCKET.put(key, JSON.stringify(appRecord), {
      httpMetadata: { contentType: 'application/json' }
    });

    return jsonResponse(200, {
      success: true,
      sessionId,
      appId,
      key,
      url: `/api/apps/${sessionId}/${appId}`
    });
  }

  // 2. GET /api/apps/:sessionId/:appId - Fetch a specific app
  if (request.method === 'GET' && pathname.match(/^\/api\/apps\/[^/]+\/[^/]+$/)) {
    const parts = pathname.replace('/api/apps/', '').split('/');
    const sessionId = decodePathSegment(parts[0]);
    const appId = decodePathSegment(parts[1]);
    if (sessionId === null || appId === null || !SAFE_STORAGE_SEGMENT.test(sessionId) || !SAFE_STORAGE_SEGMENT.test(appId)) {
      return jsonResponse(400, { error: 'Invalid path segment.' });
    }

    const key = `apps/${sessionId}/${appId}.json`;
    const object = await env.ASSET_BUCKET.get(key);
    if (!object) {
      return jsonResponse(404, { error: 'App not found in R2 storage.' });
    }

    const text = await object.text();
    let appData;
    try {
      appData = JSON.parse(text);
    } catch {
      return jsonResponse(500, { error: 'Failed to parse stored app payload.' });
    }

    if (url.searchParams.get('format') === 'html') {
      // Same originless-sandbox rendering contract as published creations.
      return new Response(appData.html || appData.code, {
        headers: publishedPageHeaders()
      });
    }

    return jsonResponse(200, appData);
  }

  // 3. GET /api/apps/:sessionId - List all apps stored for a chat session
  if (request.method === 'GET' && pathname.match(/^\/api\/apps\/[^/]+$/)) {
    const sessionId = decodePathSegment(pathname.replace('/api/apps/', ''));
    if (sessionId === null || !SAFE_STORAGE_SEGMENT.test(sessionId)) {
      return jsonResponse(400, { error: 'Invalid session id in path.' });
    }
    const prefix = `apps/${sessionId}/`;
    const list = await env.ASSET_BUCKET.list({ prefix });

    const apps = [];
    if (list && Array.isArray(list.objects)) {
      const jsonObjects = list.objects.filter(obj => obj.key.endsWith('.json'));
      const items = await Promise.all(jsonObjects.map(obj => env.ASSET_BUCKET.get(obj.key)));
      for (const item of items) {
        if (item) {
          try {
            const data = JSON.parse(await item.text());
            apps.push({
              appId: data.appId,
              title: data.title,
              updatedAt: data.updatedAt,
              url: `/api/apps/${sessionId}/${data.appId}`
            });
          } catch { /* ignore invalid cache entries */ }
        }
      }
    }

    return jsonResponse(200, { sessionId, apps });
  }

  // 4. DELETE /api/apps/:sessionId/:appId - Delete a specific app
  if (request.method === 'DELETE' && pathname.match(/^\/api\/apps\/[^/]+\/[^/]+$/)) {
    const parts = pathname.replace('/api/apps/', '').split('/');
    const sessionId = decodePathSegment(parts[0]);
    const appId = decodePathSegment(parts[1]);
    if (sessionId === null || appId === null || !SAFE_STORAGE_SEGMENT.test(sessionId) || !SAFE_STORAGE_SEGMENT.test(appId)) {
      return jsonResponse(400, { error: 'Invalid path segment.' });
    }

    const key = `apps/${sessionId}/${appId}.json`;
    await env.ASSET_BUCKET.delete(key);
    return jsonResponse(200, { success: true, sessionId, appId });
  }

  // 5. DELETE /api/apps/:sessionId - Delete ALL apps associated with a chat session
  if (request.method === 'DELETE' && pathname.match(/^\/api\/apps\/[^/]+$/)) {
    const sessionId = decodePathSegment(pathname.replace('/api/apps/', ''));
    if (sessionId === null || !SAFE_STORAGE_SEGMENT.test(sessionId)) {
      return jsonResponse(400, { error: 'Invalid session id in path.' });
    }
    const prefix = `apps/${sessionId}/`;
    const list = await env.ASSET_BUCKET.list({ prefix });

    let count = 0;
    if (list && Array.isArray(list.objects)) {
      for (const obj of list.objects) {
        await env.ASSET_BUCKET.delete(obj.key);
        count++;
      }
    }

    return jsonResponse(200, { success: true, sessionId, deletedCount: count });
  }

  return jsonResponse(405, { error: 'Method not allowed.' });
}

function publicMemoryRecord(record) {
  if (!record || typeof record !== 'object') return record;
  const publicRecord = { ...record };
  // Embeddings are server-side only: never expose raw vectors to clients.
  delete publicRecord.embedding;
  delete publicRecord.embeddingModel;
  return publicRecord;
}

function decodePathSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

async function handleR2Memory(request, env) {
  if (!env?.ASSET_BUCKET) {
    return jsonResponse(530, { error: 'R2 storage (ASSET_BUCKET) is not configured.' });
  }

  const url = new URL(request.url);
  const pathname = url.pathname;

  // 1. POST /api/memory/store - Store or update a memory entry
  if (pathname === '/api/memory/store' && request.method === 'POST') {
    let body;
    try {
      body = await readBoundedJson(request);
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON payload.' });
    }

    const userId = typeof body?.userId === 'string' ? body.userId.trim() : 'default_user';
    const keyName = typeof body?.key === 'string' ? body.key.trim() : `mem_${Date.now()}`;
    const category = typeof body?.category === 'string' ? body.category.trim() : 'general';
    const text = typeof body?.text === 'string' ? body.text : (typeof body?.value === 'string' ? body.value : '');

    if (!text) {
      return jsonResponse(400, { error: 'text or value content is required for memory storage.' });
    }
    if (!SAFE_STORAGE_SEGMENT.test(userId)) {
      return jsonResponse(400, { error: 'Invalid userId: use letters, digits, dots, dashes or underscores.' });
    }
    if (!SAFE_STORAGE_SEGMENT.test(keyName)) {
      return jsonResponse(400, { error: 'Invalid memory key: use letters, digits, dots, dashes or underscores.' });
    }

    const now = new Date().toISOString();
    const memoryRecord = {
      userId,
      key: keyName,
      category,
      text,
      metadata: body?.metadata || {},
      tags: Array.isArray(body?.tags) ? body.tags : [],
      updatedAt: now,
      createdAt: body?.createdAt || now
    };

    const key = `memory/${userId}/${keyName}.json`;
    await env.ASSET_BUCKET.put(key, JSON.stringify(memoryRecord), {
      httpMetadata: { contentType: 'application/json' }
    });

    return jsonResponse(200, {
      success: true,
      userId,
      key: keyName,
      r2Key: key,
      embeddingStored: false,
      record: publicMemoryRecord(memoryRecord)
    });
  }

  // 2. POST /api/memory/search - Search relevant memories
  if (pathname === '/api/memory/search' && request.method === 'POST') {
    let body;
    try {
      body = await readBoundedJson(request);
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON payload.' });
    }

    const userId = typeof body?.userId === 'string' ? body.userId.trim() : 'default_user';
    const query = typeof body?.query === 'string' ? body.query.trim().toLowerCase() : '';
    const categoryFilter = typeof body?.category === 'string' ? body.category.trim().toLowerCase() : '';

    if (!SAFE_STORAGE_SEGMENT.test(userId)) {
      return jsonResponse(400, { error: 'Invalid userId: use letters, digits, dots, dashes or underscores.' });
    }

    const prefix = `memory/${userId}/`;
    const list = await env.ASSET_BUCKET.list({ prefix });

    const matches = [];
    if (list && Array.isArray(list.objects)) {
      const jsonObjects = list.objects.filter(obj => obj.key.endsWith('.json'));
      const items = await Promise.all(jsonObjects.map(obj => env.ASSET_BUCKET.get(obj.key)));
      for (const item of items) {
        if (item) {
          try {
            const data = JSON.parse(await item.text());
            const catLower = String(data.category || '').toLowerCase();

            if (!categoryFilter || catLower === categoryFilter) {
              matches.push(data);
            }
          } catch {
            /* ignore invalid cache entries */
          }
        }
      }
    }

    if (!query) {
      const publicMatches = matches.map(publicMemoryRecord);
      return jsonResponse(200, { userId, query, matches: publicMatches, source: 'keyword' });
    }

    const keywordMatches = matches.filter(m => {
      const textLower = String(m.text || '').toLowerCase();
      const keyLower = String(m.key || '').toLowerCase();
      const catLower = String(m.category || '').toLowerCase();
      return textLower.includes(query) || keyLower.includes(query) || catLower.includes(query);
    }).map(publicMemoryRecord);

    return jsonResponse(200, { userId, query, matches: keywordMatches, source: 'keyword' });
  }

  // 3. GET /api/memory/:userId - List all memories for a user
  if (request.method === 'GET' && pathname.match(/^\/api\/memory\/[^/]+$/)) {
    const encodedUserId = pathname.replace('/api/memory/', '');
    const userId = decodePathSegment(encodedUserId);
    if (userId === null || !SAFE_STORAGE_SEGMENT.test(userId)) {
      return jsonResponse(400, { error: 'Invalid user id in path.' });
    }
    const prefix = `memory/${userId}/`;
    const list = await env.ASSET_BUCKET.list({ prefix });

    const memories = [];
    if (list && Array.isArray(list.objects)) {
      const jsonObjects = list.objects.filter(obj => obj.key.endsWith('.json'));
      const items = await Promise.all(jsonObjects.map(obj => env.ASSET_BUCKET.get(obj.key)));
      for (const item of items) {
        if (item) {
          try {
            const data = JSON.parse(await item.text());
            memories.push(publicMemoryRecord(data));
          } catch {
            /* ignore invalid cache entries */
          }
        }
      }
    }

    return jsonResponse(200, { userId, memories });
  }

  // 4. DELETE /api/memory/:userId/:key - Delete a memory
  if (request.method === 'DELETE' && pathname.match(/^\/api\/memory\/[^/]+\/[^/]+$/)) {
    const parts = pathname.replace('/api/memory/', '').split('/');
    const userId = decodePathSegment(parts[0]);
    const keyName = decodePathSegment(parts[1]);
    if (userId === null || keyName === null || !SAFE_STORAGE_SEGMENT.test(userId) || !SAFE_STORAGE_SEGMENT.test(keyName)) {
      return jsonResponse(400, { error: 'Invalid path segment.' });
    }

    const key = `memory/${userId}/${keyName}.json`;
    await env.ASSET_BUCKET.delete(key);
    return jsonResponse(200, { success: true, userId, key: keyName });
  }

  return jsonResponse(405, { error: 'Method not allowed.' });
}

function publishedPageHeaders() {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    // Published creations are AI-generated user content: render them in an
    // originless sandbox (no cookies, storage, or same-origin access) but
    // let the app itself run exactly like the in-app preview — inline
    // scripts/styles, CDN libraries, embedded images/fonts, and external
    // links (popups escape the sandbox so links open in real tabs).
    'Content-Security-Policy': "sandbox allow-scripts allow-forms allow-pointer-lock allow-popups allow-popups-to-escape-sandbox; default-src 'none'; script-src 'unsafe-inline' https:; style-src 'unsafe-inline' https:; img-src data: https: blob:; font-src data: https:; media-src data: https: blob:; connect-src https:"
  };
}

// Published links are public shareable URLs backed by R2 storage: bound the
// creation rate per client so the store cannot be spammed with slugs.
const publishRateLimiter = createRateLimiter({ windowMs: 60_000, limit: 10 });

// Paid image generations are expensive (provider cost + R2 writes): bound
// them per client like every other costly endpoint.
const imageRateLimiter = createRateLimiter({ windowMs: 60_000, limit: 30 });

async function handlePublish(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // POST /api/publish - publish (or republish under an explicit slug) a
  // creation so anyone with the link can open it.
  if (pathname === '/api/publish' && request.method === 'POST') {
    const retryAfter = publishRateLimiter(request);
    if (retryAfter !== null) {
      return jsonResponse(429, { error: 'Too many publish requests. Try again shortly.' }, { 'Retry-After': String(retryAfter) });
    }
    let body;
    try {
      body = await readBoundedJson(request);
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON payload.' });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      body = {};
    }

    const html = typeof body?.html === 'string' && body.html.trim()
      ? body.html.trim()
      : (typeof body?.code === 'string' && body.code.trim() ? body.code.trim() : '');
    if (!html) {
      return jsonResponse(400, { error: 'html or code content is required to publish.' });
    }
    if (html.length > 2 * 1024 * 1024) {
      return jsonResponse(400, { error: 'Published content is too large.' });
    }
    if (!env?.ASSET_BUCKET) {
      return jsonResponse(530, { error: 'R2 storage (ASSET_BUCKET) is not configured.' });
    }

    const title = typeof body?.title === 'string' ? body.title.slice(0, 120) : 'Untitled Application';

    // Optional multi-page payload: a map of validated page names to their
    // full formatted HTML documents. Every name is validated, the count and
    // total size are bounded, and the home html + pages share one 2 MB cap.
    const pages = {};
    if (body?.pages && typeof body.pages === 'object' && !Array.isArray(body.pages)) {
      let pagesTotal = html.length;
      for (const [pageName, pageHtml] of Object.entries(body.pages)) {
        if (pagesTotal >= 2 * 1024 * 1024) break;
        if (!PUBLISH_PAGE_NAME_PATTERN.test(pageName)) continue;
        if (typeof pageHtml !== 'string' || !pageHtml.trim()) continue;
        const pageContent = pageHtml.trim();
        pagesTotal += pageContent.length;
        if (pagesTotal > 2 * 1024 * 1024) break;
        if (Object.keys(pages).length >= MAX_PUBLISH_PAGES) break;
        pages[pageName] = pageContent;
      }
    }

    const rawRequestedSlug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : null;
    let slug = null;

    if (rawRequestedSlug) {
      if (!PUBLISH_SLUG_PATTERN.test(rawRequestedSlug) || rawRequestedSlug.includes('--')) {
        return jsonResponse(400, { error: 'Slug must be 3-50 characters with lowercase letters, numbers, and single hyphens.' });
      }
      if (RESERVED_SLUGS.has(rawRequestedSlug)) {
        return jsonResponse(400, { error: `The slug "${rawRequestedSlug}" is reserved. Please choose a different URL.` });
      }

      // Check collision / ownership
      const existingObject = await env.ASSET_BUCKET.get(`publish/${rawRequestedSlug}.json`);
      if (existingObject && body?.previousSlug && body.previousSlug !== rawRequestedSlug) {
        return jsonResponse(409, { error: `The slug "${rawRequestedSlug}" is already taken. Please choose a different URL.` });
      }
      slug = rawRequestedSlug;
    } else {
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generatePublishSlug();
        const existing = await env.ASSET_BUCKET.get(`publish/${candidate}.json`);
        if (!existing) {
          slug = candidate;
          break;
        }
      }
    }
    if (!slug) {
      return jsonResponse(503, { error: 'Could not allocate a unique publish slug. Try again.' });
    }

    const record = {
      slug,
      title,
      html,
      createdAt: new Date().toISOString()
    };
    if (Object.keys(pages).length > 0) {
      record.pages = pages;
    }

    // Clean up previous slug if renamed
    if (body?.previousSlug && body.previousSlug !== slug && PUBLISH_SLUG_PATTERN.test(body.previousSlug)) {
      try {
        await env.ASSET_BUCKET.delete(`publish/${body.previousSlug}.json`);
      } catch {
        // ignore
      }
    }

    await env.ASSET_BUCKET.put(`publish/${slug}.json`, JSON.stringify(record), {
      httpMetadata: { contentType: 'application/json' }
    });

    return jsonResponse(200, { success: true, slug, url: `/${slug}` });
  }

  // GET /<slug>/<page>.html - serve one page of a published multi-page
  // creation. Same sandbox headers as the home page plus a CORS allow-origin
  // header: sandboxed pages run with an opaque origin, so their internal
  // fetch-swap navigation is a cross-origin request.
  if (request.method === 'GET') {
    const pageMatch = pathname.slice(1).match(PUBLISH_PAGE_PATTERN);
    if (pageMatch) {
      if (!env?.ASSET_BUCKET) {
        return jsonResponse(530, { error: 'R2 storage (ASSET_BUCKET) is not configured.' });
      }
      const [, slug, pageName] = pageMatch;
      const object = await env.ASSET_BUCKET.get(`publish/${slug}.json`);
      if (!object) {
        return jsonResponse(404, { error: 'Published creation not found.' });
      }
      let record;
      try {
        record = JSON.parse(await object.text());
      } catch {
        return jsonResponse(500, { error: 'Failed to parse published payload.' });
      }
      const pageHtml = typeof record?.pages?.[pageName] === 'string' ? record.pages[pageName] : '';
      if (!pageHtml) {
        return jsonResponse(404, { error: 'Published page not found.' });
      }
      return new Response(pageHtml, {
        headers: { ...publishedPageHeaders(), 'Access-Control-Allow-Origin': '*' }
      });
    }
  }

  // GET /<slug>/ - serve the home page at a trailing-slash URL. Relative
  // sub-page links inside the document then resolve to /<slug>/<page>.html —
  // for both the router's fetch-swap and plain browser navigation (middle
  // click, direct visit) — instead of falling to the site root.
  if (request.method === 'GET') {
    const slugRootMatch = pathname.match(PUBLISH_SLUG_ROOT_PATTERN);
    if (slugRootMatch) {
      if (!env?.ASSET_BUCKET) {
        return jsonResponse(530, { error: 'R2 storage (ASSET_BUCKET) is not configured.' });
      }
      const slug = slugRootMatch[1];
      const object = await env.ASSET_BUCKET.get(`publish/${slug}.json`);
      if (!object) {
        return jsonResponse(404, { error: 'Published creation not found.' });
      }
      let record;
      try {
        record = JSON.parse(await object.text());
      } catch {
        return jsonResponse(500, { error: 'Failed to parse published payload.' });
      }
      const html = typeof record?.html === 'string' ? record.html : '';
      if (!html) {
        return jsonResponse(404, { error: 'Published creation not found.' });
      }
      return new Response(html, { headers: publishedPageHeaders() });
    }
  }

  // GET /<slug> - serve a published creation to anyone (bare root path).
  // Multi-page creations redirect to /<slug>/ so their relative links keep
  // resolving inside the slug directory; single-page creations (no pages map)
  // are served directly since they contain no internal .html navigation.
  if (request.method === 'GET' && !RESERVED_SLUGS.has(pathname.slice(1)) && PUBLISH_SLUG_PATTERN.test(pathname.slice(1))) {
    if (!env?.ASSET_BUCKET) {
      return typeof env.ASSETS?.fetch === 'function' ? env.ASSETS.fetch(request) : jsonResponse(530, { error: 'R2 storage (ASSET_BUCKET) is not configured.' });
    }
    const slug = pathname.slice(1);
    const object = await env.ASSET_BUCKET.get(`publish/${slug}.json`);
    if (!object) {
      if (GENERATED_SLUG_PATTERN.test(slug)) {
        return jsonResponse(404, { error: 'Published creation not found.' });
      }
      return typeof env.ASSETS?.fetch === 'function' ? env.ASSETS.fetch(request) : jsonResponse(404, { error: 'Published creation not found.' });
    }
    let record;
    try {
      record = JSON.parse(await object.text());
    } catch {
      return jsonResponse(500, { error: 'Failed to parse published payload.' });
    }
    if (record?.pages && typeof record.pages === 'object' && Object.keys(record.pages).length > 0) {
      return new Response(null, {
        status: 301,
        headers: { Location: `/${slug}/` }
      });
    }
    const html = typeof record?.html === 'string' ? record.html : '';
    if (!html) {
      return jsonResponse(404, { error: 'Published creation not found.' });
    }
    return new Response(html, { headers: publishedPageHeaders() });
  }

  return jsonResponse(405, { error: 'Method not allowed.' });
}

async function runJsonSafe(operation) {
  try {
    return await operation();
  } catch (err) {
    console.error('Storage handler error:', safeErrorDetail(err));
    return jsonResponse(500, { error: 'Storage operation failed.' });
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    const pathname = new URL(request.url).pathname;
    if (pathname === '/api/ai') {
      return handleAi(request, env);
    }
    if (pathname === '/api/image') {
      return handleImage(request, env);
    }
    if (pathname === '/api/image/cf') {
      return handleWorkersAIImage(request, env);
    }
    if (pathname === '/api/search') {
      return handleSearch(request, env);
    }
    if (pathname === '/api/rerank') {
      return handleRerank(request, env);
    }
    if (pathname === '/api/embed') {
      return handleEmbed(request, env);
    }
    if (pathname === '/api/inspiration') {
      return handleInspiration(request, env);
    }
    if (pathname.startsWith('/api/assets')) {
      return runJsonSafe(() => handleR2Assets(request, env));
    }
    if (pathname.startsWith('/api/apps')) {
      return runJsonSafe(() => handleR2Apps(request, env));
    }
    if (pathname.startsWith('/api/memory')) {
      return runJsonSafe(() => handleR2Memory(request, env));
    }
    if (pathname === '/api/publish' ||
        (request.method === 'GET' &&
          !RESERVED_SLUGS.has(pathname.slice(1)) &&
          (PUBLISH_SLUG_PATTERN.test(pathname.slice(1)) ||
            PUBLISH_PAGE_PATTERN.test(pathname.slice(1)) ||
            PUBLISH_SLUG_ROOT_PATTERN.test(pathname)))) {
      return runJsonSafe(() => handlePublish(request, env));
    }
    if (pathname.startsWith('/api/game/ws/')) {
      return runJsonSafe(() => handleGameSocket(request, env));
    }
    if (pathname.startsWith('/api/')) {
      return jsonResponse(404, { error: 'API route not found.' });
    }
    return typeof env.ASSETS?.fetch === 'function' ? env.ASSETS.fetch(request) : jsonResponse(503, { error: 'Static assets not configured.' });
  }
};
