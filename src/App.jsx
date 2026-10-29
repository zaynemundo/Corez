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
import { formatBytes } from "./utils/fileAttachmentUtils";
import {
  generateAIResponse,
  extractCodeFromMessage,
  generateSessionTitle,
  generateAISessionTitle,
  isRevisionContextPrompt,
} from "./services/aiService";
import { storeAppInR2 } from "./services/appStorageService";
import * as chatService from "./services/chatService";
import {
  dropChatPrefetches,
  prefetchChat,
  prefetchChatList,
} from "./services/chatPrefetch";
import { buildPhaseLabel } from "./utils/buildPhaseLabel";
import { applyRouteMeta } from "./utils/seo";
import {
  persistUserTurn,
  persistAssistantTurnAfter,
} from "./services/turnPersistence";
import { buildSiteRevisionContext } from "./utils/siteRevisionContext.js";
import CompactedBanner from "./components/CompactedBanner";
import { useI18n } from "./i18n/index.jsx";
import { compactChatMessages, shouldCompact } from "./services/smartCompact";
import {
  isStreamVisibleForSession,
  isStreamActiveElsewhere,
} from "./utils/streamSession";
import { useSessionOrganization } from "./hooks/useSessionOrganization.js";
import { useGlobalFileDrop } from "./hooks/useGlobalFileDrop.js";
import { usePendingTurnRecovery } from "./hooks/usePendingTurnRecovery.js";

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

