/**
 * Public surface of the shared CoreZ prompt-intelligence stack.
 *
 * This is the same code the web client runs before calling `/api/ai`; the
 * native client imports it from here so intent classification, contract
 * generation and skill routing cannot drift between the two clients.
 *
 * Name notes:
 *  - `classifyIntent` is the pattern/context engine classifier
 *    (promptIntelligence/intentEngine.js).
 *  - `classifyPublicIntent` is the trained Naive-Bayes public classifier
 *    (intentClassifier.js), which returns the five deliverable labels.
 */
export {
  classifyIntent,
  extractDomain,
  extractGenre,
  extractFeature,
  BLOCKING_QUESTIONS,
  OPTIONAL_QUESTIONS,
  extractRequirements,
  detectMissingInformation,
  classifyComplexity,
} from "./promptIntelligence/intentEngine.js";

export {
  createIntentContract,
  checkContractViolations,
} from "./promptIntelligence/intentContract.js";

export {
  INTENT_TYPES,
  COMPLEXITY_LEVELS,
  EXECUTION_MODES,
  CLARITY_LEVELS,
  createTask,
  createIntentResult,
  createRequirements,
  createCriticResult,
  createContextSummary,
  createRoutingResult,
  isValidIntent,
  isValidCriticResult,
  isValidRoutingResult,
  safeParseJSON,
  generateTaskId,
} from "./promptIntelligence/schemas.js";

export { ContextEngine } from "./promptIntelligence/contextEngine.js";
export {
  architectPrompt,
  refinePrompt,
  MIN_PROMPT_SCORE,
  MAX_REFINEMENT_LOOPS,
} from "./promptIntelligence/promptArchitect.js";
export { critiquePrompt } from "./promptIntelligence/promptCritic.js";
export { guardIntent, deEscalate } from "./promptIntelligence/intentGuard.js";
export {
  route,
  shouldUseFullPipeline,
  toLegacyIntentType,
} from "./promptIntelligence/taskRouter.js";
export { process as processPromptPipeline } from "./promptIntelligence/index.js";

export {
  tokenize,
  classifyIntent as classifyPublicIntent,
} from "./intentClassifier.js";

export { classifyExecutionMode } from "./executionModes.js";

export { SkillRegistry, defaultSkillRegistry } from "./skills/registry.js";
export { resolveSkills, SPECIALIST_SKILL_IDS } from "./skills/resolver.js";
export { expandDependencies } from "./skills/dependencies.js";

export {
  detectUserFactCandidates,
  isSensitiveText,
} from "./userFacts.js";
