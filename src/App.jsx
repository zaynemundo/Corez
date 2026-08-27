import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { PanelLeft } from 'lucide-react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import CanvasPreview from './components/CanvasPreview';
import SettingsModal from './components/SettingsModal';
import DropZoneOverlay from './components/DropZoneOverlay';
import Login from './pages/Login';
import { AuthProvider, useAuth } from './context/AuthContext';
import { formatBytes, processFiles, hasFiles } from './utils/fileAttachmentUtils';
import { generateAIResponse, extractCodeFromMessage, generateSessionTitle, generateAISessionTitle, isRevisionContextPrompt } from './services/aiService';
import { storeAppInR2, deleteSessionAppsInR2 } from './services/appStorageService';
import * as chatService from './services/chatService';
import CompactedBanner from './components/CompactedBanner';
import { compactChatMessages, shouldCompact, expandCompactedChat } from './services/smartCompact';

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

// Extract chatId from URL path /chat/:id
function useChatIdFromUrl() {
  const location = useLocation();
  return useMemo(() => {
    const m = location.pathname.match(/^\/chat\/([A-Za-z0-9_-]+)\/?$/);
    return m ? m[1] : null;
  }, [location.pathname]);
}

function MainApp() {
  const navigate = useNavigate();
  const _location = useLocation();
  const chatIdFromUrl = useChatIdFromUrl();
  const { user } = useAuth();

  const [sessions, setSessions] = useState([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [activeView, setActiveView] = useState('chat');

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    return !window.matchMedia('(max-width: 767px)').matches;
  });
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [canvasFullScreen, setCanvasFullScreen] = useState(false);
  const [activeCanvasCode, setActiveCanvasCode] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [streamingContent, setStreamingContent] = useState(null);
  const [isStreamCollapsed, setIsStreamCollapsed] = useState(false);
  const [swarmVisible, setSwarmVisible] = useState(false);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('corez_theme') || 'dark';
    } catch {
      return 'dark';
    }
  });
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(max-width: 767px)').matches;
  });
  const [attachments, setAttachments] = useState([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [expandedCompactIds, setExpandedCompactIds] = useState(() => new Set());

  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const focusTimeoutRef = useRef(null);
  const resumeStartedRef = useRef(false);
  const dragCounterRef = useRef(0);
  const userDismissedCanvasRef = useRef(false);
  const sessionsRef = useRef(sessions);
  const fetchingChatIdsRef = useRef(new Set());
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  const activeSessionId = chatIdFromUrl;
  const activeSession = useMemo(() => sessions.find(s => s.id === activeSessionId) || null, [sessions, activeSessionId]);

  // -------------------------------------------------------------
  // Fetch chat list on mount / user change
  // -------------------------------------------------------------
  const fetchChatList = useCallback(async () => {
    if (!user) return;
    try {
      const chats = await chatService.listChats();
      const mapped = chats.map((c) => ({
        id: c.id,
        title: c.title,
        messages: [],
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        _loaded: false,
      }));
      setSessions(mapped);
      setSessionsLoaded(true);

      // Migration: if server has 0 chats but localStorage has sessions, migrate in BACKGROUND
      // Do NOT block the initial load - user should see "empty" immediately, migration happens async
      if (mapped.length === 0) {
        try {
          const saved = localStorage.getItem('corez_sessions');
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const toMigrate = parsed.filter(s => s && Array.isArray(s.messages) && s.messages.length > 0).slice(0, 5);
              if (toMigrate.length > 0) {
                // Run migration in background, parallelized (not sequential)
                (async () => {
                  try {
                    await Promise.all(toMigrate.map(async (local) => {
                      try {
                        const title = local.title || 'Migrated Conversation';
                        const created = await chatService.createChat({ title });
                        if (local.messages && local.messages.length > 0) {
                          const sanitized = local.messages.map((m, idx) => ({
                            role: m.role || 'user',
                            content: typeof m.content === 'string' ? m.content : '',
                            attachments: m.attachments || null,
                            createdAt: Date.now() + idx,
                          }));
                          await chatService.putChat(created.id, { messages: sanitized });
                        }
                      } catch (e) {
                        console.warn('Migration failed for session', local.id, e);
                      }
                    }));
                    const after = await chatService.listChats();
                    setSessions(after.map((c) => ({
                      id: c.id,
                      title: c.title,
                      messages: [],
                      createdAt: c.createdAt,
                      updatedAt: c.updatedAt,
                      _loaded: false,
                    })));
                    try { localStorage.removeItem('corez_sessions'); } catch {}
                  } catch (e) {
                    console.warn('Background migration failed', e);
                  }
                })();
              }
            }
          }
        } catch (e) {
          console.warn('Chat migration check failed', e);
        }
      }
    } catch (e) {
      console.warn('Failed to list chats, falling back to localStorage:', e);
      try {
        const saved = localStorage.getItem('corez_sessions');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const conforming = parsed.filter((s) => s && Array.isArray(s.messages));
            setSessions(conforming.map(s => ({ ...s, _loaded: true })));
          }
        }
      } catch {}
      setSessionsLoaded(true);
    }
  }, [user]);

  useEffect(() => {
    fetchChatList();
  }, [fetchChatList]);

  // -------------------------------------------------------------
  // Fetch messages for active chat when URL changes — parallel, not blocked by chat list
  // Smart compacting: fetch compact view by default (keep recent 30), expand on demand
  // -------------------------------------------------------------
  useEffect(() => {
    if (!activeSessionId) return;
    if (!user) return;
    // Use ref to avoid re-triggering when sessions array changes (prevents waterfall)
    const existing = sessionsRef.current.find(s => s.id === activeSessionId);
    if (existing && existing._loaded) return;
    if (fetchingChatIdsRef.current.has(activeSessionId)) return;
    fetchingChatIdsRef.current.add(activeSessionId);

    let cancelled = false;
    const load = async () => {
      setChatLoading(true);
      try {
        const isExpanded = expandedCompactIds.has(activeSessionId);
        const data = isExpanded
          ? await chatService.getChat(activeSessionId, { compact: false })
          : await chatService.getChat(activeSessionId, { compact: true, keep: 30 });
        if (cancelled) return;
        let msgs = Array.isArray(data.messages) ? data.messages.map((m) => ({
          role: m.role,
          content: m.content,
          attachments: m.attachments || undefined,
          // Preserve server compact meta on the banner message if present
          ...(m._compactMeta ? { _compactMeta: m._compactMeta } : {}),
        })) : [];
        let compactMeta = data.compactMeta || null;
        let fullMessages = null;
        // Extract compact meta from banner message if server embedded it
        const bannerFromServer = msgs.find((m) => m._compactMeta?.isCompactSummary);
        if (bannerFromServer && !compactMeta) compactMeta = bannerFromServer._compactMeta;
        // Client-side fallback: if server didn't compact but we should (e.g. local fallback or small keep threshold)
        if (!compactMeta && !isExpanded && shouldCompact(msgs)) {
          const result = compactChatMessages(msgs);
          if (result.compacted) {
            msgs = result.displayMessages;
            compactMeta = result.meta;
            fullMessages = result.originalMessages;
          }
        }
        setSessions(prev => {
          const idx = prev.findIndex(s => s.id === activeSessionId);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...prev[idx], title: data.title, messages: msgs, _loaded: true, _compactMeta: compactMeta, _fullMessages: fullMessages };
            return next;
          }
          // Chat exists on server but not in list yet (e.g. direct link / shared device)
          return [{ id: data.id, title: data.title, messages: msgs, createdAt: data.createdAt, updatedAt: data.updatedAt, _loaded: true, _compactMeta: compactMeta, _fullMessages: fullMessages }, ...prev];
        });
      } catch (e) {
        if (e?.status === 404 || e?.status === 403) {
          console.warn('Chat not found or not authorized, redirecting to /', activeSessionId);
          if (!cancelled) navigate('/', { replace: true });
        } else {
          console.warn('Failed to load chat', activeSessionId, e);
        }
      } finally {
        if (!cancelled) setChatLoading(false);
        fetchingChatIdsRef.current.delete(activeSessionId);
      }
    };
    load();
    return () => { cancelled = true; fetchingChatIdsRef.current.delete(activeSessionId); };
  }, [activeSessionId, user, navigate, expandedCompactIds]);

  // -------------------------------------------------------------
  // UI helpers
  // -------------------------------------------------------------
  useEffect(() => {
    const handleWindowDragEnter = (e) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      dragCounterRef.current += 1;
      if (dragCounterRef.current === 1) {
        setIsDraggingOver(true);
      }
    };
    const handleWindowDragLeave = (e) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
      if (dragCounterRef.current === 0) {
        setIsDraggingOver(false);
      }
    };
    const handleWindowDragOver = (e) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };
    const handleWindowDrop = (e) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDraggingOver(false);
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        processFiles(files, setAttachments);
        if (chatInputRef.current) {
          chatInputRef.current.focus();
        }
      }
    };
    window.addEventListener('dragenter', handleWindowDragEnter);
    window.addEventListener('dragleave', handleWindowDragLeave);
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('drop', handleWindowDrop);
    return () => {
      window.removeEventListener('dragenter', handleWindowDragEnter);
      window.removeEventListener('dragleave', handleWindowDragLeave);
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mobileQuery = window.matchMedia('(max-width: 767px)');
    const syncSidebarWithViewport = (event) => {
      setIsMobileViewport(event.matches);
      if (event.matches) {
        setSidebarOpen(false);
      }
    };
    setIsMobileViewport(mobileQuery.matches);
    mobileQuery.addEventListener?.('change', syncSidebarWithViewport);
    return () => mobileQuery.removeEventListener?.('change', syncSidebarWithViewport);
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
          // Find session — may need to fetch from server if not yet loaded
          const targetSessionId = pendingData.sessionId;
          // Ensure we navigate to that chat if not already there
          if (chatIdFromUrl !== targetSessionId) {
            navigate(`/chat/${targetSessionId}`, { replace: true });
          }
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
                if (s.id === targetSessionId) {
                  const last = s.messages[s.messages.length - 1];
                  if (isDuplicateAssistantMessage(last, aiMsg)) return s;
                  return { ...s, messages: [...s.messages, aiMsg] };
                }
                return s;
              }));
              // Persist assistant message server-side
              chatService.appendMessage(targetSessionId, { role: 'assistant', content: aiMsg.content }).catch(() => {});
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
      }
    } catch (err) {
      console.warn('Failed to parse corez_pending_request', err);
      localStorage.removeItem('corez_pending_request');
    }
  }, [chatIdFromUrl, navigate]);

  useEffect(() => {
    if (activeView === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeSession?.messages, isThinking, activeView]);

  const handleSelectSession = (id) => {
    navigate(`/chat/${id}`);
    setActiveView('chat');
    setCanvasOpen(false);
    setCanvasFullScreen(false);
    setActiveCanvasCode(null);
    setRevisionContextCode('');
  };

  const handleExpandCompact = async () => {
    if (!activeSessionId) return;
    const active = sessions.find((s) => s.id === activeSessionId);
    // If we have full snapshot from client-side compact, restore without fetch
    if (active?._fullMessages && Array.isArray(active._fullMessages) && active._fullMessages.length > 0) {
      setSessions((prev) => prev.map((s) => s.id === activeSessionId ? { ...s, messages: active._fullMessages, _compactMeta: null, _fullMessages: null } : s));
      setExpandedCompactIds((prev) => { const n = new Set(prev); n.add(activeSessionId); return n; });
      return;
    }
    // Otherwise fetch full history from server
    setChatLoading(true);
    try {
      const data = await chatService.getChat(activeSessionId, { compact: false });
      const msgs = Array.isArray(data.messages) ? data.messages.map((m) => ({ role: m.role, content: m.content, attachments: m.attachments || undefined })) : [];
      setSessions((prev) => prev.map((s) => s.id === activeSessionId ? { ...s, messages: msgs, _compactMeta: null, _fullMessages: null, _loaded: true } : s));
      setExpandedCompactIds((prev) => { const n = new Set(prev); n.add(activeSessionId); return n; });
    } catch (e) {
      console.warn('Failed to expand compacted chat', e);
    } finally {
      setChatLoading(false);
    }
  };

  const handleCollapseCompact = () => {
    if (!activeSessionId) return;
    const active = sessions.find((s) => s.id === activeSessionId);
    const full = active?.messages;
    if (!full || !Array.isArray(full) || full.length === 0) return;
    // Re-compact the currently loaded full history
    if (shouldCompact(full)) {
      const result = compactChatMessages(full);
      if (result.compacted) {
        setSessions((prev) => prev.map((s) => s.id === activeSessionId ? { ...s, messages: result.displayMessages, _compactMeta: result.meta, _fullMessages: result.originalMessages } : s));
      }
    }
    setExpandedCompactIds((prev) => { const n = new Set(prev); n.delete(activeSessionId); return n; });
  };

  const handleNewChat = () => {
    navigate('/');
    setActiveView('chat');
    setCanvasOpen(false);
    setCanvasFullScreen(false);
    setRevisionContextCode('');
    setActiveCanvasCode(null);
  };

  const handleDeleteSession = async (id) => {
    // Optimistic UI
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSessionId === id) {
      const remaining = sessions.filter(s => s.id !== id);
      if (remaining.length > 0) {
        navigate(`/chat/${remaining[0].id}`);
      } else {
        navigate('/');
      }
    }
    try {
      await chatService.deleteChat(id);
    } catch (e) {
      console.warn('Server delete failed, keeping optimistic', e);
    }
    deleteSessionAppsInR2(id).catch(err => console.warn('Failed to clean up session R2 apps:', err));
  };

  const handleClearAllHistory = async () => {
    const ids = sessions.map(s => s.id);
    setSessions([]);
    navigate('/');
    setActiveCanvasCode('');
    setSettingsOpen(false);
    try {
      await chatService.deleteAllChats();
    } catch (e) {
      console.warn('Server clear all failed', e);
      // fallback: try deleting one by one
      for (const id of ids) {
        chatService.deleteChat(id).catch(() => {});
      }
    }
    ids.forEach(id => deleteSessionAppsInR2(id).catch(() => {}));
  };

  const handleCloseCanvas = () => {
    userDismissedCanvasRef.current = true;
    setCanvasOpen(false);
    setCanvasFullScreen(false);
  };

  const handleRunInCanvas = (code) => {
    userDismissedCanvasRef.current = false;
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

  const handleSendMessage = async (promptText, attachmentsArg = []) => {
    if (isThinking) return;
    setAttachments([]);

    // Determine target chat — create if on "/" 
    let targetSessionId = activeSessionId;
    let _isNewlyCreated = false;
    let draftMessages = activeSession?.messages || [];

    // If no active chat, create one server-side first so URL becomes /chat/:id
    if (!targetSessionId) {
      const provisionalTitle = generateSessionTitle(promptText || attachmentsArg[0]?.name || 'New Conversation');
      try {
        const created = await chatService.createChat({ title: provisionalTitle });
        targetSessionId = created.id;
        _isNewlyCreated = true;
        const newSession = {
          id: targetSessionId,
          title: created.title,
          messages: [],
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
          _loaded: true,
        };
        setSessions(prev => [newSession, ...prev]);
        navigate(`/chat/${targetSessionId}`, { replace: false });
        draftMessages = [];
      } catch (e) {
        console.warn('Failed to create chat on server, falling back to local id', e);
        targetSessionId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        _isNewlyCreated = true;
        const fallbackSession = {
          id: targetSessionId,
          title: provisionalTitle,
          messages: [],
          _loaded: true,
        };
        setSessions(prev => [fallbackSession, ...prev]);
        navigate(`/chat/${targetSessionId}`, { replace: false });
        draftMessages = [];
      }
    } else {
      // Ensure messages are loaded for existing chat before appending
      const existing = sessions.find(s => s.id === targetSessionId);
      if (existing && !existing._loaded) {
        try {
          const isExpanded = expandedCompactIds.has(targetSessionId);
          const data = isExpanded
            ? await chatService.getChat(targetSessionId, { compact: false })
            : await chatService.getChat(targetSessionId, { compact: true, keep: 30 });
          let msgs = Array.isArray(data.messages) ? data.messages.map(m => ({
            role: m.role,
            content: m.content,
            attachments: m.attachments || undefined,
            ...(m._compactMeta ? { _compactMeta: m._compactMeta } : {}),
          })) : [];
          let compactMeta = data.compactMeta || null;
          const bannerFromServer = msgs.find((m) => m._compactMeta?.isCompactSummary);
          if (bannerFromServer && !compactMeta) compactMeta = bannerFromServer._compactMeta;
          let fullMessages = null;
          if (!compactMeta && !isExpanded && shouldCompact(msgs)) {
            const result = compactChatMessages(msgs);
            if (result.compacted) {
              msgs = result.displayMessages;
              compactMeta = result.meta;
              fullMessages = result.originalMessages;
            }
          }
          setSessions(prev => prev.map(s => s.id === targetSessionId ? { ...s, title: data.title, messages: msgs, _loaded: true, _compactMeta: compactMeta, _fullMessages: fullMessages } : s));
          draftMessages = msgs;
        } catch {}
      } else if (existing && existing._compactMeta) {
        // Keep compacted view for draft — the banner summarizes older history for the AI
        draftMessages = existing.messages;
      }
    }

    const attachmentPrompt = buildAttachmentPrompt(attachmentsArg);
    const displayPrompt = promptText;
    let apiPrompt = attachmentPrompt
      ? `${promptText}${attachmentPrompt}`.trim()
      : promptText;

    if (revisionContextCode) {
      apiPrompt = `${apiPrompt}\n\n[Existing code to revise - apply the requested change directly and output the complete updated file]:\n\`\`\`html\n${revisionContextCode}\n\`\`\``;
      setRevisionContextCode('');
    }

    const displayAttachments = attachmentsArg.map(({ id, name, type, size, thumb }) => ({ id, name, type, size, thumb }));
    const apiAttachments = attachmentsArg.map(({ name, type, size, thumb, content }) => ({ name, type, size, thumb, content }));

    const displayMsg = { role: 'user', content: displayPrompt, attachments: displayAttachments };
    const apiMsg = { role: 'user', content: apiPrompt, attachments: apiAttachments };

    const updatedApiMessages = [...draftMessages, apiMsg];

    const isFreshSession = draftMessages.length === 0;
    if (isFreshSession && (promptText || displayAttachments[0]?.name)) {
      generateAISessionTitle(promptText || displayAttachments[0]?.name)
        .then((aiTitle) => {
          if (!aiTitle) return;
          setSessions(prev => prev.map(s => s.id === targetSessionId ? { ...s, title: aiTitle } : s));
          // Persist title server-side
          chatService.patchChatTitle(targetSessionId, aiTitle).catch(() => {});
        });
    }

    // Optimistic UI + local title update (move updated chat to top for recency)
    const nowTs = Date.now();
    setSessions(prev => {
      const mapped = prev.map(s => {
        if (s.id === targetSessionId) {
          const updatedTitle = s.messages.length === 0
            ? generateSessionTitle(promptText || displayAttachments[0]?.name || 'New Conversation')
            : s.title;
          if (s.messages.length === 0 && updatedTitle !== s.title) {
            chatService.patchChatTitle(targetSessionId, updatedTitle).catch(() => {});
          }
          const nextMessages = [...s.messages, displayMsg];
          const nextFull = Array.isArray(s._fullMessages) ? [...s._fullMessages, displayMsg] : s._fullMessages;
          // Auto-compact if we just grew beyond threshold and we are not expanded
          let nextCompactMeta = s._compactMeta || null;
          let finalMessages = nextMessages;
          let finalFull = nextFull;
          if (!expandedCompactIds.has(targetSessionId) && shouldCompact(nextFull || nextMessages)) {
            const sourceForCompact = nextFull || nextMessages;
            const result = compactChatMessages(sourceForCompact);
            if (result.compacted) {
              finalMessages = result.displayMessages;
              nextCompactMeta = result.meta;
              finalFull = result.originalMessages;
              // Keep the newly added message visible (it is already in recent)
            }
          }
          return { ...s, title: updatedTitle, messages: finalMessages, _loaded: true, updatedAt: nowTs, _compactMeta: nextCompactMeta, _fullMessages: finalFull };
        }
        return s;
      });
      // Move target to front for recency (keep server sort consistent)
      const target = mapped.find(s => s.id === targetSessionId);
      if (!target) return mapped;
      return [target, ...mapped.filter(s => s.id !== targetSessionId)];
    });

    // Persist user message server-side (fire-and-forget, but await for ordering)
    try {
      await chatService.appendMessage(targetSessionId, { role: 'user', content: displayPrompt, attachments: displayAttachments });
    } catch (e) {
      console.warn('Failed to persist user message', e);
    }

    setIsThinking(true);
    setSwarmVisible(false);

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

    const isRevision = Boolean(revisionContextCode) || isRevisionContextPrompt(apiPrompt) || /^\s*(?:@\w+\s+)?(?:revise|update|change|fix|modify|refactor)\b/i.test(promptText);

    const isCreationIntent = isRevision
      || /^\s*@(game|website|app)\b/i.test(promptText)
      || /\b(build|create|make|generate|design|develop|code|revise|update|fix|modify|refactor)\b.{0,80}\b(game|app|website|tool|dashboard|calculator|canvas|platformer|pong|shooter|snake|rpg|3d|code)\b/i.test(promptText);

    userDismissedCanvasRef.current = false;

    if (isCreationIntent) {
      if (!isRevision) {
        setActiveCanvasCode('');
      }
      setCanvasOpen(true);
    }

    try {
      setIsStreamCollapsed(false);
      setStreamingContent('');
      const response = await generateAIResponse(apiPrompt, updatedApiMessages, controller.signal, (delta) => {
        setStreamingContent(prev => (prev || '') + delta);
      }, (phaseEvent) => {
        setSwarmVisible(phaseEvent.phase === 'swarm-planning');
      }, () => {
        setStreamingContent('');
      });
      if (response) {
        const aiMsg = toAssistantMessage(response);
        const extractedCode = extractCodeFromMessage(aiMsg.content);
        if (extractedCode) {
          setActiveCanvasCode(extractedCode);
          if (!userDismissedCanvasRef.current) {
            setCanvasOpen(true);
          }
        }
        
        const nowTs2 = Date.now();
        setSessions(prev => {
          const mapped = prev.map(s => {
            if (s.id === targetSessionId) {
              const nextMsgs = [...s.messages, aiMsg];
              const nextFull = Array.isArray(s._fullMessages) ? [...s._fullMessages, aiMsg] : s._fullMessages;
              let finalMsgs = nextMsgs;
              let finalFull = nextFull;
              let finalMeta = s._compactMeta || null;
              if (!expandedCompactIds.has(targetSessionId) && shouldCompact(nextFull || nextMsgs)) {
                const src = nextFull || nextMsgs;
                const res = compactChatMessages(src);
                if (res.compacted) {
                  finalMsgs = res.displayMessages;
                  finalMeta = res.meta;
                  finalFull = res.originalMessages;
                }
              }
              return { ...s, messages: finalMsgs, _fullMessages: finalFull, _compactMeta: finalMeta, updatedAt: nowTs2 };
            }
            return s;
          });
          const target = mapped.find(s => s.id === targetSessionId);
          if (!target) return mapped;
          return [target, ...mapped.filter(s => s.id !== targetSessionId)];
        });
        // Persist assistant message server-side
        chatService.appendMessage(targetSessionId, { role: 'assistant', content: aiMsg.content }).catch(() => {});
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('AI generation error:', err);
      }
    } finally {
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
    if (!activeCanvasCode && code) {
      setActiveCanvasCode(code);
    }
    setCanvasFullScreen(false);
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

  const handleOverlayDrop = (e) => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDraggingOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFiles(files, setAttachments);
      if (chatInputRef.current) {
        chatInputRef.current.focus();
      }
    }
  };

  const handleOverlayDragLeave = (e) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDraggingOver(false);
  };

  const handleOverlayDragOver = (e) => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  // Filter + sort for sidebar: show chats with at least one message OR currently active empty chat, most recent first
  // FIX: chats from listChats start as {messages:[], _loaded:false} until their messages are fetched.
  // The old filter hid every non-active chat on refresh because messages.length was 0.
  const sidebarSessions = useMemo(() => {
    const filtered = sessions.filter(s => {
      if (s.id === activeSessionId) return true;
      if (s._loaded === false) return true;
      return Array.isArray(s.messages) && s.messages.length > 0;
    });
    return [...filtered].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }, [sessions, activeSessionId]);

  return (
    <div className="app-container">
      <DropZoneOverlay
        isDragging={isDraggingOver}
        onDrop={handleOverlayDrop}
        onDragLeave={handleOverlayDragLeave}
        onDragOver={handleOverlayDragOver}
      />

      <Sidebar
        isOpen={sidebarOpen}
        sessions={sidebarSessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        onOpenSettings={() => setSettingsOpen(true)}
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
                {!sessionsLoaded ? (
                  <div className="welcome-container">
                    <h1 className="welcome-title">COREZ</h1>
                    <p className="welcome-subtitle">Loading your chats…</p>
                  </div>
                ) : chatLoading ? (
                  <div className="welcome-container">
                    <h1 className="welcome-title">COREZ</h1>
                    <p className="welcome-subtitle">Loading conversation…</p>
                  </div>
                ) : !activeSession || activeSession.messages.length === 0 ? (
                  <div className="welcome-container">
                    <h1 className="welcome-title">COREZ</h1>
                    {activeSessionId && (
                      <p className="welcome-subtitle">Start a new conversation</p>
                    )}
                  </div>
                ) : (
                  <div className="messages-inner">
                    {activeSession?.messages.map((msg, idx) => {
                      if (msg?._compactMeta?.isCompactSummary) {
                        const isExpanded = expandedCompactIds.has(activeSessionId);
                        return (
                          <CompactedBanner
                            key={`compact-${idx}`}
                            meta={msg._compactMeta}
                            isExpanded={isExpanded}
                            onExpand={handleExpandCompact}
                            onCollapse={handleCollapseCompact}
                          />
                        );
                      }
                      return (
                        <ChatMessage
                          key={idx}
                          message={msg}
                          onRunInCanvas={handleRunInCanvas}
                          onReviseCode={handleReviseCode}
                        />
                      );
                    })}
                    {isThinking && (
                      <div className="message-wrapper ai">
                        <div className="message-body">
                          <button
                            type="button"
                            className="thinking-indicator-box thinking-dots thinking-dots-toggle"
                            onClick={() => setIsStreamCollapsed(prev => !prev)}
                            title={isStreamCollapsed ? 'Click to expand response stream' : 'Click to collapse response stream'}
                            aria-label={isStreamCollapsed ? 'Expand response' : 'Collapse response'}
                          >
                            {swarmVisible && (
                              <span className="thinking-phase-label">Swarm planning…</span>
                            )}
                            <span className="thinking-dot" />
                            <span className="thinking-dot" />
                            <span className="thinking-dot" />
                          </button>
                          {streamingContent && !isStreamCollapsed && (
                            <div className="message-content streaming-text" role="status" aria-label="Corez is responding">
                              {streamingContent}
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
                attachments={attachments}
                setAttachments={setAttachments}
              />
            </div>

            {canvasOpen && (
              <CanvasPreview
                code={activeCanvasCode}
                title={activeSession?.title || 'Untitled Application'}
                onClose={handleCloseCanvas}
                onRevise={handleReviseCode}
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
      />
    </div>
  );
}

function AppInner() {
  const { user, loading } = useAuth();
  if (loading) {
    return null;
  }
  if (!user) {
    return <Login />;
  }
  // Authenticated — render routed MainApp
  return (
    <Routes>
      <Route path="/" element={<MainApp />} />
      <Route path="/chat/:chatId" element={<MainApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </BrowserRouter>
  );
}
