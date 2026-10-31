import { useState, useEffect, useRef, useMemo } from "react";
import { PanelLeft, Loader2 } from "lucide-react";
import {
  BrowserRouter,
  Routes,
  Route,
  useNavigate,
  useLocation,
  Navigate,
} from "react-router-dom";
import Sidebar from "./components/Sidebar";
import ChatMessage from "./components/ChatMessage";
import ThinkingPanel from "./components/ThinkingPanel.jsx";
import ChatInput from "./components/ChatInput";
import NewChatStarters from "./components/NewChatStarters";
import CanvasPreview from "./components/CanvasPreview";
import SettingsModal from "./components/SettingsModal";
import ChatShareModal from "./components/ChatShareModal";
import DropZoneOverlay from "./components/DropZoneOverlay";
import Login from "./pages/Login";
import Sites from "./pages/Sites";
import { PaymentSuccess } from "./pages/PaymentStatus";
import Pricing from "./pages/Pricing";
import Legal from "./pages/Legal";
import SharedChat from "./pages/SharedChat";
import CookieConsent from "./components/CookieConsent";
import { startAnalytics, trackPageView } from "./services/analytics";
import { AuthProvider, useAuth } from "./context/AuthContext";
import {
  dropChatPrefetches,
  prefetchChat,
  prefetchChatList,
} from "./services/chatPrefetch";
import { buildPhaseLabel } from "./utils/buildPhaseLabel";
import { applyRouteMeta } from "./utils/seo";
import { buildSiteRevisionContext } from "./utils/siteRevisionContext.js";
import CompactedBanner from "./components/CompactedBanner";
import { useI18n } from "./i18n/index.jsx";
import {
  isStreamVisibleForSession,
  isStreamActiveElsewhere,
} from "./utils/streamSession";
import { useSessionOrganization } from "./hooks/useSessionOrganization.js";
import { useGlobalFileDrop } from "./hooks/useGlobalFileDrop.js";
import { usePendingTurnRecovery } from "./hooks/usePendingTurnRecovery.js";
import { useChatTurnExecution } from "./hooks/useChatTurnExecution.js";
import { useConversationTurnExecution } from "./hooks/useConversationTurnExecution.js";
import ConversationSetupModal from "./components/ConversationSetupModal.jsx";

const DEFAULT_CONVERSATION_PERSONAS = [
  {
    id: "p1",
    name: "John",
    handle: "john",
    instructions: "Warm, grounded and curious. Asks a natural follow-up.",
  },
  {
    id: "p2",
    name: "Scarlett",
    handle: "scarlett",
    instructions: "Bright, playful and direct. Reacts to both people in the room.",
  },
];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function toAssistantMessage(response, thinking = "", thinkingSeconds = 0) {
  // The reasoning is attached to the message so the collapsed "Thought for Ns"
  // disclosure survives after the turn completes, exactly like the streaming
  // panel that produced it. It is display-only: never part of `content`.
  const withThinking = (message) => {
    const text = typeof thinking === "string" ? thinking.trim() : "";
    if (!text) return message;
    const seconds = Number(thinkingSeconds);
    return Number.isFinite(seconds) && seconds > 0
      ? { ...message, thinking: text, thinkingSeconds: Math.round(seconds) }
      : { ...message, thinking: text };
  };
  if (typeof response === "string") {
    return withThinking({ role: "assistant", content: response });
  }
  if (isObject(response)) {
    return withThinking({
      role: "assistant",
      content: typeof response.content === "string" ? response.content : "",
    });
  }
  return { role: "assistant", content: "" };
}

function isDuplicateAssistantMessage(message, candidate) {
  return (
    message?.role === "assistant" && message?.content === candidate.content
  );
}

// Extract chatId from URL path /chat/:id
function useChatIdFromUrl() {
  const location = useLocation();
  return useMemo(() => {
    const m = location.pathname.match(/^\/chat\/([A-Za-z0-9_-]+)\/?$/);
    return m ? m[1] : null;
  }, [location.pathname]);
}

