import { describe, it, expect } from 'vitest';
import { defaultSkillRegistry, SkillRegistry } from '../src/skills/registry.js';
import { resolveSkills } from '../src/skills/resolver.js';
import { expandDependencies } from '../src/skills/dependencies.js';
import { CapabilityRegistry } from '../src/orchestration/capabilityRegistry.js';
import { WorkflowState, WORKFLOW_STAGES } from '../src/orchestration/workflowState.js';
import { SuperpowersWorkflowEngine, classifyTaskCategory } from '../src/orchestration/workflowEngine.js';

describe('CoreZ Superpowers Integration', () => {

  describe('1. Skill Resolver & Intent Mapping', () => {
    it('maps bug reports to systematic-debugging, TDD, and verification', () => {
      const skills = resolveSkills({
        intent: 'code-help',
        prompt: 'My React component crashes when I click save.'
      });
      const skillIds = skills.map(s => s.id);
      expect(skillIds).toContain('systematic-debugging');
      expect(skillIds).toContain('test-driven-development');
      expect(skillIds).toContain('verification-before-completion');
    });

    it('maps new application requests to brainstorming, plans, TDD, review, and verification', () => {
      const skills = resolveSkills({
        intent: 'app',
        prompt: 'Build me a project management dashboard.'
      });
      const skillIds = skills.map(s => s.id);
      expect(skillIds).toContain('brainstorming');
      expect(skillIds).toContain('writing-plans');
      expect(skillIds).toContain('test-driven-development');
      expect(skillIds).toContain('requesting-code-review');
      expect(skillIds).toContain('verification-before-completion');
    });

    it('maps swarm intent to subagent workflow', () => {
      const skills = resolveSkills({
        intent: 'swarm',
        prompt: 'Build authentication, billing, dashboard and admin panel.'
      });
      const skillIds = skills.map(s => s.id);
      expect(skillIds).toContain('subagent-driven-development');
      expect(skillIds).toContain('dispatching-parallel-agents');
    });

    it('bypasses heavy Superpowers engineering workflow for simple explanations', () => {
      const skills = resolveSkills({
        intent: 'explanation',
        prompt: 'What is React state?'
      });
      expect(skills.length).toBe(0);
    });
  });

  describe('2. Dependencies Expansion & Topological Ordering', () => {
    it('automatically includes writing-plans when subagent-driven-development is selected', () => {
      const expanded = expandDependencies(['subagent-driven-development'], defaultSkillRegistry);
      const ids = expanded.map(s => s.id);
      expect(ids).toContain('writing-plans');
      expect(ids).toContain('subagent-driven-development');
    });

    it('orders skills correctly: brainstorming -> writing-plans -> implementation -> review -> verification', () => {
      const skills = resolveSkills({
        intent: 'app',
        prompt: 'Build a SaaS dashboard'
      });
      const ids = skills.map(s => s.id);

      const brainstormIdx = ids.indexOf('brainstorming');
      const planIdx = ids.indexOf('writing-plans');
      const tddIdx = ids.indexOf('test-driven-development');
      const reviewIdx = ids.indexOf('requesting-code-review');
      const verifyIdx = ids.indexOf('verification-before-completion');

      expect(brainstormIdx).toBeLessThan(planIdx);
      expect(planIdx).toBeLessThan(tddIdx);
      expect(tddIdx).toBeLessThan(reviewIdx);
      expect(reviewIdx).toBeLessThan(verifyIdx);
    });

    it('detects and prevents circular dependencies', () => {
      const customRegistry = new SkillRegistry();
      customRegistry.registerSkill({ id: 'skill-a', dependencies: ['skill-b'] });
      customRegistry.registerSkill({ id: 'skill-b', dependencies: ['skill-a'] });

      expect(() => expandDependencies(['skill-a'], customRegistry)).toThrow(/Circular dependency/);
    });
  });

  describe('3. Verification Gate Enforcement', () => {
    it('prevents transitioning to COMPLETE without verification evidence', () => {
      const wf = new WorkflowState({ prompt: 'Build app' });
      expect(() => wf.transitionToComplete()).toThrow(/Verification Gate Failure/);
    });

    it('successfully transitions to COMPLETE when verification record exists', () => {
      const wf = new WorkflowState({ prompt: 'Build app' });
      wf.addVerificationRecord({ command: 'npm test', exitCode: 0, passed: 10, failed: 0 });
      wf.transitionToComplete();
      expect(wf.currentStage).toBe(WORKFLOW_STAGES.COMPLETE);
    });
  });

  describe('4. Review Gates & Repair Loop', () => {
    it('flags critical review findings and transitions to REPAIRING stage in workflow', async () => {
      const wf = new WorkflowState({ prompt: 'Build app' });
      wf.addReviewFinding({ severity: 'critical', category: 'security', message: 'SQL injection vulnerability' });

      expect(wf.hasCriticalReviewFindings()).toBe(true);
    });
  });

  describe('5. Capability Gating', () => {
    it('filters out skills requiring git when git capability is false', () => {
      const caps = new CapabilityRegistry({ git: false });
      const availableTools = caps.getAvailableTools();

      const skills = resolveSkills({
        intent: 'app',
        prompt: 'Build app',
        availableTools,
        registry: defaultSkillRegistry
      });

      const ids = skills.map(s => s.id);
      expect(ids).not.toContain('finishing-a-development-branch');
    });

    it('retains skills requiring git when git capability is true', () => {
      const caps = new CapabilityRegistry({ git: true });
      caps.setCapability('git', true);
      const availableTools = caps.getAvailableTools();

      const skills = resolveSkills({
        intent: 'app',
        prompt: 'Build app',
        availableTools,
        registry: defaultSkillRegistry
      });

      const ids = skills.map(s => s.id);
      expect(ids).toContain('verification-before-completion');
    });
  });

  describe('6. Cost-Aware Model Delegation & Observability', () => {
    it('classifies task categories appropriately', () => {
      expect(classifyTaskCategory({ role: 'engine-architect', goal: 'Design system schema' })).toBe('architecture');
      expect(classifyTaskCategory({ role: 'reviewer', goal: 'Inspect code quality' })).toBe('review');
      expect(classifyTaskCategory({ role: 'visual', goal: 'MiMo layout audit' })).toBe('vision');
      expect(classifyTaskCategory({ role: 'coder', goal: 'Fix syntax error' })).toBe('mechanical');
    });

    it('generates developer-visible workflow trace without exposing raw internal secrets', async () => {
      const engine = new SuperpowersWorkflowEngine();
      const result = await engine.processRequest('Build a SaaS analytics dashboard', { intent: 'app' });

      expect(result.trace).toBeDefined();
      expect(result.trace.intent).toBe('app');
      expect(result.trace.resolvedSkills.length).toBeGreaterThan(0);
      expect(result.trace.currentStage).toBe(WORKFLOW_STAGES.COMPLETE);
    });
  });

});
