import { describe, it, expect } from 'vitest';
import { SLASH_COMMANDS } from '../../packages/cli/src/commands/chat.js';

describe('CLI Slash Command Suggestions', () => {
  it('defines all required slash commands in SLASH_COMMANDS list', () => {
    const commands = SLASH_COMMANDS.map(c => c.cmd);
    expect(commands).toContain('/model');
    expect(commands).toContain('/plan');
    expect(commands).toContain('/build');
    expect(commands).toContain('/fix');
    expect(commands).toContain('/review');
    expect(commands).toContain('/swarm');
    expect(commands).toContain('/clear');
    expect(commands).toContain('/help');
    expect(commands).toContain('/exit');
  });

  it('provides descriptions for each slash command', () => {
    for (const item of SLASH_COMMANDS) {
      expect(item.cmd).toMatch(/^\/[a-z]+$/);
      expect(item.desc).toBeDefined();
      expect(item.desc.length).toBeGreaterThan(5);
    }
  });
});
