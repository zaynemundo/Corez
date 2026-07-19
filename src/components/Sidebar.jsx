import { 
  Plus, 
  MessageSquare, 
  Trash2, 
  Settings, 
  Sun, 
  Moon, 
  PanelLeftClose,
  Layers,
  Image as ImageIcon
} from 'lucide-react';

export default function Sidebar({
  isOpen,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onOpenSettings,
  onOpenImageShowcase,
  activeView,
  theme,
  onToggleTheme,
  onCloseSidebar
}) {
  return (
    <aside className={`sidebar icon-only ${isOpen ? '' : 'collapsed'}`} aria-hidden={!isOpen}>
      <div className="sidebar-header icon-only-header">
        <button 
          className="brand-icon-toggle" 
          onClick={onCloseSidebar}
          title="Collapse Sidebar"
        >
          <Layers size={14} className="brand-logo-default" />
          <PanelLeftClose size={14} className="brand-logo-hover" />
        </button>
      </div>

      <div className="sidebar-action-box">
        <button 
          className="new-chat-btn icon-only-btn" 
          onClick={onNewChat}
          title="New Chat Session"
        >
          <Plus size={15} />
        </button>
      </div>

      <div className="sidebar-tools-section">
        <button 
          className={`image-creator-btn icon-only-btn ${activeView === 'image-studio' ? 'active' : ''}`}
          onClick={onOpenImageShowcase}
          title="Image Studio"
        >
          <ImageIcon size={14} />
        </button>
      </div>

      <div className="chat-history-list icon-only-list">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`history-item icon-only-item ${activeView === 'chat' && session.id === activeSessionId ? 'active' : ''}`}
            onClick={() => onSelectSession(session.id)}
            title={session.title}
          >
            <MessageSquare size={14} />
            <button
              className="delete-chat-btn icon-only-delete"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteSession(session.id);
              }}
              title={`Delete ${session.title}`}
            >
              <Trash2 size={10} />
            </button>
          </div>
        ))}
      </div>

      <div className="sidebar-footer icon-only-footer">
        <button 
          className="footer-action-btn icon-only-btn" 
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <button 
          className="footer-action-btn icon-only-btn" 
          onClick={onOpenSettings}
          title="Corez Settings"
        >
          <Settings size={14} />
        </button>
      </div>
    </aside>
  );
}
