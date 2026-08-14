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

  it('keeps generic game creation style-neutral', async () => {
    const enhanced = await improveCodingPrompt('Build a playable chess game', {
      type: 'app',
      primaryIntent: 'game_creation'
    });

    expect(enhanced).toContain('without defaulting to retro or pixel art');
    expect(enhanced).not.toContain('8-bit retro pixel art style for visuals');
  });

  it('preserves an explicitly requested retro game style', async () => {
    const raw = 'Build an 8-bit retro platformer game';
    const enhanced = await improveCodingPrompt(raw, {
      type: 'app',
      primaryIntent: 'game_creation'
    });

    expect(enhanced).toContain(raw);
    expect(enhanced).toContain('preserve any visual style explicitly requested by the user');
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

  it('defaults app builds to multi-page output', async () => {
    const enhanced = await improveCodingPrompt('Build me a website for a bakery', { type: 'app' });
    expect(enhanced).toContain('MULTI-PAGE BY DEFAULT');
    expect(enhanced).toContain('<!-- PAGE: index.html -->');
    expect(enhanced).not.toContain('ONE-SHOT MODE');
  });

  it('produces a single page only when the user asks for oneshot', async () => {
    const enhanced = await improveCodingPrompt('Build me a oneshot website for a bakery', { type: 'app' });
    expect(enhanced).toContain('ONE-SHOT MODE');
    expect(enhanced).not.toContain('MULTI-PAGE BY DEFAULT');
  });

  it('produces a single HTML page when oneshot is combined with plain HTML', async () => {
    const enhanced = await improveCodingPrompt('Build a one shot landing page in plain HTML and CSS', { type: 'app' });
    expect(enhanced).toContain('ONE-SHOT MODE');
    expect(enhanced).not.toContain('MULTI-PAGE BY DEFAULT');
  });

  it('leaves non-coding prompts (writing/explanation/general) intact', async () => {
    const raw = 'Explain edge computing in simple words';
    const enhanced = await improveCodingPrompt(raw, { type: 'explanation' });

    expect(enhanced).toBe(raw);
  });
});
