// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ChatMessage from '../src/components/ChatMessage.jsx';

afterEach(() => {
  cleanup();
});

describe('ChatMessage horizontal rule rendering', () => {
  it('renders a --- line as an <hr> instead of literal text', () => {
    const content = 'First paragraph.\n\n---\n\nSecond paragraph.';
    render(<ChatMessage message={{ role: 'assistant', content }} />);

    const hr = document.querySelector('.markdown-hr');
    expect(hr).not.toBeNull();
    expect(screen.queryByText('---')).toBeNull();
    expect(screen.getByText('First paragraph.')).toBeInTheDocument();
    expect(screen.getByText('Second paragraph.')).toBeInTheDocument();
  });

  it('renders *** and * * * variants as <hr>', () => {
    const content = 'Top.\n\n***\n\nMiddle.\n\n* * *\n\nBottom.';
    render(<ChatMessage message={{ role: 'assistant', content }} />);

    expect(document.querySelectorAll('.markdown-hr').length).toBe(2);
    expect(screen.queryByText('***')).toBeNull();
    expect(screen.queryByText('* * *')).toBeNull();
  });

  it('does not treat a list item line as a horizontal rule', () => {
    const content = '- first item\n- second item';
    render(<ChatMessage message={{ role: 'assistant', content }} />);

    expect(document.querySelectorAll('.markdown-hr').length).toBe(0);
    expect(screen.getByText('first item')).toBeInTheDocument();
  });

  it('keeps markdown tables working next to horizontal rules', () => {
    const content = 'Section\n\n| Name | Value |\n| --- | --- |\n| A | 1 |\n\n---\n\nEnd.';
    render(<ChatMessage message={{ role: 'assistant', content }} />);

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('End.')).toBeInTheDocument();
    expect(document.querySelectorAll('.markdown-hr').length).toBe(1);
  });
});
