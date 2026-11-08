import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OPEN_SETTINGS_MARKER,
  THEME_FENCE_INFO,
  THEME_PROPOSE_ENDPOINT,
  buildThemeIntro,
  formatThemeProposalFence,
  mapThemeProposalError,
  runThemeCommand,
} from "../src/services/ai/themePipeline.js";
import {
  generateAIResponse,
  generateAISessionTitle,
  generateSessionTitle,
  parseSlashCommand,
} from "../src/services/aiService.js";

function makeProposal(overrides = {}) {
  return {
    v: 1,
    proposalId: "prop_theme_1",
    name: "Warm Dusk",
    palette: {
      background: "#120d0a",
      surface: "#1f1813",
      text: "#f5e9dc",
      muted: "#b8a493",
      border: "#3a2c22",
    },
    images: {
      desktop: "/api/assets/theme-desktop.png",
      mobile: "/api/assets/theme-mobile.png",
    },
    imagePrompts: {
      desktop: "warm dusk wallpaper",
      mobile: "warm dusk phone wallpaper",
    },
    options: { palette: true, backgrounds: true },
    slots: { used: 1, max: 2 },
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

function parseFence(content) {
  const match = String(content).match(/```corez-theme\n([\s\S]*?)\n```/);
  return match ? JSON.parse(match[1]) : null;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("runThemeCommand", () => {
  it("asks for an example when the prompt is empty and never calls the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await runThemeCommand("   ");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response).toContain("@theme");
    expect(response).toContain("warm sunset");
    expect(response).not.toContain(THEME_FENCE_INFO);
  });

  it("posts the description to the proposal endpoint with session credentials", async () => {
    const proposal = makeProposal();
    const fetchMock = vi.fn(async () => Response.json({ proposal }));
    vi.stubGlobal("fetch", fetchMock);

    await runThemeCommand("  warm sunset with soft gradients  ");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(THEME_PROPOSE_ENDPOINT);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body)).toEqual({
      prompt: "warm sunset with soft gradients",
    });
  });

  it("returns a short intro with both option labels followed by the exact fence", async () => {
    const proposal = makeProposal();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ proposal })));

    const response = await runThemeCommand("warm sunset");

    expect(response).toContain("Warm Dusk");
    expect(response).toContain("Colors only");
    expect(response).toContain("Colors + backgrounds");
    expect(response).toContain("```" + THEME_FENCE_INFO + "\n");
    expect(response).toBe(
      buildThemeIntro(proposal) +
        "\n\n" +
        formatThemeProposalFence(proposal),
    );
    expect(parseFence(response)).toEqual(proposal);
  });

  it("maps 409 theme_limit to a Settings recovery message with an action marker", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ code: "theme_limit" }, { status: 409 }),
      ),
    );

    const response = await runThemeCommand("warm sunset");

    expect(response).toContain("maximum of 2 custom themes");
    expect(response).toContain("Delete one in Settings");
    expect(response).toContain(OPEN_SETTINGS_MARKER);
    expect(response).not.toContain(THEME_FENCE_INFO);
  });

  it("asks the user to sign in on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "unauthorized" }, { status: 401 })),
    );

    const response = await runThemeCommand("warm sunset");
    expect(response).toMatch(/sign in/i);
  });

  it.each([
    [400, /couldn't design/i],
    [429, /busy/i],
    [502, /couldn't finish/i],
    [503, /unavailable/i],
  ])("maps HTTP %i to a friendly retry message", async (status, pattern) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "nope" }, { status })),
    );

    const response = await runThemeCommand("warm sunset");
    expect(response).toMatch(pattern);
  });

  it("returns a friendly message when the network request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );

    const response = await runThemeCommand("warm sunset");
    expect(response).toMatch(/connection/i);
  });

  it("rethrows AbortError so a stopped turn stays stopped", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw abort;
      }),
    );

    await expect(runThemeCommand("warm sunset")).rejects.toThrow("aborted");
  });

  it("recovers from an unreadable success body without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not json")));

    const response = await runThemeCommand("warm sunset");
    expect(typeof response).toBe("string");
    expect(response.length).toBeGreaterThan(10);
  });

  it("treats a success response without a proposal as a design failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({})));

    const response = await runThemeCommand("warm sunset");
    expect(response).toMatch(/couldn't finish/i);
  });
});

describe("theme error mapping", () => {
  it("keeps limit states actionable and other errors friendly", () => {
    expect(mapThemeProposalError(409, "theme_limit")).toContain(
      OPEN_SETTINGS_MARKER,
    );
    expect(mapThemeProposalError(401, null)).toMatch(/sign in/i);
    expect(mapThemeProposalError(0, null)).toMatch(/connection/i);
  });

  it("names expired and already-used proposals instead of offering a retry", () => {
    expect(mapThemeProposalError(410, "proposal_expired")).toMatch(
      /has expired/i,
    );
    expect(mapThemeProposalError(409, "proposal_used")).toMatch(
      /already been applied/i,
    );
    expect(mapThemeProposalError(409, "proposal_used")).not.toContain(
      OPEN_SETTINGS_MARKER,
    );
  });
});

describe("@theme command routing", () => {
  it("registers theme in the shared @ command parser", () => {
    expect(parseSlashCommand("@theme warm sunset")).toEqual({
      command: "theme",
      rest: "warm sunset",
    });
    expect(parseSlashCommand("@THEME Dark Forest")).toEqual({
      command: "theme",
      rest: "Dark Forest",
    });
  });

  it("routes generateAIResponse through the theme pipeline", async () => {
    const proposal = makeProposal();
    const fetchMock = vi.fn(async () => Response.json({ proposal }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await generateAIResponse("@theme warm sunset", []);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(THEME_PROPOSE_ENDPOINT);
    expect(response).toContain("```" + THEME_FENCE_INFO);
    expect(parseFence(response)).toEqual(proposal);
  });

  it("never calls any model for an empty @theme prompt", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await generateAIResponse("@theme", []);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response).toContain("@theme");
  });
});

describe("@theme session titles", () => {
  it("builds a deterministic title instead of echoing the command", () => {
    expect(generateSessionTitle("@theme warm sunset")).toBe(
      "Create a warm sunset theme",
    );
    expect(generateSessionTitle("@theme")).toBe("Create a custom theme");
    expect(
      generateSessionTitle("@theme warm sunset with soft gradients").length,
    ).toBeLessThanOrEqual(40);
  });

  it("skips the extra title-only model call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateAISessionTitle("@theme warm sunset")).resolves.toBe(
      "Create a warm sunset theme",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
