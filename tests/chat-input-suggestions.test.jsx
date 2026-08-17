// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import ChatInput from '../src/components/ChatInput.jsx';

afterEach(() => {
  cleanup();
});

function setup(initialInput = '') {
  let value = initialInput;
  const setInput = (v) => { value = v; };
  const utils = render(
    <ChatInput input={value} setInput={setInput} onSendMessage={() => {}} isStreaming={false} />
  );
  return {
    textarea: () => screen.getByPlaceholderText('Ask Corez...'),
    setInput,
    rerender: () => utils.rerender(
      <ChatInput input={value} setInput={setInput} onSendMessage={() => {}} isStreaming={false} />
    )
  };
}

function typeInto(test, text) {
  fireEvent.change(test.textarea(), { target: { value: text } });
  test.rerender();
}

describe('ChatInput @ command suggestions', () => {
  it('shows all suggestions when the user types "@"', () => {
    const t = setup();
    typeInto(t, '@');
    expect(screen.getByText('Create a website or web page')).toBeTruthy();
    expect(screen.getByText('Create a playable game')).toBeTruthy();
    expect(screen.getByText('Deep research: multi-item web search + PDF report')).toBeTruthy();
    expect(screen.getByText('Generate an AI image or artwork')).toBeTruthy();
  });

  it('shows no suggestions when the user types "/"', () => {
    const t = setup();
    typeInto(t, '/');
    expect(screen.queryByText('Create a website or web page')).toBeNull();
    expect(screen.queryByText('Create a playable game')).toBeNull();
    expect(screen.queryByText('Deep research: multi-item web search + PDF report')).toBeNull();
    expect(screen.queryByText('Generate an AI image or artwork')).toBeNull();
  });

  it('filters suggestions by the typed @ prefix', () => {
    const t = setup();
    typeInto(t, '@game');
    expect(screen.getByText('Create a playable game')).toBeTruthy();
    expect(screen.queryByText('Create a website or web page')).toBeNull();
    expect(screen.queryByText('Deep research: multi-item web search + PDF report')).toBeNull();
    expect(screen.queryByText('Generate an AI image or artwork')).toBeNull();
  });

  it('filters suggestions for @image prefix', () => {
    const t = setup();
    typeInto(t, '@im');
    expect(screen.getByText('Generate an AI image or artwork')).toBeTruthy();
    expect(screen.queryByText('Create a website or web page')).toBeNull();
    expect(screen.queryByText('Create a playable game')).toBeNull();
    expect(screen.queryByText('Deep research: multi-item web search + PDF report')).toBeNull();
  });

  it('shows no suggestions for plain text', () => {
    const t = setup();
    typeInto(t, 'build me a website');
    expect(screen.queryByText('Create a website or web page')).toBeNull();
    expect(screen.queryByText('Generate an AI image or artwork')).toBeNull();
  });

  it('selects a suggestion with Enter and fills only the command token', () => {
    let value = '@';
    const setter = (v) => { value = v; };
    const utils = render(<ChatInput input={value} setInput={setter} onSendMessage={() => {}} isStreaming={false} />);
    const textarea = utils.container.querySelector('textarea');
    fireEvent.change(textarea, { target: { value: '@' } });
    utils.rerender(<ChatInput input={value} setInput={setter} onSendMessage={() => {}} isStreaming={false} />);
    fireEvent.keyDown(textarea, { key: 'ArrowDown' }); // @game
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(value).toBe('@game ');
  });

  it('selects the first suggestion with Tab', () => {
    let value = '@w';
    const setter = (v) => { value = v; };
    const utils = render(<ChatInput input={value} setInput={setter} onSendMessage={() => {}} isStreaming={false} />);
    const textarea = utils.container.querySelector('textarea');
    fireEvent.keyDown(textarea, { key: 'Tab' });
    expect(value).toBe('@website ');
  });

  it('dismisses with Escape', () => {
    const t = setup();
    typeInto(t, '@');
    expect(screen.getByText('Create a website or web page')).toBeTruthy();
    fireEvent.keyDown(t.textarea(), { key: 'Escape' });
    expect(screen.queryByText('Create a website or web page')).toBeNull();
  });

  it('selects a suggestion on click', () => {
    let value = '@';
    const setter = (v) => { value = v; };
    const utils = render(<ChatInput input={value} setInput={setter} onSendMessage={() => {}} isStreaming={false} />);
    const textarea = utils.container.querySelector('textarea');
    fireEvent.change(textarea, { target: { value: '@' } });
    utils.rerender(<ChatInput input={value} setInput={setter} onSendMessage={() => {}} isStreaming={false} />);
    fireEvent.click(screen.getByText('Deep research: multi-item web search + PDF report'));
    expect(value).toBe('@research ');
  });

  it('selects the image suggestion on click', () => {
    let value = '@';
    const setter = (v) => { value = v; };
    const utils = render(<ChatInput input={value} setInput={setter} onSendMessage={() => {}} isStreaming={false} />);
    const textarea = utils.container.querySelector('textarea');
    fireEvent.change(textarea, { target: { value: '@' } });
    utils.rerender(<ChatInput input={value} setInput={setter} onSendMessage={() => {}} isStreaming={false} />);
    fireEvent.click(screen.getByText('Generate an AI image or artwork'));
    expect(value).toBe('@image ');
  });

  it('does not render a quick actions bar', () => {
    render(<ChatInput input="" setInput={() => {}} onSendMessage={() => {}} isStreaming={false} />);
    expect(screen.queryByRole('toolbar', { name: 'Creation modes' })).toBeNull();
  });
});
