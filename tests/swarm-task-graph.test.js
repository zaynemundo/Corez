import { describe, it, expect } from 'vitest';
import { TaskDependencyGraph, ResourceLockManager, AGENT_LIFECYCLE_STATES } from '../src/services/gamePipeline/swarm/taskGraph.js';

describe('Unlimited Dynamic Swarm: Task Graph & State Engine', () => {
  it('allows unlimited dynamic logical agents without hardcoded limits', () => {
    const graph = new TaskDependencyGraph('proj_unlimited');
    
    // Add 150 specialist tasks dynamically
    for (let i = 0; i < 150; i++) {
      graph.addTask({
        role: `specialist-${i}`,
        taskId: `task-${i}`,
        objective: `Objective for specialist ${i}`,
        dependencies: i > 0 ? [`task-${i - 1}`] : []
      });
    }

    expect(graph.tasks.size).toBe(150);
    expect(Object.keys(graph.projectState.state.agents)).toHaveLength(150);
  });

  it('manages resource locks cleanly and prevents race conditions', () => {
    const manager = new ResourceLockManager();
    const lock1 = manager.acquireLock('game/physics.js', 'agent-physics-1');
    expect(lock1.success).toBe(true);
    expect(lock1.lockInfo.version).toBe(1);

    // Second agent attempts to lock locked resource
    const lock2 = manager.acquireLock('game/physics.js', 'agent-physics-2');
    expect(lock2.success).toBe(false);
    expect(lock2.currentOwner).toBe('agent-physics-1');

    // Release lock
    expect(manager.releaseLock('game/physics.js', 'agent-physics-1')).toBe(true);
    
    // Now second agent can acquire
    const lock3 = manager.acquireLock('game/physics.js', 'agent-physics-2');
    expect(lock3.success).toBe(true);
    expect(lock3.lockInfo.version).toBe(2);
  });

  it('atomically commits task outputs to shared project state', () => {
    const graph = new TaskDependencyGraph('proj_atomic');
    const task = graph.addTask({
      role: 'combat-designer',
      taskId: 'task-combat',
      objective: 'Design combat system',
      ownedResources: ['spec/combat.json']
    });

    const commitRes = graph.projectState.commitTaskOutput(
      task.agentId,
      'task-combat',
      { damageMultiplier: 1.5 },
      ['spec/combat.json']
    );

    expect(commitRes.success).toBe(true);
    expect(commitRes.version).toBe(2);
    expect(graph.projectState.state.validatedOutputs['task-combat']).toEqual({ damageMultiplier: 1.5 });
  });

  it('handles recursive task decomposition requests', () => {
    const graph = new TaskDependencyGraph('proj_decomp');
    const parentTask = graph.addTask({
      role: 'world-designer',
      taskId: 'task-world',
      objective: 'Design entire world'
    });

    const decomposition = {
      status: 'requires_decomposition',
      reason: 'The world contains three independent levels.',
      suggestedTasks: [
        { taskId: 'task-level-1', role: 'level-designer', objective: 'Level 1' },
        { taskId: 'task-level-2', role: 'level-designer', objective: 'Level 2' }
      ]
    };

    const newTasks = graph.handleDecomposition('task-world', decomposition);
    expect(newTasks).toHaveLength(2);
    expect(parentTask.status).toBe(AGENT_LIFECYCLE_STATES.DECOMPOSED);
    expect(graph.tasks.has('task-level-1')).toBe(true);
    expect(graph.tasks.has('task-level-2')).toBe(true);
  });

  it('schedules tasks using partial dependency resolution', () => {
    const graph = new TaskDependencyGraph('proj_dag');
    graph.addTask({ role: 'art-dir', taskId: 'art-dir', objective: 'Art direction' });
    graph.addTask({ role: 'engine', taskId: 'engine', objective: 'Engine skeleton' });
    graph.addTask({ role: 'bg-asset', taskId: 'bg-asset', objective: 'BG Asset', dependencies: ['art-dir'] });

    let ready = graph.getReadyTasks();
    expect(ready.map(t => t.taskId)).toEqual(expect.arrayContaining(['art-dir', 'engine']));
    expect(ready.map(t => t.taskId)).not.toContain('bg-asset');

    // Complete art-dir
    const artTask = graph.tasks.get('art-dir');
    graph.projectState.commitTaskOutput(artTask.agentId, 'art-dir', { palette: ['#000'] });

    ready = graph.getReadyTasks();
    expect(ready.map(t => t.taskId)).toContain('bg-asset');
  });

  it('releases decomposed subtasks immediately instead of deadlocking on the DECOMPOSED parent', () => {
    const graph = new TaskDependencyGraph('proj_decomp_ready');
    graph.addTask({ role: 'world-designer', taskId: 'task-world', objective: 'Design entire world' });
    graph.addTask({ role: 'tester', taskId: 'task-test', objective: 'Test the world', dependencies: ['task-world'] });

    const decomposition = {
      status: 'requires_decomposition',
      reason: 'Split into levels',
      suggestedTasks: [
        { taskId: 'task-level-1', role: 'level-designer', objective: 'Level 1' },
        { taskId: 'task-level-2', role: 'level-designer', objective: 'Level 2' }
      ]
    };

    graph.handleDecomposition('task-world', decomposition);

    // Subtasks inherit the parent's (empty) dependencies instead of depending on the DECOMPOSED parent
    const level1 = graph.tasks.get('task-level-1');
    const level2 = graph.tasks.get('task-level-2');
    expect(level1.dependencies).toEqual([]);
    expect(level2.dependencies).toEqual([]);

    const ready = graph.getReadyTasks();
    expect(ready.map(t => t.taskId)).toEqual(expect.arrayContaining(['task-level-1', 'task-level-2', 'task-test']));

    // A DECOMPOSED essential parent counts as satisfied for completion
    graph.addTask({ role: 'essential', taskId: 'task-essential', objective: 'Essential work', isEssential: true });
    graph.tasks.get('task-essential').status = AGENT_LIFECYCLE_STATES.DECOMPOSED;
    graph.tasks.get('task-world').status = AGENT_LIFECYCLE_STATES.DECOMPOSED;
    graph.tasks.get('task-level-1').status = AGENT_LIFECYCLE_STATES.COMPLETED;
    graph.tasks.get('task-level-2').status = AGENT_LIFECYCLE_STATES.COMPLETED;
    graph.tasks.get('task-test').status = AGENT_LIFECYCLE_STATES.COMPLETED;
    expect(graph.isSwarmComplete()).toBe(true);
  });
});
