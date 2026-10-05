/**
 * Intent type ↔ handler coverage.
 *
 * The engine scores a fixed `INTENT_HANDLERS` list and returns the winner, so a
 * type with no handler can never be produced by the local path — and nothing
 * failed loudly when one was missing. `general_question` is reachable only
 * through the no-handler fallback, and `unknown` is never produced by
 * `classifyIntent` at all. This mirrors `tests/skill-intent-coverage.test.js`,
 * which pins the same class of silent hole for skills.
 *
 * It also pins the substring-matching and guard regressions that were fixed.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  classifyIntent,
  extractRequirements,
} from '../../src/services/promptIntelligence/intentEngine.js';
import { INTENT_TYPES } from '../../src/services/promptIntelligence/schemas.js';

/**
 * Types deliberately produced by the no-handler fallback rather than a handler.
 * Anything else missing from INTENT_HANDLERS is a bug, not a decision.
 */
const FALLBACK_ONLY = new Set([
  INTENT_TYPES.GENERAL_QUESTION,
  INTENT_TYPES.UNKNOWN,
]);

const ENGINE_SOURCE = readFileSync(
  'src/services/promptIntelligence/intentEngine.js',
  'utf8',
);

/** The `INTENT_TYPES.*` keys named by the real INTENT_HANDLERS literal. */
function handlerTypes() {
  const start = ENGINE_SOURCE.indexOf('const INTENT_HANDLERS');
  const end = ENGINE_SOURCE.indexOf('function computeConfidence', start);
  const block = ENGINE_SOURCE.slice(start, end);
  // Anchored to the handler entry's own indentation (four spaces). A looser
  // match also catches `type:` inside an `extract()` return value, which is a
  // different thing and produced a phantom duplicate.
  return [...block.matchAll(/^ {4}type:\s*INTENT_TYPES\.([A-Z_]+)/gm)].map(
    (m) => m[1],
  );
}

describe('every intent type is either handled or an explicit fallback', () => {
  it('has a handler for every type not on the fallback allow-list', () => {
    const handled = new Set(handlerTypes());
    const missing = Object.entries(INTENT_TYPES)
      .filter(([key]) => !handled.has(key))
      .filter(([, value]) => !FALLBACK_ONLY.has(value))
      .map(([key, value]) => `${key} (${value})`);

    expect(
      missing,
      `intent types with no handler and not declared fallback-only: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('does not declare a handler for a type that does not exist', () => {
    const unknown = handlerTypes().filter((key) => !(key in INTENT_TYPES));
    expect(unknown, `handlers referencing unknown types: ${unknown.join(', ')}`).toEqual([]);
  });

  it('has no duplicate handler for the same type', () => {
    const types = handlerTypes();
    const duplicates = [...new Set(types.filter((t, i) => types.indexOf(t) !== i))];
    expect(duplicates, `duplicate handlers: ${duplicates.join(', ')}`).toEqual([]);
  });

  it('extracts at least one handler', () => {
    // Guards the source-scanning helper itself: a rename would otherwise make
    // the coverage assertion above pass vacuously.
    expect(handlerTypes().length).toBeGreaterThan(8);
  });
});

describe('signal matching uses word boundaries, not substrings', () => {
  // Each case previously matched a short signal inside an unrelated word and
  // reassigned the intent: `add`⊂address, `ui`⊂build, `fix`⊂prefix,
  // `play`⊂display, `icon`⊂silicon, `copy`⊂copyright.
  const cases = [
    ['build', INTENT_TYPES.DESIGN_TASK],
    ['address', INTENT_TYPES.FEATURE_IMPLEMENTATION],
    ['prefix', INTENT_TYPES.BUG_FIX],
    ['display', INTENT_TYPES.GAME_CREATION],
    ['silicon', INTENT_TYPES.IMAGE_GENERATION],
    ['copyright', INTENT_TYPES.CONTENT_CREATION],
  ];

  for (const [prompt, forbiddenType] of cases) {
    it(`"${prompt}" is not classified ${forbiddenType}`, () => {
      expect(classifyIntent(prompt).type).not.toBe(forbiddenType);
    });
  }

  it('still recognises the genuine words those signals describe', () => {
    // The boundary fix must not disable the signals themselves.
    expect(classifyIntent('Add a dark mode toggle to the settings page').type).toBe(
      INTENT_TYPES.FEATURE_IMPLEMENTATION,
    );
    expect(classifyIntent('Build a snake game with canvas').type).toBe(
      INTENT_TYPES.GAME_CREATION,
    );
  });
});

describe('an HTTP request is not social-media copy', () => {
  // The social-carousel guard read "POST" as the noun "post", so an API task
  // was classified content_creation with domain "social / marketing".
  it('does not classify an HTTP POST request as content creation', () => {
    const result = classifyIntent('Make a POST request to the /api/users endpoint');
    expect(result.type).not.toBe(INTENT_TYPES.CONTENT_CREATION);
    expect(result.domain).not.toBe('social / marketing');
  });

  it('still recognises genuine social copy', () => {
    const result = classifyIntent('Write a LinkedIn post about our launch');
    expect(result.type).toBe(INTENT_TYPES.CONTENT_CREATION);
  });
});

describe('requirement extraction is bounded', () => {
  it('does not turn a long paste into one giant explicit requirement', () => {
    const prompt = `Build ${'lorem ipsum dolor sit amet '.repeat(200)}`;
    const { explicit } = extractRequirements(prompt, classifyIntent(prompt));
    const longest = Math.max(0, ...explicit.map((r) => r.length));
    expect(
      longest,
      `an explicit requirement captured ${longest} characters from a ${prompt.length}-character prompt`,
    ).toBeLessThanOrEqual(200);
  });
});
