import { generateHostedAIResponse, generateSessionTitle } from "../services/aiService";
import * as chatService from "../services/chatService";

const MODEL_ID = "deepseek-v4.1-flash";
const GENERAL_INTENT = Object.freeze({
  type: "general",
  primaryIntent: "general_question",
  summary: "Casual group conversation.",
  confidence: 1,
});

function cleanReply(raw, name) {
  let text = String(raw || "").trim();
  const prefix = new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*`, "i");
  text = text.replace(prefix, "").trim();
  return text;
}

function makeId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `turn_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function handleFor(persona) {
  return String(persona?.handle || persona?.name || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function conversationSpeakersForPrompt(personas, prompt) {
  const mentionedHandles = new Set(
    [...String(prompt || "").matchAll(/@([a-z0-9_]+)/gi)].map((match) =>
      match[1].toLowerCase(),
    ),
  );
  const mentioned = personas.filter((persona) =>
    mentionedHandles.has(handleFor(persona)),
  );
  return mentioned.length ? mentioned : personas;
}

export function useConversationTurnExecution({
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
  newConversationPersonas,
}) {
  const handleStopMessage = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    localStorage.removeItem("corez_pending_request");
    setIsThinking(false);
    setStreamingSessionId(null);
    setStreamingContent(null);
    setStreamingThinking("");
    setStreamingSpeaker(null);
    streamingThinkingRef.current = "";
    thinkingStartedAtRef.current = 0;
  };

  const handleSendMessage = async (promptText, attachmentsArg = []) => {
    if (isThinking) return;
    const prompt = String(promptText || "").trim();
    if (!prompt) return;

    setAttachments([]);
    setChatInput("");
    setSwarmVisible(false);
    setBuildPhase(null);

    const sourcePersonas =
      Array.isArray(activeSession?.personas) && activeSession.personas.length === 2
        ? activeSession.personas
        : Array.isArray(newConversationPersonas) && newConversationPersonas.length === 2
          ? newConversationPersonas
          : [
              { id: "p1", name: "John", handle: "john", instructions: "" },
              { id: "p2", name: "Scarlett", handle: "scarlett", instructions: "" },
            ];
    const personas = sourcePersonas.map((persona, index) => ({
      id: persona.id || `p${index + 1}`,
      name: String(persona.name || (index === 0 ? "John" : "Scarlett")).trim(),
      handle: handleFor(persona),
      instructions: String(persona.instructions || "").slice(0, 1200),
    }));

    let targetSessionId = activeSessionId;
    let currentMessages = Array.isArray(activeSession?.messages)
      ? [...activeSession.messages]
      : [];
    let targetSession = activeSession;

    // Create the conversation on its first user message, preserving the draft
    // persona edits from the New Conversation hero.
    if (!targetSessionId) {
      try {
        const created = await chatService.createChat({
          title: generateSessionTitle(prompt),
          chatMode: "conversation",
          personas,
        });
        targetSessionId = created.id;
        currentMessages = [];
        targetSession = {
          id: created.id,
          title: created.title,
          messages: [],
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
          chatMode: "conversation",
          personas,
          lastUserAt: null,
          titleUpdatedAt: created.titleUpdatedAt || Date.now(),
          active: true,
          _loaded: true,
        };
        setSessions((prev) => [targetSession, ...prev]);
        navigate(`/chat/${targetSessionId}`, { replace: false });
      } catch (error) {
        console.error("Failed to create conversation:", error);
        return;
      }
    }

    // A conversation selected from the sidebar may still be metadata-only.
    // Load its transcript before appending the new user turn, otherwise the
    // first reply would lose all prior context.
    if (targetSessionId && targetSession && !targetSession._loaded) {
      try {
        const data = await chatService.getChat(targetSessionId, {
          compact: true,
          keep: 30,
        });
        currentMessages = Array.isArray(data.messages)
          ? data.messages.map((message) => ({
              role: message.role,
              content: message.content,
              attachments: message.attachments || undefined,
              ...(message.turnId ? { turnId: message.turnId } : {}),
              ...(message.speakerId ? { speakerId: message.speakerId } : {}),
              ...(message.speakerName ? { speakerName: message.speakerName } : {}),
              ...(message.modelId ? { modelId: message.modelId } : {}),
            }))
          : [];
        targetSession = { ...targetSession, ...data, _loaded: true };
        setSessions((prev) =>
          prev.map((session) =>
            session.id === targetSessionId ? targetSession : session,
          ),
        );
      } catch {
        // Fall back to the transcript already in memory.
      }
    }
    const turnId = makeId();
    const userMessage = {
      role: "user",
      content: prompt,
      attachments: attachmentsArg,
      speakerId: "user",
      speakerName: "You",
      turnId,
    };
    currentMessages = [...currentMessages, userMessage];
    const now = Date.now();
    setSessions((prev) =>
      prev.map((session) =>
        session.id === targetSessionId
          ? {
              ...session,
              messages: [...session.messages, userMessage],
              updatedAt: now,
              lastUserAt: now,
              active: true,
            }
          : session,
      ),
    );
    chatService
      .appendMessage(targetSessionId, {
        role: "user",
        content: prompt,
        attachments: attachmentsArg.length ? attachmentsArg : undefined,
        turnId,
        speakerId: "user",
        speakerName: "You",
      })
      .catch(() => {});

    // A recognised mention routes that persona; no mention (or an unknown one)
    // lets both answer once, in their fixed order.
    const speakers = conversationSpeakersForPrompt(personas, prompt);

    const history = currentMessages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => ({
        role: message.role,
        content:
          message.role === "assistant" && message.speakerName
            ? `${message.speakerName}: ${message.content}`
            : message.content,
      }));

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setStreamingSessionId(targetSessionId);
    setIsThinking(true);
    setIsThinkingOpen(true);

    try {
      for (const speaker of speakers) {
        if (controller.signal.aborted) break;
        const otherNames = personas
          .filter((persona) => persona.id !== speaker.id)
          .map((persona) => persona.name)
          .join(" and ");
        const personaPrompt = [
          `You are ${speaker.name}, one of two AI friends in a group chat with the user and ${otherNames}.`,
          speaker.instructions
            ? `Your persona: ${speaker.instructions}`
            : "Be warm, distinctive and conversational.",
          "Respond to the latest message in 1-3 natural sentences.",
          `Do not speak for the user or ${otherNames}. Do not prefix your reply with your name.`,
          "Do not use markdown headings or bullet lists unless the user asks for them.",
        ].join("\n");

        setStreamingContent("");
        setStreamingThinking("");
        setStreamingSpeaker({ id: speaker.id, name: speaker.name });
        streamingThinkingRef.current = "";
        thinkingStartedAtRef.current = 0;

        const response = await generateHostedAIResponse(
          personaPrompt,
          GENERAL_INTENT,
          history,
          controller.signal,
          {
            stream: true,
            onDelta: (delta) => {
              setStreamingContent((prev) => (prev || "") + delta);
            },
            onThinking: (text) => {
              if (text && !thinkingStartedAtRef.current) {
                thinkingStartedAtRef.current = Date.now();
              }
              streamingThinkingRef.current += text;
              setStreamingThinking(streamingThinkingRef.current);
            },
            onClear: () => {
              setStreamingContent("");
              setStreamingThinking("");
              streamingThinkingRef.current = "";
            },
          },
        );

        const content = cleanReply(response, speaker.name);
        if (content) {
          const assistantMessage = {
            role: "assistant",
            content,
            speakerId: speaker.id,
            speakerName: speaker.name,
            turnId,
            modelId: MODEL_ID,
            ...(streamingThinkingRef.current
              ? {
                  thinking: streamingThinkingRef.current,
                  thinkingSeconds: thinkingStartedAtRef.current
                    ? Math.max(
                        1,
                        Math.round(
                          (Date.now() - thinkingStartedAtRef.current) / 1000,
                        ),
                      )
                    : 0,
                }
              : {}),
          };
          setSessions((prev) =>
            prev.map((session) =>
              session.id === targetSessionId
                ? {
                    ...session,
                    messages: [...session.messages, assistantMessage],
                    updatedAt: Date.now(),
                  }
                : session,
            ),
          );
          history.push({
            role: "assistant",
            content: `${speaker.name}: ${content}`,
          });
          chatService
            .appendMessage(targetSessionId, {
              role: "assistant",
              content,
              turnId,
              speakerId: speaker.id,
              speakerName: speaker.name,
              modelId: MODEL_ID,
            })
            .catch(() => {});
        }

        setStreamingContent(null);
        setStreamingThinking("");
        setStreamingSpeaker(null);
        streamingThinkingRef.current = "";
        thinkingStartedAtRef.current = 0;
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.error("Conversation generation error:", error);
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setIsThinking(false);
        setStreamingSessionId(null);
        setStreamingContent(null);
        setStreamingThinking("");
        setStreamingSpeaker(null);
        streamingThinkingRef.current = "";
        thinkingStartedAtRef.current = 0;
      }
    }
  };

  return { handleSendMessage, handleStopMessage };
}
