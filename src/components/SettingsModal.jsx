import { X, Settings, Trash2 } from 'lucide-react';

export default function SettingsModal({ isOpen, onClose, onClearAllHistory }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Settings size={18} strokeWidth={1.5} />
            <span className="modal-title">Corez Preferences</span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close settings">
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>

        <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Corez automatically routes text, code and visual requests through configured hosted AI services with resilient fallbacks. Model selection is managed server-side.
        </div>

        <div style={{ marginTop: '0.5rem' }}>
          <button
            className="footer-action-btn"
            style={{ width: '100%', color: '#ef4444' }}
            onClick={onClearAllHistory}
          >
            <Trash2 size={15} strokeWidth={1.5} />
            <span>Clear Conversation History</span>
          </button>
        </div>
      </div>
    </div>
  );
}
