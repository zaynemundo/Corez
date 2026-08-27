import { describe, it, expect, vi } from 'vitest';
import {
  ResourceLockManager,
  TaskDependencyGraph,
  SharedProjectState,
  AGENT_LIFECYCLE_STATES
} from '../src/services/gamePipeline/swarm/taskGraph.js';
import { AdaptiveConcurrencyQueue } from '../src/services/gamePipeline/swarm/adaptiveQueue.js';
import {
  GenericSwarmOrchestrator,
  SWARM_ROLES,
  SWARM_MODE
} from '../packages/agent-core/swarm/index.js';

describe('Challenger 1: ResourceLockManager Empirical Stress Suite', () => {
  it('Challenge 1.1: All-or-nothing atomic rollback with overlapping resources', () => {
    const lockManager = new ResourceLockManager();

    // Agent A acquires resA and resB
    const resA = lockManager.acquireLocks(['resA', 'resB'], 'agent-A');
    expect(resA.success).toBe(true);
    expect(resA.acquired).toHaveLength(2);

    // Agent B tries to acquire [resC, resB, resD]
    const resB = lockManager.acquireLocks(['resC', 'resB', 'resD'], 'agent-B');
    expect(resB.success).toBe(false);
    expect(resB.lockedResource).toBe('resB');
    expect(resB.currentOwner).toBe('agent-A');

    // Verify atomic rollback: neither resC nor resD should be locked by agent-B
    expect(lockManager.getLock('resC')).toBeNull();
    expect(lockManager.getLock('resD')).toBeNull();
    expect(lockManager.getLock('resB').ownerAgentId).toBe('agent-A');
    expect(lockManager.getLock('resB').locked).toBe(true);

    // Agent C should be able to acquire resC and resD without conflict
    const resC = lockManager.acquireLocks(['resC', 'resD'], 'agent-C');
    expect(resC.success).toBe(true);
  });

  it('Challenge 1.2: Idempotent re-acquisition and version monotonicity for same agent', () => {
    const lockManager = new ResourceLockManager();

    const lock1 = lockManager.acquireLock('shared-file.js', 'agent-1');
    expect(lock1.success).toBe(true);
    expect(lock1.lockInfo.version).toBe(1);

    // Same agent re-acquires the same lock
    const lock2 = lockManager.acquireLock('shared-file.js', 'agent-1');
    expect(lock2.success).toBe(true);
    expect(lock2.lockInfo.version).toBe(2);
    expect(lock2.lockInfo.ownerAgentId).toBe('agent-1');

    // Same agent acquires multi-lock containing the existing lock plus a new one
    const lockMulti = lockManager.acquireLocks(['shared-file.js', 'new-file.js'], 'agent-1');
    expect(lockMulti.success).toBe(true);
    expect(lockMulti.acquired).toHaveLength(2);
    expect(lockManager.getLock('shared-file.js').version).toBe(3);
    expect(lockManager.getLock('new-file.js').version).toBe(1);
  });

  it('Challenge 1.3: Boundary conditions - empty, duplicate, and null resources', () => {
    const lockManager = new ResourceLockManager();

    // Empty inputs
    expect(lockManager.acquireLocks([], 'agent-1').success).toBe(true);
    expect(lockManager.acquireLocks(undefined, 'agent-1').success).toBe(true);
    expect(lockManager.acquireLocks(null, 'agent-1').success).toBe(true);
    expect(lockManager.releaseLocks([], 'agent-1')).toBe(true);
    expect(lockManager.releaseLocks(null, 'agent-1')).toBe(true);
    expect(lockManager.canAcquireAll([], 'agent-1')).toBe(true);
    expect(lockManager.canAcquireAll(null, 'agent-1')).toBe(true);

    // Duplicate resource names in single request
    const dupRes = lockManager.acquireLocks(['dup.js', 'dup.js', 'dup.js'], 'agent-dup');
    expect(dupRes.success).toBe(true);
    expect(lockManager.getLock('dup.js').ownerAgentId).toBe('agent-dup');
    expect(lockManager.getLock('dup.js').locked).toBe(true);

    // Release should release cleanly
    expect(lockManager.releaseLock('dup.js', 'agent-dup')).toBe(true);
    expect(lockManager.getLock('dup.js').locked).toBe(false);
  });

  it('Challenge 1.4: Massive concurrent contention stress test (100 agents, 10 shared resources)', async () => {
    const lockManager = new ResourceLockManager();
    const resources = Array.from({ length: 10 }, (_, i) => `resource_${i}.ts`);
    const agentCount = 100;
    const completedAgents = [];

    // Track active locks per resource to verify strict mutual exclusion invariant
    const activeHolders = new Map(); // resourceName -> current agent holding it

    const runAgent = async (agentId) => {
      // Pick 2 random resources out of 10
      const shuffled = [...resources].sort(() => Math.random() - 0.5);
      const neededResources = shuffled.slice(0, 2);

      let attempts = 0;
      let acquired = false;

      while (!acquired && attempts < 100) {
        attempts++;
        const acq = lockManager.acquireLocks(neededResources, agentId);
        if (acq.success) {
          acquired = true;
          // Invariant check: ensure NO other agent holds any of these resources
          for (const res of neededResources) {
            if (activeHolders.has(res)) {
              throw new Error(`MUTUAL EXCLUSION VIOLATION: Resource ${res} held by ${activeHolders.get(res)} and ${agentId}`);
            }
            activeHolders.set(res, agentId);
          }

          // Simulate async work
          await new Promise(r => setTimeout(r, Math.floor(Math.random() * 4) + 1));

          // Invariant check before releasing
          for (const res of neededResources) {
            expect(activeHolders.get(res)).toBe(agentId);
            activeHolders.delete(res);
          }

          // Release all locks
          const releasedCount = lockManager.releaseAllLocksForAgent(agentId);
          expect(releasedCount).toBeGreaterThanOrEqual(1);
          completedAgents.push(agentId);
        } else {
          // Jittered backoff before retry
          await new Promise(r => setTimeout(r, Math.floor(Math.random() * 6) + 2));
        }
      }

      return acquired;
    };

    const results = await Promise.all(
      Array.from({ length: agentCount }, (_, i) => runAgent(`agent_${i}`))
    );

    // 100% of agents must complete without a single deadlock or race condition
    const successCount = results.filter(Boolean).length;
    expect(successCount).toBe(100);
    expect(activeHolders.size).toBe(0);

    // Verify all locks in lockManager are cleanly unlocked
    for (const res of resources) {
      const lk = lockManager.getLock(res);
      if (lk) {
        expect(lk.locked).toBe(false);
      }
    }
  });
});

