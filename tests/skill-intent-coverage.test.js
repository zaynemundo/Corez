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
import { classifyIntent } from '../src/services/intentClassifier.js';

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

// ---------------------------------------------------------------------------
// The classifier is part of the routing contract, not just a label producer.
// ---------------------------------------------------------------------------

/**
 * Resolved skill ids for a prompt the way the PRODUCT resolves it: the local
 * classifier picks the intent first, then the resolver consumes that label.
 *
 * The older helper above passes intent='general' by hand. That hid a real
 * production defect: nine specialists were unreachable for their own canonical
 * phrasing because the classifier labelled everyday requests `app`/`code-help`
 * ("help me plan my wedding reception" → code-help, "make me flashcards for
 * Spanish verbs" → app) and the engineering gate then dropped them before any
 * pattern could match. Asserting reachability through the real classifier is
 * what makes that class of bug fail loudly.
 */
function realRoutedIds(prompt) {
  const { label } = classifyIntent(prompt);
  const { skills } = resolveSkills({ intent: label, prompt });
  return (skills || []).map((s) => s.id);
}

/** Canonical phrasing per specialist, resolved through the real pipeline. */
const REAL_PIPELINE_PROMPTS = {
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

describe('specialist reachability through the real classifier', () => {
  it('has a real-pipeline probe for every specialist skill', () => {
    const missing = SPECIALIST_SKILL_IDS.filter((id) => !REAL_PIPELINE_PROMPTS[id]);
    expect(missing, `no real-pipeline probe for: ${missing.join(', ')}`).toEqual([]);
  });

  for (const id of SPECIALIST_SKILL_IDS) {
    it(`reaches "${id}" when the classifier labels the prompt`, () => {
      const prompt = REAL_PIPELINE_PROMPTS[id];
      if (!prompt) return; // covered by the completeness test above
      const { label } = classifyIntent(prompt);
      expect(
        realRoutedIds(prompt),
        `"${prompt}" (classifier said "${label}") did not reach ${id}`
      ).toContain(id);
    });
  }
});

describe('engineering briefs keep the engineering workflow', () => {
  // A specialist must never take over a genuine build or debug request, even
  // though these prompts share vocabulary with a specialist pattern.
  const cases = [
    ['Build me a quiz app with a scoreboard', 'study-aids'],
    ['Design an interactive quiz widget with score summary', 'study-aids'],
    ['Make an interactive mortgage calculator widget', 'live-data-utilities'],
    ['Develop a simple retro arcade game using html canvas', 'study-aids'],
    ['My shell script fails on line 12 with an error', 'creative-writing'],
    ['Build a project management dashboard.', 'live-data-utilities'],
  ];

  for (const [prompt, forbidden] of cases) {
    it(`"${prompt}" keeps the engineering path and does not reach ${forbidden}`, () => {
      const ids = realRoutedIds(prompt);
      expect(ids, `"${prompt}" was hijacked by ${forbidden}`).not.toContain(forbidden);
      expect(ids, `"${prompt}" lost its engineering workflow`).toContain('writing-plans');
    });
  }
});

describe('bare-noun false positives that previously hijacked specialists', () => {
  // Every case below was verified to mis-route before the patterns were
  // tightened. The noun is ordinary prose in these sentences, not a request.
  const cases = [
    // `contrast` is the comparative verb here, not a WCAG term.
    ['Compare and contrast these two novels', 'accessibility-compliance'],
    ['Compare and contrast these two research papers', 'accessibility-compliance'],
    // `script` / `story` / `novel` / `dialogue` outside a narrative framing.
    ['write a script to parse a CSV file', 'creative-writing'],
    ['How do I add a script tag to my HTML?', 'creative-writing'],
    ['Explain the user story format in agile', 'creative-writing'],
    ['We need a novel approach to caching', 'creative-writing'],
    ['This is a novel idea for reducing latency', 'creative-writing'],
    ['Explain the dialogue between the two services', 'creative-writing'],
    // `slides` as UI elements rather than deck slides.
    ['Add slide animations to my carousel', 'presentation-design'],
    ['The slide transition is janky', 'presentation-design'],
    ['Add a slides component to my carousel', 'presentation-design'],
  ];

  for (const [prompt, forbidden] of cases) {
    it(`"${prompt}" does not reach ${forbidden}`, () => {
      expect(realRoutedIds(prompt)).not.toContain(forbidden);
    });
  }

  it('does not turn a bare app noun into the heavy engineering workflow', () => {
    // These are questions and small talk. The bare noun used to pull in
    // writing-plans + TDD + review + verification transitively.
    for (const prompt of [
      'What is a content management system?',
      'Explain how a payment service works',
      'I want to meditate more, any app recommendations?',
      'How do I become a system administrator?',
    ]) {
      const ids = realRoutedIds(prompt);
      expect(ids, `"${prompt}" wrongly started the heavy workflow`).not.toContain('writing-plans');
      expect(ids, `"${prompt}" wrongly started the heavy workflow`).not.toContain('test-driven-development');
    }
  });
});

describe('tightened patterns still match their genuine requests', () => {
  const cases = [
    ['Write me a short story about a lighthouse keeper', 'creative-writing'],
    ['Write a screenplay for a short film', 'creative-writing'],
    ['Tell me a story about a brave knight', 'creative-writing'],
    ['Write a poem about the sea', 'creative-writing'],
    ['Make a 10-slide deck on our Q3 results', 'presentation-design'],
    ['Outline a 10-slide pitch deck for my startup', 'presentation-design'],
    ['Is my signup form WCAG compliant?', 'accessibility-compliance'],
    ['What is the contrast ratio requirement?', 'accessibility-compliance'],
    ['Check the colour contrast of my button', 'accessibility-compliance'],
  ];

  for (const [prompt, id] of cases) {
    it(`"${prompt}" still reaches ${id}`, () => {
      expect(realRoutedIds(prompt)).toContain(id);
    });
  }
});
