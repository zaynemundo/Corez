export {
  TaskDependencyGraph,
  ResourceLockManager,
  SharedProjectState,
  AGENT_LIFECYCLE_STATES
} from '../../../src/services/gamePipeline/swarm/taskGraph.js';

export { AdaptiveConcurrencyQueue } from '../../../src/services/gamePipeline/swarm/adaptiveQueue.js';

export { HierarchicalSynthesis, chunkByTokens, DEFAULT_CHUNK_MAX_TOKENS } from './hierarchicalSynthesis.js';

import { TaskDependencyGraph, AGENT_LIFECYCLE_STATES } from '../../../src/services/gamePipeline/swarm/taskGraph.js';
import { AdaptiveConcurrencyQueue } from '../../../src/services/gamePipeline/swarm/adaptiveQueue.js';
import { estimateTokens } from '../persistence/ContextStore.js';

export const SWARM_ROLES = Object.freeze({
  ORCHESTRATOR: 'orchestrator',
  EXPLORER: 'explorer',
  ARCHITECT: 'architect',
  ENGINEER: 'engineer',
  FRONTEND: 'frontend',
  BACKEND: 'backend',
  DEBUGGER: 'debugger',
  TESTER: 'tester',
  REVIEWER: 'reviewer',
  SECURITY: 'security',
  INTEGRATION: 'integration',
  ART_DIRECTOR: 'art-director'
});

export const SWARM_MODE = Object.freeze({
  AUTO: 'auto',
  FAST: 'fast',
  SWARM: 'swarm'
});

// Briefs mentioning any of these scopes go to the full specialist DAG.
// Small, surgical edits (a typo fix, a single component change) take the fast path.
const FULL_SWARM_SIGNALS =
  /\b(website|web app|app|game|api|apis?|backend|database|db\b|auth|authentication|server|endpoint|migration|refactor|microservice|multi-page|deploy|docker|kubernetes|realtime|websocket|design system)\b/i;

// Long briefs are assumed complex even without explicit scope signals.
const FULL_SWARM_MIN_TOKENS = 100;

/**
 * Routes a task to the fast or full swarm DAG.
 * `force` (SWARM_MODE.FAST | SWARM_MODE.SWARM) overrides the heuristic.
 * Exported for callers and tests.
 */
export function decideSwarmMode(prompt, { force } = {}) {
  if (force === SWARM_MODE.FAST || force === SWARM_MODE.SWARM) return force;
  const text = String(prompt ?? '');
  if (estimateTokens(text) >= FULL_SWARM_MIN_TOKENS) return SWARM_MODE.SWARM;
  return FULL_SWARM_SIGNALS.test(text) ? SWARM_MODE.SWARM : SWARM_MODE.FAST;
}

/**
 * Default execution DAG for a given mode.
 * Fast: explorer -> engineer -> reviewer (3 agents).
 * Full: explorer -> architect -> frontend/backend (parallel) -> tester -> reviewer (6 agents).
 */
