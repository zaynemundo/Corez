import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
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

  it('returns an ordinary nonzero exit code without rejecting', async () => {
    const result = await runProcess({
      file: process.execPath,
      args: ['-e', 'process.exit(7)'],
      cwd: process.cwd()
    });
    expect(result.exitCode).toBe(7);
  });

  it('reports cancellation for a pre-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(runProcess({
      file: process.execPath,
      args: ['-e', 'process.exit(0)'],
      cwd: process.cwd(),
      signal: controller.signal
    })).rejects.toMatchObject({ code: 'COMMAND_CANCELLED' });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects an invalid timeout: %s', async timeoutMs => {
    await expect(runProcess({
      file: process.execPath,
      args: ['-e', 'process.exit(0)'],
      cwd: process.cwd(),
      timeoutMs
    })).rejects.toMatchObject({ code: 'TOOL_ARGUMENT_INVALID' });
  });

  it('requires an explicit working directory', async () => {
    await expect(runProcess({
      file: process.execPath,
      args: ['-e', 'process.exit(0)']
    })).rejects.toMatchObject({ code: 'TOOL_ARGUMENT_INVALID' });
  });

  it.skipIf(process.platform === 'win32')('forces termination when a POSIX child ignores SIGTERM', async () => {
    const startedAt = Date.now();
    await expect(runProcess({
      file: process.execPath,
      args: ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)'],
      cwd: process.cwd(),
      timeoutMs: 150
    })).rejects.toMatchObject({ code: 'COMMAND_TIMEOUT' });
    expect(Date.now() - startedAt).toBeLessThan(2_000);
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

  it('preserves safe built additions but filters raw child-process environments', async () => {
    const built = buildCommandEnv(
      { PATH: process.env.PATH },
      { SAFE_FLAG: 'kept', INTERNAL_TOKEN: 'secret' }
    );
    expect(built).toEqual({ PATH: process.env.PATH, SAFE_FLAG: 'kept' });

    const builtResult = await runProcess({
      file: process.execPath,
      args: ['-e', 'process.stdout.write(process.env.SAFE_FLAG || "missing")'],
      cwd: process.cwd(),
      env: built
    });
    expect(builtResult.stdout).toBe('kept');

    const result = await runProcess({
      file: process.execPath,
      args: ['-e', 'process.stdout.write(process.env.OPENROUTER_API_KEY || process.env.SAFE_FLAG || "filtered")'],
      cwd: process.cwd(),
      env: { PATH: process.env.PATH, OPENROUTER_API_KEY: 'secret', SAFE_FLAG: 'unapproved' }
    });
    expect(result.stdout).toBe('filtered');
  });

  it('continues forced termination after a child emits an error during SIGTERM', async () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    const signals = [];
    child.kill = signal => {
      signals.push(signal);
      if (signal === 'SIGTERM') {
        queueMicrotask(() => child.emit('error', new Error('SIGTERM delivery failed')));
      } else {
        queueMicrotask(() => child.emit('close', null, 'SIGKILL'));
      }
      return true;
    };

    await expect(runProcess({
      file: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      cwd: process.cwd(),
      timeoutMs: 10,
      spawnImpl: () => child
    })).rejects.toMatchObject({ code: 'COMMAND_TIMEOUT' });
    expect(signals).toEqual(['SIGTERM', 'SIGKILL']);
  });
});
