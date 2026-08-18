/**
 * Design Archetype Selector & Token Generator
 * Selects or synthesizes the best design system archetype based on user prompt.
 */

import { DESIGN_ARCHETYPES } from './archetypes.js';

export function detectDesignArchetype(prompt = '', requestedStyle = null) {
  if (requestedStyle && DESIGN_ARCHETYPES[requestedStyle]) {
    return DESIGN_ARCHETYPES[requestedStyle];
  }

  const text = String(prompt || '').toLowerCase();

  // Check explicit match against archetype keys or names
  for (const [key, archetype] of Object.entries(DESIGN_ARCHETYPES)) {
    if (text.includes(key) || text.includes(archetype.name.toLowerCase())) {
      return archetype;
    }
  }

  // Keyword match score
  let bestArchetype = DESIGN_ARCHETYPES['linear-dark'];
  let maxScore = 0;

  for (const archetype of Object.values(DESIGN_ARCHETYPES)) {
    let score = 0;
    for (const keyword of archetype.keywords) {
      if (new RegExp(`\\b${keyword}\\b`, 'i').test(text)) {
        score += 1;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      bestArchetype = archetype;
    }
  }

  return bestArchetype;
}

export function generateTokensCss(archetype) {
  if (!archetype || !archetype.tokens) return '';
  const lines = Object.entries(archetype.tokens).map(([k, v]) => `  ${k}: ${v};`);
  return `:root {\n${lines.join('\n')}\n}`;
}
