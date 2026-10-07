/**
 * Design Systems Package
 * Unified design system tokens, anti-slop rules, and prompt builders.
 * Inspired by Open-Design (nexu-io/open-design).
 */

export { DESIGN_ARCHETYPES } from './archetypes.js';
export { FORBIDDEN_DESIGN_TROPES, QUALITY_DESIGN_STANDARDS, formatAntiSlopPrompt } from './antiSlop.js';
export { detectDesignArchetype, generateTokensCss, pickDesignArchetype } from './selector.js';
export {
  COMPOSITION,
  COLOUR,
  MOTION,
  SIGNATURE,
  TYPOGRAPHY,
  designSeed,
  distinctiveDirection,
  formatDistinctivePrompt,
  hash32,
} from './distinctive.js';

import { generateTokensCss, pickDesignArchetype } from './selector.js';
import { formatAntiSlopPrompt } from './antiSlop.js';
import { formatDistinctivePrompt } from './distinctive.js';

/**
 * The full design direction for one build.
 *
 * @param {string} userPrompt - the brief.
 * @param {{ style?: string|null, seed?: string }} [options] - `seed` makes the
 *   archetype and the five distinctive choices stable for one task; omit it and
 *   the behaviour is the old keyword detection.
 * @returns {string} a markdown block for the build's system context.
 */
export function buildDesignSystemPrompt(userPrompt = '', options = {}) {
  const archetype = pickDesignArchetype(userPrompt, options);
  const tokensCss = generateTokensCss(archetype);

  let prompt = `## Active Design System: ${archetype.name}\n`;
  prompt += `**Description**: ${archetype.description}\n\n`;
  prompt += `### Typography\n`;
  prompt += `- Font Import: \`${archetype.googleFontsImport}\`\n`;
  prompt += `- Display Font: \`${archetype.fontFamilies.display}\`\n`;
  prompt += `- Body Font: \`${archetype.fontFamilies.body}\`\n`;
  prompt += `- Monospace Font: \`${archetype.fontFamilies.mono}\`\n\n`;

  prompt += `### Design Tokens (Embed inside \`<style>\` :root block):\n`;
  prompt += `\`\`\`css\n${tokensCss}\n\`\`\`\n\n`;

  prompt += `### Signature Micro-Interactions:\n`;
  for (const interaction of archetype.signatureInteractions || []) {
    prompt += `- ${interaction}\n`;
  }
  prompt += '\n';

  const distinctive = formatDistinctivePrompt(options.seed);
  if (distinctive) prompt += `${distinctive}\n\n`;

  prompt += formatAntiSlopPrompt();
  return prompt;
}
