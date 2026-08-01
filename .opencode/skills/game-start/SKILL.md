---
name: game-start
description: Initiates the AI Game Studio workflow for browser game requests, sizing complexity (SMALL, MEDIUM, LARGE) and provisioning required departments.
version: 1.0.0
tags: [orchestration, producer, workflow, game-studio, complexity-sizing]
dependencies: [game-brainstorm, game-spec, game-art-direction, game-asset-spec, game-task-plan, game-implement, game-code-review, game-qa-plan, game-smoke-test, game-regression, game-performance-review, game-visual-review, game-release-check, game-bug-triage, game-publish]
token_estimate: 4500
---

# Game Start Skill

Orchestration entry point for the CoreZ AI Game Studio. Analyzes game request, sizes complexity, provisions the correct agent team, and produces a task graph for execution.

---

## 1. Complexity Sizing Guide

### SMALL (3-4 agents, 1-2 hours implementation)

**Criteria** (must satisfy ALL):
- Single-screen or auto-scrolling level (no camera control)
- 1-3 mechanics (e.g., tap to jump, dodge obstacles)
- No enemy AI (static obstacles or simple patterns only)
- No level progression (endless or single level)
- No save/load state
- No multiplayer/network
- Max 1 asset sheet / sprite set

**Examples:** match-3, endless runner, simple puzzle, clicker, breakout clone

**Agents needed:**
| Role | Agent | Mode |
|------|-------|------|
| Creative Director | deepseek-v4-flash | read-only advisory |
| Lead Programmer | deepseek-v4-flash | implement |
| UI Programmer | deepseek-v4-flash | implement |
| QA Tester | deepseek-v4-flash | test |

### MEDIUM (5-7 agents, 3-6 hours implementation)

**Criteria** (satisfies ANY 4+):
- Scrolling or hub-based levels
- 3-6 mechanics (jump, attack, dash, collect, interact, die/respawn)
- Basic enemy AI (patrol, chase, shoot patterns)
- 3-5 levels with progression
- Score tracking and high score display
- 2-3 asset sheets / tilemaps
- Audio (procedural or pre-made)
- Touch + keyboard controls

**Examples:** 2D platformer, top-down adventure, word game with dictionary, tower defense (few waves), basic shooter

**Agents needed:**
| Role | Agent | Mode |
|------|-------|------|
| Creative Director | deepseek-v4-flash | read-only advisory |
| Game Designer | deepseek-v4-flash | spec writer |
| Lead Programmer | deepseek-v4-flash | implement |
| UI Programmer | deepseek-v4-flash | implement |
| Art Director | flux-1-schnell | asset generation |
| Technical Artist | deepseek-v4-flash | asset integration |
| QA Tester | deepseek-v4-flash | test |

### LARGE (8+ agents, 8+ hours implementation)

**Criteria** (satisfies ANY 5+):
- Open world or large interconnected map
- 7+ mechanics with ability unlocks
- Complex enemy AI (state machines, boss phases)
- 10+ levels or procedural generation
- Inventory, upgrades, skill trees
- Persistent save/load system
- Multiplayer (local or networked)
- 5+ asset sheets / sprite animations
- Cutscenes or narrative branching
- Audio system with SFX + music tracks

**Examples:** RPG, strategy game, multiplayer arena, metroidvania, rhythm game with custom maps

**Agents needed:**
| Role | Agent | Mode |
|------|-------|------|
| Producer | deepseek-v4-flash | orchestration lead |
| Creative Director | deepseek-v4-flash | read-only |
| Game Designer | deepseek-v4-flash | spec |
| Lead Programmer | deepseek-v4-flash | architecture + core |
| UI Programmer | deepseek-v4-flash | HUD/menus |
| Art Director | flux-1-schnell | backgrounds/assets |
| Technical Artist | deepseek-v4-flash | sprite pipeline |
| Physics Advisor | deepseek-v4-flash | read-only advisory |
| QA Tester | deepseek-v4-flash | test |
| Code Reviewer | deepseek-v4-flash | read-only review |

---

## 2. Role Provisioning Matrix

| Role | Authority | SMALL | MEDIUM | LARGE | Default Mode |
|------|-----------|-------|--------|-------|-------------|
| Producer | Coordinator | - | - | required | implement |
| Creative Director | Vision | advisory | advisory | advisory | read-only |
| Game Designer | Spec | - | write | write | implement |
| Lead Programmer | Architecture | required | required | required | implement |
| UI Programmer | HUD/UX | required | required | required | implement |
| Art Director | Visual | - | generate | generate | implement |
| Technical Artist | Assets | - | integrate | integrate | implement |
| Physics Advisor | Math | - | - | advisory | read-only |
| QA Tester | Testing | required | required | required | implement |
| Code Reviewer | Quality | - | - | review | read-only |

**Rules:**
- Never assign a role without a concrete task for it
- QA Tester is always required (even SMALL games need smoke tests)
- Creative Director is always read-only (never edits files)
- Physics Advisor only activates for games with velocity, acceleration, collision response, or spatial queries
- Art Director uses flux-1-schnell for background generation, NOT for sprites (sprites are SVG by Technical Artist)

