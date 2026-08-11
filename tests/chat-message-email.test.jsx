// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ChatMessage from '../src/components/ChatMessage.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const EMAIL_CONTENT = 'Subject: Launch update\nTo: sarah@example.com\n\nHi Sarah,\n\nHere is the plan.';

describe('ChatMessage email card actions', () => {
  it('copies the full formatted email text and shows feedback', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });

    render(<ChatMessage message={{ role: 'assistant', content: EMAIL_CONTENT }} />);

    const copyButton = screen.getByRole('button', { name: 'Copy email' });
    fireEvent.click(copyButton);

    expect(writeText).toHaveBeenCalledWith(
      'Subject: Launch update\nTo: sarah@example.com\n\nHi Sarah,\n\nHere is the plan.'
    );
    expect(screen.getByRole('button', { name: 'Email copied' })).toBeInTheDocument();
  });

  it('opens edit mode and saves changes to the card', () => {
    render(<ChatMessage message={{ role: 'assistant', content: EMAIL_CONTENT }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit email' }));

    const subjectInput = screen.getByDisplayValue('Launch update');
    const bodyTextarea = screen.getByDisplayValue(/Here is the plan/);
    expect(subjectInput).toBeInTheDocument();

    fireEvent.change(subjectInput, { target: { value: 'Updated subject' } });
    fireEvent.change(bodyTextarea, { target: { value: 'New body text' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save email' }));

    expect(document.querySelector('.email-subject').textContent).toBe('Updated subject');
    expect(screen.getByText('New body text')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save email' })).toBeNull();
  });

  it('cancel restores the original email values', () => {
    render(<ChatMessage message={{ role: 'assistant', content: EMAIL_CONTENT }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit email' }));
    fireEvent.change(screen.getByDisplayValue('Launch update'), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing' }));

    expect(document.querySelector('.email-subject').textContent).toBe('Launch update');
  });

  it('send opens a mailto link prefilled with subject and body', () => {
    const hrefSetter = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, set href(v) { hrefSetter(v); } }
    });

    render(<ChatMessage message={{ role: 'assistant', content: EMAIL_CONTENT }} />);

    fireEvent.click(document.querySelector('.email-send-btn'));

    const url = hrefSetter.mock.calls[0][0];
    expect(url.startsWith('mailto:sarah@example.com?')).toBe(true);
    expect(url).toContain('subject=Launch%20update');
    expect(url).toContain('body=');
    expect(document.querySelector('.email-send-btn.sent')).not.toBeNull();
  });

  it('renders the send button as an icon only, with no share button', () => {
    render(<ChatMessage message={{ role: 'assistant', content: EMAIL_CONTENT }} />);

    const sendButton = document.querySelector('.email-send-btn');
    expect(sendButton).not.toBeNull();
    expect(sendButton.textContent.trim()).toBe('');
    expect(sendButton.querySelector('svg')).not.toBeNull();
    expect(sendButton.getAttribute('aria-label')).toBeNull();
    expect(document.querySelector('.email-icon-btn')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Share email' })).toBeNull();
  });
});
