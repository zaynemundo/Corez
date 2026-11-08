// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChatMessage from "../src/components/ChatMessage.jsx";
import ThemeProposalCard from "../src/components/chat/ThemeProposalCard.jsx";
import {
  OPEN_SETTINGS_EVENT,
  OPEN_SETTINGS_MARKER,
  parseThemeProposal,
  splitThemeContent,
} from "../src/components/chat/ThemeProposalCard.jsx";

const themeMock = vi.hoisted(() => ({
  current: {
    customThemes: [],
    applyProposal: async () => null,
    discardProposal: async () => true,
  },
}));

vi.mock("../src/context/ThemeContext.jsx", () => ({
  useTheme: () => themeMock.current,
}));

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

function themeMessage(content, { before = "Here is the theme I designed.", after = "" } = {}) {
  const fence =
    "```corez-theme\n" + JSON.stringify(content, null, 2) + "\n```";
  return [before, fence, after].filter(Boolean).join("\n\n");
}

function makeThemeState(overrides = {}) {
  return {
    customThemes: [],
    applyProposal: vi.fn(async () => ({
      id: "theme_1",
      proposalId: "prop_theme_1",
      images: null,
    })),
    discardProposal: vi.fn(async () => true),
    ...overrides,
  };
}

function applyButtons() {
  return Array.from(document.querySelectorAll(".theme-proposal-card__apply"));
}

beforeEach(() => {
  themeMock.current = makeThemeState();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ThemeProposalCard rendering", () => {
  it("renders the name, palette swatches, thumbnails, slots and both options", () => {
    render(
      <ChatMessage
        message={{ role: "assistant", content: themeMessage(makeProposal()) }}
      />,
    );

    expect(document.querySelector(".theme-proposal-card")).not.toBeNull();
    expect(screen.getByText("Warm Dusk")).toBeTruthy();

    const swatches = document.querySelectorAll(
      ".theme-proposal-card__swatch",
    );
    expect(swatches).toHaveLength(5);
    expect(swatches[0].getAttribute("title")).toBe("Background color");
    expect(swatches[4].getAttribute("title")).toBe("Border color");
    expect(swatches[0].getAttribute("style") || "").toContain(
      "background-color",
    );

    const previews = document.querySelectorAll(
      ".theme-proposal-card__preview",
    );
    expect(previews).toHaveLength(2);
    expect(previews[0].getAttribute("src")).toBe(
      "/api/assets/theme-desktop.png",
    );
    expect(previews[1].getAttribute("src")).toBe(
      "/api/assets/theme-mobile.png",
    );

    expect(screen.getByText("1 of 2 custom-theme slots used")).toBeTruthy();
    expect(screen.getByText("Colors only")).toBeTruthy();
    expect(screen.getByText("Colors + backgrounds")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Use colors only" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Use colors + backgrounds" }),
    ).toBeTruthy();
  });

  it("never renders the proposal fence as a code block or raw JSON", () => {
    render(
      <ChatMessage
        message={{ role: "assistant", content: themeMessage(makeProposal()) }}
      />,
    );

    expect(document.querySelector("pre")).toBeNull();
    expect(document.querySelector("code")).toBeNull();
    expect(document.body.textContent).not.toContain("proposalId");
    expect(document.body.textContent).not.toContain("imagePrompts");
  });

  it("re-parses the card from message content on a fresh mount (reload)", () => {
    const message = {
      role: "assistant",
      content: themeMessage(makeProposal()),
    };
    const first = render(<ChatMessage message={message} />);
    expect(document.querySelector(".theme-proposal-card")).not.toBeNull();
    first.unmount();

    render(<ChatMessage message={message} />);
    expect(document.querySelector(".theme-proposal-card")).not.toBeNull();
    expect(screen.getByText("Warm Dusk")).toBeTruthy();
  });
});

