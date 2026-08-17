// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ChatMessage, { ClarificationSuggestions, extractClarificationOptions, splitClarificationOptionLines, stripClarificationOptionLines } from '../src/components/ChatMessage.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const options = [
  { label: 'Dark mode', detail: 'A moody dark UI', text: 'Dark mode' },
  { label: 'Light mode', detail: 'A clean light UI', text: 'Light mode' },
  { label: 'Retro', detail: 'Pixel art style', text: 'Retro' }
];

describe('ClarificationSuggestions', () => {
  it('renders up to three suggestions plus the custom row', () => {
    render(<ClarificationSuggestions options={[...options, { label: 'Extra', text: 'Extra' }]} onSelectOption={() => {}} />);
    expect(screen.getByRole('option', { name: /Select: Dark mode/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Select: Retro/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Other: Type your own/ })).toBeInTheDocument();
    // 4 options exist but only the first 3 are shown until "Show all".
    expect(screen.queryByRole('option', { name: /Select: Extra/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show all 4 suggestions/ })).toBeInTheDocument();
  });

  it('expands to show all options via the Show all button', () => {
    render(<ClarificationSuggestions options={[...options, { label: 'Extra', text: 'Extra' }]} onSelectOption={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Show all 4 suggestions/ }));
    expect(screen.getByRole('option', { name: /Select: Extra/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument();
  });

  it('selects an option on click', () => {
    const onSelectOption = vi.fn();
    render(<ClarificationSuggestions options={options} onSelectOption={onSelectOption} />);
    fireEvent.click(screen.getByRole('option', { name: /Select: Dark mode/ }));
    expect(onSelectOption).toHaveBeenCalledWith('Dark mode');
  });

  it('navigates with arrow keys and selects with Enter', async () => {
    const user = userEvent.setup();
    const onSelectOption = vi.fn();
    render(<ClarificationSuggestions options={options} onSelectOption={onSelectOption} />);
    const first = screen.getByRole('option', { name: /Select: Dark mode/ });
    first.focus();
    await user.keyboard('{ArrowDown}');
    const second = screen.getByRole('option', { name: /Select: Light mode/ });
    expect(second).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    const third = screen.getByRole('option', { name: /Select: Retro/ });
    expect(third).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onSelectOption).toHaveBeenCalledWith('Retro');
  });

  it('wraps around and reaches the custom row with Home/End', async () => {
    const user = userEvent.setup();
    render(<ClarificationSuggestions options={options} onSelectOption={() => {}} />);
    const first = screen.getByRole('option', { name: /Select: Dark mode/ });
    first.focus();
    await user.keyboard('{End}');
    const other = screen.getByRole('button', { name: /Other: Type your own/ });
    expect(other).toHaveFocus();
    // Enter on the custom row opens the custom input instead of selecting.
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Type your custom response')).toBeInTheDocument();
  });

  it('submits a custom response', () => {
    const onSelectOption = vi.fn();
    render(<ClarificationSuggestions options={options} onSelectOption={onSelectOption} />);
    fireEvent.click(screen.getByRole('button', { name: /Other: Type your own/ }));
    const input = screen.getByLabelText('Type your custom response');
    fireEvent.change(input, { target: { value: 'Make it pink' } });
    fireEvent.submit(input.closest('form'));
    expect(onSelectOption).toHaveBeenCalledWith('Make it pink');
  });

  it('closes the custom input with Escape', () => {
    render(<ClarificationSuggestions options={options} onSelectOption={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Other: Type your own/ }));
    const input = screen.getByLabelText('Type your custom response');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByLabelText('Type your custom response')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Other: Type your own/ })).toBeInTheDocument();
  });
});

