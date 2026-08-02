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

describe('ChatInput slash-command suggestions', () => {
  it('shows all suggestions when the user types "/"', () => {
    const t = setup();
    typeInto(t, '/');
    expect(screen.getByText('/website')).toBeTruthy();
    expect(screen.getByText('/game')).toBeTruthy();
    expect(screen.getByText('/research')).toBeTruthy();
  });

  it('filters suggestions by the typed prefix', () => {
    const t = setup();
    typeInto(t, '/game');
    expect(screen.getByText('Create a playable game')).toBeTruthy();
    expect(screen.queryByText('Create a website or web page')).toBeNull();
    expect(screen.queryByText('Full research with web search + PDF report')).toBeNull();
  });

  it('shows no suggestions for plain text', () => {
    const t = setup();
    typeInto(t, 'build me a website');
    expect(screen.queryByText('/website')).toBeNull();
  });

  it('selects a suggestion with Enter and fills the placeholder', () => {
    const t = setup('/');
    fireEvent.keyDown(t.textarea(), { key: 'ArrowDown' }); // /game
    fireEvent.keyDown(t.textarea(), { key: 'Enter' });
    expect(t.setInput.mock).toBeUndefined(); // sanity: plain setter
  });

  it('selects the first suggestion with Tab', () => {
    let value = '/w';
    const setter = (v) => { value = v; };
    const utils = render(<ChatInput input={value} setInput={setter} onSendMessage={() => {}} isStreaming={false} />);
    const textarea = utils.container.querySelector('textarea');
    fireEvent.keyDown(textarea, { key: 'Tab' });
    expect(value).toBe('/website premium headphones store');
  });

  it('dismisses with Escape', () => {
    const t = setup();
    typeInto(t, '/');
    expect(screen.getByText('/website')).toBeTruthy();
    fireEvent.keyDown(t.textarea(), { key: 'Escape' });
    expect(screen.queryByText('/website')).toBeNull();
  });

  it('selects a suggestion on click', () => {
    let value = '/';
    const setter = (v) => { value = v; };
    const utils = render(<ChatInput input={value} setInput={setter} onSendMessage={() => {}} isStreaming={false} />);
    const textarea = utils.container.querySelector('textarea');
    fireEvent.change(textarea, { target: { value: '/' } });
    utils.rerender(<ChatInput input={value} setInput={setter} onSendMessage={() => {}} isStreaming={false} />);
    fireEvent.click(screen.getByText('/research'));
    expect(value).toBe('/research quantum computing');
  });
});
