import { describe, it, expect, vi } from 'vitest';
import {
  TaskDependencyGraph,
  ResourceLockManager,
  AGENT_LIFECYCLE_STATES
} from '../src/services/gamePipeline/swarm/taskGraph.js';
import {
  GenericSwarmOrchestrator,
  SWARM_ROLES,
  SWARM_MODE,
  getRoleDefinition,
  getRoleSystemPrompt,
  formatRoleUserPrompt
} from '../packages/agent-core/swarm/index.js';

describe('Dynamic Swarm DAG & Specialist Expansion', () => {
  describe('Role Catalog & Prompt Formatting', () => {
    it('returns valid system prompts and output schemas for all defined swarm roles', () => {
      const roles = Object.values(SWARM_ROLES);
      expect(roles.length).toBeGreaterThanOrEqual(14);

      for (const role of roles) {
        const def = getRoleDefinition(role);
        expect(def.title).toBeDefined();
        expect(def.systemPrompt).toContain('CoreZ');
        expect(def.outputSchema).toBeDefined();
        expect(getRoleSystemPrompt(role)).toBe(def.systemPrompt);
      }
    });

    it('formats user prompt with upstream contexts and self-correction retry feedback', () => {
      const prompt = formatRoleUserPrompt({
        role: SWARM_ROLES.FRONTEND,
        objective: 'Build React UI components',
        userPrompt: 'Create a modern dashboard app',
        upstreamContexts: [
          {
            taskId: 'task-architect',
            role: SWARM_ROLES.ARCHITECT,
            output: { components: ['Header', 'Sidebar', 'Chart'] }
          }
        ],
        retryContext: {
          attempt: 2,
          maxAttempts: 3,
          lastError: 'Syntax error on line 42',
          verificationEvidence: 'ESLint failed: missing prop types'
        }
      });

      expect(prompt).toContain('Assignment for frontend');
      expect(prompt).toContain('Objective: Build React UI components');
      expect(prompt).toContain('Overall User Goal: Create a modern dashboard app');
      expect(prompt).toContain('Context from [task-architect] (architect)');
      expect(prompt).toContain('Header');
      expect(prompt).toContain('Self-Correction Retry (Attempt 2/3)');
      expect(prompt).toContain('Syntax error on line 42');
      expect(prompt).toContain('ESLint failed: missing prop types');
    });
  });

  describe('Resource Lock Manager (All-or-Nothing & Contention)', () => {
    it('acquires multiple locks atomically and rolls back on contention', () => {
      const lockManager = new ResourceLockManager();

      // Agent 1 locks a file
      const res1 = lockManager.acquireLock('src/components/Nav.jsx', 'agent-1');
      expect(res1.success).toBe(true);

      // Agent 2 attempts all-or-nothing multi-resource acquisition containing the locked file
      const res2 = lockManager.acquireLocks(
        ['src/styles/app.css', 'src/components/Nav.jsx', 'src/utils.js'],
        'agent-2'
      );
      expect(res2.success).toBe(false);
      expect(res2.lockedResource).toBe('src/components/Nav.jsx');
      expect(res2.currentOwner).toBe('agent-1');

      // Verify that neither app.css nor utils.js remained locked by agent-2 after rollback
      expect(lockManager.getLock('src/styles/app.css')).toBeNull();
      expect(lockManager.getLock('src/utils.js')).toBeNull();

      // Agent 1 releases its lock
      expect(lockManager.releaseAllLocksForAgent('agent-1')).toBe(1);

      // Now Agent 2 can acquire all requested resources
      const res3 = lockManager.acquireLocks(
        ['src/styles/app.css', 'src/components/Nav.jsx', 'src/utils.js'],
        'agent-2'
      );
      expect(res3.success).toBe(true);
      expect(res3.acquired).toHaveLength(3);
    });
  });

  describe('Dynamic Task Graph & Subtask Rewiring', () => {
    it('rewires downstream dependencies when a task decomposes into subtasks', () => {
      const graph = new TaskDependencyGraph('proj_dynamic');

      graph.addTask({ taskId: 'task-plan', role: SWARM_ROLES.ARCHITECT, objective: 'Plan architecture' });
      graph.addTask({
        taskId: 'task-impl',
        role: SWARM_ROLES.ENGINEER,
        objective: 'Implement modules',
        dependencies: ['task-plan']
      });
      graph.addTask({
        taskId: 'task-test',
        role: SWARM_ROLES.TESTER,
        objective: 'Test all code',
        dependencies: ['task-impl']
      });

      // Decompose task-impl into frontend & backend subtasks
      const newTasks = graph.handleDecomposition('task-impl', {
        suggestedTasks: [
          { taskId: 'task-fe', role: SWARM_ROLES.FRONTEND, objective: 'Build FE' },
          { taskId: 'task-be', role: SWARM_ROLES.BACKEND, objective: 'Build BE' }
        ]
      }, { rewireDownstream: true });

      expect(newTasks).toHaveLength(2);
      expect(graph.tasks.get('task-impl').status).toBe(AGENT_LIFECYCLE_STATES.DECOMPOSED);

      // Verify task-test dependencies were automatically re-wired from task-impl to [task-fe, task-be]
      const testTask = graph.tasks.get('task-test');
      expect(testTask.dependencies).not.toContain('task-impl');
      expect(testTask.dependencies).toContain('task-fe');
      expect(testTask.dependencies).toContain('task-be');
    });

    it('injects dynamic specialist tasks into the DAG before downstream nodes', () => {
      const graph = new TaskDependencyGraph('proj_inject');

      graph.addTask({ taskId: 'task-explore', role: SWARM_ROLES.EXPLORER, objective: 'Explore' });
      graph.addTask({
        taskId: 'task-review',
        role: SWARM_ROLES.REVIEWER,
        objective: 'Review',
        dependencies: ['task-explore']
      });

      // Inject dynamic specialists between explore and review
      const injected = graph.injectDynamicTasks(
        [
          { taskId: 'task-sec', role: SWARM_ROLES.SECURITY, objective: 'Audit security' },
          { taskId: 'task-a11y', role: SWARM_ROLES.ACCESSIBILITY, objective: 'Audit a11y' }
        ],
        { afterTaskId: 'task-explore', beforeTaskIds: ['task-review'] }
      );

      expect(injected).toHaveLength(2);
      expect(graph.tasks.get('task-sec').dependencies).toContain('task-explore');
      expect(graph.tasks.get('task-a11y').dependencies).toContain('task-explore');

      const reviewTask = graph.tasks.get('task-review');
      expect(reviewTask.dependencies).toContain('task-sec');
      expect(reviewTask.dependencies).toContain('task-a11y');
    });

    it('computes topological DAG order accurately', () => {
      const graph = new TaskDependencyGraph('proj_topo');

      graph.addTask({ taskId: 't3', role: 'tester', dependencies: ['t2'] });
      graph.addTask({ taskId: 't1', role: 'explorer', dependencies: [] });
      graph.addTask({ taskId: 't2', role: 'engineer', dependencies: ['t1'] });

      const topoOrder = graph.getTopologicalOrder().map(t => t.taskId);
      expect(topoOrder.indexOf('t1')).toBeLessThan(topoOrder.indexOf('t2'));
      expect(topoOrder.indexOf('t2')).toBeLessThan(topoOrder.indexOf('t3'));
    });
  });

  describe('GenericSwarmOrchestrator End-to-End Dynamic Execution', () => {
    it('propagates upstream contexts cleanly and produces structured artifact map', async () => {
      const receivedPrompts = [];
      const mockRouter = {
        generate: vi.fn(async ({ messages }) => {
          const userMsg = messages.find(m => m.role === 'user')?.content || '';
          receivedPrompts.push(userMsg);
          return { content: `Generated output for: ${userMsg.slice(0, 30)}` };
        })
      };

      const orchestrator = new GenericSwarmOrchestrator({ providerRouter: mockRouter });

      const events = [];
      const result = await orchestrator.executeSwarmJob('Build full stack web app', {
        mode: SWARM_MODE.SWARM,
        onStatus: st => events.push(st)
      });

      expect(result.completed).toBe(true);
      expect(result.artifactMap).toBeDefined();
      expect(result.topologicalOutputs.length).toBe(6);

      // Verify that downstream tasks (e.g. tester, reviewer) received upstream context
      const testerPrompt = receivedPrompts.find(p => p.includes('Assignment for tester'));
      expect(testerPrompt).toBeDefined();
      expect(testerPrompt).toContain('Upstream Context & Deliverables');
      expect(testerPrompt).toContain('task-frontend');
      expect(testerPrompt).toContain('task-backend');
    });

    it('performs self-correction retry loop when verifier rejects initial output', async () => {
      let testerAttempts = 0;
      const mockRouter = {
        generate: vi.fn(async ({ messages }) => {
          const systemMsg = messages.find(m => m.role === 'system')?.content || '';
          if (systemMsg.includes('QA & Test Engineer')) {
            testerAttempts++;
          }
          return { content: `Attempt ${testerAttempts} code` };
        })
      };

      const verifier = vi.fn(async ({ task }) => {
        if (task.role === SWARM_ROLES.TESTER && task.attempt === 1) {
          return { ok: false, evidence: 'Assertion failed: expected 200 got 500' };
        }
        return { ok: true, evidence: 'All tests passed' };
      });

      const orchestrator = new GenericSwarmOrchestrator({
        providerRouter: mockRouter,
        verifier
      });

      const events = [];
      const result = await orchestrator.executeSwarmJob('Build resilient API with tests', {
        mode: SWARM_MODE.SWARM,
        onStatus: st => events.push(st)
      });

      expect(result.completed).toBe(true);
      expect(testerAttempts).toBe(2);

      const retryEvent = events.find(e => e.step === 'agent_retrying' && e.role === SWARM_ROLES.TESTER);
      expect(retryEvent).toBeDefined();
      expect(retryEvent.attempt).toBe(2);
      expect(retryEvent.reason).toContain('Assertion failed');
    });

    it('handles dynamic runtime decomposition emitted by an agent', async () => {
      const mockRouter = {
        generate: vi.fn(async ({ messages }) => {
          const systemMsg = messages.find(m => m.role === 'system')?.content || '';
          if (systemMsg.includes('System Architect')) {
            return {
              content: JSON.stringify({
                status: 'requires_decomposition',
                suggestedTasks: [
                  { taskId: 'task-sub-1', role: SWARM_ROLES.FRONTEND, objective: 'Sub UI' },
                  { taskId: 'task-sub-2', role: SWARM_ROLES.BACKEND, objective: 'Sub API' }
                ]
              })
            };
          }
          return { content: 'OK' };
        })
      };

      const orchestrator = new GenericSwarmOrchestrator({
        providerRouter: {
          generate: async (args) => {
            const res = await mockRouter.generate(args);
            try {
              return { content: JSON.parse(res.content) };
            } catch {
              return { content: res.content };
            }
          }
        }
      });

      const events = [];
      const result = await orchestrator.executeSwarmJob('Decompose this project', {
        mode: SWARM_MODE.SWARM,
        onStatus: st => events.push(st)
      });

      expect(result.completed).toBe(true);
      const decompEvent = events.find(e => e.step === 'agent_decomposed');
      expect(decompEvent).toBeDefined();
      expect(decompEvent.newTasksCount).toBe(2);
    });
  });
});
