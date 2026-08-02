/**
 * Secure Sandbox Game Preview Component
 * Mounts generated HTML inside a strictly sandboxed iframe and establishes postMessage communication handshake.
 */

import { useState, useEffect, useRef } from 'react';
import { 
  RotateCw, 
  Maximize2, 
  Minimize2, 
  AlertTriangle, 
  CheckCircle2, 
  Loader2 
} from 'lucide-react';

export function sanitizeGameHtml(rawHtml) {
  if (!rawHtml) return '';
  
  let sanitized = rawHtml;
  
  // Strip top-level location / navigation attempts
  sanitized = sanitized.replace(/window\.top\.location/g, 'window._blocked_top_loc');
  sanitized = sanitized.replace(/window\.parent\.location/g, 'window._blocked_parent_loc');

  // Strip document.cookie access
  sanitized = sanitized.replace(/document\.cookie/g, 'window._blocked_cookie');

  // Strip prompt/alert popups if abused (including bracket notation)
  sanitized = sanitized.replace(/window\.open\(/g, 'console.log("Blocked window.open", ');
  sanitized = sanitized.replace(/window\[['"]open['"]\]\(/g, 'console.log("Blocked window.open", ');

  return sanitized;
}

/**
 * True when a message event is a legitimate game->parent handshake message:
 * it must come from the sandboxed iframe window itself, whose opaque origin
 * is the string "null" (sandbox without allow-same-origin) — or from the
 * same origin, for non-sandboxed embedders.
 */
export function isTrustedGameMessage(
  event,
  iframeWindow,
  expectedOrigin = typeof window !== 'undefined' ? window.location.origin : null
) {
  if (!event || !iframeWindow) return false;
  if (event.source !== iframeWindow) return false;
  const origin = event.origin === undefined ? null : String(event.origin);
  return origin === 'null' || (expectedOrigin !== null && origin === expectedOrigin);
}

export default function SecureGamePreview({
  html,
  onGameStatusChange,
  isFullScreen,
  onToggleFullScreen
}) {
  const [gameState, setGameState] = useState('LOADING'); // 'LOADING' | 'READY' | 'PLAYING' | 'GAMEOVER' | 'ERROR'
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState(null);
  const [gameScore, setGameScore] = useState(null);
  const iframeRef = useRef(null);

  const sanitizedHtml = sanitizeGameHtml(html);

  // postMessage Handshake Listener
  useEffect(() => {
    const handlePostMessage = (event) => {
      // Sandboxed iframes have an opaque origin ("null"); only accept
      // messages from the preview iframe itself.
      if (!isTrustedGameMessage(event, iframeRef.current?.contentWindow)) return;
      const { type, payload } = event.data || {};
      if (!type || typeof type !== 'string') return;

      switch (type) {
        case 'GAME_LOADING':
          setGameState('LOADING');
          if (payload?.progress !== undefined) {
            setLoadingProgress(payload.progress);
          }
          if (onGameStatusChange) onGameStatusChange('LOADING', payload);
          break;

        case 'GAME_READY':
          setGameState('READY');
          if (onGameStatusChange) onGameStatusChange('READY', payload);
          break;

        case 'GAME_ERROR':
          setGameState('ERROR');
          setErrorMessage(payload?.message || 'An error occurred inside the game runtime.');
          if (onGameStatusChange) onGameStatusChange('ERROR', payload);
          break;

        case 'GAME_RESTART':
          setGameState('PLAYING');
          setGameScore(0);
          if (onGameStatusChange) onGameStatusChange('RESTART', payload);
          break;

        case 'GAME_COMPLETE':
          setGameState(payload?.result === 'win' ? 'READY' : 'GAMEOVER');
          if (payload?.score !== undefined) setGameScore(payload.score);
          if (onGameStatusChange) onGameStatusChange('COMPLETE', payload);
          break;

        case 'REQUEST_FULLSCREEN':
          if (onToggleFullScreen) onToggleFullScreen();
          break;

        default:
          break;
      }
    };

    window.addEventListener('message', handlePostMessage);
    return () => window.removeEventListener('message', handlePostMessage);
  }, [onGameStatusChange, onToggleFullScreen]);

  const handleRestart = () => {
    if (iframeRef.current) {
      // The sandboxed iframe has an opaque origin ("null"), so targetOrigin
      // must be '*' for the command to be delivered at all.
      iframeRef.current.contentWindow?.postMessage({ type: 'COMMAND_RESTART' }, '*');
      // Trigger refresh fallback if needed
      iframeRef.current.srcdoc = sanitizedHtml;
    }
  };

  return (
    <div className={`secure-game-wrapper ${isFullScreen ? 'fullscreen' : ''}`}>
      {/* Game Status Bar */}
      <div className="game-status-bar" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        background: 'var(--bg-tertiary, #161824)',
        borderBottom: '1px solid var(--border-color, #2a2d42)',
        fontSize: '0.825rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {gameState === 'LOADING' && <Loader2 size={14} className="spin-icon" />}
          {gameState === 'READY' && <CheckCircle2 size={14} style={{ color: '#2ecc71' }} />}
          {gameState === 'GAMEOVER' && <AlertTriangle size={14} style={{ color: '#e74c3c' }} />}
          <span style={{ fontWeight: 600 }}>
            {gameState === 'LOADING' ? `Loading Game Assets (${loadingProgress}%)...` :
             gameState === 'READY' ? 'Game Ready to Play' :
             gameState === 'GAMEOVER' ? `Game Over ${gameScore !== null ? `- Score: ${gameScore}` : ''}` :
             'Secure Game Sandbox'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button 
            type="button" 
            className="code-btn" 
            onClick={handleRestart}
            title="Restart Game"
            style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <RotateCw size={12} />
            <span>Restart</span>
          </button>
          {onToggleFullScreen && (
            <button 
              type="button" 
              className="code-btn" 
              onClick={onToggleFullScreen}
              title={isFullScreen ? 'Exit Fullscreen' : 'Fullscreen'}
              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
            >
              {isFullScreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          )}
        </div>
      </div>

      {/* Sandboxed iframe */}
      <div className="iframe-container" style={{ position: 'relative', width: '100%', height: 'calc(100% - 37px)', minHeight: '480px' }}>
        <iframe
          ref={iframeRef}
          title="COREZ Secure Game Sandbox"
          referrerPolicy="no-referrer"
          srcDoc={sanitizedHtml}
          sandbox="allow-scripts allow-pointer-lock allow-downloads allow-popups"
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            background: '#0c0d14'
          }}
        />

        {errorMessage && (
          <div className="game-error-overlay" style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(12, 13, 20, 0.92)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            color: '#e74c3c'
          }}>
            <AlertTriangle size={32} style={{ marginBottom: '12px' }} />
            <p style={{ fontWeight: 600, marginBottom: '8px' }}>Runtime Game Error</p>
            <p style={{ fontSize: '0.85rem', color: '#ccc', textAlign: 'center', maxWidth: '480px' }}>{errorMessage}</p>
            <button type="button" className="code-btn" onClick={handleRestart} style={{ marginTop: '16px' }}>
              Retry Game
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
