import { useState, useEffect } from 'react';
import { 
  Settings, 
  Sun, 
  Moon, 
  PanelLeft,
  MoreVertical,
  Trash2,
  Pencil
} from 'lucide-react';

export default function Sidebar({
  isOpen,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onOpenSettings,
  onDeleteSession,
  activeView,
  theme,
  onToggleTheme,
  onCloseSidebar
}) {
  const [openMenuId, setOpenMenuId] = useState(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.history-item-menu')) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  return (
    <aside className={`sidebar ${isOpen ? '' : 'collapsed'}`} aria-hidden={!isOpen} inert={!isOpen}>
      <div className="sidebar-header">
        <button 
          className="brand-icon-toggle" 
          onClick={onCloseSidebar}
          title="Collapse Sidebar"
        >
          <span className="brand-wordmark">COREZ</span>
        </button>
        <button 
          className="sidebar-close-btn" 
          onClick={onCloseSidebar}
          title="Collapse Sidebar"
          aria-label="Collapse Sidebar"
        >
          <PanelLeft size={16} strokeWidth={1.5} />
        </button>
      </div>

      <div className="sidebar-action-box">
        <button 
          className="new-chat-btn" 
          onClick={onNewChat}
          title="New Chat Session"
        >
          <Pencil size={16} strokeWidth={1.5} />
          <span>New Chat</span>
        </button>
      </div>

      <div className="chat-history-list">
        <div className="sidebar-chats-label">Chats</div>
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`history-item ${activeView === 'chat' && session.id === activeSessionId ? 'active' : ''}`}
            onClick={() => onSelectSession(session.id)}
            onKeyDown={(e) => {
              // Keyboard activation belongs to the container itself; key
              // events from nested buttons (options menu, delete) bubble up
              // here and must not select the conversation or block the
              // button's own activation.
              if (e.target !== e.currentTarget) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectSession(session.id);
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={`Open conversation ${session.title}`}
            title={session.title}
          >
            <span className="history-item-title">{session.title}</span>
            <div className="history-item-menu">
              <button
                type="button"
                className="history-menu-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenuId(openMenuId === session.id ? null : session.id);
                }}
                title="Chat options"
                aria-label={`Options for ${session.title}`}
                aria-expanded={openMenuId === session.id}
              >
                <MoreVertical size={14} strokeWidth={1.5} />
              </button>
              {openMenuId === session.id && (
                <div
                  className="history-menu-dropdown"
                  role="menu"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="history-menu-item delete"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId(null);
                      onDeleteSession(session.id);
                    }}
                  >
                    <Trash2 size={14} strokeWidth={1.5} />
                    <span>Delete</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <button 
          className="footer-action-btn" 
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {theme === 'dark' ? <Sun size={16} strokeWidth={1.5} /> : <Moon size={16} strokeWidth={1.5} />}
          <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
        <button 
          className="footer-action-btn" 
          onClick={onOpenSettings}
          title="Corez Settings"
        >
          <Settings size={16} strokeWidth={1.5} />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}