describe('Challenger 1: AdaptiveConcurrencyQueue Empirical Stress Suite', () => {
  it('Challenge 2.1: Hard operator ceiling and minimum concurrency clamping', async () => {
    const queue = new AdaptiveConcurrencyQueue({
      initialConcurrency: 2,
      minConcurrency: 1,
      maxAllowedConcurrency: 4
    });

    expect(queue.ceiling()).toBe(4);
    expect(queue.currentConcurrency).toBe(2);

    // Simulate 20 fast successes
    for (let i = 0; i < 20; i++) {
      queue.recordSuccess(100);
    }

    // Should not exceed ceiling of 4
    expect(queue.currentConcurrency).toBe(4);

    // Trigger multiple rate limits
    queue.recordFailure(true, new Error('429 Rate Limit'));
    expect(queue.currentConcurrency).toBe(2); // 4 / 2 = 2

    queue.recordFailure(true, new Error('429 Rate Limit'));
    expect(queue.currentConcurrency).toBe(1); // 2 / 2 = 1

    queue.recordFailure(true, new Error('429 Rate Limit'));
    expect(queue.currentConcurrency).toBe(1); // minConcurrency clamp at 1
  });

  it('Challenge 2.2: General failure vs 429 Rate Limit differential handling', () => {
    const queue = new AdaptiveConcurrencyQueue({
      initialConcurrency: 6,
      minConcurrency: 1
    });

    // General failure decrements by 1 and does NOT trigger exponential backoff timer
    queue.recordFailure(false, new Error('Network timeout'));
    expect(queue.currentConcurrency).toBe(5);
    expect(queue.isBackoffActive).toBe(false);

    // HTTP 429 halves concurrency and triggers backoff
    queue.recordFailure(true, new Error('HTTP 429 Too Many Requests'));
    expect(queue.currentConcurrency).toBe(2); // floor(5 / 2) = 2
    expect(queue.isBackoffActive).toBe(true);
    expect(queue.rateLimitHits).toBe(1);
  });

  it('Challenge 2.3: High concurrency burst (200 tasks) with activeCount invariant', async () => {
    const queue = new AdaptiveConcurrencyQueue({
      initialConcurrency: 5,
      maxAllowedConcurrency: 10
    });

    let maxObservedActive = 0;
    let currentlyActive = 0;
    const taskCount = 200;

    const taskFn = (id) => async () => {
      currentlyActive++;
      if (currentlyActive > maxObservedActive) {
        maxObservedActive = currentlyActive;
      }

      // Assert active count invariant inside task execution
      expect(currentlyActive).toBeLessThanOrEqual(queue.ceiling() + 1);

      await new Promise(r => setTimeout(r, Math.floor(Math.random() * 6) + 2));
      currentlyActive--;
      return `result_${id}`;
    };

    const promises = Array.from({ length: taskCount }, (_, i) => queue.enqueue(taskFn(i)));
    const settled = await Promise.all(promises);

    expect(settled).toHaveLength(taskCount);
    expect(settled.every(s => s.status === 'fulfilled')).toBe(true);
    expect(currentlyActive).toBe(0);
    expect(maxObservedActive).toBeLessThanOrEqual(queue.ceiling());
    expect(queue.getMetrics().activeCount).toBe(0);
    expect(queue.getMetrics().queuedTasks).toBe(0);
  });

  it('Challenge 2.4: Adaptive backoff recovery under heavy rate-limit injection', async () => {
    const queue = new AdaptiveConcurrencyQueue({
      initialConcurrency: 4,
      minConcurrency: 1
    });

    let executionOrder = [];

    // Enqueue 6 tasks: Task 2 fails with 429
    const p1 = queue.enqueue(async () => {
      executionOrder.push('task1');
      return 'ok1';
    });

    const p2 = queue.enqueue(async () => {
      executionOrder.push('task2_fail429');
      const err = new Error('Rate limit 429');
      err.status = 429;
      throw err;
    });

    const p3 = queue.enqueue(async () => {
      executionOrder.push('task3');
      return 'ok3';
    });

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(r1.status).toBe('fulfilled');
    expect(r2.status).toBe('rejected');
    expect(r2.reason.status).toBe(429);
    expect(r3.status).toBe('fulfilled');
    expect(executionOrder).toContain('task1');
    expect(executionOrder).toContain('task2_fail429');
  });
});

