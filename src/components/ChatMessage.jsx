import { useEffect, useRef, useState } from 'react';
import { 
  Layers,
  Copy,
  Check,
  Wand2,
  ThumbsUp,
  ThumbsDown,
  Share2
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

// A code block only gets "Open Canvas Preview" / "Revise" actions when it is a
// genuine runnable deliverable (a full HTML page or a React/JSX component).
// Generic Q&A snippets — small functions, imports, data samples, or fragments
// shown as examples in an informational answer — stay as plain copyable code.
function isExecutableCodeBlock(lang, code) {
  const normalizedLang = (lang || '').toLowerCase();
  const text = code || '';

  // Full HTML documents, with or without an explicit language tag.
  if (/^\s*<!DOCTYPE html/i.test(text) || /^\s*<html[\s>]/i.test(text)) return true;

  // React/JSX blocks are app deliverables by output contract.
  if (['jsx', 'tsx', 'react'].includes(normalizedLang)) {
    return true;
  }

  // HTML blocks only count as pages when they carry document structure
  // (inline <style>/<script>/<body>), not when they are small markup
  // examples inside a general answer.
  if (normalizedLang === 'html') {
    return (/<style[\s>]/i.test(text) && /<\/style>/i.test(text))
      || (/<script[\s>]/i.test(text) && /<\/script>/i.test(text))
      || /<body[\s>]/i.test(text);
  }

  // Plain JS is executable only when it mounts React or renders to the DOM
  // as a standalone app — helper snippets from explanations are excluded.
  if (['js', 'javascript'].includes(normalizedLang)) {
    return /ReactDOM\.render\s*\(|createRoot\s*\(|hydrateRoot\s*\(/.test(text)
      || (/export\s+default/.test(text) && /<\w[\s>]/.test(text));
  }

  return false;
}

function CodeSnippetBlock({ code, lang, onRunInCanvas, onReviseCode }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).catch(() => {});
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
            boxShadow: 'none',
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

function MessageActions({ content }) {
  const [copied, setCopied] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [rating, setRating] = useState(null);
  const [shared, setShared] = useState(false);
  const rateWrapperRef = useRef(null);

  useEffect(() => {
    if (!rateOpen) return;
    const handleOutsideClick = (event) => {
      if (rateWrapperRef.current && !rateWrapperRef.current.contains(event.target)) {
        setRateOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [rateOpen]);

  const handleCopy = async () => {
    if (!content) return;
    if (!navigator.clipboard) return;
    // A standalone image message copies as its absolute image URL so pasting
    // shows the picture link instead of raw markdown like ![](/api/assets/...).
    const imgMatch = content.match(/^!\[(.*?)\]\((.*?)\)\s*$/);
    const text = imgMatch ? new URL(imgMatch[2], window.location.origin).href : content;
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRateToggle = () => {
    setRateOpen(prev => !prev);
  };

  const handleRateChoice = (choice) => {
    setRating(prev => prev === choice ? null : choice);
    setRateOpen(false);
  };

  const handleShare = async () => {
    const imgMatch = content.match(/^!\[(.*?)\]\((.*?)\)\s*$/);
    const shareData = {
      title: 'COREZ AI Response',
      text: imgMatch ? new URL(imgMatch[2], window.location.origin).href : content
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      } catch { /* Dismissed by the user */ }
      return;
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(content).catch(() => {});
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    }
  };

  return (
    <div className="message-actions" aria-label="Message actions">
      <button
        type="button"
        className={`message-action-btn ${copied ? 'active' : ''}`}
        onClick={handleCopy}
        title="Copy response"
        aria-label="Copy response"
      >
        {copied ? <Check size={14} strokeWidth={1.5} /> : <Copy size={14} strokeWidth={1.5} />}
      </button>
      <div className="rate-wrapper" ref={rateWrapperRef}>
        <button
          type="button"
          className={`message-action-btn ${rating ? 'active' : ''}`}
          onClick={handleRateToggle}
          title={rating ? (rating === 'good' ? 'Good response (click to change)' : 'Bad response (click to change)') : 'Rate response'}
          aria-label={rating ? 'Change rating' : 'Rate response'}
          aria-pressed={!!rating}
          aria-expanded={rateOpen}
          aria-haspopup="true"
        >
          {rating === 'good' ? <ThumbsUp size={14} strokeWidth={1.5} /> : rating === 'bad' ? <ThumbsDown size={14} strokeWidth={1.5} /> : <ThumbsUp size={14} strokeWidth={1.5} />}
        </button>
        {rateOpen && (
          <div className="rate-options" role="group" aria-label="Rate this response">
            <button
              type="button"
              className={`rate-option-btn ${rating === 'good' ? 'active good' : ''}`}
              onClick={() => handleRateChoice('good')}
              title="Good response"
              aria-label="Good response"
              aria-pressed={rating === 'good'}
            >
              <ThumbsUp size={13} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              className={`rate-option-btn ${rating === 'bad' ? 'active bad' : ''}`}
              onClick={() => handleRateChoice('bad')}
              title="Bad response"
              aria-label="Bad response"
              aria-pressed={rating === 'bad'}
            >
              <ThumbsDown size={13} strokeWidth={1.5} />
            </button>
          </div>
        )}
      </div>
      <button
        type="button"
        className={`message-action-btn ${shared ? 'active' : ''}`}
        onClick={handleShare}
        title={shared ? 'Copied' : 'Share response'}
        aria-label={shared ? 'Copied' : 'Share response'}
      >
        <Share2 size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}

export default function ChatMessage({ message, onRunInCanvas, onReviseCode, onRefreshMarket, marketRefreshing = false }) {
  const isUser = message.role === 'user';

  const renderAttachments = (attachments) => {
    if (!Array.isArray(attachments) || attachments.length === 0) return null;
    return (
      <div className="message-attachments" aria-label="Attached files">
        {attachments.map((attachment) => (
          <span key={attachment.id || attachment.name} className="message-attachment-chip">
            {attachment.thumb && (
              <img src={attachment.thumb} alt="" className="attachment-chip-thumb" />
            )}
            <span className="chip-filename" title={attachment.name}>
              {attachment.name}
            </span>
          </span>
        ))}
      </div>
    );
  };

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
        const href = safeHref(linkMatch[2]);
        const isLinkedIn = /linkedin\.com/i.test(linkMatch[2]);
        return (
          <a key={i} href={href} target="_blank" rel="noopener noreferrer" className={`markdown-link${isLinkedIn ? ' linkedin-link' : ''}`}>
            {isLinkedIn && (
              <svg className="linkedin-icon" viewBox="-2 -2 24 24" width="14" height="14" role="img" aria-label="LinkedIn" xmlns="http://www.w3.org/2000/svg">
                <path fill="currentColor" d="M19.959 11.719v7.379h-4.278v-6.885c0-1.73-.619-2.91-2.167-2.91-1.182 0-1.886.796-2.195 1.565-.113.275-.142.658-.142 1.043v7.187h-4.28s.058-11.66 0-12.869h4.28v1.824l-.028.042h.028v-.042c.568-.875 1.583-2.126 3.856-2.126 2.815 0 4.926 1.84 4.926 5.792zM2.421.026C.958.026 0 .986 0 2.249c0 1.235.93 2.224 2.365 2.224h.028c1.493 0 2.42-.989 2.42-2.224C4.787.986 3.887.026 2.422.026zM.254 19.098h4.278V6.229H.254v12.869z" />
              </svg>
            )}
            {linkMatch[1]}
          </a>
        );
      }

      if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
        return <code key={i} className="inline-code">{token.slice(1, -1)}</code>;
      }
      if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
        return <strong key={i}>{renderInlineFormattedText(token.slice(2, -2))}</strong>;
      }
      if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
        return <em key={i}>{renderInlineFormattedText(token.slice(1, -1))}</em>;
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

      // Horizontal rule: a line made only of dashes/asterisks/underscores
      // (e.g. "---", "* * *") becomes a visual divider instead of raw text.
      if (/^(\s*[-*_]\s*){3,}$/.test(trimmed)) {
        elements.push(<hr key={`hr-${i}`} className="markdown-hr" />);
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
        const level = Math.min(3, trimmed.match(/^(#+)/)[1].length);
        const headingText = trimmed.replace(/^#+\s*/, '');
        const HeadingTag = level === 1 ? 'h2' : level === 2 ? 'h3' : 'h4';
        elements.push(
          <HeadingTag key={`h-${i}`} className={`markdown-heading level-${level}`}>
            {renderInlineFormattedText(headingText)}
          </HeadingTag>
        );
        i++;
        continue;
      }

      // Blockquote, upgraded to a callout when it opens with a bold keyword
      // ("**Note:** ...", "**Tip:** ...") or a status emoji.
      if (trimmed.startsWith('> ')) {
        const quoteText = trimmed.slice(2);
        const CALL_OUT_TYPES = ['note', 'info', 'tip', 'warning', 'caution', 'important', 'danger', 'success'];
        // "**Note:** ..." (colon inside the bold) or "**Tip** — ..." (separator outside).
        const calloutMatch = quoteText.match(/^\*\*([A-Za-z]+):?\*\*\s*[:—-]?\s*/i);
        const keyword = calloutMatch ? calloutMatch[1].toLowerCase() : null;
        const calloutType = keyword && CALL_OUT_TYPES.includes(keyword) ? keyword : null;
        const emojiMatch = !calloutType && quoteText.match(/^(💡|ℹ️|⚠️|❌|✅|🔥|🚀|📌)\s*/);
        const isCallout = !!calloutType || !!emojiMatch;
        const body = calloutType
          ? quoteText.slice(calloutMatch[0].length)
          : emojiMatch
            ? quoteText.slice(emojiMatch[0].length)
            : quoteText;
        const typeClass = calloutType ? `callout-${calloutType === 'caution' ? 'warning' : calloutType}` : '';
        elements.push(
          <blockquote key={`q-${i}`} className={`markdown-blockquote ${isCallout ? `markdown-callout ${typeClass}`.trim() : ''}`.trim()}>
            {calloutType && <strong className="callout-label">{calloutMatch[1]}</strong>}
            {renderInlineFormattedText(body)}
          </blockquote>
        );
        i++;
        continue;
      }

      // List detection: group consecutive bullet or numbered items into a real
      // <ul>/<ol> with styled markers; "[x]"/"[ ]" task items become checkboxes.
      const listItemMatch = trimmed.match(/^([-*]|\d+\.)\s+(.*)$/);
      if (listItemMatch) {
        const ordered = /^\d+\.\s/.test(trimmed);
        const items = [];
        while (i < lines.length) {
          const innerLine = lines[i].trim();
          const innerMatch = innerLine.match(/^([-*]|\d+\.)\s+(.*)$/);
          if (!innerMatch || (ordered && !/^\d+\.\s/.test(innerLine)) || (!ordered && !/^[-*]\s/.test(innerLine))) break;
          items.push(innerMatch[2]);
          i++;
        }
        const ListTag = ordered ? 'ol' : 'ul';
        elements.push(
          <ListTag key={`list-${i}`} className={`markdown-list ${ordered ? 'ordered' : ''}`}>
            {items.map((itemText, itemIdx) => {
              const taskMatch = itemText.match(/^\[([ xX])\]\s+(.*)$/);
              if (taskMatch) {
                const checked = taskMatch[1].toLowerCase() === 'x';
                return (
                  <li key={itemIdx} className="markdown-list-item markdown-task-list-item">
                    <span className={`markdown-checkbox ${checked ? 'checked' : ''}`} aria-hidden="true">
                      {checked && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span className={checked ? 'markdown-task-done' : ''}>
                      {renderInlineFormattedText(taskMatch[2])}
                    </span>
                  </li>
                );
              }
              return (
                <li key={itemIdx} className="markdown-list-item">
                  {renderInlineFormattedText(itemText)}
                </li>
              );
            })}
          </ListTag>
        );
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
      const isExecutable = isExecutableCodeBlock(lang, code);

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
            <>
              {isUser && renderAttachments(message.attachments)}
              {renderFormattedText(message.content)}
            </>
          )}
        </div>
        {!isUser && (
          <MessageActions content={message.content || ''} />
        )}
      </div>
    </div>
  );
}
