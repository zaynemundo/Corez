/**
 * CoreZ Prompt Intelligence Engine — Shared Schemas
 *
 * Defines the canonical data structures for each stage of the pipeline.
 * All downstream consumers validate against these schemas.
 */

let _uidCounter = 0;

export function generateTaskId() {
  _uidCounter += 1;
  return `task_${Date.now().toString(36)}_${_uidCounter.toString(36)}`;
}

/**
 * Canonical intent types.  New types are registered here so downstream
 * routers and contracts can remain extensible.
 */
export const INTENT_TYPES = Object.freeze({
  WEBSITE_CREATION: 'website_creation',
  GAME_CREATION: 'game_creation',
  FEATURE_IMPLEMENTATION: 'feature_implementation',
  BUG_FIX: 'bug_fix',
  CODE_REFACTOR: 'code_refactor',
  CODE_QUESTION: 'code_question',
  RESEARCH: 'research',
  DESIGN_TASK: 'design_task',
  IMAGE_GENERATION: 'image_generation',
  CONTENT_CREATION: 'content_creation',
  GENERAL_QUESTION: 'general_question',
  SIMPLE_EDIT: 'simple_edit',
  MARKET: 'market',
  UNKNOWN: 'unknown',
});

export const COMPLEXITY_LEVELS = Object.freeze({
  TRIVIAL: 'trivial',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  EPIC: 'epic',
});

export const EXECUTION_MODES = Object.freeze({
  DIRECT: 'direct',
  DIRECT_AGENT: 'direct_agent',
  CODING_WORKFLOW: 'coding_workflow',
  WEBSITE_BUILD: 'website_build',
  GAME_BUILD: 'game_build',
  DEBUG_AGENT: 'debug_agent',
  RESEARCH_AGENT: 'research_agent',
});

export const CLARITY_LEVELS = Object.freeze({
  BLOCKING: 'blocking',
  OPTIONAL: 'optional',
  INFERRED: 'inferred',
});

// ---------------------------------------------------------------------------
// Factory helpers that return validated, immutable-looking plain objects
// ---------------------------------------------------------------------------

export function createTask({ rawPrompt }) {
  return {
    id: generateTaskId(),
    rawPrompt: String(rawPrompt || '').trim(),

    intent: null,
    requirements: { explicit: [], inferred: [], forbidden: [] },
    context: {
      projectType: null,
      framework: null,
      styling: null,
      dependencies: [],
      relevantFiles: [],
      existingFeatures: [],
      instructions: [],
    },
    prompt: {
      enriched: null,
      final: null,
      score: null,
      refinementCount: 0,
    },
    routing: {
      complexity: null,
      executionMode: null,
      recommendedAgents: [],
    },
  };
}

export function createIntentResult(overrides = {}) {
  const type = overrides.type || INTENT_TYPES.UNKNOWN;
  return {
    type,
    primaryIntent: overrides.primaryIntent || type,
    secondaryIntent: overrides.secondaryIntent || null,
    goal: '',
    domain: '',
    deliverable: '',
    targetAudience: null,
    features: [],
    constraints: [],
    stylePreferences: [],
    missingInformation: [],
    blockingAmbiguity: false,
    complexity: COMPLEXITY_LEVELS.MEDIUM,
    confidence: 0,
    isExistingProject: false,
    outputFormat: 'text',
    ...overrides,
  };
}

export function createRequirements() {
  return { explicit: [], inferred: [], forbidden: [] };
}

export function createIntentContract() {
  return { mustAchieve: [], mayInfer: [], mustNotInvent: [] };
}

export function createCriticResult(overrides = {}) {
  return {
    score: 0,
    intentPreserved: true,
    intentDrift: false,
    issues: [],
    recommendedImprovements: [],
    ...overrides,
  };
}

export function createContextSummary() {
  return {
    projectType: null,
    framework: null,
    styling: null,
    dependencies: [],
    relevantFiles: [],
    existingFeatures: [],
    instructions: [],
    gitState: null,
  };
}

export function createRoutingResult() {
  return {
    mode: EXECUTION_MODES.DIRECT,
    recommendedAgents: [],
    complexity: COMPLEXITY_LEVELS.MEDIUM,
    reason: '',
  };
}

/**
 * Lightweight schema validation helpers used to guard structured model output.
 */
export function isValidIntent(obj) {
  if (!obj || typeof obj !== 'object') return false;
  return (
    typeof obj.type === 'string' &&
    obj.type.length > 0 &&
    typeof obj.confidence === 'number'
  );
}

export function isValidCriticResult(obj) {
  if (!obj || typeof obj !== 'object') return false;
  return (
    typeof obj.score === 'number' &&
    Array.isArray(obj.issues)
  );
}

export function isValidRoutingResult(obj) {
  if (!obj || typeof obj !== 'object') return false;
  return (
    typeof obj.mode === 'string' &&
    Array.isArray(obj.recommendedAgents)
  );
}

/**
 * Safely parses JSON from potentially-malformed model output.
 * Returns null on failure (caller decides fallback).
 */
export function safeParseJSON(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    try { return JSON.parse(trimmed); } catch { /* fall through */ }
  }
  // attempt to extract first JSON object
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch { /* fall through */ }
  }
  return null;
}
