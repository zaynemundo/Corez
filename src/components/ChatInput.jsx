import { useRef, useEffect, useState } from 'react';
import { Send, Square, ChevronRight, Globe, Gamepad2, Search, Image as ImageIcon, X } from 'lucide-react';
import { PlusIcon } from './icons';

// Commands offered as suggestions when the user types "@".
// Keep in sync with parseSlashCommand in services/aiService.js.
const COMMANDS = [
  {
    command: 'website',
    label: '@website',
    name: 'Website',
    description: 'Create a website or web page',
    icon: Globe,
    placeholder: 'Describe the website you want to build...'
  },
  {
    command: 'game',
    label: '@game',
    name: 'Game',
    description: 'Create a playable game',
    icon: Gamepad2,
    placeholder: 'Describe the game you want to build...'
  },
  {
    command: 'research',
    label: '@research',
    name: 'Research',
    description: 'Deep research: multi-item web search + PDF report',
    icon: Search,
    placeholder: 'Enter a research topic or question...'
  },
  {
    command: 'image',
    label: '@image',
    name: 'Image',
    description: 'Generate an AI image or artwork',
    icon: ImageIcon,
    placeholder: 'Describe the image you want to generate...'
  }
];

const MAX_IMAGE_THUMB_BYTES = 1.5 * 1024 * 1024;
const MAX_TEXT_CONTENT_BYTES = 200 * 1024;
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'js', 'jsx', 'ts', 'tsx', 'css', 'html', 'xml',
  'svg', 'csv', 'log', 'py', 'yml', 'yaml', 'sh', 'sql', 'ini', 'toml', 'env',
  'gitignore', 'config', 'rst', 'tex', 'bat', 'ps1'
]);

function extensionOf(name) {
  const dot = String(name || '').lastIndexOf('.');
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : '';
}

