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

  it('renders embedded email card inside a message with intro questions and outro text', () => {
    const complexMessage = `Got it — you want to request time off. To write the email properly, I need a couple of specifics:

What dates do you plan to be out? (start and end dates, or total number of days)
Is there a reason you want to include? (e.g., vacation, personal, family event — optional but often helpful)
Do you need to mention anything about coverage? (e.g., "I'll make sure my tasks are covered" or "I've asked [Name] to handle urgent items")
If you don't have all of that yet, here's a clean template you can fill in right away:

Subject: Time Off Request – [Your Name]

To: [Boss's Name]

Hi [Boss's Name],

I would like to request time off from [start date] to [end date] (or [number] days on [specific date(s)]). The reason is [vacation / personal / family event – optional].

I’ll make sure my current tasks are up to date before I leave, and I can arrange coverage for any urgent items while I'm out.

Please let me know if this works or if you need any more details.

Best regards,

[Your Name]

If you give me the dates and any other details, I’ll tailor it exactly to your situation.`;

    render(<ChatMessage message={{ role: 'assistant', content: complexMessage }} />);

    // Intro text is rendered in markdown
    expect(screen.getByText(/Got it — you want to request time off/)).toBeInTheDocument();
    expect(screen.getByText(/If you don't have all of that yet/)).toBeInTheDocument();

    // Email card is rendered
    expect(document.querySelector('.markdown-email-wrapper')).not.toBeNull();
    expect(document.querySelector('.email-subject').textContent).toContain('Time Off Request – [Your Name]');
    expect(document.querySelector('.email-recipients-value').textContent).toContain("[Boss's Name]");
    expect(screen.getByText(/I would like to request time off/)).toBeInTheDocument();

    // Outro text is rendered
    expect(screen.getByText(/If you give me the dates and any other details/)).toBeInTheDocument();
  });
});
