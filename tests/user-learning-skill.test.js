import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { defaultSkillRegistry } from '../src/skills/registry.js';
import { resolveSkills, SPECIALIST_SKILL_IDS } from '../src/skills/resolver.js';
import {
  assertSafeUserId,
  assertSafeText,
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
});
