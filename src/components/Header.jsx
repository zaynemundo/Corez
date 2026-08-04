import { 
  PanelLeft, 
  PanelRight
} from 'lucide-react';

export default function Header({
  sidebarOpen,
  onToggleSidebar,
  canvasOpen,
  onToggleCanvas,
  hasExecutableCode
}) {
  return (
    <header className="top-header">
      <div className="header-left">
        {!sidebarOpen && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <button 
              className="icon-btn" 
              onClick={onToggleSidebar}
              title="Open Sidebar"
            >
              <PanelLeft size={16} strokeWidth={1.5} />
            </button>
          </div>
        )}
      </div>

      <div className="header-right">
        <button 
          className="canvas-toggle-btn" 
          onClick={onToggleCanvas}
          title="Toggle Preview Split-View"
          style={hasExecutableCode ? { border: '1px solid var(--text-primary)', background: 'var(--bg-tertiary)' } : {}}
        >
          <PanelRight size={15} strokeWidth={1.5} />
          <span>{canvasOpen ? 'Hide Preview' : 'Preview'}</span>
          {hasExecutableCode && (
            <span style={{ width: '5px', height: '5px', borderRadius: '99px', backgroundColor: 'var(--text-primary)' }} />
          )}
        </button>
      </div>
    </header>
  );
}
