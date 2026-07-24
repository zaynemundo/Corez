import { describe, it, expect } from 'vitest';
import { detectAwwwardsCategory, buildAwwwardsDesignPrompt, AWWWARDS_CATEGORIES } from '../../packages/agent-core/index.js';

describe('Awwwards Category-Aware Design Router', () => {
  it('detects e-commerce category from prompt', () => {
    const matched = detectAwwwardsCategory('create a website for my product shop');
    expect(matched).toBeDefined();
    expect(matched.categoryKey).toBe('e-commerce');
    expect(matched.url).toContain('awwwards.com/websites/e-commerce');
  });

  it('detects gaming category from prompt', () => {
    const matched = detectAwwwardsCategory('build an arcade gaming site');
    expect(matched).toBeDefined();
    expect(matched.categoryKey).toBe('gaming');
  });

  it('detects saas category from prompt', () => {
    const matched = detectAwwwardsCategory('build an analytics saas dashboard');
    expect(matched).toBeDefined();
    expect(matched.categoryKey).toBe('saas');
  });

  it('injects category design pattern into system prompt', () => {
    const prompt = buildAwwwardsDesignPrompt('create a product store e-commerce page');
    expect(prompt).toContain('E-Commerce & Product Showcase');
    expect(prompt).toContain('awwwards.com/websites/e-commerce');
  });
});
