import React from 'react';
import { 
  Layers,
  ChevronRight
} from 'lucide-react';

export default function ChatMessage({ message, onRunInCanvas }) {
  const isUser = message.role === 'user';

  const renderFormattedText = (content) => {
    if (!content) return null;

    // Detect markdown code blocks ```lang ... ```
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
          return (
            <div key={idx} style={{ margin: '0.65rem 0' }}>
              <div 
                className="thinking-pill"
                onClick={() => onRunInCanvas(part.code)}
                title="Click to open app live on the right side"
              >
                <Layers size={14} style={{ color: 'var(--text-primary)' }} />
                <span>Thinking / Created App</span>
                <span className="thinking-pill-badge">Click to Open</span>
                <ChevronRight size={14} style={{ marginLeft: 'auto', color: 'var(--text-secondary)' }} />
              </div>
            </div>
          );
        }

        return null;
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
      <div className="message-body">
        <div className="message-content">
          {renderFormattedText(message.content)}
        </div>
      </div>
    </div>
  );
}
