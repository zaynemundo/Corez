/**
 * Execution-mode classification.
 *
 * Conversational mode: the direct provider route (questions, explanations,
 * writing, brainstorming, standalone preview-canvas generation).
 *
 * Preview-creation mode: standalone app/game/widget generation for the
 * preview canvas (direct creation path).
 *
 * There is no repository-agent mode: CoreZ never executes repository work on
 * the site, and the CLI runs through the shared AgentHarness instead.
 */

export const EXECUTION_MODES = Object.freeze({
  CONVERSATIONAL: "conversational",
  PREVIEW_CREATION: "preview-creation",
});

const PREVIEW_CREATION_PATTERN =
  /\b(build|create|make|generate|design|develop)\b.{0,80}\b(app|game|widget|page|website|site|dashboard|tool|animation|visual|clock|calculator|timer|quiz|canvas)\b/i;

const REVISION_PATTERN = /\[Context: The user is requesting a revision/i;

export function classifyExecutionMode(prompt, context = {}) {
  const text = String(prompt || "").trim();
  if (!text) return EXECUTION_MODES.CONVERSATIONAL;

  // Revision of an embedded code block is single-artifact conversational
  // work: the code travels inside the prompt, and the established revision
  // flow in aiService handles it.
  if (REVISION_PATTERN.test(text)) return EXECUTION_MODES.CONVERSATIONAL;

  // Standalone creation for the preview canvas takes the direct path.
  if (PREVIEW_CREATION_PATTERN.test(text))
    return EXECUTION_MODES.PREVIEW_CREATION;

  if (context.forcePreviewCreation === true)
    return EXECUTION_MODES.PREVIEW_CREATION;

  return EXECUTION_MODES.CONVERSATIONAL;
}
