/**
 * Design Archetype Selector & Token Generator
 * Selects or synthesizes the best design system archetype based on user prompt.
 */

import { DESIGN_ARCHETYPES } from './archetypes.js';
import { hash32 } from './distinctive.js';

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

/**
 * The archetype for one build, varied rather than fixed.
 *
 * `detectDesignArchetype` answers the same archetype for every brief that
 * scores the same keywords, and answers `linear-dark` for every brief that
 * scores none -- so "a landing page for a bakery", "a portfolio for a
 * photographer" and "a site for a law firm" all came out of the same dark
 * developer palette. The look was not chosen; it was the fallback.
 *
 * This keeps the two cases where a specific answer is correct -- an explicit
 * style, and a brief whose keywords actually name a genre -- and varies the
 * rest across all six archetypes by a hash of the seed. A given seed always
 * resolves to the same archetype, because the harness re-emits a persisted
 * artifact on resume and the look must not change between attempts.
 *
 * @param {string} prompt - the user's brief.
 * @param {{ style?: string|null, seed?: string }} [options]
 * @returns {object} the chosen archetype.
 */
export function pickDesignArchetype(prompt = '', options = {}) {
  const { style = null, seed = '' } = options;

  if (style && DESIGN_ARCHETYPES[style]) return DESIGN_ARCHETYPES[style];

  // A brief that names its genre keeps that genre: a cyberpunk game must not be
  // rotated onto an editorial serif because of a hash.
  const detected = detectDesignArchetype(prompt, null);
  if (scoresKeywords(prompt, detected)) return detected;

  const ids = Object.keys(DESIGN_ARCHETYPES);
  if (!seed) return detected;
  return DESIGN_ARCHETYPES[ids[hash32(seed) % ids.length]];
}

/** Whether the prompt actually named this archetype, rather than falling to it. */
function scoresKeywords(prompt, archetype) {
  const text = String(prompt || '').toLowerCase();
  if (!archetype) return false;
  if (text.includes(archetype.id) || text.includes(archetype.name.toLowerCase())) {
    return true;
  }
  return archetype.keywords.some((keyword) =>
    new RegExp(`\\b${keyword}\\b`, 'i').test(text),
  );
}