---

## 3. Workflow Initiation Checklist

Before producing the task graph, complete ALL steps:

### Input Analysis
- [ ] Read the user's game request in full
- [ ] Identify explicit requirements (genre, features, platform)
- [ ] Identify implicit constraints (browser-based, single-player, free-to-play)
- [ ] Note any technical restrictions (no WebGL, mobile-first, keyboard-only)

### Complexity Sizing
- [ ] Count mechanics (each verb = 1 mechanic)
- [ ] Count levels / screens
- [ ] Identify enemy AI complexity (none, pattern, state machine)
- [ ] Check for persistence needs (score only, full save, cloud)
- [ ] Check for multiplayer requirements
- [ ] Apply sizing criteria from section 1
- [ ] Assign complexity label: SMALL / MEDIUM / LARGE

### Team Provisioning
- [ ] Select roles from provisioning matrix (section 2)
- [ ] Assign agents to roles
- [ ] Set mode for each (implement vs read-only)
- [ ] Verify no role is double-booked
- [ ] Verify file ownership: no two agents edit the same source file

### Task Graph Preparation
- [ ] Break work into sequential phases (spec -> design -> core -> UI -> assets -> integration -> test -> review)
- [ ] Identify parallelizable tasks (assets + core can happen concurrently)
- [ ] Order dependencies correctly (spec before implement, tests after implementation)
- [ ] Assign each task to exactly one agent
- [ ] Set acceptance criteria for each task

### Entry Criteria (must be true to start)
- [ ] User has provided a clear game request (title + genre + 2-3 sentences)
- [ ] Repository is on `main` branch (abort if not)
- [ ] Working directory has write permissions
- [ ] Node.js / Python / required runtime is available (check version)
- [ ] No uncommitted work that would conflict with game files

### Exit Criteria (must be true to finish)
- [ ] game-spec.json is written and validated
- [ ] All tasks in task graph are marked COMPLETE
- [ ] At least one passing test exists (smoke or unit)
- [ ] Lint passes (or explicit waiver documented)
- [ ] Game runs in browser without console errors
- [ ] No regressions in existing functionality

---

## 4. Output: Task Graph and Role Assignments

Produce this output in structured YAML format:

```yaml
complexity: "SMALL"  # or MEDIUM | LARGE
estimated_hours: "1-2"  # per complexity: SMALL 1-2, MEDIUM 3-6, LARGE 8+

team:
  - role: "Lead Programmer"
    agent: "deepseek-v4-flash"
    mode: "implement"
    tasks:
      - "Set up project structure and build config"
      - "Implement core game loop and rendering"
      - "Implement player controls and physics"
  - role: "UI Programmer"
    agent: "deepseek-v4-flash"
    mode: "implement"
    tasks:
      - "Build HUD (score, health, pause button)"
      - "Implement start screen and game-over overlay"
  - role: "QA Tester"
    agent: "deepseek-v4-flash"
    mode: "implement"
    tasks:
      - "Write smoke tests for core loop"
      - "Verify controls work on keyboard and touch"

task_graph:
  phases:
    - name: "Specification"
      parallel: false
      tasks:
        - "Run game-brainstorm to refine vision"
        - "Run game-spec to produce game-spec.json"
    - name: "Implementation"
      parallel: true
      tasks:
        - "Core engine and game loop"
        - "Asset generation and integration"
        - "UI and HUD components"
    - name: "Verification"
      parallel: false
      tasks:
        - "Run game-smoke-test for DOM, canvas, and input smoke suite"
        - "Run game-qa-plan to extend coverage for new mechanics"
        - "Run game-regression to confirm no baseline failures"
        - "Run game-performance-review for frame-timing and memory audit"
        - "Run game-code-review for spec compliance and safety audit"
        - "Run lint (npm run lint)"
        - "Run game-release-check and obtain final signoff"
        - "Run game-publish (optional): distribution pages, press kit, launch posts"
        - "Fix any failures"

entry_criteria_met: true
exit_criteria_pending: []
```

---

## 5. Anti-Patterns

| Anti-Pattern | Why It Fails | Correct Approach |
|---|---|---|
| **Over-provisioning** | Assigning 8 agents to a SMALL game creates overhead and context thrash | Use the provisioning matrix exactly; never exceed it |
| **Under-provisioning** | Skipping QA Tester speeds up dev but ships broken games | QA Tester is always required, even for SMALL |
| **Parallel write conflicts** | Two agents editing the same file causes merge hell | Enforce file ownership: one source file, one agent |
| **Missing exit criteria** | Marking done without empirical verification | Run tests, lint, and open the game in browser before signoff |
| **Skipping spec phase** | Starting implementation without a validated spec leads to rework | Do NOT start implementation until game-spec.json is written and validated |
| **Unclear authority** | Everyone thinks they can veto design decisions | Creative Director has final say on vision; Lead Programmer has final say on architecture |
