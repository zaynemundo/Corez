import { useState, useEffect, useRef, useMemo } from 'react';
import { PanelLeft } from 'lucide-react';
import Sidebar from './components/Sidebar';
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import CanvasPreview from './components/CanvasPreview';
import SettingsModal from './components/SettingsModal';
import AccountModal from './components/AccountModal';
import { generateAIResponse, extractCodeFromMessage, generateSessionTitle, generateAISessionTitle } from './services/aiService';
import { storeAppInR2, deleteSessionAppsInR2 } from './services/appStorageService';
import { loadAccountProfile } from './services/accountService';
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function toAssistantMessage(response) {
  if (typeof response === 'string') {
    return { role: 'assistant', content: response };
  }
  if (isObject(response)) {
    return { role: 'assistant', content: typeof response.content === 'string' ? response.content : '' };
  }
  return { role: 'assistant', content: '' };
}

function isDuplicateAssistantMessage(message, candidate) {
  return message?.role === 'assistant' && message?.content === candidate.content;
}

const INITIAL_SESSIONS = [
  {
    id: 'session-default',
    title: 'New Conversation',
    messages: []
  }
];

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildAttachmentPrompt(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return '';
  const sections = attachments.map((attachment) => {
    const meta = `- ${attachment.name} (${attachment.type || 'unknown type'}, ${formatBytes(attachment.size)})`;
    if (typeof attachment.content === 'string' && attachment.content.trim()) {
      return `${meta}\n  --- file content ---\n${attachment.content}\n  --- end of file ---`;
    }
    return meta;
  });
  return `\n\n[Attached files]\n${sections.join('\n')}\n`;
}

