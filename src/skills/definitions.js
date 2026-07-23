/**
 * CoreZ Superpowers Skill Definitions
 * Standardized metadata definitions for Superpowers methodology skills and CoreZ specialist capabilities.
 * Source reference: obra/superpowers (MIT License)
 */

export const SUPERPOWERS_SKILLS = [
  {
    id: 'using-superpowers',
    name: 'Using Superpowers',
    description: 'Bootstrap & workflow engine entry point for engineering and application building.',
    triggers: ['build', 'develop', 'debug', 'create', 'fix', 'refactor', 'swarm'],
    phase: 'BOOTSTRAP',
    priority: 1,
    dependencies: [],
    compatibleIntents: ['app', 'code-help', 'swarm'],
    requiresTools: [],
    instructions: `Before answering or writing code for complex engineering tasks, analyze the intent, determine task type, resolve applicable skills, construct the workflow state machine, and execute each stage systematically.`
  },
  {
    id: 'brainstorming',
    name: 'Brainstorming & Specification',
    description: 'Socratic design refinement, requirements discovery, and specification formulation before coding.',
    triggers: ['new app', 'build me', 'dashboard', 'saas', 'game', 'prototype', 'design'],
    phase: 'BRAINSTORMING',
    priority: 10,
    dependencies: [],
    compatibleIntents: ['app', 'swarm'],
    requiresTools: [],
    instructions: `Step back before writing code. Clarify user objectives, outline visual and architectural design, explore trade-offs, and produce a clear, validated specification chunk by chunk.`
  },
  {
    id: 'writing-plans',
    name: 'Writing Implementation Plans',
    description: 'Decomposes approved specifications into granular, bite-sized tasks with exact file paths, expected outputs, and verification criteria.',
    triggers: ['plan', 'architecture', 'decompose', 'roadmap', 'spec ready'],
    phase: 'PLANNING',
    priority: 20,
    dependencies: ['brainstorming'],
    compatibleIntents: ['app', 'code-help', 'swarm'],
    requiresTools: [],
    instructions: `Break engineering work into granular tasks (2-5 minutes each). Specify target files, exact code requirements, verification steps, and dependency relationships (DAG format).`
  },
  {
    id: 'subagent-driven-development',
    name: 'Subagent Driven Development',
    description: 'Dispatches fresh subagents per task brief with isolated context and two-stage review gates.',
    triggers: ['multi-agent', 'subagents', 'parallel execution', 'large request', 'swarm'],
    phase: 'IMPLEMENTING',
    priority: 30,
    dependencies: ['writing-plans'],
    compatibleIntents: ['app', 'swarm', 'code-help'],
    requiresTools: [],
    instructions: `Dispatch isolated subagent execution calls using task briefs containing goal, constraints, relevant files, and verification goals. Avoid context contamination.`
  },
  {
    id: 'executing-plans',
    name: 'Executing Plans',
    description: 'Sequential or batched execution of implementation plan tasks with progress tracking and state updates.',
    triggers: ['execute plan', 'run tasks', 'build features'],
    phase: 'IMPLEMENTING',
    priority: 31,
    dependencies: ['writing-plans'],
    compatibleIntents: ['app', 'code-help', 'swarm'],
    requiresTools: [],
    instructions: `Execute plan tasks in DAG order. Track completion status in real-time, enforcing RED-GREEN-REFACTOR for each engineering task.`
  },
  {
    id: 'dispatching-parallel-agents',
    name: 'Dispatching Parallel Agents',
    description: 'Concurrently executes non-overlapping independent tasks across specialist agents.',
    triggers: ['parallel', 'concurrent', 'independent tasks', 'swarm'],
    phase: 'IMPLEMENTING',
    priority: 35,
    dependencies: ['subagent-driven-development'],
    compatibleIntents: ['swarm', 'app'],
    requiresTools: [],
    instructions: `Identify independent DAG nodes with no shared resource locks and dispatch them concurrently. Sequence dependent nodes.`
  },
  {
    id: 'systematic-debugging',
    name: 'Systematic Debugging',
    description: 'Disciplined 7-phase root-cause investigation process for bug reports and runtime failures.',
    triggers: ['bug', 'crash', 'error', 'fails', 'exception', 'stack trace', 'not working'],
    phase: 'IMPLEMENTING',
    priority: 15,
    dependencies: [],
    compatibleIntents: ['code-help'],
    requiresTools: [],
    instructions: `Follow 7-phase root cause process: 1. Root-cause investigation, 2. Pattern analysis, 3. Hypothesis, 4. Test, 5. Minimal fix, 6. Regression test, 7. Verification. Do not guess fixes randomly.`
  },
  {
    id: 'test-driven-development',
    name: 'Test-Driven Development (TDD)',
    description: 'Enforces strict RED-GREEN-REFACTOR cycle: failing test first, minimal implementation, passing test, refactor.',
    triggers: ['tdd', 'unit test', 'failing test', 'implement feature'],
    phase: 'IMPLEMENTING',
    priority: 40,
    dependencies: ['writing-plans'],
    compatibleIntents: ['app', 'code-help', 'swarm'],
    requiresTools: [],
    instructions: `Write failing test (RED), verify failure, write minimal code to satisfy test (GREEN), verify test passes, refactor code while keeping tests green.`
  },
  {
    id: 'requesting-code-review',
    name: 'Requesting Code Review',
    description: 'Runs two-stage review gate: specification compliance review and code-quality review.',
    triggers: ['review code', 'review gate', 'code quality', 'spec check'],
    phase: 'REVIEWING',
    priority: 50,
    dependencies: ['test-driven-development'],
    compatibleIntents: ['app', 'code-help', 'swarm'],
    requiresTools: [],
    instructions: `Evaluate implementation output against specification and code quality criteria (security, performance, maintainability, accessibility). Send critical issues to REPAIRING.`
  },
  {
    id: 'receiving-code-review',
    name: 'Receiving Code Review',
    description: 'Processes review feedback and executes minimal targeted repairs for critical findings.',
    triggers: ['repair', 'fix review finding', 'review feedback'],
    phase: 'REPAIRING',
    priority: 55,
    dependencies: ['requesting-code-review'],
    compatibleIntents: ['app', 'code-help', 'swarm'],
    requiresTools: [],
    instructions: `Address critical review findings with minimal corrective edits, re-run tests, and return to review gate.`
  },
  {
    id: 'verification-before-completion',
    name: 'Verification Before Completion',
    description: 'Mandatory gate requiring empirical evidence records (tests, exit codes, builds) before claiming completion.',
    triggers: ['verify completion', 'evidence gate', 'completion check'],
    phase: 'VERIFYING',
    priority: 60,
    dependencies: ['requesting-code-review'],
    compatibleIntents: ['app', 'code-help', 'swarm'],
    requiresTools: [],
    instructions: `No completion claim without empirical verification evidence records (command, exit code, test pass/fail counts). Explicitly report if tools were unavailable.`
  },
  {
    id: 'finishing-a-development-branch',
    name: 'Finishing a Development Branch',
    description: 'Final verification, clean up, and completion decision for verified development tasks.',
    triggers: ['finish branch', 'complete task', 'ship feature'],
    phase: 'COMPLETE',
    priority: 70,
    dependencies: ['verification-before-completion'],
    compatibleIntents: ['app', 'code-help', 'swarm'],
    requiresTools: ['git'],
    instructions: `Verify branch cleanliness, confirm pass baseline, summarize verification evidence, and finalize task deliverable.`
  }
];

