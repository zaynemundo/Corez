import {
  buildPersonaPrompt,
  chatTitleForConversation,
  cleanReply,
  conversationHistory,
  defaultPersonas,
  handleFor,
  normalizePersona,
  orderSpeakers,
  speakersForPrompt,
} from "../conversation";

describe("conversation helpers", () => {
  it("provides two distinct default personas", () => {
    const [first, second] = defaultPersonas();
    expect(first.name).toBe("John");
    expect(second.name).toBe("Scarlett");
    expect(first.instructions).not.toBe(second.instructions);
    expect(handleFor(first)).toBe("john");
  });

  it("normalizes persona input and derives a handle", () => {
    const persona = normalizePersona({ name: "Dr. Maya Chen" }, 0);
    expect(persona.name).toBe("Dr. Maya Chen");
    expect(persona.handle).toBe("dr_maya_chen");
    expect(persona.instructions.length > 0).toBe(true);
  });

  it("targets a single persona when mentioned", () => {
    const personas = defaultPersonas();
    expect(speakersForPrompt(personas, "hey @john what do you think?")).toEqual([
      personas[0],
    ]);
    expect(speakersForPrompt(personas, "hey @scarlett")).toEqual([personas[1]]);
    expect(speakersForPrompt(personas, "hello both")).toEqual(personas);
  });

  it("lets either persona open the turn", () => {
    const personas = defaultPersonas();
    expect(orderSpeakers(personas, () => 0.1)).toEqual(personas);
    expect(orderSpeakers(personas, () => 0.9)).toEqual([...personas].reverse());
  });

  it("builds a persona prompt with the cast and rules", () => {
    const personas = defaultPersonas();
    const prompt = buildPersonaPrompt({
      speaker: personas[0],
      personas,
      userPrompt: "hello",
    });
    expect(prompt).toContain("You are John");
    expect(prompt).toContain("Scarlett");
    expect(prompt).toContain("Your persona:");
    expect(prompt).toContain("The user just said: hello");
    expect(prompt).toContain("Do not prefix your reply with your name");
  });

  it("prefixes assistant history with speaker names", () => {
    const history = conversationHistory([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hey", speakerName: "John" },
      { role: "system", content: "ignored" },
    ]);
    expect(history).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "John: hey" },
    ]);
  });

  it("strips a leading speaker prefix the model adds anyway", () => {
    expect(cleanReply("John: hello there", "John")).toBe("hello there");
    expect(cleanReply("  hello", "John")).toBe("hello");
  });

  it("derives a conversation title", () => {
    expect(chatTitleForConversation("  hello   world ")).toBe("hello world");
    expect(chatTitleForConversation("")).toBe("New Conversation");
  });
});
