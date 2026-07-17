import React from 'react';
import { X, Settings, Trash2, ShieldCheck } from 'lucide-react';

export default function SettingsModal({ isOpen, onClose, onClearAllHistory }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
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
          Corez is configured as a public AI assistant with built-in live executable canvas sandbox.
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
          <button
            className="footer-action-btn"
            style={{ width: 'auto', color: '#ef4444' }}
            onClick={onClearAllHistory}
          >
            <Trash2 size={15} />
            <span>Clear Conversation History</span>
          </button>

          <button
            className="new-chat-btn"
            style={{ width: 'auto', margin: 0, padding: '0.5rem 1rem' }}
            onClick={onClose}
          >
            <ShieldCheck size={15} />
            <span>Close</span>
          </button>
        </div>
      </div>
    </div>
  );
}
