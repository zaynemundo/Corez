import { describe, expect, it } from 'vitest';
import { buildCommandEnv, runProcess } from '../../packages/agent-core/index.js';

describe('runProcess', () => {
  it('returns structured output and exit code', async () => {
    const result = await runProcess({
      file: process.execPath,
      args: ['-e', 'process.stdout.write("ok")'],
      cwd: process.cwd()
    });
    expect(result).toMatchObject({ exitCode: 0, stdout: 'ok', stderr: '' });
  });

  it('bounds captured output', async () => {
    const result = await runProcess({
      file: process.execPath,
      args: ['-e', 'process.stdout.write("x".repeat(100))'],
      cwd: process.cwd(),
      maxOutputBytes: 16
    });
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(16);
    expect(result.truncated).toBe(true);
  });

  it('throws a stable timeout error', async () => {
    await expect(runProcess({
      file: process.execPath,
      args: ['-e', 'setTimeout(() => {}, 1000)'],
      cwd: process.cwd(),
      timeoutMs: 10
    })).rejects.toMatchObject({ code: 'COMMAND_TIMEOUT' });
  });

  it('throws a stable cancellation error', async () => {
    const controller = new AbortController();
    const result = runProcess({
      file: process.execPath,
      args: ['-e', 'setTimeout(() => {}, 1000)'],
      cwd: process.cwd(),
      signal: controller.signal
    });
    controller.abort();
    await expect(result).rejects.toMatchObject({ code: 'COMMAND_CANCELLED' });
  });

  it('filters credentials from child-process environments', () => {
    const env = buildCommandEnv({
      PATH: '/usr/bin',
      HOME: '/home/test',
      OPENROUTER_API_KEY: 'secret',
      AWS_SECRET_ACCESS_KEY: 'secret',
      SAFE_VALUE: 'not-forwarded'
    });
    expect(env).toEqual({ PATH: '/usr/bin', HOME: '/home/test' });
  });
});
