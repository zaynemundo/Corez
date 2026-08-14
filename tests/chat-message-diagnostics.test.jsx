// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ChatMessage from '../src/components/ChatMessage.jsx';

afterEach(() => {
  cleanup();
});

describe('ChatMessage harness diagnostics footer', () => {
  it('renders a compact generation summary when harness diagnostics are attached', () => {
    render(<ChatMessage message={{
      role: 'assistant',
      content: 'Here is your game.',
      diagnostics: {
        harness: {
          repairRounds: 2,
          verification: { passed: true, failures: [] },
          approved: true,
          reviewSkipped: false,
          reviewInconclusive: false,
          model: 'deepseek-v4-flash'
        }
      }
    }} />);

    const meta = screen.getByText(/verified · 2 repairs · review approved · deepseek-v4-flash/);
    expect(meta).toBeInTheDocument();
  });

  it('renders honest flags for skipped reviews and remaining issues', () => {
    render(<ChatMessage message={{
      role: 'assistant',
      content: 'Here is your game.',
      diagnostics: {
        harness: {
          repairRounds: 3,
          verification: { passed: false, failures: [{ code: 'missing-spec-features', detail: 'x' }] },
          approved: false,
          reviewSkipped: true,
          reviewInconclusive: false,
          model: 'deepseek-v4-flash'
        }
      }
    }} />);

    const meta = screen.getByText(/1 issue\(s\) flagged · 3 repairs · review skipped · deepseek-v4-flash/);
    expect(meta).toBeInTheDocument();
  });

  it('renders nothing for messages without harness diagnostics', () => {
    const { container } = render(<ChatMessage message={{ role: 'assistant', content: 'plain answer' }} />);
    expect(container.querySelectorAll('.message-wrapper .message-body > div').length).toBeGreaterThan(0);
    expect(screen.queryByText(/review approved/)).not.toBeInTheDocument();
    expect(screen.queryByText(/verified/)).not.toBeInTheDocument();
  });
});
