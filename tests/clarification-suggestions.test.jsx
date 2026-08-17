// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClarificationSuggestions } from '../src/components/ChatMessage.jsx';

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
