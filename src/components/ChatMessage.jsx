import { useState } from 'react';
import { 
  Layers,
  ChevronRight,
  Copy,
  Check
} from 'lucide-react';

function CodeSnippetBlock({ code, lang }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="code-block-container">
      <div className="code-header">
        <span className="code-lang">{lang || 'code'}</span>
        <button className="code-btn" onClick={handleCopy} title="Copy code">
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="code-content">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function ChatMessage({ message, onRunInCanvas }) {
  const isUser = message.role === 'user';

  const renderInlineFormattedText = (text) => {
    if (!text) return null;

    const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);

    return tokens.map((token, i) => {
      if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
        return <code key={i} className="inline-code">{token.slice(1, -1)}</code>;
      }
      if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
        return <strong key={i}>{token.slice(2, -2)}</strong>;
      }
      if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
        return <em key={i}>{token.slice(1, -1)}</em>;
      }
      return token;
    });
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
          return (
            <div key={idx} style={{ margin: '0.65rem 0' }}>
              <div 
                className="preview-action"
                onClick={() => onRunInCanvas(part.code)}
                title="Click to open app live on the right side"
              >
                <Layers size={14} style={{ color: 'var(--text-primary)' }} />
                <span>Open preview</span>
                <ChevronRight size={14} style={{ marginLeft: 'auto', color: 'var(--text-secondary)' }} />
              </div>
            </div>
          );
        }

        return <CodeSnippetBlock key={idx} code={part.code} lang={part.lang} />;
      }

      const lines = part.content.split('\n');
      return (
        <div key={idx} className="markdown-body">
          {lines.map((line, lIdx) => {
            const trimmed = line.trim();
            if (!trimmed) return <div key={lIdx} style={{ height: '0.35rem' }} />;

            if (trimmed.startsWith('# ') || trimmed.startsWith('## ') || trimmed.startsWith('### ')) {
              const headingText = trimmed.replace(/^#+\s*/, '');
              return (
                <h3 key={lIdx} className="markdown-heading">
                  {renderInlineFormattedText(headingText)}
                </h3>
              );
            }

            if (trimmed.startsWith('> ')) {
              const quoteText = trimmed.slice(2);
              return (
                <blockquote key={lIdx} className="markdown-blockquote">
                  {renderInlineFormattedText(quoteText)}
                </blockquote>
              );
            }

            if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s/.test(trimmed)) {
              const listText = trimmed.replace(/^[-*]\s+|\d+\.\s+/, '');
              return (
                <li key={lIdx} className="markdown-list-item">
                  {renderInlineFormattedText(listText)}
                </li>
              );
            }

            return (
              <p key={lIdx}>
                {renderInlineFormattedText(line)}
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
