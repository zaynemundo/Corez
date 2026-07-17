import React from 'react';
import { 
  PanelLeftOpen, 
  ChevronDown, 
  PanelRight, 
  Settings 
} from 'lucide-react';
import { MODELS } from '../services/aiService';

export default function Header({
  sidebarOpen,
  onToggleSidebar,
  currentModelId,
  onSelectModel,
  canvasOpen,
  onToggleCanvas,
  onOpenSettings,
  hasExecutableCode
}) {
  const currentModel = MODELS[currentModelId] || MODELS.chatgpt;

  return (
    <header className="top-header">
      <div className="header-left">
        {!sidebarOpen && (
          <button 
            className="icon-btn" 
            onClick={onToggleSidebar}
            title="Open Sidebar"
          >
            <PanelLeftOpen size={18} />
          </button>
        )}

        <div className="model-selector-container" style={{ position: 'relative' }}>
          <select 
            value={currentModelId} 
            onChange={(e) => onSelectModel(e.target.value)}
            className="model-selector"
            style={{ appearance: 'none', paddingRight: '2rem' }}
          >
            {Object.values(MODELS).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.provider})
              </option>
            ))}
          </select>
          <div 
            className="model-badge"
            style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          />
          <ChevronDown 
            size={16} 
            style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }} 
          />
        </div>
      </div>

      <div className="header-right">
        <button 
          className="canvas-toggle-btn" 
          onClick={onToggleCanvas}
          title="Toggle Executable Canvas Split-View"
          style={hasExecutableCode ? { border: '1px solid var(--text-primary)', background: 'var(--bg-tertiary)' } : {}}
        >
          <PanelRight size={16} />
          <span>{canvasOpen ? 'Hide Canvas' : 'Live Canvas'}</span>
          {hasExecutableCode && (
            <span style={{ width: '6px', height: '6px', borderRadius: '99px', backgroundColor: 'var(--text-primary)', boxShadow: '0 0 8px #ffffff' }} />
          )}
        </button>

        <button 
          className="icon-btn" 
          onClick={onOpenSettings}
          title="Settings & Keys"
        >
          <Settings size={18} />
        </button>
      </div>
    </header>
  );
}
