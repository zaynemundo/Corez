import { 
  PanelLeftOpen, 
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
          <button 
            className="icon-btn" 
            onClick={onToggleSidebar}
            title="Open Sidebar"
          >
            <PanelLeftOpen size={16} />
          </button>
        )}
      </div>

      <div className="header-right">
        <button 
          className="canvas-toggle-btn" 
          onClick={onToggleCanvas}
          title="Toggle Preview Split-View"
          style={hasExecutableCode ? { border: '1px solid var(--text-primary)', background: 'var(--bg-tertiary)' } : {}}
        >
          <PanelRight size={15} />
          <span>{canvasOpen ? 'Hide Preview' : 'Preview'}</span>
          {hasExecutableCode && (
            <span style={{ width: '5px', height: '5px', borderRadius: '99px', backgroundColor: 'var(--text-primary)' }} />
          )}
        </button>
      </div>
    </header>
  );
}
