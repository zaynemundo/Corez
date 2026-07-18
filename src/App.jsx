import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import CanvasPreview from './components/CanvasPreview';
import SettingsModal from './components/SettingsModal';
import { generateAIResponse, extractCodeFromMessage } from './services/aiService';
import { SAMPLE_APPS } from './data/sampleApps';
import { Layers, Code, Gamepad2, BarChart3 } from 'lucide-react';

const INITIAL_SESSIONS = [
  {
    id: 'session-default',
    title: 'Executive Analytics',
    messages: [
      {
        role: 'user',
        content: 'Build an executive analytics dashboard with monochrome styling, stark SVG chart, and live search.'
      },
      {
        role: 'assistant',
        content: `I have constructed your monochrome executive analytics dashboard for **Corez**.\n\n\`\`\`html\n${SAMPLE_APPS[0].code}\n\`\`\``
      }
    ]
  }
];

export default function App() {
  const [sessions, setSessions] = useState(() => {
    const saved = localStorage.getItem('corez_sessions');
    return saved ? JSON.parse(saved) : INITIAL_SESSIONS;
  });

  const [activeSessionId, setActiveSessionId] = useState(() => {
    return sessions[0]?.id || 'session-default';
  });

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [canvasFullScreen, setCanvasFullScreen] = useState(false);
  const [activeCanvasCode, setActiveCanvasCode] = useState(SAMPLE_APPS[0].code);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('corez_theme') || 'dark');

  const messagesEndRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('corez_sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('corez_theme', theme);
  }, [theme]);

  const activeSession = sessions.find(s => s.id === activeSessionId) || sessions[0];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages, isThinking]);

  const handleNewChat = () => {
    const newId = `session-${Date.now()}`;
    const newSession = {
      id: newId,
      title: 'New Conversation',
      messages: []
    };
    setSessions([newSession, ...sessions]);
    setActiveSessionId(newId);
  };

  const handleDeleteSession = (id) => {
    const filtered = sessions.filter(s => s.id !== id);
    setSessions(filtered.length ? filtered : INITIAL_SESSIONS);
    if (activeSessionId === id) {
      setActiveSessionId(filtered[0]?.id || INITIAL_SESSIONS[0].id);
    }
  };

  const handleClearAllHistory = () => {
    setSessions(INITIAL_SESSIONS);
    setActiveSessionId(INITIAL_SESSIONS[0].id);
    setActiveCanvasCode(SAMPLE_APPS[0].code);
    setSettingsOpen(false);
  };

  const handleRunInCanvas = (code) => {
    setActiveCanvasCode(code);
    setCanvasOpen(true);
  };

  const handleLoadSampleApp = (app) => {
    const newId = `session-${Date.now()}`;
    const newSession = {
      id: newId,
      title: app.title,
      messages: [
        { role: 'user', content: app.prompt },
        {
          role: 'assistant',
          content: `I have generated the monochrome application for **${app.title}**.\n\n\`\`\`html\n${app.code}\n\`\`\``
        }
      ]
    };
    setSessions([newSession, ...sessions]);
    setActiveSessionId(newId);
    setActiveCanvasCode(app.code);
    setCanvasOpen(true);
  };

  const handleSendMessage = async (promptText) => {
    if (!activeSession) return;

    const userMsg = { role: 'user', content: promptText };
    const updatedMessages = [...activeSession.messages, userMsg];

    const updatedTitle = activeSession.messages.length === 0 
      ? (promptText.length > 30 ? promptText.slice(0, 27) + '...' : promptText)
      : activeSession.title;

    setSessions(prev => prev.map(s => {
      if (s.id === activeSessionId) {
        return { ...s, title: updatedTitle, messages: updatedMessages };
      }
      return s;
    }));

    setIsThinking(true);

    const responseText = await generateAIResponse(promptText);
    const extractedCode = extractCodeFromMessage(responseText);
    if (extractedCode) {
      setActiveCanvasCode(extractedCode);
    }

    const aiMsg = { role: 'assistant', content: responseText };
    
    setSessions(prev => prev.map(s => {
      if (s.id === activeSessionId) {
        return { ...s, messages: [...s.messages, aiMsg] };
      }
      return s;
    }));

    setIsThinking(false);
  };

  return (
    <div className="app-container">
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        onOpenSettings={() => setSettingsOpen(true)}
        theme={theme}
        onToggleTheme={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
        onCloseSidebar={() => setSidebarOpen(false)}
        onLoadSampleApp={handleLoadSampleApp}
      />

      <main className="main-content">
        <div className={`chat-pane ${canvasOpen ? 'canvas-active' : ''}`}>
          <Header
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen(prev => !prev)}
            canvasOpen={canvasOpen}
            onToggleCanvas={() => setCanvasOpen(prev => !prev)}
            onOpenSettings={() => setSettingsOpen(true)}
            hasExecutableCode={!!activeCanvasCode}
          />

          <div className="messages-scroll">
            {activeSession?.messages.length === 0 ? (
              <div className="welcome-container">
                <div className="welcome-logo">
                  <Layers size={24} />
                </div>
                <h1 className="welcome-title">Corez</h1>
                <p className="welcome-sub">
                  Versatile minimalist AI assistant for conversation, writing, reasoning, and live application execution.
                </p>

                <div className="sample-prompts-grid">
                  <div 
                    className="sample-prompt-card"
                    onClick={() => handleSendMessage('Build an executive analytics dashboard with monochrome styling, stark SVG chart, and live search.')}
                  >
                    <div className="prompt-title">
                      <BarChart3 size={14} style={{ color: 'var(--text-primary)' }} />
                      <span>Executive Dashboard</span>
                    </div>
                    <div className="prompt-desc">Monochrome SVG metrics dashboard with search filters.</div>
                  </div>

                  <div 
                    className="sample-prompt-card"
                    onClick={() => handleSendMessage('Build a monochrome 2D particle physics simulation with interactive mouse gravity attractor.')}
                  >
                    <div className="prompt-title">
                      <Gamepad2 size={14} style={{ color: 'var(--text-primary)' }} />
                      <span>Particle Physics Sandbox</span>
                    </div>
                    <div className="prompt-desc">Interactive black and white particle simulator.</div>
                  </div>

                  <div 
                    className="sample-prompt-card"
                    onClick={() => handleSendMessage('Build me a custom monochrome web tool with interactive controls.')}
                  >
                    <div className="prompt-title">
                      <Code size={14} style={{ color: 'var(--text-primary)' }} />
                      <span>Custom Monochrome Tool</span>
                    </div>
                    <div className="prompt-desc">Generate any HTML/CSS/JS tool on demand.</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="messages-inner">
                {activeSession?.messages.map((msg, idx) => (
                  <ChatMessage
                    key={idx}
                    message={msg}
                    onRunInCanvas={handleRunInCanvas}
                  />
                ))}
                {isThinking && (
                  <div className="message-wrapper ai">
                    <div className="message-body">
                      <div className="thinking-indicator-box">
                        <span className="spinning-icon" style={{ display: 'inline-block' }}>•</span>
                        <span>Corez is thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <ChatInput
            onSendMessage={handleSendMessage}
            isStreaming={isThinking}
          />
        </div>

        {canvasOpen && (
          <CanvasPreview
            code={activeCanvasCode}
            onClose={() => setCanvasOpen(false)}
            isFullScreen={canvasFullScreen}
            onToggleFullScreen={() => setCanvasFullScreen(prev => !prev)}
          />
        )}
      </main>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onClearAllHistory={handleClearAllHistory}
      />
    </div>
  );
}
