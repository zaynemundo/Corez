/**
 * CoreZ Prompt Architect
 *
 * Converts structured intent + requirements + context into a high-quality
 * execution prompt.  Does not change the user's underlying goal.
 */

import { INTENT_TYPES, COMPLEXITY_LEVELS } from './schemas.js';

export const MIN_PROMPT_SCORE = 8.5;
// Safety ceiling only: refinement normally stops on the progress rule
// (score must keep improving). 100 passes of pure local prompt critique is
// beyond any plausible need; the progress condition is the real stop.
export const MAX_REFINEMENT_LOOPS = 100;

/**
 * @param {object} intent       — IntentEngine result
 * @param {object} requirements — { explicit, inferred, forbidden }
 * @param {object} context      — ContextEngine summary
 * @param {string} rawPrompt    — preserved original
 * @returns {string} enriched execution prompt
 */
export function architectPrompt({ intent, requirements, context, rawPrompt }) {
  if (!rawPrompt || typeof rawPrompt !== 'string') return '';

  const type = intent?.type || INTENT_TYPES.UNKNOWN;
  const complexity = intent?.complexity || COMPLEXITY_LEVELS.MEDIUM;

  // Trivial/simple-edit prompts are passed through with minimal enrichment
  if (complexity === COMPLEXITY_LEVELS.TRIVIAL || type === INTENT_TYPES.SIMPLE_EDIT) {
    return buildSimplePrompt(rawPrompt, intent, requirements, context);
  }

  // For code questions, keep it light
  if (type === INTENT_TYPES.CODE_QUESTION || type === INTENT_TYPES.RESEARCH || type === INTENT_TYPES.GENERAL_QUESTION) {
    return buildQuestionPrompt(rawPrompt, intent, requirements, context);
  }

  // For website creation
  if (type === INTENT_TYPES.WEBSITE_CREATION) {
    return buildWebsitePrompt(rawPrompt, intent, requirements, context);
  }

  // For game creation
  if (type === INTENT_TYPES.GAME_CREATION) {
    return buildGamePrompt(rawPrompt, intent, requirements, context);
  }

  // For feature implementation
  if (type === INTENT_TYPES.FEATURE_IMPLEMENTATION) {
    return buildFeaturePrompt(rawPrompt, intent, requirements, context);
  }

  // For bug fix
  if (type === INTENT_TYPES.BUG_FIX || type === INTENT_TYPES.CODE_REFACTOR) {
    return buildFixPrompt(rawPrompt, intent, requirements, context);
  }

  // For design tasks
  if (type === INTENT_TYPES.DESIGN_TASK || type === INTENT_TYPES.IMAGE_GENERATION) {
    return buildDesignPrompt(rawPrompt, intent, requirements, context);
  }

  // For content creation
  if (type === INTENT_TYPES.CONTENT_CREATION) {
    return buildContentPrompt(rawPrompt, intent, requirements, context);
  }

  // Fallback generic enrichment
  return buildGenericPrompt(rawPrompt, intent, requirements, context);
}

/**
 * Refinement pass — called when Critic determines the prompt needs improvement.
 * Adds structure and clarity without changing the underlying goal.
 */
