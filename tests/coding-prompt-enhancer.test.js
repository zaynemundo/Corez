import { describe, it, expect } from 'vitest';
import { improveCodingPrompt } from '../src/services/aiService.js';

describe('Coding Prompt Enhancer', () => {
  it('enhances app/game creation prompts with production app specifications', async () => {
    const raw = 'Build a responsive chess game';
    const enhanced = await improveCodingPrompt(raw, { type: 'app' });

    expect(enhanced).toContain(raw);
    expect(enhanced.length).toBeGreaterThan(raw.length);
    expect(enhanced.toLowerCase()).toMatch(/single-file|react|playable|browser game|spec/i);
  });

  it('enhances code fix and debug prompts with root-cause and safe fix specifications', async () => {
    const raw = 'Fix React state update error in component';
    const enhanced = await improveCodingPrompt(raw, { type: 'code-help' });

    expect(enhanced).toContain(raw);
    expect(enhanced.length).toBeGreaterThan(raw.length);
    expect(enhanced.toLowerCase()).toMatch(/root cause|diagnosis|fix|inspect/i);
  });

  it('enhances prompts requesting explicit HTML/CSS/JS with HTML specification', async () => {
    const raw = 'Build a responsive calculator in plain HTML and CSS';
    const enhanced = await improveCodingPrompt(raw, { type: 'app' });

    expect(enhanced).toContain(raw);
    expect(enhanced.length).toBeGreaterThan(raw.length);
    expect(enhanced.toLowerCase()).toMatch(/html|css|javascript|visual|output/i);
  });

  it('leaves non-coding prompts (writing/explanation/general) intact', async () => {
    const raw = 'Explain edge computing in simple words';
    const enhanced = await improveCodingPrompt(raw, { type: 'explanation' });

    expect(enhanced).toBe(raw);
  });
});
