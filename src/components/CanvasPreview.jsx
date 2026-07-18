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
  Layers,
  Monitor,
  Laptop,
  Tablet,
  Smartphone
} from 'lucide-react';

export default function CanvasPreview({ 
  code, 
  onClose, 
  isFullScreen, 
  onToggleFullScreen 
}) {
  const [activeTab, setActiveTab] = useState('preview');
  const [deviceMode, setDeviceMode] = useState('desktop'); // 'desktop' | 'laptop' | 'tablet' | 'mobile'
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

  // Device dimension map
  const deviceSpecs = {
    desktop: { label: 'Desktop', width: '100%', height: '100%', res: 'Fluid / 1920px' },
    laptop: { label: 'Laptop', width: '1100px', height: '680px', res: '1366 × 768' },
    tablet: { label: 'Tablet', width: '768px', height: '900px', res: '768 × 1024' },
    mobile: { label: 'Mobile', width: '375px', height: '720px', res: '375 × 812' }
  };

  return (
    <div className={`canvas-pane ${isFullScreen ? 'full-width' : ''}`}>
      <div className="canvas-header">
        <div className="canvas-title">
          <Layers size={15} />
          <span>Canvas Preview</span>

          {/* View Mode: Preview vs Source */}
          <div style={{ display: 'flex', background: 'var(--bg-tertiary)', padding: '2px', borderRadius: 'var(--radius-pill)', marginLeft: '0.5rem', border: '1px solid var(--border-color)' }}>
            <button
              onClick={() => setActiveTab('preview')}
              style={{
                padding: '3px 10px',
                borderRadius: 'var(--radius-pill)',
                border: 'none',
                background: activeTab === 'preview' ? 'var(--text-primary)' : 'transparent',
                color: activeTab === 'preview' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                fontSize: '0.725rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'var(--transition-fast)'
              }}
            >
              Preview
            </button>
            <button
              onClick={() => setActiveTab('code')}
              style={{
                padding: '3px 10px',
                borderRadius: 'var(--radius-pill)',
                border: 'none',
                background: activeTab === 'code' ? 'var(--text-primary)' : 'transparent',
                color: activeTab === 'code' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                fontSize: '0.725rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'var(--transition-fast)'
              }}
            >
              Source
            </button>
          </div>
        </div>

        {/* Device Viewport Selector (Desktop vs Laptop vs Tablet vs Mobile) */}
        {activeTab === 'preview' && (
          <div className="device-mode-bar" style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-tertiary)', padding: '2px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--border-color)', gap: '2px' }}>
            <button
              onClick={() => setDeviceMode('desktop')}
              title="Desktop Screen View"
              className={`device-btn ${deviceMode === 'desktop' ? 'active' : ''}`}
            >
              <Monitor size={13} />
              <span className="device-label">Desktop</span>
            </button>

            <button
              onClick={() => setDeviceMode('laptop')}
              title="Laptop Screen View (1366x768)"
              className={`device-btn ${deviceMode === 'laptop' ? 'active' : ''}`}
            >
              <Laptop size={13} />
              <span className="device-label">Laptop</span>
            </button>

            <button
              onClick={() => setDeviceMode('tablet')}
              title="Tablet Screen View (768x1024)"
              className={`device-btn ${deviceMode === 'tablet' ? 'active' : ''}`}
            >
              <Tablet size={13} />
              <span className="device-label">Tablet</span>
            </button>

            <button
              onClick={() => setDeviceMode('mobile')}
              title="Mobile Screen View (375x812)"
              className={`device-btn ${deviceMode === 'mobile' ? 'active' : ''}`}
            >
              <Smartphone size={13} />
              <span className="device-label">Mobile</span>
            </button>
          </div>
        )}

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

      <div className={`canvas-body ${deviceMode !== 'desktop' && activeTab === 'preview' ? 'device-wrapper' : ''}`}>
        {editableCode ? (
          activeTab === 'preview' ? (
            <div className={`preview-container device-mode-${deviceMode}`}>
              {deviceMode !== 'desktop' && (
                <div className="device-frame-header">
                  <div className="device-camera-dot" />
                  <span className="device-spec-tag">{deviceSpecs[deviceMode].label} • {deviceSpecs[deviceMode].res}</span>
                </div>
              )}
              <iframe
                key={`${key}-${deviceMode}`}
                title={`Live Application Preview (${deviceSpecs[deviceMode].label})`}
                srcDoc={editableCode}
                className="preview-iframe"
                sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
                style={
                  deviceMode !== 'desktop'
                    ? {
                        maxWidth: deviceSpecs[deviceMode].width,
                        maxHeight: deviceSpecs[deviceMode].height,
                        borderRadius: deviceMode === 'mobile' ? '20px' : '12px'
                      }
                    : {}
                }
              />
            </div>
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

