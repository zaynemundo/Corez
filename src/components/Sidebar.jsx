import React from 'react';
import { 
  Plus, 
  MessageSquare, 
  Trash2, 
  Settings, 
  Sun, 
  Moon, 
  PanelLeftClose,
  Play,
  Layers
} from 'lucide-react';
import { SAMPLE_APPS } from '../data/sampleApps';

export default function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onOpenSettings,
  theme,
  onToggleTheme,
  onCloseSidebar,
  onLoadSampleApp
}) {
  return (
    <aside className="sidebar">
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
        <div style={{ padding: '0.4rem 0.5rem', fontSize: '0.675rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
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

        <div style={{ margin: '1.25rem 0 0.4rem 0.5rem', fontSize: '0.675rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
          Executable App Samples
        </div>
        {SAMPLE_APPS.map((app) => (
          <div
            key={app.id}
            className="history-item"
            onClick={() => onLoadSampleApp(app)}
            style={{ fontSize: '0.8rem' }}
          >
            <Play size={12} style={{ flexShrink: 0, color: 'var(--text-primary)' }} />
            <span className="history-title">{app.title}</span>
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
