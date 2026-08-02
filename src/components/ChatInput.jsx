import { useRef, useEffect, useState } from 'react';
import { Send, Square, ChevronRight, Globe, Gamepad2, Search } from 'lucide-react';

// Slash commands offered as suggestions when the user types "/".
// Keep in sync with parseSlashCommand in services/aiService.js.
const SLASH_COMMANDS = [
  {
    command: 'website',
    label: '/website',
    description: 'Create a website or web page',
    icon: Globe
  },
  {
    command: 'game',
    label: '/game',
    description: 'Create a playable game',
    icon: Gamepad2
  },
  {
    command: 'research',
    label: '/research',
    description: 'Full research with web search + PDF report',
    icon: Search
  }
];

export default function ChatInput({ 
  input, 
  setInput, 
  onSendMessage, 
  onStopMessage, 
  isStreaming, 
  textareaRef 
}) {
  const internalRef = useRef(null);
  const refToUse = textareaRef || internalRef;
  const [showSuggestions, setShowSuggestions] = useState(() => String(input || '').startsWith('/'));
  const [activeIndex, setActiveIndex] = useState(0);
  const suggestionsRef = useRef(null);

  useEffect(() => {
    if (refToUse.current) {
      refToUse.current.style.height = 'auto';
      refToUse.current.style.height = `${Math.min(refToUse.current.scrollHeight, 140)}px`;
    }
  }, [input]);

  // Show suggestions when the input starts with "/" (optionally followed by
  // partial command text) and is not streaming.
  const match = !isStreaming && input.startsWith('/') ? input.match(/^\/([a-z]*)$/i) : null;
  const show = showSuggestions && match !== null;
  const typed = match ? match[1].toLowerCase() : '';
  const filtered = typed
    ? SLASH_COMMANDS.filter((c) => c.command.startsWith(typed))
    : SLASH_COMMANDS;

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
    // Fill only the command token (with a trailing space so the user can
    // continue typing the description) — never example text like
    // "/game space shooter".
    setInput(`/${command} `);
    setShowSuggestions(false);
    setActiveIndex(0);
    if (refToUse.current) {
      refToUse.current.focus();
      const pos = `/${command} `.length;
      refToUse.current.setSelectionRange(pos, pos);
    }
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (isStreaming) {
      if (onStopMessage) onStopMessage();
      return;
    }
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput('');
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
    <div className="chat-input-container">
      {show && filtered.length > 0 && (
        <div className="slash-suggestions" ref={suggestionsRef} role="listbox" aria-label="Slash commands">
          {filtered.map((entry, index) => {
            const Icon = entry.icon;
            return (
              <button
                key={entry.command}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={`slash-suggestion-item ${index === activeIndex ? 'active' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => applySuggestion(entry.command)}
              >
                <span className="slash-suggestion-icon">
                  <Icon size={15} strokeWidth={1.5} />
                </span>
                <span className="slash-suggestion-text">
                  <span className="slash-suggestion-name">{entry.label}</span>
                  <span className="slash-suggestion-desc">{entry.description}</span>
                </span>
                <ChevronRight size={14} strokeWidth={1.5} className="slash-suggestion-chevron" />
              </button>
            );
          })}
        </div>
      )}
      <form onSubmit={handleSubmit} className="input-box">
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
              disabled={!input.trim()}
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
