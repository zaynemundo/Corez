/**
 * CoreZ Task Graph & Resource Locks
 * DAG task graph for orchestrating parallel subagent execution and state lock safety.
 */

import { 
  TaskDependencyGraph, 
  ResourceLockManager, 
  SharedProjectState, 
  AGENT_LIFECYCLE_STATES 
} from '../services/gamePipeline/swarm/taskGraph.js';

export { 
  TaskDependencyGraph, 
  ResourceLockManager, 
  SharedProjectState, 
  AGENT_LIFECYCLE_STATES 
};

export function createPlanTaskGraph(projectId, tasks = []) {
  const graph = new TaskDependencyGraph(projectId);
  for (const t of tasks) {
    graph.addTask({
      taskId: t.taskId || t.id,
      role: t.role || 'IMPLEMENTER',
      objective: t.goal || t.objective || t.title,
      dependencies: t.dependencies || [],
      ownedResources: t.ownedResources || t.relevantFiles || []
    });
  }
  return graph;
}
