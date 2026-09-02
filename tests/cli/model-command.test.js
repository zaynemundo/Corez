import { describe, it, expect } from 'vitest';
import { runCli } from '../../packages/cli/src/cli.js';
import { handleModelCommand } from '../../packages/cli/src/commands/model.js';
import { loadCorezConfig } from '../../packages/agent-core/index.js';

describe('/model CLI Command', () => {
  it('displays active model and available options when no model ID is provided', async () => {
    const res = await handleModelCommand([], { cwd: process.cwd() }, {
      banner: () => {},
      status: () => {},
      success: () => {},
      error: () => {}
    });

    expect(res.success).toBe(true);
    expect(res.model).toBeDefined();
  });

  it('switches active model cleanly when valid model ID is provided', async () => {
    const res = await handleModelCommand(['kimi-k3'], { cwd: process.cwd() }, {
      banner: () => {},
      status: () => {},
      success: () => {},
      error: () => {}
    });

    expect(res.success).toBe(true);
    expect(res.model).toBe('kimi-k3');

    const config = loadCorezConfig(process.cwd());
    expect(config.model).toBe('kimi-k3');

    // Switch back to default muse-spark-1.3-contributor
    await handleModelCommand(['muse-spark-1.3-contributor'], { cwd: process.cwd() }, {
      banner: () => {},
      status: () => {},
      success: () => {},
      error: () => {}
    });
  });

  it('returns failure response when invalid model ID is passed', async () => {
    const res = await handleModelCommand(['non-existent-model'], { cwd: process.cwd() }, {
      banner: () => {},
      status: () => {},
      success: () => {},
      error: () => {}
    });

    expect(res.success).toBe(false);
  });

  it('runs corez-code model via CLI router cleanly', async () => {
    const code = await runCli(['model']);
    expect(code).toBe(0);
  });

  it('runs corez-code /model kimi-k3 via CLI router cleanly', async () => {
    const code = await runCli(['/model', 'muse-spark-1.3-contributor']);
    expect(code).toBe(0);
  });
});