export default function App() {
  const [sessions, setSessions] = useState(() => {
    try {
      const saved = localStorage.getItem('corez_sessions');
      if (!saved) return INITIAL_SESSIONS;
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed) || parsed.length === 0) return INITIAL_SESSIONS;
      const conforming = parsed.filter((session) => session && Array.isArray(session.messages));
      return conforming.length > 0 ? conforming : INITIAL_SESSIONS;
    } catch {
      return INITIAL_SESSIONS;
    }
  });

  const [activeSessionId, setActiveSessionId] = useState(() => {
    return sessions[0]?.id || 'session-default';
  });

  const [activeView, setActiveView] = useState('chat');

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !window.matchMedia('(max-width: 767px)').matches;
  });
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [canvasFullScreen, setCanvasFullScreen] = useState(false);
  const [activeCanvasCode, setActiveCanvasCode] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountProfile, setAccountProfile] = useState(() => loadAccountProfile());
  const [isThinking, setIsThinking] = useState(false);
  const [streamingContent, setStreamingContent] = useState(null);
  // Swarm visibility: while the harness runs the parallel specialist
  // pre-pass it emits phase 'swarm-planning' — surface that to the user.
  const [swarmVisible, setSwarmVisible] = useState(false);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('corez_theme') || 'dark';
    } catch {
      return 'dark';
    }
  });
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 767px)').matches;
  });

  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const saveTimeoutRef = useRef(null);
  const focusTimeoutRef = useRef(null);
  const resumeStartedRef = useRef(false);

  const activeSession = useMemo(() => sessions.find(s => s.id === activeSessionId) || null, [sessions, activeSessionId]);

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
      try {
        // Persist without image thumbnails (base64 data URLs up to 1.5 MB
        // each): a few attachments would blow the localStorage quota and
        // silently kill ALL session persistence. Thumbs are re-rendered only
        // for the live session from memory; stored messages keep lightweight
        // file metadata.
        const serializable = sessions.map((session) => ({
          ...session,
          messages: session.messages.map((message) => {
            if (!message?.attachments?.some((a) => a?.thumb)) return message;
            return {
              ...message,
              attachments: message.attachments.map(({ thumb: _thumb, ...rest }) => rest)
            };
          })
        }));
        localStorage.setItem('corez_sessions', JSON.stringify(serializable));
      } catch { /* Ignore storage errors */ }
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
            setSwarmVisible(false);
            const controller = new AbortController();
            abortControllerRef.current = controller;

            generateAIResponse(pendingData.apiPrompt, pendingData.messages, controller.signal, (delta) => {
              setStreamingContent(prev => (prev || '') + delta);
            }, (phaseEvent) => {
              setSwarmVisible(phaseEvent.phase === 'swarm-planning');
            })
              .then(response => {
                if (!response) return;
                const aiMsg = toAssistantMessage(response);
                const extractedCode = extractCodeFromMessage(aiMsg.content);
                if (extractedCode) {
                  setActiveCanvasCode(extractedCode);
                  setCanvasOpen(true);
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
                setSwarmVisible(false);
                setStreamingContent(null);
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
  };

  const handleNewChat = () => {
    setActiveSessionId(null);
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

  const handleSendMessage = async (promptText, attachments = []) => {
    if (isThinking) return;

    let targetSessionId = activeSessionId;
    const draftMessages = activeSession?.messages || [];
    if (!targetSessionId) {
      targetSessionId = `session-${Date.now()}`;
    }

    const attachmentPrompt = buildAttachmentPrompt(attachments);
    const displayPrompt = promptText;
    let apiPrompt = attachmentPrompt
      ? `${promptText}${attachmentPrompt}`.trim()
      : promptText;

    if (revisionContextCode) {
      apiPrompt = `[Context: The user is requesting a revision for the following code block]\n\`\`\`\n${revisionContextCode}\n\`\`\`\n\nUser Request: ${apiPrompt}`;
      setRevisionContextCode('');
    }

    const displayAttachments = attachments.map(({ id, name, type, size, thumb }) => ({ id, name, type, size, thumb }));
    const apiAttachments = attachments.map(({ name, type, size, thumb, content }) => ({ name, type, size, thumb, content }));

    const displayMsg = { role: 'user', content: displayPrompt, attachments: displayAttachments };
    const apiMsg = { role: 'user', content: apiPrompt, attachments: apiAttachments };

    const updatedApiMessages = [...draftMessages, apiMsg];

    // Fresh conversations are named by the hosted AI (async, best-effort):
    // the deterministic title stands in instantly and the AI title replaces
    // it when the worker answers.
    const isFreshSession = draftMessages.length === 0;
    if (isFreshSession && (promptText || displayAttachments[0]?.name)) {
      generateAISessionTitle(promptText || displayAttachments[0]?.name)
        .then((aiTitle) => {
          if (!aiTitle) return;
          setSessions(prev => prev.map(s => s.id === targetSessionId ? { ...s, title: aiTitle } : s));
        });
    }

    setSessions(prev => {
      const existing = prev.find(s => s.id === targetSessionId);
      if (existing) {
        return prev.map(s => {
          if (s.id === targetSessionId) {
            const updatedTitle = s.messages.length === 0
              ? generateSessionTitle(promptText || displayAttachments[0]?.name || 'New Conversation')
              : s.title;
            return { ...s, title: updatedTitle, messages: [...s.messages, displayMsg] };
          }
          return s;
        });
      }
      return [{
        id: targetSessionId,
        title: generateSessionTitle(promptText || displayAttachments[0]?.name || 'New Conversation'),
        messages: [displayMsg]
      }, ...prev];
    });

    if (!activeSessionId) {
      setActiveSessionId(targetSessionId);
    }

    setIsThinking(true);
    setSwarmVisible(false);

    // Save pending request to localStorage for background execution across
    // page refresh. Large file payloads are stripped when the record would
    // exceed the storage quota — resume still works, the attachments just
    // resend as metadata-only.
    const pendingData = {
      sessionId: targetSessionId,
      apiPrompt,
      displayPrompt,
      messages: updatedApiMessages,
      timestamp: Date.now()
    };
    try {
      const serializedPending = JSON.stringify(pendingData);
      if (serializedPending.length <= 2 * 1024 * 1024) {
        localStorage.setItem('corez_pending_request', serializedPending);
      } else {
        const slimMessages = updatedApiMessages.map((message) => ({
          ...message,
          attachments: (message.attachments || []).map(({ content: _content, thumb: _thumb, ...rest }) => rest)
        }));
        localStorage.setItem('corez_pending_request', JSON.stringify({
          ...pendingData,
          messages: slimMessages
        }));
      }
    } catch { /* Ignore storage errors */ }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const isCreationIntent = /^\s*@(game|website|app)\b/i.test(prompt)
      || /\b(build|create|make|generate|design|develop|code)\b.{0,80}\b(game|app|website|tool|dashboard|calculator|canvas|platformer|pong|shooter|snake|rpg|3d)\b/i.test(prompt);

    if (isCreationIntent) {
      setActiveCanvasCode('');
      setCanvasOpen(true);
    }

    try {
      setStreamingContent('');
      const response = await generateAIResponse(apiPrompt, updatedApiMessages, controller.signal, (delta) => {
        setStreamingContent(prev => {
          const next = (prev || '') + delta;
          const liveCode = extractCodeFromMessage(next);
          if (liveCode) {
            setActiveCanvasCode(liveCode);
            setCanvasOpen(true);
          }
          return next;
        });
      }, (phaseEvent) => {
        setSwarmVisible(phaseEvent.phase === 'swarm-planning');
      }, () => {
        setStreamingContent('');
        if (isCreationIntent) setActiveCanvasCode('');
      });
      if (response) {
        const aiMsg = toAssistantMessage(response);
        const extractedCode = extractCodeFromMessage(aiMsg.content);
        if (extractedCode) {
          setActiveCanvasCode(extractedCode);
          setCanvasOpen(true);
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
      // Only settle the state this controller owns: an older generation that
      // finishes after Stop + a new send must never clear the new request's
      // pending record, thinking state, or abort controller.
      if (abortControllerRef.current === controller) {
        localStorage.removeItem('corez_pending_request');
        setIsThinking(false);
        setSwarmVisible(false);
        setStreamingContent(null);
        abortControllerRef.current = null;
      }
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
        sessions={sessions.filter(s => Array.isArray(s.messages) && s.messages.length > 0)}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        onOpenSettings={() => setSettingsOpen(true)}
        activeView={activeView}
        theme={theme}
        onToggleTheme={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
        onCloseSidebar={() => setSidebarOpen(false)}
        accountProfile={accountProfile}
        onOpenAccount={() => setAccountOpen(true)}
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
        <>
          <div className={`chat-pane ${canvasOpen ? 'canvas-active' : ''}`}>
              {!sidebarOpen && (
                <button
                  type="button"
                  className="sidebar-toggle-btn"
                  onClick={() => setSidebarOpen(true)}
                  title="Open Sidebar"
                  aria-label="Open Sidebar"
                >
                  <PanelLeft size={16} strokeWidth={1.5} />
                </button>
              )}

              <div className="messages-scroll">
                {!activeSession || activeSession.messages.length === 0 ? (
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
                        onReviseCode={handleReviseCode}
                      />
                    ))}
                    {isThinking && (
                      <div className="message-wrapper ai">
                        <div className="message-body">
                          {streamingContent ? (
                            <div className="message-content streaming-text" role="status" aria-label="Corez is responding">
                              {streamingContent}
                            </div>
                          ) : (
                            <div className="thinking-indicator-box thinking-dots" aria-label="Corez is thinking" role="status">
                              {swarmVisible && (
                                <span className="thinking-phase-label">Swarm planning…</span>
                              )}
                              <span className="thinking-dot" />
                              <span className="thinking-dot" />
                              <span className="thinking-dot" />
                            </div>
                          )}
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
                sessionId={activeSession?.id || null}
                isStreaming={isThinking}
              />
            )}
          </>
      </main>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onClearAllHistory={handleClearAllHistory}
        onOpenAccount={() => setAccountOpen(true)}
      />

      <AccountModal
        isOpen={accountOpen}
        onClose={() => setAccountOpen(false)}
        profile={accountProfile}
        onProfileUpdate={(updated) => setAccountProfile(updated)}
        sessions={sessions}
      />
    </div>
  );
}
