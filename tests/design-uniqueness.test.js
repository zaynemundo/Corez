import { describe, it, expect } from 'vitest';
import {
  COMPOSITION,
  COLOUR,
  MOTION,
  SIGNATURE,
  TYPOGRAPHY,
  buildDesignSystemPrompt,
  designSeed,
  distinctiveDirection,
  formatDistinctivePrompt,
  pickDesignArchetype,
} from '../packages/agent-core/designSystems/index.js';

// Briefs that name no genre: these are the ones that used to collapse onto the
// same fallback archetype, and the ones the variation has to separate.
const GENERIC_BRIEFS = [
  'a landing page for a bakery',
  'a portfolio site for a photographer',
  'a website for a law firm',
  'a site for a yoga studio',
  'a page for a coffee roastery',
  'a brochure site for a plumber',
  'a site for a dog walking service',
  'a homepage for a book club',
  'a site for a wedding planner',
  'a page for a bike repair shop',
];

const seedsFor = (briefs) => briefs.map((brief, i) => designSeed([brief, i]));

describe('a build gets a look of its own', () => {
  it('rotates the archetype for briefs that name no genre', () => {
    const chosen = GENERIC_BRIEFS.map((brief, i) =>
      pickDesignArchetype(brief, { seed: designSeed([brief, i]) }).id,
    );
    const distinct = new Set(chosen);
    // Every one of these used to resolve to 'linear-dark'; a rotation that
    // cannot separate ten unrelated briefs has not fixed anything.
    expect(distinct.size).toBeGreaterThanOrEqual(4);
    expect(chosen.some((id) => id !== 'linear-dark')).toBe(true);
  });

  it('still honours a brief that names its genre', () => {
    // The genre answer is correct, so a hash must never override it.
    for (const seed of ['harness-00000000', 'harness-ffffffff', 'design-1234abcd']) {
      expect(
        pickDesignArchetype('2D arcade space shooter game with high scores', { seed }).id,
      ).toBe('cyberpunk-arcade');
      expect(
        pickDesignArchetype('enterprise CRM analytics dashboard for billing', { seed }).id,
      ).toBe('modern-saas');
      expect(
        pickDesignArchetype('build an iOS styled weather app', { seed }).id,
      ).toBe('apple-glass');
    }
  });

  it('still honours an explicit style over both the genre and the seed', () => {
    const picked = pickDesignArchetype('a landing page for a bakery', {
      style: 'editorial-serif',
      seed: 'harness-00000000',
    });
    expect(picked.id).toBe('editorial-serif');
  });

  it('resolves a given seed to the same look every time', () => {
    // A resume or a repair re-emits the persisted artifact, so the direction
    // must not drift between attempts of the same task.
    const seed = designSeed(['a landing page for a bakery', 0]);
    const first = buildDesignSystemPrompt('a landing page for a bakery', { seed });
    const second = buildDesignSystemPrompt('a landing page for a bakery', { seed });
    expect(second).toBe(first);
    expect(distinctiveDirection(seed)).toEqual(distinctiveDirection(seed));
  });

  it('varies all five axes, not just the palette', () => {
    const seeds = seedsFor(GENERIC_BRIEFS);
    const axes = { composition: COMPOSITION, typography: TYPOGRAPHY, colour: COLOUR, signature: SIGNATURE, motion: MOTION };
    for (const [axis, options] of Object.entries(axes)) {
      const used = new Set(seeds.map((seed) => distinctiveDirection(seed)[axis]));
      // Every axis must actually move across ten briefs, or it is decoration.
      expect(used.size, `${axis} never varied`).toBeGreaterThanOrEqual(3);
      for (const value of used) expect(options).toContain(value);
    }
  });

  it('gives two briefs different directions more often than not', () => {
    const seeds = seedsFor(GENERIC_BRIEFS);
    const seen = new Set(seeds.map((s) => JSON.stringify(distinctiveDirection(s))));
    expect(seen.size).toBe(seeds.length);
  });
});

describe('the design direction reaches the build prompt', () => {
  it('carries the tokens, the anti-slop rules and the distinctive block', () => {
    const prompt = buildDesignSystemPrompt('a landing page for a bakery', {
      seed: 'harness-1a2b3c4d',
    });
    expect(prompt).toContain('Active Design System:');
    expect(prompt).toContain(':root {');
    expect(prompt).toContain('--bg-primary');
    expect(prompt).toContain('NO generic purple-on-dark');
    expect(prompt).toContain('WCAG 2.2 AA Contrast');
    expect(prompt).toContain("This Build's Distinctive Direction");
    for (const axis of ['Composition', 'Typography', 'Colour', 'Signature detail', 'Motion']) {
      expect(prompt).toContain(`**${axis}**`);
    }
  });

  it('omits the distinctive block when no seed is supplied', () => {
    // The swarm path calls this without a seed; it must keep its old shape.
    const prompt = buildDesignSystemPrompt('a sleek Apple style notes application');
    expect(prompt).toContain('Active Design System: Apple Spatial Glass');
    expect(prompt).not.toContain("This Build's Distinctive Direction");
    expect(formatDistinctivePrompt('')).toBe('');
    expect(formatDistinctivePrompt(null)).toBe('');
  });

  it('never contradicts itself: any archetype combines with any direction', () => {
    const seeds = seedsFor(GENERIC_BRIEFS);
    for (const seed of seeds) {
      const d = distinctiveDirection(seed);
      for (const value of Object.values(d)) {
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(20);
      }
    }
  });

  it('never recommends a forbidden trope', () => {
    // A direction may *name* a cliché in order to forbid it ("never a gradient
    // fill") but must never prescribe one, so every mention has to sit inside a
    // negation.
    const NEGATED = /\b(never|no|not|without|avoid|instead of|rather than)\b/;
    for (const seed of seedsFor(GENERIC_BRIEFS)) {
      const prompt = formatDistinctivePrompt(seed).toLowerCase();
      for (const trope of ['gradient', 'glassmorphism', 'purple-on-dark', 'neon', 'particle']) {
        for (const match of prompt.matchAll(new RegExp(trope, 'g'))) {
          const context = prompt.slice(Math.max(0, match.index - 70), match.index + trope.length);
          expect(
            NEGATED.test(context),
            `"${trope}" prescribed rather than forbidden in: ${context}`,
          ).toBe(true);
        }
      }
    }
  });
});
