import React from 'react';
import { 
  Plus, 
  MessageSquare, 
  Trash2, 
  Settings, 
  Sun, 
  Moon, 
  Sparkles, 
  PanelLeftClose,
  Play
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
            <Sparkles size={16} />
          </div>
          <span>OmniAI Chat</span>
        </div>
        <button 
          className="icon-btn" 
          onClick={onCloseSidebar}
          title="Collapse Sidebar"
        >
          <PanelLeftClose size={18} />
        </button>
      </div>

      <button className="new-chat-btn" onClick={onNewChat}>
        <Plus size={18} />
        <span>New Chat Session</span>
      </button>

      <div className="chat-history-list">
        <div style={{ padding: '0.4rem 0.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Recent Conversations
        </div>
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`history-item ${session.id === activeSessionId ? 'active' : ''}`}
            onClick={() => onSelectSession(session.id)}
          >
            <MessageSquare size={16} />
            <span className="history-title">{session.title}</span>
            <button
              className="delete-chat-btn"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteSession(session.id);
              }}
              title="Delete Chat"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        <div style={{ margin: '1.25rem 0 0.4rem 0.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Executable App Samples
        </div>
        {SAMPLE_APPS.map((app) => (
          <div
            key={app.id}
            className="history-item"
            onClick={() => onLoadSampleApp(app)}
            style={{ fontSize: '0.825rem' }}
          >
            <Play size={14} style={{ color: 'var(--accent-omni)', flexShrink: 0 }} />
            <span className="history-title">{app.title}</span>
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <button className="footer-action-btn" onClick={onToggleTheme}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          <span>{theme === 'dark' ? 'Light Theme' : 'Dark Theme'}</span>
        </button>
        <button className="footer-action-btn" onClick={onOpenSettings}>
          <Settings size={18} />
          <span>Settings & Models</span>
        </button>
      </div>
    </aside>
  );
}
