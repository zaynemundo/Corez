import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Settings, 
  PanelLeft,
  MoreVertical,
  Trash2
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
  // theme/onToggleTheme kept for backwards compat but now live inside SettingsModal
  void theme; void onToggleTheme;
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
    <aside className={`sidebar ${isOpen ? '' : 'collapsed'}`} aria-hidden={!isOpen} inert={!isOpen || undefined}>
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
          <img
            className="new-chat-icon"
            src="https://cdn-icons-png.flaticon.com/512/1159/1159633.png"
            alt=""
            aria-hidden="true"
          />
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
        <SidebarProfileRow onOpenSettings={onOpenSettings} />
      </div>
    </aside>
  );
}

function SidebarProfileRow({ onOpenSettings }) {
  let auth;
  try { auth = useAuth(); } catch { auth = null; }
  const email = auth?.user?.email || '';
  const username = email ? email.split('@')[0] : 'Guest';
  const displayName = username.charAt(0).toUpperCase() + username.slice(1);
  const initial = displayName.charAt(0).toUpperCase() || 'G';
  return (
    <div className="sidebar-profile-row">
      <div className="sidebar-profile-left" title={email}>
        <div className="sidebar-avatar" aria-hidden="true">{initial}</div>
        <span className="sidebar-username">{displayName}</span>
      </div>
      <button
        type="button"
        className="sidebar-settings-icon"
        onClick={onOpenSettings}
        aria-label="Open settings"
        title="Settings"
      >
        <Settings size={16} strokeWidth={1.5} />
      </button>
    </div>
  );
}