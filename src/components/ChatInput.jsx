import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';

export default function ChatInput({ input, setInput, onSendMessage, isStreaming, textareaRef }) {
  const internalRef = useRef(null);
  const refToUse = textareaRef || internalRef;

  useEffect(() => {
    if (refToUse.current) {
      refToUse.current.style.height = 'auto';
      refToUse.current.style.height = `${Math.min(refToUse.current.scrollHeight, 140)}px`;
    }
  }, [input]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!input.trim() || isStreaming) return;
    onSendMessage(input.trim());
    setInput('');
    if (refToUse.current) {
      refToUse.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="chat-input-container">
      <form onSubmit={handleSubmit} className="input-box">
        <textarea
          ref={refToUse}
          className="chat-textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Corez..."
          rows={1}
          disabled={isStreaming}
        />
        <div className="input-actions-bar">
          <button
            type="submit"
            className="send-btn"
            disabled={!input.trim() || isStreaming}
            title="Send Message"
          >
            <Send size={15} strokeWidth={1.5} />
          </button>
        </div>
      </form>
    </div>
  );
}
