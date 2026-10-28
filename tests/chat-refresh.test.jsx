// @vitest-environment jsdom
//
// Refreshing on /chat/:id boots the chat read and the chat list in parallel.
// The chat can arrive first; the later list response must not replace the
// loaded messages with its metadata-only rows.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import App from "../src/App.jsx";
import { __resetChatPrefetchForTests } from "../src/services/chatPrefetch.js";

const CHAT_ID = "definition-red";
const MESSAGE = "The rose is red.";
const TITLE = "Definition of red";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const pathOf = (url) => {
  try {
    return new URL(String(url), "https://corez.test").pathname;
  } catch {
    return String(url);
  }
};

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("refreshing inside an existing chat", () => {
  beforeEach(() => {
    try {
      window.localStorage.clear();
    } catch {
      /* ignore */
    }
    __resetChatPrefetchForTests();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    __resetChatPrefetchForTests();
  });

  it("keeps the loaded transcript when the chat list arrives last", async () => {
    const list = deferred();
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const path = pathOf(url);
      if (path === "/api/auth/me") {
        return Promise.resolve(json({ user: { id: "u1", email: "a@b.co" } }));
      }
      if (path === `/api/chats/${CHAT_ID}`) {
        return Promise.resolve(
          json({
            id: CHAT_ID,
            title: TITLE,
            messages: [{ role: "user", content: MESSAGE }],
          }),
        );
      }
      if (path === "/api/chats") {
        return list.promise;
      }
      if (path === "/api/projects") {
        return Promise.resolve(json({ projects: [] }));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });

    window.history.pushState({}, "", `/chat/${CHAT_ID}`);
    const { container } = render(<App />);

    // The chat read has already answered while the list is still held open.
    await waitFor(() => {
      expect(screen.queryByText(/loading corez/i)).toBeNull();
    });

    await act(async () => {
      list.resolve(
        json({
          chats: [
            {
              id: CHAT_ID,
              title: TITLE,
              projectId: null,
              updatedAt: 2,
            },
          ],
          manualLists: [],
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText(MESSAGE)).toBeTruthy();
    });
    expect(container.querySelector(".new-chat-hero")).toBeNull();
  });
});
