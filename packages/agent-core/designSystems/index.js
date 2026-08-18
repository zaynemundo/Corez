/**
 * Design Systems Package
 * Unified design system tokens, anti-slop rules, and prompt builders.
 * Inspired by Open-Design (nexu-io/open-design).
 */

export { DESIGN_ARCHETYPES } from './archetypes.js';
export { FORBIDDEN_DESIGN_TROPES, QUALITY_DESIGN_STANDARDS, formatAntiSlopPrompt } from './antiSlop.js';
export { detectDesignArchetype, generateTokensCss } from './selector.js';

import { detectDesignArchetype, generateTokensCss } from './selector.js';
import { formatAntiSlopPrompt } from './antiSlop.js';

export function buildDesignSystemPrompt(userPrompt = '', options = {}) {
  const archetype = detectDesignArchetype(userPrompt, options.style);
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

  prompt += formatAntiSlopPrompt();
  return prompt;
}
