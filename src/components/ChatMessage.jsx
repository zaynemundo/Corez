import React, { useState } from 'react';
import { 
  Bot, 
  User, 
  Play, 
  Copy, 
  Check, 
  Code2, 
  Sparkles 
} from 'lucide-react';

export default function ChatMessage({ message, onRunInCanvas }) {
  const isUser = message.role === 'user';
  const [copiedIndex, setCopiedIndex] = useState(null);

  const handleCopy = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Basic markdown & code block parser
  const renderFormattedText = (content) => {
    if (!content) return null;

    // Split by code blocks ```lang ... ```
    const codeBlockRegex = /```(\w+)?\s*([\s\S]*?)```/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    let blockCount = 0;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      // Push preceding text
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
        return (
          <div key={idx} className="code-block-container">
            <div className="code-header">
              <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{part.lang}</span>
              <div className="code-actions">
                {part.isExecutable && (
                  <button 
                    className="code-btn run-btn"
                    onClick={() => onRunInCanvas(part.code)}
                  >
                    <Play size={12} fill="currentColor" />
                    <span>Run in Canvas</span>
                  </button>
                )}
                <button 
                  className="code-btn"
                  onClick={() => handleCopy(part.code, part.index)}
                >
                  {copiedIndex === part.index ? <Check size={12} style={{ color: '#10b981' }} /> : <Copy size={12} />}
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

      // Render standard paragraphs and inline markdown
      const lines = part.content.split('\n');
      return (
        <div key={idx} className="markdown-body">
          {lines.map((line, lIdx) => {
            if (!line.trim()) return <div key={lIdx} style={{ height: '0.5rem' }} />;
            
            // Format inline bold **text**
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
        {isUser ? <User size={18} /> : <Sparkles size={18} />}
      </div>

      <div className="message-body">
        <div className="message-content">
          {renderFormattedText(message.content)}
        </div>
      </div>
    </div>
  );
}
