// COREZ Project State
//
// Lightweight structured memory for generated projects, separate from raw
// chat history. The worker derives it deterministically from the latest
// assistant code reply, the client can persist it and send it back with
// follow-up requests (body.project), and it is rendered into the system
// prompt as explicit CURRENT STATE / USER REQUEST / REQUIRED CHANGE /
// PRESERVE guidance so modification turns edit the existing project instead
// of regenerating it.

import { extractCodeBlocks } from './responseProcessor.js';

const FEATURE_ALIASES = {
  'game-loop': /\b(requestAnimationFrame|gameLoop|update\s*\(|setInterval\s*\()/i,
  controls: /\b(keydown|keyup|addEventListener\s*\(\s*['"]key|onKeyDown|touchstart|pointerdown)/i,
  scoring: /\b(score|points)\b/i,
  collision: /\b(collide|collision|intersect|isTouching|overlap|hitTest)\b/i,
  canvas: /\b(getContext\s*\(\s*['"]2d|canvas)\b/i,
  restart: /\b(restart|reset)\b/i,
  'game-over': /\b(game[- ]?over|gameOver)\b/i
};

function cleanList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 40);
}

// Validate and normalize a client-supplied project state object.
export function parseProjectState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const projectType = typeof raw.projectType === 'string' ? raw.projectType.trim().toLowerCase() : null;
  const framework = typeof raw.framework === 'string' ? raw.framework.trim().toLowerCase() : 'unknown';
  const language = typeof raw.language === 'string' ? raw.language.trim().toLowerCase() : 'javascript';
  const rendering = typeof raw.rendering === 'string' ? raw.rendering.trim().toLowerCase() : null;
  if (framework !== 'unknown' && !/^[a-z0-9+-]{1,32}$/.test(framework)) return null;
  if (projectType && !/^[a-z0-9-]{1,32}$/.test(projectType)) return null;
  if (rendering && !/^[a-z0-9-]{1,32}$/.test(rendering)) return null;
  if (language && !/^[a-z0-9+-]{1,32}$/.test(language)) return null;
  return {
    projectType,
    framework,
    language,
    rendering,
    features: cleanList(raw.features),
    importantFiles: cleanList(raw.importantFiles),
    constraints: cleanList(raw.constraints),
    recentChanges: cleanList(raw.recentChanges)
  };
}

// Deterministically derive a project state object from the conversation so a
// follow-up request always knows the current implementation even when the
// client sends no structured state.
export function deriveProjectState(messages) {
  const history = Array.isArray(messages) ? messages : [];
  const assistantReplies = history
    .filter((m) => m?.role === 'assistant' && typeof m?.content === 'string')
    .map((m) => m.content);
  const latest = assistantReplies[assistantReplies.length - 1] || '';
  const blocks = extractCodeBlocks(latest);
  const code = blocks.map((b) => b.code).join('\n');
  if (!code.trim()) return null;

  const project = {
    projectType: null,
    framework: 'unknown',
    language: 'javascript',
    rendering: null,
    features: [],
    importantFiles: [],
    constraints: [],
    recentChanges: []
  };

  if (/<canvas[\s>]/i.test(code) || /\bgetContext\s*\(\s*['"]2d/.test(code)) {
    project.rendering = 'canvas';
  }

  const jsx = /\b(import\s+.*\bReact\b|ReactDOM|export default function \w+\s*\(|useState|useEffect)/.test(code);
  const html = /<html[\s>]/i.test(code);
  const ts = /\b(interface|: string|: number|as const)\b/.test(code) && /\b(\.tsx?|typescript)\b/.test(blocks.map((b) => b.lang).join(','));

  if (jsx || blocks.some((b) => b.lang === 'jsx')) {
    project.framework = 'react';
    project.language = ts ? 'typescript' : 'javascript';
  } else if (html && !jsx) {
    project.framework = 'html';
    project.language = 'html-css-js';
  }

  if (/<canvas[\s>]/i.test(code) || /\b(game|player|enemy|level|score)\b/i.test(code)) {
    project.projectType = 'game';
  } else if (html || jsx) {
    project.projectType = 'website';
  } else {
    project.projectType = 'app';
  }

  for (const [feature, pattern] of Object.entries(FEATURE_ALIASES)) {
    if (pattern.test(code)) project.features.push(feature);
  }

  return project;
}

// True when the request reads like a follow-up change to an existing project
// (the project must already exist for this to make sense).
export function isFollowUpRequest(prompt, project) {
  if (!project || project.framework === 'unknown') return false;
  return /^(now|then|also|instead|actually|please|can you|could you)?\s*(make|change|add|remove|update|fix|modify|edit|undo|revert|switch|convert|replace|speed|slow|color|colour|blue|red|green|style|controls|touch|mobile|paddle|ball|snake|player|enemy|level|background|sound|score)/i.test(String(prompt || '').trim())
    || /\b(now|also|instead|don'?t change|keep|preserve|undo|revert)\b/i.test(String(prompt || ''));
}

// Render the project context section injected into the system prompt for
// follow-up (modification) turns. Keeps the internal analysis invisible to
// the end user.
export function buildProjectContextSection(project, userPrompt) {
  if (!project) return '';
  const state = parseProjectState(project) || project;
  const features = Array.isArray(state.features) && state.features.length > 0
    ? state.features.map((f) => `- ${f}`).join('\n')
    : '- (none recorded)';
  return `
EXISTING PROJECT STATE (an earlier turn created this project — inspect it before answering):
- Project type: ${state.projectType || 'unknown'}
- Framework: ${state.framework}
- Language: ${state.language}
- Rendering: ${state.rendering || 'not recorded'}
- Known features (must remain working unless the user explicitly asks otherwise):
${features}

FOLLOW-UP REQUEST (this turn modifies the existing project):
${String(userPrompt || '').slice(0, 600)}

REQUIRED BEHAVIOUR FOR FOLLOW-UPS:
- This is a MODIFICATION request, not a fresh build. Do NOT regenerate the entire project from scratch.
- Apply the smallest change that satisfies the request: edit the existing implementation.
- PRESERVE the existing framework (${state.framework}), language (${state.language}), structure, naming conventions, styling, controls, scoring, game-over, restart and all features listed above unless the change explicitly requires otherwise.
- Keep the same code format and architecture as the previous answer (same language of code fences, same React/JSX or HTML/CSS/JS structure).
- Describe what changed and confirm what was preserved; never claim a change to something that did not previously exist (for example, never say "instead of discrete levels" if the previous version had no levels).
- If the user asks to undo a previous change, restore the earlier behaviour while keeping later unrelated changes.
`;
}

// Render the project state for the client to persist (no instructions, just
// data).
export function serializeProjectState(project) {
  const parsed = parseProjectState(project);
  if (!parsed) return null;
  return parsed;
}