export function buildDefaultTasks(mode = SWARM_MODE.AUTO) {
  const actualMode = decideSwarmMode('', { force: mode === SWARM_MODE.AUTO ? undefined : mode });
  if (actualMode === SWARM_MODE.FAST) {
    return [
      {
        taskId: 'task-explore',
        role: SWARM_ROLES.EXPLORER,
        objective: 'Inspect workspace structure, files, dependencies, and git state',
        dependencies: [],
        ownedResources: ['context/workspace.json']
      },
      {
        taskId: 'task-engineer',
        role: SWARM_ROLES.ENGINEER,
        objective: 'Implement the requested change with minimal, production-grade code',
        dependencies: ['task-explore'],
        ownedResources: ['src/']
      },
      {
        taskId: 'task-review',
        role: SWARM_ROLES.REVIEWER,
        objective: 'Review the diff for correctness, security, and regressions',
        dependencies: ['task-engineer'],
        ownedResources: ['artifacts/review.json']
      }
    ];
  }
  return [
    {
      taskId: 'task-explore',
      role: SWARM_ROLES.EXPLORER,
      objective: 'Inspect workspace structure, files, dependencies, and git state',
      dependencies: [],
      ownedResources: ['context/workspace.json']
    },
    {
      taskId: 'task-architect',
      role: SWARM_ROLES.ARCHITECT,
      objective: 'Design overall implementation strategy and module interfaces',
      dependencies: ['task-explore'],
      ownedResources: ['spec/architecture.json']
    },
    {
      taskId: 'task-frontend',
      role: SWARM_ROLES.FRONTEND,
      objective: 'Implement client UI components and responsive views',
      dependencies: ['task-architect'],
      ownedResources: ['src/components/']
    },
    {
      taskId: 'task-backend',
      role: SWARM_ROLES.BACKEND,
      objective: 'Implement server endpoints, state handling, and backend logic',
      dependencies: ['task-architect'],
      ownedResources: ['src/services/']
    },
    {
      taskId: 'task-test',
      role: SWARM_ROLES.TESTER,
      objective: 'Verify implementation with automated unit tests and linter',
      dependencies: ['task-frontend', 'task-backend'],
      ownedResources: ['tests/']
    },
    {
      taskId: 'task-review',
      role: SWARM_ROLES.REVIEWER,
      objective: 'Review diffs for security, correctness, and maintainability',
      dependencies: ['task-test'],
      ownedResources: ['artifacts/review.json']
    }
  ];
}

const VALID_MODES = new Set(Object.values(SWARM_MODE));

export class GenericSwarmOrchestrator {
  constructor(options = {}) {
    this.providerRouter = options.providerRouter;
    this.contextEngine = options.contextEngine;
    this.toolRegistry = options.toolRegistry;
    this.queue = new AdaptiveConcurrencyQueue(options.queueOptions);
    // Optional real-check hook: async ({ task, output, projectState }) =>
    // ({ ok: boolean, evidence?: string }). Agent text claims are never
    // evidence; only checks that actually run (tests, lint, builds) count.
    this.verifier = options.verifier;
  }

