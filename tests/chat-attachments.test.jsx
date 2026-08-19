// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, screen, cleanup, waitFor } from '@testing-library/react';
import ChatInput from '../src/components/ChatInput.jsx';
import DropZoneOverlay from '../src/components/DropZoneOverlay.jsx';
import App from '../src/App.jsx';
import { isTextLike, formatBytes, hasFiles, processFiles } from '../src/utils/fileAttachmentUtils.js';

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
    form: () => utils.container.querySelector('form.input-box'),
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
    t.type('please analyze this file');
    await waitFor(() => {
      expect(screen.getByText('sample.txt')).toBeTruthy();
    });
    // Wait for text file reader to populate content
    await new Promise((resolve) => setTimeout(resolve, 80));
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

  it('attaches files dropped directly onto ChatInput', async () => {
    const t = setup();
    const form = t.form();
    const droppedFile = new File(['function test() { return 42; }'], 'main.js', { type: 'application/javascript' });

    fireEvent.dragEnter(form, {
      dataTransfer: {
        types: ['Files'],
        files: [droppedFile]
      }
    });
    expect(form.classList.contains('drag-over')).toBe(true);

    fireEvent.drop(form, {
      dataTransfer: {
        types: ['Files'],
        files: [droppedFile]
      }
    });
    expect(form.classList.contains('drag-over')).toBe(false);

    await waitFor(() => {
      expect(screen.getByText('main.js')).toBeTruthy();
    });
  });
});

describe('Drag-and-Drop DropZoneOverlay', () => {
  it('renders nothing when isDragging is false', () => {
    const { container } = render(<DropZoneOverlay isDragging={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the overlay with title and options when isDragging is true', () => {
    render(<DropZoneOverlay isDragging={true} />);
    expect(screen.getByText('Drop any file here')).toBeTruthy();
    expect(screen.getByLabelText('Drop files here to attach')).toBeTruthy();
    expect(screen.getByText(/Attach code, images, documents/i)).toBeTruthy();
  });

  it('triggers onDrop and onDragLeave events', () => {
    let dropped = false;
    let left = false;
    render(
      <DropZoneOverlay
        isDragging={true}
        onDrop={() => { dropped = true; }}
        onDragLeave={() => { left = true; }}
      />
    );
    const overlay = screen.getByRole('region', { name: /Drop files here to attach/i });
    fireEvent.dragLeave(overlay);
    expect(left).toBe(true);
    fireEvent.drop(overlay);
    expect(dropped).toBe(true);
  });
});

describe('fileAttachmentUtils', () => {
  it('identifies text-like files accurately', () => {
    expect(isTextLike({ name: 'code.js', type: '' })).toBe(true);
    expect(isTextLike({ name: 'styles.css', type: 'text/css' })).toBe(true);
    expect(isTextLike({ name: 'app.py', type: '' })).toBe(true);
    expect(isTextLike({ name: 'config.json', type: 'application/json' })).toBe(true);
    expect(isTextLike({ name: 'photo.png', type: 'image/png' })).toBe(false);
    expect(isTextLike({ name: 'archive.zip', type: 'application/zip' })).toBe(false);
  });

  it('formats bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
  });

  it('detects files in dataTransfer', () => {
    expect(hasFiles({ types: ['Files'] })).toBe(true);
    expect(hasFiles({ types: ['text/plain'] })).toBe(false);
    expect(hasFiles(null)).toBe(false);
  });

  it('processFiles creates attachments with unique IDs and triggers loaders', () => {
    let attachments = [];
    const setAttachments = (updater) => {
      attachments = typeof updater === 'function' ? updater(attachments) : updater;
    };
    const files = [
      new File(['test content'], 'sample.txt', { type: 'text/plain' }),
      new File(['img'], 'photo.png', { type: 'image/png' })
    ];
    processFiles(files, setAttachments);
    expect(attachments).toHaveLength(2);
    expect(attachments[0].name).toBe('sample.txt');
    expect(attachments[1].name).toBe('photo.png');
  });
});

describe('App-level window drag and drop integration', () => {
  it('opens drop overlay on window dragenter with files and processes drop', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('/api/auth/me')) {
        return new Response(JSON.stringify({ user: { id: 'dev', email: 'dev@corez.pro' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(null, { status: 404 });
    });

    const { unmount } = render(<App />);

    // Wait for auth to resolve and render Main app
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Ask Corez...')).toBeTruthy();
    });

    const droppedFile = new File(['console.log("hello world");'], 'index.js', { type: 'application/javascript' });

    // Drag enter with Files
    fireEvent.dragEnter(window, {
      dataTransfer: {
        types: ['Files'],
        files: [droppedFile]
      }
    });

    expect(screen.getByRole('region', { name: /Drop files here to attach/i })).toBeTruthy();
    expect(screen.getByText('Drop any file here')).toBeTruthy();

    // Drop onto window
    fireEvent.drop(window, {
      dataTransfer: {
        types: ['Files'],
        files: [droppedFile]
      }
    });

    // Overlay is closed
    expect(screen.queryByRole('region', { name: /Drop files here to attach/i })).toBeNull();

    // Chip is visible in the chat input
    await waitFor(() => {
      expect(screen.getByText('index.js')).toBeTruthy();
    });

    unmount();
  });
});

