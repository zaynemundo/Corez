import { useRef, useEffect } from 'react';
import { Send, Square } from 'lucide-react';

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

  useEffect(() => {
    if (refToUse.current) {
      refToUse.current.style.height = 'auto';
      refToUse.current.style.height = `${Math.min(refToUse.current.scrollHeight, 140)}px`;
    }
  }, [input]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (isStreaming) {
      if (onStopMessage) onStopMessage();
      return;
    }
    if (!input.trim()) return;
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
