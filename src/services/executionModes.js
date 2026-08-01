/**
 * Execution-mode classification.
 *
 * Conversational mode: the direct provider route (questions, explanations,
 * writing, brainstorming, standalone preview-canvas generation).
 *
 * Repository-agent mode: existing-file modification, debugging, refactoring,
 * feature implementation in an existing project, test/build repair,
 * repository review, multi-file engineering. These requests run the full
 * agent cycle (understand -> inspect -> plan -> implement -> verify ->
 * review -> finalise) — and are reported honestly when no repository
 * workspace is attached.
 *
 * Preview-creation mode: standalone app/game/widget generation for the
 * preview canvas (direct creation path).
 */

export const EXECUTION_MODES = Object.freeze({
  CONVERSATIONAL: 'conversational',
  REPOSITORY_AGENT: 'repository-agent',
  PREVIEW_CREATION: 'preview-creation'
});

const REPOSITORY_ACTION_PATTERN = /\b(edit|modify|change|update|refactor|debug|fix|repair|rewrite|optimise|optimize|implement|improve|add|remove|rename|migrate|upgrade|clean|correct|patch|review)\b/i;

const REPOSITORY_TARGET_PATTERN = /\b(file|files|code|project|repo|repository|app|component|function|class|module|test|tests|build|script|config|package|api|endpoint|database|schema|bug|issue|error|feature|functionality)\b/i;

const REPOSITORY_CONTEXT_PATTERN = /\b(in (my|this|our|the) (project|repo|repository|codebase|code|app|workspace|folder|directory)|existing (project|code|app|repo|repository)|in this (file|project|repo)|my (repo|repository|project|code)|our (repo|repository|project|codebase)|this (repo|repository|codebase|code|file|function|class|component))\b/i;

const PREVIEW_CREATION_PATTERN = /\b(build|create|make|generate|design|develop)\b.{0,80}\b(app|game|widget|page|website|site|dashboard|tool|animation|visual|clock|calculator|timer|quiz|canvas)\b/i;

const REVISION_PATTERN = /\[Context: The user is requesting a revision/i;

export function classifyExecutionMode(prompt, context = {}) {
  const text = String(prompt || '').trim();
  if (!text) return EXECUTION_MODES.CONVERSATIONAL;

  // Revision of an embedded code block is single-artifact conversational
  // work: the code travels inside the prompt, no repository workspace is
  // involved, and the established revision flow in aiService handles it
  // (hosted revision or the "code not changed" fallback). It must never be
  // misrouted to the repository agent.
  if (REVISION_PATTERN.test(text)) return EXECUTION_MODES.CONVERSATIONAL;

  // Explicit repository context (existing project, this repo, my codebase...)
  // always routes to the repository agent.
  if (REPOSITORY_CONTEXT_PATTERN.test(text)) return EXECUTION_MODES.REPOSITORY_AGENT;

  // Standalone creation for the preview canvas takes the direct path.
  if (PREVIEW_CREATION_PATTERN.test(text)) return EXECUTION_MODES.PREVIEW_CREATION;

  // Repository actions against repository targets (modify this file, fix the
  // bug in the api, refactor the component...) route to the agent.
  if (REPOSITORY_ACTION_PATTERN.test(text)
    && REPOSITORY_TARGET_PATTERN.test(text)
    && !/^what|^how|^why|^explain|^can you explain/i.test(text)) {
    return EXECUTION_MODES.REPOSITORY_AGENT;
  }

  // Test/build repair language.
  if (/\b(fix|repair|make pass|failing)\b.{0,60}\b(tests?|build|lint|compilation)\b/i.test(text)) {
    return EXECUTION_MODES.REPOSITORY_AGENT;
  }

  if (context.forceRepositoryMode === true) return EXECUTION_MODES.REPOSITORY_AGENT;
  if (context.forcePreviewCreation === true) return EXECUTION_MODES.PREVIEW_CREATION;

  return EXECUTION_MODES.CONVERSATIONAL;
}

export function isRepositoryMode(prompt, context) {
  return classifyExecutionMode(prompt, context) === EXECUTION_MODES.REPOSITORY_AGENT;
}
