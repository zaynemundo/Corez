import { 
  PanelLeft
} from 'lucide-react';

export default function Header({
  sidebarOpen,
  onToggleSidebar
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
    </header>
  );
}
