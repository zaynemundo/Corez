/**
 * Dynamic Dependency Graph, Resource Lock Manager, and Shared Project State
 * Enables unlimited logical agents, DAG scheduling, partial dependency completion,
 * resource ownership tracking, and atomic state updates.
 */

export const AGENT_LIFECYCLE_STATES = {
  CREATED: 'created',
  QUEUED: 'queued',
  WAITING_FOR_DEPENDENCIES: 'waiting_for_dependencies',
  RUNNING: 'running',
  VALIDATING: 'validating',
  COMPLETED: 'completed',
  FAILED: 'failed',
  DECOMPOSED: 'decomposed',
  RETRYING: 'retrying'
};

export class ResourceLockManager {
  constructor() {
    this.locks = new Map(); // resourceName -> { ownerAgentId, version, locked: boolean }
  }

  acquireLock(resourceName, agentId) {
    const existing = this.locks.get(resourceName);
    if (existing && existing.locked && existing.ownerAgentId !== agentId) {
      return { success: false, currentOwner: existing.ownerAgentId, version: existing.version };
    }
    const version = (existing ? existing.version : 0) + 1;
    const lockInfo = { resourceName, ownerAgentId: agentId, version, locked: true };
    this.locks.set(resourceName, lockInfo);
    return { success: true, lockInfo };
  }

  releaseLock(resourceName, agentId) {
    const existing = this.locks.get(resourceName);
    if (existing && existing.ownerAgentId === agentId) {
      this.locks.set(resourceName, { ...existing, locked: false });
      return true;
    }
    return false;
  }

  getLock(resourceName) {
    return this.locks.get(resourceName) || null;
  }
}

export class SharedProjectState {
  constructor(projectId) {
    this.state = {
      projectId: projectId || `swarm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      specVersion: 1,
      agents: {},
      tasks: {},
      dependencies: {},
      resources: {},
      assets: {},
      validatedOutputs: {},
      issues: [],
      events: []
    };
  }

  getState() {
    return { ...this.state };
  }

  commitTaskOutput(agentId, taskId, output, resourceLocks = []) {
    const task = this.state.tasks[taskId];
    const agent = this.state.agents[agentId];

    if (!task || !agent) {
      return { success: false, reason: 'Task or Agent does not exist.' };
    }

    if (task.status === AGENT_LIFECYCLE_STATES.COMPLETED) {
      return { success: false, reason: 'Task is already completed.' };
    }

    // Verify resource ownership if resources locked
    for (const resName of resourceLocks) {
      const lock = this.state.resources[resName];
      if (lock && lock.locked && lock.ownerAgentId !== agentId) {
        return { success: false, reason: `Resource "${resName}" is locked by another agent "${lock.ownerAgentId}".` };
      }
    }

    // Atomic update
    this.state.specVersion += 1;
    this.state.validatedOutputs[taskId] = output;
    this.state.tasks[taskId].status = AGENT_LIFECYCLE_STATES.COMPLETED;
    this.state.agents[agentId].status = AGENT_LIFECYCLE_STATES.COMPLETED;

    this.state.events.push({
      type: 'TASK_COMPLETED',
      agentId,
      taskId,
      version: this.state.specVersion,
      timestamp: new Date().toISOString()
    });

    return { success: true, version: this.state.specVersion };
  }

  recordIssue(agentId, taskId, issueDescription, isBlocking = false) {
    this.state.issues.push({
      id: `issue_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      agentId,
      taskId,
      description: issueDescription,
      isBlocking,
      timestamp: new Date().toISOString()
    });
  }
}

export class TaskDependencyGraph {
  constructor(projectId) {
    this.projectState = new SharedProjectState(projectId);
    this.resourceManager = new ResourceLockManager();
    this.tasks = new Map(); // taskId -> taskDef
  }

  addTask(taskDef) {
    const agentId = taskDef.agentId || `agent_${taskDef.role}_${Math.random().toString(36).slice(2, 7)}`;
    const fullTask = {
      agentId,
      role: taskDef.role,
      taskId: taskDef.taskId,
      objective: taskDef.objective,
      dependencies: Array.isArray(taskDef.dependencies) ? taskDef.dependencies : [],
      inputRefs: Array.isArray(taskDef.inputRefs) ? taskDef.inputRefs : [],
      outputSchema: taskDef.outputSchema || {},
      ownedResources: Array.isArray(taskDef.ownedResources) ? taskDef.ownedResources : [],
      isEssential: taskDef.isEssential !== false,
      status: AGENT_LIFECYCLE_STATES.CREATED,
      attempt: 1,
      maxAttempts: taskDef.maxAttempts || 3,
      createdTimestamp: Date.now()
    };

    this.tasks.set(fullTask.taskId, fullTask);
    this.projectState.state.tasks[fullTask.taskId] = fullTask;
    this.projectState.state.agents[agentId] = {
      agentId,
      role: fullTask.role,
      taskId: fullTask.taskId,
      status: AGENT_LIFECYCLE_STATES.CREATED
    };

    return fullTask;
  }

  getReadyTasks() {
    const ready = [];
    for (const [taskId, task] of this.tasks.entries()) {
      if (
        task.status === AGENT_LIFECYCLE_STATES.CREATED ||
        task.status === AGENT_LIFECYCLE_STATES.QUEUED ||
        task.status === AGENT_LIFECYCLE_STATES.WAITING_FOR_DEPENDENCIES
      ) {
        const dependenciesMet = task.dependencies.every(depId => {
          const depTask = this.tasks.get(depId);
          return depTask && depTask.status === AGENT_LIFECYCLE_STATES.COMPLETED;
        });

        if (dependenciesMet) {
          task.status = AGENT_LIFECYCLE_STATES.QUEUED;
          ready.push(task);
        } else {
          task.status = AGENT_LIFECYCLE_STATES.WAITING_FOR_DEPENDENCIES;
        }
      }
    }
    return ready;
  }

  handleDecomposition(parentTaskId, decompositionPayload) {
    const parentTask = this.tasks.get(parentTaskId);
    if (!parentTask) return [];

    parentTask.status = AGENT_LIFECYCLE_STATES.DECOMPOSED;
    const newTasks = [];

    const suggested = Array.isArray(decompositionPayload.suggestedTasks) ? decompositionPayload.suggestedTasks : [];
    for (const sub of suggested) {
      const subTask = this.addTask({
        role: sub.role || parentTask.role,
        taskId: sub.taskId,
        objective: sub.objective || `Subtask of ${parentTaskId}`,
        dependencies: Array.isArray(sub.dependencies) ? [...sub.dependencies] : [parentTaskId],
        ownedResources: sub.ownedResources || [],
        isEssential: parentTask.isEssential
      });
      newTasks.push(subTask);
    }

    return newTasks;
  }

  isSwarmComplete() {
    let allEssentialComplete = true;
    for (const task of this.tasks.values()) {
      if (task.isEssential && task.status !== AGENT_LIFECYCLE_STATES.COMPLETED) {
        allEssentialComplete = false;
        break;
      }
    }
    return allEssentialComplete;
  }
}
