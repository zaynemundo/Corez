import React, { useState, useRef, useEffect } from 'react';
import { Send, Code, Gamepad2, Calculator, BarChart3 } from 'lucide-react';

export default function ChatInput({ onSendMessage, isStreaming }) {
  const [input, setInput] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  }, [input]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!input.trim() || isStreaming) return;
    onSendMessage(input.trim());
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const quickTools = [
    { label: 'Web App', prompt: 'Build an interactive web app widget with live controls.', icon: Code },
    { label: 'Physics Game', prompt: 'Build a monochrome 2D particle physics simulation with interactive mouse gravity attractor.', icon: Gamepad2 },
    { label: 'Analytics Board', prompt: 'Build an executive analytics dashboard with monochrome styling, stark SVG chart, and live search.', icon: BarChart3 }
  ];

  return (
    <div className="chat-input-container">
      <form className="input-box" onSubmit={handleSubmit}>
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          placeholder="Message Corez... (e.g. 'Build an executive analytics app')"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />

        <div className="input-actions-bar">
          <div className="quick-tools">
            {quickTools.map((t, idx) => {
              const Icon = t.icon;
              return (
                <button
                  key={idx}
                  type="button"
                  className="tool-pill"
                  onClick={() => onSendMessage(t.prompt)}
                >
                  <Icon size={11} />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="submit"
            className="send-btn"
            disabled={!input.trim() || isStreaming}
            title="Send Message"
          >
            <Send size={14} />
          </button>
        </div>
      </form>
    </div>
  );
}
