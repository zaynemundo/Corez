/**
 * CoreZ Prompt Intelligence Engine
 *
 * Public API for the full pipeline:
 *
 *   USER RAW PROMPT
 *         │
 *         ▼
 *   1. PROMPT INTAKE ── create task object
 *         │
 *         ▼
 *   2. INTENT ENGINE ── classify intent, extract requirements
 *         │
 *         ▼
 *   3. CONTEXT ENGINE ── gather project context
 *         │
 *         ▼
 *   4. PROMPT ARCHITECT ── build enriched prompt
 *         │
 *         ▼
 *   5. PROMPT CRITIC ── score the enriched prompt
 *         │
 *         ▼
 *   6. INTENT GUARD ── detect drift
 *         │
 *         ▼
 *   7. TASK ROUTER ── route to execution mode
 *         │
 *         ▼
 *   8. FINAL EXECUTION PROMPT → CoreZ execution
 */

import { createTask, COMPLEXITY_LEVELS } from './schemas.js';
import { classifyIntent, extractRequirements, detectMissingInformation, classifyComplexity } from './intentEngine.js';
import { createIntentContract } from './intentContract.js';
import { ContextEngine } from './contextEngine.js';
import { architectPrompt, refinePrompt, MIN_PROMPT_SCORE, MAX_REFINEMENT_LOOPS } from './promptArchitect.js';
import { critiquePrompt } from './promptCritic.js';
import { guardIntent, deEscalate } from './intentGuard.js';
import { route, shouldUseFullPipeline, toLegacyIntentType } from './taskRouter.js';

export {
  classifyIntent,
  extractRequirements,
  createIntentContract,
  classifyComplexity,
  toLegacyIntentType,
  MIN_PROMPT_SCORE,
  MAX_REFINEMENT_LOOPS,
};

export { INTENT_TYPES, COMPLEXITY_LEVELS, EXECUTION_MODES, createTask } from './schemas.js';

/**
 * Process a raw user prompt through the full intelligence pipeline.
 *
 * @param {object} options
 * @param {string} options.prompt          — raw user prompt (required)
 * @param {object} [options.projectContext] — pre-supplied context (optional)
 * @param {AbortSignal} [options.signal]    — abort signal (optional)
 * @param {boolean} [options.verbose]       — enable verbose mode for debug output (optional)
 * @param {boolean} [options.dryRun]        — run pipeline without reaching out to models (optional)
 * @returns {Promise<object>} pipeline result
 */
