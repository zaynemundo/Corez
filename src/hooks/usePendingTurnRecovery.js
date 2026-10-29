import { useEffect, useRef } from "react";
import { generateAIResponse, extractCodeFromMessage } from "../services/aiService";
import * as chatService from "../services/chatService";

export function usePendingTurnRecovery({
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
}) {
  const resumeStartedRef = useRef(false);

  // Auto-resume background AI generation across accidental page refreshes
  useEffect(() => {
    if (resumeStartedRef.current) return;
    resumeStartedRef.current = true;
    try {
      const savedPending = localStorage.getItem("corez_pending_request");
      if (savedPending) {
        const pendingData = JSON.parse(savedPending);
        if (
          pendingData &&
          pendingData.sessionId &&
          Date.now() - (pendingData.timestamp || 0) < 300000
        ) {
          // Find session — may need to fetch from server if not yet loaded
          const targetSessionId = pendingData.sessionId;
          // Ensure we navigate to that chat if not already there
          if (chatIdFromUrl !== targetSessionId) {
            navigate(`/chat/${targetSessionId}`, { replace: true });
          }
          setIsThinking(true);
          setSwarmVisible(false);
          setBuildPhase(null);
          setStreamingSessionId(targetSessionId);
          setStreamingThinking("");
          streamingThinkingRef.current = "";
          thinkingStartedAtRef.current = 0;
          setIsThinkingOpen(true);
          const controller = new AbortController();
          abortControllerRef.current = controller;

          generateAIResponse(
            pendingData.apiPrompt,
            pendingData.messages,
            controller.signal,
            (delta) => {
              setStreamingContent((prev) => (prev || "") + delta);
              // Collapse only with real reasoning to read (see the main
              // send path for why an empty panel must not auto-hide).
              if (streamingThinkingRef.current) {
                setIsThinkingOpen((prev) => (prev ? false : prev));
              }
            },
            (phaseEvent) => {
              setSwarmVisible(phaseEvent.phase === "swarm-planning");
              setBuildPhase(phaseEvent.phase || null);
            },
            null,
            {},
            (text) => {
              if (text && !thinkingStartedAtRef.current) {
                thinkingStartedAtRef.current = Date.now();
              }
              streamingThinkingRef.current += text;
              setStreamingThinking(streamingThinkingRef.current);
            },
          )
            .then((response) => {
              if (!response) return;
              // Real thinking only: when the gateway returns no reasoning the
              // finished message carries no panel at all — never a placeholder.
              const thinkingSeconds = thinkingStartedAtRef.current
                ? Math.max(
                    1,
                    Math.round(
                      (Date.now() - thinkingStartedAtRef.current) / 1000,
                    ),
                  )
                : 0;
              const aiMsg = toAssistantMessage(
                response,
                streamingThinkingRef.current,
                thinkingSeconds,
              );
              const extractedCode = extractCodeFromMessage(aiMsg.content);
              if (
                extractedCode &&
                activeSessionIdRef.current === targetSessionId
              ) {
                setActiveCanvasCode(extractedCode);
                setCanvasOpen(true);
              }
              setSessions((prev) =>
                prev.map((s) => {
                  if (s.id === targetSessionId) {
                    const last = s.messages[s.messages.length - 1];
                    if (isDuplicateAssistantMessage(last, aiMsg)) return s;
                    return { ...s, messages: [...s.messages, aiMsg] };
                  }
                  return s;
                }),
              );
              // Persist assistant message server-side
              chatService
                .appendMessage(targetSessionId, {
                  role: "assistant",
                  content: aiMsg.content,
                })
                .catch(() => {});
            })
            .catch((err) => {
              if (err?.name !== "AbortError") {
                console.warn("Background AI response recovery error:", err);
              }
            })
            .finally(() => {
              localStorage.removeItem("corez_pending_request");
              setIsThinking(false);
              setSwarmVisible(false);
              setBuildPhase(null);
              setStreamingContent(null);
              setStreamingSessionId(null);
              setStreamingThinking("");
              streamingThinkingRef.current = "";
              setIsThinkingOpen(true);
              if (abortControllerRef.current === controller)
                abortControllerRef.current = null;
            });
        } else {
          localStorage.removeItem("corez_pending_request");
        }
      }
    } catch (err) {
      console.warn("Failed to parse corez_pending_request", err);
      localStorage.removeItem("corez_pending_request");
    }
  }, [
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
  ]);
}