  async executeSwarmJob(userPrompt, options = {}) {
    const projectId = options.projectId || `swarm_${Date.now()}`;
    const requestedMode = options.mode || SWARM_MODE.AUTO;
    if (!VALID_MODES.has(requestedMode)) {
      throw new Error(`Invalid swarm mode "${requestedMode}". Use one of: ${Object.values(SWARM_MODE).join(', ')}.`);
    }
    const mode = decideSwarmMode(userPrompt, {
      force: requestedMode === SWARM_MODE.AUTO ? undefined : requestedMode
    });
    const graph = new TaskDependencyGraph(projectId);
    const onStatus = options.onStatus || (() => {});

    onStatus({ step: 'mode_selected', mode, message: `Swarm mode: ${mode}` });
    onStatus({ step: 'decomposing', message: `Decomposing swarm task: "${userPrompt}"` });

    const defaultTasks = buildDefaultTasks(mode);
    for (const t of defaultTasks) {
      graph.addTask(t);
    }

    const completedResults = [];
    const verification = [];

    // 2. Process DAG tasks using Adaptive Concurrency Queue
    while (!graph.isSwarmComplete()) {
      const readyTasks = graph.getReadyTasks();
      if (readyTasks.length === 0) {
        const anyRunningOrQueued = Array.from(graph.tasks.values()).some(
          t => t.status === AGENT_LIFECYCLE_STATES.RUNNING || t.status === AGENT_LIFECYCLE_STATES.QUEUED
        );
        if (!anyRunningOrQueued) break;
        await new Promise(r => setTimeout(r, 50));
        continue;
      }

      const executions = readyTasks.map(task => {
        task.status = AGENT_LIFECYCLE_STATES.RUNNING;
        onStatus({ step: 'agent_start', role: task.role, taskId: task.taskId, objective: task.objective });

        return this.queue.enqueue(async () => {
          try {
            const result = await this.runSingleAgentTask(graph, task, userPrompt, options);
            task.status = AGENT_LIFECYCLE_STATES.VALIDATING;

            if (this.verifier) {
              let verdict;
              try {
                verdict = await this.verifier({ task, output: result, projectState: graph.projectState });
              } catch (err) {
                verdict = { ok: false, evidence: `verifier threw: ${err.message}` };
              }
              const ok = Boolean(verdict && verdict.ok !== false);
              verification.push({
                taskId: task.taskId,
                role: task.role,
                ok,
                evidence: verdict?.evidence || ''
              });
              if (!ok) {
                task.status = AGENT_LIFECYCLE_STATES.FAILED;
                task.failureReason = `verification failed: ${verdict?.evidence || 'no evidence provided'}`;
                graph.projectState.recordIssue(task.agentId, task.taskId, task.failureReason, task.isEssential);
                onStatus({ step: 'agent_failed', role: task.role, taskId: task.taskId, reason: task.failureReason });
                return result;
              }
            }

            const commitRes = graph.projectState.commitTaskOutput(task.agentId, task.taskId, result);
            if (!commitRes.success) {
              task.status = AGENT_LIFECYCLE_STATES.FAILED;
              task.failureReason = commitRes.reason;
              onStatus({ step: 'agent_failed', role: task.role, taskId: task.taskId, reason: commitRes.reason });
              return result;
            }
            task.status = AGENT_LIFECYCLE_STATES.COMPLETED;
            completedResults.push({ task, result });
            onStatus({ step: 'agent_complete', role: task.role, taskId: task.taskId });
            return result;
          } catch (err) {
            task.status = AGENT_LIFECYCLE_STATES.FAILED;
            task.failureReason = err.message;
            onStatus({ step: 'agent_failed', role: task.role, taskId: task.taskId, reason: err.message });
            throw err;
          }
        }, { taskId: task.taskId, role: task.role });
      });

      await Promise.allSettled(executions);
    }

    const failedTasks = Array.from(graph.tasks.values()).filter(
      t => t.status === AGENT_LIFECYCLE_STATES.FAILED
    );
    const stuckTasks = Array.from(graph.tasks.values()).filter(t => {
      const terminal = [AGENT_LIFECYCLE_STATES.COMPLETED, AGENT_LIFECYCLE_STATES.FAILED];
      return !terminal.includes(t.status);
    });

    if (failedTasks.length > 0 || stuckTasks.length > 0) {
      onStatus({
        step: 'swarm_failed',
        message: `${failedTasks.length} task(s) failed, ${stuckTasks.length} task(s) incomplete.`,
        tasks: [...failedTasks, ...stuckTasks].map(t => ({ taskId: t.taskId, role: t.role, status: t.status, reason: t.failureReason }))
      });
    }

    return {
      projectId,
      mode,
      completed: failedTasks.length === 0 && stuckTasks.length === 0,
      tasksCount: graph.tasks.size,
      results: completedResults,
      verification,
      failedTasks: failedTasks.map(t => ({ taskId: t.taskId, role: t.role, reason: t.failureReason })),
      incompleteTasks: stuckTasks.map(t => ({ taskId: t.taskId, role: t.role, status: t.status }))
    };
  }

  async runSingleAgentTask(graph, task, userPrompt, options) {
    if (options.mockExecution) {
      return { status: 'success', role: task.role, output: `Completed objective: ${task.objective}` };
    }

    if (!this.providerRouter) {
      // Fail loudly instead of silently "succeeding": a swarm without a
      // provider must never fabricate completion.
      throw new Error(
        `Swarm executor misconfigured: no providerRouter configured and mockExecution is off. ` +
        `Provide a ModelProviderRouter (or set mockExecution: true in tests only).`
      );
    }

    const messages = [
      { role: 'system', content: `You are the CoreZ ${task.role} agent.` },
      { role: 'user', content: `Task: ${task.objective}\nJob: ${userPrompt}` }
    ];
    const res = await this.providerRouter.generate({ messages, signal: options.signal });
    return { status: 'success', role: task.role, output: res.content };
  }
}
