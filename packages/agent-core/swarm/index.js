export {
  TaskDependencyGraph,
  ResourceLockManager,
  SharedProjectState,
  AGENT_LIFECYCLE_STATES
} from '../../../src/services/gamePipeline/swarm/taskGraph.js';

export { AdaptiveConcurrencyQueue } from '../../../src/services/gamePipeline/swarm/adaptiveQueue.js';

export { HierarchicalSynthesis, chunkByTokens, DEFAULT_CHUNK_MAX_TOKENS } from './hierarchicalSynthesis.js';

export {
  SWARM_ROLES,
  ROLE_DEFINITIONS,
  getRoleDefinition,
  getRoleSystemPrompt,
  formatRoleUserPrompt
} from './roles.js';

import { TaskDependencyGraph, AGENT_LIFECYCLE_STATES } from '../../../src/services/gamePipeline/swarm/taskGraph.js';
import { AdaptiveConcurrencyQueue } from '../../../src/services/gamePipeline/swarm/adaptiveQueue.js';
import { estimateTokens } from '../persistence/ContextStore.js';
import { SWARM_ROLES, getRoleSystemPrompt, formatRoleUserPrompt } from './roles.js';

export const SWARM_MODE = Object.freeze({
  AUTO: 'auto',
  FAST: 'fast',
  SWARM: 'swarm'
});

