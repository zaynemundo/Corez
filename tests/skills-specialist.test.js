import { describe, it, expect } from 'vitest';
import { defaultSkillRegistry } from '../src/skills/registry.js';
import { resolveSkills, SPECIALIST_SKILL_IDS } from '../src/skills/resolver.js';

const scenarios = [
  { id: 'research-report', prompt: 'Write me a research report on AI in healthcare, citing sources' },
  { id: 'document-generation', prompt: 'Create a PDF invoice for my freelance design work' },
  { id: 'data-analysis', prompt: 'Analyze this sales CSV and tell me the monthly trends' },
  { id: 'marketing-copywriting', prompt: 'Write launch copy and a tagline for my new coffee brand' },
  { id: 'translation-localization', prompt: 'Translate my landing page into Spanish' },
  { id: 'live-data-utilities', prompt: 'Convert 5000 PHP to USD' },
  { id: 'live-data-utilities', prompt: 'What is the weather in Tokyo right now?' },
  { id: 'education-tutor', prompt: 'Teach me JavaScript from zero' },
  { id: 'accessibility-compliance', prompt: 'Make my landing page WCAG 2.2 accessible' },
  { id: 'business-planning', prompt: 'Help me plan a startup: pricing strategy and go-to-market' },
  { id: 'resume-career', prompt: 'Rewrite my resume for a data science role' }
];

describe('CoreZ Specialist Skills', () => {
  it('registers every specialist skill in the registry', () => {
    const allIds = defaultSkillRegistry.getAllSkills().map(s => s.id);
    for (const id of SPECIALIST_SKILL_IDS) {
      expect(allIds).toContain(id);
    }
  });

  it('activates the matching specialist skill for each user scenario', () => {
    for (const { id, prompt } of scenarios) {
      const { skills } = resolveSkills({ intent: 'general', prompt });
      const skillIds = skills.map(s => s.id);
      expect(skillIds, `scenario "${prompt}" should activate ${id}`).toContain(id);
    }
  });

  it('works for writing and explanation intents on the fast path', () => {
    const research = resolveSkills({ intent: 'writing', prompt: 'Deep dive research report on EV adoption' });
    expect(research.skills.map(s => s.id)).toContain('research-report');

    const tutor = resolveSkills({ intent: 'explanation', prompt: 'Explain quantum computing like I am 12' });
    expect(tutor.skills.map(s => s.id)).toContain('education-tutor');
  });

  it('returns instructions and a reason with each specialist skill', () => {
    const { skills } = resolveSkills({ intent: 'general', prompt: 'Write a business plan for my cafe' });
    const business = skills.find(s => s.id === 'business-planning');
    expect(business).toBeTruthy();
    expect(business.instructions.length).toBeGreaterThan(50);
    expect(business.reasonSelected).toMatch(/Specialist capability matched/);
  });

  it('activates multiple specialists when a request spans capabilities', () => {
    const { skills } = resolveSkills({
      intent: 'general',
      prompt: 'Translate my landing page into Spanish and make it SEO-friendly'
    });
    const ids = skills.map(s => s.id);
    expect(ids).toContain('translation-localization');
    expect(ids).toContain('marketing-copywriting');
  });

  it('does not hijack engineering workflows with false-positive triggers', () => {
    const app = resolveSkills({ intent: 'app', prompt: 'Build me a project management dashboard.' });
    const appIds = app.skills.map(s => s.id);
    expect(appIds).toContain('writing-plans');
    expect(appIds).not.toContain('live-data-utilities');

    const bug = resolveSkills({ intent: 'code-help', prompt: 'My React component crashes when I click save.' });
    expect(bug.skills.map(s => s.id)).toContain('systematic-debugging');

    const swarm = resolveSkills({ intent: 'swarm', prompt: 'Build authentication, billing, dashboard and admin panel.' });
    expect(swarm.skills.map(s => s.id)).toContain('subagent-driven-development');
  });

  it('keeps plain conversational questions on the direct path', () => {
    const { skills } = resolveSkills({ intent: 'explanation', prompt: 'What is React state?' });
    expect(skills.length).toBe(0);
  });

  it('ignores broad words that would cause false positives', () => {
    const json = resolveSkills({ intent: 'general', prompt: 'How do I convert JSON to YAML?' });
    expect(json.skills.map(s => s.id)).not.toContain('live-data-utilities');

    const brandNew = resolveSkills({ intent: 'general', prompt: 'My brand new phone battery drains fast' });
    expect(brandNew.skills.map(s => s.id)).not.toContain('marketing-copywriting');

    const learnMore = resolveSkills({ intent: 'general', prompt: 'I want to learn more about React' });
    expect(learnMore.skills.map(s => s.id)).not.toContain('education-tutor');
  });
});
