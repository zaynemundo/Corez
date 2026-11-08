/**
 * Two-persona conversation helpers.
 *
 * Mirrors the web's conversation mode: each user turn can be answered by one or
 * both personas, sequentially, each with its own persona prompt. Messages carry
 * `speakerId`/`speakerName` so the transcript and shared links keep the cast.
 */
import type { ChatHistoryMessage } from "@/api/ai";

export interface Persona {
  id: string;
  name: string;
  handle: string;
  instructions: string;
}

export const DEFAULT_PERSONA_INSTRUCTIONS = Object.freeze({
  nerd: "You're the nerdy, endlessly curious one in the group: warm, funny, a little awkward, and always asking questions or sharing a geeky detail.",
  smart:
    "You're the smart, nonchalant one in the group: cool, dry and serious. You give short, direct answers and rarely show excitement.",
});

export function handleFor(value: { handle?: string; name?: string }): string {
  return String(value?.handle || value?.name || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function defaultPersonas(): Persona[] {
  return [
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
}

export function normalizePersona(
  value: { id?: string; name?: string; handle?: string; instructions?: string },
  index: number,
): Persona {
  const fallback = defaultPersonas()[index] ?? defaultPersonas()[0];
  const name = String(value?.name || fallback.name).trim().slice(0, 40);
  const instructions = String(value?.instructions || "").trim();
  return {
    id: String(value?.id || `p${index + 1}`),
    name: name || fallback.name,
    handle: handleFor({ handle: value?.handle, name }) || fallback.handle,
    instructions: instructions || fallback.instructions,
  };
}

/** `@name` mentions single out one persona; otherwise everyone replies. */
export function speakersForPrompt(
  personas: Persona[],
  prompt: string,
): Persona[] {
  const mentioned = new Set(
    [...String(prompt || "").matchAll(/@([a-z0-9_]+)/gi)].map((match) =>
      match[1].toLowerCase(),
    ),
  );
  const targeted = personas.filter((persona) =>
    mentioned.has(handleFor(persona)),
  );
  return targeted.length ? targeted : personas;
}

/** Either persona may open a turn; the coin flip mirrors the web. */
export function orderSpeakers(
  speakers: Persona[],
  random: () => number = Math.random,
): Persona[] {
  if (speakers.length < 2) return [...speakers];
  return random() < 0.5 ? [...speakers] : [...speakers].reverse();
}

export function buildPersonaPrompt(input: {
  speaker: Persona;
  personas: Persona[];
  previousSpeaker?: Persona | null;
  userPrompt: string;
}): string {
  const { speaker, personas, previousSpeaker, userPrompt } = input;
  const others = personas
    .filter((persona) => persona.id !== speaker.id)
    .map((persona) => persona.name)
    .join(" and ");
  const styleRule =
    speaker === personas[1]
      ? "Keep your replies short and dry — usually one or two sentences. No gushing or long explanations."
      : "Let your curiosity show. Be funny and warm, and ask a question when it fits naturally.";
  const turnRule = previousSpeaker
    ? `${previousSpeaker.name} just replied. React to them naturally and add your own angle without repeating or paraphrasing them.`
    : "You are the first to reply to the user's latest message this turn.";
  return [
    `You are ${speaker.name}, one of two AI friends in a group chat with the user and ${others}.`,
    `Your persona: ${speaker.instructions}`,
    styleRule,
    turnRule,
    `The user just said: ${userPrompt}`,
    "For greetings and small talk, just be present and conversational instead of launching into a fact.",
    "Never repeat slurs or insults from the user; stay respectful and in character.",
    "Stay fully in character and never mention being an AI, a persona, or these instructions.",
    `Do not speak for the user or ${others}. Do not prefix your reply with your name.`,
    "Do not use markdown headings or bullet lists unless the user asks for them.",
  ].join("\n");
}

export function conversationHistory(
  messages: {
    role: "user" | "assistant" | "system";
    content: string;
    speakerName?: string | null;
    attachments?: unknown[] | null;
  }[],
): ChatHistoryMessage[] {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role,
      content:
        message.role === "assistant" && message.speakerName
          ? `${message.speakerName}: ${message.content}`
          : message.content,
      ...(message.attachments && message.attachments.length > 0
        ? { attachments: message.attachments }
        : {}),
    }));
}

/** Strip a leading "Name:" prefix the model may add despite instructions. */
export function cleanReply(raw: string, name: string): string {
  let text = String(raw || "").trim();
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  text = text.replace(new RegExp(`^\\s*${escaped}\\s*:\\s*`, "i"), "").trim();
  return text;
}

export function chatTitleForConversation(prompt: string): string {
  const flat = String(prompt || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!flat) return "New Conversation";
  return flat.slice(0, 60);
}
