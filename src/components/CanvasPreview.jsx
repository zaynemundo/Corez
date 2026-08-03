import { useState, useEffect, useMemo, useRef } from 'react';
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
  Smartphone,
  Share2,
  ExternalLink,
  Loader2
} from 'lucide-react';
import { formatCodeForPreview, parseMultiPageSite, injectMultiPageRouter } from '../utils/previewTransformer';
import { publishAppInR2 } from '../services/appStorageService';

export default function CanvasPreview({ 
  code, 
  title = 'Untitled Application',
  onClose, 
  isFullScreen, 
  onToggleFullScreen 
}) {
  const [activeTab, setActiveTab] = useState('preview');
  const [deviceMode, setDeviceMode] = useState('desktop'); // 'desktop' | 'laptop' | 'tablet' | 'mobile'
  const [editableCode, setEditableCode] = useState(code || '');
  const [copied, setCopied] = useState(false);
  const [key, setKey] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState(null); // { slug, url }
  const [publishError, setPublishError] = useState(null);
  const [activePage, setActivePage] = useState('index.html');
  const iframeRef = useRef(null);

  const multiPage = useMemo(() => parseMultiPageSite(editableCode), [editableCode]);

  const currentPage = useMemo(() => {
    return multiPage.pages.find((p) => p.name === activePage) || multiPage.pages[0] || { name: 'index.html', html: '' };
  }, [multiPage, activePage]);

  const formattedSrcDoc = useMemo(() => {
    if (!currentPage.html) return '';
    const doc = formatCodeForPreview(currentPage.html);
    return multiPage.isMultiPage
      ? injectMultiPageRouter(doc, multiPage.pages.map((p) => p.name))
      : doc;
  }, [currentPage, multiPage]);

  useEffect(() => {
    setEditableCode(code || '');
    setActivePage('index.html');
    setKey(prev => prev + 1);
  }, [code]);

  // Multi-page navigation: the sandboxed iframe cannot navigate or reach the
  // parent, so pages postMessage a { type: 'corez-nav', page } request. Only
  // messages from THIS preview iframe are trusted, and the requested page
  // must already exist in the parsed page set — message content is never
  // treated as code or HTML.
  useEffect(() => {
    const handleNavMessage = (event) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (!data || typeof data !== 'object' || data.type !== 'corez-nav') return;
      if (typeof data.page !== 'string' || !data.page) return;
      const target = multiPage.pages.find((p) => p.name === data.page);
      if (!target) return;
      setActivePage(target.name);
    };
    window.addEventListener('message', handleNavMessage);
    return () => window.removeEventListener('message', handleNavMessage);
  }, [multiPage]);

  const handlePublish = async () => {
    if (publishing || !editableCode) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const pagesPayload = {};
      if (multiPage.isMultiPage) {
        for (const page of multiPage.pages) {
          pagesPayload[page.name] = injectMultiPageRouter(formatCodeForPreview(page.html), multiPage.pages.map((p) => p.name));
        }
      }
      const result = await publishAppInR2({
        html: formattedSrcDoc,
        title,
        slug: publishResult?.slug || null,
        ...(Object.keys(pagesPayload).length > 0 ? { pages: pagesPayload } : {})
      });
      if (result && result.url) {
        setPublishResult({ slug: result.slug, url: result.url });
        setPublishError(null);
      } else {
        setPublishError('Publishing failed. The hosted service may be unavailable — try again.');
      }
    } catch (err) {
      console.warn('Publish error:', err);
      setPublishError('Publishing failed. Please try again.');
    } finally {
      setPublishing(false);
    }
  };

  const publishLink = publishResult
    ? new URL(publishResult.url, window.location.origin).href
    : null;

  const handleCopyLink = () => {
    if (publishLink && navigator.clipboard) {
      navigator.clipboard.writeText(publishLink).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(editableCode).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
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
    desktop: { label: 'Desktop', width: '100%', res: 'Fluid / 1920px', ratio: null },
    laptop: { label: 'Laptop', width: '1100px', res: '1366 × 768', ratio: '16 / 9' },
    tablet: { label: 'Tablet', width: '768px', res: '768 × 1024', ratio: '3 / 4' },
    mobile: { label: 'Mobile', width: '375px', res: '375 × 812', ratio: '375 / 812' }
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

          {/* Publish: share the creation with anyone via a short link */}
          {activeTab === 'preview' && editableCode && (
            <button
              type="button"
              className="code-btn publish-btn"
              onClick={handlePublish}
              disabled={publishing}
              title="Publish this creation and share the link"
              style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              {publishing ? <Loader2 size={14} className="spin-icon" /> : <Share2 size={14} />}
              <span>{publishing ? 'Publishing...' : 'Publish'}</span>
            </button>
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

        {/* Multi-page site tabs: one tab per parsed page. The iframe swaps
            srcDoc (never navigates) so the sandbox stays intact. */}
        {activeTab === 'preview' && multiPage.isMultiPage && (
          <div
            className="page-tab-bar"
            role="tablist"
            aria-label="Site pages"
            style={{ display: 'flex', alignItems: 'center', gap: '4px', maxWidth: '100%', overflowX: 'auto' }}
          >
            {multiPage.pages.map((page) => (
              <button
                key={page.name}
                type="button"
                role="tab"
                aria-selected={activePage === page.name}
                onClick={() => setActivePage(page.name)}
                title={`Open ${page.name}`}
                style={{
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-pill)',
                  border: '1px solid var(--border-color)',
                  background: activePage === page.name ? 'var(--text-primary)' : 'var(--bg-tertiary)',
                  color: activePage === page.name ? 'var(--bg-primary)' : 'var(--text-secondary)',
                  fontSize: '0.7rem',
                  fontWeight: 300,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'var(--transition-fast)'
                }}
              >
                {page.name}
              </button>
            ))}
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
                key={`${key}-${activePage}`}
                ref={iframeRef}
                title={`Live Application Preview (${deviceSpecs[deviceMode].label})`}
                srcDoc={formattedSrcDoc}
                className="preview-iframe"
                sandbox="allow-scripts allow-forms allow-pointer-lock allow-downloads allow-popups allow-popups-to-escape-sandbox"
                style={
                  deviceMode !== 'desktop'
                    ? {
                        // Fixed device width, real device aspect ratio, and
                        // height derived from it — the frame never stretches
                        // to the pane height or clips. margin:auto centers
                        // while remaining scrollable when the pane is small.
                        width: deviceSpecs[deviceMode].width,
                        maxWidth: '100%',
                        aspectRatio: deviceSpecs[deviceMode].ratio,
                        height: 'auto',
                        margin: 'auto',
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

      {/* Publish share modal */}
      {publishLink && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Share your published creation"
          onClick={() => setPublishResult(null)}
        >
          <div className="modal-card publish-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">
                <Share2 size={15} style={{ marginRight: '6px', verticalAlign: 'middle', color: 'var(--accent, #818cf8)' }} />
                Your creation is live
              </span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setPublishResult(null)}
                title="Close"
                aria-label="Close"
              >
                <X size={15} />
              </button>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
              Anyone with this link can open <b style={{ color: 'var(--text-primary)' }}>{title.slice(0, 60)}</b>:
            </p>

            <div
              className="publish-link-box"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 10px'
              }}
            >
              <input
                readOnly
                value={publishLink}
                onFocus={(e) => e.target.select()}
                aria-label="Published share link"
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                  fontFamily: 'monospace'
                }}
              />
              <button type="button" className="code-btn" onClick={handleCopyLink} title="Copy link">
                {copied ? <Check size={14} /> : <Copy size={14} />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
              <a
                className="code-btn"
                href={publishLink}
                target="_blank"
                rel="noopener noreferrer"
                title="Open in new tab"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
              >
                <ExternalLink size={14} />
                <span>Open</span>
              </a>
            </div>

            {publishResult.slug && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
                Slug: <code>{publishResult.slug}</code> · Publishing again updates this same link.
              </p>
            )}

            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
              Only this app is shared — your chat stays private.
            </p>
          </div>
        </div>
      )}

      {publishError && (
        <div
          role="alert"
          style={{
            position: 'absolute',
            bottom: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
            borderRadius: 'var(--radius-md)',
            padding: '8px 14px',
            fontSize: '0.8rem',
            zIndex: 20
          }}
        >
          {publishError}
          <button
            type="button"
            className="icon-btn"
            onClick={() => setPublishError(null)}
            title="Dismiss"
            aria-label="Dismiss"
            style={{ marginLeft: '8px', verticalAlign: 'middle' }}
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