export async function process({ prompt, projectContext, signal, verbose, dryRun } = {}) {
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return createEmptyResult('No prompt provided');
  }

  const rawPrompt = prompt.trim();
  const result = createTask({ rawPrompt });

  // ----- 1. Intake (task object already created) ------
  if (verbose) log('INTAKE', 'Task object created', result.id);

  // ----- 2. Intent Engine -----
  const intent = classifyIntent(rawPrompt);
  const requirements = extractRequirements(rawPrompt, intent);
  const missing = detectMissingInformation(rawPrompt, intent);
  const complexity = classifyComplexity(rawPrompt, intent);

  intent.complexity = complexity;
  intent.missingInformation = missing;
  intent.blockingAmbiguity = missing.some((m) => m.blocking);

  result.intent = intent;
  result.requirements = requirements;

  if (verbose) {
    log('INTENT', `${intent.type} (${Math.round(intent.confidence * 100)}%)`, `complexity: ${complexity}`);
    log('REQUIREMENTS', `explicit: ${requirements.explicit.length}, inferred: ${requirements.inferred.length}, forbidden: ${requirements.forbidden.length}`);
  }

  // ----- 3. Intent Contract -----
  const contract = createIntentContract(intent, requirements);
  if (verbose) log('CONTRACT', `must achieve: ${contract.mustAchieve.length}, must not: ${contract.mustNotInvent.length}`);

  // Fast path: skip heavy pipeline for trivial/low-complexity tasks
  if (!shouldUseFullPipeline(intent)) {
    const enrichedPrompt = architectPrompt({ intent, requirements, context: {}, rawPrompt });
    const routingResult = route(intent, requirements, {});

    result.prompt.enriched = enrichedPrompt;
    result.prompt.final = enrichedPrompt;
    result.prompt.score = 10;
    result.routing = routingResult;

    if (verbose) log('FAST PATH', `Direct execution → ${routingResult.mode}`);

    return buildOutput(result, contract);
  }

  // ----- 4. Context Engine -----
  let context = {};
  try {
    if (projectContext) {
      context = projectContext;
      if (verbose) log('CONTEXT', 'Using supplied project context');
    } else if (!dryRun) {
      const engine = new ContextEngine();
      context = await engine.gather(rawPrompt, intent);
      if (verbose) log('CONTEXT', `framework: ${context.framework || 'none'}, deps: ${context.dependencies?.length || 0}`);
    }
  } catch (err) {
    if (verbose) log('CONTEXT', 'Context gathering failed, continuing without', err.message);
  }
  result.context = context;

  // ----- 5. Prompt Architect -----
  let enriched = architectPrompt({ intent, requirements, context, rawPrompt });
  result.prompt.enriched = enriched;

  if (verbose) {
    log('ARCHITECT', `Generated enriched prompt (${enriched.split(/\s+/).length} words)`);
  }

  // ----- 6. Critic + Refinement Loop -----
  let criticResult = critiquePrompt(rawPrompt, enriched, intent, requirements);
  result.prompt.score = criticResult.score;

  if (verbose) log('CRITIC', `${criticResult.score}/10`, `issues: ${criticResult.issues.length}`);

  let refinementCount = 0;
  while (criticResult.score < MIN_PROMPT_SCORE && refinementCount < MAX_REFINEMENT_LOOPS) {
    refinementCount += 1;
    enriched = refinePrompt(enriched, criticResult, { intent, requirements, context, rawPrompt });
    criticResult = critiquePrompt(rawPrompt, enriched, intent, requirements);

    if (verbose) log(`REFINE #${refinementCount}`, `${criticResult.score}/10`);
  }
  result.prompt.refinementCount = refinementCount;
  result.prompt.score = criticResult.score;

  // ----- 7. Intent Guard -----
  const guardResult = guardIntent(rawPrompt, contract, enriched, intent);

  if (guardResult.intentDrift) {
    if (verbose) {
      log('GUARD', 'INTENT DRIFT DETECTED', guardResult.reason);
      log('GUARD', 'Violations:', guardResult.violations.map((v) => v.message).join(' | '));
    }

    enriched = deEscalate(enriched, guardResult, intent);
    criticResult = critiquePrompt(rawPrompt, enriched, intent, requirements);
    result.prompt.score = criticResult.score;

    if (verbose) log('GUARD', `De-escalated, new score: ${criticResult.score}/10`);
  } else if (verbose) {
    log('GUARD', 'Intent preserved OK');
  }

  result.prompt.final = enriched;
  result.prompt.intentPreserved = !guardResult.intentDrift;

  // ----- 8. Task Router -----
  const routingResult = route(intent, requirements, context);
  result.routing = routingResult;

  if (verbose) {
    log('ROUTE', `${routingResult.mode}`, `agents: ${routingResult.recommendedAgents.join(', ') || 'none'}`);
  }

  return buildOutput(result, contract);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildOutput(task, contract) {
  return {
    id: task.id,
    rawPrompt: task.rawPrompt,

    intent: {
      type: task.intent.type,
      goal: task.intent.goal,
      domain: task.intent.domain,
      confidence: task.intent.confidence,
      complexity: task.intent.complexity,
      blockingAmbiguity: task.intent.blockingAmbiguity,
    },

    requirements: {
      explicit: task.requirements.explicit,
      inferred: task.requirements.inferred,
      forbidden: task.requirements.forbidden,
    },

    contract: {
      mustAchieve: contract.mustAchieve,
      mayInfer: contract.mayInfer,
      mustNotInvent: contract.mustNotInvent,
    },

    context: {
      projectType: task.context?.projectType || null,
      framework: task.context?.framework || null,
      styling: task.context?.styling || null,
      dependencies: task.context?.dependencies || [],
      relevantFiles: task.context?.relevantFiles || [],
    },

    executionPrompt: task.prompt.final || task.prompt.enriched,

    quality: {
      score: task.prompt.score,
      refinementCount: task.prompt.refinementCount || 0,
      intentPreserved: task.prompt.intentPreserved !== false,
    },

    routing: {
      mode: task.routing.mode,
      complexity: task.routing.complexity,
      recommendedAgents: task.routing.recommendedAgents,
      reason: task.routing.reason,
    },

    legacyIntentType: toLegacyIntentType(task.intent.type),
  };
}

function createEmptyResult(reason) {
  return {
    rawPrompt: '',
    intent: { type: 'unknown', confidence: 0, complexity: 'low' },
    requirements: { explicit: [], inferred: [], forbidden: [] },
    contract: { mustAchieve: [], mayInfer: [], mustNotInvent: [] },
    context: {},
    executionPrompt: '',
    quality: { score: 0, refinementCount: 0, intentPreserved: true },
    routing: { mode: 'direct', recommendedAgents: [] },
    error: reason,
  };
}

function log(stage, message, detail) {
  const prefix = '[COREZ PIPELINE]';
  const detailStr = detail ? ` → ${detail}` : '';
  console.log(`${prefix} ${stage}: ${message}${detailStr}`);
}
