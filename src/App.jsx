import { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import CanvasPreview from './components/CanvasPreview';
import SettingsModal from './components/SettingsModal';
import ImageStudioPage from './components/ImageStudioPage';
import { generateAIResponse, extractCodeFromMessage } from './services/aiService';
import { Layers, Code, Gamepad2, BarChart3, Wand2 } from 'lucide-react';

const INITIAL_SESSIONS = [
  {
    id: 'session-default',
    title: 'New Conversation',
    messages: []
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

  const [activeView, setActiveView] = useState('chat'); // 'chat' | 'image-studio'

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !window.matchMedia('(max-width: 767px)').matches;
  });
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [canvasFullScreen, setCanvasFullScreen] = useState(false);
  const [activeCanvasCode, setActiveCanvasCode] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('corez_theme') || 'dark');
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 767px)').matches;
  });

  const messagesEndRef = useRef(null);

  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 767px)');
    const syncSidebarWithViewport = (event) => {
      setIsMobileViewport(event.matches);
      if (event.matches) {
        setSidebarOpen(false);
      }
    };

    setIsMobileViewport(mobileQuery.matches);
    mobileQuery.addEventListener('change', syncSidebarWithViewport);
    return () => mobileQuery.removeEventListener('change', syncSidebarWithViewport);
  }, []);

  useEffect(() => {
    const closeSidebarWithEscape = (event) => {
      if (event.key === 'Escape' && isMobileViewport && sidebarOpen) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener('keydown', closeSidebarWithEscape);
    return () => window.removeEventListener('keydown', closeSidebarWithEscape);
  }, [isMobileViewport, sidebarOpen]);

  useEffect(() => {
    localStorage.setItem('corez_sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('corez_theme', theme);
  }, [theme]);

  const activeSession = sessions.find(s => s.id === activeSessionId) || sessions[0];

  useEffect(() => {
    if (activeView === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeSession?.messages, isThinking, activeView]);

  const handleSelectSession = (id) => {
    setActiveSessionId(id);
    setActiveView('chat');
  };

  const handleNewChat = () => {
    const newId = `session-${Date.now()}`;
    const newSession = {
      id: newId,
      title: 'New Conversation',
      messages: []
    };
    setSessions([newSession, ...sessions]);
    setActiveSessionId(newId);
    setActiveView('chat');
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
    setActiveCanvasCode('');
    setSettingsOpen(false);
  };

  const handleRunInCanvas = (code) => {
    setActiveCanvasCode(code);
    setCanvasOpen(true);
  };

  const handleSendMessage = async (promptText, attachedDocs = []) => {
    if (!activeSession) return;

    const userMsg = { role: 'user', content: promptText, documents: attachedDocs };
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

    const responseText = await generateAIResponse(promptText, attachedDocs);
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
        isOpen={sidebarOpen}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenImageShowcase={() => setActiveView('image-studio')}
        activeView={activeView}
        theme={theme}
        onToggleTheme={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
        onCloseSidebar={() => setSidebarOpen(false)}
      />

      {isMobileViewport && sidebarOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="main-content">
        {activeView === 'image-studio' ? (
          <ImageStudioPage />
        ) : (
          <>
            <div className={`chat-pane ${canvasOpen ? 'canvas-active' : ''}`}>
              <Header
                sidebarOpen={sidebarOpen}
                onToggleSidebar={() => setSidebarOpen(prev => !prev)}
                canvasOpen={canvasOpen}
                onToggleCanvas={() => setCanvasOpen(prev => !prev)}
                hasExecutableCode={!!activeCanvasCode}
              />

              <div className="messages-scroll">
                {activeSession?.messages.length === 0 ? (
                  <div className="welcome-container">
                    <h1 className="welcome-title">COREZ</h1>
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
                          <div className="thinking-indicator-box" aria-label="Corez is thinking" role="status">
                            <span className="thinking-text">Thinking</span>
                            <span className="thinking-dots" aria-hidden="true">
                              <span className="thinking-dot" />
                              <span className="thinking-dot" />
                              <span className="thinking-dot" />
                            </span>
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
          </>
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
