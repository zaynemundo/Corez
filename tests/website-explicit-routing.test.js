import { describe, it, expect } from 'vitest';
import {
  isExplicitWebsiteRequest,
  analyzePublicUserIntent,
} from '../src/services/aiService.js';
import { classifyIntent } from '../src/services/promptIntelligence/intentEngine.js';

describe('explicit website requests (same rules as @image)', () => {
  it('detects explicit website builds including natural-language phrasing', () => {
    const cases = [
      ['@website premium headphones store', true],
      ['build a website', true],
      ['make me a website for office chairs', true],
      ['create a landing page', true],
      ['Build me a landing page for a bakery', true],
      ['Build a responsive React user dashboard for managing customer subscriptions', true],
      ['Ship an online store catalog website with cart state', true],
      ['generate a portfolio site for my photography', true],
      // Verb-governed builds stay explicit even in writing contexts.
      ['build a website for my resume', true],
      // Noun-first phrasing with a governing build verb.
      ['A portfolio site for my photography, please build it', true],
    ];
    for (const [prompt, expected] of cases) {
      expect(isExplicitWebsiteRequest(prompt), prompt).toBe(expected);
    }
  });

  it('never treats questions, writing, or code contexts as website builds', () => {
    const cases = [
      ['What should I check before deploying a website to production?', false],
      ['what is a website', false],
      ['explain how websites work', false],
      ['write an email about our new website launch', false],
      ['write an email about images', false],
      ['tell me a story', false],
      ['fix the website header bug', false],
      ['write a post for this carousel', false],
      ['Revise code: update the landing page styles\n```html\n<div>hi</div>\n```', false],
      ['give me less description for this CV with developed websites using wordpress', false],
    ];
    for (const [prompt, expected] of cases) {
      expect(isExplicitWebsiteRequest(prompt), prompt).toBe(expected);
    }
  });

  it('classifies explicit builds as website_creation', () => {
    expect(classifyIntent('build a website').type).toBe('website_creation');
    expect(classifyIntent('make me a website for office chairs').type).toBe(
      'website_creation',
    );
    expect(classifyIntent('create a landing page').type).toBe(
      'website_creation',
    );
  });

  it('does not classify bare website mentions as website_creation', () => {
    expect(
      classifyIntent('What should I check before deploying a website to production?')
        .type,
    ).not.toBe('website_creation');
    expect(
      classifyIntent('write an email about our new website launch').type,
    ).not.toBe('website_creation');
    expect(classifyIntent('what is a website').type).not.toBe(
      'website_creation',
    );
  });

  it('routes explicit builds to app intent and bare mentions away from it', () => {
    expect(analyzePublicUserIntent('build a website').type).toBe('app');
    expect(
      analyzePublicUserIntent('Build me a landing page for a bakery').type,
    ).toBe('app');
    expect(
      analyzePublicUserIntent(
        'What should I check before deploying a website to production?',
      ).type,
    ).not.toBe('app');
    expect(
      analyzePublicUserIntent('write an email about our new website launch')
        .type,
    ).not.toBe('app');
    expect(analyzePublicUserIntent('what is a website').type).not.toBe('app');
  });
});