describe("ThemeProposalCard applying", () => {
  it("applies colors only and marks the other option discarded", async () => {
    themeMock.current = makeThemeState();
    render(
      <ChatMessage
        message={{ role: "assistant", content: themeMessage(makeProposal()) }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Use colors only" }),
    );

    await waitFor(() =>
      expect(themeMock.current.applyProposal).toHaveBeenCalledWith(
        "prop_theme_1",
        "palette",
      ),
    );
    await waitFor(() => {
      const applied = document.querySelector(
        ".theme-proposal-card__badge.is-applied",
      );
      expect(applied).not.toBeNull();
      expect(applied.textContent).toContain("Applied");
    });
    expect(
      document.querySelector(".theme-proposal-card__badge.is-discarded")
        .textContent,
    ).toContain("Discarded");
    expect(applyButtons().every((button) => button.disabled)).toBe(true);
  });

  it("applies colors plus backgrounds", async () => {
    themeMock.current = makeThemeState({
      applyProposal: vi.fn(async () => ({
        id: "theme_2",
        proposalId: "prop_theme_1",
        images: {
          desktop: "/api/assets/theme-desktop.png",
          mobile: "/api/assets/theme-mobile.png",
        },
      })),
    });
    render(
      <ChatMessage
        message={{ role: "assistant", content: themeMessage(makeProposal()) }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Use colors + backgrounds" }),
    );

    await waitFor(() =>
      expect(themeMock.current.applyProposal).toHaveBeenCalledWith(
        "prop_theme_1",
        "backgrounds",
      ),
    );
    await waitFor(() => {
      const applied = document.querySelector(
        ".theme-proposal-card__badge.is-applied",
      );
      expect(applied.textContent).toContain("Applied");
      expect(
        applied.closest(".theme-proposal-card__option").textContent,
      ).toContain("Colors + backgrounds");
    });
  });

  it("derives the applied state from saved custom themes", () => {
    themeMock.current = makeThemeState({
      customThemes: [
        {
          id: "theme_1",
          proposalId: "prop_theme_1",
          name: "Warm Dusk",
          images: null,
        },
      ],
    });

    render(
      <ChatMessage
        message={{ role: "assistant", content: themeMessage(makeProposal()) }}
      />,
    );

    const applied = document.querySelector(
      ".theme-proposal-card__badge.is-applied",
    );
    expect(applied).not.toBeNull();
    expect(applied.textContent).toContain("Applied");
    expect(
      document.querySelector(".theme-proposal-card__badge.is-discarded")
        .textContent,
    ).toContain("Discarded");
    expect(applyButtons().every((button) => button.disabled)).toBe(true);
  });

  it("discards the proposal and keeps the card visible", async () => {
    render(
      <ChatMessage
        message={{ role: "assistant", content: themeMessage(makeProposal()) }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Discard proposal" }));

    await waitFor(() =>
      expect(themeMock.current.discardProposal).toHaveBeenCalledWith(
        "prop_theme_1",
      ),
    );
    expect(await screen.findByText("Proposal discarded.")).toBeTruthy();
    expect(document.querySelector(".theme-proposal-card")).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: "Use colors only" }),
    ).toBeNull();
  });
});

describe("ThemeProposalCard error states", () => {
  it("shows the limit message and opens Settings on a 409 apply error", async () => {
    const limitError = Object.assign(new Error("limit"), {
      status: 409,
      code: "theme_limit",
    });
    themeMock.current = makeThemeState({
      applyProposal: vi.fn(async () => {
        throw limitError;
      }),
    });
    const listener = vi.fn();
    window.addEventListener(OPEN_SETTINGS_EVENT, listener);
    try {
      render(
        <ChatMessage
          message={{ role: "assistant", content: themeMessage(makeProposal()) }}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Use colors only" }),
      );

      expect(
        await screen.findByText(/You already have 2 custom themes/),
      ).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: /Open Settings/ }));
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(OPEN_SETTINGS_EVENT, listener);
    }
  });

  it("shows the expired state when apply returns 410", async () => {
    const expiredError = Object.assign(new Error("expired"), {
      status: 410,
      code: "proposal_expired",
    });
    themeMock.current = makeThemeState({
      applyProposal: vi.fn(async () => {
        throw expiredError;
      }),
    });
    render(
      <ChatMessage
        message={{ role: "assistant", content: themeMessage(makeProposal()) }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Use colors only" }),
    );

    expect(await screen.findByText(/has expired/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Open Settings/ })).toBeTruthy();
  });

  it("disables the actions when the proposal expiry has passed", () => {
    render(
      <ChatMessage
        message={{
          role: "assistant",
          content: themeMessage(
            makeProposal({ expiresAt: Date.now() - 5_000 }),
          ),
        }}
      />,
    );

    expect(screen.getByText(/has expired/)).toBeTruthy();
    expect(applyButtons().every((button) => button.disabled)).toBe(true);
    expect(screen.queryByRole("button", { name: /Open Settings/ })).toBeNull();
  });

  it("shows a friendly error for a non-limit apply failure", async () => {
    themeMock.current = makeThemeState({
      applyProposal: vi.fn(async () => {
        throw Object.assign(new Error("boom"), { status: 500 });
      }),
    });
    render(
      <ChatMessage
        message={{ role: "assistant", content: themeMessage(makeProposal()) }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Use colors only" }),
    );

    expect(
      await screen.findByText(/Couldn't apply this theme/),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Open Settings/ })).toBeNull();
  });

  it("disables backgrounds with the budget reason when the option is unavailable", () => {
    render(
      <ChatMessage
        message={{
          role: "assistant",
          content: themeMessage(
            makeProposal({
              images: null,
              options: {
                palette: true,
                backgrounds: false,
                backgroundsReason: "image_budget",
              },
            }),
          ),
        }}
      />,
    );

    expect(
      screen.getByText("The image budget for this proposal was used up."),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Use colors + backgrounds" })
        .disabled,
    ).toBe(true);
    expect(document.querySelectorAll(".theme-proposal-card__preview")).toHaveLength(
      0,
    );
  });
});

describe("ThemeProposalCard safety and read-only", () => {
  it("falls back to plain text for malformed proposal JSON", () => {
    const content =
      "Intro text\n\n```corez-theme\n{ this is not json }\n```\n\nOutro text";
    render(<ChatMessage message={{ role: "assistant", content }} />);

    expect(document.querySelector(".theme-proposal-card")).toBeNull();
    expect(document.querySelector("pre")).toBeNull();
    expect(document.querySelector("code")).toBeNull();
    expect(screen.getByText("Intro text")).toBeTruthy();
    expect(screen.getByText("Outro text")).toBeTruthy();
    expect(document.body.textContent).toContain("{ this is not json }");
  });

  it("renders name and palette only in a read-only shared chat", () => {
    render(
      <ChatMessage
        message={{ role: "assistant", content: themeMessage(makeProposal()) }}
        readOnly
      />,
    );

    expect(
      document.querySelector(".theme-proposal-card--readonly"),
    ).not.toBeNull();
    expect(screen.getByText("Warm Dusk")).toBeTruthy();
    expect(document.querySelectorAll(".theme-proposal-card__swatch")).toHaveLength(
      5,
    );
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(document.querySelectorAll("img")).toHaveLength(0);
    expect(document.body.textContent).not.toContain("Use colors only");
  });

  it("keeps the existing email card rendering when both are present", () => {
    const email =
      "Subject: Launch update\nTo: sarah@example.com\n\nHi Sarah,\n\nHere is the plan.";
    const content = themeMessage(makeProposal()) + "\n\n" + email;
    render(<ChatMessage message={{ role: "assistant", content }} />);

    expect(document.querySelector(".theme-proposal-card")).not.toBeNull();
    expect(document.querySelector(".markdown-email-wrapper")).not.toBeNull();
    expect(document.querySelector(".email-subject").textContent).toBe(
      "Launch update",
    );
    expect(document.querySelector("pre")).toBeNull();
  });

  it("never throws on a missing or unusable proposal", () => {
    expect(() =>
      render(<ThemeProposalCard proposal={null} />),
    ).not.toThrow();
    expect(document.querySelector(".theme-proposal-card")).toBeNull();

    const broken = makeProposal();
    broken.palette = { background: "not-a-colour" };
    expect(() =>
      render(<ThemeProposalCard proposal={parseThemeProposal(broken)} />),
    ).not.toThrow();
    expect(document.querySelector(".theme-proposal-card")).toBeNull();
  });

  it("renders the open-settings action marker outside a proposal card", () => {
    const listener = vi.fn();
    window.addEventListener(OPEN_SETTINGS_EVENT, listener);
    try {
      render(
        <ChatMessage
          message={{
            role: "assistant",
            content:
              "You already have the maximum of 2 custom themes.\n\n" +
              OPEN_SETTINGS_MARKER,
          }}
        />,
      );

      expect(document.body.textContent).not.toContain(OPEN_SETTINGS_MARKER);
      fireEvent.click(screen.getByRole("button", { name: "Open Settings" }));
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(OPEN_SETTINGS_EVENT, listener);
    }
  });
});

describe("proposal parsing helpers", () => {
  it("validates the proposal contract shape", () => {
    expect(parseThemeProposal(makeProposal())).not.toBeNull();
    expect(parseThemeProposal(JSON.stringify(makeProposal()))).not.toBeNull();
    expect(parseThemeProposal("not json")).toBeNull();
    expect(parseThemeProposal(null)).toBeNull();
    expect(parseThemeProposal(makeProposal({ v: 2 }))).toBeNull();
  });

  it("rejects unsafe palette colours instead of injecting CSS", () => {
    const unsafe = makeProposal();
    unsafe.palette.background = "url(javascript:alert(1))";
    expect(parseThemeProposal(unsafe)).toBeNull();
  });

  it("splits a valid fence into a theme part", () => {
    const parts = splitThemeContent(themeMessage(makeProposal()));
    expect(parts.some((part) => part.type === "theme")).toBe(true);
  });

  it("splits the settings marker into an action part", () => {
    const parts = splitThemeContent("text\n\n" + OPEN_SETTINGS_MARKER);
    expect(parts.some((part) => part.type === "settings")).toBe(true);
  });
});
