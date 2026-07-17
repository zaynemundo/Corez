import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Code, Gamepad2, Calculator, BarChart3 } from 'lucide-react';

export default function ChatInput({ onSendMessage, isStreaming, currentModelName }) {
  const [input, setInput] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
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
    { label: 'Build Web App', prompt: 'Build an interactive web app widget with live controls and modern UI.', icon: Code },
    { label: 'Physics Game', prompt: 'Create a 2D canvas particle physics game with interactive gravity.', icon: Gamepad2 },
    { label: 'ROI Calculator', prompt: 'Build a financial ROI and compound growth investment calculator.', icon: Calculator },
    { label: 'Analytics Board', prompt: 'Build an executive analytics dashboard with interactive charts and search table.', icon: BarChart3 }
  ];

  return (
    <div className="chat-input-container">
      <form className="input-box" onSubmit={handleSubmit}>
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          placeholder={`Message ${currentModelName || 'AI'}... (e.g. "Build me an app for...")`}
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
                  <Icon size={12} />
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
            <Send size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}
