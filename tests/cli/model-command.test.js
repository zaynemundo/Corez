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

  it('switches active model cleanly when the approved model ID is provided', async () => {
    const res = await handleModelCommand(['muse-spark-1.3-contributor'], { cwd: process.cwd() }, {
      banner: () => {},
      status: () => {},
      success: () => {},
      error: () => {}
    });

    expect(res.success).toBe(true);
    expect(res.model).toBe('muse-spark-1.3-contributor');

    const config = loadCorezConfig(process.cwd());
    expect(config.model).toBe('muse-spark-1.3-contributor');
  });

  it('rejects every text model outside the single-model allow-list', async () => {
    // CoreZ is pinned to Muse Spark 1.3 Contributor; the catalog exposes no second
    // text model, so switching attempts must fail loudly rather than silently
    // routing text traffic elsewhere.
    for (const rejected of ['kimi-k3', 'deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4.1-flash']) {
      const res = await handleModelCommand([rejected], { cwd: process.cwd() }, {
        banner: () => {},
        status: () => {},
        success: () => {},
        error: () => {}
      });
      expect(res.success, `${rejected} must be rejected`).toBe(false);
      expect(res.model).toBe('muse-spark-1.3-contributor');
    }
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

  it('runs corez-code /model muse-spark-1.3-contributor via CLI router cleanly', async () => {
    const code = await runCli(['/model', 'muse-spark-1.3-contributor']);
    expect(code).toBe(0);
  });
});
