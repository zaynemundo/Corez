import { describe, it, expect } from 'vitest';
import { detectAwwwardsCategory, buildAwwwardsDesignPrompt } from '../../packages/agent-core/index.js';

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

  it('detects fashion category from prompt', () => {
    const matched = detectAwwwardsCategory('build a fashion apparel lookbook website');
    expect(matched).toBeDefined();
    expect(matched.categoryKey).toBe('fashion');
  });

  it('detects mobile-apps category from prompt', () => {
    const matched = detectAwwwardsCategory('create an iOS phone-app landing page');
    expect(matched).toBeDefined();
    expect(matched.categoryKey).toBe('mobile-apps');
  });

  it('detects web3-crypto category from prompt', () => {
    const matched = detectAwwwardsCategory('build a crypto wallet NFT app');
    expect(matched).toBeDefined();
    expect(matched.categoryKey).toBe('web3-crypto');
  });

  it('injects category design pattern into system prompt', () => {
    const prompt = buildAwwwardsDesignPrompt('create a product store e-commerce page');
    expect(prompt).toContain('E-Commerce & Product Showcase');
    expect(prompt).toContain('awwwards.com/websites/e-commerce');
  });
});
