/**
 * Skill ↔ intent routing coverage.
 *
 * Every specialist skill is selected by a regex in SPECIALIST_TRIGGER_PATTERNS
 * against the raw user prompt. That mapping had two silent holes: a skill could
 * exist with no pattern (unreachable forever), and a pattern could demand a
 * noun form users never type ("wedding planning") while missing the natural
 * verb+object phrasing ("plan my wedding reception"). Neither fails loudly —
 * the skill just never activates.
 *
 * These tests pin reachability, the specific phrasings that were broken, and
 * the engineering-intent guard that stops specialists hijacking code requests.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveSkills, SPECIALIST_SKILL_IDS } from '../src/skills/resolver.js';

/** One natural user phrasing per specialist skill. */
const NATURAL_PROMPTS = {
  'research-report': 'Do a deep dive on the EV market for me',
  'document-generation': 'Draft an NDA for a freelance contract',
  'data-analysis': 'Here is my CSV, what stands out in the numbers?',
  'marketing-copywriting': 'Write a tagline for my coffee brand',
  'translation-localization': 'Translate this paragraph into Spanish',
  'live-data-utilities': 'What is the weather in Dubai tomorrow?',
  'education-tutor': 'Teach me Rust from scratch',
  'accessibility-compliance': 'Is my signup form WCAG compliant?',
  'cloudflare-platform': 'How do I configure my wrangler.jsonc?',
  'business-planning': 'Write a business plan for a small cafe',
  'resume-career': 'Can you review my resume?',
  'creative-writing': 'Write me a short story about a lighthouse',
  'presentation-design': 'Make a 10-slide deck on our Q3 results',
  'personal-productivity': 'Help me plan my day',
  'personal-finance': 'Help me budget my monthly spending',
  'travel-planning': 'Plan a 5 day trip to Japan',
  'fitness-nutrition': 'Build me a workout plan for the gym',
  'event-planning': 'Help me plan my wedding reception',
  'study-aids': 'Make me flashcards for Spanish verbs',
  'meeting-notes': 'Summarise these meeting notes into action items',
  'user-learning': 'Remember that I prefer dark mode',
};

/** Resolved skill ids for a conversational (non-engineering) request. */
function routedIds(prompt, intent = 'general') {
  const { skills } = resolveSkills({ intent, prompt });
  return (skills || []).map((s) => s.id);
}

describe('specialist trigger table integrity', () => {
  it('has exactly one pattern per specialist skill and no dead entries', () => {
    const src = readFileSync('src/skills/resolver.js', 'utf8');
    const start = src.indexOf('const SPECIALIST_TRIGGER_PATTERNS');
    const end = src.indexOf('function matchSpecialistSkills', start);
    const block = src.slice(start, end);
    const patternIds = [...block.matchAll(/id:\s*["']([\w-]+)["']/g)].map((m) => m[1]);

    const unreachable = SPECIALIST_SKILL_IDS.filter((id) => !patternIds.includes(id));
    const dead = patternIds.filter((id) => !SPECIALIST_SKILL_IDS.includes(id));

    expect(unreachable, `specialist skills with no trigger pattern: ${unreachable.join(', ')}`).toEqual([]);
    expect(dead, `trigger patterns with no matching skill: ${dead.join(', ')}`).toEqual([]);
  });
});

describe('specialist reachability', () => {
  it('has a natural prompt defined for every specialist skill', () => {
    const missing = SPECIALIST_SKILL_IDS.filter((id) => !NATURAL_PROMPTS[id]);
    expect(missing, `no probe prompt for: ${missing.join(', ')}`).toEqual([]);
  });

  for (const id of SPECIALIST_SKILL_IDS) {
    it(`routes "${id}" for a natural phrasing`, () => {
      const prompt = NATURAL_PROMPTS[id];
      if (!prompt) return; // covered by the completeness test above
      expect(routedIds(prompt), `"${prompt}" did not reach ${id}`).toContain(id);
    });
  }
});

describe('verb+object phrasings that previously missed', () => {
  // The pattern demanded "wedding planning" / "analyze this csv" and ignored the
  // way people actually write these requests.
  const cases = [
    ['event-planning', 'Help me plan my wedding reception'],
    ['event-planning', 'I want to organise a birthday party'],
    ['event-planning', 'planning our graduation party'],
    ['data-analysis', 'Here is my CSV, what stands out in the numbers?'],
    ['data-analysis', 'what stands out in this data'],
    ['data-analysis', 'can you clean my dataset'],
    ['data-analysis', 'find trends in my sales numbers'],
  ];

  for (const [id, prompt] of cases) {
    it(`"${prompt}" -> ${id}`, () => {
      expect(routedIds(prompt)).toContain(id);
    });
  }
});

describe('negative cases — specialists must not over-fire', () => {
  it('does not treat an unrelated "event" or "reception" as event planning', () => {
    expect(routedIds('Explain the JavaScript event loop')).not.toContain('event-planning');
    expect(routedIds('What is the hotel reception desk schedule?')).not.toContain('event-planning');
  });

  it('keeps specialists away from engineering intents', () => {
    // The csv word alone would match data-analysis, but a code-help request must
    // keep its engineering workflow instead of being hijacked by a specialist.
    const ids = routedIds('How do I parse a CSV in Python?', 'code-help');
    expect(ids).not.toContain('data-analysis');
  });
});
