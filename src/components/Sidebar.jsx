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
    <aside className={`sidebar ${isOpen ? '' : 'collapsed'}`} aria-hidden={!isOpen}>
      <div className="sidebar-header">
        <div className="brand-title">
          <div className="brand-icon">
            <Layers size={14} />
          </div>
          <span>Corez</span>
        </div>
        <button 
          className="icon-btn" 
          onClick={onCloseSidebar}
          title="Collapse Sidebar"
        >
          <PanelLeftClose size={16} />
        </button>
      </div>

      <button className="new-chat-btn" onClick={onNewChat}>
        <Plus size={16} />
        <span>New Chat Session</span>
      </button>

      <div className="chat-history-list">
        <div className="sidebar-section-heading">
          Recent Conversations
        </div>
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`history-item ${session.id === activeSessionId ? 'active' : ''}`}
            onClick={() => onSelectSession(session.id)}
          >
            <MessageSquare size={14} />
            <span className="history-title">{session.title}</span>
            <button
              className="delete-chat-btn"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteSession(session.id);
              }}
              title="Delete Chat"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <button className="footer-action-btn" onClick={onToggleTheme}>
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
        <button className="footer-action-btn" onClick={onOpenSettings}>
          <Settings size={15} />
          <span>Corez Settings</span>
        </button>
      </div>
    </aside>
  );
}
