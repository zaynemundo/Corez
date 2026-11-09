/**
 * Chat commands advertised in the composer's "@" menu.
 *
 * Mirrors the web's command list (ChatInput.jsx) so people can discover the
 * features without memorising the tokens. Selecting a row pre-fills the
 * composer instead of sending anything.
 */
import type { ComponentProps } from "react";
import type { Feather } from "@expo/vector-icons";

type FeatherName = ComponentProps<typeof Feather>["name"];

export type ChatCommandId =
  | "website"
  | "game"
  | "research"
  | "image"
  | "theme";

export interface ChatCommand {
  id: ChatCommandId;
  token: string;
  icon: FeatherName;
  descriptionKey: string;
}

export const CHAT_COMMANDS: ChatCommand[] = [
  {
    id: "website",
    token: "website",
    icon: "globe",
    descriptionKey: "chat.commands.descWebsite",
  },
  {
    id: "game",
    token: "game",
    icon: "zap",
    descriptionKey: "chat.commands.descGame",
  },
  {
    id: "research",
    token: "research",
    icon: "search",
    descriptionKey: "chat.commands.descResearch",
  },
  {
    id: "image",
    token: "image",
    icon: "image",
    descriptionKey: "chat.commands.descImage",
  },
  {
    id: "theme",
    token: "theme",
    icon: "droplet",
    descriptionKey: "chat.commands.descTheme",
  },
];

/**
 * The composer only shows the command menu while the whole input is an `@`
 * token (`@`, `@th`, …). Once the user starts describing, the menu closes.
 */
export function commandSuggestionsFor(value: string): ChatCommand[] | null {
  const match = /^@([a-z]*)$/i.exec(String(value || "").trim());
  if (!match) return null;
  const query = match[1].toLowerCase();
  const matches = CHAT_COMMANDS.filter((command) =>
    command.token.startsWith(query),
  );
  return matches.length > 0 ? matches : null;
}
