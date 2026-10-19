// @vitest-environment jsdom
//
// The new-chat screen: a centred question, the composer pill under it, and
// three starter rows that PRE-FILL the composer.
//
// A screenshot cannot pin any of this: what each row inserts, that the rows sit
// in the composer's own width-limited container, that the composer keeps the
// value and the caret, and that the Think control changes the request that
// actually goes out. Those are the assertions here.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import App from "../src/App.jsx";
import {
  generateAIResponse,
  THINK_COMPLEXITY,
} from "../src/services/aiService.js";

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
      "What's on the agenda today?",
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
  it("asks what is on the agenda above the composer", async () => {
    await renderNewChat();
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toBe("What's on the agenda today?");
    // The heading sits in the centred hero, above the composer.
    expect(heading.closest(".new-chat-hero")).toBeTruthy();
  });

  it("wears the wide pill composer instead of the bottom bar", async () => {
    const { container } = await renderNewChat();
    expect(container.querySelector("form.input-box.hero")).toBeTruthy();
  });

  it("renders the three starter rows", async () => {
    await renderNewChat();
    const starters = screen.getByRole("group", { name: "Starter prompts" });
    expect(starters.textContent).toContain("Create an image or sticker");
    expect(starters.textContent).toContain("Write or edit");
    expect(starters.textContent).toContain("Search the web");
  });

  it("keeps the starter rows inside the composer's own container", async () => {
    // The rows must never drift out of line with the input they fill, so they
    // share the composer's width-limited container at every breakpoint.
    const { container } = await renderNewChat();
    const containerEl = container.querySelector(".input-container");
    expect(containerEl.querySelector(".new-chat-starters")).toBeTruthy();
  });

  it("pre-fills the composer with the image command and keeps the caret ready", async () => {
    await renderNewChat();
    fireEvent.click(screen.getByText("Create an image or sticker"));
    await waitFor(() => expect(composer().value).toBe("@image "));
    await waitFor(() => {
      expect(document.activeElement).toBe(composer());
      expect(composer().selectionStart).toBe("@image ".length);
    });
  });

  it("pre-fills a writing starter the user continues", async () => {
    await renderNewChat();
    fireEvent.click(screen.getByText("Write or edit"));
    await waitFor(() => expect(composer().value).toBe("Write or edit: "));
  });

  it("pre-fills the web-search phrasing that routes to real search", async () => {
    await renderNewChat();
    fireEvent.click(screen.getByText("Search the web"));
    await waitFor(() => expect(composer().value).toBe("Search the web for "));
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

    fireEvent.click(screen.getByText("Create an image or sticker"));
    await waitFor(() => expect(composer().value).toBe("@image "));
    expect(calls.some((url) => url.includes("/api/ai"))).toBe(false);
  });
});

describe("the composer Think control", () => {
  it("reports its state and toggles on click", async () => {
    await renderNewChat();
    const think = screen.getByRole("button", { name: "Think" });
    expect(think.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(think);
    expect(
      screen.getByRole("button", { name: "Think" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("asks for the deepest reasoning effort on the next message", async () => {
    // The toggle has to mean something at the API boundary, not just in the UI.
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

    fireEvent.click(screen.getByRole("button", { name: "Think" }));
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
    expect(messageRequest.complexity).toBe(THINK_COMPLEXITY);
  });
});

describe("generateAIResponse request options", () => {
  function stubAi(captured) {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const target = String(url);
      if (target.includes("/api/ai")) {
        captured.push(JSON.parse(init.body));
        return json({ content: "Answer." });
      }
      return json({ kind: "inspiration", category: "websites", sites: [] });
    });
  }

  it("sends the automatic complexity when Think is off", async () => {
    const captured = [];
    stubAi(captured);
    await generateAIResponse("explain how a for loop works", []);
    expect(captured).toHaveLength(1);
    expect(captured[0].complexity).not.toBe(THINK_COMPLEXITY);
  });

  it("overrides it with the top tier when Think is on", async () => {
    const captured = [];
    stubAi(captured);
    await generateAIResponse(
      "explain how a for loop works",
      [],
      null,
      null,
      null,
      null,
      {},
      null,
      { think: true },
    );
    expect(captured).toHaveLength(1);
    expect(captured[0].complexity).toBe(THINK_COMPLEXITY);
  });
});
