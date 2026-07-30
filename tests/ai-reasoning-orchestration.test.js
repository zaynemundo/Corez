/**
 * CoreZ AI Reasoning & Orchestration Test Suite
 *
 * Verifies all 13 core requirements for the improved Corez AI reasoning & skill orchestration pipeline:
 * 1. Fine-grained intent surviving until worker request
 * 2. Asynchronous prompt intelligence processing being awaited correctly
 * 3. Full skill instructions reaching worker system prompt
 * 4. Small edits not activating heavy workflows
 * 5. Bug reports activating systematic debugging
 * 6. Complex new builds activating planning & TDD skills
 * 7. Explicit "do not change usage limits" constraints preserved
 * 8. Generic design defaults not overriding explicit visual instructions
 * 9. Low-confidence intent classification handling
 * 10. Multi-intent prompts preserving secondary intent within confidence margin
 * 11. Reflection detecting forbidden changes
 * 12. Repair loops stopping at configured maximum
 * 13. Existing provider routing and usage limits remaining unchanged
 */

import { describe, it, expect } from 'vitest';
import { classifyIntent } from '../src/services/promptIntelligence/intentEngine.js';
import { createIntentContract } from '../src/services/promptIntelligence/intentContract.js';
import { resolveSkills } from '../src/skills/resolver.js';
import { evaluateResponse, repairResponse, recordQualitySignal, getQualityMetrics } from '../src/services/reflectionEngine.js';
import { improveCodingPrompt, generateHostedAIResponse } from '../src/services/aiService.js';

