import { 
  PanelLeftOpen, 
  PanelRight,
  Puzzle
} from 'lucide-react';

export default function Header({
  sidebarOpen,
  onToggleSidebar,
  canvasOpen,
  onToggleCanvas,
  hasExecutableCode,
  onOpenPlugins
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
            <PanelLeftOpen size={16} strokeWidth={1.5} />
          </button>
        )}
      </div>

      <div className="header-right">
        {onOpenPlugins && (
          <button 
            className="canvas-toggle-btn"
            onClick={onOpenPlugins}
            title="Open Corez Plugin Store"
          >
            <Puzzle size={15} strokeWidth={1.5} />
            <span>Plugins</span>
          </button>
        )}
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
