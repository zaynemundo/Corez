/**
 * CoreZ Task Router
 *
 * Maps intent + complexity + context into execution modes and
 * recommended agent configurations.  Decides how much processing is needed.
 */

import {
  INTENT_TYPES,
  COMPLEXITY_LEVELS,
  EXECUTION_MODES,
  createRoutingResult,
} from './schemas.js';

/**
 * Default routing table — maps intent type to execution mode.
 * Extensible without large switch statements.
 */
const ROUTING_TABLE = {
  [INTENT_TYPES.SIMPLE_EDIT]: {
    mode: EXECUTION_MODES.DIRECT,
    agents: [],
  },
  [INTENT_TYPES.CODE_QUESTION]: {
    mode: EXECUTION_MODES.DIRECT,
    agents: [],
  },
  [INTENT_TYPES.GENERAL_QUESTION]: {
    mode: EXECUTION_MODES.DIRECT,
    agents: [],
  },
  [INTENT_TYPES.RESEARCH]: {
    mode: EXECUTION_MODES.RESEARCH_AGENT,
    agents: ['research_agent'],
  },
  [INTENT_TYPES.IMAGE_GENERATION]: {
    mode: EXECUTION_MODES.DIRECT_AGENT,
    agents: ['flux_generator'],
  },
  [INTENT_TYPES.CONTENT_CREATION]: {
    mode: EXECUTION_MODES.DIRECT_AGENT,
    agents: ['content_writer'],
  },
  [INTENT_TYPES.DESIGN_TASK]: {
    mode: EXECUTION_MODES.DIRECT_AGENT,
    agents: ['designer'],
  },
  [INTENT_TYPES.BUG_FIX]: {
    mode: EXECUTION_MODES.DEBUG_AGENT,
    agents: ['debugger'],
  },
  [INTENT_TYPES.CODE_REFACTOR]: {
    mode: EXECUTION_MODES.CODING_SWARM,
    agents: ['refactor_specialist', 'reviewer'],
  },
  [INTENT_TYPES.FEATURE_IMPLEMENTATION]: {
    mode: EXECUTION_MODES.CODING_SWARM,
    agents: ['architect', 'implementer', 'reviewer'],
  },
  [INTENT_TYPES.WEBSITE_CREATION]: {
    mode: EXECUTION_MODES.WEBSITE_SWARM,
    agents: [],
  },
  [INTENT_TYPES.GAME_CREATION]: {
    mode: EXECUTION_MODES.GAME_SWARM,
    agents: [],
  },
  [INTENT_TYPES.SWARM]: {
    mode: EXECUTION_MODES.FULL_SWARM,
    agents: [],
  },
  [INTENT_TYPES.UNKNOWN]: {
    mode: EXECUTION_MODES.DIRECT,
    agents: [],
  },
};

/**
 * Complexity-based agent compositions for website and game swarms.
 */
const WEBSITE_AGENTS_BY_COMPLEXITY = {
  [COMPLEXITY_LEVELS.LOW]: ['frontend_developer'],
  [COMPLEXITY_LEVELS.MEDIUM]: ['designer', 'frontend_developer', 'reviewer'],
  [COMPLEXITY_LEVELS.HIGH]: ['architect', 'designer', 'frontend_developer', 'reviewer', 'qa_tester'],
  [COMPLEXITY_LEVELS.EPIC]: ['architect', 'designer', 'frontend_developer', 'backend_developer', 'reviewer', 'qa_tester', 'security_reviewer'],
};

const GAME_AGENTS_BY_COMPLEXITY = {
  [COMPLEXITY_LEVELS.LOW]: ['gameplay_programmer'],
  [COMPLEXITY_LEVELS.MEDIUM]: ['game_designer', 'gameplay_programmer', 'ui_programmer', 'qa_tester'],
  [COMPLEXITY_LEVELS.HIGH]: ['game_designer', 'tech_director', 'gameplay_programmer', 'engine_programmer', 'ui_programmer', 'qa_lead', 'code_reviewer'],
  [COMPLEXITY_LEVELS.EPIC]: ['producer', 'game_designer', 'tech_director', 'lead_programmer', 'gameplay_programmer', 'engine_programmer', 'ai_programmer', 'ui_programmer', 'level_designer', 'technical_artist', 'qa_lead', 'qa_tester', 'code_reviewer'],
};

/**
 * @param {object} intent       — IntentEngine result
 * @param {object} requirements — { explicit, inferred, forbidden }
 * @param {object} context      — ContextEngine summary
 * @returns {object} routing result
 */
