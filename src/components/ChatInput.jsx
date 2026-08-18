import { useRef, useEffect, useState } from 'react';
import { Send, Square, ChevronRight, Globe, Gamepad2, Search, Image as ImageIcon, X } from 'lucide-react';
import { PlusIcon } from './icons';
import { processFiles, formatBytes, hasFiles } from '../utils/fileAttachmentUtils';

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

export default function ChatInput({ 
  input, 
  setInput, 
  onSendMessage, 
  onStopMessage, 
  isStreaming, 
  textareaRef,
  attachments: externalAttachments,
  setAttachments: externalSetAttachments,
  onAddFiles
}) {
  const internalRef = useRef(null);
  const refToUse = textareaRef || internalRef;
  const [showSuggestions, setShowSuggestions] = useState(() => String(input || '').startsWith('@'));
  const [activeIndex, setActiveIndex] = useState(0);
  const suggestionsRef = useRef(null);
  const fileInputRef = useRef(null);

  const [internalAttachments, setInternalAttachments] = useState([]);
  const attachments = externalAttachments !== undefined ? externalAttachments : internalAttachments;
  const setAttachments = externalSetAttachments || setInternalAttachments;

  const [isDragOverInput, setIsDragOverInput] = useState(false);
  const dragInputCounterRef = useRef(0);

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
    const files = event.target.files;
    if (!files || files.length === 0) return;
    processFiles(files, setAttachments);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (refToUse.current) {
      refToUse.current.focus();
    }
  };

  const removeAttachment = (id) => {
    setAttachments(prev => (prev || []).filter(a => a.id !== id));
  };

  const handleInputDragEnter = (e) => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    dragInputCounterRef.current += 1;
    setIsDragOverInput(true);
  };

  const handleInputDragLeave = (e) => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    dragInputCounterRef.current = Math.max(0, dragInputCounterRef.current - 1);
    if (dragInputCounterRef.current === 0) {
      setIsDragOverInput(false);
    }
  };

  const handleInputDragOver = (e) => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleInputDrop = (e) => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    dragInputCounterRef.current = 0;
    setIsDragOverInput(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFiles(files, setAttachments);
      if (onAddFiles) onAddFiles(files);
      if (refToUse.current) {
        refToUse.current.focus();
      }
    }
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
      <form
        onSubmit={handleSubmit}
        className={`input-box ${isDragOverInput ? 'drag-over' : ''}`}
        onDragEnter={handleInputDragEnter}
        onDragOver={handleInputDragOver}
        onDragLeave={handleInputDragLeave}
        onDrop={handleInputDrop}
      >
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
