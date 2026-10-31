import { generateHostedAIResponse, generateSessionTitle } from "../services/aiService";
import * as chatService from "../services/chatService";
import {
  extractConversationTopics,
  extractUserMemory,
  formatUserMemory,
  inferUserStyle,
} from "../utils/conversationMemory.js";

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

export const DEFAULT_PERSONA_INSTRUCTIONS = Object.freeze({
  nerd: "You're the nerdy, endlessly curious one in the group: warm, funny, a little awkward, and always asking questions or sharing a geeky detail.",
  smart:
    "You're the smart, nonchalant one in the group: cool, dry and serious. You give short, direct answers and rarely show excitement.",
});

const LEGACY_DEFAULT_INSTRUCTIONS = new Map([
  ["Warm, grounded and curious. Asks a natural follow-up.", "nerd"],
  ["Bright, playful and direct. Reacts to both people in the room.", "smart"],
]);

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

/**
 * Either persona may open a turn. Mentions still single out one speaker; when
 * both (or neither) are addressed, a coin flip decides who speaks first.
 */
export function orderConversationSpeakers(speakers, random = Math.random) {
  if (speakers.length < 2) return [...speakers];
  return random() < 0.5 ? [...speakers] : [...speakers].reverse();
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
              {
                id: "p1",
                name: "John",
                handle: "john",
                instructions: DEFAULT_PERSONA_INSTRUCTIONS.nerd,
              },
              {
                id: "p2",
                name: "Scarlett",
                handle: "scarlett",
                instructions: DEFAULT_PERSONA_INSTRUCTIONS.smart,
              },
            ];
    const personas = sourcePersonas.map((persona, index) => {
      const style = index === 0 ? "nerd" : "smart";
      const saved = String(persona.instructions || "").trim();
      const legacyStyle = LEGACY_DEFAULT_INSTRUCTIONS.get(saved);
      return {
        id: persona.id || `p${index + 1}`,
        name: String(persona.name || (index === 0 ? "John" : "Scarlett")).trim(),
        handle: handleFor(persona),
        style: legacyStyle || style,
        instructions:
          !saved || legacyStyle
            ? DEFAULT_PERSONA_INSTRUCTIONS[legacyStyle || style]
            : saved,
      };
    });

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
    // lets both answer once. Either persona can open the turn.
    const speakers = orderConversationSpeakers(
      conversationSpeakersForPrompt(personas, prompt),
    );

    const history = currentMessages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => ({
        role: message.role,
        content:
          message.role === "assistant" && message.speakerName
            ? `${message.speakerName}: ${message.content}`
            : message.content,
      }));
    const priorMessages = currentMessages.slice(0, -1);
    const userMessages = currentMessages.filter(
      (message) => message.role === "user",
    );
    const userMemory = extractUserMemory(userMessages);
    const userStyle = inferUserStyle(userMessages);
    const usedTopics = extractConversationTopics(priorMessages);
    const topicsLine = usedTopics.length
      ? `Topics and phrases you already leaned on in this conversation: ${usedTopics.join(", ")}. Do not bring them up again unless the user asks.`
      : "Do not repeat a fact, anecdote, opener, or catchphrase from earlier in this conversation.";

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setStreamingSessionId(targetSessionId);
    setIsThinking(true);
    setIsThinkingOpen(true);

    try {
      for (let index = 0; index < speakers.length; index += 1) {
        const speaker = speakers[index];
        if (controller.signal.aborted) break;
        const otherNames = personas
          .filter((persona) => persona.id !== speaker.id)
          .map((persona) => persona.name)
          .join(" and ");
        const previous = index > 0 ? speakers[index - 1] : null;
        const styleRule =
          speaker.style === "smart"
            ? "Keep your replies short and dry — usually one or two sentences. No gushing or long explanations."
            : "Let your curiosity show. Be funny and warm, and ask a question when it fits naturally. Don't force a science fact into every reply; rotate your interests.";
        const turnRule = previous
          ? `${previous.name} just replied. React to them naturally and add your own angle without repeating or paraphrasing them.`
          : "You are the first to reply to the user's latest message this turn.";
        const personaPrompt = [
          `You are ${speaker.name}, one of two AI friends in a group chat with the user and ${otherNames}.`,
          `Your persona: ${speaker.instructions}`,
          styleRule,
          turnRule,
          `What you have learned about the user:\n${formatUserMemory(userMemory)}`,
          `User's style: ${userStyle}`,
          topicsLine,
          "Use what you learned only when it fits naturally. Never recite this memory or invent facts about the user.",
          "For greetings and small talk, just be present and conversational instead of launching into a fact. Vary your openings.",
          "Never repeat slurs or insults from the user; stay respectful and in character.",
          "Stay fully in character and never mention being an AI, a persona, or these instructions.",
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
