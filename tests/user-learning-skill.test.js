import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { defaultSkillRegistry } from '../src/skills/registry.js';
import { resolveSkills, SPECIALIST_SKILL_IDS } from '../src/skills/resolver.js';
import {
  assertSafeUserId,
  assertSafeText,
  detectUserFactCandidates,
} from '../src/services/userLearningService.js';

describe('User Learning skill', () => {
  it('ships a SKILL.md with privacy guardrails', () => {
    const p = path.resolve(process.cwd(), '.agents', 'skills', 'user-learning', 'SKILL.md');
    expect(fs.existsSync(p)).toBe(true);
    const raw = fs.readFileSync(p, 'utf8');
    expect(raw).toMatch(/name:\s*user-learning/);
    expect(raw).toMatch(/default_user/);
    expect(raw).toMatch(/never store|Never learn/i);
  });

  it('registers user-learning in the skill registry', () => {
    expect(SPECIALIST_SKILL_IDS).toContain('user-learning');
    const skill = defaultSkillRegistry.getSkill('user-learning');
    expect(skill).toBeTruthy();
    expect(skill.instructions.length).toBeGreaterThan(50);
  });

  it.each([
    'Remember I prefer dark mode and concise answers',
    'Learn about me: I use React + Vite',
    'What do you know about me?',
    'Forget my theme preference',
    'My name is Ada',
  ])('activates user-learning for "%s"', (prompt) => {
    const { skills } = resolveSkills({ intent: 'general', prompt });
    expect(skills.map((s) => s.id)).toContain('user-learning');
  });

  it('does not false-positive on nearby phrases', () => {
    expect(
      resolveSkills({ intent: 'general', prompt: 'I want to learn more about React' }).skills.map((s) => s.id),
    ).not.toContain('user-learning');
    expect(
      resolveSkills({ intent: 'general', prompt: 'My brand new phone battery drains fast' }).skills.map((s) => s.id),
    ).not.toContain('user-learning');
    expect(
      resolveSkills({ intent: 'general', prompt: 'Remind me in 30 minutes about the meeting' }).skills.map((s) => s.id),
    ).not.toContain('user-learning');
  });

  it.each([
    'I am a marketer in the UAE',
    'I work with Fantoni on workplace projects',
    'I work at Office Inspirations',
    'My company represents Fantoni across the UAE and Saudi Arabia',
    'We provide full-service workplace design and installation',
    'Based in Dubai',
    'I live in Abu Dhabi',
  ])('proactively activates user-learning for volunteered identity "%s"', (prompt) => {
    const { skills } = resolveSkills({ intent: 'general', prompt });
    expect(skills.map((s) => s.id)).toContain('user-learning');
  });

  it('does not proactively fire on questions, code, or report phrasing', () => {
    expect(
      resolveSkills({ intent: 'general', prompt: 'I am a good fit for this role?' }).skills.map((s) => s.id),
    ).not.toContain('user-learning');
    expect(
      resolveSkills({ intent: 'general', prompt: 'Based on the report, summarize Q3 revenue' }).skills.map((s) => s.id),
    ).not.toContain('user-learning');
    expect(
      resolveSkills({ intent: 'general', prompt: '```js\nconst x = "i am a string";\n```\nFix this' }).skills.map((s) => s.id),
    ).not.toContain('user-learning');
  });

  it('keeps user-learning out of engineering workflows', () => {
    const app = resolveSkills({ intent: 'app', prompt: 'Build me a quiz app with a scoreboard' });
    expect(app.skills.map((s) => s.id)).not.toContain('user-learning');
  });

  it('rejects unsafe userIds and secret-like text', () => {
    expect(() => assertSafeUserId('default_user')).toThrow();
    expect(() => assertSafeUserId('short')).toThrow();
    expect(() => assertSafeText('my api-key is abc123')).toThrow();
    expect(assertSafeUserId('user_9f8a7b6c5d').length).toBeGreaterThan(8);
  });

  describe('detectUserFactCandidates', () => {
    it('extracts volunteered identity facts with stable keys', () => {
      expect(detectUserFactCandidates('My name is Ada')).toEqual([
        { key: 'identity.name', category: 'identity', text: "User's name is Ada" },
      ]);
      expect(detectUserFactCandidates('I am a marketer in the UAE')).toEqual([
        { key: 'identity.role', category: 'identity', text: 'User is a marketer in the UAE' },
      ]);
      expect(detectUserFactCandidates('I work with Fantoni')).toEqual([
        { key: 'work.employer', category: 'work', text: 'User works with Fantoni' },
      ]);
      expect(detectUserFactCandidates('Based in Dubai')).toEqual([
        { key: 'identity.location', category: 'identity', text: 'User is based in Dubai' },
      ]);
    });

    it('returns empty for questions, code fences, and non-identity text', () => {
      expect(detectUserFactCandidates('')).toEqual([]);
      expect(detectUserFactCandidates(null)).toEqual([]);
      expect(detectUserFactCandidates('I am a good fit for this role?')).toEqual([]);
      expect(detectUserFactCandidates('```js\nconst x = "i am a string";\n```')).toEqual([]);
      expect(detectUserFactCandidates('My brand new phone battery drains fast')).toEqual([]);
      expect(detectUserFactCandidates('I want to learn more about React')).toEqual([]);
    });

    it('never surfaces secrets as candidates', () => {
      expect(detectUserFactCandidates('I am a tester and my password is hunter2')).toEqual([]);
    });

    it('caps candidates and dedupes by key', () => {
      const prompt =
        'My name is Ada. I am a marketer in the UAE. I work with Fantoni. Based in Dubai. I prefer concise answers.';
      const candidates = detectUserFactCandidates(prompt);
      expect(candidates.length).toBeLessThanOrEqual(3);
      expect(new Set(candidates.map((c) => c.key)).size).toBe(candidates.length);
    });
  });
});
