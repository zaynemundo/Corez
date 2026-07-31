export { 
  TaskDependencyGraph, 
  ResourceLockManager, 
  SharedProjectState, 
  AGENT_LIFECYCLE_STATES 
} from '../../../src/services/gamePipeline/swarm/taskGraph.js';

export { AdaptiveConcurrencyQueue } from '../../../src/services/gamePipeline/swarm/adaptiveQueue.js';

import { TaskDependencyGraph, AGENT_LIFECYCLE_STATES } from '../../../src/services/gamePipeline/swarm/taskGraph.js';
import { AdaptiveConcurrencyQueue } from '../../../src/services/gamePipeline/swarm/adaptiveQueue.js';

export const SWARM_ROLES = Object.freeze({
  ORCHESTRATOR: 'orchestrator',
  EXPLORER: 'explorer',
  ARCHITECT: 'architect',
  FRONTEND: 'frontend',
  BACKEND: 'backend',
  DEBUGGER: 'debugger',
  TESTER: 'tester',
  REVIEWER: 'reviewer',
  SECURITY: 'security',
  INTEGRATION: 'integration'
});

export class GenericSwarmOrchestrator {
  constructor(options = {}) {
    this.providerRouter = options.providerRouter;
    this.contextEngine = options.contextEngine;
    this.toolRegistry = options.toolRegistry;
    this.queue = new AdaptiveConcurrencyQueue(options.queueOptions);
  }

  async executeSwarmJob(userPrompt, options = {}) {
    const projectId = options.projectId || `swarm_${Date.now()}`;
    const graph = new TaskDependencyGraph(projectId);
    const onStatus = options.onStatus || (() => {});

    onStatus({ step: 'decomposing', message: `Decomposing swarm task: "${userPrompt}"` });

    // 1. Initial Orchestrator Step: Decompose task into DAG
    const defaultTasks = [
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

    for (const t of defaultTasks) {
      graph.addTask(t);
    }

    const completedResults = [];

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
            const commitRes = graph.projectState.commitTaskOutput(task.agentId, task.taskId, result);
            if (!commitRes.success) {
              task.status = AGENT_LIFECYCLE_STATES.FAILED;
              onStatus({ step: 'agent_failed', role: task.role, taskId: task.taskId, reason: commitRes.reason });
              return result;
            }
            task.status = AGENT_LIFECYCLE_STATES.COMPLETED;
            completedResults.push({ task, result });
            onStatus({ step: 'agent_complete', role: task.role, taskId: task.taskId });
            return result;
          } catch (err) {
            task.status = AGENT_LIFECYCLE_STATES.FAILED;
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
        tasks: [...failedTasks, ...stuckTasks].map(t => ({ taskId: t.taskId, role: t.role, status: t.status }))
      });
    }

    return {
      projectId,
      completed: failedTasks.length === 0 && stuckTasks.length === 0,
      tasksCount: graph.tasks.size,
      results: completedResults,
      failedTasks: failedTasks.map(t => ({ taskId: t.taskId, role: t.role })),
      incompleteTasks: stuckTasks.map(t => ({ taskId: t.taskId, role: t.role, status: t.status }))
    };
  }

  async runSingleAgentTask(graph, task, userPrompt, options) {
    if (options.mockExecution) {
      return { status: 'success', role: task.role, output: `Completed objective: ${task.objective}` };
    }

    if (this.providerRouter) {
      const messages = [
        { role: 'system', content: `You are the CoreZ ${task.role} agent.` },
        { role: 'user', content: `Task: ${task.objective}\nJob: ${userPrompt}` }
      ];
      const res = await this.providerRouter.generate({ messages, signal: options.signal });
      return { status: 'success', role: task.role, output: res.content };
    }

    return { status: 'success', role: task.role, output: `Finished ${task.objective}` };
  }
}
