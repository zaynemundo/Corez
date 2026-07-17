import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import CanvasPreview from './components/CanvasPreview';
import SettingsModal from './components/SettingsModal';
import { streamAIResponse, extractCodeFromMessage, MODELS } from './services/aiService';
import { SAMPLE_APPS } from './data/sampleApps';
import { Sparkles, Code, Gamepad2, Calculator, BarChart3 } from 'lucide-react';

const INITIAL_SESSIONS = [
  {
    id: 'session-default',
    title: 'Executive Analytics App',
    model: 'chatgpt',
    messages: [
      {
        role: 'user',
        content: 'Build me an interactive executive analytics dashboard with live KPI cards, interactive chart toggles, and search filterable data.'
      },
      {
        role: 'assistant',
        content: `Here is your interactive executive analytics dashboard built with HTML, CSS, and JavaScript. You can run it live in the **Live Canvas Sandbox** on the right!

\`\`\`html
${SAMPLE_APPS[0].code}
\`\`\`

Click **"Run in Canvas"** or inspect the live preview!`
      }
    ]
  }
];

export default function App() {
  // LocalStorage Persistence
  const [sessions, setSessions] = useState(() => {
    const saved = localStorage.getItem('omni_sessions');
    return saved ? JSON.parse(saved) : INITIAL_SESSIONS;
  });

  const [activeSessionId, setActiveSessionId] = useState(() => {
    return sessions[0]?.id || 'session-default';
  });

  const [currentModelId, setCurrentModelId] = useState('chatgpt');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [canvasOpen, setCanvasOpen] = useState(true);
  const [canvasFullScreen, setCanvasFullScreen] = useState(false);
  const [activeCanvasCode, setActiveCanvasCode] = useState(SAMPLE_APPS[0].code);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('omni_theme') || 'dark');

  const messagesEndRef = useRef(null);

  // Sync state with LocalStorage
  useEffect(() => {
    localStorage.setItem('omni_sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('omni_theme', theme);
  }, [theme]);

  const activeSession = sessions.find(s => s.id === activeSessionId) || sessions[0];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages, isStreaming]);

  // Handle new chat session creation
  const handleNewChat = () => {
    const newId = `session-${Date.now()}`;
    const newSession = {
      id: newId,
      title: 'New Conversation',
      model: currentModelId,
      messages: []
    };
    setSessions([newSession, ...sessions]);
    setActiveSessionId(newId);
  };

  // Handle chat deletion
  const handleDeleteSession = (id) => {
    const filtered = sessions.filter(s => s.id !== id);
    setSessions(filtered.length ? filtered : INITIAL_SESSIONS);
    if (activeSessionId === id) {
      setActiveSessionId(filtered[0]?.id || INITIAL_SESSIONS[0].id);
    }
  };

  // Clear all history
  const handleClearAllHistory = () => {
    setSessions(INITIAL_SESSIONS);
    setActiveSessionId(INITIAL_SESSIONS[0].id);
    setActiveCanvasCode(SAMPLE_APPS[0].code);
    setSettingsOpen(false);
  };

  // Run code directly in canvas
  const handleRunInCanvas = (code) => {
    setActiveCanvasCode(code);
    setCanvasOpen(true);
  };

  // Load sample app template
  const handleLoadSampleApp = (app) => {
    const newId = `session-${Date.now()}`;
    const newSession = {
      id: newId,
      title: app.title,
      model: app.model,
      messages: [
        { role: 'user', content: app.prompt },
        {
          role: 'assistant',
          content: `Here is the executable code for **${app.title}**. Running live in the canvas!\n\n\`\`\`html\n${app.code}\n\`\`\``
        }
      ]
    };
    setSessions([newSession, ...sessions]);
    setActiveSessionId(newId);
    setActiveCanvasCode(app.code);
    setCanvasOpen(true);
  };

  // Send message and stream response
  const handleSendMessage = async (promptText) => {
    if (!activeSession) return;

    const userMsg = { role: 'user', content: promptText };
    const updatedMessages = [...activeSession.messages, userMsg];

    // Update title if first message
    const updatedTitle = activeSession.messages.length === 0 
      ? (promptText.length > 30 ? promptText.slice(0, 27) + '...' : promptText)
      : activeSession.title;

    setSessions(prev => prev.map(s => {
      if (s.id === activeSessionId) {
        return { ...s, title: updatedTitle, messages: updatedMessages };
      }
      return s;
    }));

    setIsStreaming(true);

    // Placeholder AI message
    const aiMsgIndex = updatedMessages.length;
    let currentAiMsg = { role: 'assistant', content: '' };

    await streamAIResponse(
      promptText,
      currentModelId,
      (partialText) => {
        currentAiMsg.content = partialText;
        setSessions(prev => prev.map(s => {
          if (s.id === activeSessionId) {
            const msgs = [...s.messages];
            msgs[aiMsgIndex] = { ...currentAiMsg };
            return { ...s, messages: msgs };
          }
          return s;
        }));

        // Check if executable HTML code is streaming in
        const extractedCode = extractCodeFromMessage(partialText);
        if (extractedCode) {
          setActiveCanvasCode(extractedCode);
          if (!canvasOpen) setCanvasOpen(true);
        }
      }
    );

    setIsStreaming(false);
  };

  const currentModel = MODELS[currentModelId] || MODELS.chatgpt;

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
        <div className="chat-pane">
          <Header
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen(prev => !prev)}
            currentModelId={currentModelId}
            onSelectModel={setCurrentModelId}
            canvasOpen={canvasOpen}
            onToggleCanvas={() => setCanvasOpen(prev => !prev)}
            onOpenSettings={() => setSettingsOpen(true)}
            hasExecutableCode={!!activeCanvasCode}
          />

          <div className="messages-scroll">
            {activeSession?.messages.length === 0 ? (
              <div className="welcome-container">
                <div className="welcome-logo">
                  <Sparkles size={32} />
                </div>
                <h1 className="welcome-title">OmniAI Chat & Canvas</h1>
                <p className="welcome-sub">
                  Ask questions, generate ideas, and build executable web applications live in the side-by-side split screen canvas.
                </p>

                <div className="sample-prompts-grid">
                  <div 
                    className="sample-prompt-card"
                    onClick={() => handleSendMessage('Build an interactive executive analytics dashboard with live KPI cards and data table.')}
                  >
                    <div className="prompt-title">
                      <BarChart3 size={16} style={{ color: 'var(--accent-omni)' }} />
                      <span>Executive Dashboard</span>
                    </div>
                    <div className="prompt-desc">Create a live SVG metrics dashboard with search filters.</div>
                  </div>

                  <div 
                    className="sample-prompt-card"
                    onClick={() => handleSendMessage('Create a 2D canvas particle physics game with interactive gravity.')}
                  >
                    <div className="prompt-title">
                      <Gamepad2 size={16} style={{ color: 'var(--accent-gemini)' }} />
                      <span>2D Physics Game</span>
                    </div>
                    <div className="prompt-desc">Interactive particle gravity simulator with custom controls.</div>
                  </div>

                  <div 
                    className="sample-prompt-card"
                    onClick={() => handleSendMessage('Build a financial ROI and compound growth investment calculator.')}
                  >
                    <div className="prompt-title">
                      <Calculator size={16} style={{ color: 'var(--accent-claude)' }} />
                      <span>ROI Calculator</span>
                    </div>
                    <div className="prompt-desc">Compound interest investment calculator with real-time feedback.</div>
                  </div>

                  <div 
                    className="sample-prompt-card"
                    onClick={() => handleSendMessage('Build me a clean HTML/CSS interactive tool.')}
                  >
                    <div className="prompt-title">
                      <Code size={16} style={{ color: 'var(--accent-chatgpt)' }} />
                      <span>Custom Web Tool</span>
                    </div>
                    <div className="prompt-desc">Generate any custom HTML/CSS/JS tool on the fly.</div>
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
                {isStreaming && (
                  <div className="message-wrapper ai" style={{ opacity: 0.8 }}>
                    <div className="avatar ai">
                      <Sparkles size={16} />
                    </div>
                    <div className="message-body">
                      <div className="message-content" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.75rem 1rem' }}>
                        <div className="typing-dot" />
                        <div className="typing-dot" />
                        <div className="typing-dot" />
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
            isStreaming={isStreaming}
            currentModelName={currentModel.name}
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
