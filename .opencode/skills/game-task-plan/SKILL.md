# game-task-plan

> Lead Programmer skill for building DAG task graphs and task briefs for specialist programmers.

## Frontmatter

```yaml
version: 1.0.0
tags: [game-task-plan, lead-programmer, planning, decomposition, dag]
dependencies: [game-architecture, game-spec]
token_estimate: 2800
```

## DAG Task Structure Specification

Every task in the graph is a JSON object with this exact schema:

```json
{
  "id": "task-001",
  "title": "Implement player movement",
  "agent": "gameplay-programmer",
  "dependencies": [],
  "files": [
    "src/game/entities/player.ts",
    "src/game/__tests__/player.test.ts"
  ],
  "acceptanceCriteria": [
    "Player moves left/right at constant speed when arrow keys are held",
    "Player stops instantly when key is released",
    "Player cannot move outside the game canvas bounds",
    "Movement speed is configurable via a SPEED constant"
  ],
  "estimatedMinutes": 45,
  "risk": "low"
}
```

### Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique identifier, format `task-NNN` |
| `title` | yes | Short imperative description |
| `agent` | yes | Role assigned (must match skill name) |
| `dependencies` | yes | Array of task IDs that must complete first |
| `files` | yes | Source files this agent is allowed to edit |
| `acceptanceCriteria` | yes | Measurable pass/fail conditions |
| `estimatedMinutes` | yes | Bounded time estimate |
| `risk` | yes | `low`, `medium`, or `high` |

## Task Decomposition Methodology

### Step 1: Identify System Boundaries

From the game-spec.json and game-architecture, identify the major systems:

- Input system (keyboard, touch, gamepad)
- Player entity (movement, health, state)
- Physics system (gravity, collision detection)
- Rendering system (draw calls, sprites, layers)
- Audio system (SFX, music)
- UI system (HUD, menus, game over)
- Level system (tilemaps, spawn points)
- Game state machine (boot, menu, playing, paused, game over)

### Step 2: Top-Down Decomposition

For each system, decompose into tasks:

```
Game State Machine
  ├── task-001: Implement state machine (idle/menu/playing/paused/gameover)
  ├── task-002: Wire keyboard events to state transitions
  └── task-003: Wire pause menu resume/quit buttons

Player Entity
  ├── task-004: Implement player movement (horizontal)
  ├── task-005: Implement player jump (gravity, apex, fall)
  ├── task-006: Implement player health and damage
  └── task-007: Implement player death animation
```

### Step 3: Assign Dependencies

Rule: If task B needs a type, function, or data structure from task A, then B depends on A.

```
task-004 (player movement) → depends on task-001 (game loop running)
task-005 (player jump)     → depends on task-004 (movement working)
task-006 (player damage)   → depends on task-005 (player in world)
```

### Step 4: Assign Agents

Map each task to a specialist skill:

| Agent Skill | Task Types |
|-------------|------------|
| `gameplay-programmer` | Player, enemies, items, interactions |
| `physics-programmer` | Physics system, collision, spatial hash |
| `ui-programmer` | HUD, menus, overlays, pause screen |
| `audio-programmer` | SFX triggers, music manager, volume |
| `level-designer` | Tilemap data, spawn config, parallax layers |

## Dependency Resolution (Topological Ordering)

Use Kahn's algorithm to produce a flat execution order:

```
function topologicalSort(tasks):
  inDegree = map of taskId -> number of unresolved dependencies
  queue = tasks with inDegree === 0
  result = []

  while queue is not empty:
    task = queue.dequeue()
    result.push(task)
    for each dependent in task.dependents:
      inDegree[dependent] -= 1
      if inDegree[dependent] === 0:
        queue.enqueue(dependent)

  if result.length !== tasks.length:
    report CIRCULAR DEPENDENCY ERROR
  return result
```

If circular dependency detected: merge the involved tasks into one larger task, or extract a shared interface task that both can depend on.

## File Ownership Rules

| Rule | Enforcement |
|------|-------------|
| Exclusive write | No two tasks in the same parallel batch may edit the same file. |
| Read allowed | A task may read any file but may only write files listed in its `files` array. |
| Shared interfaces | Place shared types in `src/game/types.ts`. Only one task may own this file. |
| Ownership registry | Maintain a `task-plan.json` with a `fileOwners` map: `{ "src/player.ts": "task-004" }` |
| Handoff protocol | When task A writes a file that task B depends on, A commits and pushes before B starts. |

## Task Brief Composition Template

Each task brief is a markdown document with these sections:

```markdown
# Task Brief: {title}

**ID:** {id}
**Agent:** {agent}
**Dependencies:** {list of task IDs}
**Estimated Time:** {minutes}
**Risk Level:** {risk}

## Allowed Files

- {file path}

## Acceptance Criteria

{numbered list}

## Input Contract

Types/functions available from completed dependencies:

```typescript
import { GameState } from '../core/state'; // available from task-001
```

## Output Contract

Exports this task must provide:

```typescript
export function movePlayer(direction: 'left' | 'right'): void;
```

## Notes

{edge cases, design decisions, constraints}
```

## Risk Identification

### Circular Dependencies

Symptoms: System A imports from B, B imports from C, C imports from A.

Resolution: Extract the circular dependency into a shared types module that all three depend on. Or merge A, B, C into a single task.

### Oversized Tasks

Symptoms: Acceptance criteria exceed 8 items. Estimated time exceeds 120 minutes. File list exceeds 5 files.

Resolution: Split into two or more tasks. Identify the natural seam (e.g., separate "movement" from "combat" even though they're in the same entity).

### Underspecified Tasks

Symptoms: Acceptance criteria use vague terms like "works properly", "feels good", "is responsive".

Resolution: Reject the task brief. Demand specific, measurable criteria: "jump height is exactly 128px", "acceleration reaches max speed in 300ms".

### Hidden Coupling

Symptoms: Task B is listed as independent but secretly needs a type or function from task A that is not yet specified in A's output contract.

Resolution: Add the missing export to A's output contract, or make B depend on A explicitly.

## Verification Gate Definitions

Each gate must pass before a task moves to the next phase:

| Gate | Phase | Check |
|------|-------|-------|
| G1: Plan Review | After task graph built | No circular deps, all tasks sized correctly, file ownership non-overlapping. |
| G2: Test Gate | After TDD RED | `npm test` fails as expected for new tests. |
| G3: Implementation Gate | After TDD GREEN | `npm test` passes. |
| G4: Quality Gate | After TDD REFACTOR | `npm test`, `npm run lint`, `npm run typecheck` all exit 0. |
| G5: Integration Gate | After dependency chain complete | Full `npm test` suite passes with all integrated modules. |
| G6: Acceptance Gate | Before marking COMPLETE | Every acceptance criterion verified via test or manual check. |

## Task Plan Output

The final task plan is a JSON file committed to the repository:

```json
{
  "game": "my-game",
  "version": "1.0.0",
  "tasks": [ /* full DAG */ ],
  "fileOwners": { /* file path -> task ID map */ },
  "executionOrder": [ /* topologically sorted task IDs */ ],
  "risks": [ /* identified risks and mitigations */ ]
}
```
