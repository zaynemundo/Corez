// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ChatMessage from '../src/components/ChatMessage.jsx';

afterEach(() => {
  cleanup();
});

describe('ChatMessage horizontal-rule lines', () => {
  it('renders no divider and no literal text for --- lines', () => {
    const content = 'First paragraph.\n\n---\n\nSecond paragraph.';
    render(<ChatMessage message={{ role: 'assistant', content }} />);

    expect(screen.queryByText('---')).toBeNull();
    expect(screen.queryByText('First paragraph.')).toBeInTheDocument();
    expect(screen.queryByText('Second paragraph.')).toBeInTheDocument();
  });

  it('drops *** and * * * variants too', () => {
    const content = 'Top.\n\n***\n\nMiddle.\n\n* * *\n\nBottom.';
    render(<ChatMessage message={{ role: 'assistant', content }} />);

    expect(screen.queryByText('***')).toBeNull();
    expect(screen.queryByText('* * *')).toBeNull();
    expect(screen.getByText('Top.')).toBeInTheDocument();
    expect(screen.getByText('Bottom.')).toBeInTheDocument();
  });

  it('keeps list items and tables intact', () => {
    const content = 'Section\n\n| Name | Value |\n| --- | --- |\n| A | 1 |\n\n---\n\nEnd.';
    render(<ChatMessage message={{ role: 'assistant', content }} />);

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('End.')).toBeInTheDocument();
    expect(screen.queryByText('---')).toBeNull();
  });
});
