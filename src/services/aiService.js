// Corez AI Service Engine - Universal Public Conversational Engine

export const MODEL = {
  id: 'corez',
  name: 'Corez AI',
  description: 'Minimalist AI assistant for concise conversation, reasoning, and live app creation.'
};

export const AI_PROXY_ENDPOINT = '/api/ai';
export const IMAGE_PROXY_ENDPOINT = '/api/image';

import { defaultSkillRegistry } from '../skills/registry.js';
import { classifyIntent } from './intentClassifier.js';
import { parseMarketIntent } from './marketIntent.js';
import { fetchMarketData, unavailableMarket } from './marketService.js';
import { process as processPromptIntelligence, toLegacyIntentType, classifyIntent as classifyIntentNew } from './promptIntelligence/index.js';

export const PUBLIC_USER_INTENT_PROMPT = `
Analyze the public user intent behind the request. Corez delegates vision, art direction, UI layout, and game design/SVG creation to MiMo V2.5, and uses FLUX 1 for free background generation and image rendering.
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
  explanation: /\b(explain|what is|what are|how does|why does|teach me|break down|understand|compare)\b/i,
  swarm: /\b(swarm|multi-agent|agents|orchestrate|orchestration|superpowers|plan|architect|complex)\b/i
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

  if (INTENT_PATTERNS.swarm.test(lower)) {
    return {
      type: 'swarm',
      summary: 'Coordinate multiple agents for a complex task.',
      responseStrategy: 'Provide a robust architectural overview and step-by-step reasoning.'
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

  // If the new engine has a high-confidence classification, map it to legacy types
  if (newIntent && newIntent.confidence >= 0.5 && newIntent.type !== 'unknown') {
    const legacyType = toLegacyIntentType(newIntent.type);
    const summaries = {
      'app': 'Create a public-facing interactive experience or web tool.',
      'code-help': 'Help the user understand, debug, or improve code.',
      'writing': 'Help the user shape public-facing words or content.',
      'explanation': 'Explain the topic in plain language.',
      'swarm': 'Coordinate multiple agents for a complex task.',
      'general': 'Understand the public user goal and give a useful next step.',
    };
    const strategies = {
      'app': 'Build a runnable monochrome HTML preview when enough intent is present.',
      'code-help': 'Ask for the relevant snippet when the code is missing; otherwise explain the fix clearly.',
      'writing': 'Offer a concise draft or rewrite with a clear tone.',
      'explanation': 'Give a direct answer with the minimum useful context.',
      'swarm': 'Provide a robust architectural overview and step-by-step reasoning.',
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

  let modelResult;
  try {
    modelResult = classifyIntent(cleanPrompt);
  } catch {
    modelResult = { accepted: false, confidence: 0 };
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
    <text x="256" y="67" font-family="'Courier New', monospace" font-size="13" font-weight="bold" fill="#f1fa8c" text-anchor="middle" letter-spacing="2">ITCH.IO 8-BIT ASSET</text>

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

export async function generateFluxImage(prompt, signal = null) {
  try {
    const fetchOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt })
    };
    if (signal) fetchOptions.signal = signal;

    const response = await fetch(IMAGE_PROXY_ENDPOINT, fetchOptions);

    if (response.ok) {
      const data = await response.json();
      if (data?.image) return data.image;
    }
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    console.warn('Hosted FLUX API request failed; rendering fallback visual.', err);
  }

  return createFallbackSvgDataUrl(prompt);
}

export function improveCodingPrompt(prompt, intent = null) {
  const cleanPrompt = typeof prompt === 'string' ? prompt.trim() : '';
  if (!cleanPrompt) return cleanPrompt;

  const currentIntent = intent || analyzePublicUserIntent(cleanPrompt);
  const intentType = currentIntent?.type || 'general';

  const isCoding = intentType === 'code-help' || intentType === 'app' || INTENT_PATTERNS.code.test(cleanPrompt) || INTENT_PATTERNS.app.test(cleanPrompt);
  if (!isCoding) {
    return cleanPrompt;
  }

  // Use the Prompt Intelligence Engine for structured enrichment
  try {
    const pipelineResult = processPromptIntelligence({
      prompt: cleanPrompt,
      dryRun: true,
    });

    if (pipelineResult && pipelineResult.executionPrompt && pipelineResult.executionPrompt !== cleanPrompt) {
      return pipelineResult.executionPrompt;
    }
  } catch {
    // Fall back to legacy enhancement on pipeline failure
  }

  if (intentType === 'app' || INTENT_PATTERNS.app.test(cleanPrompt)) {
    return `${cleanPrompt}

[SINGLE-FILE REACT SPECIFICATION]:
- Output clean, modern React/JSX code inside ONE SINGLE \`\`\`jsx ... \`\`\` code block starting with \`export default function App()\`.
- DO NOT wrap React code inside HTML boilerplate (\`<!DOCTYPE html>\`, \`<head>\`, \`<script type="text/babel">\`, or \`ReactDOM.createRoot()\`) because the preview canvas automatically compiles and renders React/JSX code!
- Do NOT split your output into multiple separate code blocks, file headers (// App.tsx, // components/Navbar.tsx), or relative file imports (import Navbar from './components/Navbar').
- Define all child components (Navbar, Hero, Footer, etc.) inline within the SAME file BEFORE the main App component!
- Include complete state management, modern dark glassmorphism styling, and responsive layout controls.`;
  }

  return `${cleanPrompt}

[CODE DIAGNOSIS & FIX SPECIFICATION]:
- Systematically inspect the root cause before writing code.
- Produce clean, modern, production-ready code preserving existing API signatures and component props.
- Include a concise explanation of the changes and test verification steps.`;
}

export async function generateHostedAIResponse(
  prompt,
  intent = analyzePublicUserIntent(prompt),
  history = [],
  signal = null
) {
  if (intent?.type === 'code-help' || intent?.type === 'app' || INTENT_PATTERNS.code.test(prompt)) {
    prompt = improveCodingPrompt(prompt, intent);
  }

  const fetchOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prompt, intent, messages: history })
  };
  if (signal) fetchOptions.signal = signal;

  const response = await fetch(AI_PROXY_ENDPOINT, fetchOptions);

  if (!response.ok) {
    throw new Error(`Hosted AI request failed with status ${response.status}`);
  }

  const data = await response.json();
  return data?.content?.trim() || null;
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

  return null;
}

function synthesizeChessGame(withBot = false) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>COREZ Chess</title>
  <style>
    :root {
      --bg: #09090b;
      --card: #121215;
      --border: #27272a;
      --text: #f4f4f5;
      --text-muted: #a1a1aa;
      --sq-light: #27272a;
      --sq-dark: #18181b;
      --sq-select: #3f3f46;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1rem; }
    .game-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; width: 100%; max-width: 460px; text-align: center; box-shadow: 0 4px 16px rgba(0,0,0,0.25); }
    h1 { font-size: 1.25rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 0.75rem; color: #fff; }
    .status-bar { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.85rem; display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.75rem; background: rgba(255,255,255,0.03); border-radius: 6px; border: 1px solid var(--border); }
    .board { display: grid; grid-template-columns: repeat(8, 1fr); grid-template-rows: repeat(8, 1fr); aspect-ratio: 1; border: 2px solid var(--border); border-radius: 6px; overflow: hidden; margin-bottom: 1rem; }
    .square { display: flex; align-items: center; justify-content: center; font-size: 2.2rem; cursor: pointer; user-select: none; transition: background 0.15s ease; position: relative; }
    .square.light { background-color: var(--sq-light); }
    .square.dark { background-color: var(--sq-dark); }
    .square.selected { background-color: var(--sq-select) !important; outline: 2px solid #fff; outline-offset: -2px; }
    .square.valid-move::after { content: ''; width: 12px; height: 12px; background: rgba(255,255,255,0.5); border-radius: 50%; position: absolute; }
    .controls { display: flex; gap: 0.5rem; justify-content: center; }
    .btn { background: #ffffff; color: #000000; border: none; padding: 0.6rem 1.2rem; border-radius: 6px; font-weight: 700; font-size: 0.75rem; cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em; }
    .btn:hover { opacity: 0.9; }
    .btn-sec { background: transparent; color: var(--text); border: 1px solid var(--border); }
    .btn-sec:hover { background: rgba(255,255,255,0.05); }
  </style>
</head>
<body>
  <div class="game-card">
    <h1>COREZ CHESS</h1>
    <div class="status-bar">
      <span id="status">White's Turn</span>
      <span id="mode">${withBot ? '1-Player vs Bot' : 'Interactive 2-Player'}</span>
    </div>
    <div class="board" id="board"></div>
    <div class="controls">
      <button class="btn" id="resetBtn">New Game</button>
      <button class="btn btn-sec" id="flipBtn">Flip Board</button>
    </div>
  </div>
  <script>
    const WITH_BOT = ${withBot};
    const INITIAL_BOARD = [
      ['r','n','b','q','k','b','n','r'],
      ['p','p','p','p','p','p','p','p'],
      ['','','','','','','',''],
      ['','','','','','','',''],
      ['','','','','','','',''],
      ['','','','','','','',''],
      ['P','P','P','P','P','P','P','P'],
      ['R','N','B','Q','K','B','N','R']
    ];
    const SYMBOLS = {
      'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
      'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
    };
    let board = [], turn = 'W', selected = null, flipped = false;

    function init() {
      board = INITIAL_BOARD.map(r => [...r]);
      turn = 'W'; selected = null; render();
    }
    function isW(p) { return p && p === p.toUpperCase(); }
    function isB(p) { return p && p === p.toLowerCase(); }

    function getMoves(r, c) {
      const p = board[r][c];
      if (!p || (turn === 'W' && !isW(p)) || (turn === 'B' && !isB(p))) return [];
      const moves = [], white = isW(p), type = p.toLowerCase();
      const check = (nr, nc) => {
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const t = board[nr][nc];
          if (!t) { moves.push([nr, nc]); return true; }
          if (white ? isB(t) : isW(t)) moves.push([nr, nc]);
        }
        return false;
      };
      if (type === 'p') {
        const dir = white ? -1 : 1, startRow = white ? 6 : 1;
        if (r + dir >= 0 && r + dir < 8 && !board[r + dir][c]) {
          moves.push([r + dir, c]);
          if (r === startRow && !board[r + 2 * dir][c]) moves.push([r + 2 * dir, c]);
        }
        [-1, 1].forEach(dc => {
          const nr = r + dir, nc = c + dc;
          if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
            const t = board[nr][nc];
            if (t && (white ? isB(t) : isW(t))) moves.push([nr, nc]);
          }
        });
      } else if (type === 'n') {
        [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr, dc]) => check(r + dr, c + dc));
      } else if (type === 'k') {
        [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr, dc]) => check(r + dr, c + dc));
      } else {
        const dirs = type === 'r' ? [[-1,0],[1,0],[0,-1],[0,1]] :
                     type === 'b' ? [[-1,-1],[-1,1],[1,-1],[1,1]] :
                     [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
        dirs.forEach(([dr, dc]) => {
          let nr = r + dr, nc = c + dc;
          while (check(nr, nc)) { nr += dr; nc += dc; }
        });
      }
      return moves;
    }

    function onClick(r, c) {
      if (WITH_BOT && turn === 'B') return;
      if (selected) {
        const [sr, sc] = selected;
        const valid = getMoves(sr, sc);
        if (valid.some(([vr, vc]) => vr === r && vc === c)) {
          board[r][c] = board[sr][sc];
          board[sr][sc] = '';
          turn = turn === 'W' ? 'B' : 'W';
          selected = null;
          render();
          if (WITH_BOT && turn === 'B') {
            setTimeout(botMove, 500);
          }
          return;
        }
      }
      const p = board[r][c];
      if (p && ((turn === 'W' && isW(p)) || (turn === 'B' && isB(p)))) {
        selected = [r, c];
      } else {
        selected = null;
      }
      render();
    }

    function botMove() {
      const allMoves = [];
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          const p = board[i][j];
          if (p && isB(p)) {
            const moves = getMoves(i, j);
            moves.forEach(([vr, vc]) => allMoves.push({ from: [i, j], to: [vr, vc] }));
          }
        }
      }
      if (allMoves.length > 0) {
        const m = allMoves[Math.floor(Math.random() * allMoves.length)];
        board[m.to[0]][m.to[1]] = board[m.from[0]][m.from[1]];
        board[m.from[0]][m.from[1]] = '';
        turn = 'W';
        render();
      }
    }

    function render() {
      const el = document.getElementById('board');
      el.innerHTML = '';
      document.getElementById('status').textContent = turn === 'W' ? "White's Turn" : "Black's Turn";
      const valid = selected ? getMoves(selected[0], selected[1]) : [];
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          const r = flipped ? 7 - i : i;
          const c = flipped ? 7 - j : j;
          const sq = document.createElement('div');
          sq.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
          if (selected && selected[0] === r && selected[1] === c) sq.classList.add('selected');
          if (valid.some(([vr, vc]) => vr === r && vc === c)) sq.classList.add('valid-move');
          const p = board[r][c];
          if (p) {
            sq.textContent = SYMBOLS[p] || p;
            sq.style.color = isW(p) ? '#ffffff' : '#a1a1aa';
          }
          sq.onclick = () => onClick(r, c);
          el.appendChild(sq);
        }
      }
    }

    document.getElementById('resetBtn').onclick = init;
    document.getElementById('flipBtn').onclick = () => { flipped = !flipped; render(); };
    init();
  </script>
