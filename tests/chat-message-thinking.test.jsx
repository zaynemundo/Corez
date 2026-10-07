// @vitest-environment jsdom
//
// The live reasoning panel streams while the model works (App renders that
// one). This covers the persisted counterpart on the finished message: the
// thinking is available but collapsed, and it is never part of the answer.
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ChatMessage from '../src/components/ChatMessage.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function thinkingToggle() {
  return screen.getByRole('button', { name: /Thinking/i });
}

describe('ChatMessage thinking disclosure', () => {
  it('keeps the reasoning collapsed by default and reveals it on demand', () => {
    render(
      <ChatMessage
        message={{
          role: 'assistant',
          content: 'The answer.',
          thinking: 'Step one, step two.',
        }}
      />,
    );

    expect(screen.getByText('The answer.')).toBeInTheDocument();
    const toggle = thinkingToggle();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Step one, step two.')).toBeNull();

    fireEvent.click(toggle);

    expect(screen.getByText('Step one, step two.')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders no disclosure when the message carries no reasoning', () => {
    render(
      <ChatMessage
        message={{ role: 'assistant', content: 'No thinking here.' }}
      />,
    );
    expect(
      screen.queryByRole('button', { name: /Thinking/i }),
    ).toBeNull();
  });

  it('never renders the reasoning inside the answer content', () => {
    render(
      <ChatMessage
        message={{
          role: 'assistant',
          content: 'ONLY THE ANSWER',
          thinking: 'SECRET REASONING',
        }}
      />,
    );

    fireEvent.click(thinkingToggle());

    const content = document.querySelector('.message-content');
    expect(content.textContent).toContain('ONLY THE ANSWER');
    expect(content.textContent).not.toContain('SECRET REASONING');
  });

  it('ignores a blank reasoning string instead of showing an empty panel', () => {
    render(
      <ChatMessage
        message={{ role: 'assistant', content: 'Answer.', thinking: '   ' }}
      />,
    );
    expect(
      screen.queryByRole('button', { name: /Thinking/i }),
    ).toBeNull();
  });
});