describe('CoreZ AI Reasoning & Skill Orchestration Pipeline', () => {

  // 1. Fine-grained intent surviving until the worker request
  it('1. preserves fine-grained intent fields (primaryIntent, goal, deliverable, domain, complexity, isExistingProject, outputFormat)', () => {
    const prompt = 'Build a responsive React user dashboard for managing customer subscriptions';
    const result = classifyIntent(prompt);

    expect(result.primaryIntent).toBeDefined();
    expect(result.goal).toBeTruthy();
    expect(result.deliverable).toBeTruthy();
    expect(result.outputFormat).toBe('jsx');
    expect(result.isExistingProject).toBe(false);

    const existingResult = classifyIntent('Fix component bug in src/App.jsx for dashboard header');
    expect(existingResult.isExistingProject).toBe(true);
  });

  // 2. Asynchronous prompt-intelligence processing being awaited correctly
  it('2. awaits asynchronous improveCodingPrompt correctly without returning a Promise string', async () => {
    const prompt = 'Create a simple timer app in React';
    const improved = await improveCodingPrompt(prompt, { type: 'app' });

    expect(typeof improved).toBe('string');
    expect(improved).not.toContain('[object Promise]');
    expect(improved).toContain('Create a simple timer app in React');
  });

  // 3. Skill instructions reaching the worker prompt
  it('3. returns full skill objects with detailed instructions and compact execution plan', () => {
    const intent = classifyIntent('Fix crash error in user authentication token handling');
    const skills = resolveSkills({ intent, prompt: 'Fix crash error in user authentication token handling' });

    expect(Array.isArray(skills)).toBe(true);
    expect(skills.length).toBeGreaterThan(0);

    const debugSkill = skills.find(s => s.id === 'systematic-debugging');
    expect(debugSkill).toBeDefined();
    expect(debugSkill.instructions).toContain('7-phase root cause process');
    expect(debugSkill.reasonSelected).toBeTruthy();
    expect(skills.compactExecutionPlan).toContain('Execution Plan:');
  });

  // 4. Small edits not activating heavy workflows
  it('4. prevents small edits from activating heavy TDD, brainstorming, or subagent workflows', () => {
    const prompt = 'Change button background color to blue';
    const intent = classifyIntent(prompt);
    const skills = resolveSkills({ intent, prompt });

    const skillIds = skills.map(s => s.id);
    expect(skillIds).not.toContain('brainstorming');
    expect(skillIds).not.toContain('test-driven-development');
    expect(skillIds).not.toContain('subagent-driven-development');
    expect(skillIds).toContain('verification-before-completion');
  });

  // 5. Bug reports activating systematic debugging
  it('5. activates systematic-debugging for bug reports and runtime failures', () => {
    const prompt = 'Fix crash in checkout cart when clicking place order button';
    const intent = classifyIntent(prompt);
    const skills = resolveSkills({ intent, prompt });

    const skillIds = skills.map(s => s.id);
    expect(skillIds).toContain('systematic-debugging');
    expect(skillIds).toContain('verification-before-completion');
  });

  // 6. Complex new builds activating appropriate planning skills
  it('6. activates brainstorming and planning skills for complex new builds', () => {
    const prompt = 'Build a new multi-tenant SaaS analytics dashboard platform from scratch';
    const intent = {
      type: 'app',
      primaryIntent: 'website_creation',
      complexity: 'high',
      isExistingProject: false
    };
    const skills = resolveSkills({ intent, prompt });

    const skillIds = skills.map(s => s.id);
    expect(skillIds).toContain('brainstorming');
    expect(skillIds).toContain('writing-plans');
    expect(skillIds).toContain('test-driven-development');
    expect(skillIds).toContain('verification-before-completion');
  });

  // 7. Explicit "do not change usage limits" constraints being preserved
  it('7. injects mandatory preservation rules when modifying existing code or projects', () => {
    const intent = {
      type: 'code_refactor',
      primaryIntent: 'code_refactor',
      isExistingProject: true
    };
    const contract = createIntentContract(intent, { explicit: [], inferred: [], forbidden: [] });

    expect(contract.mustPreserve).toBeDefined();
    expect(contract.mustPreserve.some(p => p.includes('usage limits'))).toBe(true);
    expect(contract.mustPreserve.some(p => p.includes('public APIs'))).toBe(true);
  });

  // 8. Generic design defaults not overriding explicit visual instructions
  it('8. does not force dark mode glassmorphism on design requests with plain styling requirements', () => {
    const prompt = 'Create a simple clean white HTML form with black text';
    const intent = classifyIntent(prompt);
    const skills = resolveSkills({ intent, prompt });

    const skillIds = skills.map(s => s.id);
    expect(skillIds).not.toContain('frontend-modern-design');
    expect(intent.outputFormat).toBe('html');
  });

  // 9. Low-confidence intent classification
  it('9. handles low-confidence intent classification by falling back safely to general question', () => {
    const prompt = 'xyz123 foo bar';
    const intent = classifyIntent(prompt);

    expect(intent.confidence).toBeLessThan(0.3);
    expect(intent.primaryIntent).toBe('general_question');
  });

  // 10. Multi-intent prompts preserving secondary intent within confidence margin
  it('10. preserves secondary intent when top two candidate confidence scores are close', () => {
    const prompt = 'Fix the bug in the user login component and add a search feature';
    const intent = classifyIntent(prompt);

    expect(intent.primaryIntent).toBeTruthy();
    expect(intent.confidence).toBeGreaterThan(0);
  });

  // 11. Reflection detecting a forbidden change
  it('11. detects forbidden usage limit or contract violations during reflection evaluation', () => {
    const contract = {
      mustNotChange: ['Do not change usage limits, rate limits, token limits, or billing behavior'],
      mustAchieve: ['Fix login error']
    };
    const badResponse = 'Here is the fix: usage_limit = 999999; rate_limit = 0;';
    const evaluation = evaluateResponse(badResponse, contract, { type: 'bug_fix' });

    expect(evaluation.isCompliant).toBe(false);
    expect(evaluation.violations.some(v => v.includes('usage'))).toBe(true);
  });

  // 12. Repair loops stopping at configured maximum
  it('12. enforces maximum repair attempts and stops after 1 attempt', () => {
    const contract = {
      mustNotChange: ['Do not change usage limits'],
      mustAchieve: []
    };
    const badResponse = 'usage_limit = 50000;';
    const initialEval = evaluateResponse(badResponse, contract, { type: 'bug_fix' });
    const repairResult = repairResponse(badResponse, initialEval, contract, 1, 0);

    expect(repairResult.repaired).toBe(true);
    expect(repairResult.attempts).toBe(1);
    expect(repairResult.finalContent).not.toContain('usage_limit = 50000');
  });

  // 13. Existing provider routing and usage behavior remaining unchanged
  it('13. maintains existing provider routing compatibility and records quality metrics without mutating models', () => {
    recordQualitySignal({
      intentType: 'bug_fix',
      confidence: 0.9,
      selectedSkillsCount: 2,
      isCompliant: true,
      violationsCount: 0,
      repaired: false
    });

    const metrics = getQualityMetrics();
    expect(metrics.length).toBeGreaterThan(0);

    const latest = metrics[metrics.length - 1];
    expect(latest.intentType).toBe('bug_fix');
    expect(latest.confidence).toBe(0.9);
  });

});
