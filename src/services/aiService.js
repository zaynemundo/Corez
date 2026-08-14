// Corez AI Service Engine - Universal Public Conversational Engine

export const MODEL = {
  id: 'corez',
  name: 'Corez AI',
  description: 'Minimalist AI assistant for concise conversation, reasoning, and live app creation.'
};

export const AI_PROXY_ENDPOINT = '/api/ai';
const AI_WAF_FALLBACK_ENDPOINT = 'https://chat.zayne-mayo.workers.dev/api/ai';
const CLOUDFLARE_CHALLENGE_PATTERN = /Just a moment|challenge-platform|__cf_chl_/i;
export const IMAGE_PROXY_ENDPOINT = '/api/image';

import { defaultSkillRegistry } from '../skills/registry.js';
import { classifyIntent } from './intentClassifier.js';
import { process as processPromptIntelligence, toLegacyIntentType, classifyIntent as classifyIntentNew, extractRequirements, classifyComplexity } from './promptIntelligence/index.js';

import { createIntentContract } from './promptIntelligence/intentContract.js';
import { evaluateResponse, repairResponse, recordQualitySignal } from './reflectionEngine.js';
import { buildAwwwardsDesignPrompt } from '../../packages/agent-core/context/designTokens.js';
import { resolveSkills } from '../skills/resolver.js';
import { classifyExecutionMode } from './executionModes.js';
import { persistAndSummarize } from './contextStore.js';
import { fetchWebSearch } from './searchService.js';
import { fetchAwwwardsInspiration } from './inspirationService.js';
import { synthesizePdfDocumentHtml } from './pdfGenerator.js';

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


const GAME_DEV_PATTERNS = /\b(game|gamedev|game development|play|chess|snake|pong|shooter|arcade|platformer|canvas game|2d game|3d game|simulator|physics sandbox|bot enemy|rpg|enemy|space defender|retro game|interactive game)\b|\b(build|make|create|develop|design)\b.*\b(game|simulator|simulation|sandbox)\b/i;

export function isGameDevIntent(prompt) {
  if (!prompt) return false;
  return GAME_DEV_PATTERNS.test(prompt);
}

const INTENT_PATTERNS = {
  app: /\b(build|make|create|generate|design|launch|prototype|develop|ship)\b.*\b(app|tool|website|site|landing page|dashboard|portal|widget|calculator|timer|game|simulator|preview|html|bot|enemy)\b|\b(app|tool|website|site|landing page|dashboard|portal|widget|calculator|timer|game|simulator|bot|enemy)\b.*\b(build|make|create|generate|design|launch|prototype|develop|ship)\b|\b(game|play|chess|snake|pong|shooter|quiz|puzzle|simulator|canvas|bot|enemy)\b/i,
  code: /\b(code|debug|bug|fix|error|javascript|typescript|python|react|css|html|component|function|api|compile|stack trace)\b/i,
  writing: /\b(write|rewrite|copy|caption|email|post|bio|headline|script|summarize|summary|proposal|description|landing copy)\b/i,
  explanation: /\b(explain|what is|what are|how does|why does|teach me|break down|understand|compare)\b/i
};



function analyzeIntentWithRules(cleanPrompt) {
  const lower = cleanPrompt.toLowerCase();

  if (INTENT_PATTERNS.app.test(cleanPrompt)) {
    return {
      type: 'app',
      summary: 'Create a public-facing interactive experience or web tool.',
      responseStrategy: 'Build a runnable monochrome HTML preview when enough intent is present.'
    };
  }

  if (INTENT_PATTERNS.code.test(cleanPrompt)) {
    return {
      type: 'code-help',
      summary: 'Help the user understand, debug, or improve code.',
      responseStrategy: 'Ask for the relevant snippet when the code is missing; otherwise explain the fix clearly.'
    };
  }

  if (INTENT_PATTERNS.writing.test(cleanPrompt)) {
    return {
      type: 'writing',
      summary: 'Help the user shape public-facing words or content.',
      responseStrategy: 'Offer a concise draft or rewrite with a clear tone.'
    };
  }

  if (INTENT_PATTERNS.explanation.test(lower)) {
    return {
      type: 'explanation',
      summary: 'Explain the topic in plain language.',
      responseStrategy: 'Give a direct answer with the minimum useful context.'
    };
  }

  return {
    type: 'general',
    summary: 'Understand the public user goal and give a useful next step.',
    responseStrategy: 'Clarify the likely intent, answer directly, and invite the next concrete detail.'
  };
}

