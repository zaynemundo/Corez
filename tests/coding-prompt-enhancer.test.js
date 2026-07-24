import { describe, it, expect } from 'vitest';
import { improveCodingPrompt } from '../src/services/aiService.js';

describe('Coding Prompt Enhancer', () => {
  it('enhances app/game creation prompts with production app specifications', () => {
    const raw = 'Build a responsive chess game';
    const enhanced = improveCodingPrompt(raw, { type: 'app' });

    expect(enhanced).toContain(raw);
    expect(enhanced).toContain('[ENHANCED CODING & APP SPECIFICATION]');
    expect(enhanced).toContain('Architecture & Functionality');
    expect(enhanced).toContain('Design System & UX');
  });

  it('enhances code fix and debug prompts with root-cause and safe fix specifications', () => {
    const raw = 'Fix React state update error in component';
    const enhanced = improveCodingPrompt(raw, { type: 'code-help' });

    expect(enhanced).toContain(raw);
    expect(enhanced).toContain('[ENHANCED CODE DIAGNOSIS & REFACTOR SPECIFICATION]');
    expect(enhanced).toContain('Root Cause Analysis');
    expect(enhanced).toContain('Safe Implementation');
  });

  it('leaves non-coding prompts (writing/explanation/general) intact', () => {
    const raw = 'Explain edge computing in simple words';
    const enhanced = improveCodingPrompt(raw, { type: 'explanation' });

    expect(enhanced).toBe(raw);
  });
});