describe('Challenger 1: Swarm DAG + ResourceLocking + Retry Integration Challenges', () => {
  it('Challenge 3.1: Verifier rejection releases locks so retrying agent can re-acquire without deadlock', async () => {
    const receivedPrompts = [];
    let engineerAttempts = 0;

    const mockRouter = {
      generate: vi.fn(async ({ messages }) => {
        const userMsg = messages.find(m => m.role === 'user')?.content || '';
        receivedPrompts.push(userMsg);
        return { content: `Code output` };
      })
    };

    // Verifier only rejects engineer on attempt 1 & 2, accepts all others
    const verifier = vi.fn(async ({ task }) => {
      if (task.role === SWARM_ROLES.ENGINEER) {
        engineerAttempts++;
        if (task.attempt < 3) {
          return { ok: false, evidence: `Syntax error on attempt ${task.attempt}` };
        }
      }
      return { ok: true, evidence: 'All checks passed' };
    });

    const orchestrator = new GenericSwarmOrchestrator({
      providerRouter: mockRouter,
      verifier
    });

    const result = await orchestrator.executeSwarmJob('Build full app with self-correction', {
      mode: SWARM_MODE.FAST
    });

    expect(result.completed).toBe(true);
    expect(engineerAttempts).toBe(3);
    expect(result.verification.filter(v => !v.ok).length).toBe(2);
    expect(result.verification.filter(v => v.ok).length).toBe(3);

    // Verify retry prompt contained diagnostic evidence
    const retryPrompt = receivedPrompts.find(p => p.includes('Self-Correction Retry (Attempt 2/3)'));
    expect(retryPrompt).toBeDefined();
    expect(retryPrompt).toContain('Syntax error on attempt 1');
  });

  it('Challenge 3.2: Max attempts exceeded terminates gracefully and records issues in projectState', async () => {
    const mockRouter = {
      generate: vi.fn(async () => ({ content: 'Broken code always' }))
    };

    const verifier = vi.fn(async () => ({ ok: false, evidence: 'Unrecoverable type error' }));

    const orchestrator = new GenericSwarmOrchestrator({
      providerRouter: mockRouter,
      verifier
    });

    const result = await orchestrator.executeSwarmJob('Doomed job', {
      mode: SWARM_MODE.FAST
    });

    expect(result.completed).toBe(false);
    expect(result.failedTasks.length).toBeGreaterThan(0);
    expect(result.failedTasks[0].reason).toContain('Unrecoverable type error');
  });

  it('Challenge 3.3: Diamond DAG parallel execution with shared lock serialization', async () => {
    const graph = new TaskDependencyGraph('proj_diamond');

    // A -> B (resource X), A -> C (resource X), B -> D, C -> D
    // B and C are ready at the same time, but both require resource X
    graph.addTask({ taskId: 'A', role: 'explorer', dependencies: [] });
    graph.addTask({ taskId: 'B', role: 'frontend', dependencies: ['A'], ownedResources: ['shared.json'] });
    graph.addTask({ taskId: 'C', role: 'backend', dependencies: ['A'], ownedResources: ['shared.json'] });
    graph.addTask({ taskId: 'D', role: 'reviewer', dependencies: ['B', 'C'] });

    // Complete A
    const tA = graph.tasks.get('A');
    graph.projectState.commitTaskOutput(tA.agentId, 'A', 'Output A');

    const ready = graph.getReadyTasks();
    expect(ready.map(t => t.taskId)).toEqual(expect.arrayContaining(['B', 'C']));

    // Agent B acquires shared.json
    const tB = graph.tasks.get('B');
    const lockB = graph.resourceManager.acquireLocks(tB.ownedResources, tB.agentId);
    expect(lockB.success).toBe(true);

    // Agent C cannot acquire shared.json while B holds it
    const tC = graph.tasks.get('C');
    expect(graph.resourceManager.canAcquireAll(tC.ownedResources, tC.agentId)).toBe(false);
    const lockC = graph.resourceManager.acquireLocks(tC.ownedResources, tC.agentId);
    expect(lockC.success).toBe(false);

    // B completes and releases locks
    graph.projectState.commitTaskOutput(tB.agentId, 'B', 'Output B', tB.ownedResources);
    graph.resourceManager.releaseAllLocksForAgent(tB.agentId);

    // Now C can acquire and complete
    expect(graph.resourceManager.canAcquireAll(tC.ownedResources, tC.agentId)).toBe(true);
    const lockC2 = graph.resourceManager.acquireLocks(tC.ownedResources, tC.agentId);
    expect(lockC2.success).toBe(true);
    graph.projectState.commitTaskOutput(tC.agentId, 'C', 'Output C', tC.ownedResources);
    graph.resourceManager.releaseAllLocksForAgent(tC.agentId);

    // Now D is ready
    const readyFinal = graph.getReadyTasks();
    expect(readyFinal.map(t => t.taskId)).toContain('D');
  });
});
