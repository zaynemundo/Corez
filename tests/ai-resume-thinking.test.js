import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateHostedAIResponse } from '../src/services/aiService.js';

describe('client continuation thinking', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the cached reasoning as the resumeThinking field', async () => {
    let requestBody = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        requestBody = JSON.parse(init.body);
        return Response.json({
          content:
            'This is the continued answer. It explains the scene in a complete and useful way for the user.',
          provider: 'opencode-go',
          model: 'opencode:deepseek-v4.1-flash',
        });
      }),
    );

    const result = await generateHostedAIResponse(
      'Continue building the black hole scene.',
      {
        type: 'explanation',
        primaryIntent: 'general_question',
        summary: 'Continue the interrupted answer.',
        confidence: 1,
      },
      [],
      null,
      { stream: false, resumeThinking: 'Prior reasoning about the accretion disk.' },
    );

    expect(result).toContain('continued answer');
    expect(requestBody?.resumeThinking).toBe(
      'Prior reasoning about the accretion disk.',
    );
  });
});
