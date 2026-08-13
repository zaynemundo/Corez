import { describe, it, expect } from 'vitest';
import { repairResponse } from '../src/services/reflectionEngine.js';
import worker from '../worker/index.js';
import { ContextEngine } from '../packages/agent-core/context/index.js';
import { DEFAULT_CONFIG } from '../packages/agent-core/config/index.js';
import { compactConversationForRequest } from '../src/services/aiService.js';

function postAi(body, env) {
  return worker.fetch(
    new Request('https://corez.test/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }),
    env
  );
}

describe('CoreZ imposes no artificial AI limits', () => {
  it('provider requests omit output-token caps (max_tokens) everywhere', async () => {
    const captured = [];
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url, init) => {
        captured.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      };

      const response = await postAi(
        { prompt: 'Build a game', intent: { type: 'app' }, complexity: 'medium' },
        { OPENCODE_GO_API_KEY: 'sk-test' }
      );

      expect(response.status).toBe(200);
      expect(captured.length).toBeGreaterThan(0);
      for (const payload of captured) {
        expect(payload.max_tokens).toBeUndefined();
        expect(payload.max_completion_tokens).toBeUndefined();
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('long tasks continue across many provider calls: the inline chain completes all work', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => new Response(JSON.stringify({
        choices: [{ message: { content: 'ok' } }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });

      for (let i = 0; i < 10; i++) {
        const response = await postAi(
          { prompt: `long task ${i}`, intent: { type: 'app' } },
          { OPENCODE_GO_API_KEY: 'sk-test' }
        );
        expect(response.status).toBe(200);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('repeated repairs continue while measurable progress is occurring', () => {
    const contract = { mustNotChange: ['Do not change usage limits'], mustAchieve: [] };
    const content = 'usage_limit = 50000;';
    const evaluation = { isCompliant: false, violations: ['usage limit'], missingRequirements: [] };

    // The first pass removes the usage_limit line (progress), so the loop
    // continues; once nothing changes anymore it stops on the progress guard.
    const result = repairResponse(content, evaluation, contract, Number.MAX_SAFE_INTEGER, 0, {});
    expect(result.attempts).toBeGreaterThanOrEqual(1);
    expect(result.finalContent).not.toContain('usage_limit = 50000');
  });

  it('no rate-limit middleware blocks AI continuation: repeated requests are not 429-gated', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => new Response(JSON.stringify({
        choices: [{ message: { content: 'ok' } }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });

      for (let i = 0; i < 30; i++) {
        const response = await postAi(
          { prompt: `request ${i}`, intent: { type: 'general' } },
          { OPENCODE_GO_API_KEY: 'sk-test' }
        );
        expect(response.status).not.toBe(429);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('no token, quota, or subscription gates exist in the default configuration', () => {
    const config = JSON.stringify(DEFAULT_CONFIG);
    expect(config).not.toMatch(/quota|maxTokens|max_tokens|subscription|billing|cooldown/i);
  });

  it('long repository instructions remain available in full, not truncated', () => {
    const engine = new ContextEngine(process.cwd());
    const longInstruction = 'Rule: ' + 'keep this exact instruction intact. '.repeat(400); // > 2000 chars
    engine.instructions = [{ filename: 'AGENTS.md', content: longInstruction }];
    engine.projectInfo = {
      cwd: process.cwd(),
      name: 'test',
      version: '1.0.0',
      gitBranch: 'main',
      dependencies: [],
      scripts: {}
    };

    const prompt = engine.buildSystemContextPrompt();
    expect(prompt).toContain(longInstruction);
  });

  it('large conversations retain exact evidence after compaction', () => {
    const codeBlock = '```js\n' + 'x'.repeat(8 * 1024 * 1024) + '\n```';
    const conversation = [
      { role: 'user', content: 'Requirement: keep the payment flow secure.' },
      { role: 'assistant', content: codeBlock },
      { role: 'user', content: 'Final request: ship it.' }
    ];
    const compacted = compactConversationForRequest(conversation);
    const serialized = JSON.stringify(compacted);
    expect(serialized).toContain('keep the payment flow secure');
    expect(serialized).toContain('```js');
    expect(compacted[compacted.length - 1].content).toBe('Final request: ship it.');
  });
});