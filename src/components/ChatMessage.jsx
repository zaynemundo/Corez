import { useState } from 'react';
import { 
  Layers,
  Copy,
  Check,
  Wand2
} from 'lucide-react';
import MarketCard from './MarketCard';

function safeImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('https://') || url.startsWith('http://')) return url;
  // Same-origin relative paths (e.g. the worker's R2 asset URLs like /api/assets/flux_*.png)
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  if (url.startsWith('data:image/png') || url.startsWith('data:image/jpeg') || url.startsWith('data:image/webp') || url.startsWith('data:image/svg+xml')) return url;
  return '';
}

function safeHref(url) {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('mailto:') || url.startsWith('#')) return url;
  return '';
}

function CodeSnippetBlock({ code, lang, onRunInCanvas, onReviseCode }) {
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
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          {onRunInCanvas && (
            <button 
              className="code-btn"
              style={{ 
                padding: '0.35rem 0.75rem', 
                background: 'var(--text-primary)', 
                color: 'var(--bg-primary)',
                fontWeight: 600,
                fontSize: '0.75rem',
                borderRadius: '5px',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
              onClick={() => onRunInCanvas(code)}
              title="Run app live in preview canvas"
            >
              <Layers size={13} strokeWidth={2} />
              <span>Open preview</span>
            </button>
          )}
          {onReviseCode && (
            <button 
              className="code-btn"
              style={{
                padding: '0.35rem 0.65rem',
                fontSize: '0.75rem',
                borderRadius: '5px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
              onClick={() => onReviseCode(code)}
              title="Ask AI to revise this code"
            >
              <Wand2 size={13} strokeWidth={1.5} />
              <span>Revise</span>
            </button>
          )}
          <button className="code-btn" onClick={handleCopy} title="Copy code">
            {copied ? <Check size={12} strokeWidth={1.5} /> : <Copy size={12} strokeWidth={1.5} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>
      <pre className="code-content">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function ExecutableCodeBlock({ code, onRunInCanvas, onReviseCode }) {
  return (
    <div className="executable-code-action-bar" style={{
      margin: '0.75rem 0',
      width: '100%',
      display: 'flex',
      gap: '0.6rem',
      alignItems: 'stretch'
    }}>
      {onRunInCanvas && (
        <button 
          className="code-btn primary-preview-btn"
          style={{ 
            flex: 1,
            padding: '0.75rem 1rem', 
            background: 'var(--text-primary)', 
            color: 'var(--bg-primary)',
            fontWeight: 600,
            fontSize: '0.875rem',
            borderRadius: 'var(--radius-md, 12px)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            transition: 'var(--transition-fast)'
          }}
          onClick={() => onRunInCanvas(code)}
          title="Run app live in preview canvas"
        >
          <Layers size={16} strokeWidth={2} />
          <span>Open Canvas Preview</span>
        </button>
      )}
      {onReviseCode && (
        <button 
          className="code-btn secondary-revise-btn"
          style={{ 
            flex: 1,
            padding: '0.75rem 1rem', 
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            fontWeight: 500,
            fontSize: '0.875rem',
            borderRadius: 'var(--radius-md, 12px)',
            border: '1px solid var(--border-color)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            transition: 'var(--transition-fast)'
          }}
          onClick={() => onReviseCode(code)}
          title="Ask AI to revise this code"
        >
          <Wand2 size={16} strokeWidth={1.5} />
          <span>Revise</span>
        </button>
      )}
    </div>
  );
}

export default function ChatMessage({ message, onRunInCanvas, onReviseCode, onRefreshMarket, marketRefreshing = false }) {
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
            <img src={safeImageUrl(imgMatch[2])} alt={imgMatch[1]} className="markdown-inline-img" />
          </span>
        );
      }

      // Link token [text](url)
      const linkMatch = token.match(/^\[(.*?)\]\((.*?)\)$/);
      if (linkMatch) {
        return (
          <a key={i} href={safeHref(linkMatch[2])} target="_blank" rel="noopener noreferrer" className="markdown-link">
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
            <img src={safeImageUrl(standaloneImgMatch[2])} alt={standaloneImgMatch[1]} className="markdown-image" />
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
      const isExecutable = ['html', 'xml', 'jsx', 'tsx', 'js', 'javascript', 'react'].includes(lang.toLowerCase()) || code.includes('<') || code.includes('export default') || code.includes('function ') || code.includes('import ');

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
            <ExecutableCodeBlock
              key={idx}
              code={part.code}
              lang={part.lang}
              onRunInCanvas={onRunInCanvas}
              onReviseCode={onReviseCode}
            />
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
          {message.type === 'market' ? (
            <MarketCard
              market={message.market}
              request={message.request}
              onRefresh={onRefreshMarket}
              refreshing={marketRefreshing}
            />
          ) : (
            renderFormattedText(message.content)
          )}
        </div>
      </div>
    </div>
  );
}
