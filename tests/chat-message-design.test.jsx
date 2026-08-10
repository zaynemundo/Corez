// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ChatMessage from '../src/components/ChatMessage.jsx';

afterEach(() => {
  cleanup();
});

describe('ChatMessage markdown visual design', () => {
  it('groups consecutive bullets into a single <ul> with list items', () => {
    const content = '- first\n- second\n- third';
    render(<ChatMessage message={{ role: 'assistant', content }} />);

    const list = screen.getByRole('list');
    expect(list.tagName).toBe('UL');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('first')).toBeInTheDocument();
  });

  it('groups numbered lines into an ordered <ol>', () => {
    const content = '1. one\n2. two\n3. three';
    render(<ChatMessage message={{ role: 'assistant', content }} />);

    const list = screen.getByRole('list');
    expect(list.tagName).toBe('OL');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('renders separate lists for interrupted bullet groups', () => {
    const content = '- a\n- b\n\npara\n\n- c';
    render(<ChatMessage message={{ role: 'assistant', content }} />);

    expect(screen.getAllByRole('list')).toHaveLength(2);
  });

  it('renders task list checkboxes with checked state', () => {
    const content = '- [x] done task\n- [ ] pending task';
    render(<ChatMessage message={{ role: 'assistant', content }} />);

    const checkboxes = document.querySelectorAll('.markdown-checkbox');
    expect(checkboxes.length).toBe(2);
    expect(checkboxes[0]).toHaveClass('checked');
    expect(checkboxes[1]).not.toHaveClass('checked');
    expect(screen.getByText('done task')).toHaveClass('markdown-task-done');
    expect(screen.getByText('pending task')).not.toHaveClass('markdown-task-done');
  });

  it('renders blockquote callouts with a label for **Note:**', () => {
    const content = '> **Note:** this is important';
    render(<ChatMessage message={{ role: 'assistant', content }} />);

    const quote = document.querySelector('.markdown-callout');
    expect(quote).not.toBeNull();
    expect(quote).toHaveClass('callout-note');
    expect(screen.getByText('Note')).toHaveClass('callout-label');
    expect(screen.getByText('this is important')).toBeInTheDocument();
  });

  it('renders plain blockquotes without callout styling', () => {
    const content = '> just a quote';
    render(<ChatMessage message={{ role: 'assistant', content }} />);

    expect(document.querySelectorAll('.markdown-callout').length).toBe(0);
    expect(screen.getByText('just a quote')).toBeInTheDocument();
  });

  it('maps heading depth to real heading levels', () => {
    const content = '# Top\n\n## Section\n\n### Sub';
    render(<ChatMessage message={{ role: 'assistant', content }} />);

    const heading2 = screen.getByRole('heading', { name: 'Top' });
    expect(heading2.tagName).toBe('H2');
    expect(screen.getByRole('heading', { name: 'Section' }).tagName).toBe('H3');
    expect(screen.getByRole('heading', { name: 'Sub' }).tagName).toBe('H4');
  });

  it('frames an email block in the compose-style card with toolbar and subject', () => {
    const content = 'Subject: Launch update\nTo: Sarah\n\nHi Sarah,\n\nHere is the plan.';
    render(<ChatMessage message={{ role: 'assistant', content }} />);

    const wrapper = document.querySelector('.markdown-email-wrapper');
    expect(wrapper).not.toBeNull();
    expect(wrapper.querySelector('.email-toolbar')).not.toBeNull();
    expect(wrapper.querySelector('.email-subject')).not.toBeNull();
    expect(wrapper.querySelector('.email-subject').textContent).toBe('Launch update');
    expect(wrapper.querySelector('.email-recipients-value').textContent).toBe('Sarah');
    expect(document.querySelector('table')).toBeNull();
    expect(screen.getByText(/Hi Sarah/)).toBeInTheDocument();
  });

  it('frames an email even with a one-line preamble before the subject', () => {
    const content = "Here's your draft:\n\nSubject: Launch update\nTo: Sarah\n\nHi Sarah,\n\nHere is the plan.";
    render(<ChatMessage message={{ role: 'assistant', content }} />);

    expect(document.querySelector('.markdown-email-wrapper')).not.toBeNull();
    expect(document.querySelector('.email-toolbar')).not.toBeNull();
  });

  it('omits recipients row when no To: header is present', () => {
    const content = 'Subject: Quick note\n\nHi there,\n\nJust checking in.';
    render(<ChatMessage message={{ role: 'assistant', content }} />);

    expect(document.querySelector('.email-recipients')).toBeNull();
    expect(document.querySelector('.email-subject').textContent).toBe('Quick note');
  });

  it('leaves ordinary prose outside the email card', () => {
    const content = 'Here is a normal paragraph.\n\nNothing special.';
    render(<ChatMessage message={{ role: 'assistant', content }} />);

    expect(document.querySelector('.markdown-email-wrapper')).toBeNull();
  });
});