export const COREZ_SPECIALIST_SKILLS = [
  {
    id: 'frontend-modern-design',
    name: 'Frontend Modern Design',
    description: 'High-aesthetic UI creation using modern typography, dark mode, HSL color palettes, and glassmorphism.',
    triggers: ['ui', 'modern design', 'css', 'landing page', 'dashboard ui'],
    phase: 'IMPLEMENTING',
    priority: 25,
    dependencies: [],
    compatibleIntents: ['app'],
    requiresTools: [],
    instructions: 'Create responsive, visually stunning web UI with dark modes, curated HSL color palettes, modern typography, and smooth CSS micro-interactions.'
  },
  {
    id: 'game-development',
    name: 'Game Development',
    description: '2D/3D web games, HTML5 Canvas engines, physics simulators, and word game dictionaries.',
    triggers: ['game', 'canvas game', 'arcade', 'snake', 'pong', 'wordle', 'scrabble'],
    phase: 'IMPLEMENTING',
    priority: 25,
    dependencies: [],
    compatibleIntents: ['app', 'swarm'],
    requiresTools: [],
    instructions: 'Build runnable single-file HTML5 canvas games with complete game loops, input management, collision detection, and asset integration.'
  },
  {
    id: 'visual-creative',
    name: 'Visual Creative Engine',
    description: 'Image generation via FLUX 1, visual asset manifests, and layout direction via MiMo V2.5.',
    triggers: ['image', 'art', 'background', 'sprite', 'visual asset'],
    phase: 'IMPLEMENTING',
    priority: 22,
    dependencies: [],
    compatibleIntents: ['app', 'swarm'],
    requiresTools: [],
    instructions: 'Formulate structured JSON asset manifests for visual requirements and invoke FLUX image generation where appropriate.'
  }
];
