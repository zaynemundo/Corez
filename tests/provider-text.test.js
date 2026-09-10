import { describe, it, expect } from 'vitest';
import {
  createThinkingStreamFilter,
  extractContentText,
  stripThinkingBlocks,
} from '../packages/agent-core/providers/text.js';

describe('stripThinkingBlocks', () => {
  it('removes closed think/thinking blocks and trims the result', () => {
    expect(stripThinkingBlocks('Visible <thinking>hidden</thinking>answer')).toBe(
      'Visible answer',
    );
    expect(stripThinkingBlocks('<think a="1">hidden</think>Visible')).toBe(
      'Visible',
    );
  });

  it('drops everything after an unclosed thinking marker', () => {
    expect(stripThinkingBlocks('Answer first<thinking>never closed')).toBe(
      'Answer first',
    );
    // A longer word that merely starts with "think" is not a tag.
    expect(stripThinkingBlocks('Answer<thinker>')).toBe('Answer<thinker>');
  });

  it('passes plain text through and handles non-strings', () => {
    expect(stripThinkingBlocks('hello')).toBe('hello');
    expect(stripThinkingBlocks(null)).toBe('');
    expect(stripThinkingBlocks(undefined)).toBe('');
  });
});

describe('extractContentText', () => {
  it('flattens multimodal content parts and passes strings through', () => {
    expect(extractContentText('plain')).toBe('plain');
    expect(
      extractContentText([
        { type: 'text', text: 'Hello ' },
        { type: 'image_url', image_url: { url: 'https://x/y.png' } },
        { type: 'text', text: 'world' },
      ]),
    ).toBe('Hello world');
    expect(extractContentText(null)).toBe('');
  });
});

describe('createThinkingStreamFilter', () => {
  it('strips a block whose tags are split across chunks', () => {
    const filter = createThinkingStreamFilter();
    let out = filter.push('Hello <thi');
    out += filter.push('nk>secret</thi');
    out += filter.push('nk>world');
    out += filter.flush();
    expect(out).toBe('Hello world');
  });

  it('handles multiple consecutive blocks', () => {
    const filter = createThinkingStreamFilter();
    let out = filter.push('A<think>1</think>B');
    out += filter.push('<thinking>2</thinking>C');
    out += filter.flush();
    expect(out).toBe('ABC');
  });

  it('swallows an unclosed block and releases a held partial tag on flush', () => {
    const unclosed = createThinkingStreamFilter();
    expect(unclosed.push('answer<thinking>cut off')).toBe('answer');
    expect(unclosed.flush()).toBe('');

    const heldTag = createThinkingStreamFilter();
    expect(heldTag.push('a <th')).toBe('a ');
    expect(heldTag.flush()).toBe('<th');
  });

  it('does not swallow ordinary markup that starts with th', () => {
    const filter = createThinkingStreamFilter();
    expect(filter.push('<th') + filter.push('ead>ok')).toBe('<thead>ok');
  });
});
