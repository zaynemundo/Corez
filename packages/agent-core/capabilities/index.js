/* eslint-disable no-empty, no-unused-vars */
// Core capability bundle — DSH dsh-base parity
// Mounts all capability seams onto a HarnessContext as plugins.
// Each capability is a Service Definition / Provider / Consumer triple.

export { FsService } from './FsService.js';
export { ShellService } from './ShellService.js';
export { SubprocessService } from './SubprocessService.js';
export { TerminalService } from './TerminalService.js';
export { SubagentService } from './SubagentService.js';

import { FsService } from './FsService.js';
import { ShellService } from './ShellService.js';
import { SubprocessService } from './SubprocessService.js';
import { TerminalService } from './TerminalService.js';
import { SubagentService } from './SubagentService.js';
import { PersistentTerminalManager } from '../terminal/PersistentTerminalManager.js';

// DSH: everything is a plugin. This bundle is the "dsh-base" layer.
// It registers fs/shell/subprocess/terminals/subagents/llm/compaction/todo/skill plugins
// onto the provided HarnessContext. Each registration is an effect (disposer).

export function registerCoreCapabilities(ctx, options = {}) {
  const cwd = options.cwd || process.cwd();
  const eventBus = ctx.eventBus;

  // 1. FS seam (ctx.fs)
  if (!ctx.get('fs')) {
    const fsService = new FsService({ eventBus, cwd, policy: options.fsPolicy || 'workspace' });
    ctx.registerService('fs', fsService);
  }

  // 2. Subprocess seam (ctx.subprocess) — must be before shell (shell uses subprocess)
  if (!ctx.get('subprocess')) {
    const subprocess = new SubprocessService({ eventBus, cwd, sandbox: ctx.get('sandbox') || null });
    ctx.registerService('subprocess', subprocess);
  }

  // 3. Shell seam (ctx.shell) — local provider spawns through ctx.subprocess
  if (!ctx.get('shell')) {
    const shell = new ShellService({ eventBus, cwd, subprocess: ctx.get('subprocess') });
    ctx.registerService('shell', shell);
  }

  // 4. Terminal seam (ctx.terminals) — persistent sessions
  if (!ctx.get('terminals')) {
    const terminals = new TerminalService({ eventBus, cwd, manager: options.terminalManager || new PersistentTerminalManager() });
    ctx.registerService('terminals', terminals);
  }

  // 5. Subagent seam (ctx.subagents) — fork-in-process provider
  if (!ctx.get('subagents')) {
    const subagents = new SubagentService({ eventBus, sessionManager: ctx.get('sessions'), harness: options.harness || null, cwd });
    ctx.registerService('subagents', subagents);
  }

  // 6. Todo seam — todo/write whole-list replacement, projection via SessionLog
  // DSH: todo_write tool + `todos` projection (last-write-wins, cleared on turn/start)
  // Our TodoTracker already does whole-list; we wire it to SessionLog if available.
  // Register as plugin so `ctx.effect` can dispose.
  ctx.effect((c) => {
    // When todo_write is called, also append to SessionLog (model-visible => logged)
    const tools = c.get('tools');
    if (!tools) return;
    // wrap todo_write execute to also log session event (best-effort)
    const todoTool = tools.getTool('todo_write');
    if (todoTool && !todoTool._wrappedForSession) {
      const orig = todoTool.execute.bind(todoTool);
      todoTool.execute = async (args, ropts) => {
        const res = await orig(args, ropts);
        // also log to session if taskId available
        if (ropts.taskId && c.get('sessions')) {
          const sessionId = ropts.taskId;
          const log = c.getSessionLog ? c.getSessionLog(sessionId) : null;
          if (log) {
            try {
              // DSH: todo/write is whole-list snapshot, last-write-wins
              const todos = args.todos || args.items || [];
              log.append('todo/write', { todos }, { ignorable: true });
            } catch {}
          }
        }
        return res;
      };
      todoTool._wrappedForSession = true;
    }
  });

  // 7. Skill seam — ctx.skills registry (rank-merged) — already mounted as SkillRegistry
  // No extra wiring needed; the ToolRegistry's skill tool already uses SkillRegistry.

  // 8. Compaction seam — ctx.compaction (provider + tool pruner)
  // Our CompactionEngine already does model-free pruning; wire as capability
  if (!ctx.get('compaction')) {
    // simple provider that delegates to existing CompactionEngine if present
    const engine = options.compactionEngine || null;
    if (engine) ctx.registerService('compaction', engine);
  }

  // 9. Guard seam — loop-hygiene + tool-timeout plugins
  ctx.effect((c) => {
    const tools = c.get('tools');
    if (!tools || tools._guardInstalled) return;
    tools._guardInstalled = true;
    // DSH: guard registers monotonic guard after pre-execute waterfall
    // Our VerificationGate is the user-facing guard; loop-hygiene would add more
    // (e.g., repeat tool guard is already in ToolRegistry)
  });

  // 10. Sandbox seam — no-op provider unless configured
  if (!ctx.get('sandbox')) {
    // DSH: sandbox wraps argv before spawning; we provide a no-op that passes through
    ctx.registerService('sandbox', { wrap: (argv) => argv });
  }

  return () => {};
}

// DSH bundle definitions for ProfileRegistry (so `dsh-base` etc. can be inspected)
export const DSH_BUNDLES = {
  base: ['fs', 'subprocess', 'shell', 'terminals', 'subagents', 'todo', 'skill', 'compaction', 'guard', 'sandbox'],
  'web-app': ['fs', 'shell'],
  headless: [],
  agy: []
};