</body>
</html>`;
}

function synthesizeRetroSpaceGame() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>COREZ Retro Space Defender</title>
  <style>
    :root {
      --bg: #050508;
      --card: #0d0d12;
      --border: #1f1f2e;
      --text: #00ffcc;
      --accent: #ff0055;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Courier New', monospace; }
    body { background: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1rem; }
    .game-card { background: var(--card); border: 2px solid var(--border); border-radius: 8px; padding: 1.25rem; width: 100%; max-width: 480px; text-align: center; box-shadow: 0 0 15px rgba(0,255,204,0.08); }
    h1 { font-size: 1.3rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 0.75rem; text-shadow: 0 0 10px var(--text); }
    .status-bar { font-size: 0.85rem; color: #a1a1aa; margin-bottom: 0.75rem; display: flex; justify-content: space-between; padding: 0.5rem 0.75rem; background: rgba(0,255,204,0.05); border-radius: 4px; border: 1px solid var(--border); }
    canvas { background: #000005; border: 1px solid var(--border); border-radius: 4px; display: block; margin: 0 auto 0.75rem auto; width: 100%; aspect-ratio: 1.33; cursor: crosshair; }
    .btn { background: var(--text); color: #000; border: none; padding: 0.6rem 1.2rem; border-radius: 4px; font-weight: 700; font-size: 0.8rem; cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em; transition: 0.2s; }
    .btn:hover { background: #fff; box-shadow: 0 0 15px var(--text); }
  </style>
</head>
<body>
  <div class="game-card">
    <h1>RETRO SPACE DEFENDER</h1>
    <div class="status-bar">
      <span id="scoreText">SCORE: 0</span>
      <span id="livesText">LIVES: 3</span>
    </div>
    <canvas id="c" width="400" height="300"></canvas>
    <button class="btn" id="startBtn">Launch Mission</button>
  </div>
  <script>
    const canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
    let pX = 180, score = 0, lives = 3, bullets = [], enemies = [], stars = [], particles = [], loop = null, active = false;

    for (let i = 0; i < 50; i++) {
      stars.push({ x: Math.random()*400, y: Math.random()*300, s: Math.random()*1.5 + 0.5 });
    }

    canvas.onmousemove = e => {
      const r = canvas.getBoundingClientRect();
      pX = Math.max(10, Math.min(370, e.clientX - r.left - 15));
    };

    canvas.onclick = () => {
      if (active) bullets.push({ x: pX + 13, y: 270 });
    };

    function start() {
      pX = 180; score = 0; lives = 3; bullets = []; enemies = []; particles = []; active = true;
      document.getElementById('scoreText').textContent = 'SCORE: ' + score;
      document.getElementById('livesText').textContent = 'LIVES: ' + lives;
      if (loop) clearInterval(loop);
      loop = setInterval(update, 1000/60);
    }

    function update() {
      ctx.fillStyle = '#000005'; ctx.fillRect(0, 0, 400, 300);
      ctx.fillStyle = '#ffffff';
      stars.forEach(st => {
        st.y += st.s * 0.5;
        if (st.y > 300) st.y = 0;
        ctx.fillRect(st.x, st.y, st.s, st.s);
      });

      if (!active) return;

      score++;
      if (score % 40 === 0) {
        enemies.push({ x: Math.random()*360, y: -20, s: 1.5 + Math.random()*2, w: 24, h: 20 });
      }

      ctx.fillStyle = '#00ffcc';
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i]; b.y -= 7;
        ctx.fillRect(b.x, b.y, 4, 10);
        if (b.y < -10) bullets.splice(i, 1);
      }

      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i]; e.y += e.s;
        ctx.fillStyle = '#ff0055';
        ctx.fillRect(e.x, e.y, e.w, e.h);
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(e.x + 6, e.y + 6, 12, 8);

        for (let j = bullets.length - 1; j >= 0; j--) {
          const b = bullets[j];
          if (b.x > e.x && b.x < e.x + e.w && b.y > e.y && b.y < e.y + e.h) {
            for (let k = 0; k < 8; k++) {
              particles.push({ x: e.x + 12, y: e.y + 10, vx: (Math.random()-0.5)*4, vy: (Math.random()-0.5)*4, life: 15 });
            }
            score += 100;
            enemies.splice(i, 1);
            bullets.splice(j, 1);
            break;
          }
        }

        if (e && pX < e.x + e.w && pX + 30 > e.x && 270 < e.y + e.h && 290 > e.y) {
          lives--;
          enemies.splice(i, 1);
          document.getElementById('livesText').textContent = 'LIVES: ' + lives;
          if (lives <= 0) {
            active = false;
            clearInterval(loop);
            alert('GAME OVER! Final Score: ' + score);
            return;
          }
        }

        if (e && e.y > 300) enemies.splice(i, 1);
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.life--;
        ctx.fillStyle = '#ff9900';
        ctx.fillRect(p.x, p.y, 3, 3);
        if (p.life <= 0) particles.splice(i, 1);
      }

      ctx.fillStyle = '#00ffcc';
      ctx.beginPath();
      ctx.moveTo(pX + 15, 265);
      ctx.lineTo(pX, 290);
      ctx.lineTo(pX + 30, 290);
      ctx.closePath();
      ctx.fill();

      document.getElementById('scoreText').textContent = 'SCORE: ' + score;
    }

    document.getElementById('startBtn').onclick = start;
    start();
  </script>
</body>
</html>`;
}

