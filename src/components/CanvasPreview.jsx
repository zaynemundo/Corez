import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Code2, 
  RotateCw, 
  Maximize2, 
  Minimize2, 
  Download, 
  Copy, 
  Check, 
  X,
  Sparkles,
  Terminal
} from 'lucide-react';

export default function CanvasPreview({ 
  code, 
  onClose, 
  isFullScreen, 
  onToggleFullScreen 
}) {
  const [activeTab, setActiveTab] = useState('preview'); // 'preview' | 'code'
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
    a.download = 'app-preview.html';
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
          <Sparkles size={16} style={{ color: 'var(--accent-omni)' }} />
          <span>Live App Canvas</span>

          <div style={{ display: 'flex', background: 'var(--bg-primary)', padding: '2px', borderRadius: '8px', marginLeft: '0.75rem', border: '1px solid var(--border-color)' }}>
            <button
              onClick={() => setActiveTab('preview')}
              style={{
                padding: '3px 10px',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === 'preview' ? 'var(--accent-omni)' : 'transparent',
                color: activeTab === 'preview' ? 'white' : 'var(--text-secondary)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Preview
            </button>
            <button
              onClick={() => setActiveTab('code')}
              style={{
                padding: '3px 10px',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === 'code' ? 'var(--accent-omni)' : 'transparent',
                color: activeTab === 'code' ? 'white' : 'var(--text-secondary)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Source Code
            </button>
          </div>
        </div>

        <div className="canvas-controls">
          <button className="icon-btn" onClick={handleRefresh} title="Reload Preview">
            <RotateCw size={16} />
          </button>
          <button className="icon-btn" onClick={handleCopy} title="Copy Source Code">
            {copied ? <Check size={16} style={{ color: '#10b981' }} /> : <Copy size={16} />}
          </button>
          <button className="icon-btn" onClick={handleDownload} title="Download .html file">
            <Download size={16} />
          </button>
          <button className="icon-btn" onClick={onToggleFullScreen} title="Toggle Fullscreen">
            {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button className="icon-btn" onClick={onClose} title="Close Canvas">
            <X size={16} />
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
                padding: '1.25rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.875rem',
                resize: 'none'
              }}
              value={editableCode}
              onChange={(e) => setEditableCode(e.target.value)}
            />
          )
        ) : (
          <div className="canvas-empty-state">
            <div className="canvas-empty-icon">
              <Code2 size={28} />
            </div>
            <h3>No Active App Running</h3>
            <p style={{ maxWidth: '300px', fontSize: '0.875rem' }}>
              Ask the AI to build an app, or click <b>"Run in Canvas"</b> on any code block in the chat stream.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
