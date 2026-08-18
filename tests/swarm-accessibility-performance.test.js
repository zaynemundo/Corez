import { describe, it, expect } from 'vitest';
import { SWARM_ROLES, decideSwarmMode, SWARM_MODE } from '../packages/agent-core/swarm/index.js';
import {
  resolveSpecialistBriefs,
  buildSwarmContext
} from '../worker/swarm.js';
import { handleAgentsCommand } from '../packages/cli/src/commands/agents.js';

describe('Swarm Capabilities & Specialist Roles', () => {
  it('registers ACCESSIBILITY and PERFORMANCE roles in SWARM_ROLES', () => {
    expect(SWARM_ROLES.ACCESSIBILITY).toBe('accessibility');
    expect(SWARM_ROLES.PERFORMANCE).toBe('performance');
    expect(SWARM_ROLES.ART_DIRECTOR).toBe('art-director');
  });

  it('routes accessibility, WCAG, and performance prompts to SWARM mode', () => {
    expect(decideSwarmMode('audit accessibility and WCAG contrast for button components')).toBe(SWARM_MODE.SWARM);
    expect(decideSwarmMode('optimize lighthouse performance and asset caching')).toBe(SWARM_MODE.SWARM);
    expect(decideSwarmMode('build a multi-page portal with docs')).toBe(SWARM_MODE.SWARM);
    expect(decideSwarmMode('fix typo in header')).toBe(SWARM_MODE.FAST);
  });

  it('dynamically resolves specialist briefs based on prompt keywords', () => {
    const defaultBriefs = resolveSpecialistBriefs('build a portfolio website');
    expect(defaultBriefs.map((b) => b.role)).toEqual(['architect', 'art-director']);

    const a11yBriefs = resolveSpecialistBriefs('build a dashboard with WCAG 2.2 accessibility and aria labels');
    expect(a11yBriefs.map((b) => b.role)).toEqual(['architect', 'art-director', 'accessibility']);

    const perfBriefs = resolveSpecialistBriefs('optimize page speed and lighthouse performance');
    expect(perfBriefs.map((b) => b.role)).toEqual(['architect', 'art-director', 'performance']);

    const fullBriefs = resolveSpecialistBriefs('create high-performance accessible web app with WCAG compliance');
    expect(fullBriefs.map((b) => b.role)).toEqual(['architect', 'art-director', 'accessibility', 'performance']);
  });

  it('buildSwarmContext formats accessibility and performance specialist contributions cleanly', () => {
    const spec = 'An accessible e-commerce catalog with instant search.';
    const contributions = [
      { role: 'architect', content: 'Use semantic layout and clean state machine.' },
      { role: 'art-director', content: 'Minimal monochromatic palette with 4.5:1 text contrast.' },
      { role: 'accessibility', content: 'Include aria-live regions for search results and visible focus outlines.' },
      { role: 'performance', content: 'Debounce search queries and defer offscreen image loading.' }
    ];

    const context = buildSwarmContext(spec, contributions);
    expect(context).toContain('## architect\nUse semantic layout and clean state machine.');
    expect(context).toContain('## art-director\nMinimal monochromatic palette with 4.5:1 text contrast.');
    expect(context).toContain('## accessibility\nInclude aria-live regions for search results and visible focus outlines.');
    expect(context).toContain('## performance\nDebounce search queries and defer offscreen image loading.');
    expect(context).toContain('Deliver ONLY the complete, finished artifact as a single self-contained HTML document.');
  });

  it('lists all swarm roles in the corez agents CLI command', async () => {
    const logLines = [];
    const origLog = console.log;
    console.log = (msg) => logLines.push(msg);

    try {
      await handleAgentsCommand([], {}, { banner: () => {} });
      const output = logLines.join('\n');
      expect(output).toContain('- ACCESSIBILITY');
      expect(output).toContain('- PERFORMANCE');
      expect(output).toContain('- ART-DIRECTOR');
      expect(output).toContain('WCAG 2.2 AA accessibility');
      expect(output).toContain('DOM complexity, rendering smoothness');
    } finally {
      console.log = origLog;
    }
  });
});