// Briefs mentioning any of these scopes go to the full specialist DAG.
// Small, surgical edits (a typo fix, a single component change) take the fast path.
const FULL_SWARM_SIGNALS =
  /\b(website|web app|app|game|api|apis?|backend|database|db\b|auth|authentication|server|endpoint|migration|refactor|microservice|multi-page|deploy|docker|kubernetes|realtime|websocket|design system|accessibility|wcag|a11y|performance|optimize|audit)\b/i;

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

    // Process DAG tasks using Adaptive Concurrency Queue and atomic Resource Locking
    while (!graph.isSwarmComplete()) {
      const readyTasks = graph.getReadyTasks();
      if (readyTasks.length === 0) {
        const anyRunningOrQueued = Array.from(graph.tasks.values()).some(
          t => t.status === AGENT_LIFECYCLE_STATES.RUNNING ||
               t.status === AGENT_LIFECYCLE_STATES.QUEUED ||
               t.status === AGENT_LIFECYCLE_STATES.RETRYING
        );
        if (!anyRunningOrQueued) break;
        await new Promise(r => setTimeout(r, 50));
        continue;
      }

      // Filter tasks that can acquire all required ownedResources
      const acquirableTasks = [];
      for (const task of readyTasks) {
        if (graph.resourceManager.canAcquireAll(task.ownedResources, task.agentId)) {
          acquirableTasks.push(task);
        }
      }

      if (acquirableTasks.length === 0) {
        // Resource contention: wait for running tasks to release locks
        await new Promise(r => setTimeout(r, 50));
        continue;
      }

      const executions = acquirableTasks.map(task => {
        // Atomically acquire resource locks
        const lockRes = graph.resourceManager.acquireLocks(task.ownedResources, task.agentId);
        if (!lockRes.success) {
          // Defer task to next loop iteration
          return Promise.resolve();
        }

        task.status = AGENT_LIFECYCLE_STATES.RUNNING;
        onStatus({ step: 'agent_start', role: task.role, taskId: task.taskId, objective: task.objective });

        return this.queue.enqueue(async () => {
          try {
            // Gather upstream context from completed dependencies and inputRefs
            const upstreamIds = Array.from(new Set([...(task.dependencies || []), ...(task.inputRefs || [])]));
            const upstreamContexts = [];
            for (const depId of upstreamIds) {
              const depTask = graph.tasks.get(depId);
              const output = graph.projectState.state.validatedOutputs[depId];
              if (depTask && output !== undefined) {
                upstreamContexts.push({
                  taskId: depId,
                  role: depTask.role,
                  output
                });
              }
            }

            const result = await this.runSingleAgentTask(graph, task, userPrompt, {
              ...options,
              upstreamContexts
            });

            // Extract potential decomposition payload from result.output or result
            let decompositionPayload = null;
            if (result && typeof result === 'object') {
              if (result.output && typeof result.output === 'object') {
                decompositionPayload = result.output;
              } else if (result.status === 'requires_decomposition' || Array.isArray(result.suggestedTasks)) {
                decompositionPayload = result;
              } else if (typeof result.output === 'string') {
                try {
                  const parsed = JSON.parse(result.output);
                  if (parsed && typeof parsed === 'object' && (parsed.status === 'requires_decomposition' || Array.isArray(parsed.suggestedTasks))) {
                    decompositionPayload = parsed;
                  }
                } catch {}
              }
            }

            // Handle dynamic runtime decomposition if suggested
            if (decompositionPayload && (decompositionPayload.status === 'requires_decomposition' || Array.isArray(decompositionPayload.suggestedTasks))) {
              const newSubtasks = graph.handleDecomposition(task.taskId, decompositionPayload);
              graph.resourceManager.releaseAllLocksForAgent(task.agentId);
              onStatus({
                step: 'agent_decomposed',
                role: task.role,
                taskId: task.taskId,
                newTasksCount: newSubtasks.length
              });
              return result;
            }

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
                const evidence = verdict?.evidence || 'no evidence provided';
                if ((task.attempt || 1) < (task.maxAttempts || 3)) {
                  task.attempt = (task.attempt || 1) + 1;
                  task.status = AGENT_LIFECYCLE_STATES.RETRYING;
                  task.verificationEvidence = evidence;
                  graph.resourceManager.releaseAllLocksForAgent(task.agentId);
                  onStatus({
                    step: 'agent_retrying',
                    role: task.role,
                    taskId: task.taskId,
                    attempt: task.attempt,
                    reason: `verification failed: ${evidence}`
                  });
                  return result;
                }

                task.status = AGENT_LIFECYCLE_STATES.FAILED;
                task.failureReason = `verification failed: ${evidence}`;
                graph.projectState.recordIssue(task.agentId, task.taskId, task.failureReason, task.isEssential);
                graph.resourceManager.releaseAllLocksForAgent(task.agentId);
                onStatus({ step: 'agent_failed', role: task.role, taskId: task.taskId, reason: task.failureReason });
                return result;
              }
            }

            const commitRes = graph.projectState.commitTaskOutput(task.agentId, task.taskId, result, task.ownedResources);
            if (!commitRes.success) {
              task.status = AGENT_LIFECYCLE_STATES.FAILED;
              task.failureReason = commitRes.reason;
              graph.resourceManager.releaseAllLocksForAgent(task.agentId);
              onStatus({ step: 'agent_failed', role: task.role, taskId: task.taskId, reason: commitRes.reason });
              return result;
            }

            task.status = AGENT_LIFECYCLE_STATES.COMPLETED;
            graph.resourceManager.releaseAllLocksForAgent(task.agentId);
            completedResults.push({ task, result });
            onStatus({ step: 'agent_complete', role: task.role, taskId: task.taskId });
            return result;
          } catch (err) {
            graph.resourceManager.releaseAllLocksForAgent(task.agentId);

            if ((task.attempt || 1) < (task.maxAttempts || 3) && !err.message?.includes('no providerRouter')) {
              task.attempt = (task.attempt || 1) + 1;
              task.status = AGENT_LIFECYCLE_STATES.RETRYING;
              task.lastError = err.message;
              onStatus({
                step: 'agent_retrying',
                role: task.role,
                taskId: task.taskId,
                attempt: task.attempt,
                reason: err.message
              });
              return;
            }

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
      const terminal = [AGENT_LIFECYCLE_STATES.COMPLETED, AGENT_LIFECYCLE_STATES.DECOMPOSED, AGENT_LIFECYCLE_STATES.FAILED];
      return !terminal.includes(t.status);
    });

    if (failedTasks.length > 0 || stuckTasks.length > 0) {
      onStatus({
        step: 'swarm_failed',
        message: `${failedTasks.length} task(s) failed, ${stuckTasks.length} task(s) incomplete.`,
        tasks: [...failedTasks, ...stuckTasks].map(t => ({ taskId: t.taskId, role: t.role, status: t.status, reason: t.failureReason }))
      });
    }

    // Build discrete artifact map and topological synthesis
    const topologicalTasks = graph.getTopologicalOrder();
    const artifactMap = {};
    const topologicalOutputs = [];

    for (const t of topologicalTasks) {
      const out = graph.projectState.state.validatedOutputs[t.taskId];
      if (out !== undefined) {
        topologicalOutputs.push({ taskId: t.taskId, role: t.role, output: out });
        for (const res of t.ownedResources) {
          artifactMap[res] = out;
        }
      }
    }

    return {
      projectId,
      mode,
      completed: failedTasks.length === 0 && stuckTasks.length === 0,
      tasksCount: graph.tasks.size,
      results: completedResults,
      verification,
      failedTasks: failedTasks.map(t => ({ taskId: t.taskId, role: t.role, reason: t.failureReason })),
      incompleteTasks: stuckTasks.map(t => ({ taskId: t.taskId, role: t.role, status: t.status })),
      artifactMap,
      topologicalOutputs
    };
  }

  async runSingleAgentTask(graph, task, userPrompt, options = {}) {
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

    const systemPrompt = getRoleSystemPrompt(task.role);
    const userContent = formatRoleUserPrompt({
      role: task.role,
      objective: task.objective,
      userPrompt,
      upstreamContexts: options.upstreamContexts || [],
      retryContext: task.attempt > 1 ? {
        attempt: task.attempt,
        maxAttempts: task.maxAttempts,
        lastError: task.lastError,
        verificationEvidence: task.verificationEvidence
      } : null
    });

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ];
    const res = await this.providerRouter.generate({ messages, signal: options.signal });
    return { status: 'success', role: task.role, output: res.content };
  }
}
