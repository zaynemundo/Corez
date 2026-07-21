import { useState } from 'react';
import { 
  Layers,
  ChevronRight,
  Copy,
  Check,
  Wand2
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
          {copied ? <Check size={12} strokeWidth={1.5} /> : <Copy size={12} strokeWidth={1.5} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="code-content">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function ChatMessage({ message, onRunInCanvas, onReviseCode }) {
  const isUser = message.role === 'user';

  const renderInlineFormattedText = (text) => {
    if (!text) return null;

    // Tokenize markdown links [text](url), images ![alt](url), code, bold, italic
    const regex = /(!?\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
    const tokens = text.split(regex);

    return tokens.map((token, i) => {
      if (!token) return null;

      // Image token ![alt](url)
      const imgMatch = token.match(/^!\[(.*?)\]\((.*?)\)$/);
      if (imgMatch) {
        return (
          <span key={i} className="markdown-inline-img-wrapper">
            <img src={imgMatch[2]} alt={imgMatch[1]} className="markdown-inline-img" />
          </span>
        );
      }

      // Link token [text](url)
      const linkMatch = token.match(/^\[(.*?)\]\((.*?)\)$/);
      if (linkMatch) {
        return (
          <a key={i} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="markdown-link">
            {linkMatch[1]}
          </a>
        );
      }

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

  const parseTableBlock = (tableLines) => {
    if (tableLines.length < 2) return null;
    const parseRow = (line) => {
      const trimmed = line.trim().replace(/^\||\|$/g, '');
      return trimmed.split('|').map(cell => cell.trim());
    };

    const headers = parseRow(tableLines[0]);
    const bodyRows = tableLines.slice(2).map(parseRow);

    return { headers, bodyRows };
  };

  const renderTextAndTables = (textBlock) => {
    const lines = textBlock.split('\n');
    const elements = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // Table detection: line starting with | and next line is delimiter |---|
      if (trimmed.startsWith('|') && i + 1 < lines.length && /^\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?$/.test(lines[i + 1].trim())) {
        const tableLines = [lines[i], lines[i + 1]];
        i += 2;
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          tableLines.push(lines[i]);
          i++;
        }
        const tableData = parseTableBlock(tableLines);
        if (tableData) {
          elements.push(
            <div key={`table-${i}`} className="markdown-table-wrapper">
              <table className="markdown-table">
                <thead>
                  <tr>
                    {tableData.headers.map((h, hIdx) => (
                      <th key={hIdx}>{renderInlineFormattedText(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableData.bodyRows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx}>{renderInlineFormattedText(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
          continue;
        }
      }

      if (!trimmed) {
        elements.push(<div key={`blank-${i}`} style={{ height: '0.35rem' }} />);
        i++;
        continue;
      }

      // Standalone Image ![caption](url)
      const standaloneImgMatch = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
      if (standaloneImgMatch) {
        elements.push(
          <div key={`img-${i}`} className="markdown-image-wrapper">
            <img src={standaloneImgMatch[2]} alt={standaloneImgMatch[1]} className="markdown-image" />
            {standaloneImgMatch[1] && <span className="markdown-image-caption">{standaloneImgMatch[1]}</span>}
          </div>
        );
        i++;
        continue;
      }

      if (trimmed.startsWith('# ') || trimmed.startsWith('## ') || trimmed.startsWith('### ')) {
        const headingText = trimmed.replace(/^#+\s*/, '');
        elements.push(
          <h3 key={`h-${i}`} className="markdown-heading">
            {renderInlineFormattedText(headingText)}
          </h3>
        );
        i++;
        continue;
      }

      if (trimmed.startsWith('> ')) {
        const quoteText = trimmed.slice(2);
        elements.push(
          <blockquote key={`q-${i}`} className="markdown-blockquote">
            {renderInlineFormattedText(quoteText)}
          </blockquote>
        );
        i++;
        continue;
      }

      if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s/.test(trimmed)) {
        const listText = trimmed.replace(/^[-*]\s+|\d+\.\s+/, '');
        elements.push(
          <li key={`li-${i}`} className="markdown-list-item">
            {renderInlineFormattedText(listText)}
          </li>
        );
        i++;
        continue;
      }

      elements.push(
        <p key={`p-${i}`}>
          {renderInlineFormattedText(line)}
        </p>
      );
      i++;
    }

    return elements;
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
        if (part.isExecutable && !isUser) {
          return (
            <div key={idx} style={{ margin: '0.65rem 0', display: 'flex', gap: '0.5rem' }}>
              <div 
                className="preview-action"
                style={{ flex: 1, display: 'flex', justifyContent: 'center' }}
                onClick={() => onRunInCanvas(part.code)}
                title="Click to open app live on the right side"
              >
                <Layers size={14} strokeWidth={1.5} style={{ color: 'var(--text-primary)' }} />
                <span>Open preview</span>
              </div>
              <div 
                className="preview-action"
                style={{ flex: 1, display: 'flex', justifyContent: 'center', backgroundColor: 'var(--bg-tertiary)' }}
                onClick={() => {
                  if (onReviseCode) {
                    onReviseCode(part.code);
                  }
                }}
                title="Ask AI to modify this code"
              >
                <Wand2 size={14} strokeWidth={1.5} style={{ color: 'var(--text-primary)' }} />
                <span>Revise</span>
              </div>
            </div>
          );
        }
        
        if (isUser) {
          return (
            <div key={idx} style={{ 
              margin: '0.4rem 0', 
              padding: '0.4rem 0.65rem',
              backgroundColor: 'rgba(0,0,0,0.15)', 
              border: '1px solid var(--border-color)', 
              borderRadius: 'var(--radius-sm)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              color: 'var(--text-secondary)',
              fontSize: '0.75rem'
            }}>
              <Layers size={14} strokeWidth={1.5} />
              <span>Attached code block ({part.code.split('\n').length} lines)</span>
            </div>
          );
        }

        return <CodeSnippetBlock key={idx} code={part.code} lang={part.lang} />;
      }

      return (
        <div key={idx} className="markdown-body">
          {renderTextAndTables(part.content)}
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