function buildAttachmentPrompt(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return "";
  const sections = attachments.map((attachment) => {
    const meta = `- ${attachment.name} (${attachment.type || "unknown type"}, ${formatBytes(attachment.size)})`;
    if (typeof attachment.content === "string" && attachment.content.trim()) {
      return `${meta}\n  --- file content ---\n${attachment.content}\n  --- end of file ---`;
    }
    return meta;
  });
  return `\n\n[Attached files]\n${sections.join("\n")}\n`;
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
    setCanvasOpen(false);
    setCanvasFullScreen(false);
    setRevisionContextCode("");
    setRevisionContextSessionId(null);
    setSiteEditDraft(null);
    setChatInput("");
    setActiveCanvasCode(null);
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
        title: activeSession?.title || "Canvas Application",
        code,
      })
        .then((result) => {
          if (result && result.success === false) {
            console.warn(
              "R2 background store failed; app remains in local session state.",
            );
          }
        })
        .catch((err) => console.warn("R2 background store notification:", err));
    }
  };

  const handleStopMessage = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    localStorage.removeItem("corez_pending_request");
    setIsThinking(false);
    setStreamingSessionId(null);
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

  const handleSendMessage = async (promptText, attachmentsArg = []) => {
    if (isThinking) return;
    setAttachments([]);

    const initialActiveSessionId = activeSessionId;
    const siteDraft = siteEditDraft;
    const sendingSiteDraft = Boolean(siteDraft) && !activeSessionId;

    let targetSessionId = activeSessionId;
    let draftMessages = activeSession?.messages || [];

    if (!targetSessionId) {
      const provisionalTitle = sendingSiteDraft
        ? siteDraft.title
        : generateSessionTitle(
            promptText || attachmentsArg[0]?.name || "New Conversation",
          );
      try {
        const created = await chatService.createChat({
          title: provisionalTitle,
        });
        targetSessionId = created.id;
        const newSession = {
          id: targetSessionId,
          title: created.title,
          messages: [],
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
          projectId: created.projectId || null,
          pinnedAt: null,
          sortOrder: created.sortOrder ?? null,
          _loaded: true,
        };
        setSessions((prev) => [newSession, ...prev]);
        navigate(`/chat/${targetSessionId}`, { replace: false });
        draftMessages = [];
      } catch (e) {
        console.warn(
          "Failed to create chat on server, falling back to local id",
          e,
        );
        targetSessionId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const fallbackSession = {
          id: targetSessionId,
          title: provisionalTitle,
          messages: [],
          projectId: null,
          _loaded: true,
        };
        setSessions((prev) => [fallbackSession, ...prev]);
        navigate(`/chat/${targetSessionId}`, { replace: false });
        draftMessages = [];
      }
    } else {
      const existing = sessions.find((s) => s.id === targetSessionId);
      if (existing && !existing._loaded) {
        try {
          const isExpanded = expandedCompactIds.has(targetSessionId);
          const data = isExpanded
            ? await chatService.getChat(targetSessionId, { compact: false })
            : await chatService.getChat(targetSessionId, {
                compact: true,
                keep: 30,
              });
          let msgs = Array.isArray(data.messages)
            ? data.messages.map((m) => ({
                role: m.role,
                content: m.content,
                attachments: m.attachments || undefined,
                ...(m._compactMeta ? { _compactMeta: m._compactMeta } : {}),
              }))
            : [];
          let compactMeta = data.compactMeta || null;
          const bannerFromServer = msgs.find(
            (m) => m._compactMeta?.isCompactSummary,
          );
          if (bannerFromServer && !compactMeta)
            compactMeta = bannerFromServer._compactMeta;
          let fullMessages = null;
          if (!compactMeta && !isExpanded && shouldCompact(msgs)) {
            const result = compactChatMessages(msgs);
            if (result.compacted) {
              msgs = result.displayMessages;
              compactMeta = result.meta;
              fullMessages = result.originalMessages;
            }
          }
          setSessions((prev) =>
            prev.map((s) =>
              s.id === targetSessionId
                ? {
                    ...s,
                    title: data.title,
                    messages: msgs,
                    _loaded: true,
                    _compactMeta: compactMeta,
                    _fullMessages: fullMessages,
                  }
                : s,
            ),
          );
          draftMessages = msgs;
        } catch {}
      } else if (existing && existing._compactMeta) {
        draftMessages = existing.messages;
      }
    }

    if (sendingSiteDraft) setSiteEditDraft(null);

    const attachmentPrompt = buildAttachmentPrompt(attachmentsArg);
    const displayPrompt = promptText;
    let apiPrompt = attachmentPrompt
      ? `${promptText}${attachmentPrompt}`.trim()
      : promptText;

    const revisionContextApplies =
      Boolean(revisionContextCode) &&
      (revisionContextSessionId
        ? revisionContextSessionId === targetSessionId
        : !initialActiveSessionId || sendingSiteDraft);
    if (revisionContextApplies) {
      apiPrompt = `${apiPrompt}\n\n[Existing code to revise - apply the requested change directly and output the complete updated file]:\n\`\`\`html\n${revisionContextCode}\n\`\`\``;
      setRevisionContextCode("");
      setRevisionContextSessionId(null);
    }

    const displayAttachments = attachmentsArg.map(
      ({ id, name, type, size, thumb, assetUrl, assetKey, content }) => ({
        id,
        name,
        type,
        size,
        thumb,
        assetUrl,
        assetKey,
        content,
      }),
    );
    const apiAttachments = attachmentsArg.map(
      ({ name, type, size, thumb, content, assetUrl, assetKey }) => ({
        name,
        type,
        size,
        thumb,
        content,
        assetUrl,
        assetKey,
      }),
    );

    const displayMsg = {
      role: "user",
      content: displayPrompt,
      attachments: displayAttachments,
    };
    const apiMsg = {
      role: "user",
      content: apiPrompt,
      attachments: apiAttachments,
    };

    const updatedApiMessages = [...draftMessages, apiMsg];
    const isFreshSession = draftMessages.length === 0;

    const nowTs = Date.now();
    setSessions((prev) => {
      const mapped = prev.map((s) => {
        if (s.id === targetSessionId) {
          const updatedTitle =
            s.messages.length === 0
              ? generateSessionTitle(
                  promptText ||
                    displayAttachments[0]?.name ||
                    "New Conversation",
                )
              : s.title;
          if (s.messages.length === 0 && updatedTitle !== s.title) {
            chatService
              .patchChatTitle(targetSessionId, updatedTitle)
              .catch(() => {});
          }
          const nextMessages = [...s.messages, displayMsg];
          const nextFull = Array.isArray(s._fullMessages)
            ? [...s._fullMessages, displayMsg]
            : s._fullMessages;
          let nextCompactMeta = s._compactMeta || null;
          let finalMessages = nextMessages;
          let finalFull = nextFull;
          if (
            !expandedCompactIds.has(targetSessionId) &&
            shouldCompact(nextFull || nextMessages)
          ) {
            const sourceForCompact = nextFull || nextMessages;
            const result = compactChatMessages(sourceForCompact);
            if (result.compacted) {
              finalMessages = result.displayMessages;
              nextCompactMeta = result.meta;
              finalFull = result.originalMessages;
            }
          }
          return {
            ...s,
            title: updatedTitle,
            messages: finalMessages,
            _loaded: true,
            updatedAt: nowTs,
            _compactMeta: nextCompactMeta,
            _fullMessages: finalFull,
          };
        }
        return s;
      });
      const target = mapped.find((s) => s.id === targetSessionId);
      if (!target) return mapped;
      return [target, ...mapped.filter((s) => s.id !== targetSessionId)];
    });

    const userMessagePersisted = persistUserTurn(
      () =>
        chatService.appendMessage(targetSessionId, {
          role: "user",
          content: displayPrompt,
          attachments: displayAttachments,
        }),
      (e) => console.warn("Failed to persist user message", e),
    );

    setIsThinking(true);
    setSwarmVisible(false);
    setBuildPhase(null);
    setStreamingSessionId(targetSessionId);

    const pendingData = {
      sessionId: targetSessionId,
      apiPrompt,
      displayPrompt,
      messages: updatedApiMessages,
      timestamp: Date.now(),
    };
    try {
      const serializedPending = JSON.stringify(pendingData);
      if (serializedPending.length <= 2 * 1024 * 1024) {
        localStorage.setItem("corez_pending_request", serializedPending);
      } else {
        const slimMessages = updatedApiMessages.map((message) => ({
          ...message,
          attachments: (message.attachments || []).map(
            ({ content: _content, thumb: _thumb, ...rest }) => rest,
          ),
        }));
        localStorage.setItem(
          "corez_pending_request",
          JSON.stringify({
            ...pendingData,
            messages: slimMessages,
          }),
        );
      }
    } catch {
      /* Ignore storage errors */
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const isRevision =
      Boolean(revisionContextCode) ||
      isRevisionContextPrompt(apiPrompt) ||
      /^\s*(?:@\w+\s+)?(?:revise|update|change|fix|modify|refactor)\b/i.test(
        promptText,
      );

    const isCreationIntent =
      isRevision ||
      /^\s*@(game|website|app)\b/i.test(promptText) ||
      /\b(build|create|make|generate|design|develop|code|revise|update|fix|modify|refactor)\b.{0,80}\b(game|app|website|tool|dashboard|calculator|canvas|platformer|pong|shooter|snake|rpg|3d|code)\b/i.test(
        promptText,
      );

    userDismissedCanvasRef.current = false;

    if (isCreationIntent) {
      if (!isRevision) {
        setActiveCanvasCode("");
      }
      setCanvasOpen(true);
    }

    try {
      setStreamingContent("");
      setStreamingThinking("");
      streamingThinkingRef.current = "";
      setIsThinkingOpen(true);
      const response = await generateAIResponse(
        apiPrompt,
        updatedApiMessages,
        controller.signal,
        (delta) => {
          setStreamingContent((prev) => (prev || "") + delta);
        },
        (phaseEvent) => {
          setSwarmVisible(phaseEvent.phase === "swarm-planning");
          setBuildPhase(phaseEvent.phase || null);
        },
        () => {
          setStreamingContent("");
          setStreamingThinking("");
          streamingThinkingRef.current = "";
          thinkingStartedAtRef.current = 0;
          setIsThinkingOpen(true);
        },
        {},
        (text) => {
          if (text && !thinkingStartedAtRef.current) {
            thinkingStartedAtRef.current = Date.now();
          }
          streamingThinkingRef.current += text;
          setStreamingThinking(streamingThinkingRef.current);
        },
      );
      if (response) {
        const thinkingSeconds = thinkingStartedAtRef.current
          ? Math.max(
              1,
              Math.round((Date.now() - thinkingStartedAtRef.current) / 1000),
            )
          : 0;
        const aiMsg = toAssistantMessage(
          response,
          streamingThinkingRef.current,
          thinkingSeconds,
        );
        const extractedCode = extractCodeFromMessage(aiMsg.content);
        const isResearchReport = Boolean(
          extractedCode &&
            (/^\s*[@/]research\b/i.test(promptText) ||
              (extractedCode.includes("var REPORT_PARAGRAPHS") &&
                extractedCode.includes("COREZ Research Report"))),
        );
        const shouldAutoOpenCanvas = Boolean(
          extractedCode &&
            (isCreationIntent || isRevision || isResearchReport) &&
            !userDismissedCanvasRef.current &&
            activeSessionIdRef.current === targetSessionId,
        );
        if (shouldAutoOpenCanvas) {
          setActiveCanvasCode(extractedCode);
          setCanvasOpen(true);
        }

        const nowTs2 = Date.now();
        setSessions((prev) => {
          const mapped = prev.map((s) => {
            if (s.id === targetSessionId) {
              const nextMsgs = [...s.messages, aiMsg];
              const nextFull = Array.isArray(s._fullMessages)
                ? [...s._fullMessages, aiMsg]
                : s._fullMessages;
              let finalMsgs = nextMsgs;
              let finalFull = nextFull;
              let finalMeta = s._compactMeta || null;
              if (
                !expandedCompactIds.has(targetSessionId) &&
                shouldCompact(nextFull || nextMsgs)
              ) {
                const src = nextFull || nextMsgs;
                const res = compactChatMessages(src);
                if (res.compacted) {
                  finalMsgs = res.displayMessages;
                  finalMeta = res.meta;
                  finalFull = res.originalMessages;
                }
              }
              return {
                ...s,
                messages: finalMsgs,
                _fullMessages: finalFull,
                _compactMeta: finalMeta,
                updatedAt: nowTs2,
              };
            }
            return s;
          });
          const target = mapped.find((s) => s.id === targetSessionId);
          if (!target) return mapped;
          return [target, ...mapped.filter((s) => s.id !== targetSessionId)];
        });
        persistAssistantTurnAfter(userMessagePersisted, () =>
          chatService.appendMessage(targetSessionId, {
            role: "assistant",
            content: aiMsg.content,
          }),
        );
      }
    } catch (err) {
      if (err?.name !== "AbortError") {
        console.error("AI generation error:", err);
      }
    } finally {
      if (abortControllerRef.current === controller) {
        localStorage.removeItem("corez_pending_request");
        setIsThinking(false);
        setSwarmVisible(false);
        setBuildPhase(null);
        setStreamingContent(null);
        setStreamingSessionId(null);
        setStreamingThinking("");
        streamingThinkingRef.current = "";
        setIsThinkingOpen(true);
        abortControllerRef.current = null;
      }
    }

    if (isFreshSession && (promptText || displayAttachments[0]?.name)) {
      generateAISessionTitle(promptText || displayAttachments[0]?.name).then(
        (aiTitle) => {
          if (!aiTitle) return;
          setSessions((prev) =>
            prev.map((s) =>
              s.id === targetSessionId ? { ...s, title: aiTitle } : s,
            ),
          );
          chatService.patchChatTitle(targetSessionId, aiTitle).catch(() => {});
        },
      );
    }
  };

  const handleReviseCode = (code) => {
    setRevisionContextCode(code);
    setRevisionContextSessionId(activeSessionId || null);
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
          chatInputRef.current.setSelectionRange(
            revisionPrompt.length,
            revisionPrompt.length,
          );
        }
      }, 50);
    }
  };

  const handleStarterSelect = (text) => {
    const insertion = String(text || "");
    setChatInput(insertion);
    if (!chatInputRef.current) return;
    if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
    focusTimeoutRef.current = setTimeout(() => {
      if (!chatInputRef.current) return;
      chatInputRef.current.focus();
      chatInputRef.current.setSelectionRange(
        insertion.length,
        insertion.length,
      );
    }, 50);
  };

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
                      <div className="message-wrapper ai">
                        <div className="message-body">
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
                onSendMessage={handleSendMessage}
                onStopMessage={handleStopMessage}
                isStreaming={isThinking}
                attachments={attachments}
                setAttachments={setAttachments}
                variant={isNewChat ? "hero" : "composer"}
                footer={
                  isNewChat && !isSiteEditChat ? (
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
