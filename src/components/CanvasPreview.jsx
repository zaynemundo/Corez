import React, { useState, useEffect } from 'react';
import { 
  Code2, 
  RotateCw, 
  Maximize2, 
  Minimize2, 
  Download, 
  Copy, 
  Check, 
  X,
  Layers
} from 'lucide-react';

export default function CanvasPreview({ 
  code, 
  onClose, 
  isFullScreen, 
  onToggleFullScreen 
}) {
  const [activeTab, setActiveTab] = useState('preview');
  const [editableCode, setEditableCode] = useState(code || '');
  const [copied, setCopied] = useState(false);
  const [key, setKey] = useState(0);

  useEffect(() => {
    setEditableCode(code || '');
    setKey(prev => prev + 1);
  }, [code]);

  const handleCopy = () => {
    navigator.clipboard.writeText(editableCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([editableCode], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'corez-app.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRefresh = () => {
    setKey(prev => prev + 1);
  };

  return (
    <div className={`canvas-pane ${isFullScreen ? 'full-width' : ''}`}>
      <div className="canvas-header">
        <div className="canvas-title">
          <Layers size={15} />
          <span>Canvas Preview</span>

          <div style={{ display: 'flex', background: 'var(--bg-tertiary)', padding: '2px', borderRadius: '4px', marginLeft: '0.5rem', border: '1px solid var(--border-color)' }}>
            <button
              onClick={() => setActiveTab('preview')}
              style={{
                padding: '2px 8px',
                borderRadius: '3px',
                border: 'none',
                background: activeTab === 'preview' ? 'var(--text-primary)' : 'transparent',
                color: activeTab === 'preview' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                fontSize: '0.725rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Preview
            </button>
            <button
              onClick={() => setActiveTab('code')}
              style={{
                padding: '2px 8px',
                borderRadius: '3px',
                border: 'none',
                background: activeTab === 'code' ? 'var(--text-primary)' : 'transparent',
                color: activeTab === 'code' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                fontSize: '0.725rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Source
            </button>
          </div>
        </div>

        <div className="canvas-controls">
          <button className="icon-btn" onClick={handleRefresh} title="Reload Preview">
            <RotateCw size={14} />
          </button>
          <button className="icon-btn" onClick={handleCopy} title="Copy Source Code">
            {copied ? <Check size={14} style={{ color: '#ffffff' }} /> : <Copy size={14} />}
          </button>
          <button className="icon-btn" onClick={handleDownload} title="Download .html file">
            <Download size={14} />
          </button>
          <button className="icon-btn" onClick={onToggleFullScreen} title="Toggle Fullscreen">
            {isFullScreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button className="icon-btn" onClick={onClose} title="Close Canvas">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="canvas-body">
        {editableCode ? (
          activeTab === 'preview' ? (
            <iframe
              key={key}
              title="Live Application Preview"
              srcDoc={editableCode}
              className="preview-iframe"
              sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
            />
          ) : (
            <textarea
              className="code-content"
              style={{
                width: '100%',
                height: '100%',
                background: 'var(--code-bg)',
                color: '#e2e8f0',
                border: 'none',
                outline: 'none',
                padding: '1rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.825rem',
                resize: 'none'
              }}
              value={editableCode}
              onChange={(e) => setEditableCode(e.target.value)}
            />
          )
        ) : (
          <div className="canvas-empty-state">
            <div className="canvas-empty-icon">
              <Code2 size={22} />
            </div>
            <h3 style={{ fontSize: '0.95rem' }}>No Active App Running</h3>
            <p style={{ maxWidth: '280px', fontSize: '0.8rem' }}>
              Ask Corez to build an application or click <b>"Run in Canvas"</b> on any code block.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
