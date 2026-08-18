import { describe, it, expect } from 'vitest';
import {
  DESIGN_ARCHETYPES,
  FORBIDDEN_DESIGN_TROPES,
  QUALITY_DESIGN_STANDARDS,
  detectDesignArchetype,
  generateTokensCss,
  buildDesignSystemPrompt,
  formatAntiSlopPrompt
} from '../packages/agent-core/designSystems/index.js';
import { buildSwarmContext } from '../worker/swarm.js';

describe('Design Systems Engine (Open-Design Integration)', () => {
  it('defines all core archetypes with required tokens and typography', () => {
    const requiredArchetypes = [
      'linear-dark',
      'apple-glass',
      'editorial-serif',
      'modern-saas',
      'cyberpunk-arcade',
      'bento-grid'
    ];

    for (const id of requiredArchetypes) {
      const archetype = DESIGN_ARCHETYPES[id];
      expect(archetype).toBeDefined();
      expect(archetype.id).toBe(id);
      expect(archetype.name).toBeTruthy();
      expect(archetype.googleFontsImport).toContain('@import');
      expect(archetype.tokens).toBeDefined();
      expect(archetype.tokens['--bg-primary']).toMatch(/^#[0-9a-fA-F]{6}|rgba/);
      expect(archetype.tokens['--text-primary']).toBeTruthy();
      expect(archetype.tokens['--accent']).toBeTruthy();
      expect(archetype.tokens['--border-subtle']).toBeTruthy();
      expect(archetype.signatureInteractions?.length).toBeGreaterThan(0);
    }
  });

  it('detects archetypes accurately based on prompt keywords and explicit style', () => {
    expect(detectDesignArchetype('build an iOS styled weather app').id).toBe('apple-glass');
    expect(detectDesignArchetype('create a luxury fashion magazine article').id).toBe('editorial-serif');
    expect(detectDesignArchetype('enterprise CRM analytics dashboard for billing').id).toBe('modern-saas');
    expect(detectDesignArchetype('2D arcade space shooter game with high scores').id).toBe('cyberpunk-arcade');
    expect(detectDesignArchetype('bento grid portfolio showcase').id).toBe('bento-grid');
    expect(detectDesignArchetype('minimal developer code terminal').id).toBe('linear-dark');

    // Explicit override
    expect(detectDesignArchetype('something generic', 'editorial-serif').id).toBe('editorial-serif');
  });

  it('generates valid CSS token blocks with generateTokensCss', () => {
    const archetype = DESIGN_ARCHETYPES['linear-dark'];
    const css = generateTokensCss(archetype);
    expect(css).toContain(':root {');
    expect(css).toContain('--bg-primary: #090a0f;');
    expect(css).toContain('--text-primary: #f3f4f6;');
    expect(css).toContain('--accent: #3b82f6;');
    expect(css).toContain('}');
  });

  it('builds comprehensive design prompts with typography, tokens, micro-interactions, and anti-slop rules', () => {
    const prompt = buildDesignSystemPrompt('a sleek Apple style notes application');
    expect(prompt).toContain('Active Design System: Apple Spatial Glass');
    expect(prompt).toContain('Plus Jakarta Sans');
    expect(prompt).toContain(':root {');
    expect(prompt).toContain('--bg-primary');
    expect(prompt).toContain('Signature Micro-Interactions:');
    expect(prompt).toContain('Anti-Slop & Quality Design Guidelines');
    expect(prompt).toContain('NO generic purple-on-dark');
    expect(prompt).toContain('WCAG 2.2 AA Contrast');
  });

  it('formats anti-slop prompts containing forbidden tropes and quality standards', () => {
    const antiSlop = formatAntiSlopPrompt();
    expect(antiSlop).toContain('Prohibited Patterns (NEVER use these):');
    for (const trope of FORBIDDEN_DESIGN_TROPES) {
      expect(antiSlop).toContain(trope);
    }
    expect(antiSlop).toContain('Required Quality Standards:');
    for (const standard of QUALITY_DESIGN_STANDARDS) {
      expect(antiSlop).toContain(standard);
    }
  });

  it('enriches buildSwarmContext with specialist contributions and design system tokens', () => {
    const spec = 'Build an interactive dashboard for crypto assets.';
    const contributions = [
      { role: 'architect', content: 'Header, metrics row, live chart widget, transaction feed.' },
      { role: 'art-director', content: 'Dark theme with cyan neon accents and crisp 1px borders.' }
    ];
    const swarmContext = buildSwarmContext(spec, contributions, { prompt: 'crypto analytics dashboard' });

    expect(swarmContext).toContain('Build specification:');
    expect(swarmContext).toContain('## architect');
    expect(swarmContext).toContain('## art-director');
    expect(swarmContext).toContain('Active Design System:');
    expect(swarmContext).toContain(':root {');
    expect(swarmContext).toContain('Deliver ONLY the complete, finished artifact as a single self-contained HTML document.');
  });
});
