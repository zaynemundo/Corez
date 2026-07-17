import React from 'react';
import { 
  PanelLeftOpen, 
  PanelRight, 
  Settings,
  Layers
} from 'lucide-react';

export default function Header({
  sidebarOpen,
  onToggleSidebar,
  canvasOpen,
  onToggleCanvas,
  onOpenSettings,
  hasExecutableCode
}) {
  return (
    <header className="top-header">
      <div className="header-left">
        {!sidebarOpen && (
          <button 
            className="icon-btn" 
            onClick={onToggleSidebar}
            title="Open Sidebar"
          >
            <PanelLeftOpen size={16} />
          </button>
        )}

        <div className="brand-title" style={{ fontSize: '0.95rem', fontWeight: 800 }}>
          <div className="brand-icon" style={{ width: '20px', height: '20px' }}>
            <Layers size={13} />
          </div>
          <span>Corez AI</span>
        </div>
      </div>

      <div className="header-right">
        <button 
          className="canvas-toggle-btn" 
          onClick={onToggleCanvas}
          title="Toggle Executable Canvas Split-View"
          style={hasExecutableCode ? { border: '1px solid var(--text-primary)', background: 'var(--bg-tertiary)' } : {}}
        >
          <PanelRight size={15} />
          <span>{canvasOpen ? 'Hide Canvas' : 'Live Canvas'}</span>
          {hasExecutableCode && (
            <span style={{ width: '5px', height: '5px', borderRadius: '99px', backgroundColor: 'var(--text-primary)' }} />
          )}
        </button>

        <button 
          className="icon-btn" 
          onClick={onOpenSettings}
          title="Corez Settings"
        >
          <Settings size={16} />
        </button>
      </div>
    </header>
  );
}
