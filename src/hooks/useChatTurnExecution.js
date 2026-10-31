import { formatBytes } from "../utils/fileAttachmentUtils";
import {
  generateAIResponse,
  extractCodeFromMessage,
  generateSessionTitle,
  generateAISessionTitle,
  isRevisionContextPrompt,
} from "../services/aiService";
import { storeAppInR2 } from "../services/appStorageService";
import * as chatService from "../services/chatService";
import {
  persistUserTurn,
  persistAssistantTurnAfter,
} from "../services/turnPersistence";
import { compactChatMessages, shouldCompact } from "../services/smartCompact";

export function buildAttachmentPrompt(attachments) {
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

export function useChatTurnExecution({
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
  locationContext = "",
}) {
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

  const handleSendMessage = async (promptText, attachmentsArg = []) => {
    if (isThinking) return;
    setAttachments([]);

    const initialActiveSessionId = activeSessionId;
    const siteDraft = siteEditDraft;
    const isSendingSiteDraft =
      typeof sendingSiteDraft === "boolean"
        ? sendingSiteDraft
        : Boolean(siteDraft) && !activeSessionId;

    let targetSessionId = activeSessionId;
    let draftMessages = activeSession?.messages || [];

    if (!targetSessionId) {
      const provisionalTitle = isSendingSiteDraft
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
          chatMode: created.chatMode || "single",
          personas: created.personas || [],
          lastUserAt: created.lastUserAt || null,
          titleUpdatedAt: created.titleUpdatedAt || null,
          active: Boolean(created.active),
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
                ...(m.turnId ? { turnId: m.turnId } : {}),
                ...(m.speakerId ? { speakerId: m.speakerId } : {}),
                ...(m.speakerName ? { speakerName: m.speakerName } : {}),
                ...(m.modelId ? { modelId: m.modelId } : {}),
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

    if (isSendingSiteDraft) setSiteEditDraft(null);

    const attachmentPrompt = buildAttachmentPrompt(attachmentsArg);
    const displayPrompt = promptText;
    let apiPrompt = attachmentPrompt
      ? `${promptText}${attachmentPrompt}`.trim()
      : promptText;

    const revisionContextApplies =
      Boolean(revisionContextCode) &&
      (revisionContextSessionId
        ? revisionContextSessionId === targetSessionId
        : !initialActiveSessionId || isSendingSiteDraft);
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

    const locationApplies =
      Boolean(locationContext) &&
      !isRevision &&
      !isCreationIntent &&
      !/^\s*@(image|website|game)\b/i.test(promptText);
    const promptForModel = locationApplies
      ? `${apiPrompt}\n\n[Location context: ${locationContext}]`
      : apiPrompt;

    try {
      setStreamingContent("");
      setStreamingThinking("");
      streamingThinkingRef.current = "";
      setIsThinkingOpen(true);
      const response = await generateAIResponse(
        promptForModel,
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

  return {
    handleCloseCanvas,
    handleRunInCanvas,
    handleStopMessage,
    handleSendMessage,
    handleReviseCode,
    handleStarterSelect,
  };
}
