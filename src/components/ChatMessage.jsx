import React, { useState } from 'react';
import { 
  User, 
  Play, 
  Copy, 
  Check, 
  Layers,
  ChevronRight,
  Code2,
  ChevronDown
} from 'lucide-react';

export default function ChatMessage({ message, onRunInCanvas }) {
  const isUser = message.role === 'user';
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [showSourceIndex, setShowSourceIndex] = useState(null);

  const handleCopy = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const toggleSource = (index) => {
    setShowSourceIndex(showSourceIndex === index ? null : index);
  };

  const renderFormattedText = (content) => {
    if (!content) return null;

    const codeBlockRegex = /```(\w+)?\s*([\s\S]*?)```/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    let blockCount = 0;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: content.slice(lastIndex, match.index)
        });
      }

      const lang = match[1] || 'code';
      const code = match[2].trim();
      const isExecutable = lang.toLowerCase() === 'html' || lang.toLowerCase() === 'xml' || code.includes('<html') || code.includes('<div') || code.includes('<script');

      parts.push({
        type: 'code',
        lang: lang,
        code: code,
        isExecutable: isExecutable,
        index: blockCount++
      });

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      parts.push({
        type: 'text',
        content: content.slice(lastIndex)
      });
    }

    return parts.map((part, idx) => {
      if (part.type === 'code') {
        if (part.isExecutable) {
          const isShowingSource = showSourceIndex === part.index;
          return (
            <div key={idx} style={{ margin: '0.65rem 0' }}>
              {/* ChatGPT-style Thinking / Creating App Pill Bar */}
              <div 
                className="thinking-pill"
                onClick={() => onRunInCanvas(part.code)}
                title="Click to open or focus live app output on the right"
              >
                <Layers size={14} style={{ color: 'var(--text-primary)' }} />
                <span>Thinking / Creating App</span>
                <span className="thinking-pill-badge">Live Canvas Output</span>
                <ChevronRight size={14} style={{ marginLeft: 'auto', color: 'var(--text-secondary)' }} />
              </div>

              {/* Source Toggle */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                <button 
                  className="source-toggle-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSource(part.index);
                  }}
                >
                  <Code2 size={12} />
                  <span>{isShowingSource ? 'Hide Source' : 'Inspect Source'}</span>
                  {isShowingSource ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
              </div>

              {isShowingSource && (
                <div className="code-block-container" style={{ marginTop: '0.4rem' }}>
                  <div className="code-header">
                    <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{part.lang}</span>
                    <div className="code-actions">
                      <button 
                        className="code-btn run-btn"
                        onClick={() => onRunInCanvas(part.code)}
                      >
                        <Play size={11} fill="currentColor" />
                        <span>Run in Canvas</span>
                      </button>
                      <button 
                        className="code-btn"
                        onClick={() => handleCopy(part.code, part.index)}
                      >
                        {copiedIndex === part.index ? <Check size={11} /> : <Copy size={11} />}
                        <span>{copiedIndex === part.index ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                  <pre className="code-content">
                    <code>{part.code}</code>
                  </pre>
                </div>
              )}
            </div>
          );
        }

        return (
          <div key={idx} className="code-block-container">
            <div className="code-header">
              <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{part.lang}</span>
              <div className="code-actions">
                <button 
                  className="code-btn"
                  onClick={() => handleCopy(part.code, part.index)}
                >
                  {copiedIndex === part.index ? <Check size={11} /> : <Copy size={11} />}
                  <span>{copiedIndex === part.index ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
            <pre className="code-content">
              <code>{part.code}</code>
            </pre>
          </div>
        );
      }

      const lines = part.content.split('\n');
      return (
        <div key={idx} className="markdown-body">
          {lines.map((line, lIdx) => {
            if (!line.trim()) return <div key={lIdx} style={{ height: '0.4rem' }} />;
            
            const parts = line.split(/(\*\*.*?\*\*)/g);
            return (
              <p key={lIdx}>
                {parts.map((p, pIdx) => {
                  if (p.startsWith('**') && p.endsWith('**')) {
                    return <strong key={pIdx}>{p.slice(2, -2)}</strong>;
                  }
                  return p;
                })}
              </p>
            );
          })}
        </div>
      );
    });
  };

  return (
    <div className={`message-wrapper ${isUser ? 'user' : 'ai'}`}>
      <div className={`avatar ${isUser ? 'user' : 'ai'}`}>
        {isUser ? <User size={15} /> : <Layers size={14} />}
      </div>

      <div className="message-body">
        <div className="message-content">
          {renderFormattedText(message.content)}
        </div>
      </div>
    </div>
  );
}
