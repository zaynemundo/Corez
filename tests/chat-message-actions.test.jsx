// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ChatMessage from '../src/components/ChatMessage.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ChatMessage response actions', () => {
  it('offers a visible copy action and copies the complete response', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });
    const content = 'Subject: What is a dragon?\n\nA dragon is a legendary creature.';

    render(<ChatMessage message={{ role: 'assistant', content }} />);

    const copyButton = screen.getByRole('button', { name: 'Copy response' });
    expect(copyButton).toBeInTheDocument();

    fireEvent.click(copyButton);

    expect(writeText).toHaveBeenCalledWith(content);
    expect(screen.getByRole('button', { name: 'Response copied' })).toBeInTheDocument();
  });
});