function MainApp({ theme, setTheme }) {
  const navigate = useNavigate();
  const location = useLocation();
  // The shell hosts two screens: the conversation and the Sites list. The URL is
  // the source of truth so a refresh or a shared link lands on the right one.
  const isSitesView = location.pathname === "/sites";
  const chatIdFromUrl = useChatIdFromUrl();
  const { user } = useAuth();
  const { t } = useI18n();

  const [activeView, setActiveView] = useState("chat");
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    )
      return true;
    return !window.matchMedia("(max-width: 767px)").matches;
  });
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [canvasFullScreen, setCanvasFullScreen] = useState(false);
  const [activeCanvasCode, setActiveCanvasCode] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareChatId, setShareChatId] = useState(null);
  const [isThinking, setIsThinking] = useState(false);
  const [streamingContent, setStreamingContent] = useState(null);
  const [streamingThinking, setStreamingThinking] = useState("");
  const streamingThinkingRef = useRef("");
  const thinkingStartedAtRef = useRef(0);
  const [isThinkingOpen, setIsThinkingOpen] = useState(true);
  const [streamingSessionId, setStreamingSessionId] = useState(null);
  const [streamingSpeaker, setStreamingSpeaker] = useState(null);
  const [conversationDraft, setConversationDraft] = useState(null);
  const [conversationSetupOpen, setConversationSetupOpen] = useState(false);
  const [swarmVisible, setSwarmVisible] = useState(false);
  const [buildPhase, setBuildPhase] = useState(null);
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    )
      return false;
    return window.matchMedia("(max-width: 767px)").matches;
  });
  const [attachments, setAttachments] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [revisionContextCode, setRevisionContextCode] = useState("");
  const [revisionContextSessionId, setRevisionContextSessionId] =
    useState(null);
  const [siteEditDraft, setSiteEditDraft] = useState(null);

  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const focusTimeoutRef = useRef(null);
  const userDismissedCanvasRef = useRef(false);

  const activeSessionId = chatIdFromUrl;
  const activeSessionIdRef = useRef(activeSessionId);
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const {
    sessions,
    setSessions,
    sessionsLoaded,
    projects,
    manualLists,
    chatLoading,
    expandedCompactIds,
    handleExpandCompact,
    handleCollapseCompact,
    handleDeleteSession,
    handleClearAllHistory,
    handleCreateProject,
    handleRenameProject,
    handleDeleteProject,
    handleMoveSessionToProject,
    handleTogglePinSession,
    handleReorderSession,
    handleNewChatInProject,
  } = useSessionOrganization({
    user,
    activeSessionId,
    navigate,
    setActiveView,
    setCanvasOpen,
    setCanvasFullScreen,
    setActiveCanvasCode,
    setRevisionContextCode,
    setSettingsOpen,
  });

  const {
    isDraggingOver,
    handleOverlayDrop,
    handleOverlayDragLeave,
    handleOverlayDragOver,
  } = useGlobalFileDrop({ chatInputRef, setAttachments });

  usePendingTurnRecovery({
    chatIdFromUrl,
    navigate,
    activeSessionIdRef,
    abortControllerRef,
    streamingThinkingRef,
    thinkingStartedAtRef,
    setIsThinking,
    setSwarmVisible,
    setBuildPhase,
    setStreamingSessionId,
    setStreamingThinking,
    setIsThinkingOpen,
    setStreamingContent,
    setActiveCanvasCode,
    setCanvasOpen,
    setSessions,
    toAssistantMessage,
    isDuplicateAssistantMessage,
  });

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || null,
    [sessions, activeSessionId],
  );
  const isConversationChat = activeSession?.chatMode === "conversation";
  const isConversationDraft =
    Boolean(conversationDraft) &&
    (!activeSession || activeSession.messages.length === 0);
  const conversationMode = isConversationChat || isConversationDraft;
  const conversationPersonas = isConversationChat
    ? activeSession?.personas || []
    : conversationDraft || DEFAULT_CONVERSATION_PERSONAS;

  useEffect(() => {
    setActiveView(isSitesView ? "sites" : "chat");
  }, [isSitesView]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    )
      return;
    const mobileQuery = window.matchMedia("(max-width: 767px)");
    const syncSidebarWithViewport = (event) => {
      setIsMobileViewport(event.matches);
      if (event.matches) {
        setSidebarOpen(false);
      }
    };
    setIsMobileViewport(mobileQuery.matches);
    mobileQuery.addEventListener?.("change", syncSidebarWithViewport);
    return () =>
      mobileQuery.removeEventListener?.("change", syncSidebarWithViewport);
  }, []);

  useEffect(() => {
    const closeSidebarWithEscape = (event) => {
      if (event.key === "Escape" && isMobileViewport && sidebarOpen) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", closeSidebarWithEscape);
    return () => window.removeEventListener("keydown", closeSidebarWithEscape);
  }, [isMobileViewport, sidebarOpen]);

  useEffect(() => {
    if (activeView === "chat") {
      messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
    }
  }, [activeSession?.messages, isThinking, activeView]);

  const handleSelectSession = (id) => {
    navigate(`/chat/${id}`);
    setActiveView("chat");
    setConversationDraft(null);
    setCanvasOpen(false);
    setCanvasFullScreen(false);
    setActiveCanvasCode(null);
    setRevisionContextCode("");
    setRevisionContextSessionId(null);
    if (siteEditDraft) {
      setSiteEditDraft(null);
      setChatInput("");
    }
  };

  const handleNewChat = () => {
    navigate("/");
    setActiveView("chat");
    setConversationDraft(null);
    setCanvasOpen(false);
    setCanvasFullScreen(false);
    setRevisionContextCode("");
    setRevisionContextSessionId(null);
    setSiteEditDraft(null);
    setChatInput("");
    setActiveCanvasCode(null);
  };

  const handleNewConversation = () => {
    handleNewChat();
    setConversationDraft(
      DEFAULT_CONVERSATION_PERSONAS.map((persona) => ({ ...persona })),
    );
  };

  const handleEditSite = async (page) => {
    const siteContext = buildSiteRevisionContext(page);
    if (!siteContext) throw new Error(t("common.sites.editChatError"));

    const siteTitle =
      (typeof page.title === "string" && page.title.trim()) || page.slug;
    const title = t("common.sites.editChatTitle", { title: siteTitle });
    const editPrompt = t("common.sites.editChatPrompt");

    setSiteEditDraft({
      title,
      siteTitle,
      slug: page.slug,
      html: page.html,
    });
    setRevisionContextCode(siteContext);
    setRevisionContextSessionId(null);
    setActiveView("chat");
    setAttachments([]);
    setChatInput(editPrompt);
    setActiveCanvasCode(page.html);
    setCanvasOpen(true);
    setCanvasFullScreen(false);
    userDismissedCanvasRef.current = false;
    navigate("/");

    if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
    focusTimeoutRef.current = setTimeout(() => {
      if (!chatInputRef.current) return;
      chatInputRef.current.focus();
      chatInputRef.current.setSelectionRange(editPrompt.length, editPrompt.length);
    }, 80);

    return true;
  };

  const sendingSiteDraft = Boolean(siteEditDraft) && !activeSessionId;
  const {
    handleCloseCanvas,
    handleRunInCanvas,
    handleStopMessage,
    handleSendMessage,
    handleReviseCode,
    handleStarterSelect,
  } = useChatTurnExecution({
    activeSessionId,
    activeSession,
    activeSessionIdRef,
    sessions,
    setSessions,
    expandedCompactIds,
    isThinking,
    setIsThinking,
    setSwarmVisible,
    setBuildPhase,
    setStreamingSessionId,
    setStreamingContent,
    setStreamingThinking,
    streamingThinkingRef,
    thinkingStartedAtRef,
    setIsThinkingOpen,
    setAttachments,
    setChatInput,
    activeCanvasCode,
    setActiveCanvasCode,
    setCanvasOpen,
    setCanvasFullScreen,
    revisionContextCode,
    setRevisionContextCode,
    revisionContextSessionId,
    setRevisionContextSessionId,
    siteEditDraft,
    setSiteEditDraft,
    sendingSiteDraft,
    navigate,
    chatInputRef,
    abortControllerRef,
    focusTimeoutRef,
    userDismissedCanvasRef,
    toAssistantMessage,
  });

  const {
    handleSendMessage: handleConversationSendMessage,
    handleStopMessage: handleConversationStopMessage,
  } = useConversationTurnExecution({
    activeSessionId,
    activeSession,
    setSessions,
    isThinking,
    setIsThinking,
    setSwarmVisible,
    setBuildPhase,
    setStreamingSessionId,
    setStreamingContent,
    setStreamingThinking,
    streamingThinkingRef,
    setStreamingSpeaker,
    thinkingStartedAtRef,
    setIsThinkingOpen,
    setAttachments,
    setChatInput,
    navigate,
    abortControllerRef,
    newConversationPersonas: conversationPersonas,
  });
  const activeSendMessage = conversationMode
    ? handleConversationSendMessage
    : handleSendMessage;
  const activeStopMessage = conversationMode
    ? handleConversationStopMessage
    : handleStopMessage;

  const sidebarSessions = useMemo(() => {
    const filtered = sessions.filter((s) => {
      if (s.id === activeSessionId) return true;
      if (s._loaded === false) return true;
      return Array.isArray(s.messages) && s.messages.length > 0;
    });
    return [...filtered].sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
    );
  }, [sessions, activeSessionId]);

  const isNewChat =
    sessionsLoaded &&
    !chatLoading &&
    (!activeSession || activeSession.messages.length === 0);
  const isSiteEditChat = isNewChat && Boolean(siteEditDraft);

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
        onNewConversation={handleNewConversation}
        onOpenSites={() => {
          if (siteEditDraft) {
            setSiteEditDraft(null);
            setRevisionContextCode("");
            setRevisionContextSessionId(null);
            setChatInput("");
            setCanvasOpen(false);
            setCanvasFullScreen(false);
            setActiveCanvasCode("");
          }
          navigate("/sites");
          if (isMobileViewport) setSidebarOpen(false);
        }}
        onDeleteSession={handleDeleteSession}
        onShareSession={setShareChatId}
        onOpenSettings={() => setSettingsOpen(true)}
        activeView={activeView}
        theme={theme}
        onToggleTheme={() =>
          setTheme((prev) => (prev === "dark" ? "light" : "dark"))
        }
        onCloseSidebar={() => setSidebarOpen(false)}
        onOpenSidebar={() => setSidebarOpen(true)}
        projects={projects}
        onCreateProject={handleCreateProject}
        onRenameProject={handleRenameProject}
        onDeleteProject={handleDeleteProject}
        onMoveSessionToProject={handleMoveSessionToProject}
        onNewChatInProject={handleNewChatInProject}
        onTogglePinSession={handleTogglePinSession}
        onReorderSession={handleReorderSession}
        manualLists={manualLists}
      />

      {isMobileViewport && sidebarOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label={t("common.shell.closeSidebar")}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="main-content">
        {!sidebarOpen && isMobileViewport && (
          <button
            type="button"
            className="sidebar-toggle-btn"
            onClick={() => setSidebarOpen(true)}
            title={t("common.shell.openSidebar")}
            aria-label={t("common.shell.openSidebar")}
          >
            <PanelLeft size={16} strokeWidth={1.5} />
          </button>
        )}

        {isSitesView ? (
          <Sites
            onOpenChat={() => navigate("/")}
            onEditSite={handleEditSite}
          />
        ) : (
          <>
            <div
              className={`chat-pane ${canvasOpen ? "canvas-active" : ""}${
                isNewChat ? " new-chat" : ""
              }`}
            >
              <div className="messages-scroll">
                {isStreamActiveElsewhere({
                  isThinking,
                  streamingSessionId,
                  activeSessionId,
                }) && (
                  <div
                    className="stream-elsewhere-banner"
                    role="status"
                    aria-label={t("common.shell.streamingElsewhere")}
                  >
                    <span>
                      {t("common.shell.respondingIn", {
                        title:
                          sessions.find((s) => s.id === streamingSessionId)
                            ?.title || t("common.shell.anotherChat"),
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate(`/chat/${streamingSessionId}`)}
                    >
                      {t("common.shell.view")}
                    </button>
                  </div>
                )}
                {!sessionsLoaded ? (
                  <div className="welcome-container">
                    <h1 className="welcome-title">COREZ</h1>
                  </div>
                ) : chatLoading ? (
                  <div className="welcome-container">
                    <h1 className="welcome-title">COREZ</h1>
                  </div>
                ) : !activeSession || activeSession.messages.length === 0 ? (
                  <div className="new-chat-hero">
                    <h1 className="new-chat-hero-title">
                      {isSiteEditChat
                        ? t("common.sites.editChatHeading")
                        : isConversationDraft
                          ? "Are you ready to have Conversation?"
                          : t("common.newChat.title")}
                    </h1>
                    {isSiteEditChat && (
                      <p className="new-chat-hero-hint">
                        {t("common.sites.editChatHint")}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="messages-inner">
                    {activeSession?.messages.map((msg, idx) => {
                      if (msg?._compactMeta?.isCompactSummary) {
                        const isExpanded =
                          expandedCompactIds.has(activeSessionId);
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
                    {isStreamVisibleForSession({
                      isThinking,
                      streamingSessionId,
                      activeSessionId,
                    }) && (
                      <div
                        className={`message-wrapper ai${
                          streamingSpeaker ? " conversation" : ""
                        }`}
                      >
                        <div className="message-body">
                          {streamingSpeaker ? (
                            <div className="message-speaker">
                              <span className="message-speaker-avatar" aria-hidden="true">
                                {String(streamingSpeaker.name || "AI")
                                  .split(/\s+/)
                                  .map((part) => part[0])
                                  .join("")
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </span>
                              <span className="message-speaker-name">
                                {streamingSpeaker.name}
                              </span>
                            </div>
                          ) : null}
                          {(buildPhaseLabel(buildPhase) || swarmVisible) && (
                            <span
                              className="sr-only"
                              role="status"
                              aria-live="polite"
                            >
                              {buildPhaseLabel(buildPhase) ||
                                t("common.phase.swarmPlanning")}
                            </span>
                          )}
                          <ThinkingPanel
                            text={streamingThinking}
                            live
                            expanded={isThinkingOpen}
                            onToggle={() => setIsThinkingOpen((prev) => !prev)}
                            bodyId="corez-thinking-body"
                            placeholder={t("common.thinking.working")}
                          />
                          {streamingContent && (
                            <div
                              className="message-content streaming-text"
                              role="status"
                              aria-label={t("common.shell.responding")}
                            >
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
                onSendMessage={activeSendMessage}
                onStopMessage={activeStopMessage}
                isStreaming={isThinking}
                attachments={attachments}
                setAttachments={setAttachments}
                placeholder={conversationMode ? "" : undefined}
                commandSuggestions={!conversationMode}
                variant={isNewChat ? "hero" : "composer"}
                footer={
                  isConversationDraft ? (
                    <div className="conversation-persona-footer">
                      <button
                        type="button"
                        className="conversation-edit-personas"
                        onClick={() => setConversationSetupOpen(true)}
                      >
                        Edit personas · @
                        {conversationPersonas
                          .map((persona) => persona.handle)
                          .join(" · @")}
                      </button>
                    </div>
                  ) : isNewChat && !isSiteEditChat && !conversationMode ? (
                    <NewChatStarters
                      hidden={
                        Boolean(chatInput.trim()) || attachments.length > 0
                      }
                      onSelect={handleStarterSelect}
                    />
                  ) : null
                }
              />
            </div>

            {canvasOpen && (
              <CanvasPreview
                code={activeCanvasCode}
                title={
                  activeSession?.title ||
                  t("common.shell.untitledApplication")
                }
                onClose={handleCloseCanvas}
                isFullScreen={canvasFullScreen}
                onToggleFullScreen={() =>
                  setCanvasFullScreen((prev) => !prev)
                }
                sessionId={activeSession?.id || null}
                isStreaming={isThinking}
              />
            )}
          </>
        )}
      </main>

      {conversationSetupOpen && (
        <ConversationSetupModal
          personas={conversationPersonas}
          onClose={() => setConversationSetupOpen(false)}
          onSave={(next) => {
            setConversationDraft(next);
            setConversationSetupOpen(false);
          }}
        />
      )}

      {shareChatId && (
        <ChatShareModal
          chatId={shareChatId}
          onClose={() => setShareChatId(null)}
        />
      )}

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onClearAllHistory={handleClearAllHistory}
        theme={theme}
        onToggleTheme={() =>
          setTheme((prev) => (prev === "dark" ? "light" : "dark"))
        }
      />
    </div>
  );
}

const PUBLIC_ROUTES =
  /^\/(?:login|pricing|payment\/success|privacy|terms|cookies|refunds|privacy-policy|terms-and-conditions|cookie-policy|refund-policy|share\/chat\/[^/]+)\/?$/;

function legalRoutes() {
  return [
    <Route key="privacy" path="/privacy" element={<Legal docId="privacy" />} />,
    <Route key="terms" path="/terms" element={<Legal docId="terms" />} />,
    <Route key="cookies" path="/cookies" element={<Legal docId="cookies" />} />,
    <Route key="refunds" path="/refunds" element={<Legal docId="refunds" />} />,
    <Route
      key="privacy-alias"
      path="/privacy-policy"
      element={<Navigate to="/privacy" replace />}
    />,
    <Route
      key="terms-alias"
      path="/terms-and-conditions"
      element={<Navigate to="/terms" replace />}
    />,
    <Route
      key="cookies-alias"
      path="/cookie-policy"
      element={<Navigate to="/cookies" replace />}
    />,
    <Route
      key="refunds-alias"
      path="/refund-policy"
      element={<Navigate to="/refunds" replace />}
    />,
  ];
}

function RouteAnalytics() {
  const location = useLocation();
  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);
  return null;
}

function AppInner() {
  const { user, loading, sessionCheckFailed, refresh } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("corez_theme") || "dark";
    } catch {
      return "dark";
    }
  });

  useEffect(() => startAnalytics(), []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("corez_theme", theme);
    } catch {
      /* Ignore storage errors */
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta)
      meta.setAttribute("content", theme === "light" ? "#f7f7f7" : "#000000");
  }, [theme]);

  useEffect(() => {
    const onStorage = (e) => {
      if (
        e.key === "corez_theme" &&
        (e.newValue === "light" || e.newValue === "dark")
      ) {
        setTheme(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const prefetchChatId = useChatIdFromUrl();
  useEffect(() => {
    if (PUBLIC_ROUTES.test(location.pathname)) return;
    prefetchChatList();
    prefetchChat(prefetchChatId);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) dropChatPrefetches();
  }, [loading, user]);

  useEffect(() => {
    applyRouteMeta(location.pathname, { signedIn: Boolean(user) });
  }, [location.pathname, user]);

  const onPublicRoute = PUBLIC_ROUTES.test(location.pathname);
  if (!onPublicRoute && loading) {
    return (
      <div className="auth-loading" role="status" aria-live="polite">
        <Loader2
          className="spin-icon"
          size={22}
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <span>{t("common.status.loadingCorez")}</span>
      </div>
    );
  }
  if (!onPublicRoute && sessionCheckFailed) {
    return (
      <div className="auth-loading" role="alert">
        <span className="auth-loading-title">
          {t("common.status.sessionFailedTitle")}
        </span>
        <span className="auth-loading-body">
          {t("common.status.sessionFailedBody")}
        </span>
        <button
          type="button"
          className="auth-loading-retry"
          onClick={() => refresh()}
        >
          {t("common.action.retry")}
        </button>
      </div>
    );
  }
  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/payment/success" element={<PaymentSuccess />} />
        <Route path="/share/chat/:token" element={<SharedChat />} />
        {legalRoutes()}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route path="/" element={<MainApp theme={theme} setTheme={setTheme} />} />
      <Route
        path="/chat/:chatId"
        element={<MainApp theme={theme} setTheme={setTheme} />}
      />
      <Route
        path="/sites"
        element={<MainApp theme={theme} setTheme={setTheme} />}
      />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/payment/success" element={<PaymentSuccess />} />
      <Route path="/share/chat/:token" element={<SharedChat />} />
      {legalRoutes()}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppInner />
        <RouteAnalytics />
        <CookieConsent />
      </AuthProvider>
    </BrowserRouter>
  );
}
