import React, { useState } from 'react';
import { X, Key, Save, Trash2, ShieldCheck } from 'lucide-react';

export default function SettingsModal({ isOpen, onClose, onClearAllHistory }) {
  const [openaiKey, setOpenaiKey] = useState(localStorage.getItem('omni_openai_key') || '');
  const [geminiKey, setGeminiKey] = useState(localStorage.getItem('omni_gemini_key') || '');
  const [claudeKey, setClaudeKey] = useState(localStorage.getItem('omni_claude_key') || '');
  const [savedStatus, setSavedStatus] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    localStorage.setItem('omni_openai_key', openaiKey);
    localStorage.setItem('omni_gemini_key', geminiKey);
    localStorage.setItem('omni_claude_key', claudeKey);
    setSavedStatus(true);
    setTimeout(() => setSavedStatus(false), 2000);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Key size={20} style={{ color: 'var(--accent-omni)' }} />
            <span className="modal-title">Settings & Model Providers</span>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Out of the box, OmniAI Chat includes a high-speed AI simulator. To connect live model APIs, enter your API keys below (saved securely in local browser storage).
        </div>

        <div className="form-group">
          <label className="form-label">OpenAI API Key (ChatGPT 4o)</label>
          <input
            type="password"
            className="form-input"
            placeholder="sk-..."
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Google AI Key (Gemini 2.0)</label>
          <input
            type="password"
            className="form-input"
            placeholder="AIzaSy..."
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Anthropic Key (Claude 3.5)</label>
          <input
            type="password"
            className="form-input"
            placeholder="sk-ant-..."
            value={claudeKey}
            onChange={(e) => setClaudeKey(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
          <button
            className="footer-action-btn"
            style={{ width: 'auto', color: '#ef4444' }}
            onClick={onClearAllHistory}
          >
            <Trash2 size={16} />
            <span>Clear History</span>
          </button>

          <button
            className="new-chat-btn"
            style={{ width: 'auto', margin: 0, padding: '0.6rem 1.25rem' }}
            onClick={handleSave}
          >
            {savedStatus ? <ShieldCheck size={16} /> : <Save size={16} />}
            <span>{savedStatus ? 'Saved!' : 'Save Preferences'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
