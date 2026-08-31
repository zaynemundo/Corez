import { X, Settings, Trash2, Sun, Moon, LogOut, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function SettingsModal({ isOpen, onClose, onClearAllHistory, theme, onToggleTheme }) {
  if (!isOpen) return null;
  let auth;
  try { auth = useAuth(); } catch { auth = null; }
  const email = auth?.user?.email || '';
  const isDark = theme === 'dark';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card settings-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Settings size={18} strokeWidth={1.5} />
            <span className="modal-title">Settings</span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close settings">
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>

        <div className="settings-section">
          <div className="settings-section-label">Account</div>
          <div className="settings-profile-card">
            <div className="settings-avatar" aria-hidden="true">
              <User size={16} strokeWidth={1.5} />
            </div>
            <div className="settings-profile-meta">
              <span className="settings-profile-email" title={email}>{email || 'Guest'}</span>
              <span className="settings-profile-sub">Signed in to Corez</span>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-label">Appearance</div>
          <button
            type="button"
            className="settings-row-btn"
            onClick={onToggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <span className="settings-row-left">
              {isDark ? <Sun size={16} strokeWidth={1.5} /> : <Moon size={16} strokeWidth={1.5} />}
              <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
            </span>
            <span className="settings-row-hint">{isDark ? 'Switch to light' : 'Switch to dark'}</span>
          </button>
        </div>

        <div className="settings-section">
          <div className="settings-section-label">Support</div>
          <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Corez automatically routes text, code and visual requests through configured hosted AI services with resilient fallbacks. Model selection is managed server-side.
          </div>
        </div>

        <div className="settings-actions">
          <button
            type="button"
            className="settings-danger-btn"
            onClick={onClearAllHistory}
          >
            <Trash2 size={15} strokeWidth={1.5} />
            <span>Clear Conversation History</span>
          </button>
          {auth?.user && (
            <button
              type="button"
              className="settings-row-btn"
              onClick={() => { onClose(); auth.logout(); }}
            >
              <span className="settings-row-left">
                <LogOut size={16} strokeWidth={1.5} />
                <span>Log out</span>
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
