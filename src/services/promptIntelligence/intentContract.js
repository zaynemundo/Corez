/**
 * CoreZ Intent Contract
 *
 * Every task gets an intent contract defining:
 *   - mustAchieve  — things the execution MUST deliver
 *   - mayInfer     — things CoreZ may reasonably assume
 *   - mustNotInvent — things that must never be fabricated
 */

import { INTENT_TYPES } from './schemas.js';
import { createIntentContract as _createContract } from './schemas.js';

export function createIntentContract(intent, requirements) {
  const contract = _createContract();
  const type = intent?.type;
  const explicit = requirements?.explicit || [];
  const inferred = requirements?.inferred || [];
  const forbidden = requirements?.forbidden || [];

  // All explicit requirements are mandatory
  contract.mustAchieve = [...explicit].filter(Boolean);

  // Deduplicate
  contract.mustAchieve = [...new Set(contract.mustAchieve)];

  // Safely inferred items
  contract.mayInfer = [...inferred].filter(Boolean);
  contract.mayInfer = [...new Set(contract.mayInfer)];

  // Forbidden creations
  contract.mustNotInvent = [...forbidden].filter(Boolean);
  contract.mustNotInvent = [...new Set(contract.mustNotInvent)];

  // Add intent-type defaults
  enrichContactWithDefaults(contract, type);

  return contract;
}

function enrichContactWithDefaults(contract, type) {
  const mustAchieve = contract.mustAchieve;
  const mustNotInvent = contract.mustNotInvent;
  const typeDefaults = TYPE_DEFAULTS[type] || TYPE_DEFAULTS.default;

  if (typeDefaults.mustAchieve) {
    for (const item of typeDefaults.mustAchieve) {
      if (!mustAchieve.some((e) => e.toLowerCase().includes(item.toLowerCase()))) {
        mustAchieve.push(item);
      }
    }
  }

  if (typeDefaults.mustNotInvent) {
    for (const item of typeDefaults.mustNotInvent) {
      if (!mustNotInvent.some((e) => e.toLowerCase().includes(item.toLowerCase()))) {
        mustNotInvent.push(item);
      }
    }
  }
}

const TYPE_DEFAULTS = {
  [INTENT_TYPES.WEBSITE_CREATION]: {
    mustAchieve: ['create a functional website'],
    mustNotInvent: [
      'real company claims',
      'real customer testimonials',
      'real pricing',
      'real certifications',
      'real employee names',
      'real contact information',
    ],
  },
  [INTENT_TYPES.GAME_CREATION]: {
    mustAchieve: ['create a playable browser game'],
    mustNotInvent: [
      'paid/subscription features unless requested',
      'multiplayer networking unless requested',
      'external API integrations unless requested',
    ],
  },
  [INTENT_TYPES.FEATURE_IMPLEMENTATION]: {
    mustAchieve: ['implement the requested feature'],
    mustNotInvent: [
      'unrelated features',
      'breaking changes to existing APIs',
      'new dependencies unless necessary',
    ],
  },
  [INTENT_TYPES.BUG_FIX]: {
    mustAchieve: ['fix the reported bug', 'preserve existing behavior'],
    mustNotInvent: [
      'new features',
      'unrelated refactors',
    ],
  },
  [INTENT_TYPES.SIMPLE_EDIT]: {
    mustAchieve: ['make the requested change'],
    mustNotInvent: [
      'extensive refactors',
      'new features',
      'additional changes beyond the request',
    ],
  },
  default: {
    mustAchieve: [],
    mustNotInvent: ['factual claims without sources', 'pricing for real products', 'real testimonials'],
  },
};

/**
 * Checks whether the contract is violated by a given enriched prompt.
 */
export function checkContractViolations(contract, enrichedPrompt) {
  if (!contract || !enrichedPrompt || typeof enrichedPrompt !== 'string') return [];

  const lower = enrichedPrompt.toLowerCase();
  const violations = [];

  for (const forbidden of contract.mustNotInvent) {
    if (forbidden === 'real customer testimonials' && /\b(testimonials?|what our customer|client says|happy customer)\b/i.test(lower)) {
      violations.push({ rule: forbidden, reason: 'Prompt introduces testimonial language that could suggest fabricated content' });
    }
    if (forbidden === 'real pricing' && /\b(\$\d+\.\d{2}|\$\d+|price.*\d+|costs.*\$|pricing.*plan)\b/i.test(lower) && /\b(pricing|price|plan)\b/i.test(lower)) {
      violations.push({ rule: forbidden, reason: 'Prompt suggests specific pricing amounts' });
    }
    if (forbidden === 'real certifications' && /\b(certified by|ISO|accredited|certification from)\b/i.test(lower)) {
      violations.push({ rule: forbidden, reason: 'Prompt introduces certification claims' });
    }
    if (forbidden === 'paid/subscription features unless requested' && /\b(paid subscription|premium plan|subscription model|premium content)\b/i.test(lower)) {
      violations.push({ rule: forbidden, reason: 'Prompt adds unauthorized subscription/payment language' });
    }
    if (forbidden === 'new features' && /\b(new feature|additionally|bonus|extra.*feature)\b/i.test(lower)) {
      violations.push({ rule: forbidden, reason: 'Prompt suggests scope expansion beyond the requested fix/change' });
    }
  }

  return violations;
}
