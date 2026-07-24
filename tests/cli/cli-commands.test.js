import { describe, it, expect } from 'vitest';
import { runCli } from '../../packages/cli/src/cli.js';

describe('CLI Command Execution & Routing', () => {
  it('executes corez status without errors', async () => {
    const code = await runCli(['status']);
    expect(code).toBe(0);
  });

  it('executes corez models without errors', async () => {
    const code = await runCli(['models']);
    expect(code).toBe(0);
  });

  it('executes corez agents without errors', async () => {
    const code = await runCli(['agents']);
    expect(code).toBe(0);
  });

  it('executes corez plan "add Stripe" without errors', async () => {
    const code = await runCli(['plan', 'add Stripe']);
    expect(code).toBe(0);
  });

  it('executes corez build "create dashboard" without errors', async () => {
    const code = await runCli(['build', 'create dashboard']);
    expect(code).toBe(0);
  });

  it('executes corez fix without errors', async () => {
    const code = await runCli(['fix']);
    expect(code).toBe(0);
  });

  it('executes corez review without errors', async () => {
    const code = await runCli(['review']);
    expect(code).toBe(0);
  });

  it('executes corez swarm "build a game" without errors', async () => {
    const code = await runCli(['swarm', 'build a game']);
    expect(code).toBe(0);
  });

  it('executes direct prompt corez "inspect workspace" without errors', async () => {
    const code = await runCli(['inspect workspace']);
    expect(code).toBe(0);
  });
});
