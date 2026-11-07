/**
 * The native client uses the exact prompt-intelligence code the web client
 * runs: same trained classifier, same pattern engine. This test fails if the
 * shared package stops resolving from the mobile project (a Metro/Jest
 * regression) or if classification answers drift.
 */
import {
  classifyIntent,
  classifyPublicIntent,
  toLegacyIntentType,
} from "@corez_ai/shared/intent";

describe("shared prompt intelligence", () => {
  it("classifies a creation prompt with the trained public classifier", () => {
    const result = classifyPublicIntent(
      "build me a landing page for my coffee shop",
    );
    expect(result.label).toBe("app");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("classifies a code-help prompt", () => {
    expect(
      classifyPublicIntent("fix my react component crash").label,
    ).toBe("code-help");
  });

  it("returns an engine intent object that can be sent to /api/ai", () => {
    const fine = classifyIntent("build a snake game");
    expect(typeof fine.type).toBe("string");
    expect(toLegacyIntentType(fine.type)).toBeTruthy();
    expect(() => JSON.stringify(fine)).not.toThrow();
  });
});
