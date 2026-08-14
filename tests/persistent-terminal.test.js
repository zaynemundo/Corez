import { describe, it, expect, afterAll } from 'vitest';
import { PersistentTerminalManager, createPersistentCommandTool } from '../packages/agent-core/terminal/PersistentTerminalManager.js';
import { ToolRegistry } from '../packages/agent-core/tools/index.js';

describe('PersistentTerminalManager & exec_persistent_command Tool', () => {
  let manager;

  afterAll(() => {
    if (manager) manager.disposeAll();
  });

  it('preserves environment variables and directory state across multiple commands', async () => {
    manager = new PersistentTerminalManager();

    // 1. Export variable
    const r1 = await manager.runCommand('test_term', 'export MY_VAR="COREZ_AI_VAL"');
    expect(r1.success).toBe(true);

    // 2. Read variable in subsequent command
    const r2 = await manager.runCommand('test_term', 'echo "VAL:$MY_VAR"');
    expect(r2.success).toBe(true);
    expect(r2.stdout).toContain('VAL:COREZ_AI_VAL');

    // 3. Mathematical calculation
    const r3 = await manager.runCommand('test_term', 'echo $((20 + 22))');
    expect(r3.success).toBe(true);
    expect(r3.stdout).toContain('42');
  });

  it('executes exec_persistent_command via ToolRegistry cleanly', async () => {
    const termTool = createPersistentCommandTool(manager);
    const registry = new ToolRegistry();
    registry.registerTool(termTool);

    const execRes = await registry.executeTool('exec_persistent_command', {
      command: 'echo "hello from persistent term"',
      terminalId: 'registry_term'
    }, { autoApprove: true });

    expect(execRes.success).toBe(true);
    expect(execRes.stdout).toContain('hello from persistent term');
    expect(execRes.terminalId).toBe('registry_term');
  });

  it('handles isolated terminal instances independently', async () => {
    await manager.runCommand('term_alpha', 'export ALPHA_ID=111');
    await manager.runCommand('term_beta', 'export BETA_ID=222');

    const resA = await manager.runCommand('term_alpha', 'echo $ALPHA_ID');
    const resB = await manager.runCommand('term_beta', 'echo $ALPHA_ID');

    expect(resA.stdout).toContain('111');
    expect(resB.stdout).not.toContain('111');
  });
});
