import { useState, useEffect, useMemo } from 'react';
import { 
  Code2, 
  RotateCw, 
  Maximize2, 
  Minimize2, 
  Download, 
  Copy, 
  Check, 
  X,
  Monitor,
  Laptop,
  Tablet,
  Smartphone
} from 'lucide-react';
import { formatCodeForPreview } from '../utils/previewTransformer';

import { listSessionAppsInR2, getAppFromR2 } from '../services/appStorageService';

export default function CanvasPreview({ 
  code, 
  sessionId,
  onClose, 
  isFullScreen, 
  onToggleFullScreen 
}) {
  const [activeTab, setActiveTab] = useState('preview');
  const [deviceMode, setDeviceMode] = useState('desktop'); // 'desktop' | 'laptop' | 'tablet' | 'mobile'
  const [editableCode, setEditableCode] = useState(code || '');
  const [copied, setCopied] = useState(false);
  const [key, setKey] = useState(0);
  const [sessionApps, setSessionApps] = useState([]);
  const [selectedAppId, setSelectedAppId] = useState('');

  const formattedSrcDoc = useMemo(() => {
    return formatCodeForPreview(editableCode);
  }, [editableCode]);

  useEffect(() => {
    setEditableCode(code || '');
    setKey(prev => prev + 1);
  }, [code]);

  useEffect(() => {
    if (sessionId) {
      listSessionAppsInR2(sessionId).then(apps => {
        if (Array.isArray(apps)) setSessionApps(apps);
      }).catch(() => {});
    }
  }, [sessionId, code]);

  const handleSelectApp = async (appId) => {
    setSelectedAppId(appId);
    if (!appId) return;
    const app = await getAppFromR2(sessionId, appId);
    if (app && (app.code || app.html)) {
      setEditableCode(app.code || app.html);
      setKey(prev => prev + 1);
    }
  };

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

  const deviceSpecs = {
    desktop: { label: 'Desktop', width: '100%', res: 'Fluid / 1920px' },
    laptop: { label: 'Laptop', width: '1100px', res: '1366 × 768' },
    tablet: { label: 'Tablet', width: '768px', res: '768 × 1024' },
    mobile: { label: 'Mobile', width: '375px', res: '375 × 812' }
  };

  return (
    <div className={`canvas-pane ${isFullScreen ? 'full-width' : ''}`}>
      <div className="canvas-header">
        <div className="canvas-title">
          <span>Preview</span>

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
                fontWeight: 300,
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
                fontWeight: 300,
                cursor: 'pointer',
                transition: 'var(--transition-fast)'
              }}
            >
              Source
            </button>
          </div>

          {/* Multi-App Selector if multiple apps exist in session */}
          {sessionApps.length > 1 && (
            <select
              value={selectedAppId}
              onChange={(e) => handleSelectApp(e.target.value)}
              style={{
                marginLeft: '0.5rem',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-pill)',
                padding: '2px 8px',
                fontSize: '0.725rem',
                cursor: 'pointer'
              }}
            >
              <option value="">Switch App ({sessionApps.length} stored)...</option>
              {sessionApps.map((a, idx) => (
                <option key={a.appId} value={a.appId}>
                  App {idx + 1}: {a.title.slice(0, 20)}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Device Viewport Selector (Desktop vs Laptop vs Tablet vs Mobile Icon-only) */}
        {activeTab === 'preview' && (
          <div className="device-mode-bar">
            <button
              onClick={() => setDeviceMode('desktop')}
              title="Desktop Screen View"
              className={`device-btn ${deviceMode === 'desktop' ? 'active' : ''}`}
            >
              <Monitor size={15} strokeWidth={1.5} />
            </button>

            <button
              onClick={() => setDeviceMode('laptop')}
              title="Laptop View (1366 × 768)"
              className={`device-btn ${deviceMode === 'laptop' ? 'active' : ''}`}
            >
              <Laptop size={15} strokeWidth={1.5} />
            </button>

            <button
              onClick={() => setDeviceMode('tablet')}
              title="Tablet View (768 × 1024)"
              className={`device-btn ${deviceMode === 'tablet' ? 'active' : ''}`}
            >
              <Tablet size={15} strokeWidth={1.5} />
            </button>

            <button
              onClick={() => setDeviceMode('mobile')}
              title="Mobile View (375 × 812)"
              className={`device-btn ${deviceMode === 'mobile' ? 'active' : ''}`}
            >
              <Smartphone size={15} strokeWidth={1.5} />
            </button>
          </div>
        )}

        <div className="canvas-controls">
          <button className="icon-btn" onClick={handleRefresh} title="Reload Preview">
            <RotateCw size={14} strokeWidth={1.5} />
          </button>
          <button className="icon-btn" onClick={handleCopy} title="Copy Source Code">
            {copied ? <Check size={14} strokeWidth={1.5} style={{ color: '#ffffff' }} /> : <Copy size={14} strokeWidth={1.5} />}
          </button>
          <button className="icon-btn" onClick={handleDownload} title="Download .html file">
            <Download size={14} strokeWidth={1.5} />
          </button>
          <button className="icon-btn" onClick={onToggleFullScreen} title="Toggle Fullscreen">
            {isFullScreen ? <Minimize2 size={14} strokeWidth={1.5} /> : <Maximize2 size={14} strokeWidth={1.5} />}
          </button>
          <button className="icon-btn" onClick={onClose} title="Close Preview">
            <X size={14} strokeWidth={1.5} />
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
                key={key}
                title={`Live Application Preview (${deviceSpecs[deviceMode].label})`}
                srcDoc={formattedSrcDoc}
                className="preview-iframe"
                sandbox="allow-scripts allow-modals allow-forms allow-pointer-lock allow-same-origin"
                style={
                  deviceMode !== 'desktop'
                    ? {
                        width: '100%',
                        maxWidth: deviceSpecs[deviceMode].width,
                        height: '100%',
                        maxHeight: '100%',
                        margin: '0 auto',
                        borderRadius: deviceMode === 'mobile' ? '20px' : '12px'
                      }
                    : {}
                }
              />
            </div>
          ) : (
            <textarea
              className="canvas-source-editor"
              aria-label="Source code editor"
              value={editableCode}
              onChange={(e) => setEditableCode(e.target.value)}
            />
          )
        ) : (
          <div className="canvas-empty-state">
            <div className="canvas-empty-icon">
              <Code2 size={22} strokeWidth={1.5} />
            </div>
            <h3 style={{ fontSize: '0.95rem' }}>No Active App Running</h3>
            <p style={{ maxWidth: '280px', fontSize: '0.8rem' }}>
              Ask Corez to build an application or click <b>"Run Preview"</b> on any code block.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
