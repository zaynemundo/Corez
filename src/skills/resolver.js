/**
 * CoreZ Skill Resolver
 * Evaluates intent, prompt context, and runtime capabilities BEFORE generation.
 * Selects only applicable skills, resolves dependencies, and orders them topologically.
 */

import { defaultSkillRegistry } from './registry.js';
import { expandDependencies } from './dependencies.js';

const BUG_REPORT_PATTERNS = /\b(crash|crashes|bug|error|exception|fail|failed|fails|stack trace|not working|broken|issue|fix|debug)\b/i;
const SUBSTANTIAL_APP_PATTERNS = /\b(build|create|make|develop|design|launch)\b.*\b(dashboard|app|saas|portal|system|platform|website|game|service|admin|authentication|billing)\b|\b(dashboard|app|saas|portal|system|platform|website|game|service|admin)\b/i;

export function resolveSkills({ intent, prompt = '', availableTools = [], registry = defaultSkillRegistry }) {
  const cleanPrompt = prompt.trim();

  // 1. Simple explanation, writing, or general requests do not activate heavy Superpowers engineering workflows
  if (['explanation', 'writing'].includes(intent)) {
    return [];
  }
  if (intent === 'general' && !SUBSTANTIAL_APP_PATTERNS.test(cleanPrompt) && !BUG_REPORT_PATTERNS.test(cleanPrompt)) {
    return [];
  }

  const selectedIds = new Set();
  selectedIds.add('using-superpowers');

  if (intent === 'code-help') {
    if (BUG_REPORT_PATTERNS.test(cleanPrompt)) {
      selectedIds.add('systematic-debugging');
      selectedIds.add('test-driven-development');
      selectedIds.add('verification-before-completion');
    } else {
      selectedIds.add('writing-plans');
      selectedIds.add('test-driven-development');
      selectedIds.add('verification-before-completion');
    }
  } else if (intent === 'app') {
    selectedIds.add('brainstorming');
    selectedIds.add('writing-plans');
    selectedIds.add('test-driven-development');
    selectedIds.add('requesting-code-review');
    selectedIds.add('verification-before-completion');

    if (/\b(game|gamedev|canvas|arcade|snake|pong|scrabble|wordle)\b/i.test(cleanPrompt)) {
      selectedIds.add('game-development');
      selectedIds.add('visual-creative');
    }
    if (/\b(design|modern|glassmorphism|ui|aesthetic|theme)\b/i.test(cleanPrompt)) {
      selectedIds.add('frontend-modern-design');
    }
  } else if (intent === 'swarm') {
    selectedIds.add('brainstorming');
    selectedIds.add('writing-plans');
    selectedIds.add('subagent-driven-development');
    selectedIds.add('dispatching-parallel-agents');
    selectedIds.add('requesting-code-review');
    selectedIds.add('verification-before-completion');
  }

  // Expand dependencies & topological ordering
  let resolvedSkills = expandDependencies(Array.from(selectedIds), registry);

  // Capability gating: Filter out skills requiring tools not available in runtime
  if (Array.isArray(availableTools)) {
    const toolSet = new Set(availableTools);
    resolvedSkills = resolvedSkills.filter(skill => {
      if (!skill.requiresTools || skill.requiresTools.length === 0) return true;
      return skill.requiresTools.every(tool => toolSet.has(tool));
    });
  }

  return resolvedSkills;
}
