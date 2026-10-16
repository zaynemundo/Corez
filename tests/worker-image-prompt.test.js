import { describe, it, expect } from 'vitest';
import {
  enhanceImagePrompt,
  stripImageCommandWrappers,
  isRichImagePrompt,
  MAX_IMAGE_PROMPT_CHARS,
} from '../worker/imagePrompt.js';

describe('stripImageCommandWrappers', () => {
  it.each([
    ['@image a flower', 'a flower'],
    ['generate an image of a flower', 'a flower'],
    ['create a picture of a red castle', 'a red castle'],
    ['draw me a cat', 'a cat'],
    ['paint a sunset over the sea', 'a sunset over the sea'],
    ['a drawing of a cat', 'a cat'],
    ['photo of my dog', 'my dog'],
    ['@image generate a picture of a flower', 'a flower'],
    ['a flower', 'a flower'],
    ['a flower.', 'a flower'],
  ])('strips wrappers from "%s"', (input, expected) => {
    expect(stripImageCommandWrappers(input)).toBe(expected);
  });
});

describe('enhanceImagePrompt', () => {
  it('expands a bare subject like flower into a full photographic prompt', () => {
    const out = enhanceImagePrompt('flower');
    expect(out.startsWith('flower,')).toBe(true);
    expect(out).toContain('photograph');
    expect(out).toContain('4k');
  });

  it('picks a portrait tail for people, not generic photo terms', () => {
    const out = enhanceImagePrompt('portrait of a woman');
    expect(out).toContain('portrait photography');
    expect(out).toContain('bokeh');
    expect(out).not.toContain('photograph,');
  });

  it('never forces photorealism on illustration styles', () => {
    for (const subject of ['anime girl', 'company logo', 'pixel art castle']) {
      const out = enhanceImagePrompt(subject);
      expect(out).not.toMatch(/photorealistic|photograph/);
    }
    expect(enhanceImagePrompt('company logo')).toContain('flat vector');
    expect(enhanceImagePrompt('anime girl')).toContain('digital artwork');
  });

  it('leaves crafted prompts byte-identical', () => {
    const rich =
      'a red castle on a hill, sunset, dramatic clouds, birds flying, matte painting';
    expect(enhanceImagePrompt(rich)).toBe(rich);
    const long =
      'a quiet mountain lake at dawn with mist over the water and pine forests all around the very calm shoreline reflecting softly';
    expect(enhanceImagePrompt(long)).toBe(long);
    expect(enhanceImagePrompt('a flower, photorealistic')).toBe(
      'a flower, photorealistic',
    );
  });

  it('strips wrappers before enhancing', () => {
    expect(enhanceImagePrompt('@image flower').startsWith('flower,')).toBe(true);
  });

  it('caps runaway length and blanks', () => {
    expect(enhanceImagePrompt('   ')).toBe('');
    expect(enhanceImagePrompt(null)).toBe('');
    const out = enhanceImagePrompt(`flower ${'very '.repeat(200)}tall`);
    expect(out.length).toBeLessThanOrEqual(MAX_IMAGE_PROMPT_CHARS);
  });
});

describe('isRichImagePrompt', () => {
  it('treats long, structured, or art-directed prompts as rich', () => {
    expect(isRichImagePrompt('a flower, sunset, 4k')).toBe(true);
    expect(isRichImagePrompt('x'.repeat(120))).toBe(true);
    expect(isRichImagePrompt('cinematic shot of a castle')).toBe(true);
    expect(isRichImagePrompt('flower')).toBe(false);
  });
});
