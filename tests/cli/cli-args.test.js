import { describe, it, expect } from 'vitest';
import { parseCliArgs } from '../../packages/cli/src/cli.js';

describe('CLI Argument Parsing', () => {
  it('parses empty arguments to defaults', () => {
    const { flags, positional } = parseCliArgs([]);
    expect(flags.help).toBe(false);
    expect(flags.version).toBe(false);
    expect(flags.verbose).toBe(false);
    expect(positional).toEqual([]);
  });

  it('detects --help and -h flags', () => {
    const res1 = parseCliArgs(['--help']);
    expect(res1.flags.help).toBe(true);

    const res2 = parseCliArgs(['-h']);
    expect(res2.flags.help).toBe(true);
  });

  it('detects --version and -v flags', () => {
    const res1 = parseCliArgs(['--version']);
    expect(res1.flags.version).toBe(true);

    const res2 = parseCliArgs(['-v']);
    expect(res2.flags.version).toBe(true);
  });

  it('collects positional command arguments and task prompts', () => {
    const { flags, positional } = parseCliArgs(['plan', 'add', 'stripe', 'subscriptions', '--verbose']);
    expect(flags.verbose).toBe(true);
    expect(positional).toEqual(['plan', 'add', 'stripe', 'subscriptions']);
  });

  it('rejects unknown flags and missing values', () => {
    expect(parseCliArgs(['--wat']).errors[0]).toContain('Unknown option');
    expect(parseCliArgs(['--model']).errors[0]).toContain('requires a value');
  });

  it('parses reliability flags', () => {
    const result = parseCliArgs([
      '--model', 'openrouter/deepseek-v4-flash',
      '--auto', '--mock', '--continue', '--json', '--yes'
    ]);
    expect(result.errors).toEqual([]);
    expect(result.flags).toMatchObject({
      model: 'openrouter/deepseek-v4-flash',
      autoApprove: true,
      mock: true,
      continue: true,
      json: true,
      yes: true
    });
  });

  it('rejects --continue together with --session', () => {
    expect(parseCliArgs(['--continue', '--session', 'abc']).errors[0])
      .toContain('cannot be used together');
  });
});
