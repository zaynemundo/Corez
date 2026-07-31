import { useState, useEffect, useRef, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import CanvasPreview from './components/CanvasPreview';
import SettingsModal from './components/SettingsModal';
import ImageStudioPage from './components/ImageStudioPage';
import { generateAIResponse, extractCodeFromMessage } from './services/aiService';
import { fetchMarketData, unavailableMarket } from './services/marketService';
import { storeAppInR2, deleteSessionAppsInR2 } from './services/appStorageService';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function createMarketMessageId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `market-${globalThis.crypto.randomUUID()}`;
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return `market-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function nextUniqueMarketMessageId(usedIds, createId) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = createId();
    if (typeof id === 'string' && id && !usedIds.has(id)) {
      usedIds.add(id);
      return id;
    }
  }
  throw new Error('Unable to create a unique market message ID.');
}

export function toAssistantMessage(response, createId = createMarketMessageId) {
  if (typeof response === 'string') {
    return { role: 'assistant', content: response };
  }
  if (isObject(response)
    && response.type === 'market'
    && isObject(response.request)
    && isObject(response.market)) {
    return {
      id: createId(),
      role: 'assistant',
      type: 'market',
      content: '',
      request: response.request,
      market: response.market
    };
  }
  return { role: 'assistant', content: '' };
}

export function normalizeMarketMessageIds(sessions, createId = createMarketMessageId) {
  if (!Array.isArray(sessions)) return [];
  const usedIds = new Set(
    sessions.flatMap((session) => Array.isArray(session?.messages) ? session.messages : [])
      .filter((message) => message?.type === 'market' && typeof message.id === 'string' && message.id)
      .map((message) => message.id)
  );
  const seenExistingIds = new Set();
  return sessions.map((session) => {
    if (!Array.isArray(session?.messages)) return session;
    let changed = false;
    const messages = session.messages.map((message) => {
      if (message?.type !== 'market') return message;
      if (typeof message.id === 'string' && message.id && !seenExistingIds.has(message.id)) {
        seenExistingIds.add(message.id);
        return message;
      }
      changed = true;
      return { ...message, id: nextUniqueMarketMessageId(usedIds, createId) };
    });
    return changed ? { ...session, messages } : session;
  });
}

export function replaceMarketMessageInSession(sessions, sessionId, messageId, request, market) {
  return sessions.map((session) => {
    if (session.id !== sessionId) return session;
    const messageIndex = session.messages.findIndex((message) => (
      message?.type === 'market' && message.id === messageId
    ));
    if (messageIndex === -1) return session;
    return {
      ...session,
      messages: session.messages.map((message, index) => (
        index === messageIndex ? { ...message, request, market } : message
      ))
    };
  });
}

function isDuplicateAssistantMessage(message, candidate) {
  if (candidate.type !== 'market') {
    return message?.role === 'assistant' && message?.content === candidate.content;
  }
  return message?.role === 'assistant'
    && message?.type === 'market'
    && JSON.stringify(message.request) === JSON.stringify(candidate.request)
    && JSON.stringify(message.market) === JSON.stringify(candidate.market);
}

export function marketRefreshKey(sessionId, messageId) {
  return JSON.stringify([sessionId, messageId]);
}

export async function runMarketRefresh({
  sessionId,
  messageId,
  nextRequest,
  refreshTokens,
  tokenSequence,
  setRefreshingMarketKeys,
  setSessions,
  fetchMarket = fetchMarketData,
  toUnavailable = unavailableMarket
}) {
  const key = marketRefreshKey(sessionId, messageId);
  const token = ++tokenSequence.current;
  refreshTokens.set(key, token);
  setRefreshingMarketKeys((previous) => new Set(previous).add(key));

  try {
    const market = await fetchMarket(nextRequest);
    if (refreshTokens.get(key) !== token) return;
    setSessions((previous) => replaceMarketMessageInSession(
      previous,
      sessionId,
      messageId,
      nextRequest,
      market
    ));
  } catch (error) {
    if (error?.name === 'AbortError' || refreshTokens.get(key) !== token) return;
    setSessions((previous) => replaceMarketMessageInSession(
      previous,
      sessionId,
      messageId,
      nextRequest,
      toUnavailable(error)
    ));
  } finally {
    if (refreshTokens.get(key) === token) {
      refreshTokens.delete(key);
      setRefreshingMarketKeys((previous) => {
        const next = new Set(previous);
        next.delete(key);
        return next;
      });
    }
  }
}

const INITIAL_SESSIONS = [
  {
    id: 'session-default',
    title: 'New Conversation',
    messages: []
  }
];

export default function App() {
  const [sessions, setSessions] = useState(() => {
    try {
      const saved = localStorage.getItem('corez_sessions');
      if (!saved) return INITIAL_SESSIONS;
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed) || parsed.length === 0) return INITIAL_SESSIONS;
      return normalizeMarketMessageIds(parsed);
    } catch {
      return INITIAL_SESSIONS;
    }
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
  const [refreshingMarketKeys, setRefreshingMarketKeys] = useState(() => new Set());
  const [theme, setTheme] = useState(() => localStorage.getItem('corez_theme') || 'dark');
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 767px)').matches;
  });

  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const marketRefreshTokensRef = useRef(new Map());
  const marketRefreshSequenceRef = useRef(0);
  const saveTimeoutRef = useRef(null);
  const focusTimeoutRef = useRef(null);
  const resumeStartedRef = useRef(false);

  const activeSession = useMemo(() => sessions.find(s => s.id === activeSessionId) || sessions[0], [sessions, activeSessionId]);

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
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      try { localStorage.setItem('corez_sessions', JSON.stringify(sessions)); } catch { /* Ignore storage errors */ }
    }, 300);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [sessions]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('corez_theme', theme); } catch { /* Ignore storage errors */ }
  }, [theme]);

  // Auto-resume background AI generation across accidental page refreshes
  useEffect(() => {
    if (resumeStartedRef.current) return;
    resumeStartedRef.current = true;
    try {
      const savedPending = localStorage.getItem('corez_pending_request');
      if (savedPending) {
        const pendingData = JSON.parse(savedPending);
        if (pendingData && pendingData.sessionId && (Date.now() - (pendingData.timestamp || 0) < 300000)) {
          // Re-parse sessions fresh from storage: the mount-time snapshot may
          // predate the session the pending request belongs to (e.g. a refresh
          // inside the 300 ms persist debounce).
          let storedSessions = sessions;
          try {
            const parsed = JSON.parse(localStorage.getItem('corez_sessions') || '[]');
            if (Array.isArray(parsed)) storedSessions = parsed;
          } catch { /* fall back to the in-memory snapshot */ }
          const targetSession = storedSessions.find(s => s.id === pendingData.sessionId);
          if (targetSession) {
            setIsThinking(true);
            const controller = new AbortController();
            abortControllerRef.current = controller;

            generateAIResponse(pendingData.apiPrompt, pendingData.messages, controller.signal)
              .then(response => {
                if (!response) return;
                const aiMsg = toAssistantMessage(response);
                if (aiMsg.type !== 'market') {
                  const extractedCode = extractCodeFromMessage(aiMsg.content);
                  if (extractedCode) {
                    setActiveCanvasCode(extractedCode);
                    setCanvasOpen(true);
                  }
                }
                setSessions(prev => prev.map(s => {
                  if (s.id === pendingData.sessionId) {
                    const last = s.messages[s.messages.length - 1];
                    if (isDuplicateAssistantMessage(last, aiMsg)) return s;
                    return { ...s, messages: [...s.messages, aiMsg] };
                  }
                  return s;
                }));
              })
              .catch(err => {
                if (err?.name !== 'AbortError') {
                  console.warn('Background AI response recovery error:', err);
                }
              })
              .finally(() => {
                localStorage.removeItem('corez_pending_request');
                setIsThinking(false);
                if (abortControllerRef.current === controller) abortControllerRef.current = null;
              });
          } else {
            localStorage.removeItem('corez_pending_request');
          }
        } else {
          localStorage.removeItem('corez_pending_request');
        }
      }
    } catch (err) {
      console.warn('Failed to parse corez_pending_request', err);
      localStorage.removeItem('corez_pending_request');
    }
  }, []);

  useEffect(() => {
    if (activeView === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeSession?.messages, isThinking, activeView]);

  const handleSelectSession = (id) => {
    setActiveSessionId(id);
    setActiveView('chat');
    setCanvasOpen(false);
    setCanvasFullScreen(false);
    setActiveCanvasCode(null);
    setRevisionContextCode('');
    const target = sessions.find(s => s.id === id);
    if (target && Array.isArray(target.messages) && target.messages.length > 0) {
      const lastAssistantMsg = [...target.messages].reverse().find(m => m.role === 'assistant' && m.type !== 'market');
      if (lastAssistantMsg) {
        const code = extractCodeFromMessage(lastAssistantMsg.content);
        if (code) {
          setActiveCanvasCode(code);
          setCanvasOpen(true);
        }
      }
    }
  };

  useEffect(() => {
    if (activeSession && Array.isArray(activeSession.messages) && activeSession.messages.length > 0) {
      const lastAssistantMsg = [...activeSession.messages].reverse().find(m => m.role === 'assistant' && m.type !== 'market');
      if (lastAssistantMsg) {
        const code = extractCodeFromMessage(lastAssistantMsg.content);
        if (code && !activeCanvasCode) {
          setActiveCanvasCode(code);
          setCanvasOpen(true);
        }
      }
    }
  }, [activeSessionId, activeCanvasCode]);

  const handleNewChat = () => {
    const newId = `session-${Date.now()}`;
    const newSession = {
      id: newId,
      title: 'New Conversation',
      messages: []
    };
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newId);
    setActiveView('chat');
    setCanvasOpen(false);
    setCanvasFullScreen(false);
    setRevisionContextCode('');
    setActiveCanvasCode(null);
  };

  const handleDeleteSession = (id) => {
    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== id);
      return filtered.length ? filtered : INITIAL_SESSIONS;
    });
    setActiveSessionId(prev => {
      if (prev !== id) return prev;
      const remaining = sessions.filter(s => s.id !== id);
      return remaining[0]?.id || INITIAL_SESSIONS[0].id;
    });
    // Asynchronously remove associated R2 app storage for this session
    deleteSessionAppsInR2(id).catch(err => console.warn('Failed to clean up session R2 apps:', err));
  };

  const handleClearAllHistory = () => {
    sessions.forEach(s => deleteSessionAppsInR2(s.id).catch(() => {}));
    setSessions(INITIAL_SESSIONS);
    setActiveSessionId(INITIAL_SESSIONS[0].id);
    setActiveCanvasCode('');
    setSettingsOpen(false);
  };

  const handleRunInCanvas = (code) => {
    setActiveCanvasCode(code);
    setCanvasOpen(true);
    if (activeSessionId && code) {
      storeAppInR2({
        sessionId: activeSessionId,
        appId: `app_${Date.now()}`,
        title: activeSession?.title || 'Canvas Application',
        code
      }).then(result => {
        if (result && result.success === false) {
          console.warn('R2 background store failed; app remains in local session state.');
        }
      }).catch(err => console.warn('R2 background store notification:', err));
    }
  };

  const handleStopMessage = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    localStorage.removeItem('corez_pending_request');
    setIsThinking(false);
  };

  const [chatInput, setChatInput] = useState('');
  const [revisionContextCode, setRevisionContextCode] = useState('');

  const handleSendMessage = async (promptText) => {
    if (isThinking || !activeSession) return;
    const targetSessionId = activeSessionId;

    let displayPrompt = promptText;
    let apiPrompt = promptText;

    if (revisionContextCode) {
      apiPrompt = `[Context: The user is requesting a revision for the following code block]\n\`\`\`\n${revisionContextCode}\n\`\`\`\n\nUser Request: ${promptText}`;
      setRevisionContextCode('');
    }

    const displayMsg = { role: 'user', content: displayPrompt };
    const apiMsg = { role: 'user', content: apiPrompt };

    const updatedApiMessages = [...activeSession.messages, apiMsg];

    setSessions(prev => prev.map(s => {
      if (s.id === targetSessionId) {
        const updatedTitle = s.messages.length === 0
          ? (promptText.length > 30 ? promptText.slice(0, 27) + '...' : promptText)
          : s.title;
        return { ...s, title: updatedTitle, messages: [...s.messages, displayMsg] };
      }
      return s;
    }));

    setIsThinking(true);

    // Save pending request to localStorage for background execution across page refresh
    const pendingData = {
      sessionId: targetSessionId,
      apiPrompt,
      displayPrompt,
      messages: updatedApiMessages,
      timestamp: Date.now()
    };
    try { localStorage.setItem('corez_pending_request', JSON.stringify(pendingData)); } catch { /* Ignore storage errors */ }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await generateAIResponse(apiPrompt, updatedApiMessages, controller.signal);
      if (response) {
        const aiMsg = toAssistantMessage(response);
        if (aiMsg.type !== 'market') {
          const extractedCode = extractCodeFromMessage(aiMsg.content);
          if (extractedCode) {
            setActiveCanvasCode(extractedCode);
            setCanvasOpen(true);
          }
        }
        
        setSessions(prev => prev.map(s => {
          if (s.id === targetSessionId) {
            return { ...s, messages: [...s.messages, aiMsg] };
          }
          return s;
        }));
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('AI generation error:', err);
      }
    } finally {
      localStorage.removeItem('corez_pending_request');
      setIsThinking(false);
      abortControllerRef.current = null;
    }
  };

  const handleReviseCode = (code) => {
    setRevisionContextCode(code);
    const revisionPrompt = `Revise code: `;
    setChatInput(revisionPrompt);
    if (chatInputRef.current) {
      if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
      focusTimeoutRef.current = setTimeout(() => {
        if (chatInputRef.current) {
          chatInputRef.current.focus();
          chatInputRef.current.setSelectionRange(revisionPrompt.length, revisionPrompt.length);
        }
      }, 50);
    }
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
                    <div className="welcome-logo">
                      <img src="/corez-white.png" alt="Corez Logo" className="corez-welcome-logo-img" />
                    </div>
                    <h1 className="welcome-title">COREZ</h1>
                  </div>
                ) : (
                  <div className="messages-inner">
                    {activeSession?.messages.map((msg, idx) => (
                      <ChatMessage
                        key={msg.type === 'market' ? msg.id : idx}
                        message={msg}
                        onRunInCanvas={handleRunInCanvas}
                        onReviseCode={handleReviseCode}
                        onRefreshMarket={(nextRequest) => runMarketRefresh({
                          sessionId: activeSession.id,
                          messageId: msg.id,
                          nextRequest,
                          refreshTokens: marketRefreshTokensRef.current,
                          tokenSequence: marketRefreshSequenceRef,
                          setRefreshingMarketKeys,
                          setSessions
                        })}
                        marketRefreshing={refreshingMarketKeys.has(marketRefreshKey(activeSession.id, msg.id))}
                      />
                    ))}
                    {isThinking && (
                      <div className="message-wrapper ai">
                        <div className="message-body">
                          <div className="thinking-indicator-box thinking-dots" aria-label="Corez is thinking" role="status">
                            <span className="thinking-dot" />
                            <span className="thinking-dot" />
                            <span className="thinking-dot" />
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              <ChatInput
                input={chatInput}
                setInput={setChatInput}
                textareaRef={chatInputRef}
                onSendMessage={handleSendMessage}
                onStopMessage={handleStopMessage}
                isStreaming={isThinking}
              />
            </div>

            {canvasOpen && (
              <CanvasPreview
                code={activeCanvasCode}
                title={activeSession?.title || 'Untitled Application'}
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