export function analyzePublicUserIntent(prompt) {
  const cleanPrompt = prompt ? prompt.trim() : '';

  if (!cleanPrompt) {
    return {
      type: 'general',
      summary: 'Understand the public user goal and give a useful next step.',
      responseStrategy: 'Clarify the likely intent, answer directly, and invite the next concrete detail.',
      confidence: 0,
      source: 'default'
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

  const modelWins = Boolean(modelResult?.accepted)
    && (!newIntent || modelResult.confidence >= (newIntent.confidence || 0));

  // If the new engine has a high-confidence classification, map it to legacy types
  if (!modelWins && newIntent && newIntent.confidence >= 0.5 && newIntent.type !== 'unknown') {
    const legacyType = toLegacyIntentType(newIntent.type);
    const summaries = {
      'app': 'Create a public-facing interactive experience or web tool.',
      'code-help': 'Help the user understand, debug, or improve code.',
      'writing': 'Help the user shape public-facing words or content.',
      'explanation': 'Explain the topic in plain language.',
      'general': 'Understand the public user goal and give a useful next step.',
    };
    const strategies = {
      'app': 'Build a runnable monochrome HTML preview when enough intent is present.',
      'code-help': 'Ask for the relevant snippet when the code is missing; otherwise explain the fix clearly.',
      'writing': 'Offer a concise draft or rewrite with a clear tone.',
      'explanation': 'Give a direct answer with the minimum useful context.',
      'general': 'Clarify the likely intent, answer directly, and invite the next concrete detail.',
    };

    return {
      type: legacyType,
      summary: summaries[legacyType] || summaries.general,
      responseStrategy: strategies[legacyType] || strategies.general,
      confidence: newIntent.confidence,
      source: 'prompt-intelligence',
      enriched: {
        fineType: newIntent.type,
        goal: newIntent.goal,
        domain: newIntent.domain,
        complexity: newIntent.complexity,
      },
    };
  }

  if (modelResult && modelResult.accepted) {
    switch (modelResult.label) {
      case 'app':
        return {
          type: 'app',
          summary: 'Create a public-facing interactive experience or web tool.',
          responseStrategy: 'Build a runnable monochrome HTML preview when enough intent is present.',
          confidence: modelResult.confidence,
          source: 'model'
        };
      case 'code-help':
        return {
          type: 'code-help',
          summary: 'Help the user understand, debug, or improve code.',
          responseStrategy: 'Ask for the relevant snippet when the code is missing; otherwise explain the fix clearly.',
          confidence: modelResult.confidence,
          source: 'model'
        };
      case 'writing':
        return {
          type: 'writing',
          summary: 'Help the user shape public-facing words or content.',
          responseStrategy: 'Offer a concise draft or rewrite with a clear tone.',
          confidence: modelResult.confidence,
          source: 'model'
        };
      case 'explanation':
        return {
          type: 'explanation',
          summary: 'Explain the topic in plain language.',
          responseStrategy: 'Give a direct answer with the minimum useful context.',
          confidence: modelResult.confidence,
          source: 'model'
        };
      case 'general':
      default:
        return {
          type: 'general',
          summary: 'Understand the public user goal and give a useful next step.',
          responseStrategy: 'Clarify the likely intent, answer directly, and invite the next concrete detail.',
          confidence: modelResult.confidence,
          source: 'model'
        };
    }
  }

  const ruleResult = analyzeIntentWithRules(cleanPrompt);
  return {
    ...ruleResult,
    confidence: modelResult?.confidence ?? 0,
    source: 'rules'
  };
}

export function createFallbackSvgDataUrl(prompt) {
  const cleanPrompt = (prompt || '8-Bit Asset').slice(0, 40);
  const lower = cleanPrompt.toLowerCase();

  let spriteType = 'badge';
  if (lower.includes('sword') || lower.includes('blade') || lower.includes('weapon')) spriteType = 'sword';
  else if (lower.includes('shield') || lower.includes('armor') || lower.includes('defense')) spriteType = 'shield';
  else if (lower.includes('potion') || lower.includes('flask') || lower.includes('magic') || lower.includes('elixir')) spriteType = 'potion';
  else if (lower.includes('chest') || lower.includes('crate') || lower.includes('treasure') || lower.includes('loot')) spriteType = 'chest';
  else if (lower.includes('knight') || lower.includes('hero') || lower.includes('character') || lower.includes('player')) spriteType = 'hero';
  else if (lower.includes('monster') || lower.includes('enemy') || lower.includes('skull') || lower.includes('boss')) spriteType = 'monster';
  else if (lower.includes('gem') || lower.includes('star') || lower.includes('coin') || lower.includes('crystal')) spriteType = 'gem';

  const colorMap = {
    '.': null,
    'B': '#12121e', // Dark Outline
    'W': '#ffffff', // White Highlight
    'G': '#f1fa8c', // Gold
    'R': '#ff5555', // Red
    'C': '#8be9fd', // Cyan
    'P': '#bd93f9', // Purple
    'S': '#f8f8f2', // Silver
    'O': '#ffb86c', // Orange
    'K': '#6272a4', // Dark Steel
    'E': '#50fa7b', // Emerald
    'D': '#44475a', // Dark Wood
    'M': '#ff79c6'  // Magenta
  };

  const spriteMatrices = {
    sword: [
      '................',
      '...............W',
      '..............WS',
      '.............WSK',
      '............WSK.',
      '...........WSK..',
      '..........WSK...',
      '.........WSK....',
      '........WSK.....',
      '..M...M.SK......',
      '..MMM.MKK.......',
      '...MMMMK........',
      '....MMMD........',
      '...D..D.........',
      '..D.............',
      '................'
    ],
    shield: [
      '................',
      '.BBBBBBBBBBBBBB.',
      '.BWWWWWWWWWWWWB.',
      '.BWGGGGGGGGGGWB.',
      '.BWGPPBBPPEGGWB.',
      '.BWGPPPPPEEGGWB.',
      '.BWGPEEEEEEGGWB.',
      '.BWGPEEEEEEGGWB.',
      '..BWGPEEEEGGWB..',
      '...BWGPEEEGGWB..',
      '....BWGPEEGGB...',
      '.....BWGPEGB....',
      '......BWGPEB....',
      '.......BWGB.....',
      '........BBB.....',
      '................'
    ],
    potion: [
      '................',
      '......DDDD......',
      '......DGGGD.....',
      '......DDDD......',
      '.......BB.......',
      '......BCCB......',
      '.....BCCCCCCB...',
      '....BCCCCCCB....',
      '...BCCCCWWCCB...',
      '...BCCCCWWCCB...',
      '...BCCCCWWCCB...',
      '...BCCCCWWCCB...',
      '...BCCCCWWCCB...',
      '....BCCCCCCB....',
      '.....BBBBBB.....',
      '................'
    ],
    chest: [
      '................',
      '..BBBBBBBBBBBB..',
      '.BDDDDDDDDDDDDB.',
      '.BDDGGGGGGGGDDB.',
      '.BDDDDDDDDDDDDB.',
      '.BBBBBBBBBBBBBB.',
      '.BDDDDDGGDDDDDB.',
      '.BDDDDDBBDDDDDB.',
      '.BDDDDDBGDDDDDB.',
      '.BDDDDDBGDDDDDB.',
      '.BDDDDDGGDDDDDB.',
      '.BDDDDDDDDDDDDB.',
      '.BDDGGGGGGGGDDB.',
      '..BBBBBBBBBBBB..',
      '................'
    ],
    hero: [
      '................',
      '......RRRR......',
      '.....RRRRRR.....',
      '......BBBB......',
      '.....BSSSSB.....',
      '.....BSWWSB.....',
      '.....BSSSSB.....',
      '....BBBBBBBB....',
      '...BKKKKKKKKB...',
      '..BKKKSSSSKKKB..',
      '..BKKKSSSSKKKB..',
      '..BKKKSSSSKKKB..',
      '...BKKKKKKKKB...',
      '....BSSSSSSB....',
      '....BSS..SSB....',
      '....BB....BB....'
    ],
    monster: [
      '................',
      '.....BBBBBB.....',
      '....BWWWWWWB....',
      '...BWWWWWWWWB...',
      '...BWWRRWWRRB...',
      '...BWWRRWWRRB...',
      '...BWWWWWWWWB...',
      '....BWWBBWWB....',
      '....BWWBBWWB....',
      '.....BBBBBB.....',
      '....BWWWWWWB....',
      '....BWBBBBWB....',
      '....BWWWWWWB....',
      '.....BBBBBB.....',
      '................'
    ],
    gem: [
      '................',
      '.......WW.......',
      '......WGGW......',
      '.....WGGGGW.....',
      '....WGGGGGGW....',
      '...WGGGGGGGGW...',
      '..WGGGGWWGGGGW..',
      '.WGGGGGWWGGGGGW.',
      '..WGGGGWWGGGGW..',
      '...WGGGGGGGGW...',
      '....WGGGGGGW....',
      '.....WGGGGW.....',
      '......WGGW......',
      '.......WW.......',
      '................'
    ],
    badge: [
      '................',
      '..BBBBBBBBBBBB..',
      '.BGGGGGGGGGGGGB.',
      '.BGWWWWWWWWWWGB.',
      '.BGWMMM..MMMWGB.',
      '.BGWMMMMMMMMWGB.',
      '.BGWMMMMMMMMWGB.',
      '.BGW.MMMMMM.WGB.',
      '.BGW..MMMM..WGB.',
      '.BGW...MM...WGB.',
      '.BGWWWWWWWWWWGB.',
      '.BGGGGGGGGGGGGB.',
      '..BBBBBBBBBBBB..',
      '................',
      '................',
      '................'
    ]
  };

  const selectedMatrix = spriteMatrices[spriteType] || spriteMatrices.badge;
  const pixelSize = 16;
  const spriteOffset = 128;

  let pixelRects = '';
  for (let r = 0; r < 16; r++) {
    for (let c = 0; c < 16; c++) {
      const char = selectedMatrix[r]?.[c];
      const hex = colorMap[char];
      if (hex) {
        const px = spriteOffset + c * pixelSize;
        const py = spriteOffset + r * pixelSize;
        pixelRects += `<rect x="${px}" y="${py}" width="${pixelSize}" height="${pixelSize}" fill="${hex}" />`;
      }
    }
  }

  const safePrompt = cleanPrompt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 512 512" shape-rendering="crispEdges">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#0a0915" />
        <stop offset="60%" stop-color="#19152b" />
        <stop offset="100%" stop-color="#2d1b40" />
      </linearGradient>
      <pattern id="pixelGrid" width="16" height="16" patternUnits="userSpaceOnUse">
        <path d="M 16 0 L 0 0 0 16" fill="none" stroke="rgba(255,255,255,0.02)" stroke-width="1" />
      </pattern>
    </defs>
    <!-- Clean Dark Backdrop with Pixel Grid -->
    <rect width="512" height="512" fill="url(#bg)" />
    <rect width="512" height="512" fill="url(#pixelGrid)" />

    <!-- Outer 8-Bit Border Frame -->
    <rect x="24" y="24" width="464" height="464" fill="none" stroke="#6272a4" stroke-width="4" />
    <rect x="32" y="32" width="448" height="448" fill="none" stroke="#ff79c6" stroke-width="2" />

    <!-- Corner Pixel Accents -->
    <rect x="20" y="20" width="12" height="12" fill="#ff79c6" />
    <rect x="480" y="20" width="12" height="12" fill="#ff79c6" />
    <rect x="20" y="480" width="12" height="12" fill="#ff79c6" />
    <rect x="480" y="480" width="12" height="12" fill="#ff79c6" />

    <!-- 8-Bit Tag Header -->
    <rect x="136" y="48" width="240" height="28" fill="#12121e" stroke="#f1fa8c" stroke-width="2" />
    <text x="256" y="67" font-family="'Courier New', monospace" font-size="13" font-weight="bold" fill="#f1fa8c" text-anchor="middle" letter-spacing="2">LOCAL IMAGE PLACEHOLDER</text>

    <!-- Sprite Shadow Grid -->
    <rect x="${spriteOffset + 12}" y="${spriteOffset + 12}" width="256" height="256" fill="rgba(0,0,0,0.4)" />

    <!-- Scaled 16x16 Pixel Sprite -->
    ${pixelRects}

    <!-- Prompt Footer Badge -->
    <rect x="56" y="416" width="400" height="44" fill="#12121e" stroke="#bd93f9" stroke-width="2" />
    <text x="256" y="442" font-family="'Courier New', monospace" font-size="14" font-weight="bold" fill="#50fa7b" text-anchor="middle" letter-spacing="1">${safePrompt.toUpperCase()}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export async function generateImage(prompt, signal = null, referenceImage = null) {
  try {
    const payload = { prompt };
    // The user's own reference image (data URL) is forwarded so image models
    // can use it as visual input instead of generating from text alone.
    if (typeof referenceImage === 'string' && referenceImage.startsWith('data:image')) {
      payload.referenceImage = referenceImage;
    }
    const fetchOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    };
    if (signal) fetchOptions.signal = signal;

    const response = await fetch(IMAGE_PROXY_ENDPOINT, fetchOptions);

    if (response.ok) {
      const data = await response.json();
      if (data?.image) return data.image;
      console.warn('Hosted image API responded without an image payload; rendering a local placeholder.');
    } else {
      console.warn(`Hosted image API request failed (HTTP ${response.status}); rendering a local placeholder.`);
    }
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    console.warn('Hosted image API request failed; rendering a local placeholder.', err);
  }

  return createFallbackSvgDataUrl(prompt);
}

export async function improveCodingPrompt(prompt, intent = null) {
  const cleanPrompt = typeof prompt === 'string' ? prompt.trim() : '';
  if (!cleanPrompt) return cleanPrompt;

  const currentIntent = intent || analyzePublicUserIntent(cleanPrompt);
  const intentType = currentIntent?.type || 'general';

  const isCoding = intentType === 'code-help' || intentType === 'app' || INTENT_PATTERNS.code.test(cleanPrompt) || INTENT_PATTERNS.app.test(cleanPrompt);
  if (!isCoding) {
    return cleanPrompt;
  }

  const isAppIntent = intentType === 'app' || INTENT_PATTERNS.app.test(cleanPrompt);

  // Game creation: respond with a SMALL brief, not a feature dump.
  const isGameRequest = currentIntent?.primaryIntent === 'game_creation'
    || /\b(build|create|make|generate|design|want|need|give|show|play)\b.{0,60}\b(game|arcade|platformer|pong|snake|tetris|flappy|simulator|puzzle|shooter|rpg|runner|clicker)\b/i.test(cleanPrompt);

  // Build the Awwwards design spec + live inspiration once for app requests.
  // The live references are best-effort: failure never blocks and never
  // fabricates sites.
  const useWebDesignReferences = isAppIntent && !isGameRequest;
  const designSpec = useWebDesignReferences ? buildAwwwardsDesignPrompt(cleanPrompt) : '';
  const liveInspiration = useWebDesignReferences ? await (async () => {
    try {
      const { sites } = await fetchAwwwardsInspiration(cleanPrompt, null);
      if (sites.length === 0) return '';
      return `\n\n--- Live Awwwards Design Inspiration (real references) ---\n${sites
        .map((site) => `- ${site.title} — ${site.url}`)
        .join('\n')}\nUse these award-winning sites as visual direction for layout, typography, colour, and interaction quality.`;
    } catch {
      return '';
    }
  })() : '';

  // Use the Prompt Intelligence Engine for structured enrichment
  try {
    const pipelineResult = await processPromptIntelligence({
      prompt: cleanPrompt,
      dryRun: true,
    });

    if (pipelineResult && pipelineResult.executionPrompt && pipelineResult.executionPrompt !== cleanPrompt) {
      // Website/app builds may use live web-design references. Games derive
      // their visual direction from the user request and genre instead.
      return isAppIntent
        ? `${pipelineResult.executionPrompt}\n\n${designSpec}${liveInspiration}`
        : pipelineResult.executionPrompt;
    }
  } catch {
    // Fall back to legacy enhancement on pipeline failure
  }

  if (isAppIntent) {
    if (isGameRequest) {
      return `${cleanPrompt}

[SINGLE-FILE GAME SPECIFICATION]:
- Begin your response with a SHORT brief of AT MOST 1-2 short sentences: the game title and its controls. Example: "Here's Neon Pong — move with the Arrow keys, Space to launch." NEVER write a long feature list, architecture summary, or "I built..." paragraph.
- GAME ART DIRECTION: Follow any visual style the user explicitly requests. Otherwise infer a distinctive style from the game's genre, setting, mechanics, and audience; do NOT default to retro, pixel art, neon, or any other fixed aesthetic. Include a designed start screen and game-over screen, HUD, color palette, and typography that fit the game world. NEVER apply generic web "dark glassmorphism", glass panels, or luxury web-app styling to games.
- Build a complete, runnable, self-contained single-file HTML canvas game inside ONE SINGLE \`\`\`html ... \`\`\` code block with inline <style> and <script> tags.
- FULLSCREEN GAME REQUIREMENT: The game MUST fill the entire preview viewport — html/body with width:100%, height:100%, margin:0, overflow:hidden; a full-viewport canvas (width:100%, height:100%, display:block) with NO max-width, NO bordered box, NO rounded container around the game. Keep a fixed internal game resolution (e.g. 960x540) and scale it to the viewport with ctx.setTransform + a resize listener so the game always fills the screen.
- MOBILE: size the canvas from visualViewport (not just innerHeight) and listen for orientationchange; include on-screen touch controls (left/right/jump/action buttons) shown only on touch or coarse-pointer devices, bound with touchstart/touchend/touchcancel.
- Output ONLY the brief followed by the code block — NO feature summary, NO step-by-step guide, NO closing paragraph after the code.`;
    }

    const isExplicitNonJsx = /\b(html\b|css\b|vanilla|plain html|pure html|html\/css|raw html|html\s*\+\s*css|vanilla js)\b/i.test(cleanPrompt);
    const isOneShot = /\b(oneshot|one-shot|one shot|single[- ]page|one[- ]page)\b/i.test(cleanPrompt);

    if (isExplicitNonJsx) {
      return `${cleanPrompt}

${designSpec}${liveInspiration}

[SINGLE-FILE HTML/CSS/JS SPECIFICATION]:
- ALWAYS begin your response with a clear, detailed overview explaining the features, layout, and styling choices!
- Ensure proper visual layering and z-index stacking hierarchy (Background z-index:0 -> Content z-index:10 -> HUD/Toolbars z-index:20-30 -> Modals/Overlays z-index:40-50+) so elements don't obscure interactive controls!
- Output complete, clean HTML/CSS/JS code inside ONE SINGLE \`\`\`html ... \`\`\` code block including inline \`<style>\` and \`<script>\` tags.
- ${isOneShot ? 'ONE-SHOT MODE: output ONE single page only — no sub-pages, no markers.' : 'MULTI-PAGE BY DEFAULT: output a multi-page website unless the user explicitly asked for ONE-SHOT (single page only). For multi-page output, put every page as its own complete standalone HTML document inside the SAME single code block, separated by markers:'}
  <!-- PAGE: index.html -->
  <!DOCTYPE html>... complete page with inline <style>/<script> ...
  Link pages with PLAIN RELATIVE anchors ONLY: <a href="about.html">About</a>. Never use a leading slash or absolute URL for internal links (never "/about.html", "https://...", or "corez.pro/...") — the preview and the published site serve every page under its own folder (corez.pro/<slug>/about.html), so only bare relative filenames resolve to the right URL. Keep filenames lowercase like index.html, about.html, contact.html (max 12 pages). COMPLETENESS CHECK before you finish: ALWAYS output an index.html home page, make every <a href="..."> point to a page you actually output (a link to a page you never created is a broken site), and keep every page a complete standalone HTML document.
- ONE-SHOT MODE: ONLY when the user explicitly asked for "oneshot" (or "one shot", "single page", "one page"), output ONE single page only (no sub-pages, no markers).
- Build a complete, responsive, standalone experience ready for the preview canvas.
- ALWAYS end your response with a step-by-step user guide and feature summary after the code block! Never output ONLY a bare code block.`;
    }

    return `${cleanPrompt}

${designSpec}${liveInspiration}

[SINGLE-FILE REACT SPECIFICATION]:
- ALWAYS begin your response with a clear, detailed overview explaining the features, architecture, styling decisions, and layout choices!
- Ensure proper visual layering and z-index stacking hierarchy (Background z-index:0 -> Content z-index:10 -> HUD/Toolbars z-index:20-30 -> Modals/Overlays z-index:40-50+) so elements don't obscure interactive controls!
- Output clean, modern React/JSX code inside ONE SINGLE \`\`\`jsx ... \`\`\` code block starting with \`export default function App()\`.
- DO NOT wrap React code inside HTML boilerplate (\`<!DOCTYPE html>\`, \`<head>\`, \`<script type="text/babel">\`, or \`ReactDOM.createRoot()\`) because the preview canvas automatically compiles and renders React/JSX code!
- Do NOT split your output into multiple separate code blocks, file headers (// App.tsx, // components/Navbar.tsx), or relative file imports (import Navbar from './components/Navbar').
- Define all child components (Navbar, Hero, Footer, etc.) inline within the SAME file BEFORE the main App component!
- MULTI-PAGE BY DEFAULT: build a multi-page website unless the user explicitly asked for ONE-SHOT (single page only). For multi-page output, switch to plain HTML and output every page as its own complete standalone HTML document inside the SAME single \`\`\`html ... \`\`\` code block, separated by markers:
  <!-- PAGE: index.html -->
  <!DOCTYPE html>... complete page ...
  Link pages with PLAIN RELATIVE anchors ONLY: <a href="about.html">About</a>. Never use a leading slash or absolute URL for internal links (never "/about.html", "https://...", or "corez.pro/...") — the preview and the published site serve every page under its own folder (corez.pro/<slug>/about.html), so only bare relative filenames resolve to the right URL. Keep filenames lowercase like index.html, about.html, contact.html (max 12 pages). COMPLETENESS CHECK before you finish: ALWAYS output an index.html home page, make every <a href="..."> point to a page you actually output (a link to a page you never created is a broken site), and keep every page a complete standalone HTML document.
- ONE-SHOT MODE: ONLY when the user explicitly asked for "oneshot" (or "one shot", "single page", "one page"), output a single React component exactly as described above (no sub-pages, no markers).
- ALWAYS end your response with a step-by-step user guide and feature summary after the code block! Never output ONLY a bare code block.`;
  }

  return `${cleanPrompt}

[CODE DIAGNOSIS & FIX SPECIFICATION]:
- Systematically inspect the root cause before writing code.
- Produce clean, modern, production-ready code preserving existing API signatures and component props.
- Include a concise explanation of the changes and test verification steps.`;
}

// The only hard ceiling on a request is the platform's own body limit
// (the worker allows 24 MB). Below that, the full conversation travels with
// the request so earlier requirements and constraints are never discarded.
const MAX_COMPACTED_BYTES = 16 * 1024 * 1024;
const EXACT_EVIDENCE_PATTERN = /```[\s\S]*?```|(?:error|exception|failed|fix|bug|require|must|constraint|dependenc|version|@|\/\/|--)[^\n]{0,200}/i;

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
  while (compacted.length > 1 && JSON.stringify(compacted).length > MAX_COMPACTED_BYTES && i < compacted.length) {
    const candidate = compacted[i];
    const isLatestUserTurn = candidate?.role === 'user' && i === compacted.length - 1;
    const content = typeof candidate?.content === 'string' ? candidate.content : '';
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
      const content = typeof message?.content === 'string' ? message.content : '';
      if (/```/.test(content) || /(?:error|exception|failed|bug|must|require|constraint)/i.test(content)) {
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
  const error = new Error('cancelled by user');
  error.name = 'AbortError';
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
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

// Persisted project memory: the worker returns a lightweight structured
// project state with every creation/modification response; it is stored here
// and sent back with the next request so follow-up turns edit the existing
// project instead of regenerating it. Session-scoped in practice: it is
// overwritten when a new project is created.
let persistedProjectState = null;
let onProjectStateChange = null;
let lastHostedDiagnostics = null;
export function getLastHostedDiagnostics() {
  return lastHostedDiagnostics;
}
export function setProjectStateListener(listener) {
  onProjectStateChange = typeof listener === 'function' ? listener : null;
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
  options = {}
) {
  // 1. Fine-grained intent classification & contract generation
  const fineIntent = classifyIntentNew(prompt);
  const legacyIntentType = toLegacyIntentType(fineIntent?.primaryIntent || fineIntent?.type);
  const requirements = extractRequirements(prompt, fineIntent);
  const contract = createIntentContract(fineIntent, {
    explicit: requirements.explicit || [],
    inferred: requirements.inferred || [],
    forbidden: requirements.forbidden || [],
  });

  const executionPrompt = (intent?.type === 'code-help' || intent?.type === 'app' || INTENT_PATTERNS.code.test(prompt))
    ? await improveCodingPrompt(prompt, intent)
    : prompt;

  // Creation requests (games, websites, apps) run through the agentic
  // creation harness so the artifact is verified and repaired before
  // delivery. Revisions of existing code and non-streaming calls keep the
  // direct single-generation path.
  const finePrimary = fineIntent?.primaryIntent || fineIntent?.type;
  const useCreationHarness = options.stream === true
    && intent?.type === 'app'
    && !isRevisionContextPrompt(prompt)
    && !String(prompt).includes('```')
    && ['game_creation', 'website_creation', 'design_task', 'app'].includes(intent?.primaryIntent || finePrimary);

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
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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
      harness: useCreationHarness
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
  const TRANSPORT_FAILURE_PATTERN = /networkerror|failed to fetch|load failed|fetch failed|connection (refused|reset|timed out)|network is unreachable|err_connection/i;
  const fetchWithTransportRetry = async (options, endpoint = AI_PROXY_ENDPOINT) => {
    const attempts = [null, 3000];
    for (let i = 0; i < attempts.length; i += 1) {
      if (signal?.aborted) {
        const err = new Error('AbortError');
        err.name = 'AbortError';
        throw err;
      }
      try {
        return await fetch(endpoint, options);
      } catch (err) {
        if (err?.name === 'AbortError' || signal?.aborted) throw err;
        const message = `${err?.message || ''} ${err?.cause?.message || ''}`;
        const isLastAttempt = i === attempts.length - 1;
        if (!TRANSPORT_FAILURE_PATTERN.test(message) || isLastAttempt) throw err;
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, attempts[i + 1]);
          signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            resolve();
          }, { once: true });
        });
      }
    }
    throw new Error('Hosted AI request failed to reach the AI worker.');
  };

  const fetchHostedResponse = async (options) => {
    let response;
    try {
      response = await fetchWithTransportRetry(options, AI_PROXY_ENDPOINT);
    } catch (err) {
      if (err?.name === 'AbortError' || signal?.aborted) throw err;
      // If same-origin /api/ai failed to reach (e.g. dev server proxy offline),
      // seamlessly retry through the Worker's direct live endpoint.
      return fetchWithTransportRetry(options, AI_WAF_FALLBACK_ENDPOINT);
    }

    if (response.status === 403) {
      let challengePage = response.headers.get('cf-mitigated') === 'challenge';
      if (!challengePage) {
        try {
          const body = await response.clone().text();
          challengePage = CLOUDFLARE_CHALLENGE_PATTERN.test(body.slice(0, 4000));
        } catch { /* keep header-based result */ }
      }
      if (challengePage) {
        return fetchWithTransportRetry(options, AI_WAF_FALLBACK_ENDPOINT);
      }
    }

    // If local dev server proxy returned a 502/503/504 gateway failure,
    // retry through the direct live Cloudflare Worker.
    if ([502, 503, 504].includes(response.status)) {
      try {
        const fallback = await fetchWithTransportRetry(options, AI_WAF_FALLBACK_ENDPOINT);
        if (fallback && (fallback.ok || fallback.status < 500)) return fallback;
      } catch (fallbackErr) {
        if (fallbackErr?.name === 'AbortError' || signal?.aborted) throw fallbackErr;
      }
    }

    return response;
  };

  // Streaming path: the worker answers with SSE events (meta/delta/usage/
  // done/diagnostics). Deltas are delivered to onDelta as they arrive so the
  // user sees content before the generation finishes; the final content is
  // resolved when the done event closes the stream.
  if (options.stream === true) {
    // No built-in recovery: the request is issued exactly once. The worker
    // owns provider fallback and reports errors as SSE error events, which
    // are surfaced verbatim. Aborts are never swallowed.
    if (signal?.aborted) {
      const err = new Error('AbortError');
      err.name = 'AbortError';
      throw err;
    }
    const response = await fetchHostedResponse(fetchOptions);
    if (!response.ok) {
      let errorText = '';
      try {
        errorText = await response.text();
      } catch { /* keep empty */ }
      // A 403 with the Cloudflare challenge page ("Just a moment...") means
      // the WAF intercepted the request before it reached the worker — the
      // API needs a WAF bypass rule, not a retry.
      if (response.status === 403 && CLOUDFLARE_CHALLENGE_PATTERN.test(errorText.slice(0, 4000))) {
        throw new Error('The hosted AI request was intercepted by a security challenge page before reaching the worker. The site needs a WAF bypass rule for /api/* — please retry in a moment.');
      }
      throw new Error(`Hosted AI stream failed: HTTP ${response.status} ${errorText.slice(0, 200)}`);
    }
    if (!response.body) throw new Error('Hosted AI stream had no body.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let streamed = '';
    let rawBody = '';
    let projectState = null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (rawBody.length < 200 * 1024) rawBody += chunk;
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload) continue;
        let event;
        try {
          event = JSON.parse(payload);
        } catch {
          continue;
        }
        if (event.type === 'delta' && typeof event.text === 'string') {
          streamed += event.text;
          options.onDelta?.(event.text);
        } else if (event.type === 'clear') {
          streamed = '';
          options.onClear?.();
        } else if (event.type === 'phase' && typeof event.phase === 'string') {
          options.onPhase?.(event);
        } else if (event.type === 'done' && event.projectState) {
          projectState = event.projectState;
        } else if (event.type === 'diagnostics' && typeof event.diagnostics === 'object') {
          lastHostedDiagnostics = event.diagnostics;
        } else if (event.type === 'error') {
          // Fail fast: surface the worker's reason verbatim. No retries.
          throw new Error(event.message || 'Hosted AI stream error.');
        }
      }
    }
    if (projectState) {
      persistedProjectState = projectState;
      onProjectStateChange?.(projectState);
    }
    if (streamed.trim()) return streamed;
    // The stream completed with zero deltas and no error event: the response
    // was NOT valid SSE. Diagnose the body so the user sees the real cause
    // instead of a generic "no streamed content" (a Cloudflare challenge
    // page, a proxy error page, or a JSON fast-path answer).
    const rawTrimmed = rawBody.trim();
    if (!rawTrimmed) {
      throw new Error('The hosted AI returned an empty response. Please try again.');
    }
    if (CLOUDFLARE_CHALLENGE_PATTERN.test(rawTrimmed.slice(0, 4000))) {
      throw new Error('The hosted AI request was intercepted by a security challenge page instead of reaching the worker. Please retry in a moment.');
    }
    if (rawTrimmed.startsWith('{') || rawTrimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(rawTrimmed);
        if (typeof parsed?.content === 'string' && parsed.content.trim()) {
          return parsed.content;
        }
        if (typeof parsed?.error === 'string') {
          throw new Error(`Hosted AI request failed: ${parsed.error}`);
        }
      } catch (jsonErr) {
        if (jsonErr instanceof Error && jsonErr.message.startsWith('Hosted AI request failed:')) throw jsonErr;
        // Fall through to the generic error below.
      }
    }
    throw new Error('Hosted AI returned no streamed content.');
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
    if (err?.name === 'AbortError' || signal?.aborted) throw err;
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
    attempt < RETRY_SCHEDULED_MAX_ATTEMPTS && data?.status === 'retry-scheduled';
    attempt += 1
  ) {
    // Ask the worker when this task becomes eligible again. A missing record
    // means the task is no longer deferred (it completed or was permanently
    // classified), so the worker's own estimate is kept and the request is
    // re-issued anyway — the only way to fetch a final result.
    let statusWaitSeconds = Math.max(1, Number(data?.retryAfterSeconds) || 10);
    if (typeof data?.taskId === 'string' && data.taskId) {
      try {
        const statusResponse = await fetch(`/api/task/${encodeURIComponent(data.taskId)}`, { signal });
        const status = await statusResponse.json();
        if (status?.status === 'retry-scheduled') {
          statusWaitSeconds = Math.max(1, Number(status.retryAfterSeconds) || statusWaitSeconds);
        }
      } catch {
        // Status poll failed: fall back to the worker's own estimate.
      }
    }
    const waitMs = Math.max(RETRY_SCHEDULED_MIN_WAIT_MS, Math.min(statusWaitSeconds * 1000, RETRY_SCHEDULED_MAX_WAIT_MS));
    await sleepResumable(waitMs, signal);
    response = await fetchHostedResponse(fetchOptions);
    try {
      data = await response.json();
    } catch (err) {
      // A user-initiated abort must propagate so callers can stop cleanly.
      if (err?.name === 'AbortError' || signal?.aborted) throw err;
      data = {};
    }
  }
  if (data?.status === 'retry-scheduled') {
    throw new Error('The hosted AI service is temporarily busy and its recovery is still scheduled. Please try again shortly.');
  }

  if (!response.ok) {
    const serverMsg = typeof data?.error === 'string' ? data.error : (data?.error?.message || data?.message || `HTTP ${response.status}`);
    const detail = typeof data?.detail === 'string' && data.detail.trim() ? ` (${data.detail.trim()})` : '';
    throw new Error(`Hosted AI request failed: ${serverMsg}${detail}`);
  }

  // Defense-in-depth: reasoning text must never reach the user. Strip closed
  // <think>/<thinking> blocks and anything after an unclosed marker (a
  // truncated thinking-only reply), mirroring the worker's sanitizer.
  const strippedContent = (typeof data?.content === 'string' ? data.content : '')
    .replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
    .replace(/<(?:think|thinking)\b[^>]*>[\s\S]*$/gi, '')
    .trim();
  const rawContent = strippedContent || null;

  if (!rawContent) {
    throw new Error('Hosted AI returned only reasoning and no answer.');
  }

  // Persist project memory returned by the worker so the next follow-up turn
  // edits the existing implementation (delta-first) instead of rebuilding.
  if (data?.projectState && typeof data.projectState === 'object') {
    persistedProjectState = data.projectState;
    onProjectStateChange?.(data.projectState);
  }
  if (data?.diagnostics && typeof data.diagnostics === 'object') {
    lastHostedDiagnostics = data.diagnostics;
  }

  // 3. Local Reflection & Bounded Repair Loop
  const initialEval = evaluateResponse(rawContent, contract, fineIntent);
  let finalContent = rawContent;
  let repaired = false;

  if (!initialEval.isCompliant) {
    // Progress-aware repair: repairResponse iterates while each pass makes a
    // material change and stops when the response is compliant or blocked.
    const repairResult = repairResponse(rawContent, initialEval, contract, Number.MAX_SAFE_INTEGER, 0, fineIntent);
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

export function extractCodeFromMessage(text) {
  if (!text) return null;

  const codeBlocks = text.match(/```(?:html|xml|jsx|tsx|js|javascript|react)?\s*([\s\S]*?)```/gi);
  if (codeBlocks) {
    const validCodes = [];
    for (const block of codeBlocks) {
      const match = block.match(/```(?:html|xml|jsx|tsx|js|javascript|react)?\s*([\s\S]*?)```/i);
      if (match && match[1].trim()) {
        const code = match[1].trim();
        if (code.includes('<') || code.includes('export default') || code.includes('function ') || code.includes('import ') || code.includes('const ')) {
          validCodes.push(code);
        }
      }
    }
    if (validCodes.length > 0) {
      return validCodes.join('\n\n');
    }
  }

  const matchAny = text.match(/```\s*([\s\S]*?)```/);
  if (matchAny && matchAny[1].trim()) {
    return matchAny[1].trim();
  }

  // Salvage truncated responses: a long generated app is often cut off
  // mid-code-block (no closing ```), so the strict matchers above miss it.
  // Extract everything after the last recognized fence when it still looks
  // like code, so the preview canvas can open anyway.
  const truncatedBlock = text.match(/```(?:html|xml|jsx|tsx|js|javascript|react)\s*([\s\S]*)$/i);
  if (truncatedBlock && truncatedBlock[1].trim()) {
    const code = truncatedBlock[1].trim();
    if (code.includes('<') || code.includes('export default') || code.includes('function ') || code.includes('import ') || code.includes('const ')) {
      return code;
    }
  }

  return null;
}

// DYNAMIC GAME & APP SYNTHESIZER ENGINE (Kimi 2.7 Code Driven)
function synthesizeCustomApp() {
  return null;
}

// Detect requests that need live, up-to-date information from the web:
// current events, latest news, live
// scores, weather, or explicit "search the web / look up / google it"
// phrasing. Explanation and knowledge questions WITHOUT a recency signal are
// left to the model's own knowledge.
// Slash commands typed in the chat box give CoreZ an explicit, unambiguous
// intent — the AI is never asked to guess. The command token is stripped
// before the prompt reaches any model, so the model sees only the clean
// request.
const SLASH_COMMANDS = new Set(['website', 'game', 'research']);

export function parseSlashCommand(prompt) {
  const text = String(prompt || '').trim();
  const match = text.match(/^\/([a-z]+)\b/i);
  if (!match) return { command: null, rest: text };
  const command = match[1].toLowerCase();
  if (!SLASH_COMMANDS.has(command)) return { command: null, rest: text };
  return { command, rest: text.slice(match[0].length).trim() };
}

export function isSlashCommand(prompt) {
  return parseSlashCommand(prompt).command !== null;
}

export function isWebSearchRequest(prompt) {
  const text = String(prompt || '').toLowerCase();
  if (!text.trim()) return false;
  const searchPhrase = /\b(search|look up|lookup|google|browse|find out|fetch|retrieve|check)\b[\s\S]{0,60}\b(web|internet|online|current|latest|recent|news|updates?|today|now|live|real[- ]?time)\b/i;
  const factualRecency = /\b(what|who|which|where|when|how)\b[\s\S]{0,80}\b(happened|occurred|happening|won|winner|released|launched|announced|published|updated|changed|result|score|price|rate|weather|temperature|stock|cases)\b/i;
  if (searchPhrase.test(text) || factualRecency.test(text)) return true;

  const recency = /\b(latest|current|recent|today|yesterday|this (week|month|year)|right now|as of|breaking|live|newly|up[- ]to[- ]date|202[4-9]|20\d\d)\b/i;
  if (!recency.test(text)) return false;

  const newsy = /\b(news|headlines|event|happening|happened|developments?|updates?|announcement|release|launch|score|results?|forecast|weather|temperature|election|awards?|winners?|match|game (today|tonight)|schedule)\b/i;
  return newsy.test(text);
}

// Format search results into a compact, honest summary used when the hosted
// AI is unavailable. Every result keeps its source URL; nothing is invented.
export function formatSearchResults(search) {
  const results = Array.isArray(search?.results) ? search.results : [];
  if (results.length === 0) {
    return 'I searched the web but no reliable results came back for that query.';
  }
  const lines = results.map((result, index) => {
    const title = result.title || 'Result';
    const url = result.url ? `\n   ${result.url}` : '';
    const snippet = result.snippet ? `\n   ${result.snippet}` : '';
    const source = result.source ? ` (${result.source})` : '';
    return `${index + 1}. **${title}**${source}${url}${snippet}`;
  });
  return `I searched the web for **"${search.query}"** and found these sources:\n\n${lines.join('\n\n')}\n\n_Results are search summaries; open the sources for full details._`;
}

// Answer a web-search request: prefer the hosted AI with the real search
// results as grounding; when it is unavailable, present the sources directly.
export async function answerWithWebSearch(cleanPrompt, intent, history, signal) {
  const search = await fetchWebSearch(cleanPrompt, signal);
  if (!Array.isArray(search?.results) || search.results.length === 0) {
    return 'I searched the web for that, but no usable results came back.';
  }

  const grounded = await (async () => {
    try {
      const groundedPrompt = `The user asked: "${cleanPrompt}"

Use the following web search results as your factual grounding. Answer the user's question with real, current information from these results. Always name the source(s) you used (title + URL). If the results do not contain the answer, say so honestly instead of guessing. Do NOT invent URLs or facts.

SEARCH RESULTS:
${search.results.map((result, index) => `${index + 1}. ${result.title} — ${result.url}\n   ${result.snippet || ''} (source: ${result.source})`).join('\n')}`;
      const hosted = await generateHostedAIResponse(groundedPrompt, intent, history, signal);
      if (hosted) return hosted;
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      console.warn('Hosted AI unavailable for grounded search answer; showing sources.', error);
    }
    return null;
  })();

  if (grounded) return grounded;
  return formatSearchResults(search);
}

// Deep research pipeline for the /research command, structured after the
// two-phase Deep Research skill methodology (Weizhena/Deep-Research-skills,
// MIT): Phase 1 decomposes the topic into research items with focused search
// queries; Phase 2 runs a dedicated web search per item (Wikipedia +
// DuckDuckGo through the worker, with full article extracts); Phase 3
// synthesises a deep report with a table of contents and per-item sections,
// then an editorial verification pass over the draft; the report is delivered
// as a downloadable PDF in the preview canvas.
//
// Methodology also draws on Academic Research Skills by Cheng-I Wu (CC-BY-NC
// 4.0, https://github.com/Imbad0202/academic-research-skills): research
// question scoping, systematic grounding in full sources, cross-source
// synthesis with contradiction handling, and an editorial verification pass.
// CoreZ never fabricates: every source, URL and extract comes from the real
// search service, and the AI is explicitly forbidden from inventing any.

const DEEP_RESEARCH_MAX_ITEMS = 5;
const DEEP_RESEARCH_MAX_EXTRACT_CHARS = 3000;
const DEEP_RESEARCH_MAX_DRAFT_CHARS = 24000;

// Parse the hosted AI's outline answer (strict JSON: {"items":[{name,query}]}).
// Returns a bounded, sanitized item list or null when the answer is unusable.
export function extractOutlineItems(text) {
  if (!text) return null;
  const match = String(text).match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const data = JSON.parse(match[0]);
    if (!Array.isArray(data?.items)) return null;
    const items = data.items
      .map((item, index) => ({
        name: String(item?.name || '').trim().slice(0, 80) || `Item ${index + 1}`,
        query: String(item?.query || '').trim().slice(0, 200)
      }))
      .filter((item) => item.name && item.query);
    if (items.length === 0) return null;
    return items.slice(0, DEEP_RESEARCH_MAX_ITEMS);
  } catch {
    return null;
  }
}

// Deduplicate sources by URL (fall back to title) preserving first occurrence.
export function dedupeSources(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).filter((s) => {
    const key = (s && s.url) || (s && s.title);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function runResearchCommand(topic, history = [], signal = null) {
  const cleanTopic = String(topic || '').trim();
  if (!cleanTopic) {
    return 'Please tell me what to research, e.g. `/research quantum computing`';
  }

  // Phase 1a: topic-level search — also grounds the outline decomposition.
  let search;
  try {
    search = await fetchWebSearch(cleanTopic, signal, { detail: true });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    // Name the real failure so the user (or developer) can see why the
    // search service could not answer — never fabricate results.
    const detail = typeof error?.detail === 'string' && error.detail.trim()
      ? ` (${error.detail.trim().slice(0, 200)})`
      : '';
    return `I couldn't research "${cleanTopic}" right now — the web search service is unavailable${detail}. Please try again later.`;
  }
  const results = Array.isArray(search?.results) ? search.results : [];
  if (results.length === 0) {
    return `I searched the web for **"${cleanTopic}"** but no reliable results came back, so I can't write a grounded research report about it. Try a different topic.`;
  }

  const resultsText = results
    .map((result, index) => `${index + 1}. ${result.title} — ${result.url}\n   ${result.snippet || ''} (source: ${result.source})`)
    .join('\n');

  // Phase 1b: outline decomposition — the model splits the topic into the
  // items a deep report must cover, each with a focused search query. The
  // outline is only a plan; every fact still comes from real searches.
  let items = null;
  try {
    const outlinePrompt = `You are a research outline planner. Topic: "${cleanTopic}".

Decompose this topic into the key research items a deep report must cover (entities, products, people, sub-topics, technologies). For each item give a focused, self-contained web search query.

Return ONLY a JSON object with no commentary, in exactly this shape:
{"items":[{"name":"Item name","query":"focused search query"}]}

Rules:
- 2 to ${DEEP_RESEARCH_MAX_ITEMS} items, ordered by importance.
- Each query must be self-contained (carry the topic context), 3 to 12 words, and specific enough to return item-focused results.
- Prefer items grounded in the search results below; do not invent URLs or facts.

TOPIC-LEVEL SEARCH RESULTS:
${resultsText}`;
    const hosted = await generateHostedAIResponse(outlinePrompt, analyzePublicUserIntent(cleanTopic), history, signal);
    if (hosted) items = extractOutlineItems(hosted);
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    // Outline planner unavailable: fall through to the honest source report.
  }

  // Phase 2: one dedicated search per item, run in parallel. Items keep
  // their own source sets; sources are aggregated once, deduplicated, and
  // numbered globally so every inline citation [n] resolves in the PDF.
  const itemResults = Array.isArray(items) && items.length > 0
    ? await (async () => {
        const settled = await Promise.allSettled(
          items.map((item) => fetchWebSearch(item.query, signal, { detail: true }))
        );
        if (signal?.aborted) {
          const abort = new Error('Aborted');
          abort.name = 'AbortError';
          throw abort;
        }
        return settled.map((outcome) =>
          outcome.status === 'fulfilled' && Array.isArray(outcome.value?.results)
            ? outcome.value.results
            : []
        );
      })()
    : [];
  const researched = Array.isArray(items) && items.length > 0;

  const globalSources = dedupeSources(
    researched
      ? [...results, ...itemResults.flat()]
      : results
  );
  const indexByKey = new Map(globalSources.map((source, index) => [(source.url || source.title), index]));

  function sourceLine(source) {
    return `${(indexByKey.get((source && source.url) || (source && source.title)) ?? 0) + 1}. ${source.title || 'Source'} — ${source.url || ''}`;
  }

  function itemBlock(item, index) {
    const sources = itemResults[index] || [];
    if (sources.length === 0) {
      return `### Item: ${item.name}\n(no dedicated results returned for query "${item.query}"; covered by the topic-level sources above)`;
    }
    const lines = sources.map((source) => {
      const extract = typeof source.extract === 'string' && source.extract.trim()
        ? `\n   FULL EXTRACT: ${source.extract.trim().slice(0, DEEP_RESEARCH_MAX_EXTRACT_CHARS)}`
        : '';
      return `${sourceLine(source)}\n   ${source.snippet || ''}${extract}`;
    });
    return `### Item: ${item.name} (query: "${item.query}")\n${lines.join('\n')}`;
  }

  const outlineSection = researched
    ? `\n\nRESEARCH ITEMS (deep-researched individually):\n${items.map((item, index) => `${index + 1}. ${item.name} — ${item.query}`).join('\n')}\n\nITEM SOURCES:\n${items.map((item, index) => itemBlock(item, index)).join('\n\n')}`
    : '';

  const globalSourcesText = globalSources.map((source, index) => `${index + 1}. ${source.title} — ${source.url}\n   ${source.snippet || ''} (source: ${source.source})`).join('\n');

  // Phase 3a: deep synthesis — a single comprehensive report with a table of
  // contents and a dedicated section per researched item.
  let reportBody = '';
  try {
    const researchPrompt = `Write a detailed, comprehensive deep research report on: "${cleanTopic}"

RESEARCH METHOD:
- First, frame the precise research question this report answers and its scope.
- Use ONLY the sources below as factual grounding. Citations [n] refer to the globally numbered source list.
- Cite every claim inline as [n]. Where a claim is not supported by the sources, say so explicitly instead of guessing. Never invent facts, URLs, or sources.
- Synthesize across sources: where sources disagree or cover different aspects, say so explicitly and resolve the contradiction when the evidence allows.
${researched ? `- Cover EVERY researched item in its own section, drawing on its dedicated sources (and full extracts) for depth.` : ''}

REPORT STRUCTURE (produce ALL sections):
## Table of Contents
1. ${researched ? items.map((item) => item.name).join('\n2. ') : 'Overview'}
(plus any cross-cutting sections you add)

## Research Question & Scope
The precise question this report answers and what it deliberately does not cover.

## Overview
A concise orientation for a general reader.

## Key Findings
The most important, evidence-backed conclusions, each cited.
${researched ? `\n${items.map((item) => `## Item: ${item.name}\nDedicated analysis of this item with multiple paragraphs, drawing on its full article extracts for depth (background, context, specifics, examples).`).join('\n\n')}` : '\n## Detailed Analysis\nThe core of the report: examine each notable subject in its own subsection with multiple paragraphs, drawing on the full article extracts for depth.'}

## Cross-Cutting Synthesis
How the items relate, compare, and combine into the full picture of "${cleanTopic}".

## Contradictions & Unresolved Questions
Where the sources disagree, what remains unknown, and where evidence is thin.

## Conclusion
Synthesise the findings and answer the research question directly.

Aim for a thorough, in-depth report (roughly 1200+ words), not a summary. Write clear, well-structured prose.

SOURCES:
${globalSourcesText}
${outlineSection}`;
    const hosted = await generateHostedAIResponse(researchPrompt, analyzePublicUserIntent(cleanTopic), history, signal);
    if (hosted) reportBody = hosted;
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    // Hosted AI unavailable: build the report from the real sources directly.
  }

  // Phase 3b: editorial verification pass — every claim must be traceable to
  // a source; unsupported claims and contradictions are corrected in the
  // final text. Best effort — a failing review keeps the draft.
  if (reportBody) {
    try {
      const reviewPrompt = `You are an editorial reviewer for a deep research report. Critically review the draft against the source list:
- Every claim must be traceable to a source: flag and correct any claim that is not supported.
- Fix contradictions, overreach, and missing evidence in the final text.
- Keep the structure (table of contents, per-item sections) and all accurate, well-supported content; do not add facts that are not in the sources.
Then output THE FINAL REVISED REPORT ONLY (no review commentary, no preamble).

SOURCES:
${globalSourcesText}

DRAFT:
${reportBody.slice(0, DEEP_RESEARCH_MAX_DRAFT_CHARS)}`;
      const revised = await generateHostedAIResponse(reviewPrompt, analyzePublicUserIntent(cleanTopic), history, signal);
      if (revised) reportBody = revised;
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
    }
  }

  // Honest fallback: the hosted model was unavailable, so the real sources
  // are presented directly, structured per researched item when available.
  if (!reportBody) {
    const fallbackSections = researched
      ? items.map((item, index) => {
          const sources = itemResults[index] || [];
          if (sources.length === 0) return `## Item: ${item.name}\n\nNo dedicated results returned for this item during the run.`;
          return `## Item: ${item.name}\n\n${sources
            .map((r) => `- ${r.title}: ${(r.extract || r.snippet || 'See source for details.').slice(0, 600)} — ${r.url}`)
            .join('\n')}`;
        }).join('\n\n')
      : `## Detailed Analysis\n\n${results
          .map((r, i) => `${i + 1}. ${r.title} — ${r.url}\n   ${(r.extract || r.snippet || 'See source for details.').slice(0, 600)}`)
          .join('\n\n')}`;
    reportBody = `# Deep Research Report: ${cleanTopic}

## Research Question & Scope

This report answers: what does the available evidence say about "${cleanTopic}"? It is grounded strictly in the live web search results listed below.

## Table of Contents
${researched ? items.map((item, index) => `${index + 1}. ${item.name}`).join('\n') : '1. Overview\n2. Sources'}

## Key Findings

${(researched ? itemResults.flat() : results)
  .slice(0, 6)
  .map((r) => `- ${r.title}: ${r.snippet || 'See source for details.'}`)
  .join('\n')}

${fallbackSections}

## Contradictions & Unresolved Questions

The hosted model was unavailable during this run, so the excerpts above are presented directly from the sources without cross-source synthesis.

_Generated by CoreZ from live web search results._`;
  }

  // Strip markdown fences so the content renders cleanly in the PDF editor.
  const plainBody = reportBody.replace(/```/g, '').trim();
  const title = `${cleanTopic.slice(0, 60)} — Research Report`;
  const pdf = synthesizePdfDocumentHtml({ title, body: plainBody, sources: globalSources });

  const depthNote = researched
    ? ` — **${items.length} items** deep-researched across ${globalSources.length} sources`
    : '';
  return `Here is your deep research report on **${cleanTopic}**${depthNote}, grounded in live web search results. Open it in the preview canvas and click **"Download .pdf"** to save it as a PDF, or **"Print / Save as PDF"** to print it.\n\n\`\`\`html\n${pdf.html}\n\`\`\``;
}

// Build the "why" for the honest fallback: name the transport error when the
// fetch itself failed, and give actionable guidance — the request never
// reached an AI provider, so a provider-key hint would be misleading.
export function describeHostedUnavailable(hostedError) {
  const message = hostedError?.message || '';
  const isTransportFailure = /networkerror|failed to fetch|load failed|fetch failed|ERR_CONNECTION|net::|econnrefused|connection refused/i.test(message);
  let reason = message ? ` The hosted AI service is unavailable: ${message}` : ' The hosted AI service is currently unavailable.';
  if (isTransportFailure) {
    // The browser never got an HTTP response: this is a backend connectivity
    // problem, not a missing provider key. Give actionable guidance for both
    // local development and the deployed Worker regardless of hostname.
    reason += ' The request never reached the AI worker. Locally, /api/* is proxied to the Cloudflare Worker on port 8787 — start it with `npx wrangler dev` (with OPENCODE_GO_API_KEY in .dev.vars) so this request has a backend to answer. For the deployed site, make sure the Worker is deployed with `npx wrangler deploy`.';
  }
  return reason;
}

// Generate concise, natural AI responses for any public user
export async function generateLocalAIResponse(prompt, hostedError = null, signal = null) {
  const cleanPrompt = prompt.trim();
  const lower = cleanPrompt.toLowerCase();
  const intent = analyzePublicUserIntent(cleanPrompt);

  // Natural short latency (0.6s), abortable so Stop interrupts the fallback
  // like every other generation path.
  await sleepResumable(600, signal);

  // Revision context: the user asked to revise an embedded code block. Never
  // discard their code or fabricate a different app — report the real status.
  const revisionMatch = cleanPrompt.match(/\[Context: The user is requesting a revision for the following code block\]/i);
  const hasEmbeddedCode = cleanPrompt.includes('```');
  const userRequestPart = cleanPrompt.split(/User Request:\s*/i).slice(-1)[0]?.trim() || '';

  if (revisionMatch) {
    const reason = describeHostedUnavailable(hostedError);
    return `I can see the code you want to revise, but I couldn't apply your revision (${userRequestPart || 'no request captured'}).${reason} Your code has not been changed.`;
  }

  // 1. GREETINGS & SMALL TALK (Universal & Natural)
  if (/^(hello|hi|hey|greetings|good morning|good afternoon|good evening|howdy|sup)(\s|!|\.|\?|$)/i.test(lower) || lower.includes('who are you') || lower.includes('what can you do')) {
    return `Hello! I'm COREZ AI. How can I help you today?`;
  }

  // 2. CREATOR FACT
  if (/\bwho\b.{0,20}\b(created|made|built|invented|developed)\b|\b(created|made|built|invented|developed)\b.{0,30}\b(corez|core z)\b/i.test(lower)) {
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

  if (/^(how are you|how is it going|how's it going)(\s|!|\.|\?|$)/i.test(lower)) {
    return `Doing great! Ready to help whenever you are. What's on your mind?`;
  }

  // 3. GRATITUDE INTENT
  if (/^(thanks|thank you|awesome|great|cool|nice|perfect)(\s|!|\.|$)/i.test(lower)) {
    return `You're very welcome! Let me know if there's anything else I can help with.`;
  }

  // 4. PUBLIC APP / GAME / WIDGET CREATION INTENT
  // Only synthesize a brand-new experience for genuine creation prompts; a
  // prompt that already embeds code is a revision/analysis of existing code.
  // Games are NEVER canned: the hosted CoreZ AI is the only creator. When it
  // is unavailable, say so instead of substituting a template game.
  if (intent.type === 'app' && !hasEmbeddedCode && !/^revise\s/i.test(cleanPrompt)) {
    const appResult = synthesizeCustomApp(cleanPrompt);
    if (appResult) {
      return `I've created **${appResult.title}** for you! Click below to open it live in the preview canvas on the right side.\n\n\`\`\`html\n${appResult.html}\n\`\`\``;
    }
    // Games are NEVER canned: the hosted CoreZ AI is the only creator. When
    // it is unavailable, say so instead of substituting a template game.
    if (isGameDevIntent(cleanPrompt) || intent.primaryIntent === 'game_creation') {
      const reason = describeHostedUnavailable(hostedError);
      return `I'd love to build that game for you, but ${reason.trim()} — so I can't create it right now. Your request was received; please try again in a moment.`;
    }
    const reason = describeHostedUnavailable(hostedError);
    return `I'd love to build that for you, but it doesn't match any app template I can synthesize offline, and ${reason.trim()} — so I can't create this specific app right now. Please check the AI service configuration (e.g. OPENCODE_GO_API_KEY for local dev) and try again.`;
  }

  // 5. PUBLIC USER INTENT RESPONSES
  if (intent.type === 'code-help') {
    if (hasEmbeddedCode) {
      const reason = describeHostedUnavailable(hostedError).replace(/^ The hosted AI service is unavailable/, '');
      return `I can see the code you shared, but the hosted AI service is currently unavailable${reason}, so I couldn't analyse or revise it. Please check the AI service configuration and try again — your code has not been changed.`;
    }
    return `I understand the goal: ${intent.summary}\n\nShare the snippet, error message, or file you are working on. Iâ€™ll walk through what is happening, identify the likely cause, propose a fix, and explain how to verify it so you can move forward without guessing.`;
  }

  if (intent.type === 'writing') {
    return `I understand the goal: ${intent.summary}\n\nSend me the rough text, audience, and tone you want. Iâ€™ll turn it into clear public-facing copy, tighten the message, and give you a polished version plus a short explanation of why it works.`;
  }

  if (intent.type === 'explanation') {
    const reason = describeHostedUnavailable(hostedError);
    return `I can't properly answer "${cleanPrompt}" right now because the hosted AI service is currently unavailable.${reason}\n\nRetry in a moment and I'll explain it directly in plain language. If you'd rather work through it yourself in the meantime, this framework keeps any topic approachable:\n\n1. **Core idea** — define the topic in one everyday sentence.\n2. **Why it matters** — connect it to what you're trying to accomplish.\n3. **Key parts** — two or three simple pieces, each with a concrete example.\n4. **Next step** — one small action to test your understanding.`;
  }

  const fallbackReason = describeHostedUnavailable(hostedError);
  return `I can't act on "${cleanPrompt}" right now because the hosted AI service is currently unavailable.${fallbackReason}\n\nRetry in a moment and I'll turn it into a plan, a written answer, code, or a live preview depending on what you need.`;
}

const IMAGE_PATTERNS = /\b(generate|create|draw|make|render|show|give me|give us|want|need|produce)\b.*\b(image|picture|photo|logo|illustration|artwork|wallpaper|drawing|graphic|icon)\b|\b(image|picture|photo|logo|illustration|artwork|wallpaper|drawing|graphic|icon)\b.*\b(generate|create|draw|make|render|flux)\b/i;

export function isRevisionContextPrompt(prompt) {
  return /\[Context: The user is requesting a revision for the following code block\]/i.test(String(prompt || ''));
}

const IMAGE_TITLE_SMALL_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'for', 'with', 'of', 'in', 'on', 'at', 'to', 'from', 'by', 'as', 'via', 'vs']);

const QUESTION_PATTERNS = /\b(what is|what are|whats|what's|who is|who are|why is|why are|how does|how do|how is|explain|tell me about|describe|define|meaning of|difference between)\b/i;

const IMAGE_REQUEST_TAIL = /\s*(and|also|then)?\s*(can you|could you|would you|please)?\s*(show|give|send|make|draw|generate|get)\s+(me|us)?\s*(an?|the)?\s*(image|picture|photo|illustration|artwork|wallpaper|drawing|graphic|logo|visual|pic|shot)\s*(of|for|showing)?\s*[.!?]*$/i;

export function createImageTitle(prompt) {
  const clean = String(prompt || '').trim();
  if (!clean) return '';

  let subject = clean
    .toLowerCase()
    // Strip courtesy / request framing
    .replace(/^(please\s+)?(can you|could you|would you|will you)\s+/i, '')
    .replace(/^(give me|give us|show me|generate|create|draw|make|render|produce|i want|i need|need|want)\s+(me\s+)?/i, '')
    // Strip the deliverable noun + connector ("an image of", "a logo for", ...)
    .replace(/^(an?\s+)?(image|picture|photo|illustration|artwork|wallpaper|drawing|graphic|logo)\s+(of|for|showing|featuring|with|that|about)\s+/i, '')
    .replace(/^(an?\s+)?(image|picture|photo|illustration|artwork|wallpaper|drawing|graphic|logo)\s*$/i, '')
    // Strip trailing question tails ("... and explain what it is")
    .replace(/\s+(and|then)?\s*(explain|describe|tell me|what is|what are|why is|why are|how does|how do|what does|what do)\s+.*$/i, '')
    // Strip trailing courtesy phrases and leading articles
    .replace(/\s+(for me|please|now)\s*$/i, '')
    .replace(/^(a|an|the)\s+/i, '')
    .replace(/[\]()[]/g, '')
    .trim();

  if (!subject) return 'Generated Image';

  const words = subject.split(/\s+/).filter(Boolean);
  const titled = words.map((word, index) => {
    if (index === 0 || index === words.length - 1) {
      return word.charAt(0).toUpperCase() + word.slice(1);
    }
    if (IMAGE_TITLE_SMALL_WORDS.has(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');

  return titled;
}

export function isMixedQuestionImageRequest(prompt) {
  const clean = String(prompt || '').trim();
  if (!clean) return false;
  return QUESTION_PATTERNS.test(clean)
    && /\b(show|give|send|make|draw|generate|get)\s+(me|us)?\s*(an?|the)?\s*(image|picture|photo|illustration|artwork|wallpaper|drawing|graphic|logo|visual|pic|shot)\b/i.test(clean)
    && isExplicitImageRequest(clean);
}

export function extractImageSubject(prompt) {
  const clean = String(prompt || '').trim();
  if (!clean) return '';
  let subject = clean.toLowerCase();
  // Strip leading question phrasing
  subject = subject
    .replace(/^(what is|what are|whats|what's|who is|who are|why is|why are|how does|how do|how is|explain|tell me about|describe|define|meaning of|difference between)\s+(the|an|a)?\s+/i, '')
    .replace(/^(what is|what are|whats|what's|who is|who are|why is|why are|how does|how do|how is|explain|tell me about|describe|define|meaning of|difference between)\s+/i, '')
    // Strip trailing image request tail
    .replace(IMAGE_REQUEST_TAIL, '')
    .replace(/\s*[.!?]+$/i, '')
    .trim();
  return subject;
}

export function extractQuestionPrompt(prompt) {
  const clean = String(prompt || '').trim();
  if (!clean) return '';
  return clean
    .replace(IMAGE_REQUEST_TAIL, '')
    .trim();
}

const GAME_GENRE_PATTERN = /\b(platformer|puzzle|arcade|shooter|racing|rpg|role[- ]?playing|survival|horror|tower[- ]?defense|idle|clicker|simulator|sim|strategy|sports|fighting|battle[- ]?royale|snake|pong|tetris|flappy[- ]?bird|wordle|crossword|memory|maze|endless[- ]?runner|runner|fps)\b/i;

const PROPER_NAME_PATTERN = /\b(?:called|named|titled)\s+["'`]?([A-Z][A-Za-z0-9' -]{1,24})/i;

const SITE_SUBJECT_PATTERN = /\b(?:for|of|about)\s+(?:my|our|the|a|an)?\s*([a-z][a-z0-9' -]{1,24})/i;

const FEATURE_PATTERN = /\b(?:fix|repair|implement|add|build|create|refactor|improve|update)\s+(?:the|a|an)?\s*([a-z][a-z0-9 _-]{2,24})/i;

function capitalizeTitle(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';
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
  const clean = String(prompt || '').trim();
  if (!clean) return 'New Conversation';
  try {
    const fine = classifyIntentNew(clean);
    const type = fine?.primaryIntent || fine?.type || 'general';
    const lower = clean.toLowerCase();

    let title = '';
    if (type === 'game_creation') {
      const genreMatch = lower.match(GAME_GENRE_PATTERN);
      let genre = genreMatch ? genreMatch[1].toLowerCase() : 'custom';
      if (genre === 'rpg' || genre === 'fps') genre = genre.toUpperCase();
      const nameMatch = clean.match(PROPER_NAME_PATTERN);
      const name = nameMatch ? nameMatch[1].trim() : '';
      title = `Build a ${genre} game${name ? `: ${name}` : ''}`;
    } else if (type === 'website_creation' || type === 'design_task') {
      const subjectMatch = clean.match(SITE_SUBJECT_PATTERN);
      let subject = subjectMatch ? subjectMatch[1].trim() : '';
      // Drop trailing qualifiers ("called Sweet Crumb", "with dark mode").
      subject = subject
        .split(/\s+(?:called|named|titled|with|that|and|using|for)\b/i)[0]
        .trim();
      const nameMatch = clean.match(PROPER_NAME_PATTERN);
      const name = nameMatch ? nameMatch[1].trim() : '';
      title = subject
        ? `Create a ${subject} website${name ? `: ${name}` : ''}`
        : `Create a website${name ? `: ${name}` : ''}`;
    } else if (type === 'image_generation') {
      const subject = clean
        .replace(/^(please\s+)?(can you|could you|would you|please)\s+/i, '')
        .replace(/^(generate|create|make|draw|render|show me|give me|show|give|get|want|need|produce|i want|i need|i'?d like)\s+(me|us)?\s*(an?|the)?\s*(image|picture|photo|illustration|artwork|wallpaper|drawing|graphic|logo|visual|pic|shot)\s+(of|for|showing|featuring|with|that|about)\s+/i, '')
        .replace(IMAGE_REQUEST_TAIL, '')
        .replace(/^(a|an|the)\s+/i, '')
        .replace(/\s*[.!?]+$/, '')
        .trim();
      title = `Generate a ${subject || 'custom'} image`;
    } else if (type === 'bug_fix' || type === 'code_refactor' || type === 'feature_implementation' || type === 'simple_edit') {
      const featureMatch = clean.match(FEATURE_PATTERN);
      const feature = featureMatch ? featureMatch[1].trim() : '';
      title = feature
        ? `${type === 'bug_fix' ? 'Fix' : type === 'code_refactor' ? 'Refactor' : 'Implement'} ${feature}`
        : capitalizeTitle(type.replace(/_/g, ' '));
    } else if (type === 'explanation') {
      title = clean
        .replace(/^(can you|could you|please|hey|hello|hi|corez|corez ai)[,\s]*/i, '')
        .replace(/\s*[.!?]+$/, '')
        .trim();
    } else {
      title = clean.replace(/\s*[.!?]+$/, '').trim();
    }

    return capitalizeTitle(title).slice(0, 40) || 'New Conversation';
  } catch {
    return clean.slice(0, 30) || 'New Conversation';
  }
}

/**
 * Ask the hosted AI to name a conversation from its first user message.
 * The worker answers with a tiny, capped title-only generation; any failure
 * falls back to the deterministic heuristic so a title is always produced.
 */
export async function generateAISessionTitle(prompt) {
  const clean = String(prompt || '').trim();
  if (!clean) return generateSessionTitle(clean);
  try {
    const response = await fetch(AI_PROXY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt: clean.slice(0, 400), titleOnly: true })
    });
    if (!response.ok) throw new Error(`Session title request failed with status ${response.status}.`);
    const data = await response.json();
    const title = typeof data?.title === 'string' ? data.title.trim() : '';
    return title ? title.slice(0, 60) : generateSessionTitle(clean);
  } catch {
    return generateSessionTitle(clean);
  }
}

export function extractReferenceImage(history) {
  if (!Array.isArray(history)) return null;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const message = history[i];
    if (!message || message.role !== 'user' || !Array.isArray(message.attachments)) continue;
    for (const attachment of message.attachments) {
      if (attachment && typeof attachment.thumb === 'string' && attachment.thumb.startsWith('data:image')) {
        return attachment.thumb;
      }
    }
  }
  return null;
}

export async function handleMixedQuestionImageRequest(prompt, intent, history, signal) {
  const subject = extractImageSubject(prompt);
  const imagePrompt = subject ? `an image of ${subject}` : prompt;

  // Answer the question with the image request stripped (so the worker's
  // image-only rule never suppresses the explanation), and generate the
  // image in parallel from the extracted subject.
  const questionPrompt = extractQuestionPrompt(prompt) || prompt;
  const questionHistory = Array.isArray(history) && history.length > 0
        ? [...compactConversationForRequest(history).slice(0, -1), { role: 'user', content: questionPrompt }]
    : [];

  const [hostedResult, imageResult] = await Promise.allSettled([
    generateHostedAIResponse(questionPrompt, intent, questionHistory, signal),
    generateImage(imagePrompt, signal, extractReferenceImage(history))
  ]);

  const hostedResponse = hostedResult.status === 'fulfilled' ? hostedResult.value : null;
  const imageUrl = imageResult.status === 'fulfilled' ? imageResult.value : null;

  if (imageUrl) {
    const imageMarkdown = `![](${imageUrl})`;
    if (hostedResponse) {
      const tagMatch = hostedResponse.match(/\[IMAGE_PROMPT:\s*(.*?)\]/i);
      if (tagMatch) return hostedResponse.replace(tagMatch[0], imageMarkdown);
      return `${hostedResponse.trim()}\n\n${imageMarkdown}`;
    }
    return imageMarkdown;
  }

  if (hostedResponse) return hostedResponse;
  throw new Error('Mixed question and image generation both failed.');
}

export function isExplicitImageRequest(prompt) {
  const clean = String(prompt || '').trim();
  if (!clean) return false;
  const lower = clean.toLowerCase();
  if (lower.startsWith('image:') || lower.startsWith('flux:')) return true;
  if (IMAGE_PATTERNS.test(clean)) return true;
  try {
    const fine = classifyIntentNew(clean);
    if (fine?.type === 'image_generation' && (fine.confidence || 0) >= 0.2) return true;
  } catch {
    // Classifier unavailable; rely on pattern checks above.
  }
  return false;
}

export async function generateAIResponse(prompt, history = [], signal = null, onDelta = null, onPhase = null, onClear = null) {
  // Explicit slash commands first: /website, /game, /research. The command
  // token is stripped before any model sees the prompt, so the AI is never
  // confused by it.
  const { command, rest } = parseSlashCommand(prompt);
  if (command === 'research') {
    return runResearchCommand(rest, history, signal);
  }

  let cleanPrompt = command === 'website' || command === 'game' ? rest : prompt.trim();
  if (!cleanPrompt) cleanPrompt = command === 'game' ? 'Build a game' : 'Build a website';
  const intent = analyzePublicUserIntent(cleanPrompt);

  // /website and /game force the exact intent the user asked for instead of
  // letting the classifier guess.
  if (command === 'website') {
    intent.type = 'app';
    intent.primaryIntent = 'website_creation';
    intent.summary = 'Create a public website or web page.';
    intent.confidence = 1;
    if (!/\b(website|web ?site|landing|page|site|homepage)\b/i.test(cleanPrompt)) {
      cleanPrompt = `Build a website: ${cleanPrompt}`;
    }
  } else if (command === 'game') {
    intent.type = 'app';
    intent.primaryIntent = 'game_creation';
    intent.summary = 'Create a playable game.';
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
      const grounded = await answerWithWebSearch(cleanPrompt, intent, history, signal);
      if (typeof grounded === 'string' && grounded.trim()) return grounded;
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      // Search is best-effort: fall through to the normal AI path when the
      // search service itself fails (offline, no provider, etc.).
      console.warn('Web search unavailable; falling back to the standard AI path.', error);
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
        return await handleMixedQuestionImageRequest(cleanPrompt, intent, history, signal);
      } catch (mixedErr) {
        if (mixedErr?.name === 'AbortError') throw mixedErr;
        console.warn('Mixed question+image request failed; falling back to image-only path.', mixedErr);
      }
    }
    try {
      const imageUrl = await generateImage(cleanPrompt, signal, extractReferenceImage(history));
      if (imageUrl) {
        return `![](${imageUrl})`;
      }
    } catch (imgError) {
      if (imgError?.name === 'AbortError') throw imgError;
      console.warn('Image generation error; falling back to standard text response.', imgError);
    }
  }

  try {
    const hostedAiResponse = await generateHostedAIResponse(cleanPrompt, intent, history, signal, {
      stream: typeof onDelta === 'function',
      onDelta,
      onPhase,
      onClear
    });
    if (hostedAiResponse) {
      // Check if the AI decided to generate an image
      const imageMatch = hostedAiResponse.match(/\[IMAGE_PROMPT:\s*(.*?)\]/i);
      if (imageMatch) {
        const imagePrompt = imageMatch[1].trim();
        try {
          const imageUrl = await generateImage(imagePrompt, signal, extractReferenceImage(history));
          if (imageUrl) {
             // Replace the tag with the actual image markdown
             return hostedAiResponse.replace(imageMatch[0], `![](${imageUrl})`);
          }
        } catch (imgError) {
          if (imgError?.name === 'AbortError') throw imgError;
          console.warn('Image generation error from AI tag.', imgError);
        }
      }
      return hostedAiResponse;
    }
  } catch (hostedAiError) {
    if (hostedAiError?.name === 'AbortError') throw hostedAiError;
    console.warn('Hosted AI unavailable; using local Corez fallback.', hostedAiError);
    return generateLocalAIResponse(cleanPrompt, hostedAiError, signal);
  }

  return generateLocalAIResponse(cleanPrompt, null, signal);
}
