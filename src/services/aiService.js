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
import { buildAwwwardsDesignPrompt } from '../../packages/agent-core/context/designTokens.js';
import { resolveSkills } from '../skills/resolver.js';
import { synthesizeCustomGame } from '../games/index.js';

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
    const awwwardsSpec = buildAwwwardsDesignPrompt(cleanPrompt);
    const isExplicitNonJsx = /\b(html\b|css\b|vanilla|plain html|pure html|html\/css|raw html|html\s*\+\s*css|vanilla js)\b/i.test(cleanPrompt);

    if (isExplicitNonJsx) {
      return `${cleanPrompt}

${awwwardsSpec}

[SINGLE-FILE HTML/CSS/JS SPECIFICATION]:
- ALWAYS begin your response with a clear, detailed overview explaining the features, layout, and styling choices!
- Ensure proper visual layering and z-index stacking hierarchy (Background z-index:0 -> Content z-index:10 -> HUD/Toolbars z-index:20-30 -> Modals/Overlays z-index:40-50+) so elements don't obscure interactive controls!
- Output complete, clean HTML/CSS/JS code inside ONE SINGLE \`\`\`html ... \`\`\` code block including inline \`<style>\` and \`<script>\` tags.
- Build a complete, responsive, standalone experience ready for the preview canvas.
- ALWAYS end your response with a step-by-step user guide and feature summary after the code block! Never output ONLY a bare code block.`;
    }

    return `${cleanPrompt}

${awwwardsSpec}

[SINGLE-FILE REACT SPECIFICATION]:
- ALWAYS begin your response with a clear, detailed overview explaining the features, architecture, styling decisions, and layout choices!
- Ensure proper visual layering and z-index stacking hierarchy (Background z-index:0 -> Content z-index:10 -> HUD/Toolbars z-index:20-30 -> Modals/Overlays z-index:40-50+) so elements don't obscure interactive controls!
- Output clean, modern React/JSX code inside ONE SINGLE \`\`\`jsx ... \`\`\` code block starting with \`export default function App()\`.
- DO NOT wrap React code inside HTML boilerplate (\`<!DOCTYPE html>\`, \`<head>\`, \`<script type="text/babel">\`, or \`ReactDOM.createRoot()\`) because the preview canvas automatically compiles and renders React/JSX code!
- Do NOT split your output into multiple separate code blocks, file headers (// App.tsx, // components/Navbar.tsx), or relative file imports (import Navbar from './components/Navbar').
- Define all child components (Navbar, Hero, Footer, etc.) inline within the SAME file BEFORE the main App component!
- ALWAYS end your response with a step-by-step user guide and feature summary after the code block! Never output ONLY a bare code block.`;
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

  const resolvedSkills = resolveSkills({
    intent: intent?.type || 'general',
    prompt,
    registry: defaultSkillRegistry
  });

  const fetchOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prompt, intent, messages: history, skills: resolvedSkills })
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

export { synthesizeCustomGame };

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
