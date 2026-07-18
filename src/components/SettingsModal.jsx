import { X, Settings, Trash2 } from 'lucide-react';

export default function SettingsModal({ isOpen, onClose, onClearAllHistory }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Settings size={18} />
            <span className="modal-title">Corez Preferences</span>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Corez uses Cloudflare Workers AI with GLM-5.2 for hosted text generation.
        </div>

        <div style={{ marginTop: '0.5rem' }}>
          <button
            className="footer-action-btn"
            style={{ width: '100%', color: '#ef4444' }}
            onClick={onClearAllHistory}
          >
            <Trash2 size={15} />
            <span>Clear Conversation History</span>
          </button>
        </div>
      </div>
    </div>
  );
}
