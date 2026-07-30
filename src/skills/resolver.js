/**
 * CoreZ Skill Resolver
 * Evaluates fine-grained intent, prompt context, complexity, project status, and runtime capabilities BEFORE generation.
 * Selects only applicable skills, resolves dependencies, and orders them topologically.
 */

import { defaultSkillRegistry } from './registry.js';
import { expandDependencies } from './dependencies.js';

const BUG_REPORT_PATTERNS = /\b(crash|crashes|bug|error|exception|fail|failed|fails|stack trace|not working|broken|issue|fix|debug)\b/i;
const SUBSTANTIAL_APP_PATTERNS = /\b(build|create|make|develop|design|launch)\b.*\b(dashboard|app|saas|portal|system|platform|website|game|service|admin|authentication|billing)\b|\b(dashboard|app|saas|portal|system|platform|website|game|service|admin)\b/i;
const SMALL_EDIT_PATTERNS = /\b(tweak|minor|small edit|color|colour|font|text|label|typo|fix typo|margin|padding|button text|change text|update link)\b/i;
const REPO_REVIEW_PATTERNS = /\b(review|audit|inspect|survey|check|analyze|analyse)\b.*\b(repo|repository|codebase|project|architecture|files)\b/i;

export function resolveSkills({ intent, prompt = '', availableTools = [], registry = defaultSkillRegistry }) {
  const cleanPrompt = String(prompt || '').trim();

  // Normalize intent object or legacy string
  let legacyIntent = 'general';
  let primaryIntent = 'general_question';
  let complexity = 'medium';
  let isExistingProject = false;
  let _explicitRequirements = [];
  let forbiddenChanges = [];

  if (typeof intent === 'string') {
    legacyIntent = intent;
    primaryIntent = intent;
  } else if (intent && typeof intent === 'object') {
    legacyIntent = intent.legacyIntentType || intent.type || 'general';
    primaryIntent = intent.primaryIntent || intent.type || 'general_question';
    complexity = intent.complexity || 'medium';
    isExistingProject = Boolean(intent.isExistingProject);
    _explicitRequirements = Array.isArray(intent.explicitRequirements) ? intent.explicitRequirements : [];
    forbiddenChanges = Array.isArray(intent.forbiddenChanges) ? intent.forbiddenChanges : [];
  }

  // 1. Simple explanation, writing, or trivial requests do not activate heavy Superpowers workflows
  if (['explanation', 'writing'].includes(legacyIntent) || ['code_question', 'content_creation'].includes(primaryIntent)) {
    return attachExecutionPlan([]);
  }

  const isSmallEdit = complexity === 'trivial' || (complexity === 'low' && isExistingProject) || SMALL_EDIT_PATTERNS.test(cleanPrompt) || primaryIntent === 'simple_edit';
  const isRepoReview = primaryIntent === 'research' || REPO_REVIEW_PATTERNS.test(cleanPrompt);
  const isBugReport = primaryIntent === 'bug_fix' || BUG_REPORT_PATTERNS.test(cleanPrompt);
  const isNewComplexApp = !isExistingProject && (complexity === 'high' || complexity === 'epic') && (legacyIntent === 'app' || ['website_creation', 'game_creation'].includes(primaryIntent));

  const selectionMap = new Map(); // id -> reasonSelected

  selectionMap.set('using-superpowers', 'Bootstrap entry point for AI orchestration');

  // Small Edit: minimal workflow
  if (isSmallEdit) {
    selectionMap.set('verification-before-completion', 'Verify focused patch before completing');
  } else if (isRepoReview) {
    // Repository review: analysis and verification only
    selectionMap.set('verification-before-completion', 'Empirical verification for review findings');
  } else if (isBugReport) {
    // Bug report: systematic investigation & TDD regression check
    selectionMap.set('systematic-debugging', 'Disciplined 7-phase investigation for reported bug/error');
    selectionMap.set('verification-before-completion', 'Empirical verification gate before claiming fix');
  } else if (isNewComplexApp) {
    // Complex new application build
    selectionMap.set('brainstorming', 'Design refinement & specification formulation before coding');
    selectionMap.set('writing-plans', 'Decompose specification into granular implementation tasks');
    selectionMap.set('test-driven-development', 'Enforce RED-GREEN-REFACTOR cycle for new features');
    selectionMap.set('requesting-code-review', 'Two-stage review gate for quality & compliance');
    selectionMap.set('verification-before-completion', 'Empirical verification gate before completion');
  } else if (legacyIntent === 'app' || ['website_creation', 'game_creation'].includes(primaryIntent)) {
    selectionMap.set('writing-plans', 'Plan implementation tasks for application feature');
    selectionMap.set('verification-before-completion', 'Verify application component before completion');

    if (/\b(game|gamedev|canvas|arcade|snake|pong|scrabble|wordle)\b/i.test(cleanPrompt) || primaryIntent === 'game_creation') {
      selectionMap.set('game-development', 'HTML5 Canvas & game loop logic');
      selectionMap.set('visual-creative', '8-bit SVG sprite & visual asset direction');
    }
    if (/\b(design|modern|glassmorphism|ui|aesthetic|theme)\b/i.test(cleanPrompt) || primaryIntent === 'design_task') {
      selectionMap.set('frontend-modern-design', 'Modern dark mode & responsive UI styling');
    }
  } else if (legacyIntent === 'swarm' || primaryIntent === 'swarm') {
    selectionMap.set('brainstorming', 'High-level multi-agent orchestration architecture');
    selectionMap.set('writing-plans', 'DAG task graph decomposition');
    selectionMap.set('subagent-driven-development', 'Isolated subagent task briefs');
    selectionMap.set('dispatching-parallel-agents', 'Concurrently execute independent tasks');
    selectionMap.set('verification-before-completion', 'Empirical verification gate');
  } else if (legacyIntent === 'code-help' || ['feature_implementation', 'code_refactor'].includes(primaryIntent)) {
    selectionMap.set('writing-plans', 'Plan targeted implementation changes');
    selectionMap.set('verification-before-completion', 'Verify code changes');
  } else {
    if (SUBSTANTIAL_APP_PATTERNS.test(cleanPrompt)) {
      selectionMap.set('writing-plans', 'Plan application building steps');
      selectionMap.set('verification-before-completion', 'Verify completed implementation');
    } else {
      return attachExecutionPlan([]);
    }
  }

  // Expand dependencies & topological ordering
  const selectedIds = Array.from(selectionMap.keys());
  let expandedSkills = expandDependencies(selectedIds, registry);

  // Small edit guard: do not pull in heavy planning/brainstorming/TDD skills via dependency chain
  if (isSmallEdit) {
    const heavySkills = new Set(['brainstorming', 'writing-plans', 'test-driven-development', 'requesting-code-review', 'subagent-driven-development']);
    expandedSkills = expandedSkills.filter(s => !heavySkills.has(s.id));
  }

  // Capability gating: Filter out skills requiring tools not available in runtime
  let resolvedSkills = expandedSkills;
  if (Array.isArray(availableTools) && availableTools.length > 0) {
    const toolSet = new Set(availableTools);
    resolvedSkills = resolvedSkills.filter(skill => {
      if (!skill.requiresTools || skill.requiresTools.length === 0) return true;
      return skill.requiresTools.every(tool => toolSet.has(tool));
    });
  }

  // Map to full skill objects with full instructions & metadata
  const fullSkills = resolvedSkills.map(skill => ({
    id: skill.id,
    name: skill.name || skill.id,
    phase: skill.phase || 'IMPLEMENTING',
    priority: skill.priority || 50,
    reasonSelected: selectionMap.get(skill.id) || `Activated by dependency ${skill.id}`,
    instructions: skill.instructions || skill.description || '',
    constraints: [...(skill.constraints || []), ...(forbiddenChanges.length ? [`Forbidden: ${forbiddenChanges.join(', ')}`] : [])],
    requiredCapabilities: skill.requiresTools || [],
  }));

  return attachExecutionPlan(fullSkills);
}

function attachExecutionPlan(skills) {
  if (!skills || skills.length === 0) {
    skills.compactExecutionPlan = 'Direct execution path — no heavy engineering workflow required.';
    return skills;
  }

  const phases = [];
  const phaseMap = new Map();

  for (const s of skills) {
    if (!phaseMap.has(s.phase)) {
      phaseMap.set(s.phase, []);
      phases.push(s.phase);
    }
    phaseMap.get(s.phase).push(s.name || s.id);
  }

  const planSteps = phases.map((phase, idx) => `${idx + 1}. [${phase}] ${phaseMap.get(phase).join(', ')}`);
  skills.compactExecutionPlan = `Execution Plan:\n${planSteps.join('\n')}`;
  return skills;
}
