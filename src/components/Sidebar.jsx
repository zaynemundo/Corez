import { useState, useEffect } from 'react';
import { 
  Settings, 
  Sun, 
  Moon, 
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
  onCloseSidebar,
  accountProfile = null,
  onOpenAccount = null
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
    <aside className={`sidebar ${isOpen ? '' : 'collapsed'}`} aria-hidden={!isOpen} inert={!isOpen ? '' : undefined}>
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
        {/* User Account Profile Pill */}
        <button
          type="button"
          className="sidebar-account-pill"
          onClick={onOpenAccount}
          title="Account & Profile Settings"
          aria-label={`Account profile for ${accountProfile?.displayName || 'Creator'}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            width: '100%',
            padding: '8px 10px',
            marginBottom: '8px',
            background: 'var(--bg-tertiary, #181922)',
            border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
            borderRadius: 'var(--radius-md, 8px)',
            color: 'var(--text-primary, #ffffff)',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'all 0.15s ease'
          }}
        >
          <div
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              backgroundColor: accountProfile?.avatarColor || '#3b82f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.75rem',
              flexShrink: 0
            }}
          >
            {(accountProfile?.displayName || 'C').slice(0, 1).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {accountProfile?.displayName || 'Creator'}
            </span>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary, #9ca3af)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {accountProfile?.handle || '@creator'}
            </span>
          </div>
          <span
            style={{
              fontSize: '0.65rem',
              padding: '2px 6px',
              borderRadius: '10px',
              background: 'rgba(99, 102, 241, 0.2)',
              color: 'var(--accent, #818cf8)',
              fontWeight: 600,
              flexShrink: 0
            }}
          >
            {accountProfile?.tier || 'Pro'}
          </span>
        </button>

        <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
          <button 
            className="footer-action-btn" 
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            style={{ flex: 1 }}
          >
            {theme === 'dark' ? <Sun size={16} strokeWidth={1.5} /> : <Moon size={16} strokeWidth={1.5} />}
            <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
          <button 
            className="footer-action-btn" 
            onClick={onOpenSettings}
            title="Corez Settings"
            style={{ flex: 1 }}
          >
            <Settings size={16} strokeWidth={1.5} />
            <span>Settings</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
