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
  { id: 'resume-career', prompt: 'Rewrite my resume for a data science role' },
  { id: 'creative-writing', prompt: 'Write me a short story about a lighthouse keeper' },
  { id: 'presentation-design', prompt: 'Outline a 10-slide pitch deck for my startup' },
  { id: 'personal-productivity', prompt: 'Plan my day: I have a report due and two meetings' },
  { id: 'personal-finance', prompt: 'Build a monthly budget for my family' },
  { id: 'travel-planning', prompt: 'Plan a 5-day Tokyo itinerary under 80000 yen' },
  { id: 'fitness-nutrition', prompt: 'Build me a home workout plan with no equipment' },
  { id: 'event-planning', prompt: 'Give me a wedding planning checklist with deadlines' },
  { id: 'study-aids', prompt: 'Make me a quiz on World War II with an answer key' },
  { id: 'meeting-notes', prompt: 'Summarize these meeting notes and extract action items' }
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

  it('keeps visual skill instructions provider-neutral', () => {
    const visual = defaultSkillRegistry.getSkill('visual-creative');
    expect(visual.description).not.toMatch(/FLUX|MiMo/i);
    expect(visual.instructions).not.toMatch(/FLUX|MiMo/i);
    expect(visual.instructions).toContain('configured image-generation pipeline');
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

    // No swarm intent exists: a multi-agent-flavoured engineering request is
    // treated as ordinary app work and resolves the standard heavy workflow.
    const multiAgent = resolveSkills({ intent: 'app', prompt: 'Build authentication, billing, dashboard and admin panel.' });
    expect(multiAgent.skills.map(s => s.id)).toContain('writing-plans');
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

    const minutesLater = resolveSkills({ intent: 'general', prompt: 'Remind me in 30 minutes about the meeting' });
    expect(minutesLater.skills.map(s => s.id)).not.toContain('meeting-notes');

    const politicalParty = resolveSkills({ intent: 'general', prompt: 'Tell me about the political party history in my country' });
    expect(politicalParty.skills.map(s => s.id)).not.toContain('event-planning');
  });

  it('keeps new specialists out of engineering workflows', () => {
    const quizApp = resolveSkills({ intent: 'app', prompt: 'Build me a quiz app with a scoreboard' });
    expect(quizApp.skills.map(s => s.id)).not.toContain('study-aids');

    const scriptCode = resolveSkills({ intent: 'code-help', prompt: 'My shell script fails on line 12 with an error' });
    expect(scriptCode.skills.map(s => s.id)).not.toContain('creative-writing');
  });
});
