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

  /**
   * All-or-nothing atomic lock acquisition across multiple resources.
   * If any resource is locked by another agent, rolls back all acquisitions from this call.
   */
  acquireLocks(resourceNames = [], agentId) {
    if (!Array.isArray(resourceNames) || resourceNames.length === 0) {
      return { success: true, acquired: [] };
    }

    // 1. Dry run check: ensure all requested resources are available
    for (const resName of resourceNames) {
      const existing = this.locks.get(resName);
      if (existing && existing.locked && existing.ownerAgentId !== agentId) {
        return {
          success: false,
          lockedResource: resName,
          currentOwner: existing.ownerAgentId,
          version: existing.version
        };
      }
    }

    // 2. Atomic acquisition
    const acquired = [];
    for (const resName of resourceNames) {
      const res = this.acquireLock(resName, agentId);
      if (res.success) {
        acquired.push(res.lockInfo);
      }
    }

    return { success: true, acquired };
  }

  releaseLock(resourceName, agentId) {
    const existing = this.locks.get(resourceName);
    if (existing && existing.ownerAgentId === agentId) {
      this.locks.set(resourceName, { ...existing, locked: false });
      return true;
    }
    return false;
  }

  releaseLocks(resourceNames = [], agentId) {
    if (!Array.isArray(resourceNames) || resourceNames.length === 0) return true;
    let allReleased = true;
    for (const resName of resourceNames) {
      const released = this.releaseLock(resName, agentId);
      if (!released) allReleased = false;
    }
    return allReleased;
  }

  releaseAllLocksForAgent(agentId) {
    let count = 0;
    for (const [resName, lock] of this.locks.entries()) {
      if (lock.ownerAgentId === agentId && lock.locked) {
        this.locks.set(resName, { ...lock, locked: false });
        count++;
      }
    }
    return count;
  }

  getLock(resourceName) {
    return this.locks.get(resourceName) || null;
  }

  canAcquireAll(resourceNames = [], agentId) {
    if (!Array.isArray(resourceNames) || resourceNames.length === 0) return true;
    return resourceNames.every(resName => {
      const lock = this.locks.get(resName);
      return !lock || !lock.locked || lock.ownerAgentId === agentId;
    });
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
      dependencies: Array.isArray(taskDef.dependencies) ? [...taskDef.dependencies] : [],
      inputRefs: Array.isArray(taskDef.inputRefs) ? [...taskDef.inputRefs] : [],
      outputSchema: taskDef.outputSchema || {},
      ownedResources: Array.isArray(taskDef.ownedResources) ? [...taskDef.ownedResources] : [],
      isEssential: taskDef.isEssential !== false,
      status: AGENT_LIFECYCLE_STATES.CREATED,
      attempt: taskDef.attempt || 1,
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
    for (const [_taskId, task] of this.tasks.entries()) {
      if (
        task.status === AGENT_LIFECYCLE_STATES.CREATED ||
        task.status === AGENT_LIFECYCLE_STATES.QUEUED ||
        task.status === AGENT_LIFECYCLE_STATES.RETRYING ||
        task.status === AGENT_LIFECYCLE_STATES.WAITING_FOR_DEPENDENCIES
      ) {
        const dependenciesMet = task.dependencies.every(depId => {
          const depTask = this.tasks.get(depId);
          return depTask && (depTask.status === AGENT_LIFECYCLE_STATES.COMPLETED || depTask.status === AGENT_LIFECYCLE_STATES.DECOMPOSED);
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

  /**
   * Handles subtask decomposition for a task and optionally re-wires any existing downstream tasks
   * that depended on parentTaskId so they now depend on the new child tasks.
   */
  handleDecomposition(parentTaskId, decompositionPayload, options = {}) {
    const parentTask = this.tasks.get(parentTaskId);
    if (!parentTask) return [];

    parentTask.status = AGENT_LIFECYCLE_STATES.DECOMPOSED;
    const newTasks = [];

    const suggested = Array.isArray(decompositionPayload.suggestedTasks) ? decompositionPayload.suggestedTasks : [];
    for (const sub of suggested) {
      const subDependencies = Array.isArray(sub.dependencies) && sub.dependencies.length > 0
        ? [...sub.dependencies]
        : [...(parentTask.dependencies || [])];
      const subTask = this.addTask({
        role: sub.role || parentTask.role,
        taskId: sub.taskId,
        objective: sub.objective || `Subtask of ${parentTaskId}`,
        dependencies: subDependencies,
        inputRefs: Array.isArray(sub.inputRefs) ? sub.inputRefs : (parentTask.inputRefs || []),
        ownedResources: sub.ownedResources || [],
        isEssential: parentTask.isEssential,
        maxAttempts: sub.maxAttempts || parentTask.maxAttempts || 3
      });
      newTasks.push(subTask);
    }

    const shouldRewire = options.rewireDownstream || decompositionPayload.rewireDownstream;
    if (shouldRewire && newTasks.length > 0) {
      const newSubTaskIds = newTasks.map(t => t.taskId);
      for (const [taskId, task] of this.tasks.entries()) {
        if (taskId !== parentTaskId && task.dependencies.includes(parentTaskId)) {
          task.dependencies = task.dependencies
            .filter(d => d !== parentTaskId)
            .concat(newSubTaskIds);
        }
      }
    }

    return newTasks;
  }

  /**
   * Dynamically injects an array of specialist tasks into the graph,
   * wiring their dependencies and optionally updating downstream tasks.
   */
  injectDynamicTasks(newTasksList = [], { afterTaskId, beforeTaskIds = [] } = {}) {
    const addedTasks = [];
    for (const t of newTasksList) {
      const taskDeps = Array.isArray(t.dependencies) ? [...t.dependencies] : [];
      if (afterTaskId && !taskDeps.includes(afterTaskId)) {
        taskDeps.push(afterTaskId);
      }
      const added = this.addTask({
        ...t,
        dependencies: taskDeps
      });
      addedTasks.push(added);
    }

    if (beforeTaskIds.length > 0 && addedTasks.length > 0) {
      const addedIds = addedTasks.map(t => t.taskId);
      for (const beforeId of beforeTaskIds) {
        const targetTask = this.tasks.get(beforeId);
        if (targetTask) {
          for (const newId of addedIds) {
            if (!targetTask.dependencies.includes(newId)) {
              targetTask.dependencies.push(newId);
            }
          }
        }
      }
    }

    return addedTasks;
  }

  /**
   * Returns all tasks sorted in topological order (dependencies precede dependents).
   */
  getTopologicalOrder() {
    const visited = new Set();
    const result = [];

    const visit = (taskId) => {
      if (visited.has(taskId)) return;
      visited.add(taskId);
      const task = this.tasks.get(taskId);
      if (task) {
        for (const depId of task.dependencies) {
          visit(depId);
        }
        result.push(task);
      }
    };

    for (const taskId of this.tasks.keys()) {
      visit(taskId);
    }

    return result;
  }

  isSwarmComplete() {
    let allEssentialComplete = true;
    for (const task of this.tasks.values()) {
      if (task.isEssential
        && task.status !== AGENT_LIFECYCLE_STATES.COMPLETED
        && task.status !== AGENT_LIFECYCLE_STATES.DECOMPOSED) {
        allEssentialComplete = false;
        break;
      }
    }
    return allEssentialComplete;
  }
}
