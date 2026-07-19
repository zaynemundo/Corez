import { 
  Plus, 
  MessageSquare, 
  Trash2, 
  Settings, 
  Sun, 
  Moon, 
  PanelLeftClose,
  Layers
} from 'lucide-react';

export default function Sidebar({
  isOpen,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onOpenSettings,
  theme,
  onToggleTheme,
  onCloseSidebar
}) {
  return (
    <aside className={`sidebar icon-only ${isOpen ? '' : 'collapsed'}`} aria-hidden={!isOpen}>
      <div className="sidebar-header icon-only-header">
        <div className="brand-icon" title="Corez AI">
          <Layers size={15} />
        </div>
        <button 
          className="icon-btn close-sidebar-btn" 
          onClick={onCloseSidebar}
          title="Collapse Sidebar"
        >
          <PanelLeftClose size={14} />
        </button>
      </div>

      <div className="sidebar-action-box">
        <button 
          className="new-chat-btn icon-only-btn" 
          onClick={onNewChat}
          title="New Chat Session"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="chat-history-list icon-only-list">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`history-item icon-only-item ${session.id === activeSessionId ? 'active' : ''}`}
            onClick={() => onSelectSession(session.id)}
            title={session.title}
          >
            <MessageSquare size={15} />
            <button
              className="delete-chat-btn icon-only-delete"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteSession(session.id);
              }}
              title={`Delete ${session.title}`}
            >
              <Trash2 size={11} />
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
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <button 
          className="footer-action-btn icon-only-btn" 
          onClick={onOpenSettings}
          title="Corez Settings"
        >
          <Settings size={15} />
        </button>
      </div>
    </aside>
  );
}