export function refinePrompt(failedPrompt, criticResult, { intent: _intent, requirements: _requirements, context: _context, rawPrompt: _rawPrompt }) {
  if (!criticResult || !criticResult.recommendedImprovements || !criticResult.recommendedImprovements.length) {
    return failedPrompt;
  }

  let refined = failedPrompt;

  for (const improvement of criticResult.recommendedImprovements) {
    const lower = improvement.toLowerCase();

    if (lower.includes('test') || lower.includes('validation') || lower.includes('verify')) {
      if (!/test|validate|verify/i.test(refined)) {
        refined += '\n\nAfter implementation, run existing tests and verify the changes work correctly.';
      }
    }

    if (lower.includes('structure') || lower.includes('organize') || lower.includes('organise')) {
      if (!/```|\/\*\*|\/\/\s*---/gi.test(refined)) {
        refined = refined.replace(/(\n)(\w)/, '$1\n## Implementation Steps\n\n$2');
      }
    }

    if (lower.includes('context') || lower.includes('reuse') || lower.includes('existing')) {
      const ctx = _context;
      if (ctx && ctx.framework) {
        if (!refined.toLowerCase().includes(ctx.framework.toLowerCase())) {
          refined += `\n\nUse the existing ${ctx.framework} project structure and conventions.`;
        }
      }
    }
  }

  return refined;
}

// ---------------------------------------------------------------------------
// Prompt builders per intent type
// ---------------------------------------------------------------------------

function buildSimplePrompt(rawPrompt, intent, requirements, context) {
  const parts = [rawPrompt];
  const explicit = requirements?.explicit || [];

  if (context?.framework) {
    parts.push(`\n\nApply this change within the existing ${context.framework} project.`);
  }

  if (explicit.length > 0) {
    parts.push(`\n\nEnsure the change is minimal and does not introduce unrelated modifications.`);
  }

  parts.push('\nDo not introduce new features, extensive refactors, or breaking changes.');
  return parts.join('');
}

function buildQuestionPrompt(rawPrompt, intent, requirements, context) {
  let result = `${rawPrompt}\n\nProvide a clear, concise answer. Include relevant examples if helpful.`;
  if (context?.framework) {
    result += `\n\nConsider the existing ${context.framework} project context where relevant.`;
  }
  return result;
}

function buildWebsitePrompt(rawPrompt, intent, requirements, context) {
  const explicit = requirements?.explicit || [];
  const _inferred = requirements?.inferred || [];
  const forbidden = requirements?.forbidden || [];
  const domain = intent?.domain || 'general';

  let result = `${rawPrompt}\n\n`;
  result += `Create a polished, responsive website for ${domain}.\n\n`;
  result += `The website should communicate quality, clarity, and visual polish.\n\n`;

  // Sections
  result += `Include these sections:\n`;
  result += `- responsive navigation\n`;
  result += `- hero section\n`;

  if (explicit.some((e) => e.includes('product') || e.includes('collection') || e.includes('catalog'))) {
    result += `- product collection or catalog\n`;
  }

  if (explicit.some((e) => e.includes('form') || e.includes('contact') || e.includes('consult'))) {
    result += `- contact or consultation section\n`;
  }

  result += `- footer\n\n`;

  // Context-aware
  if (context?.framework) {
    result += `Use the existing ${context.framework} project framework and structure where possible.\n\n`;
  }

  if (context?.styling) {
    result += `Use the existing ${context.styling} styling system for consistency.\n\n`;
  }

  // Quality requirements
  result += `Prioritise:\n`;
  result += `- responsive design\n`;
  result += `- accessibility\n`;
  result += `- visual polish\n`;
  result += `- clear user flow\n\n`;

  // Forbidden
  if (forbidden.length > 0) {
    result += `Do not:\n`;
    for (const f of forbidden.slice(0, 4)) {
      result += `- ${f}\n`;
    }
    result += `\n`;
  }

  result += `Validate by running existing tests and checking responsive layout.`;
  return result;
}

function buildGamePrompt(rawPrompt, _intent, requirements, _context) {
  const _explicit = requirements?.explicit || [];
  const forbidden = requirements?.forbidden || [];

  let result = `${rawPrompt}\n\n`;
  result += `Build a complete, playable browser game.\n\n`;

  result += `The game should include:\n`;
  result += `- core game loop with requestAnimationFrame\n`;
  result += `- player controls and interaction\n`;
  result += `- collision detection\n`;
  result += `- scoring or progress tracking\n`;
  result += `- game over / restart flow\n\n`;

  result += `Requirements:\n`;
  result += `- 60 FPS stable performance\n`;
  result += `- responsive canvas rendering\n`;
  result += `- self-contained HTML/CSS/JS output ready for the preview canvas\n`;
  result += `- 8-bit retro pixel art style for visuals\n\n`;

  if (forbidden.length > 0) {
    result += `Do not:\n`;
    for (const f of forbidden.slice(0, 4)) {
      result += `- ${f}\n`;
    }
    result += `\n`;
  }

  result += `Validate the game is playable, controls respond, and the game loop runs at target FPS.`;
  return result;
}

function buildFeaturePrompt(rawPrompt, _intent, requirements, context) {
  let result = `${rawPrompt}\n\n`;

  if (context?.framework) {
    result += `Implement this feature in the existing ${context.framework} application.\n\n`;
  }

  if (context?.dependencies && context?.dependencies.length > 0) {
    const keyDeps = context.dependencies.filter((d) => /\b(auth|router|state|api|supabase|firebase|prisma|orm|database|http|axios|fetch)\b/i.test(d));
    if (keyDeps.length > 0) {
      result += `The project uses: ${keyDeps.join(', ')}.\nReuse these instead of introducing new dependencies.\n\n`;
    }
  }

  result += `Implement:\n`;
  result += `- the requested feature\n`;
  result += `- appropriate error handling\n`;
  result += `- clean integration with existing code\n\n`;

  result += `Do not:\n`;
  result += `- introduce unrelated changes\n`;
  result += `- break existing functionality\n`;
  result += `- add unnecessary new dependencies\n\n`;

  result += `Verify by running existing tests and validating the new feature.`;
  return result;
}

function buildFixPrompt(rawPrompt, _intent, _requirements, _context) {
  let result = `${rawPrompt}\n\n`;

  result += `Diagnose and fix the issue.\n\n`;

  result += `Requirements:\n`;
  result += `- identify the root cause\n`;
  result += `- provide the minimal fix that resolves the issue\n`;
  result += `- preserve existing contracts and APIs\n`;
  result += `- do not introduce new features or unrelated changes\n\n`;

  result += `Verify the fix by running existing tests and confirming the issue no longer reproduces.`;
  return result;
}

function buildDesignPrompt(rawPrompt, _intent, _requirements, _context) {
  let result = `${rawPrompt}\n\n`;

  result += `Create the requested visual output.\n\n`;
  result += `Consider the existing visual conventions in the project.\n`;
  result += `Prioritise clarity, visual impact, and appropriate styling.\n\n`;

  result += `Verify the output meets the stated requirements.`;
  return result;
}

function buildContentPrompt(rawPrompt, _intent, _requirements, _context) {
  let result = `${rawPrompt}\n\n`;

  result += `Create the requested content.\n\n`;
  result += `Match the appropriate tone and format for the intended audience.\n`;
  result += `Keep the output polished and ready for use.\n\n`;

  result += `Do not invent factual claims that were not supplied.`;
  return result;
}

function buildGenericPrompt(rawPrompt, intent, requirements, context) {
  const type = intent?.type || 'general';
  const explicit = requirements?.explicit || [];
  const _inferred2 = requirements?.inferred || [];
  const forbidden = requirements?.forbidden || [];

  let result = `${rawPrompt}\n\n`;

  result += `Task type: ${type}\n\n`;

  if (explicit.length > 0) {
    result += `Must address:\n`;
    for (const item of explicit) {
      result += `- ${item}\n`;
    }
    result += `\n`;
  }

  if (context?.framework) {
    result += `Project uses ${context.framework}. Reuse existing conventions.\n\n`;
  }

  if (forbidden.length > 0) {
    result += `Do not:\n`;
    for (const item of forbidden) {
      result += `- ${item}\n`;
    }
    result += `\n`;
  }

  result += `Provide a complete, working solution. Verify by running tests.`;
  return result;
}
