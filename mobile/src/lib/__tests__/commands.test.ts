import { CHAT_COMMANDS, commandSuggestionsFor } from "../commands";

describe("chat commands", () => {
  it("advertises every command the app can act on", () => {
    expect(CHAT_COMMANDS.map((command) => command.token)).toEqual([
      "website",
      "game",
      "research",
      "image",
      "theme",
    ]);
    expect(new Set(CHAT_COMMANDS.map((command) => command.id)).size).toBe(5);
  });

  it("opens the menu for a bare @ token and filters by prefix", () => {
    expect(commandSuggestionsFor("@")?.length).toBe(5);
    expect(commandSuggestionsFor("@th")?.map((command) => command.token)).toEqual([
      "theme",
    ]);
    expect(commandSuggestionsFor("@im")?.map((command) => command.token)).toEqual([
      "image",
    ]);
  });

  it("closes the menu once the user starts describing", () => {
    expect(commandSuggestionsFor("@theme a blue theme")).toBeNull();
    expect(commandSuggestionsFor("hello")).toBeNull();
    expect(commandSuggestionsFor("@zzz")).toBeNull();
  });
});