describe('stripClarificationOptionLines', () => {
  it('removes extracted bullet options so the card is not duplicated', () => {
    const content = `I'd be happy to write that email for you! Which direction do you want?
- **Business / Professional** — a formal email to a client, boss, or partner
- **Academic** — an email to a professor or school administrator
- **Job Application / Networking** — a cover-style email or cold outreach
- **Casual / Personal** — a friendly email to a friend or family member
Just share the details and I'll draft it right away!`;

    const options = extractClarificationOptions(content);
    expect(options).toHaveLength(4);
    const stripped = stripClarificationOptionLines(content, options);
    expect(stripped).not.toContain('Business / Professional');
    expect(stripped).not.toContain('Academic');
    expect(stripped).not.toContain('Job Application');
    expect(stripped).not.toContain('Casual / Personal');
    // The question and the closing line survive.
    expect(stripped).toContain('Which direction do you want?');
    expect(stripped).toContain("I'll draft it right away!");
  });

  it('removes numbered options', () => {
    const content = `What kind of layout would you like for your portfolio?
1. **Minimalist** — clean typography and lots of whitespace
2. **Modern Grid** — dynamic cards with hover effects
3. **Interactive 3D** — WebGL effects and smooth scrolling`;
    const options = extractClarificationOptions(content);
    expect(options).toHaveLength(3);
    const stripped = stripClarificationOptionLines(content, options);
    expect(stripped).toContain('What kind of layout');
    expect(stripped).not.toContain('Minimalist');
    expect(stripped).not.toContain('Modern Grid');
    expect(stripped).not.toContain('Interactive 3D');
  });

  it('removes Option A/B/C/D lines', () => {
    const content = `What's the purpose of this email?

Option A — Requesting something (time off, approval, resources, etc.)
Option B — Providing an update or status report on a project/task
Option C — Asking for feedback or scheduling a meeting`;
    const options = extractClarificationOptions(content);
    expect(options).toHaveLength(3);
    const stripped = stripClarificationOptionLines(content, options);
    expect(stripped).toContain("What's the purpose of this email?");
    expect(stripped).not.toContain('Option A');
    expect(stripped).not.toContain('Option B');
    expect(stripped).not.toContain('Option C');
  });

  it('removes explicit [option: ...] tags inline', () => {
    const content = `Please choose one of the following directions:
[option: Dark Mode Dashboard: dark glassmorphism with real-time charts]
[option: Light Mode Minimal: clean white editorial aesthetic]`;
    const options = extractClarificationOptions(content);
    expect(options).toHaveLength(2);
    const stripped = stripClarificationOptionLines(content, options);
    expect(stripped).toContain('Please choose one of the following directions:');
    expect(stripped).not.toContain('[option:');
    expect(stripped).not.toContain('Dark Mode Dashboard');
    expect(stripped).not.toContain('Light Mode Minimal');
  });

  it('handles separator variants (colon, hyphen) used in the source', () => {
    const content = `Which style do you want?
- **Space Shooter**: classic 2D retro arcade action
- **Platformer** - jump and run with coins`;
    const options = extractClarificationOptions(content);
    expect(options).toHaveLength(2);
    const stripped = stripClarificationOptionLines(content, options);
    expect(stripped).not.toContain('Space Shooter');
    expect(stripped).not.toContain('Platformer');
    expect(stripped).toContain('Which style do you want?');
  });

  it('leaves content untouched when there are no options', () => {
    const content = 'Just a normal answer with no options.';
    expect(stripClarificationOptionLines(content, [])).toBe(content);
    expect(stripClarificationOptionLines(content, null)).toBe(content);
    const noQuestion = `Here is a summary:\n- Item 1\n- Item 2`;
    expect(stripClarificationOptionLines(noQuestion, extractClarificationOptions(noQuestion))).toBe(noQuestion);
  });

  it('renders the message body without duplicating the card options', () => {
    const message = {
      role: 'assistant',
      content: `I'd be happy to write that email for you! Which direction do you want?
- **Business / Professional** — a formal email to a client, boss, or partner
- **Academic** — an email to a professor or school administrator
- **Casual / Personal** — a friendly email to a friend or family member`
    };
    render(<ChatMessage message={message} />);
    // Each label appears exactly once — in the suggestions card, not the body.
    expect(screen.getAllByText('Business / Professional')).toHaveLength(1);
    expect(screen.getAllByText('Academic')).toHaveLength(1);
    expect(screen.getAllByText('Casual / Personal')).toHaveLength(1);
    // The question still renders in the body.
    expect(screen.getByText(/Which direction do you want\?/)).toBeInTheDocument();
  });
});

describe('splitClarificationOptionLines', () => {
  const emailContent = `I'd be happy to write that email for you! To make sure it comes out right, could you give me a couple of quick details?

What is the purpose of the email? (e.g., requesting something, following up, apologizing, inviting, etc.)
Who is the recipient? (e.g., a boss, client, colleague, professor, friend)
If you're not sure where to start, here are some common directions:
- **Business / Professional** — a formal email to a client, boss, or partner (e.g., meeting request, follow-up, proposal)
- **Academic** — an email to a professor or school administrator (e.g., asking for a recommendation, deadline extension)
- **Job Application / Networking** — a cover-style email or cold outreach to a recruiter
- **Casual / Personal** — a friendly email to a friend or family member
Just share the details (and any specific tone you want), and I'll draft it for you right away!`;

  it('splits at the first option line so the card sits after the lead-in', () => {
    const options = extractClarificationOptions(emailContent);
    expect(options).toHaveLength(4);
    const { before, after } = splitClarificationOptionLines(emailContent, options);
    // The lead-in is the last thing before the card.
    expect(before.trimEnd().endsWith('here are some common directions:')).toBe(true);
    expect(before).not.toContain('Business / Professional');
    // The closing line comes after the card.
    expect(after).toContain("Just share the details (and any specific tone you want), and I'll draft it for you right away!");
    expect(after).not.toContain('Academic');
  });

  it('renders the card between the lead-in and the closing line', () => {
    const message = { role: 'assistant', content: emailContent };
    const { container } = render(<ChatMessage message={message} />);
    const html = container.innerHTML;
    const leadIn = html.indexOf('here are some common directions:');
    const card = html.indexOf('Suggestions');
    const closing = html.indexOf('Just share the details');
    expect(leadIn).toBeGreaterThan(-1);
    expect(card).toBeGreaterThan(leadIn);
    expect(closing).toBeGreaterThan(card);
    // Labels still appear exactly once (in the card only).
    expect(screen.getAllByText('Business / Professional')).toHaveLength(1);
    expect(screen.getAllByText('Academic')).toHaveLength(1);
  });

  it('returns the whole content as before when there are no options', () => {
    expect(splitClarificationOptionLines('plain answer', [])).toEqual({ before: 'plain answer', after: '' });
    expect(splitClarificationOptionLines('plain answer', null)).toEqual({ before: 'plain answer', after: '' });
  });

  it('keeps everything as before for tag-only options', () => {
    const content = 'Please choose one:\n[option: Dark Mode: dark glassmorphism]\n[option: Light Mode: clean editorial]';
    const options = extractClarificationOptions(content);
    expect(options).toHaveLength(2);
    const { before, after } = splitClarificationOptionLines(content, options);
    expect(before).toContain('Please choose one:');
    expect(before).not.toContain('[option:');
    expect(after).toBe('');
  });
});
