import { describe, it, expect } from 'vitest';
import { CompactionEngine } from '../packages/agent-core/context/CompactionEngine.js';

describe('CompactionEngine', () => {
  it('estimates token usage across message formats', () => {
    const engine = new CompactionEngine();
    const messages = [
      { role: 'system', content: 'You are an AI assistant.' },
      { role: 'user', content: 'Hello world' }
    ];
    const tokens = engine.estimateTokens(messages);
    expect(tokens).toBeGreaterThan(5);
    expect(tokens).toBeLessThan(50);
  });

  it('detects when messages are not under pressure', () => {
    const engine = new CompactionEngine({ defaultContextLimit: 10000, thresholdRatio: 0.8 });
    const messages = [{ role: 'user', content: 'Short message' }];
    const status = engine.isUnderPressure(messages);

    expect(status.underPressure).toBe(false);
  });

  it('detects pressure when tokens exceed threshold', () => {
    const engine = new CompactionEngine({ defaultContextLimit: 100, thresholdRatio: 0.5 });
    const longContent = 'word '.repeat(100);
    const messages = [{ role: 'user', content: longContent }];
    const status = engine.isUnderPressure(messages);

    expect(status.underPressure).toBe(true);
  });

  it('compacts older conversation history into a structured checkpoint', async () => {
    const engine = new CompactionEngine({ retainTurns: 1 });
    const messages = [
      { role: 'system', content: 'You are CoreZ AI.' },
      { role: 'user', content: 'Build a game with player moving on canvas' },
      { role: 'assistant', content: 'Creating game engine...', tool_calls: [{ name: 'write_file', arguments: JSON.stringify({ filePath: 'src/game.js' }) }] },
      { role: 'user', content: 'Add obstacle collision' },
      { role: 'assistant', content: 'Updating physics...', tool_calls: [{ name: 'edit_file', arguments: JSON.stringify({ filePath: 'src/game.js' }) }] },
      { role: 'user', content: 'Add sound effects' },
      { role: 'assistant', content: 'Sound added.' }
    ];

    const result = await engine.compact(messages, { force: true });

    expect(result.compacted).toBe(true);
    expect(result.messages.length).toBeLessThan(messages.length);
    expect(result.messages[0].role).toBe('system');
    expect(result.messages[1].content).toContain('<compacted-summary>');
    expect(result.messages[1].content).toContain('src/game.js');
    // Recent turn preserved
    expect(result.messages[result.messages.length - 1].content).toBe('Sound added.');
  });

  it('supports custom asynchronous LLM summarizer function', async () => {
    const mockSummarizer = async (msgs) => `Custom AI summary of ${msgs.length} messages.`;
    const engine = new CompactionEngine({ retainTurns: 1, summarizer: mockSummarizer });

    const messages = [
      { role: 'system', content: 'You are CoreZ.' },
      { role: 'user', content: 'Turn 1' },
      { role: 'assistant', content: 'Reply 1' },
      { role: 'user', content: 'Turn 2' },
      { role: 'assistant', content: 'Reply 2' },
      { role: 'user', content: 'Turn 3' },
      { role: 'assistant', content: 'Reply 3' }
    ];

    const result = await engine.compact(messages, { force: true });
    expect(result.compacted).toBe(true);
    expect(result.summary).toBe('Custom AI summary of 4 messages.');
    expect(result.messages[1].content).toContain('Custom AI summary of 4 messages.');
  });
});
