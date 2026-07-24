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
});