export function route(intent, requirements, context = {}) {
  const type = intent?.type || INTENT_TYPES.UNKNOWN;
  const complexity = intent?.complexity || COMPLEXITY_LEVELS.MEDIUM;
  const entry = ROUTING_TABLE[type] || ROUTING_TABLE[INTENT_TYPES.UNKNOWN];

  const result = createRoutingResult();
  result.mode = entry.mode;
  result.complexity = complexity;
  result.reason = `Routed to ${entry.mode} based on intent type '${type}' at complexity '${complexity}'`;

  // For swarms, select agents based on complexity
  if (type === INTENT_TYPES.WEBSITE_CREATION) {
    result.recommendedAgents = WEBSITE_AGENTS_BY_COMPLEXITY[complexity] || WEBSITE_AGENTS_BY_COMPLEXITY[COMPLEXITY_LEVELS.MEDIUM];
    result.reason = `Website creation routed to ${result.mode} with ${result.recommendedAgents.length} agents at ${complexity} complexity`;
  } else if (type === INTENT_TYPES.GAME_CREATION) {
    result.recommendedAgents = GAME_AGENTS_BY_COMPLEXITY[complexity] || GAME_AGENTS_BY_COMPLEXITY[COMPLEXITY_LEVELS.MEDIUM];
    result.reason = `Game creation routed to ${result.mode} with ${result.recommendedAgents.length} agents at ${complexity} complexity`;
  } else if (type === INTENT_TYPES.FEATURE_IMPLEMENTATION) {
    // Scale based on complexity
    if (complexity === COMPLEXITY_LEVELS.HIGH || complexity === COMPLEXITY_LEVELS.EPIC) {
      result.recommendedAgents = ['architect', 'frontend', 'backend', 'implementer', 'reviewer', 'tester'];
    } else {
      result.recommendedAgents = entry.agents;
    }
  } else {
    result.recommendedAgents = entry.agents;
  }

  // Context-aware routing: if auth is needed and project has Supabase, route appropriately
  if (context && context.dependencies) {
    const deps = context.dependencies.map((d) => d.toLowerCase());
    if (deps.some((d) => d.includes('supabase'))) {
      if (!result.recommendedAgents.includes('supabase_integration')) {
        result.recommendedAgents = [...result.recommendedAgents, 'supabase_integration'];
      }
    }
    if (deps.some((d) => d.includes('firebase'))) {
      if (!result.recommendedAgents.includes('firebase_integration')) {
        result.recommendedAgents = [...result.recommendedAgents, 'firebase_integration'];
      }
    }
  }

  return result;
}

/**
 * Fast-path check: should we skip the full pipeline?
 */
export function shouldUseFullPipeline(intent) {
  if (!intent) return false;

  const type = intent.type;
  const complexity = intent.complexity;

  // Trivial/low-complexity tasks skip the full pipeline
  if (complexity === COMPLEXITY_LEVELS.TRIVIAL || complexity === COMPLEXITY_LEVELS.LOW) {
    if (type === INTENT_TYPES.SIMPLE_EDIT || type === INTENT_TYPES.CODE_QUESTION || type === INTENT_TYPES.GENERAL_QUESTION || type === INTENT_TYPES.RESEARCH || type === INTENT_TYPES.IMAGE_GENERATION) {
      return false;
    }
  }

  return true;
}

/**
 * Backward-compatible mapping to existing CoreZ intent types.
 * This bridges the new fine-grained types to the existing 6-type system
 * (app, code-help, writing, explanation, general, swarm).
 */
export function toLegacyIntentType(intentType) {
  switch (intentType) {
    case INTENT_TYPES.WEBSITE_CREATION:
    case INTENT_TYPES.GAME_CREATION:
    case INTENT_TYPES.IMAGE_GENERATION:
      return 'app';
    case INTENT_TYPES.FEATURE_IMPLEMENTATION:
    case INTENT_TYPES.CODE_REFACTOR:
    case INTENT_TYPES.SIMPLE_EDIT:
      return 'code-help';
    case INTENT_TYPES.BUG_FIX:
      return 'code-help';
    case INTENT_TYPES.CODE_QUESTION:
      return 'code-help';
    case INTENT_TYPES.RESEARCH:
      return 'explanation';
    case INTENT_TYPES.CONTENT_CREATION:
      return 'writing';
    case INTENT_TYPES.GENERAL_QUESTION:
      return 'general';
    case INTENT_TYPES.SWARM:
      return 'swarm';
    default:
      return 'general';
  }
}
