// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import ChatInput from '../src/components/ChatInput.jsx';

afterEach(() => {
  cleanup();
});

function setup() {
  let sentText = null;
  let sentAttachments = null;
  let value = '';
  const setInput = (v) => { value = v; };
  const utils = render(
    <ChatInput
      input={value}
      setInput={setInput}
      onSendMessage={(text, attachments) => {
        sentText = text;
        sentAttachments = attachments;
      }}
      isStreaming={false}
    />
  );
  return {
    attachButton: () => screen.getByLabelText('Attach files'),
    fileInput: () => utils.container.querySelector('input[type="file"]'),
    textarea: () => screen.getByPlaceholderText('Ask Corez...'),
    type: (text) => {
      fireEvent.change(screen.getByPlaceholderText('Ask Corez...'), { target: { value: text } });
      utils.rerender(
        <ChatInput
          input={value}
          setInput={setInput}
          onSendMessage={(text, attachments) => {
            sentText = text;
            sentAttachments = attachments;
          }}
          isStreaming={false}
        />
      );
    },
    sentText: () => sentText,
    sentAttachments: () => sentAttachments
  };
}

function selectFiles(test, files) {
  fireEvent.change(test.fileInput(), { target: { files } });
}

describe('ChatInput file attachment feature', () => {
  it('renders the rounded plus attach button', () => {
    const t = setup();
    expect(t.attachButton()).toBeTruthy();
    expect(t.attachButton().querySelector('svg')).toBeTruthy();
  });

  it('file picker accepts anything except folders', () => {
    const t = setup();
    const input = t.fileInput();
    expect(input).toBeTruthy();
    expect(input.multiple).toBe(true);
    expect(input.getAttribute('accept')).toBeNull();
    expect(input.hasAttribute('webkitdirectory')).toBe(false);
    expect(input.hasAttribute('directory')).toBe(false);
  });

  it('shows a chip for each selected file', () => {
    const t = setup();
    selectFiles(t, [
      new File(['hello world'], 'notes.txt', { type: 'text/plain' }),
      new File([new Uint8Array([1, 2, 3])], 'data.bin', { type: 'application/octet-stream' })
    ]);
    expect(screen.getByText('notes.txt')).toBeTruthy();
    expect(screen.getByText('data.bin')).toBeTruthy();
  });

  it('removes a chip when its remove button is clicked', () => {
    const t = setup();
    selectFiles(t, [new File(['x'], 'notes.txt', { type: 'text/plain' })]);
    expect(screen.getByText('notes.txt')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Remove notes.txt'));
    expect(screen.queryByText('notes.txt')).toBeNull();
  });

  it('sends attachments together with the typed message', async () => {
    const t = setup();
    const file = new File(['line one\nline two'], 'sample.txt', { type: 'text/plain' });
    selectFiles(t, [file]);
    await new Promise((resolve) => setTimeout(resolve, 30));
    t.type('please analyze this file');
    fireEvent.submit(t.textarea().closest('form'));
    expect(t.sentText()).toBe('please analyze this file');
    expect(t.sentAttachments()).toHaveLength(1);
    expect(t.sentAttachments()[0].name).toBe('sample.txt');
    expect(t.sentAttachments()[0].content).toBe('line one\nline two');
    expect(screen.queryByText('sample.txt')).toBeNull();
  });

  it('can send attachments without any typed text', () => {
    const t = setup();
    selectFiles(t, [new File(['binary!'], 'blob.dat', { type: 'application/octet-stream' })]);
    fireEvent.submit(t.textarea().closest('form'));
    expect(t.sentText()).toBe('');
    expect(t.sentAttachments()).toHaveLength(1);
    expect(t.sentAttachments()[0].content).toBeUndefined();
  });

  it('send button is disabled when nothing is typed and nothing is attached', () => {
    const t = setup();
    const sendButton = screen.getByTitle('Send Message');
    expect(sendButton.disabled).toBe(true);
    selectFiles(t, [new File(['x'], 'notes.txt', { type: 'text/plain' })]);
    expect(screen.getByTitle('Send Message').disabled).toBe(false);
  });
});