function synthesizeBotEnemyGame() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Bot Enemy Simulator</title>
  <style>
    body { background: #111; color: #fff; font-family: monospace; text-align: center; margin-top: 50px; }
    #arena { width: 400px; height: 400px; background: #222; border: 2px solid #555; position: relative; margin: 0 auto; overflow: hidden; }
    .bot { width: 30px; height: 30px; background: red; position: absolute; border-radius: 5px; display: flex; align-items: center; justify-content: center; font-weight: bold; }
    .player { width: 30px; height: 30px; background: blue; position: absolute; border-radius: 15px; }
  </style>
</head>
<body>
  <h2>Bot Enemy Arena</h2>
  <div id="arena">
    <div id="player" class="player" style="left: 185px; top: 185px;"></div>
  </div>
  <p>Use arrow keys to move. Avoid the red bot enemy!</p>
  <script>
    const player = document.getElementById('player');
    const arena = document.getElementById('arena');
    let px = 185, py = 185;

    const bot = document.createElement('div');
    bot.className = 'bot';
    bot.innerText = 'X';
    bot.style.left = '10px';
    bot.style.top = '10px';
    arena.appendChild(bot);

    let bx = 10, by = 10;
    let bSpeed = 1.5;

    document.addEventListener('keydown', (e) => {
      const speed = 10;
      if (e.key === 'ArrowUp') py = Math.max(0, py - speed);
      if (e.key === 'ArrowDown') py = Math.min(370, py + speed);
      if (e.key === 'ArrowLeft') px = Math.max(0, px - speed);
      if (e.key === 'ArrowRight') px = Math.min(370, px + speed);
      player.style.left = px + 'px';
      player.style.top = py + 'px';
    });

    function updateBot() {
      if (bx < px) bx += bSpeed;
      else if (bx > px) bx -= bSpeed;
      if (by < py) by += bSpeed;
      else if (by > py) by -= bSpeed;

      bot.style.left = bx + 'px';
      bot.style.top = by + 'px';

      if (Math.abs(bx - px) < 30 && Math.abs(by - py) < 30) {
        alert('You were caught by the bot enemy!');
        px = 185; py = 185; bx = 10; by = 10;
      }

      requestAnimationFrame(updateBot);
    }
    updateBot();
  </script>
</body>
</html>`;
}

function synthesizeWordleGame() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>COREZ Wordle Master</title>
  <style>
    :root {
      --bg: #09090b;
      --card: #121215;
      --border: #27272a;
      --text: #f4f4f5;
      --text-muted: #a1a1aa;
      --correct: #10b981;
      --present: #eab308;
      --absent: #3f3f46;
      --tile-border: #3f3f46;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1rem; }
    .game-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; width: 100%; max-width: 440px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
    h1 { font-size: 1.25rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 0.3rem; color: #fff; }
    .subtitle { font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem; }
    .grid { display: grid; grid-template-rows: repeat(6, 1fr); gap: 6px; margin-bottom: 1.2rem; }
    .row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
    .tile { aspect-ratio: 1; border: 2px solid var(--tile-border); border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 700; text-transform: uppercase; user-select: none; transition: transform 0.15s ease, background-color 0.3s ease; }
    .tile.filled { border-color: #71717a; animation: pop 0.1s ease; }
    .tile.correct { background: var(--correct) !important; border-color: var(--correct) !important; color: #fff; }
    .tile.present { background: var(--present) !important; border-color: var(--present) !important; color: #fff; }
    .tile.absent { background: var(--absent) !important; border-color: var(--absent) !important; color: #a1a1aa; }
    .keyboard { display: flex; flex-direction: column; gap: 6px; width: 100%; }
    .kb-row { display: flex; justify-content: center; gap: 4px; }
    .key { background: #27272a; color: var(--text); border: none; border-radius: 4px; padding: 0.6rem 0.4rem; font-weight: 700; font-size: 0.8rem; cursor: pointer; text-transform: uppercase; user-select: none; flex: 1; max-width: 36px; transition: background 0.2s; }
    .key.wide { flex: 1.5; max-width: 58px; font-size: 0.7rem; }
    .key:hover { background: #3f3f46; }
    .key.correct { background: var(--correct); color: #fff; }
    .key.present { background: var(--present); color: #fff; }
    .key.absent { background: #18181b; color: #52525b; }
    .toast { position: fixed; top: 1.5rem; left: 50%; transform: translateX(-50%); background: #ef4444; color: #fff; padding: 0.6rem 1.2rem; border-radius: 6px; font-size: 0.85rem; font-weight: 600; opacity: 0; transition: opacity 0.3s ease; pointer-events: none; z-index: 10; }
    .toast.show { opacity: 1; }
    .controls { margin-top: 1rem; display: flex; justify-content: center; gap: 0.5rem; }
    .btn { background: #fff; color: #000; border: none; padding: 0.6rem 1.2rem; border-radius: 6px; font-weight: 700; font-size: 0.75rem; cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em; }
    .btn:hover { opacity: 0.9; }
    @keyframes pop { 0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } }
  </style>
</head>
<body>
  <div id="toast" class="toast">Not in word list!</div>
  <div class="game-card">
    <h1>COREZ WORDLE</h1>
    <p class="subtitle">Guess the 5-letter hidden word in 6 tries</p>
    <div class="grid" id="grid"></div>
    <div class="keyboard" id="keyboard"></div>
    <div class="controls">
      <button class="btn" id="resetBtn">New Word</button>
    </div>
  </div>
  <script>
    const WORDS = [
      "APPLE","BRAIN","SMART","COREZ","FLASH","REACT","PLANT","TRAIN","WATER","DREAM",
      "SHINE","CLOCK","FLAME","STORM","CLIMB","SOUND","MUSIC","LIGHT","GREAT","WORLD",
      "POWER","CLEAN","CLEAR","CLOUDS","SPACE","CRAFT","AGENT","BOARD","CHECK","FRAME",
      "GUIDE","HOUSE","IMAGE","JUICE","KNIFE","LEMON","MAGIC","NIGHT","OCEAN","PAPER",
      "QUEEN","RIVER","SOLAR","TABLE","UNION","VALUE","WHITE","YOUTH","ZEBRA","BLOCK",
      "CANDY","DRIVE","EARTH","FIELD","GLASS","HEART","INDEX","JUDGE","LOGIC","MONEY",
      "NOBLE","ORDER","PHASE","RADIO","STAGE","TRACK","VOICE","YIELD","APEX","BLINK"
    ];
    const DICTIONARY = new Set([
      ...WORDS,
      "ABOUT","ABOVE","ABUSE","ACTOR","ACUTE","ADMIT","ADOPT","ADULT","AFTER","AGAIN",
      "AGENT","AGREE","AHEAD","ALARM","ALBUM","ALERT","ALIKE","ALIVE","ALLOW","ALONE",
      "ALONG","ALTER","AMONG","ANGER","ANGLE","ANGRY","APART","APPLE","APPLY","ARENA",
      "ARGUE","ARISE","ARRAY","ASIDE","ASSET","AUDIO","AUDIT","AVOID","AWARD","AWARE",
      "BADLY","BAKER","BASES","BASIC","BASIS","BEACH","BEGIN","BEING","BELOW","BENCH",
      "BLACK","BLANK","BLIND","BLOCK","BLOOD","BOARD","BOAST","BOOST","BOUND","BRAIN",
      "BRAND","BREAD","BREAK","BRICK","BRIEF","BRING","BROAD","BROWN","BUILD","BUILT",
      "BUYER","CABLE","CALIF","CARRY","CATCH","CAUSE","CHAIN","CHAIR","CHAOS","CHARM",
      "CHART","CHASE","CHEAP","CHECK","CHEST","CHIEF","CHILD","CHINA","CHOSE","CIVIL",
      "CLAIM","CLASS","CLEAN","CLEAR","CLICK","CLOCK","CLOSE","COACH","COAST","COLOR",
      "COUNT","COURT","COVER","CRAFT","CRASH","CREAM","CRIME","CROSS","CROWD","CROWN",
      "CYCLE","DAILY","DANCE","DATED","DEATH","DEBUT","DELAY","DEPTH","DIRTY","DOUBT",
      "DRAFT","DRAMA","DREAM","DRESS","DRIVE","EARTH","EIGHT","EMPTY","ENEMY","ENTRY",
      "EQUAL","ERROR","EVENT","EVERY","EXACT","EXIST","FAITH","FALSE","FAULT","FIBER",
      "FIELD","FIFTH","FIFTY","FINAL","FIRST","FIXED","FLASH","FLEET","FLOOR","FLUID",
      "FOCUS","FORCE","FORTH","FORTY","FORUM","FOUND","FRAME","FRANK","FRAUD","FRESH",
      "FRONT","FRUIT","FULLY","FUNNY","GIANT","GIVEN","GLASS","GLOBE","GOING","GRACE",
      "GRADE","GRAND","GRANT","GRASS","GREAT","GREEN","GROSS","GROUP","GROWN","GUARD",
      "GUESS","GUEST","GUIDE","HAPPY","HEART","HEAVY","HELLO","IMAGE","INDEX","INPUT",
      "ISSUE","JAPAN","JUDGE","KNIFE","LABEL","LABOR","LARGE","LATER","LATIN","LAYER",
      "LEARN","LEASE","LEAST","LEAVE","LEGAL","LEVEL","LIGHT","LIMIT","LOCAL","LOGIC",
      "LOOSE","LOWER","LUCKY","MAGIC","MAJOR","MAKER","MARCH","MATCH","MAYBE","MEDAL",
      "MEDIA","METAL","MICRO","MIGHT","MINOR","MINUS","MODEL","MONEY","MONTH","MORAL",
      "MOTOR","MOUNT","MOUSE","MOUTH","MOVIE","MUSIC","NEEDS","NEVER","NIGHT","NOISE",
      "NORTH","NOTED","NOVEL","NURSE","OCCUR","OCEAN","OFFER","OFTEN","ORDER","OTHER",
      "OUGHT","PAINT","PANEL","PAPER","PARTY","PEACE","PETER","PHASE","PHONE","PHOTO",
      "PIECE","PILOT","PITCH","PLACE","PLAIN","PLANE","PLANT","PLATE","POINT","POUND",
      "POWER","PRESS","PRICE","PRIDE","PRIME","PRINT","PRIOR","PROOF","PROUD","PROVE",
      "QUEEN","QUICK","QUIET","QUITE","RADIO","RAISE","RANGE","RAPID","RATIO","REACH",
      "READY","REFER","RIGHT","RIVAL","RIVER","ROBIN","ROGER","ROMAN","ROUGH","ROUND",
      "ROUTE","ROYAL","SCALE","SCENE","SCOPE","SCORE","SENSE","SERVE","SEVEN","SHALL",
      "SHAPE","SHARE","SHARP","SHEET","SHELF","SHELL","SHIFT","SHINE","SHIRT","SHOCK",
      "SHOOT","SHORT","SHOWN","SIGHT","SINCE","SIXTH","SIXTY","SIZED","SKILL","SLEEP",
      "SLIDE","SMALL","SMART","SMILE","SMITH","SMOKE","SOLID","SOLVE","SORRY","SOUND",
      "SOUTH","SPACE","SPARE","SPEAK","SPEED","SPEND","SPENT","SPLIT","SPOKE","SPORT",
      "STAFF","STAGE","STAKE","STAND","START","STATE","STEAM","STEEL","STICK","STILL",
      "STOCK","STONE","STOOD","STORE","STORM","STORY","STRIP","STUCK","STUDY","STUFF",
      "STYLE","SUGAR","SUITE","SUPER","TABLE","TAKEN","TASTE","TAXES","TEACH","TEETH",
      "TEXAS","THANK","THEFT","THEIR","THEME","THERE","THESE","THICK","THING","THINK",
      "THIRD","THOSE","THREE","THREW","THROW","TIGHT","TIMES","TIRED","TITLE","TODAY",
      "TOPIC","TOTAL","TOUCH","TOUGH","TOWER","TRACK","TRADE","TRAIN","TREAT","TREND",
      "TRIAL","TRIED","TRIES","TRUCK","TRULY","TRUST","TRUTH","TWICE","UNDER","UNDUE",
      "UNION","UNITY","UNTIL","UPPER","UPSET","URBAN","USAGE","USUAL","VALID","VALUE",
      "VIDEO","VIRUS","VISIT","VITAL","VOICE","WASTE","WATCH","WATER","WHEEL","WHERE",
      "WHICH","WHILE","WHITE","WHOLE","WHOSE","WOMAN","WOMEN","WORLD","WORRY","WORSE",
      "WORST","WORTH","WOULD","WOUND","WRITE","WRONG","WROTE","YOUTH"
    ]);

    let target = "", currentRow = 0, currentTile = 0, gameOver = false;
    let guesses = Array(6).fill("");
    const keyStates = {};

    function init() {
      target = WORDS[Math.floor(Math.random() * WORDS.length)];
      currentRow = 0; currentTile = 0; gameOver = false;
      guesses = Array(6).fill("");
      for (let k in keyStates) delete keyStates[k];
      renderGrid();
      renderKeyboard();
    }

    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2000);
    }

    function renderGrid() {
      const g = document.getElementById('grid');
      g.innerHTML = '';
      for (let r = 0; r < 6; r++) {
        const row = document.createElement('div');
        row.className = 'row';
        for (let c = 0; c < 5; c++) {
          const tile = document.createElement('div');
          tile.className = 'tile';
          const ch = guesses[r] ? guesses[r][c] || '' : '';
          tile.textContent = ch;
          if (ch) tile.classList.add('filled');
          if (r < currentRow) {
            const evalState = evaluateTile(guesses[r], c);
            tile.classList.add(evalState);
          }
          row.appendChild(tile);
        }
        g.appendChild(row);
      }
    }

    function evaluateTile(word, idx) {
      if (!word) return '';
      const ch = word[idx];
      if (target[idx] === ch) return 'correct';
      if (target.includes(ch)) return 'present';
      return 'absent';
    }

    function renderKeyboard() {
      const kb = document.getElementById('keyboard');
      kb.innerHTML = '';
      const layout = [
        ["Q","W","E","R","T","Y","U","I","O","P"],
        ["A","S","D","F","G","H","J","K","L"],
        ["ENTER","Z","X","C","V","B","N","M","BACK"]
      ];

      layout.forEach(r => {
        const row = document.createElement('div');
        row.className = 'kb-row';
        r.forEach(k => {
          const btn = document.createElement('button');
          btn.className = 'key' + (k.length > 1 ? ' wide' : '');
          btn.textContent = k === 'BACK' ? '⌫' : k;
          if (keyStates[k]) btn.classList.add(keyStates[k]);
          btn.onclick = () => handleInput(k);
          row.appendChild(btn);
        });
        kb.appendChild(row);
      });
    }

    function handleInput(key) {
      if (gameOver) return;
      if (key === 'ENTER') {
        if (currentTile < 5) {
          showToast('Not enough letters');
          return;
        }
        const guess = guesses[currentRow];
        if (!DICTIONARY.has(guess)) {
          showToast('Not in word list!');
          return;
        }

        for (let i = 0; i < 5; i++) {
          const ch = guess[i];
          const st = evaluateTile(guess, i);
          if (st === 'correct' || (st === 'present' && keyStates[ch] !== 'correct') || (!keyStates[ch] && st === 'absent')) {
            keyStates[ch] = st;
          }
        }

        currentRow++;
        currentTile = 0;
        renderGrid();
        renderKeyboard();

        if (guess === target) {
          gameOver = true;
          setTimeout(() => alert('🎉 Outstanding! You solved it in ' + currentRow + ' tries!'), 300);
        } else if (currentRow === 6) {
          gameOver = true;
          setTimeout(() => alert('Game Over! The target word was: ' + target), 300);
        }
      } else if (key === 'BACK' || key === 'BACKSPACE') {
        if (currentTile > 0) {
          currentTile--;
          guesses[currentRow] = guesses[currentRow].slice(0, currentTile);
          renderGrid();
        }
      } else if (/^[A-Z]$/.test(key)) {
        if (currentTile < 5) {
          guesses[currentRow] += key;
          currentTile++;
          renderGrid();
        }
      }
    }

    document.addEventListener('keydown', e => {
      const k = e.key.toUpperCase();
      if (k === 'ENTER' || k === 'BACKSPACE' || /^[A-Z]$/.test(k)) {
        handleInput(k);
      }
    });

    document.getElementById('resetBtn').onclick = init;
    init();
  </script>
</body>
</html>`;
}

