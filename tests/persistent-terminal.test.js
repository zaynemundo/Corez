import { describe, it, expect, afterAll } from 'vitest';
import { PersistentTerminalManager, createPersistentCommandTool } from '../packages/agent-core/terminal/PersistentTerminalManager.js';
import { ToolRegistry } from '../packages/agent-core/tools/index.js';

const isWin = process.platform === 'win32';

describe('PersistentTerminalManager & exec_persistent_command Tool', () => {
  let manager;

  afterAll(() => {
    if (manager) manager.disposeAll();
  });

  it('preserves environment variables and directory state across multiple commands', async () => {
    manager = new PersistentTerminalManager();

    // 1. Export variable
    const setCmd = isWin ? '$env:MY_VAR="COREZ_AI_VAL"' : 'export MY_VAR="COREZ_AI_VAL"';
    const r1 = await manager.runCommand('test_term', setCmd);
    expect(r1.success).toBe(true);

    // 2. Read variable in subsequent command
    const getCmd = isWin ? 'Write-Output "VAL:$env:MY_VAR"' : 'echo "VAL:$MY_VAR"';
    const r2 = await manager.runCommand('test_term', getCmd);
    expect(r2.success).toBe(true);
    expect(r2.stdout).toContain('VAL:COREZ_AI_VAL');

    // 3. Mathematical calculation
    const mathCmd = isWin ? 'Write-Output (20 + 22)' : 'echo $((20 + 22))';
    const r3 = await manager.runCommand('test_term', mathCmd);
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
    const setAlpha = isWin ? '$env:ALPHA_ID="111"' : 'export ALPHA_ID=111';
    const setBeta = isWin ? '$env:BETA_ID="222"' : 'export BETA_ID=222';
    await manager.runCommand('term_alpha', setAlpha);
    await manager.runCommand('term_beta', setBeta);

    const getAlpha = isWin ? 'Write-Output "ID:$env:ALPHA_ID"' : 'echo $ALPHA_ID';
    const resA = await manager.runCommand('term_alpha', getAlpha);
    const resB = await manager.runCommand('term_beta', getAlpha);

    expect(resA.stdout).toContain(isWin ? 'ID:111' : '111');
    expect(resB.stdout).not.toContain(isWin ? 'ID:111' : '111');
  });
});