function isTextLike(file) {
  return Boolean(file?.type?.startsWith('text/'))
    || (file?.type === 'application/json')
    || TEXT_EXTENSIONS.has(extensionOf(file?.name));
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export default function ChatInput({ 
  input, 
  setInput, 
  onSendMessage, 
  onStopMessage, 
  isStreaming, 
  textareaRef,
  guestQuota = null,
  onOpenAuth = null
}) {
  const internalRef = useRef(null);
  const refToUse = textareaRef || internalRef;
  const [showSuggestions, setShowSuggestions] = useState(() => String(input || '').startsWith('@'));
  const [activeIndex, setActiveIndex] = useState(0);
  const suggestionsRef = useRef(null);
  const fileInputRef = useRef(null);
  const [attachments, setAttachments] = useState([]);

  useEffect(() => {
    if (refToUse.current) {
      refToUse.current.style.height = 'auto';
      refToUse.current.style.height = `${Math.min(refToUse.current.scrollHeight, 140)}px`;
    }
  }, [input]);

  // Show suggestions when the input starts with "@" (optionally followed by
  // partial command text) and is not streaming.
  const match = !isStreaming && input.startsWith('@') ? input.match(/^@([a-z]*)$/i) : null;
  const show = showSuggestions && match !== null;
  const typed = match ? match[1].toLowerCase() : '';
  const filtered = typed
    ? COMMANDS.filter((c) => c.command.startsWith(typed))
    : COMMANDS;

  // Reset selection whenever the filtered list changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [typed, showSuggestions]);

  // Dismiss on click outside.
  useEffect(() => {
    if (!show) return;
    const onClick = (e) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target)
        && refToUse.current && !refToUse.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [show, refToUse]);

  const applySuggestion = (command) => {
    // Fill the @command token with a trailing space
    setInput(`@${command} `);
    setShowSuggestions(false);
    setActiveIndex(0);
    if (refToUse.current) {
      refToUse.current.focus();
      const pos = `@${command} `.length;
      refToUse.current.setSelectionRange(pos, pos);
    }
  };

  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const created = files.map((file, index) => {
      const id = `attach-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
      return { id, name: file.name, type: file.type || '', size: file.size, file };
    });

    setAttachments(prev => [
      ...prev,
      ...created.map(({ id, name, type, size }) => ({ id, name, type, size }))
    ]);
    if (fileInputRef.current) fileInputRef.current.value = '';

    created.forEach((entry) => {
      if (entry.file.type.startsWith('image/') && entry.file.size <= MAX_IMAGE_THUMB_BYTES) {
        const reader = new FileReader();
        reader.onload = () => {
          if (reader.result && typeof reader.result === 'string') {
            setAttachments(prev => prev.map(a => a.id === entry.id ? { ...a, thumb: reader.result } : a));
          }
        };
        reader.readAsDataURL(entry.file);
      }
      if (isTextLike(entry.file) && entry.file.size <= MAX_TEXT_CONTENT_BYTES) {
        readFileAsText(entry.file).then(content => {
          setAttachments(prev => prev.map(a => a.id === entry.id ? { ...a, content } : a));
        }).catch(() => {});
      }
    });
  };

  const removeAttachment = (id) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (isStreaming) {
      if (onStopMessage) onStopMessage();
      return;
    }
    const textToSend = input.trim();
    if (!textToSend && attachments.length === 0) return;
    onSendMessage(textToSend, attachments);
    setInput('');
    setAttachments([]);
    setShowSuggestions(false);
    if (refToUse.current) {
      refToUse.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e) => {
    if (show && filtered.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % filtered.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        const selected = filtered[activeIndex];
        if (selected) {
          e.preventDefault();
          applySuggestion(selected.command);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSuggestions(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="input-container">
      {guestQuota?.isGuest && (
        <div
          className="guest-quota-pill"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            fontSize: '0.72rem',
            color: 'var(--text-secondary)',
            marginBottom: '6px',
            padding: '3px 10px',
            borderRadius: '12px',
            background: 'var(--bg-tertiary, #181922)',
            border: '1px solid var(--border-color)'
          }}
        >
          <span>
            Guest Mode: <b>{guestQuota.remaining} of {guestQuota.limit} free prompts</b> remaining today.
          </span>
          <button
            type="button"
            onClick={onOpenAuth}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--accent, #60a5fa)',
              cursor: 'pointer',
              padding: 0,
              fontSize: '0.72rem',
              fontWeight: 600,
              textDecoration: 'underline'
            }}
          >
            Sign up for unlimited
          </button>
        </div>
      )}
      <form onSubmit={handleSubmit} className="input-box">
        {show && filtered.length > 0 && (
          <div className="slash-suggestions" ref={suggestionsRef} role="listbox" aria-label="Commands">
            {filtered.map((entry, index) => {
              const Icon = entry.icon;
              return (
                <button
                  key={entry.command}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  aria-label={`${entry.label}: ${entry.description}`}
                  className={`slash-suggestion-item ${index === activeIndex ? 'active' : ''}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => applySuggestion(entry.command)}
                >
                  <span className="slash-suggestion-icon">
                    <Icon size={15} strokeWidth={1.5} />
                  </span>
                  <span className="slash-suggestion-desc">{entry.description}</span>
                  <ChevronRight size={14} strokeWidth={1.5} className="slash-suggestion-chevron" />
                </button>
              );
            })}
          </div>
        )}
        {attachments.length > 0 && (
          <div className="attachment-chips-bar" aria-label="Attached files">
            {attachments.map((attachment) => (
              <span key={attachment.id} className="attachment-chip">
                {attachment.thumb && (
                  <img src={attachment.thumb} alt="" className="attachment-chip-thumb" />
                )}
                <span className="chip-filename" title={`${attachment.name} (${formatBytes(attachment.size)})`}>
                  {attachment.name}
                </span>
                <button
                  type="button"
                  className="remove-chip-btn"
                  onClick={() => removeAttachment(attachment.id)}
                  aria-label={`Remove ${attachment.name}`}
                  title="Remove attachment"
                  disabled={isStreaming}
                >
                  <X size={12} strokeWidth={1.5} />
                </button>
              </span>
            ))}
          </div>
        )}

        <button
          type="button"
          className="attach-btn"
          onClick={() => fileInputRef.current?.click()}
          title="Attach files"
          aria-label="Attach files"
          disabled={isStreaming}
        >
          <PlusIcon size={18} strokeWidth={2} />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="visually-hidden-file-input"
          onChange={handleFileSelect}
          tabIndex={-1}
          aria-hidden="true"
        />
        <textarea
          ref={refToUse}
          className="chat-textarea"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggestions(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={isStreaming ? "Corez is generating..." : "Ask Corez..."}
          aria-label={isStreaming ? "Corez is generating" : "Message Corez"}
          rows={1}
        />
        <div className="input-actions-bar">
          {isStreaming ? (
            <button
              type="button"
              className="send-btn stop-btn"
              onClick={onStopMessage}
              title="Stop Generation"
            >
              <Square size={13} fill="currentColor" strokeWidth={1.5} />
            </button>
          ) : (
            <button
              type="submit"
              className="send-btn"
              disabled={!input.trim() && attachments.length === 0}
              title="Send Message"
            >
              <Send size={15} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
