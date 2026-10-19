// @vitest-environment jsdom
//
// The new-chat screen: the wordmark and a centred question, the composer under
// them, and a list of CoreZ's four commands that PRE-FILL the composer.
//
// A screenshot cannot pin any of this: what each row inserts, that the rows sit
// in the composer's own width-limited container, that the composer keeps the
// value and the caret, and that the composer carries no switches of its own.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import App from "../src/App.jsx";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Signed in, no chats: the app lands on the new-chat screen. */
function mockSignedInWithNoChats() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const target = String(url);
    if (target.includes("/api/auth/me")) {
      return json({ user: { id: "u1", email: "dev@corez.pro" } });
    }
    return new Response(null, { status: 404 });
  });
}

async function renderNewChat() {
  mockSignedInWithNoChats();
  const utils = render(<App />);
  // The hero is the settled state: the session check and the chat list answer
  // first, and before that the shell shows its loading wordmark.
  await waitFor(() => {
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "What are we building today?",
    );
  });
  return utils;
}

const composer = () => screen.getByPlaceholderText("Ask Corez...");

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the new-chat screen", () => {
  it("names CoreZ, then asks what we are building", async () => {
    const { container } = await renderNewChat();
    const wordmark = container.querySelector(".new-chat-wordmark");
    expect(wordmark.textContent).toBe("COREZ");
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toBe("What are we building today?");
    // Both sit in the centred hero, above the composer.
    expect(heading.closest(".new-chat-hero")).toBeTruthy();
    expect(wordmark.closest(".new-chat-hero")).toBeTruthy();
  });

  it("wears the wide hero composer instead of the bottom bar", async () => {
    const { container } = await renderNewChat();
    expect(container.querySelector("form.input-box.hero")).toBeTruthy();
  });

  it("renders one suggestion row per CoreZ command", async () => {
    const { container } = await renderNewChat();
    const list = screen.getByRole("group", { name: "Corez commands" });
    expect(list.textContent).toContain("Build an app or website");
    expect(list.textContent).toContain("Create a game");
    expect(list.textContent).toContain("Generate an image");
    expect(list.textContent).toContain("Research a topic");
    // Each row shows the command it inserts, in the interface's mono face.
    for (const token of ["@website", "@game", "@image", "@research"]) {
      expect(list.textContent).toContain(token);
    }
    expect(container.querySelectorAll(".new-chat-starter")).toHaveLength(4);
  });

  it("keeps the suggestion rows inside the composer's own container", async () => {
    // The rows must never drift out of line with the input they fill, so they
    // share the composer's width-limited container at every breakpoint.
    const { container } = await renderNewChat();
    const containerEl = container.querySelector(".input-container");
    expect(containerEl.querySelector(".new-chat-starters")).toBeTruthy();
  });

  it("pre-fills the composer with the image command and keeps the caret ready", async () => {
    await renderNewChat();
    fireEvent.click(screen.getByText("Generate an image"));
    await waitFor(() => expect(composer().value).toBe("@image "));
    await waitFor(() => {
      expect(document.activeElement).toBe(composer());
      expect(composer().selectionStart).toBe("@image ".length);
    });
  });

  it("pre-fills the website command", async () => {
    await renderNewChat();
    fireEvent.click(screen.getByText("Build an app or website"));
    await waitFor(() => expect(composer().value).toBe("@website "));
  });

  it("pre-fills the game command", async () => {
    await renderNewChat();
    fireEvent.click(screen.getByText("Create a game"));
    await waitFor(() => expect(composer().value).toBe("@game "));
  });

  it("pre-fills the research command", async () => {
    await renderNewChat();
    fireEvent.click(screen.getByText("Research a topic"));
    await waitFor(() => expect(composer().value).toBe("@research "));
  });

  it("does not send anything when a starter row is clicked", async () => {
    // A starter prepares a request; only the user sends it.
    const calls = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const target = String(url);
      calls.push(target);
      if (target.includes("/api/auth/me")) {
        return json({ user: { id: "u1", email: "dev@corez.pro" } });
      }
      return new Response(null, { status: 404 });
    });
    render(<App />);
    await waitFor(() => expect(screen.getByPlaceholderText("Ask Corez...")).toBeTruthy());

    fireEvent.click(screen.getByText("Generate an image"));
    await waitFor(() => expect(composer().value).toBe("@image "));
    expect(calls.some((url) => url.includes("/api/ai"))).toBe(false);
  });
});

describe("the composer keeps to the message", () => {
  it("sends the message without request-level switches", async () => {
    // The turn also asks for a session title, so the assertion is on the
    // message request itself, not on whichever /api/ai call lands last.
    const payloads = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const target = String(url);
      if (target.includes("/api/auth/me")) {
        return json({ user: { id: "u1", email: "dev@corez.pro" } });
      }
      if (target.includes("/api/ai")) {
        payloads.push(JSON.parse(init.body));
        return json({ content: "Answer." });
      }
      return new Response(null, { status: 404 });
    });

    render(<App />);
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Ask Corez...")).toBeTruthy(),
    );

    fireEvent.change(composer(), {
      target: { value: "explain how a for loop works" },
    });
    fireEvent.submit(composer().closest("form"));

    await waitFor(() =>
      expect(screen.getByPlaceholderText("Corez is generating...")).toBeTruthy(),
    );
    const messageRequest = payloads.find((payload) => !payload.titleOnly);
    expect(messageRequest).toBeTruthy();
    expect(messageRequest.prompt).toContain("explain how a for loop works");
    // The routing decision stays the app's: no composer switch overrides it.
    expect(messageRequest.complexity).toBeTruthy();
    expect(messageRequest.think).toBeUndefined();
  });
});

describe("the composer controls", () => {
  it("carries attach, dictation and send — and nothing that reasons for the user", async () => {
    const { container } = await renderNewChat();
    expect(screen.getByLabelText("Attach files")).toBeTruthy();
    expect(screen.getByTitle("Send Message")).toBeTruthy();
    // No thinking-effort toggle, no second voice control.
    expect(container.querySelector(".think-toggle")).toBeNull();
    expect(screen.queryByRole("button", { name: "Deep think" })).toBeNull();
    expect(container.querySelector(".voice-btn")).toBeNull();
  });
});