function synthesizeScrabbleGame() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>COREZ Scrabble Master</title>
  <style>
    :root {
      --bg: #09090b;
      --card: #121215;
      --border: #27272a;
      --text: #f4f4f5;
      --text-muted: #a1a1aa;
      --tile-bg: #eab308;
      --tile-text: #000000;
      --tw: #ef4444;
      --dw: #ec4899;
      --tl: #3b82f6;
      --dl: #38bdf8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1rem; }
    .game-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1rem; width: 100%; max-width: 480px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
    h1 { font-size: 1.25rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 0.5rem; color: #fff; }
    .status-bar { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.8rem; background: rgba(255,255,255,0.03); border-radius: 6px; border: 1px solid var(--border); margin-bottom: 0.75rem; font-size: 0.85rem; }
    .score-badge { font-weight: 700; color: #eab308; }
    .board { display: grid; grid-template-columns: repeat(11, 1fr); grid-template-rows: repeat(11, 1fr); gap: 2px; aspect-ratio: 1; background: #18181b; border: 2px solid var(--border); border-radius: 6px; padding: 4px; margin-bottom: 0.75rem; }
    .sq { background: #27272a; border-radius: 2px; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 700; cursor: pointer; user-select: none; position: relative; color: #71717a; text-transform: uppercase; }
    .sq.tw { background: var(--tw); color: #fff; }
    .sq.dw { background: var(--dw); color: #fff; }
    .sq.tl { background: var(--tl); color: #fff; }
    .sq.dl { background: var(--dl); color: #fff; }
    .sq.center { background: #eab308; color: #000; }
    .tile { width: 90%; height: 90%; background: var(--tile-bg); color: var(--tile-text); border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; font-weight: 800; position: relative; box-shadow: 0 2px 4px rgba(0,0,0,0.3); }
    .tile-sub { position: absolute; bottom: 1px; right: 2px; font-size: 0.55rem; font-weight: 700; }
    .tile.unsubmitted { outline: 2px solid #ffffff; animation: pulse 1s infinite alternate; }
    .rack-container { background: #18181b; border: 1px solid var(--border); border-radius: 8px; padding: 0.6rem; margin-bottom: 0.75rem; }
    .rack-label { font-size: 0.7rem; color: var(--text-muted); margin-bottom: 0.4rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .rack-tiles { display: flex; justify-content: center; gap: 6px; min-height: 42px; }
    .rack-tile { width: 38px; height: 38px; background: var(--tile-bg); color: var(--tile-text); border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 1rem; font-weight: 800; cursor: pointer; user-select: none; position: relative; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transition: transform 0.15s ease; }
    .rack-tile:hover { transform: translateY(-2px); }
    .rack-tile.selected { outline: 3px solid #6366f1; transform: translateY(-4px); }
    .controls { display: flex; gap: 0.4rem; justify-content: center; flex-wrap: wrap; }
    .btn { background: #fff; color: #000; border: none; padding: 0.55rem 1rem; border-radius: 6px; font-weight: 700; font-size: 0.75rem; cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em; }
    .btn:hover { opacity: 0.9; }
    .btn-sec { background: transparent; color: var(--text); border: 1px solid var(--border); }
    .btn-sec:hover { background: rgba(255,255,255,0.05); }
    @keyframes pulse { from { opacity: 0.85; } to { opacity: 1; } }
  </style>
</head>
<body>
  <div class="game-card">
    <h1>COREZ SCRABBLE</h1>
    <div class="status-bar">
      <span>Score: <span id="score" class="score-badge">0</span></span>
      <span>Tiles Left: <span id="bagCount" class="score-badge">80</span></span>
    </div>
    <div class="board" id="board"></div>
    <div class="rack-container">
      <div class="rack-label">Your Tile Rack (Click tile to select, then click board square)</div>
      <div class="rack-tiles" id="rack"></div>
    </div>
    <div class="controls">
      <button class="btn" id="submitBtn">Play Turn</button>
      <button class="btn btn-sec" id="recallBtn">Recall</button>
      <button class="btn btn-sec" id="shuffleBtn">Shuffle</button>
      <button class="btn btn-sec" id="resetBtn">New Game</button>
    </div>
  </div>
  <script>
    const POINTS = { A:1, B:3, C:3, D:2, E:1, F:4, G:2, H:4, I:1, J:8, K:5, L:1, M:3, N:1, O:1, P:3, Q:10, R:1, S:1, T:1, U:1, V:4, W:4, X:8, Y:4, Z:10 };

    const DICTIONARY = new Set([
      "AN","AT","BE","BY","DO","GO","HE","IN","IS","IT","ME","MY","NO","ON","OR","SO","TO","UP","WE",
      "ACT","ADD","AGE","AIR","AND","ANY","ART","BAD","BAG","BED","BIG","BOX","BOY","BUS","BUT","CAN","CAT","CAR","DAY","DOG","DRY","EAR","EAT","EGG","END","EYE","FAR","FLY","FOR","GET","GOD","GUN","HAT","HOT","ICE","JOB","KEY","KID","LAW","LEG","LET","LOW","MAN","MAP","NEW","NOT","NOW","OFF","OLD","ONE","OUR","OUT","PAY","PEN","PER","PET","PIN","POP","PUT","RED","RUN","SEA","SEE","SET","SIX","SUN","TAX","TEN","THE","TOP","TOY","TRY","TWO","USE","WAR","WAY","WIN","YES","YOU","ZOO",
      "ABLE","ACID","AGED","ALSO","AREA","ARMY","BABY","BACK","BALL","BAND","BANK","BASE","BATH","BEAR","BEAT","BELL","BEST","BIRD","BLOW","BLUE","BOAT","BODY","BOMB","BOND","BONE","BOOK","BOOM","BORN","BOSS","BOTH","BOWL","BULK","BURN","BUSH","BUSY","CALL","CALM","CAME","CAMP","CARD","CARE","CASE","CASH","CELL","CHAT","CHEF","CITY","CLUB","COAL","COAT","CODE","COLD","CORE","COST","DARK","DATA","DATE","DAWN","DEAD","DEAL","DEAR","DEBT","DEEP","DESK","DIET","DISK","DOOR","DOWN","DRAW","DROP","DUST","DUTY","EACH","EARN","EAST","EASY","EDGE","ELSE","EVEN","EVER","FACE","FACT","FAIR","FALL","FARM","FAST","FEAR","FEED","FEEL","FEET","FILE","FILL","FILM","FIND","FINE","FIRE","FIRM","FISH","FLAT","FLOW","FOOD","FOOT","FORD","FORM","FORT","FREE","FROM","FUEL","FULL","FUND","GAME","GIFT","GIRL","GIVE","GLAD","GOAL","GOLD","GOOD","GROW","GOLF","HALF","HAND","HARD","HARM","HEAD","HEAR","HEAT","HELL","HELP","HIGH","HOLD","HOLE","HOME","HOPE","HUGE","IDEA","INTO","ITEM","JOIN","JUMP","JUST","KEEP","KIND","KING","KNEW","KNOW","LACK","LADY","LAND","LANE","LAST","LATE","LEAD","LEFT","LESS","LIFE","LIFT","LIKE","LINE","LINK","LION","LIST","LIVE","LOAD","LOAN","LOCK","LOGO","LONG","LOOK","LORD","LOSS","LOVE","LUCK","MADE","MAIL","MAIN","MAKE","MALE","MANY","MARK","MASS","MEAL","MEAN","MEAT","MEET","MIND","MINE","MODE","MOON","MORE","MOST","MOVE","MUCH","NAME","NAVY","NEAR","NECK","NEED","NEWS","NEXT","NICE","NIGHT","NODE","NONE","NOSE","NOTE","OKAY","ONCE","ONLY","OPEN","OVER","PACE","PACK","PAGE","PAIN","PAIR","PARK","PART","PASS","PATH","PEAK","PLAN","PLAY","PLUS","POEM","POET","POLE","POOL","POOR","PORT","POST","PULL","PURE","PUSH","RACE","RAIL","RAIN","RANK","RARE","RATE","READ","REAL","RELY","REST","RICE","RICH","RIDE","RING","RISE","RISK","ROAD","ROCK","ROLE","ROLL","ROOF","ROOM","ROOT","ROSE","RULE","RUSH","SAFE","SAID","SAIL","SALE","SAME","SAVE","SEAT","SEED","SEEK","SEEM","SEEN","SELF","SELL","SEND","SHIP","SHOE","SHOP","SHOT","SHOW","SIDE","SIGN","SITE","SIZE","SKIN","SLIP","SLOW","SNOW","SOFT","SOIL","SOLD","SOLE","SOME","SONG","SOON","SORT","SOUL","SPOT","STAR","STAY","STEP","STOP","SUCH","SUIT","SURE","TAKE","TALK","TALL","TASK","TEAM","TEAR","TECH","TELL","TERM","TEST","TEXT","THAT","THEM","THEN","THIS","THUS","TIDE","TIME","TINY","TOLL","TONE","TOOK","TOOL","TOWN","TREE","TRIP","TRUE","TUBE","TURN","TYPE","UNIT","UPON","USER","VARY","VERY","VIEW","VOTE","WAGE","WAIT","WALK","WALL","WANT","WARM","WASH","WAVE","WAYS","WEAR","WEEK","WELL","WEST","WHAT","WHEN","WHICH","WIDE","WIFE","WILD","WILL","WIND","WINE","WING","WIRE","WISH","WITH","WOOD","WORD","WORK","YARD","YEAR","ZERO","ZONE",
      "ABOUT","ABOVE","ACCEPT","ACTION","ACTIVE","ACTUAL","ADVICE","AFFORD","AFRAID","AGENDA","AGREE","ALMOST","ALWAYS","ANIMAL","ANSWER","ANYONE","APPEAR","AUTHOR","BAKERY","BEAUTY","BEFORE","BEHIND","BETTER","BEYOND","BORDER","BOTTLE","BRANCH","BRIDGE","BRIGHT","BUDGET","CAMERA","CANCEL","CANDLE","CANYON","CAPTAIN","CARBON","CAREER","CASTLE","CEMENT","CENTER","CHANCE","CHANGE","CHARGE","CHEESE","CHOICE","CHURCH","CIRCLE","CLIENT","CHOICE","CLEVER","CLIENT","CLIMATE","COFFEE","COLLEGE","COMMON","CANDLE","COOKIE","COPPER","CORNER","COUSIN","CREDIT","CUSTOM","DAMAGE","DANGER","DEGREE","DESIGN","DESIRE","DETAIL","DEVICE","DIRECT","DOCTOR","DOMAIN","DRAGON","DRIVER","DURING","ENGINE","ENOUGH","ESCAPE","ESTATE","EXPERT","FAMILY","FARMER","FEATHER","FEMALE","FINGER","FLIGHT","FLOWER","FOREST","FORGET","FRIEND","FUTURE","GARDEN","GARLIC","GENIUS","GENTLE","GLOBAL","GOLDEN","HANDLE","HAPPINESS","HARBOR","HEALTH","HEAVEN","HEIGHT","HEROIC","HISTORY","HONEST","HONEY","HUNTER","IMPACT","ISLAND","JACKET","JOURNEY","JUNGLE","JUNIOR","KITCHEN","LADDER","LAWYER","LEADER","LEGEND","LESSON","LETTER","LIQUID","LISTEN","LITTLE","LIVING","LIZARD","LONELY","MAGNET","MAGIC","MANAGEMENT","MANUAL","MARKET","MASTER","MEMORY","MENTOR","METHOD","MIRROR","MODERN","MOMENT","MONKEY","MOTHER","MOUNTAIN","MUSEUM","NATURE","NEIGHBOR","NETWORK","NORMAL","NOTICE","NUMBER","OFFICE","ONLINE","ORANGE","ORIGIN","OXYGEN","PACKET","PALACE","PARNER","PATIENT","PATTERN","PEOPLE","PEPPER","PERSON","PLANET","PLAYER","POLICE","PORTRAIT","POSTAL","POWDER","POWERFUL","PRECIOUS","PREFIX","PRETTY","PRINCE","PRISON","PROFIT","PROMPT","PROPERTY","PROTECT","PUBLIC","PUPIL","PURPLE","PUZZLE","QUALITY","QUARTER","RABBIT","RANDOM","READER","REASON","RECORD","REGION","RESCUE","RESORT","RESULT","REWARD","RIVER","ROCKET","RUNNER","SAFETY","SALAD","SALMON","SAMPLE","SATURN","SAVING","SCHOOL","SCREEN","SEASON","SECOND","SECRET","SECTOR","SENIOR","SHADOW","SILVER","SIMPLE","SINGLE","SISTER","SOCKET","SILENT","SILVER","SKETCH","SLIDER","SMART","SOCKET","SOCKET","SOURCE","SPEAKER","SPIRIT","SPRING","SQUARE","STATION","STATUS","STREAM","STREET","STRONG","STUDENT","SUMMER","SUNDAY","SUPER","SUPPER","SWITCH","SYMBOL","SYSTEM","TARGET","TEMPLE","TENNIS","TERROR","THEORY","THICKET","TICKET","TIMBER","TOGETHER","TOMATO","TONIGHT","TOPIC","TOTAL","TOWARD","TRAVEL","TUNNEL","TURTLE","TWELVE","TWENTY","UNDER","UNIQUE","UPDATE","UPGRADE","VACUUM","VALLEY","VECTOR","VELVET","VICTORY","VILLAGE","VIRTUE","VISION","VOLUME","WALKER","WARNING","WEAPON","WEATHER","WEEKEND","WINNER","WINTER","WISDOM","WORKER","YELLOW"
    ]);

    const BOARD_SIZE = 11;
    let board = [], rack = [], bag = [], score = 0, selectedRackIdx = null, unsubmittedTiles = [];

    function getSquareType(r, c) {
      if (r === 5 && c === 5) return 'center';
      if ((r === 0 || r === 10) && (c === 0 || c === 10)) return 'tw';
      if ((r === 2 || r === 8) && (c === 2 || c === 8)) return 'dw';
      if ((r === 1 || r === 9) && (c === 5 || r === 5 && (c === 1 || c === 9))) return 'tl';
      if ((r === 3 || r === 7) && (c === 3 || c === 7)) return 'dl';
      return '';
    }

    function initBag() {
      bag = [];
      const distribution = { A:9, B:2, C:2, D:4, E:12, F:2, G:3, H:2, I:9, J:1, K:1, L:4, M:2, N:6, O:8, P:2, Q:1, R:6, S:4, T:6, U:4, V:2, W:2, X:1, Y:2, Z:1 };
      for (let char in distribution) {
        for (let i = 0; i < distribution[char]; i++) bag.push(char);
      }
      bag.sort(() => Math.random() - 0.5);
    }

    function drawTiles(count) {
      const drawn = [];
      while (drawn.length < count && bag.length > 0) {
        drawn.push(bag.pop());
      }
      return drawn;
    }

    function init() {
      initBag();
      score = 0;
      unsubmittedTiles = [];
      selectedRackIdx = null;
      board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
      rack = drawTiles(7);
      render();
    }

    function render() {
      document.getElementById('score').textContent = score;
      document.getElementById('bagCount').textContent = bag.length;

      const bEl = document.getElementById('board');
      bEl.innerHTML = '';
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          const sq = document.createElement('div');
          const sqType = getSquareType(r, c);
          sq.className = 'sq ' + sqType;

          const cell = board[r][c];
          if (cell) {
            const tile = document.createElement('div');
            tile.className = 'tile' + (cell.unsubmitted ? ' unsubmitted' : '');
            tile.innerHTML = cell.char + '<span class="tile-sub">' + POINTS[cell.char] + '</span>';
            sq.appendChild(tile);
          } else if (sqType) {
            sq.textContent = sqType.toUpperCase();
          }

          sq.onclick = () => onSquareClick(r, c);
          bEl.appendChild(sq);
        }
      }

      const rEl = document.getElementById('rack');
      rEl.innerHTML = '';
      rack.forEach((char, idx) => {
        const t = document.createElement('div');
        t.className = 'rack-tile' + (selectedRackIdx === idx ? ' selected' : '');
        t.innerHTML = char + '<span class="tile-sub">' + POINTS[char] + '</span>';
        t.onclick = () => {
          selectedRackIdx = selectedRackIdx === idx ? null : idx;
          render();
        };
        rEl.appendChild(t);
      });
    }

    function onSquareClick(r, c) {
      const cell = board[r][c];
      if (cell && cell.unsubmitted) {
        rack.push(cell.char);
        board[r][c] = null;
        unsubmittedTiles = unsubmittedTiles.filter(t => !(t.r === r && t.c === c));
        render();
        return;
      }

      if (!cell && selectedRackIdx !== null) {
        const char = rack[selectedRackIdx];
        rack.splice(selectedRackIdx, 1);
        selectedRackIdx = null;
        board[r][c] = { char, unsubmitted: true };
        unsubmittedTiles.push({ r, c, char });
        render();
      }
    }

    function recallUnsubmitted() {
      unsubmittedTiles.forEach(t => {
        rack.push(t.char);
        board[t.r][t.c] = null;
      });
      unsubmittedTiles = [];
      selectedRackIdx = null;
      render();
    }

    function submitTurn() {
      if (unsubmittedTiles.length === 0) {
        alert('Place at least 1 tile on the board to play your turn.');
        return;
      }

      const rows = new Set(unsubmittedTiles.map(t => t.r));
      const cols = new Set(unsubmittedTiles.map(t => t.c));
      if (rows.size > 1 && cols.size > 1) {
        alert('Tiles must be placed in a single straight row or column.');
        return;
      }

      const wordsFormed = [];

      function getHorizontalWord(r, c) {
        let startC = c;
        while (startC > 0 && board[r][startC - 1]) startC--;
        let endC = c;
        while (endC < BOARD_SIZE - 1 && board[r][endC + 1]) endC++;
        if (startC === endC) return null;
        let word = "", scoreMult = 1, wordPoints = 0;
        for (let i = startC; i <= endC; i++) {
          const cell = board[r][i];
          let p = POINTS[cell.char];
          if (cell.unsubmitted) {
            const type = getSquareType(r, i);
            if (type === 'dl') p *= 2;
            if (type === 'tl') p *= 3;
            if (type === 'dw') scoreMult *= 2;
            if (type === 'tw') scoreMult *= 3;
          }
          wordPoints += p;
          word += cell.char;
        }
        return { word, points: wordPoints * scoreMult };
      }

      function getVerticalWord(r, c) {
        let startR = r;
        while (startR > 0 && board[startR - 1][c]) startR--;
        let endR = r;
        while (endR < BOARD_SIZE - 1 && board[endR + 1][c]) endR++;
        if (startR === endR) return null;
        let word = "", scoreMult = 1, wordPoints = 0;
        for (let i = startR; i <= endR; i++) {
          const cell = board[i][c];
          let p = POINTS[cell.char];
          if (cell.unsubmitted) {
            const type = getSquareType(i, c);
            if (type === 'dl') p *= 2;
            if (type === 'tl') p *= 3;
            if (type === 'dw') scoreMult *= 2;
            if (type === 'tw') scoreMult *= 3;
          }
          wordPoints += p;
          word += cell.char;
        }
        return { word, points: wordPoints * scoreMult };
      }

      const testedWords = new Set();
      let turnScore = 0;

      unsubmittedTiles.forEach(t => {
        const h = getHorizontalWord(t.r, t.c);
        if (h && !testedWords.has(h.word)) {
          testedWords.add(h.word);
          wordsFormed.push(h);
        }
        const v = getVerticalWord(t.r, t.c);
        if (v && !testedWords.has(v.word)) {
          testedWords.add(v.word);
          wordsFormed.push(v);
        }
      });

      if (wordsFormed.length === 0) {
        alert('Your tile must connect with other letters to form a word.');
        return;
      }

      const invalid = wordsFormed.filter(w => !DICTIONARY.has(w.word));
      if (invalid.length > 0) {
        alert('Invalid word: "' + invalid[0].word + '" is not in the dictionary!');
        recallUnsubmitted();
        return;
      }

      wordsFormed.forEach(w => turnScore += w.points);

      unsubmittedTiles.forEach(t => {
        if (board[t.r][t.c]) delete board[t.r][t.c].unsubmitted;
      });

      score += turnScore;
      unsubmittedTiles = [];

      const needed = 7 - rack.length;
      if (needed > 0) {
        const drawn = drawTiles(needed);
        rack.push(...drawn);
      }

      render();
      alert('Success! Word accepted! +' + turnScore + ' points.');
    }

    document.getElementById('submitBtn').onclick = submitTurn;
    document.getElementById('recallBtn').onclick = recallUnsubmitted;
    document.getElementById('shuffleBtn').onclick = () => { rack.sort(() => Math.random() - 0.5); render(); };
    document.getElementById('resetBtn').onclick = init;

    init();
  </script>
</body>
</html>`;
}

function synthesizePlatformerGame() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>COREZ Super Mario Platformer</title>
  <style>
    :root {
      --bg: #09090b;
      --card: #121215;
      --border: #27272a;
      --text: #f4f4f5;
      --gold: #eab308;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1rem; }
    .game-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; width: 100%; max-width: 560px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
    h1 { font-size: 1.25rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 0.5rem; color: #fff; }
    .status-bar { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.8rem; background: rgba(255,255,255,0.03); border-radius: 6px; border: 1px solid var(--border); margin-bottom: 0.75rem; font-size: 0.85rem; font-family: monospace; }
    .badge { color: var(--gold); font-weight: 700; }
    canvas { background: #5c94fc; border: 2px solid var(--border); border-radius: 6px; display: block; margin: 0 auto 0.75rem auto; width: 100%; aspect-ratio: 1.6; image-rendering: pixelated; }
    .controls-hint { font-size: 0.75rem; color: #a1a1aa; margin-bottom: 0.75rem; }
    .btn-bar { display: flex; gap: 0.5rem; justify-content: center; }
    .btn { background: #fff; color: #000; border: none; padding: 0.6rem 1.2rem; border-radius: 6px; font-weight: 700; font-size: 0.75rem; cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em; }
    .btn:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="game-card">
    <h1>SUPER MARIO WORLD</h1>
    <div class="status-bar">
      <span>SCORE: <span id="scoreText" class="badge">0</span></span>
      <span>COINS: <span id="coinText" class="badge">🪙 0</span></span>
      <span>LIVES: <span id="livesText" class="badge">❤️ 3</span></span>
    </div>
    <canvas id="c" width="512" height="320"></canvas>
    <div class="controls-hint">Controls: <b>A / D / Arrow Keys</b> to Move • <b>Space / W / Up Arrow</b> to Jump</div>
    <div class="btn-bar">
      <button class="btn" id="restartBtn">Play Again</button>
    </div>
  </div>
  <script>
    const canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
    let state = { score: 0, coins: 0, lives: 3, gameOver: false, won: false, cameraX: 0 };
    let keys = {};
    window.addEventListener('keydown', e => { keys[e.key] = true; });
    window.addEventListener('keyup', e => { keys[e.key] = false; });

    let player = { x: 40, y: 200, w: 18, h: 26, vx: 0, vy: 0, grounded: false, facing: 'right' };
    let platforms = [
      { x: 0, y: 280, w: 750, h: 40, type: 'ground' },
      { x: 820, y: 280, w: 800, h: 40, type: 'ground' },
      { x: 140, y: 200, w: 24, h: 24, type: 'block' },
      { x: 180, y: 200, w: 24, h: 24, type: 'question', hit: false },
      { x: 204, y: 200, w: 24, h: 24, type: 'block' },
      { x: 228, y: 200, w: 24, h: 24, type: 'question', hit: false },
      { x: 252, y: 200, w: 24, h: 24, type: 'block' },
      { x: 340, y: 232, w: 36, h: 48, type: 'pipe' },
      { x: 460, y: 212, w: 36, h: 68, type: 'pipe' },
      { x: 560, y: 160, w: 96, h: 20, type: 'block' },
      { x: 610, y: 100, w: 24, h: 24, type: 'question', hit: false },
      { x: 860, y: 200, w: 120, h: 20, type: 'block' },
      { x: 1100, y: 256, w: 24, h: 24, type: 'stair' },
      { x: 1124, y: 232, w: 24, h: 48, type: 'stair' },
      { x: 1148, y: 208, w: 24, h: 72, type: 'stair' },
      { x: 1172, y: 184, w: 24, h: 96, type: 'stair' }
    ];

    let coins = [
      { x: 184, y: 160, taken: false },
      { x: 232, y: 160, taken: false },
      { x: 580, y: 130, taken: false },
      { x: 600, y: 130, taken: false },
      { x: 620, y: 130, taken: false },
      { x: 880, y: 170, taken: false },
      { x: 910, y: 170, taken: false }
    ];

    let enemies = [
      { x: 280, y: 258, w: 20, h: 22, vx: -1, alive: true },
      { x: 500, y: 258, w: 20, h: 22, vx: -1.2, alive: true },
      { x: 900, y: 178, w: 20, h: 22, vx: -1, alive: true },
      { x: 1000, y: 258, w: 20, h: 22, vx: -1.5, alive: true }
    ];

    let flagpole = { x: 1240, y: 100, w: 8, h: 180 };

    function resetGame() {
      state = { score: 0, coins: 0, lives: 3, gameOver: false, won: false, cameraX: 0 };
      player = { x: 40, y: 200, w: 18, h: 26, vx: 0, vy: 0, grounded: false, facing: 'right' };
      platforms.forEach(p => p.hit = false);
      coins.forEach(c => c.taken = false);
      enemies.forEach((e, i) => { e.alive = true; e.x = 280 + i * 240; e.vx = -1; });
      updateUI();
    }

    function updateUI() {
      document.getElementById('scoreText').textContent = state.score;
      document.getElementById('coinText').textContent = '🪙 ' + state.coins;
      document.getElementById('livesText').textContent = '❤️ ' + state.lives;
    }

    function update() {
      if (state.gameOver || state.won) return;

      if (keys['ArrowLeft'] || keys['a'] || keys['A']) { player.vx = -3.2; player.facing = 'left'; }
      else if (keys['ArrowRight'] || keys['d'] || keys['D']) { player.vx = 3.2; player.facing = 'right'; }
      else { player.vx *= 0.7; }

      if ((keys['ArrowUp'] || keys['w'] || keys['W'] || keys[' ']) && player.grounded) {
        player.vy = -10.5; player.grounded = false;
      }

      player.vy += 0.55; player.x += player.vx;
      platforms.forEach(p => {
        if (player.x < p.x + p.w && player.x + player.w > p.x && player.y < p.y + p.h && player.y + player.h > p.y) {
          if (player.vx > 0) player.x = p.x - player.w;
          else if (player.vx < 0) player.x = p.x + p.w;
        }
      });

      player.y += player.vy; player.grounded = false;
      platforms.forEach(p => {
        if (player.x < p.x + p.w && player.x + player.w > p.x && player.y < p.y + p.h && player.y + player.h > p.y) {
          if (player.vy > 0) { player.y = p.y - player.h; player.vy = 0; player.grounded = true; }
          else if (player.vy < 0) {
            player.y = p.y + p.h; player.vy = 0;
            if (p.type === 'question' && !p.hit) { p.hit = true; state.coins++; state.score += 100; updateUI(); }
          }
        }
      });

      if (player.y > 340) {
        state.lives--; updateUI();
        if (state.lives <= 0) { state.gameOver = true; }
        else { player.x = Math.max(40, state.cameraX + 20); player.y = 100; player.vy = 0; }
      }

      coins.forEach(c => {
        if (!c.taken && Math.hypot(player.x + 9 - c.x, player.y + 13 - c.y) < 18) {
          c.taken = true; state.coins++; state.score += 100; updateUI();
        }
      });

      enemies.forEach(e => {
        if (!e.alive) return;
        e.x += e.vx;
        if (e.x < 100 || e.x > 1150) e.vx *= -1;

        if (player.x < e.x + e.w && player.x + player.w > e.x && player.y < e.y + e.h && player.y + player.h > e.y) {
          if (player.vy > 0 && player.y + player.h - player.vy <= e.y + 8) {
            e.alive = false; player.vy = -7; state.score += 200; updateUI();
          } else {
            state.lives--; updateUI();
            if (state.lives <= 0) { state.gameOver = true; }
            else { player.x = Math.max(40, state.cameraX + 20); player.y = 100; player.vy = 0; }
          }
        }
      });

      if (player.x >= flagpole.x) { state.won = true; state.score += 1000; updateUI(); }
      state.cameraX = Math.max(0, player.x - 160);
    }

    function render() {
      ctx.clearRect(0, 0, 512, 320);
      ctx.save();
      ctx.translate(-state.cameraX, 0);

      ctx.fillStyle = '#5c94fc'; ctx.fillRect(state.cameraX, 0, 512, 320);
      ctx.fillStyle = '#ffffff';
      [100, 300, 600, 900, 1100].forEach(cx => {
        ctx.beginPath(); ctx.arc(cx, 60, 18, 0, Math.PI*2); ctx.arc(cx + 14, 55, 22, 0, Math.PI*2); ctx.arc(cx + 30, 60, 18, 0, Math.PI*2); ctx.fill();
      });

      ctx.fillStyle = '#00a800';
      [60, 420, 800].forEach(hx => { ctx.beginPath(); ctx.arc(hx, 280, 50, Math.PI, 0); ctx.fill(); });

      platforms.forEach(p => {
        if (p.type === 'ground') {
          ctx.fillStyle = '#c84c0c'; ctx.fillRect(p.x, p.y, p.w, p.h);
          ctx.fillStyle = '#00a800'; ctx.fillRect(p.x, p.y, p.w, 6);
        } else if (p.type === 'block' || p.type === 'stair') {
          ctx.fillStyle = '#c84c0c'; ctx.fillRect(p.x, p.y, p.w, p.h);
          ctx.strokeStyle = '#000'; ctx.strokeRect(p.x, p.y, p.w, p.h);
        } else if (p.type === 'question') {
          ctx.fillStyle = p.hit ? '#8b5a2b' : '#fc9838'; ctx.fillRect(p.x, p.y, p.w, p.h);
          ctx.strokeStyle = '#000'; ctx.strokeRect(p.x, p.y, p.w, p.h);
          if (!p.hit) { ctx.fillStyle = '#fff'; ctx.font = 'bold 14px monospace'; ctx.fillText('?', p.x + 7, p.y + 17); }
        } else if (p.type === 'pipe') {
          ctx.fillStyle = '#00a800'; ctx.fillRect(p.x, p.y, p.w, p.h);
          ctx.fillStyle = '#00d800'; ctx.fillRect(p.x - 2, p.y, p.w + 4, 10);
          ctx.strokeStyle = '#000'; ctx.strokeRect(p.x - 2, p.y, p.w + 4, 10); ctx.strokeRect(p.x, p.y + 10, p.w, p.h - 10);
        }
      });

      coins.forEach(c => {
        if (c.taken) return;
        ctx.fillStyle = '#fce000'; ctx.beginPath(); ctx.arc(c.x, c.y, 6, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#c88000'; ctx.stroke();
      });

      ctx.fillStyle = '#ffffff'; ctx.fillRect(flagpole.x, flagpole.y, flagpole.w, flagpole.h);
      ctx.fillStyle = '#fc9838'; ctx.beginPath(); ctx.arc(flagpole.x + 4, flagpole.y - 6, 8, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#fc0000'; ctx.beginPath(); ctx.moveTo(flagpole.x, flagpole.y + 10); ctx.lineTo(flagpole.x - 24, flagpole.y + 20); ctx.lineTo(flagpole.x, flagpole.y + 30); ctx.fill();

      enemies.forEach(e => {
        if (!e.alive) return;
        ctx.fillStyle = '#a81000'; ctx.fillRect(e.x, e.y, e.w, e.h);
        ctx.fillStyle = '#fff'; ctx.fillRect(e.x + 3, e.y + 4, 4, 6); ctx.fillRect(e.x + 13, e.y + 4, 4, 6);
        ctx.fillStyle = '#000'; ctx.fillRect(e.x + 5, e.y + 6, 2, 4); ctx.fillRect(e.x + 13, e.y + 6, 2, 4);
      });

      // Mario player
      ctx.fillStyle = '#e52521'; ctx.fillRect(player.x, player.y, player.w, player.h);
      ctx.fillStyle = '#0020c2'; ctx.fillRect(player.x + 2, player.y + 14, player.w - 4, 12);
      ctx.fillStyle = '#fcc082'; ctx.fillRect(player.x + (player.facing === 'right' ? 6 : 2), player.y + 4, 10, 8);
      ctx.fillStyle = '#000000'; ctx.fillRect(player.x + (player.facing === 'right' ? 12 : 4), player.y + 6, 3, 3);
      ctx.fillRect(player.x + (player.facing === 'right' ? 8 : 2), player.y + 10, 8, 3);

      ctx.restore();

      if (state.gameOver) {
        ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, 0, 512, 320);
        ctx.fillStyle = '#ef4444'; ctx.font = 'bold 24px monospace'; ctx.textAlign = 'center'; ctx.fillText('GAME OVER', 256, 140);
        ctx.fillStyle = '#ffffff'; ctx.font = '14px monospace'; ctx.fillText('Click "Play Again" to restart mission', 256, 180);
      } else if (state.won) {
        ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, 0, 512, 320);
        ctx.fillStyle = '#10b981'; ctx.font = 'bold 24px monospace'; ctx.textAlign = 'center'; ctx.fillText('COURSE CLEAR!', 256, 140);
        ctx.fillStyle = '#ffffff'; ctx.font = '14px monospace'; ctx.fillText('Final Score: ' + state.score + ' | Coins: ' + state.coins, 256, 180);
      }
    }

    function loop() { update(); render(); requestAnimationFrame(loop); }
    document.getElementById('restartBtn').onclick = resetGame;
    resetGame(); loop();
  </script>
</body>
</html>`;
}

function synthesizeFinancialTerminal() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>COREZ Financial Demo Terminal</title>
  <style>
    :root {
      --bg: #09090b;
      --card: #121215;
      --border: #27272a;
      --text: #f4f4f5;
      --muted: #a1a1aa;
      --green: #10b981;
      --red: #ef4444;
      --accent: #6366f1;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; }
    body { background: var(--bg); color: var(--text); min-height: 100vh; padding: 1.5rem; display: flex; flex-direction: column; align-items: center; }
    .terminal-container { width: 100%; max-width: 860px; background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; box-shadow: 0 8px 32px rgba(0,0,0,0.5); }
    .header-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.2rem; flex-wrap: wrap; gap: 0.8rem; border-bottom: 1px solid var(--border); padding-bottom: 0.8rem; }
    .title { font-size: 1.1rem; font-weight: 800; letter-spacing: 0.05em; display: flex; align-items: center; gap: 0.5rem; }
    .status-badge { font-size: 0.7rem; padding: 0.2rem 0.5rem; background: rgba(16, 185, 129, 0.15); color: var(--green); border: 1px solid var(--green); border-radius: 4px; font-weight: 700; text-transform: uppercase; }
    .search-box { display: flex; gap: 0.5rem; width: 100%; max-width: 320px; }
    .search-input { width: 100%; background: var(--bg); border: 1px solid var(--border); color: #fff; padding: 0.5rem 0.8rem; border-radius: 6px; font-size: 0.85rem; }
    .search-input:focus { outline: none; border-color: var(--accent); }
    .ticker-bar { display: flex; gap: 0.6rem; overflow-x: auto; padding-bottom: 0.6rem; margin-bottom: 1rem; border-bottom: 1px solid var(--border); }
    .ticker-chip { background: rgba(255,255,255,0.03); border: 1px solid var(--border); padding: 0.45rem 0.75rem; border-radius: 6px; cursor: pointer; white-space: nowrap; font-size: 0.8rem; transition: 0.2s; }
    .ticker-chip:hover, .ticker-chip.active { background: var(--border); border-color: var(--accent); }
    .main-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 1rem; }
    @media (max-width: 768px) { .main-grid { grid-template-columns: 1fr; } }
    .chart-card { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; }
    .asset-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 1rem; }
    .asset-symbol { font-size: 1.4rem; font-weight: 800; }
    .asset-price { font-size: 1.6rem; font-weight: 800; font-family: monospace; }
    .asset-change { font-size: 0.85rem; font-weight: 700; margin-left: 0.5rem; }
    .asset-change.up { color: var(--green); }
    .asset-change.down { color: var(--red); }
    .timeframes { display: flex; gap: 0.3rem; margin-bottom: 1rem; }
    .tf-btn { background: transparent; border: 1px solid var(--border); color: var(--muted); padding: 0.3rem 0.6rem; border-radius: 4px; font-size: 0.75rem; cursor: pointer; }
    .tf-btn.active { background: #fff; color: #000; font-weight: 700; }
    svg.chart { width: 100%; height: 220px; overflow: visible; }
    .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.6rem; margin-top: 1rem; font-size: 0.8rem; border-top: 1px solid var(--border); padding-top: 0.8rem; }
    .stat-item { display: flex; justify-content: space-between; color: var(--muted); }
    .stat-val { color: var(--text); font-weight: 700; }
    .side-panel { display: flex; flex-direction: column; gap: 1rem; }
    .panel-card { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; }
    .panel-title { font-size: 0.85rem; font-weight: 700; margin-bottom: 0.8rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .converter-row { display: flex; flex-direction: column; gap: 0.6rem; }
    .conv-input { background: var(--card); border: 1px solid var(--border); color: #fff; padding: 0.5rem; border-radius: 6px; font-size: 0.85rem; }
    .conv-result { font-size: 1.1rem; font-weight: 800; color: var(--green); margin-top: 0.4rem; text-align: center; }
  </style>
</head>
<body>
  <div class="terminal-container">
    <div class="header-bar">
      <div class="title">
        <span>COREZ FINANCIAL DEMO TERMINAL</span>
        <span class="status-badge">DEMO DATA</span>
      </div>
      <div class="search-box">
        <input type="text" id="searchInput" class="search-input" placeholder="Search AAPL, NVDA, BTC, EUR/USD...">
      </div>
    </div>

    <div class="ticker-bar" id="tickerBar"></div>

    <div class="main-grid">
      <div class="chart-card">
        <div class="asset-header">
          <div>
            <span class="asset-symbol" id="assetSymbol">AAPL</span>
            <span class="asset-change up" id="assetChange">+1.42%</span>
          </div>
          <div class="asset-price" id="assetPrice">$333.69</div>
        </div>

        <div class="timeframes">
          <button class="tf-btn active">1D</button>
          <button class="tf-btn">1W</button>
          <button class="tf-btn">1M</button>
          <button class="tf-btn">1Y</button>
        </div>

        <svg class="chart" id="chartSvg" viewBox="0 0 500 200"></svg>

        <div class="stats-grid">
          <div class="stat-item"><span>High (24h)</span><span class="stat-val" id="statHigh">$335.20</span></div>
          <div class="stat-item"><span>Low (24h)</span><span class="stat-val" id="statLow">$329.10</span></div>
          <div class="stat-item"><span>Volume</span><span class="stat-val" id="statVol">48.2M</span></div>
          <div class="stat-item"><span>Market Cap</span><span class="stat-val" id="statCap">$5.12T</span></div>
        </div>
      </div>

      <div class="side-panel">
        <div class="panel-card">
          <div class="panel-title">FX & Currency Converter</div>
          <div class="converter-row">
            <input type="number" id="convAmount" class="conv-input" value="100">
            <select id="convFrom" class="conv-input">
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="JPY">JPY (¥)</option>
            </select>
            <select id="convTo" class="conv-input">
              <option value="EUR">EUR (€)</option>
              <option value="USD">USD ($)</option>
              <option value="GBP">GBP (£)</option>
              <option value="JPY">JPY (¥)</option>
            </select>
            <div class="conv-result" id="convResult">€87.66</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const ASSETS = {
      'AAPL': { name: 'Apple Inc.', price: 333.69, change: '+1.42%', high: 335.20, low: 329.10, vol: '48.2M', cap: '$5.12T', points: [329, 330, 331.5, 331, 333, 332.8, 333.69] },
      'NVDA': { name: 'NVIDIA Corp.', price: 207.06, change: '+2.85%', high: 209.40, low: 201.50, vol: '62.4M', cap: '$5.08T', points: [201, 203, 204, 206, 205.5, 208, 207.06] },
      'TSLA': { name: 'Tesla Inc.', price: 379.76, change: '-0.65%', high: 384.10, low: 375.00, vol: '34.8M', cap: '$1.21T', points: [383, 381, 379, 377, 380, 378, 379.76] },
      'BTC': { name: 'Bitcoin', price: 65000.00, change: '+1.30%', high: 65500, low: 64000, vol: '$32.1B', cap: '$1.31T', points: [64000, 64300, 64800, 64600, 65000] },
      'ETH': { name: 'Ethereum', price: 1930.83, change: '+0.40%', high: 1955, low: 1910, vol: '$14.2B', cap: '$232B', points: [1910, 1925, 1920, 1940, 1935, 1930, 1930.83] },
      'EUR/USD': { name: 'Euro / USD', price: 1.1407, change: '+0.07%', high: 1.1425, low: 1.1390, vol: 'Forex', cap: 'N/A', points: [1.139, 1.1398, 1.1402, 1.1412, 1.1405, 1.1407] },
      'GOLD': { name: 'Gold Spot', price: 2400.00, change: '+0.85%', high: 2410, low: 2380, vol: 'Futures', cap: 'N/A', points: [2380, 2388, 2395, 2390, 2400] }
    };

    const FX = { USD: 1.0, EUR: 0.8766, GBP: 0.7505, JPY: 148.80 };
    let currentSymbol = 'AAPL';

    async function fetchLiveMarketData() {
      try {
        // Fetch Live Crypto from CoinGecko API
        const cryptoRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true');
        if (cryptoRes.ok) {
          const cData = await cryptoRes.json();
          if (cData.bitcoin) {
            ASSETS['BTC'].price = cData.bitcoin.usd;
            ASSETS['BTC'].change = (cData.bitcoin.usd_24h_change >= 0 ? '+' : '') + cData.bitcoin.usd_24h_change.toFixed(2) + '%';
          }
          if (cData.ethereum) {
            ASSETS['ETH'].price = cData.ethereum.usd;
            ASSETS['ETH'].change = (cData.ethereum.usd_24h_change >= 0 ? '+' : '') + cData.ethereum.usd_24h_change.toFixed(2) + '%';
          }
        }
      } catch (e) {
        console.warn('Crypto API live fetch fallback active', e);
      }

      try {
        // Fetch Live FX rates from Frankfurter (ECB Data API)
        const fxRes = await fetch('https://api.frankfurter.app/latest?from=USD');
        if (fxRes.ok) {
          const fxData = await fxRes.json();
          if (fxData.rates) {
            FX.EUR = fxData.rates.EUR || FX.EUR;
            FX.GBP = fxData.rates.GBP || FX.GBP;
            FX.JPY = fxData.rates.JPY || FX.JPY;
            if (fxData.rates.EUR) {
              ASSETS['EUR/USD'].price = (1 / fxData.rates.EUR).toFixed(4);
            }
          }
        }
      } catch (e) {
        console.warn('FX API live fetch fallback active', e);
      }

      renderTickers();
      selectAsset(currentSymbol);
      setupConverter();
    }

    function init() {
      renderTickers();
      selectAsset('AAPL');
      setupConverter();
      fetchLiveMarketData();

      document.getElementById('searchInput').addEventListener('input', e => {
        const query = e.target.value.toUpperCase().trim();
        if (ASSETS[query]) selectAsset(query);
      });

      // Periodically refresh live price data every 15 seconds
      setInterval(fetchLiveMarketData, 15000);
    }

    function renderTickers() {
      const bar = document.getElementById('tickerBar');
      bar.innerHTML = Object.keys(ASSETS).map(sym => \`
        <div class="ticker-chip \${sym === currentSymbol ? 'active' : ''}" onclick="selectAsset('\${sym}')">
          <b>\${sym}</b> $\${ASSETS[sym].price}
        </div>
      \`).join('');
    }

    function selectAsset(sym) {
      currentSymbol = sym;
      renderTickers();
      const a = ASSETS[sym];
      document.getElementById('assetSymbol').textContent = sym + ' (' + a.name + ')';
      document.getElementById('assetPrice').textContent = (sym.includes('/') || sym === 'GOLD' ? '' : '$') + a.price;
      const chgEl = document.getElementById('assetChange');
      chgEl.textContent = a.change;
      chgEl.className = 'asset-change ' + (a.change.startsWith('+') ? 'up' : 'down');
      document.getElementById('statHigh').textContent = a.high;
      document.getElementById('statLow').textContent = a.low;
      document.getElementById('statVol').textContent = a.vol;
      document.getElementById('statCap').textContent = a.cap;
      renderSVGChart(a.points, a.change.startsWith('+'));
    }

    function renderSVGChart(pts, isUp) {
      const svg = document.getElementById('chartSvg');
      const min = Math.min(...pts), max = Math.max(...pts);
      const range = (max - min) || 1;
      const coords = pts.map((val, idx) => {
        const x = (idx / (pts.length - 1)) * 480 + 10;
        const y = 180 - ((val - min) / range) * 150;
        return \`\${x},\${y}\`;
      }).join(' ');

      const color = isUp ? '#10b981' : '#ef4444';
      svg.innerHTML = \`
        <polyline fill="none" stroke="\${color}" stroke-width="3" points="\${coords}" />
        \${pts.map((val, idx) => {
          const x = (idx / (pts.length - 1)) * 480 + 10;
          const y = 180 - ((val - min) / range) * 150;
          return \`<circle cx="\${x}" cy="\${y}" r="4" fill="\${color}" />\`;
        }).join('')}
      \`;
    }

    function setupConverter() {
      const amount = document.getElementById('convAmount');
      const from = document.getElementById('convFrom');
      const to = document.getElementById('convTo');
      const res = document.getElementById('convResult');
      function calc() {
        const amt = parseFloat(amount.value) || 0;
        const inUSD = amt / FX[from.value];
        const out = inUSD * FX[to.value];
        res.textContent = out.toFixed(2) + ' ' + to.value;
      }
      [amount, from, to].forEach(el => el.addEventListener('input', calc));
      calc();
    }

    init();
  </script>
</body>
</html>`;
}

// DYNAMIC GAME & APP SYNTHESIZER ENGINE (Kimi 2.7 Code Driven)
function synthesizeCustomGame(prompt) {
  const clean = prompt.trim();
  const lower = clean.toLowerCase();

  if (lower.includes('financial') || lower.includes('finance') || lower.includes('stock') || lower.includes('crypto') || lower.includes('market') || lower.includes('terminal') || lower.includes('forex') || lower.includes('ticker')) {
    return {
      title: 'COREZ Financial Demo Terminal',
      html: synthesizeFinancialTerminal()
    };
  }

  if (lower.includes('mario') || lower.includes('platformer') || lower.includes('jump') || lower.includes('run')) {
    return {
      title: 'COREZ Super Mario World',
      html: synthesizePlatformerGame()
    };
  }

  if (lower.includes('wordle') || (lower.includes('word') && lower.includes('guess'))) {
    return {
      title: 'COREZ Wordle Master',
      html: synthesizeWordleGame()
    };
  }

  if (lower.includes('scrabble') || lower.includes('tile') || lower.includes('anagram') || lower.includes('crossword') || lower.includes('word game')) {
    return {
      title: 'COREZ Scrabble Master',
      html: synthesizeScrabbleGame()
    };
  }

  if (lower.includes('chess')) {
    const withBot = lower.includes('bot') || lower.includes('enemy');
    return {
      title: withBot ? 'COREZ Chess App (vs Bot)' : 'COREZ Chess App',
      html: synthesizeChessGame(withBot)
    };
  }

  if (lower.includes('space') || lower.includes('retro') || lower.includes('shooter') || lower.includes('arcade') || lower.includes('ship')) {
    return {
      title: 'COREZ Retro Space Game',
      html: synthesizeRetroSpaceGame()
    };
  }

  if (lower.includes('bot') || lower.includes('enemy')) {
    return {
      title: 'COREZ Bot Enemy Simulator',
      html: synthesizeBotEnemyGame()
    };
  }

  const gameTitle = clean.replace(/(create|build|make|generate|a|an|the|game|play|app|widget|prototype)/gi, '').trim() || 'Interactive App';
  const capitalizedTitle = gameTitle.charAt(0).toUpperCase() + gameTitle.slice(1);

  return {
    title: `COREZ ${capitalizedTitle} App`,
    html: synthesizePlatformerGame()
  };
}

// Generate concise, natural AI responses for any public user
export async function generateLocalAIResponse(prompt) {
  const cleanPrompt = prompt.trim();
  const lower = cleanPrompt.toLowerCase();
  const intent = analyzePublicUserIntent(cleanPrompt);

  // Natural short latency (0.6s)
  await new Promise(r => setTimeout(r, 600));

  // 1. GREETINGS & SMALL TALK (Universal & Natural)
  if (/^(hello|hi|hey|greetings|good morning|good afternoon|good evening|howdy|sup)(\s|!|\.|\?|$)/i.test(lower) || lower.includes('who are you') || lower.includes('what can you do')) {
    return `Hello! I'm COREZ AI. How can I help you today?`;
  }

  if (/^(how are you|how is it going|how's it going)(\s|!|\.|\?|$)/i.test(lower)) {
    return `Doing great! Ready to help whenever you are. What's on your mind?`;
  }

  // 2. GRATITUDE INTENT
  if (/^(thanks|thank you|awesome|great|cool|nice|perfect)(\s|!|\.|$)/i.test(lower)) {
    return `You're very welcome! Let me know if there's anything else I can help with.`;
  }

  // 3. PUBLIC APP / GAME / WIDGET CREATION INTENT
  if (intent.type === 'app') {
    const gameResult = synthesizeCustomGame(cleanPrompt);
    return `I've created **${gameResult.title}** for you! Click below to open it live in the preview canvas on the right side.\n\n\`\`\`html\n${gameResult.html}\n\`\`\``;
  }

  // 4. PUBLIC USER INTENT RESPONSES
  if (intent.type === 'code-help') {
    return `I understand the goal: ${intent.summary}\n\nShare the snippet, error message, or file you are working on. I’ll walk through what is happening, identify the likely cause, propose a fix, and explain how to verify it so you can move forward without guessing.`;
  }

  if (intent.type === 'writing') {
    return `I understand the goal: ${intent.summary}\n\nSend me the rough text, audience, and tone you want. I’ll turn it into clear public-facing copy, tighten the message, and give you a polished version plus a short explanation of why it works.`;
  }

  if (intent.type === 'explanation') {
    return `I understand the goal: ${intent.summary}\n\nHere’s the useful way to think about **"${cleanPrompt}"**:\n\nStart with the core idea, then connect it to what the user is trying to accomplish. From there, separate the topic into simple parts, explain why each part matters, and end with the next action someone should take. If you want, I can also turn this into a step-by-step guide or a shorter public-facing explanation.`;
  }

  return `I understand the goal: ${intent.summary}\n\nFor **"${cleanPrompt}"**, I’ll focus on what the public user is trying to accomplish and give a practical path forward.\n\nA good next step is to define the outcome, the audience, and the format you want. Once those are clear, I can help turn the idea into a plan, a written answer, code, or a live preview depending on what you need.`;
}

const IMAGE_PATTERNS = /\b(generate|create|draw|make|render|show|flux)\b.*\b(image|picture|photo|logo|illustration|artwork|wallpaper|drawing|graphic)\b|\b(image|picture|photo|logo|illustration|artwork|wallpaper|drawing|graphic)\b.*\b(generate|create|draw|make|render|flux)\b/i;

export async function generateAIResponse(prompt, history = [], signal = null) {
  const cleanPrompt = prompt.trim();
  const intent = analyzePublicUserIntent(cleanPrompt);

  const marketRequest = intent.type === 'app' ? null : parseMarketIntent(cleanPrompt);
  if (marketRequest) {
    try {
      const market = await fetchMarketData(marketRequest, signal);
      return { type: 'market', request: marketRequest, market };
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      return { type: 'market', request: marketRequest, market: unavailableMarket(error) };
    }
  }

  // If this is the first message and it obviously asks for an image, we can skip the LLM overhead.
  if (history.length <= 1 && (IMAGE_PATTERNS.test(cleanPrompt) || cleanPrompt.toLowerCase().startsWith('image:') || cleanPrompt.toLowerCase().startsWith('flux:'))) {
    try {
      const imageUrl = await generateFluxImage(cleanPrompt, signal);
      if (imageUrl) {
        return `Here is your generated image:\n\n![${cleanPrompt}](${imageUrl})`;
      }
    } catch (imgError) {
      if (imgError?.name === 'AbortError') throw imgError;
      console.warn('FLUX image generation error; falling back to standard text response.', imgError);
    }
  }

  try {
    const hostedAiResponse = await generateHostedAIResponse(cleanPrompt, intent, history, signal);
    if (hostedAiResponse) {
      // Check if the AI decided to generate an image
      const imageMatch = hostedAiResponse.match(/\[IMAGE_PROMPT:\s*(.*?)\]/i);
      if (imageMatch) {
        const imagePrompt = imageMatch[1].trim();
        try {
          const imageUrl = await generateFluxImage(imagePrompt, signal);
          if (imageUrl) {
             // Replace the tag with the actual image markdown
             return hostedAiResponse.replace(imageMatch[0], `![${imagePrompt}](${imageUrl})`);
          }
        } catch (imgError) {
          if (imgError?.name === 'AbortError') throw imgError;
          console.warn('FLUX image generation error from AI tag.', imgError);
        }
      }
      return hostedAiResponse;
    }
  } catch (hostedAiError) {
    if (hostedAiError?.name === 'AbortError') throw hostedAiError;
    console.warn('Hosted AI unavailable; using local Corez fallback.', hostedAiError);
  }

  return generateLocalAIResponse(cleanPrompt);
}
