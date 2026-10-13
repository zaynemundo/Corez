// @vitest-environment jsdom
//
// The live thinking panel replaced the three-dot row: while the model works it
// shows a "Working…" status until the first reasoning event arrives, then the
// reasoning streams into the panel (expanded) while the answer streams below.
// The persisted disclosure on finished messages is covered separately in
// chat-message-thinking.test.jsx.
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ThinkingPanel } from '../src/components/ThinkingPanel.jsx';

afterEach(() => {
  cleanup();
});

function panel(overrides = {}) {
  const props = {
    text: '',
    live: true,
    expanded: true,
    onToggle: () => {},
    bodyId: 'corez-thinking-body',
    placeholder: 'Working…',
    ...overrides,
  };
  return render(<ThinkingPanel {...props} />);
}

describe('live ThinkingPanel', () => {
  it('shows the working status while no reasoning has arrived', () => {
    panel();

    expect(screen.getByText('Working…')).toBeInTheDocument();
    // The header label is still the panel title, not a blank box.
    expect(
      screen.getByRole('button', { name: /Thinking/ }),
    ).toBeInTheDocument();
    // Nothing to expand yet: no reasoning body is rendered.
    expect(document.querySelector('.thinking-panel-body')).toBeNull();
  });

  it('replaces the working status with the reasoning when it streams in', () => {
    const { rerender } = panel();

    rerender(
      <ThinkingPanel
        text={'Step one.\n- bullet point'}
        live
        expanded
        onToggle={() => {}}
        bodyId="corez-thinking-body"
        placeholder="Working…"
      />,
    );

    expect(screen.queryByText('Working…')).toBeNull();
    expect(screen.getByText('Step one.')).toBeInTheDocument();
    expect(screen.getByText('bullet point')).toBeInTheDocument();
  });

  it('collapses and re-expands the reasoning body through the header', () => {
    const { rerender } = panel({
      text: 'Reasoning line.',
      expanded: false,
    });

    expect(screen.queryByText('Reasoning line.')).toBeNull();

    rerender(
      <ThinkingPanel
        text="Reasoning line."
        live
        expanded
        onToggle={() => {}}
        bodyId="corez-thinking-body"
        placeholder="Working…"
      />,
    );
    expect(screen.getByText('Reasoning line.')).toBeInTheDocument();
  });

  it('renders nothing without text or a live placeholder', () => {
    panel({ text: '   ', placeholder: '' });
    expect(document.querySelector('.thinking-panel')).toBeNull();
  });

  it('keeps the toggle wired to the caller handler', () => {
    let toggles = 0;
    panel({ onToggle: () => { toggles += 1; } });
    fireEvent.click(screen.getByRole('button', { name: /Thinking/ }));
    expect(toggles).toBe(1);
  });
});
