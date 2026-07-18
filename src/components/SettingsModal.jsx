import { useEffect, useState } from 'react';
import { X, Settings, Trash2, KeyRound } from 'lucide-react';

const DEFAULT_OPENROUTER_MODEL = 'deepseek/deepseek-v4-flash';

export default function SettingsModal({ isOpen, onClose, onClearAllHistory }) {
  const [openRouterModel, setOpenRouterModel] = useState(DEFAULT_OPENROUTER_MODEL);

  useEffect(() => {
    if (!isOpen) return;
    setOpenRouterModel(localStorage.getItem('corez_openrouter_model') || DEFAULT_OPENROUTER_MODEL);
  }, [isOpen]);

  const handleSaveOpenRouter = () => {
    const trimmedModel = openRouterModel.trim() || DEFAULT_OPENROUTER_MODEL;

    localStorage.setItem('corez_openrouter_model', trimmedModel);
    setOpenRouterModel(trimmedModel);
  };

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
          Corez routes public AI inputs through the server OpenRouter proxy. Public users do not need an API key.
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="openrouter-model">OpenRouter model</label>
          <input
            id="openrouter-model"
            className="form-input"
            value={openRouterModel}
            onChange={(event) => setOpenRouterModel(event.target.value)}
            placeholder={DEFAULT_OPENROUTER_MODEL}
          />
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
            onClick={() => {
              handleSaveOpenRouter();
              onClose();
            }}
          >
            <KeyRound size={15} />
            <span>Save</span>
          </button>
        </div>
      </div>
    </div>
  );
}
